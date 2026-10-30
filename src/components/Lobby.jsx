import { useState, useEffect, useRef, useMemo } from "react";
import { saveSession, getDeviceId } from "../hooks/useSocket.js";
import RolePortrait from "./RolePortrait.jsx";
import CitizenAvatarVaultModal from "./CitizenAvatarVaultModal.jsx";
import {
  getUniverseOnboardingAvatars,
  getCitizenAvatarMeta,
  getStoredCitizenModelId,
  loadCitizenAvatarCatalog,
  resolveAlignedCitizenModelForUniverse,
  saveStoredCitizenModelId,
  subscribeCitizenAvatarCatalog,
} from "../config/citizenAvatars.config.js";
import {
  UNIVERSE_IDS,
  UNIVERSE_THEMES,
  resolveInitialLobbyUniverse,
  savePreferredUniverseId,
  sanitizeUniverseId,
  getUniverseTheme,
  getUniverseRulesList,
} from "../config/universeThemes.config.js";
import StealthCamouflageOverlay, { BossKeyTriggerButton } from "./StealthCamouflageOverlay.jsx";
import "./Lobby.css";

const RULES_TABS = [
  { id: "roles", label: "🎭 12 Vai Trò" },
  { id: "flow", label: "🔄 Luật Chơi" },
  { id: "tips", label: "💡 Mẹo" },
];

const ONBOARD_SESSION_KEY = "ws_onboarded_v462";

const UNIVERSE_CARD_CARDS = {
  classic: {
    title: "Ma Sói",
    keyart: "/backgrounds/home_keyart_v44.webp",
    fallbackKeyart: "/backgrounds/home_bloodmoon_village.webp",
  },
  office: {
    title: "Công Sở",
    keyart: "/backgrounds/concept_space_office_anime.jpg",
    fallbackKeyart: "/backgrounds/home_bloodmoon_village.webp",
  },
  school: {
    title: "Học Đường",
    keyart: "/backgrounds/concept_space_school_anime.jpg",
    fallbackKeyart: "/backgrounds/home_bloodmoon_village.webp",
  },
};

function suggestName(universeId = "classic") {
  const pool = getUniverseTheme(universeId).randomNames || UNIVERSE_THEMES.classic.randomNames;
  return pool[Math.floor(Math.random() * pool.length)];
}

function readStoredPlayerName() {
  if (typeof window === "undefined") return "";
  try {
    return (
      sessionStorage.getItem("ws_name") ||
      localStorage.getItem("ws_saved_name") ||
      ""
    ).trim();
  } catch {
    return "";
  }
}

function resolveInitialOnboardingStep() {
  if (typeof window === "undefined") return "universe";
  try {
    const params = new URLSearchParams(window.location.search);
    const invitedCode = (params.get("room") || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (invitedCode.length === 5) return "hub";
    const onboarded = sessionStorage.getItem(ONBOARD_SESSION_KEY) === "1";
    const hasName = readStoredPlayerName().length > 0;
    if (onboarded && hasName) return "hub";
  } catch {
    // ignore storage access issues
  }
  return "universe";
}

export default function Lobby({
  socketRef,
  onJoined,
  onOpenArchitectStudio = null,
  onOpenChoreoStudio = null,
}) {
  const [universeId, setUniverseId] = useState(() => resolveInitialLobbyUniverse());
  const uTheme = getUniverseTheme(universeId);

  const [onboardingStep, setOnboardingStep] = useState(() => resolveInitialOnboardingStep());
  const [hasCompletedSetup, setHasCompletedSetup] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(ONBOARD_SESSION_KEY) === "1" && readStoredPlayerName().length > 0;
    } catch {
      return false;
    }
  });

  const [name, setName] = useState(() => readStoredPlayerName());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Thiết lập Tạo Phòng Mới (Progressive Disclosure — ẩn gọn mặc định, mở mượt khi bấm Tạo phòng riêng)
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [roomTitle, setRoomTitle] = useState("");
  const [accessMode, setAccessMode] = useState("public"); // 'public' | 'password' | 'hidden'
  const [createPassword, setCreatePassword] = useState("");
  const [createTurbo, setCreateTurbo] = useState(false);

  // Vào phòng bằng Mã 5 ký tự (kèm mật khẩu nếu phòng khóa)
  const [roomCode, setRoomCode] = useState("");
  const [codePassword, setCodePassword] = useState("");
  const [needCodePassword, setNeedCodePassword] = useState(false);

  // Danh sách phòng trực tiếp trên sảnh
  const [roomsList, setRoomsList] = useState([]);
  const [roomFilter, setRoomFilter] = useState("all"); // 'all' | 'universe'
  const [unlockingRoomCode, setUnlockingRoomCode] = useState(null);
  const [unlockRoomPwd, setUnlockRoomPwd] = useState("");

  // Nhân vật 3D & Kho Avatar 3D Cá Nhân Hóa (đồng bộ 1:1 giữa 3 Không Gian)
  const [citizenModelId, setCitizenModelId] = useState(() =>
    resolveAlignedCitizenModelForUniverse(resolveInitialLobbyUniverse(), getStoredCitizenModelId())
  );
  const [showAvatarVault, setShowAvatarVault] = useState(false);
  const [, setCatalogTick] = useState(0);

  // Rules modal
  const [showRules, setShowRules] = useState(false);
  const [rulesTab, setRulesTab] = useState("roles");
  const autoInviteHandledRef = useRef(false);
  const nameInputRef = useRef(null);

  useEffect(() => {
    const unsub = subscribeCitizenAvatarCatalog(() => setCatalogTick((t) => t + 1));
    loadCitizenAvatarCatalog().then(() => {
      const aligned = resolveAlignedCitizenModelForUniverse(universeId, getStoredCitizenModelId());
      setCitizenModelId(aligned);
    });
    return unsub;
  }, [universeId]);

  useEffect(() => {
    if (onboardingStep === "name") {
      const t = window.setTimeout(() => {
        nameInputRef.current?.focus();
      }, 90);
      return () => window.clearTimeout(t);
    }
  }, [onboardingStep]);

  const selectedCitizenMeta = getCitizenAvatarMeta(citizenModelId);
  const selectedAvatarUrl =
    selectedCitizenMeta.portraitBadge || "/portraits/badges/villager_cloak.webp";
  const onboardingAvatars = useMemo(
    () => getUniverseOnboardingAvatars(universeId),
    [universeId]
  );

  function syncUniverseUrl(clean) {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (clean === "classic") {
        params.delete("mode");
        params.delete("universe");
      } else {
        params.set("mode", clean);
      }
      const q = params.toString();
      const nextUrl = `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash || ""}`;
      window.history.replaceState({}, "", nextUrl);
    } catch {
      // ignore URL replace error
    }
  }

  function handleSelectUniverse(nextRawId, { advanceToNextStep = false } = {}) {
    setError("");
    const clean = savePreferredUniverseId(nextRawId);
    setUniverseId(clean);
    syncUniverseUrl(clean);

    const alignedId = resolveAlignedCitizenModelForUniverse(clean, citizenModelId);
    if (alignedId !== citizenModelId) {
      const meta = saveStoredCitizenModelId(alignedId);
      setCitizenModelId(meta.id);
    }

    if (advanceToNextStep) {
      setOnboardingStep("name");
    }
  }

  function persistName(n) {
    const trimmed = String(n || "").trim();
    if (!trimmed) return;
    try {
      sessionStorage.setItem("ws_name", trimmed);
      localStorage.setItem("ws_saved_name", trimmed);
    } catch {
      // ignore storage quota
    }
  }

  function markOnboardingDone() {
    setHasCompletedSetup(true);
    try {
      sessionStorage.setItem(ONBOARD_SESSION_KEY, "1");
    } catch {
      // ignore storage quota
    }
  }

  function handleConfirmNameStep(e) {
    e?.preventDefault();
    setError("");
    const finalName = name.trim() || suggestName(universeId);
    setName(finalName);
    persistName(finalName);
    setOnboardingStep("avatar");
  }

  function handleSelectCitizen(nextId, { jumpToHub = false } = {}) {
    setError("");
    const meta = saveStoredCitizenModelId(nextId);
    setCitizenModelId(meta.id);
    if (jumpToHub) {
      const ensuredName = name.trim() || suggestName(universeId);
      if (!name.trim()) setName(ensuredName);
      persistName(ensuredName);
      markOnboardingDone();
      setOnboardingStep("hub");
    }
  }

  // Tự động bắt Link mời 1-Chạm (?room=ABCDE) từ Zalo / Messenger / TikTok Bio
  useEffect(() => {
    if (autoInviteHandledRef.current || typeof window === "undefined") return;
    const socket = socketRef.current;
    if (!socket) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const invitedCode = (params.get("room") || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 5);
      if (invitedCode.length !== 5) return;
      autoInviteHandledRef.current = true;
      setRoomCode(invitedCode);
      setOnboardingStep("hub");

      params.delete("room");
      const restQuery = params.toString();
      const cleanUrl = `${window.location.pathname}${restQuery ? `?${restQuery}` : ""}${window.location.hash || ""}`;
      window.history.replaceState({}, "", cleanUrl);

      const finalName = readStoredPlayerName() || suggestName(universeId);
      setName(finalName);
      setLoading(true);
      persistName(finalName);
      markOnboardingDone();

      socket.emit(
        "room:join",
        {
          roomCode: invitedCode,
          name: finalName,
          citizenModelId: selectedCitizenMeta.id,
          avatarUrl: selectedAvatarUrl,
          password: "",
          deviceId: getDeviceId(),
        },
        (res) => {
          if (res?.ok) {
            setLoading(false);
            finalizeJoinSuccess(res, finalName);
            return;
          }
          if (res?.phase === "playing" || res?.phase === "ended") {
            socket.emit(
              "room:spectate",
              {
                roomCode: invitedCode,
                name: finalName,
                citizenModelId: selectedCitizenMeta.id,
                avatarUrl: selectedAvatarUrl,
                password: "",
                deviceId: getDeviceId(),
              },
              (specRes) => {
                setLoading(false);
                if (specRes?.ok) {
                  finalizeJoinSuccess(specRes, finalName);
                  return;
                }
                if (specRes?.requirePassword) setNeedCodePassword(true);
                setError(specRes?.error || res?.error || "Không thể vào phòng.");
              }
            );
            return;
          }
          setLoading(false);
          if (res?.requirePassword) setNeedCodePassword(true);
          setError(res?.error || "Không thể vào phòng qua link mời.");
        }
      );
    } catch {
      // ignore malformed URL
    }
  }, [socketRef, selectedCitizenMeta.id, selectedAvatarUrl, universeId]);

  // Nạp ngầm trước Đợt 1 đạo cụ để bước vào phòng 3D mượt tức thì
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 200));
      idle(() => {
        import("../3d/props/SmartPropGLB.jsx")
          .then((mod) => mod.preloadVillagePropsInIdle?.({ includeOuterTiers: false }))
          .catch(() => {});
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, []);

  // Lắng nghe danh sách phòng trực tiếp từ máy chủ
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleRoomsUpdate = (list) => {
      if (Array.isArray(list)) setRoomsList(list);
    };

    socket.on("lobby:roomsUpdate", handleRoomsUpdate);
    socket.emit("lobby:getRooms", {}, (res) => {
      if (res?.ok && Array.isArray(res.rooms)) {
        setRoomsList(res.rooms);
      }
    });

    return () => {
      socket.off("lobby:roomsUpdate", handleRoomsUpdate);
    };
  }, [socketRef]);

  function refreshRoomsManual() {
    socketRef.current?.emit("lobby:getRooms", {}, (res) => {
      if (res?.ok && Array.isArray(res.rooms)) {
        setRoomsList(res.rooms);
      }
    });
  }

  function finalizeJoinSuccess(res, finalName) {
    markOnboardingDone();
    if (res.playerId) {
      sessionStorage.setItem("ws_playerId", res.playerId);
      saveSession(res.roomCode, res.sessionToken || "", res.playerId, finalName);
    }
    onJoined(res.roomCode);
  }

  function handleCreateRoom({ soloQuickStart = false, forceHiddenSolo = false } = {}) {
    setError("");
    const finalName = name.trim() || suggestName(universeId);

    let effectiveMode = forceHiddenSolo ? "hidden" : accessMode;
    let effectivePwd = forceHiddenSolo ? "" : createPassword.trim();
    if (!soloQuickStart && effectiveMode === "password" && !effectivePwd) {
      setError("Vui lòng nhập mật khẩu cho phòng khóa (hoặc chọn Công khai / Phòng ẩn)!");
      return;
    }
    if (soloQuickStart && !forceHiddenSolo && effectiveMode === "password" && !effectivePwd) {
      effectiveMode = "hidden";
    }

    setLoading(true);
    persistName(finalName);
    socketRef.current.emit(
      "room:create",
      {
        name: finalName,
        citizenModelId: selectedCitizenMeta.id,
        avatarUrl: selectedAvatarUrl,
        roomTitle: soloQuickStart ? "" : roomTitle.trim(),
        accessMode: effectiveMode,
        password: effectivePwd,
        isTurbo: createTurbo,
        soloQuickStart,
        universeId,
        deviceId: getDeviceId(),
      },
      (res) => {
        setLoading(false);
        if (!res?.ok) {
          setError(res?.error || "Không thể tạo phòng.");
          return;
        }
        finalizeJoinSuccess(res, finalName);
      }
    );
  }

  function handleJoinByCode(e) {
    e?.preventDefault();
    setError("");
    const cleanCode = roomCode.trim().toUpperCase();
    if (!cleanCode) {
      setError("Vui lòng nhập mã phòng 5 ký tự.");
      return;
    }
    const finalName = name.trim() || suggestName(universeId);
    setLoading(true);
    persistName(finalName);

    socketRef.current.emit(
      "room:join",
      {
        roomCode: cleanCode,
        name: finalName,
        citizenModelId: selectedCitizenMeta.id,
        avatarUrl: selectedAvatarUrl,
        password: codePassword.trim(),
        deviceId: getDeviceId(),
      },
      (res) => {
        if (!res?.ok && (res?.phase === "playing" || res?.phase === "ended")) {
          socketRef.current.emit(
            "room:spectate",
            {
              roomCode: cleanCode,
              name: finalName,
              citizenModelId: selectedCitizenMeta.id,
              avatarUrl: selectedAvatarUrl,
              password: codePassword.trim(),
              deviceId: getDeviceId(),
            },
            (specRes) => {
              setLoading(false);
              if (!specRes?.ok) {
                if (specRes?.requirePassword) setNeedCodePassword(true);
                setError(specRes?.error || res?.error || "Không thể vào phòng.");
                return;
              }
              finalizeJoinSuccess(specRes, finalName);
            }
          );
          return;
        }
        setLoading(false);
        if (!res?.ok) {
          if (res?.requirePassword) {
            setNeedCodePassword(true);
          }
          setError(res?.error || "Không thể vào phòng.");
          return;
        }
        finalizeJoinSuccess(res, finalName);
      }
    );
  }

  function handleQuickMatch() {
    setError("");
    const finalName = name.trim() || suggestName(universeId);
    setLoading(true);
    persistName(finalName);

    socketRef.current.emit(
      "room:quickMatch",
      {
        name: finalName,
        citizenModelId: selectedCitizenMeta.id,
        avatarUrl: selectedAvatarUrl,
        preferTurbo: createTurbo,
        universeId,
        deviceId: getDeviceId(),
      },
      (res) => {
        setLoading(false);
        if (!res?.ok) {
          setError(res?.error || "Không thể ghép bàn nhanh lúc này.");
          return;
        }
        finalizeJoinSuccess(res, finalName);
      }
    );
  }

  function handleSpectateCard(roomItem, providedPassword = "") {
    setError("");
    if (roomItem.hasPassword && !providedPassword.trim()) {
      setUnlockingRoomCode(roomItem.code);
      setUnlockRoomPwd("");
      return;
    }
    const finalName = name.trim() || suggestName(roomItem.universeId || universeId);
    setLoading(true);
    persistName(finalName);

    socketRef.current.emit(
      "room:spectate",
      {
        roomCode: roomItem.code,
        name: finalName,
        citizenModelId: selectedCitizenMeta.id,
        avatarUrl: selectedAvatarUrl,
        password: providedPassword.trim(),
        deviceId: getDeviceId(),
      },
      (res) => {
        setLoading(false);
        if (!res?.ok) {
          if (res?.requirePassword) {
            setUnlockingRoomCode(roomItem.code);
          }
          setError(res?.error || "Không thể vào xem phòng này.");
          return;
        }
        finalizeJoinSuccess(res, finalName);
      }
    );
  }

  function handleJoinPublicCard(roomItem, providedPassword = "") {
    setError("");
    if (roomItem.hasPassword && !providedPassword.trim()) {
      setUnlockingRoomCode(roomItem.code);
      setUnlockRoomPwd("");
      return;
    }
    const finalName = name.trim() || suggestName(roomItem.universeId || universeId);
    setLoading(true);
    persistName(finalName);

    socketRef.current.emit(
      "room:join",
      {
        roomCode: roomItem.code,
        name: finalName,
        citizenModelId: selectedCitizenMeta.id,
        avatarUrl: selectedAvatarUrl,
        password: providedPassword.trim(),
        deviceId: getDeviceId(),
      },
      (res) => {
        setLoading(false);
        if (!res?.ok) {
          if (res?.requirePassword) {
            setUnlockingRoomCode(roomItem.code);
          }
          setError(res?.error || "Không thể vào phòng.");
          return;
        }
        finalizeJoinSuccess(res, finalName);
      }
    );
  }

  // Sắp xếp thông minh: Phòng đang chờ cùng Không Gian lên đầu -> Phòng đang chờ khác -> Phòng đang đấu
  const sortedRooms = useMemo(() => {
    const base = roomsList.filter((r) => {
      if (roomFilter === "universe") return sanitizeUniverseId(r.universeId) === universeId;
      return true;
    });
    return [...base].sort((a, b) => {
      const aSame = sanitizeUniverseId(a.universeId) === universeId ? 1 : 0;
      const bSame = sanitizeUniverseId(b.universeId) === universeId ? 1 : 0;
      const aLobby = a.phase === "lobby" ? 1 : 0;
      const bLobby = b.phase === "lobby" ? 1 : 0;
      const aScore = aLobby * 2 + aSame;
      const bScore = bLobby * 2 + bSame;
      if (bScore !== aScore) return bScore - aScore;
      return (b.humanCount || 0) - (a.humanCount || 0);
    });
  }, [roomsList, roomFilter, universeId]);

  const sameUniverseCount = roomsList.filter(
    (r) => sanitizeUniverseId(r.universeId) === universeId
  ).length;
  const activeRulesList = getUniverseRulesList(universeId);

  const renderPortraitSrc = (rawUrl) => {
    if (!rawUrl) return "/portraits/badges/villager_cloak.webp?v=44";
    if (rawUrl.endsWith(".svg")) return rawUrl;
    return rawUrl.startsWith("/portraits/") && !rawUrl.includes("?") ? `${rawUrl}?v=44` : rawUrl;
  };

  const displayPlayerName = name.trim() || "Chưa đặt tên";

  return (
    <>
      <StealthCamouflageOverlay universeId={universeId} phaseKey="lobby" />

      {/* Nền 3 Không Gian V4.6 (Ma Sói 3D | Công Sở Penthouse | Học Đường Hoàng Hôn) */}
      <div className="home-arcane-backdrop" aria-hidden="true">
        <div
          className="home-arcane-keyart"
          style={
            universeId !== "classic"
              ? {
                  backgroundImage: `url("${uTheme.backdropKeyartUrl}")`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        />
        <div className="home-arcane-vignette" />
        <div className="home-arcane-rune-halo" />
      </div>

      <CitizenAvatarVaultModal
        open={showAvatarVault}
        onClose={() => setShowAvatarVault(false)}
        selectedId={selectedCitizenMeta.id}
        onSelect={(pickedId) =>
          handleSelectCitizen(pickedId, { jumpToHub: onboardingStep === "avatar" })
        }
      />

      {/* Cẩm Nang Luật Chơi */}
      {showRules && (
        <div className="rules-modal-overlay" onClick={() => setShowRules(false)}>
          <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rules-modal-header">
              <h2>{uTheme.rulesModalTitle}</h2>
              <button className="rules-close" onClick={() => setShowRules(false)}>
                ✕
              </button>
            </div>

            <div className="rules-tab-bar">
              {RULES_TABS.map((t) => (
                <button
                  key={t.id}
                  className={`rules-tab-btn ${rulesTab === t.id ? "active" : ""}`}
                  onClick={() => setRulesTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="rules-body">
              {rulesTab === "roles" && (
                <div className="rules-roles-list">
                  {activeRulesList.map((r) => (
                    <div key={r.key} className="rules-role-row">
                      {universeId === "classic" ? (
                        <RolePortrait roleKey={r.key} size={46} glow />
                      ) : (
                        <div
                          style={{
                            width: 46,
                            height: 46,
                            borderRadius: 12,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "1.55rem",
                            background: "rgba(15, 23, 42, 0.9)",
                            border: `1.5px solid ${r.color || uTheme.accentHex}`,
                            flexShrink: 0,
                          }}
                        >
                          {r.emoji}
                        </div>
                      )}
                      <div>
                        <div className="rules-role-name">
                          {universeId !== "classic" ? `${r.emoji} ` : ""}
                          {r.name}
                        </div>
                        <div className="rules-role-desc">{r.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {rulesTab === "flow" && (
                <div className="rules-flow">
                  <div className="flow-step">
                    <span className="flow-icon">🤖</span>
                    <div>
                      <div className="flow-title">Chơi Nhanh Hoặc Đấu Cùng BOT AI</div>
                      <div className="flow-desc">
                        Bấm <strong>⚡ Vào Chơi Nhanh</strong> để ghép phòng online hoặc chọn <strong>🤖 Vào Chơi Cùng BOT AI</strong> để đấu ngay cùng 7 AI thông minh không cần chờ!
                      </div>
                    </div>
                  </div>
                  <div className="flow-step">
                    <span className="flow-icon">🌙</span>
                    <div>
                      <div className="flow-title">
                        {universeId === "office"
                          ? "Ca Tối Bí Mật (Kiểm Toán Bảng Lương)"
                          : universeId === "school"
                            ? "Tiết Tự Học Bí Mật (Sổ Đầu Bài)"
                            : "Đêm Bí Mật"}
                      </div>
                      <div className="flow-desc">
                        {universeId === "office"
                          ? "Bà Tám Ghép Hợp Đồng → Team Lead Bảo Lãnh KPI → Sếp Vi Hành Gạch Lương → Kế Toán Cộng/Trừ Chuyên Cần → IT Quét IP Wi-Fi."
                          : universeId === "school"
                            ? "Bà Mối Xếp Đôi Bạn → Lớp Phó Đỡ Lời → Cô Chủ Nhiệm Ghi Sổ Đỏ → Thư Ký Cộng Điểm/Bút Đỏ → Sao Đỏ Soi Thẻ."
                            : "Thần Tình Yêu (Đêm 1) → Bảo Vệ → Sói / Sói Đầu Đàn → Phù Thủy → Tiên Tri."}
                      </div>
                    </div>
                  </div>
                  <div className="flow-step">
                    <span className="flow-icon">🗳️</span>
                    <div>
                      <div className="flow-title">
                        {universeId === "office"
                          ? "Kiểm Điểm KPI & Mời Ra Khỏi Group"
                          : universeId === "school"
                            ? "Mời Lên Bục Giảng & Mời Ra Hành Lang"
                            : "Thảo Luận & Biểu Quyết"}
                      </div>
                      <div className="flow-desc">
                        {universeId === "office"
                          ? "100% Hài hước văn minh — không bạo lực! Bấm [Esc] bất cứ lúc nào để bật màn ngụy trang bảng Excel KPI."
                          : universeId === "school"
                            ? "100% Hài hước tuổi học trò — không bạo lực! Bấm [Esc] bất cứ lúc nào để mở màn ngụy trang Đề Cương Toán."
                            : "Đề cử nghi phạm lên ghế nóng biện hộ, sau đó cả làng quyết định số phận."}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {rulesTab === "tips" && (
                <div className="rules-tips">
                  <div className="tip-item">💡 Trên thanh đầu sảnh, bạn có thể chạm vào <strong>Không gian</strong>, <strong>Tên</strong> hoặc <strong>Avatar</strong> để đổi lại bất cứ lúc nào chỉ với 1 chạm!</div>
                  <div className="tip-item">💡 Khi chơi với AI Bot, bấm <strong>⏩ Bỏ qua thảo luận</strong> là cả bàn chuyển ngay sang vòng biểu quyết!</div>
                  <div className="tip-item">💡 Cuối ván nhớ xem <strong>Băng Ghi Hình Sự Thật 3D</strong> tua lại toàn bộ mưu kế trên sân khấu!</div>
                </div>
              )}
            </div>

            <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowRules(false)}>
              Đã hiểu, vào chơi!
            </button>
          </div>
        </div>
      )}

      {/* ==================== BƯỚC 1 / 2 / 3: LUỒNG MỞ ĐẦU MOBILE-FIRST TỐI GIẢN ==================== */}
      {onboardingStep !== "hub" ? (
        <main className="mobile-onboard-shell">
          <header className="onboard-minimal-topbar">
            <div className="onboard-step-dots" aria-label="Tiến trình thiết lập nhanh">
              <button
                type="button"
                className={`step-pill ${onboardingStep === "universe" ? "active" : "done"}`}
                onClick={() => setOnboardingStep("universe")}
              >
                1. Không gian
              </button>
              <span className="step-sep">›</span>
              <button
                type="button"
                className={`step-pill ${onboardingStep === "name" ? "active" : onboardingStep === "avatar" ? "done" : ""}`}
                onClick={() => setOnboardingStep("name")}
              >
                2. Tên
              </button>
              <span className="step-sep">›</span>
              <button
                type="button"
                className={`step-pill ${onboardingStep === "avatar" ? "active" : ""}`}
                onClick={() => setOnboardingStep("avatar")}
              >
                3. Avatar
              </button>
            </div>

            <div className="onboard-top-right">
              {!import.meta.env.PROD && (
                <span className="mini-local-badge" title="Môi trường kiểm thử Local :3001">
                  🧪 LOCAL
                </span>
              )}
              {hasCompletedSetup && (
                <button
                  type="button"
                  className="btn-skip-to-hub"
                  onClick={() => setOnboardingStep("hub")}
                >
                  Vào sảnh →
                </button>
              )}
            </div>
          </header>

          {/* BƯỚC 1: CHỌN 1 TRONG 3 KHÔNG GIAN CHƠI */}
          {onboardingStep === "universe" && (
            <section className="onboard-stage-card stage-universe" aria-label="Chọn không gian game">
              <div className="onboard-stage-head">
                <h1 className="onboard-title">Chọn không gian</h1>
              </div>

              <div className="universe-choice-stack">
                {UNIVERSE_IDS.map((uKey) => {
                  const themeItem = UNIVERSE_THEMES[uKey];
                  const cardMeta = UNIVERSE_CARD_CARDS[uKey];
                  const isCurrent = universeId === uKey;
                  const onlineHere = roomsList.filter(
                    (r) => sanitizeUniverseId(r.universeId) === uKey
                  ).length;

                  return (
                    <button
                      key={uKey}
                      type="button"
                      className={`universe-hero-card u-${uKey} ${isCurrent ? "is-selected" : ""}`}
                      onClick={() => handleSelectUniverse(uKey, { advanceToNextStep: true })}
                    >
                      <div
                        className="universe-hero-bg"
                        style={{
                          backgroundImage: `url("${cardMeta.keyart}"), url("${cardMeta.fallbackKeyart}")`,
                        }}
                        aria-hidden="true"
                      />
                      <div className="universe-hero-scrim" aria-hidden="true" />

                      <div className="universe-hero-content">
                        <div className="universe-hero-left">
                          <div className="universe-hero-icon">{themeItem.tabIcon}</div>
                          <div className="universe-hero-texts">
                            <span className="universe-hero-name">{cardMeta.title}</span>
                            {onlineHere > 0 && (
                              <span className="u-mini-chip live">🟢 {onlineHere} phòng</span>
                            )}
                          </div>
                        </div>

                        <span className="universe-hero-cta" aria-hidden="true">
                          ›
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* BƯỚC 2: ĐẶT TÊN NHÂN VẬT -> VIẾT XONG NHẢY SANG CHỌN AVATAR */}
          {onboardingStep === "name" && (
            <section className="onboard-stage-card stage-compact" aria-label="Đặt tên nhân vật">
              <div className="stage-back-row">
                <button
                  type="button"
                  className="btn-stage-back"
                  onClick={() => setOnboardingStep("universe")}
                >
                  ← Không gian
                </button>
                <span className={`selected-universe-pill u-${universeId}`}>
                  {uTheme.tabIcon} {uTheme.shortTab}
                </span>
              </div>

              <div className="onboard-stage-head">
                <h1 className="onboard-title">Đặt tên</h1>
              </div>

              <form className="onboard-name-form" onSubmit={handleConfirmNameStep}>
                <div className="name-input-wrap">
                  <input
                    ref={nameInputRef}
                    className="home-name-input mobile-safe-input"
                    type="text"
                    value={name}
                    maxLength={20}
                    enterKeyHint="next"
                    autoComplete="nickname"
                    onChange={(e) => setName(e.target.value)}
                    placeholder={uTheme.namePlaceholder}
                  />
                  <button
                    type="button"
                    className="btn-random-name"
                    onClick={() => {
                      const nextRandom = suggestName(universeId);
                      setName(nextRandom);
                      nameInputRef.current?.focus();
                    }}
                    title="Tên ngẫu nhiên"
                  >
                    🎲
                  </button>
                </div>

                <button type="submit" className="btn-step-continue">
                  Tiếp tục →
                </button>
              </form>
            </section>
          )}

          {/* BƯỚC 3: CHỌN AVATAR ĐỒNG BỘ 1:1 -> NHẢY SANG TÍNH NĂNG VÀO GAME */}
          {onboardingStep === "avatar" && (
            <section className="onboard-stage-card stage-avatar" aria-label="Chọn Avatar nhân vật">
              <div className="stage-back-row">
                <button
                  type="button"
                  className="btn-stage-back"
                  onClick={() => setOnboardingStep("name")}
                >
                  ← Tên
                </button>
                <span className="selected-name-pill">
                  👤 {name.trim() || suggestName(universeId)}
                </span>
              </div>

              <div className="onboard-stage-head">
                <h1 className="onboard-title">Chọn Avatar</h1>
              </div>

              <div className="onboard-avatar-grid">
                {onboardingAvatars.map((item) => {
                  const isSelected = selectedCitizenMeta.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`onboard-avatar-card ${isSelected ? "selected" : ""}`}
                      onClick={() => handleSelectCitizen(item.id, { jumpToHub: true })}
                    >
                      <div className="onboard-avatar-thumb-wrap">
                        <img
                          src={renderPortraitSrc(item.portraitCard || item.portraitBadge)}
                          alt={item.label}
                          className="onboard-avatar-thumb"
                        />
                        {isSelected && <span className="onboard-avatar-badge">✓</span>}
                      </div>
                      <span className="onboard-avatar-name">{item.shortLabel || item.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="onboard-avatar-footer">
                <button
                  type="button"
                  className="btn-step-continue"
                  onClick={() => handleSelectCitizen(selectedCitizenMeta.id, { jumpToHub: true })}
                >
                  Vào chơi →
                </button>

                {universeId === "classic" && (
                  <button
                    type="button"
                    className="btn-open-vault-subtle"
                    onClick={() => setShowAvatarVault(true)}
                  >
                    🎭 Kho 3D
                  </button>
                )}
              </div>
            </section>
          )}
        </main>
      ) : (
        /* ==================== BƯỚC 4: SẢNH CHÍNH TỐI GIẢN — CHƠI NHANH • BOT AI • MÃ PHÒNG & PHÒNG ONLINE ==================== */
        <div className="home-hub-shell minimalist-v462">
          {/* THANH HỒ SƠ GỌN 1 DÒNG: CHẠM ĐỂ ĐỔI LẠI KHÔNG GIAN / TÊN / AVATAR BẤT CỨ LÚC NÀO */}
          <header
            className="hub-profile-bar"
            style={{ borderColor: uTheme.panelBorderRgba }}
          >
            <div className="hub-profile-left">
              <button
                type="button"
                className={`hub-universe-chip u-${universeId}`}
                onClick={() => setOnboardingStep("universe")}
                title="Chạm để đổi Không Gian chơi"
              >
                <span className="chip-u-icon">{uTheme.tabIcon}</span>
                <span className="chip-u-name">{uTheme.shortTab}</span>
                <span className="chip-u-caret">▾</span>
              </button>

              <div className="hub-identity-pill">
                <button
                  type="button"
                  className="hub-avatar-trigger"
                  onClick={() => setOnboardingStep("avatar")}
                  title="Chạm để đổi Avatar"
                >
                  <img
                    src={renderPortraitSrc(selectedCitizenMeta.portraitCard || selectedAvatarUrl)}
                    alt={selectedCitizenMeta.label}
                  />
                </button>
                <button
                  type="button"
                  className="hub-name-trigger"
                  onClick={() => setOnboardingStep("name")}
                  title="Chạm để đổi tên nhân vật"
                >
                  <span className="hub-player-name">{displayPlayerName}</span>
                  <span className="hub-edit-pen">✎</span>
                </button>
              </div>
            </div>

            <div className="hub-profile-actions">
              <BossKeyTriggerButton universeId={universeId} />
              {onOpenChoreoStudio && (
                <button
                  type="button"
                  className="btn-hub-icon studio"
                  onClick={onOpenChoreoStudio}
                  title="Mở Studio Hoạt Cảnh 3D"
                >
                  🎬
                </button>
              )}
              {onOpenArchitectStudio && (
                <button
                  type="button"
                  className="btn-hub-icon studio-d5"
                  onClick={onOpenArchitectStudio}
                  title="Mở Studio Cảnh Quan D5"
                >
                  🏗️
                </button>
              )}
              {!import.meta.env.PROD && (
                <span className="mini-local-badge" title="Đang nối máy chủ Local :3001">
                  🧪 LOCAL
                </span>
              )}
              <button
                type="button"
                className="btn-hub-rules"
                onClick={() => setShowRules(true)}
              >
                📖 Luật
              </button>
            </div>
          </header>

          {error && <div className="error" style={{ marginBottom: 0 }}>⚠️ {error}</div>}

          <div className="home-hub-grid">
            {/* CỘT TRÁI (TRÊN ĐIỆN THOẠI NẰM NGAY ĐẦU): 1. VÀO CHƠI NHANH • 2. CHƠI CÙNG BOT AI */}
            <section
              className="home-panel-card home-left-column compact-actions-card"
              style={{ borderColor: uTheme.panelBorderRgba }}
            >
              <div className="hub-actions-stack">
                {/* LỰA CHỌN 1: VÀO CHƠI NHANH */}
                <button
                  type="button"
                  className="btn-entry-primary quick-play"
                  disabled={loading}
                  onClick={handleQuickMatch}
                >
                  <span className="entry-step-num">1</span>
                  <span className="entry-texts">
                    <span className="entry-main-title">⚡ VÀO CHƠI NHANH</span>
                  </span>
                  <span className="entry-arrow">➤</span>
                </button>

                {/* LỰA CHỌN 2: VÀO CHƠI CÙNG BOT AI */}
                <button
                  type="button"
                  className="btn-entry-primary bot-ai-play"
                  disabled={loading}
                  onClick={() =>
                    handleCreateRoom({ soloQuickStart: true, forceHiddenSolo: true })
                  }
                >
                  <span className="entry-step-num bot">2</span>
                  <span className="entry-texts">
                    <span className="entry-main-title">🤖 VÀO CHƠI CÙNG BOT AI</span>
                  </span>
                  <span className="entry-arrow">➤</span>
                </button>
              </div>

              {/* NÚT MẢNH TẠO PHÒNG RIÊNG CHO NHÓM BẠN */}
              <button
                type="button"
                className={`btn-toggle-create-room ${showCreatePanel ? "active" : ""}`}
                disabled={loading}
                onClick={() => setShowCreatePanel((v) => !v)}
              >
                {showCreatePanel ? "▾ Đóng" : "➕ Tạo phòng riêng"}
              </button>

              {showCreatePanel && (
                <div className="create-setup-box">
                  <div className="home-section-label" style={{ marginBottom: 0 }}>
                    <span>
                      🛠️ Mở phòng {uTheme.tabIcon} {uTheme.shortTab}
                    </span>
                    <button
                      type="button"
                      className={`turbo-mini-pill ${createTurbo ? "on" : ""}`}
                      onClick={() => setCreateTurbo((v) => !v)}
                    >
                      ⚡ Tốc chiến 5p: {createTurbo ? "BẬT" : "Tắt"}
                    </button>
                  </div>

                  <input
                    className="mobile-safe-input"
                    type="text"
                    value={roomTitle}
                    maxLength={36}
                    onChange={(e) => setRoomTitle(e.target.value)}
                    placeholder={uTheme.roomPlaceholder}
                  />

                  <div className="access-mode-pills">
                    <button
                      type="button"
                      className={`access-pill-btn mode-public ${accessMode === "public" ? "active" : ""}`}
                      onClick={() => setAccessMode("public")}
                    >
                      🌍 Công khai
                    </button>
                    <button
                      type="button"
                      className={`access-pill-btn mode-password ${accessMode === "password" ? "active" : ""}`}
                      onClick={() => setAccessMode("password")}
                    >
                      🔐 Mật khẩu
                    </button>
                    <button
                      type="button"
                      className={`access-pill-btn mode-hidden ${accessMode === "hidden" ? "active" : ""}`}
                      onClick={() => setAccessMode("hidden")}
                    >
                      🕵️ Phòng ẩn
                    </button>
                  </div>

                  {accessMode === "password" && (
                    <input
                      className="mobile-safe-input"
                      type="password"
                      value={createPassword}
                      maxLength={32}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      placeholder="🔐 Đặt mật khẩu phòng..."
                    />
                  )}

                  <button
                    type="button"
                    className="btn-launch-new-room"
                    disabled={loading}
                    onClick={() => handleCreateRoom({ soloQuickStart: false })}
                  >
                    🚀 Mở Phòng Ngay
                  </button>
                </div>
              )}
            </section>

            {/* CỘT PHẢI (NGAY PHÍA DƯỚI TRÊN ĐIỆN THOẠI): MÃ PHÒNG + DANH SÁCH PHÒNG ĐANG ONLINE */}
            <section
              className="home-panel-card home-right-column compact-rooms-card"
              style={{ borderColor: uTheme.panelBorderRgba }}
            >
              {/* Ô LỰA CHỌN MÃ PHÒNG GỌN 1 HÀNG */}
              <form className="join-code-strip compact-inline" onSubmit={handleJoinByCode}>
                <div className="join-code-row">
                  <span className="join-code-kicker">🔑 Mã phòng:</span>
                  <input
                    className="join-code-input mobile-safe-input"
                    value={roomCode}
                    maxLength={5}
                    enterKeyHint="go"
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="NHẬP MÃ 5 KÝ TỰ"
                  />
                  <button
                    type="button"
                    className={`btn-toggle-code-pwd ${needCodePassword ? "active" : ""}`}
                    onClick={() => setNeedCodePassword((v) => !v)}
                    title="Phòng có mật khẩu?"
                  >
                    🔐
                  </button>
                  <button type="submit" className="btn-join-by-code" disabled={loading}>
                    Vào ➤
                  </button>
                </div>

                {needCodePassword && (
                  <div className="join-code-pwd-row">
                    <input
                      className="mobile-safe-input"
                      type="password"
                      value={codePassword}
                      maxLength={32}
                      onChange={(e) => setCodePassword(e.target.value)}
                      placeholder="🔐 Nhập mật khẩu của phòng..."
                    />
                  </div>
                )}
              </form>

              {/* DANH SÁCH PHÒNG ĐANG ONLINE PHÍA DƯỚI */}
              <div className="browser-header-row">
                <h2 className="browser-title">
                  📡 Phòng đang online ({sortedRooms.length})
                </h2>
                <div className="browser-filter-tabs">
                  <button
                    type="button"
                    className={`browser-filter-btn ${roomFilter === "all" ? "active" : ""}`}
                    onClick={() => setRoomFilter("all")}
                  >
                    Tất cả ({roomsList.length})
                  </button>
                  <button
                    type="button"
                    className={`browser-filter-btn ${roomFilter === "universe" ? "active" : ""}`}
                    onClick={() => setRoomFilter("universe")}
                  >
                    {uTheme.tabIcon} {uTheme.shortTab} ({sameUniverseCount})
                  </button>
                  <button
                    type="button"
                    className="browser-filter-btn"
                    onClick={refreshRoomsManual}
                    title="Làm mới danh sách phòng"
                  >
                    🔄
                  </button>
                </div>
              </div>

              {sortedRooms.length === 0 ? (
                <div className="rooms-empty-box minimalist-empty">
                  <div className="empty-headline">Chưa có phòng đang mở</div>
                </div>
              ) : (
                <div className="rooms-browser-list">
                  {sortedRooms.map((r) => {
                    const isLobby = r.phase === "lobby";
                    const isUnlocking = unlockingRoomCode === r.code;
                    const roomUId = sanitizeUniverseId(r.universeId);
                    const roomUTheme = getUniverseTheme(roomUId);
                    const phaseBadgeText = isLobby
                      ? "🟢 Chờ"
                      : r.phase === "ended"
                        ? "🏁 Kết thúc"
                        : `🔥 Ngày ${r.dayNumber || 1}`;

                    return (
                      <div
                        key={r.code}
                        className={`room-browser-card ${isLobby ? "is-lobby" : "is-playing"}`}
                      >
                        <div className="room-card-main">
                          <div className="room-card-left">
                            {r.hostAvatar ? (
                              <img
                                className="room-host-avatar"
                                src={renderPortraitSrc(r.hostAvatar)}
                                alt={r.hostName}
                              />
                            ) : (
                              <div className="room-host-avatar fallback-icon">
                                {roomUTheme.tabIcon}
                              </div>
                            )}

                            <div className="room-card-info">
                              <div className="room-card-title-row">
                                <span className={`room-tag universe-${roomUId}`}>
                                  {roomUTheme.tabIcon} {roomUTheme.shortTab}
                                </span>
                                <span className="room-card-title">{r.roomTitle}</span>
                              </div>

                              <div className="room-card-meta">
                                <span className={`room-tag ${isLobby ? "status-lobby" : "status-playing"}`}>
                                  {phaseBadgeText}
                                </span>
                                <span>
                                  👤 {r.humanCount}
                                  {r.botCount > 0 ? `+${r.botCount}🤖` : ""}/{r.maxSeats}
                                </span>
                                {!r.hasPassword ? (
                                  <span className="room-card-code">#{r.code}</span>
                                ) : (
                                  <span className="room-tag lock-pwd">🔐</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {isLobby ? (
                            <button
                              type="button"
                              className={`btn-room-join ${r.hasPassword ? "locked" : ""}`}
                              disabled={loading}
                              onClick={() => handleJoinPublicCard(r)}
                            >
                              {r.hasPassword ? "🔐 Mở" : "Vào ➤"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-room-spectate"
                              disabled={loading}
                              onClick={() => handleSpectateCard(r)}
                            >
                              {r.hasPassword ? "🔐 Xem" : "👀 Xem"}
                            </button>
                          )}
                        </div>

                        {isUnlocking && (
                          <form
                            className="room-inline-pwd-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (isLobby) {
                                handleJoinPublicCard(r, unlockRoomPwd);
                              } else {
                                handleSpectateCard(r, unlockRoomPwd);
                              }
                            }}
                          >
                            <input
                              className="mobile-safe-input"
                              type="password"
                              value={unlockRoomPwd}
                              maxLength={32}
                              onChange={(e) => setUnlockRoomPwd(e.target.value)}
                              placeholder={`🔐 Mật khẩu phòng "${r.roomTitle}"...`}
                              autoFocus
                            />
                            <button type="submit" className="btn-inline-pwd-submit" disabled={loading}>
                              Vào ➤
                            </button>
                            <button
                              type="button"
                              className="btn-inline-pwd-cancel"
                              onClick={() => {
                                setUnlockingRoomCode(null);
                                setUnlockRoomPwd("");
                              }}
                            >
                              ✕
                            </button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
