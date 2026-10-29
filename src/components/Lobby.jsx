import { useState, useEffect, useRef } from "react";
import { saveSession, getDeviceId } from "../hooks/useSocket.js";
import RolePortrait from "./RolePortrait.jsx";
import CitizenAvatarVaultModal from "./CitizenAvatarVaultModal.jsx";
import { getApiBaseUrl } from "../config/runtimeEnv.js";
import { getPlayerProgressionState } from "../utils/xpProgression.js";
import {
  BUILTIN_VILLAGER_AVATARS,
  getCitizenAvatarMeta,
  getStoredCitizenModelId,
  loadCitizenAvatarCatalog,
  saveStoredCitizenModelId,
  subscribeCitizenAvatarCatalog,
} from "../config/citizenAvatars.config.js";
import "./Lobby.css";

const RANDOM_NAMES = [
  "Rồng Lửa", "Bóng Đêm", "Sói Xám", "Ánh Sao", "Hổ Phách",
  "Mây Trắng", "Cáo Vàng", "Bão Tố", "Ngọc Bích", "Sấm Sét",
];

const ROLE_RULES = [
  { key: "wolf", name: "Sói", desc: "Mỗi đêm bí mật chọn 1 nạn nhân. Ban ngày che giấu danh tính!" },
  { key: "alpha_wolf", name: "Sói Đầu Đàn", desc: "1 lần mỗi ván có thể bật Huyết Nguyệt biến nạn nhân bị cắn thành Sói thay vì chết." },
  { key: "guard", name: "Bảo Vệ", desc: "Mỗi đêm gác 1 người khỏi nanh vuốt Sói (không trùng 2 đêm liên tiếp)." },
  { key: "seer", name: "Tiên Tri", desc: "Mỗi đêm soi 1 người: 🔴 Phe Sói, 🔵 Người tốt." },
  { key: "witch", name: "Phù Thủy", desc: "Sở hữu 1 bình Cứu + 1 bình Độc trong cả ván đấu." },
  { key: "hunter", name: "Thợ Săn", desc: "Khi ngã xuống (trừ khi trúng độc Phù Thủy), có 15s bắn 1 viên đạn bạc kéo theo 1 người!" },
  { key: "cupid", name: "Thần Tình Yêu", desc: "Đêm đầu kết duyên 2 Tình Nhân sinh tử. Nếu khác phe và sống sót 2 người cuối sẽ thắng riêng!" },
  { key: "mayor", name: "Trưởng Làng", desc: "Ban ngày có thể giơ Quyền Trượng lộ diện — từ đó lá phiếu Đề cử & Treo cổ được tính x2!" },
  { key: "tough_guy", name: "Người Cứng Cỏi", desc: "Nếu bị Sói cắn sẽ gắng gượng sống thêm trọn 1 ngày trước khi gục." },
  { key: "cursed", name: "Kẻ Bị Nguyền", desc: "Ban đầu là Dân, nhưng nếu bị Sói cắn trong đêm sẽ hóa thành Sói." },
  { key: "tanner", name: "Chán Đời", desc: "Phe Độc Lập — thắng ngay lập tức nếu lừa được cả làng treo cổ mình!" },
  { key: "villager", name: "Nông Dân", desc: "Quan sát, suy luận và bỏ phiếu chuẩn xác để thanh trừng bầy Sói." },
];

const RULES_TABS = [
  { id: "roles", label: "🎭 12 Vai Trò" },
  { id: "flow", label: "🔄 Luật Chơi" },
  { id: "tips", label: "💡 Mẹo" },
];

const PHASE_SHORT_LABELS = {
  role_reveal: "🎭 Nhận vai",
  night_cupid: "🌙 Đêm • Ghép đôi",
  night_guard: "🌙 Đêm • Bảo Vệ",
  night_wolf: "🌙 Đêm • Sói săn",
  night_witch: "🌙 Đêm • Phù Thủy",
  night_seer: "🌙 Đêm • Tiên Tri",
  hunter_revenge: "🏹 Đạn Bạc Cuối",
  day_reveal: "🌅 Bình minh",
  day_discuss: "☀️ Thảo luận",
  day_nominate: "🗳️ Đề cử",
  day_defense: "⚖️ Biện hộ",
  day_final_vote: "🪢 Pháp trường",
};

function suggestName() {
  return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
}

export default function Lobby({
  socketRef,
  onJoined,
  onOpenArchitectStudio = null,
  onOpenChoreoStudio = null,
}) {
  const [name, setName] = useState(() => sessionStorage.getItem("ws_name") || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Thiết lập Tạo Phòng Mới (Ẩn gọn mặc định theo Quy tắc 3 Giây V4.4 — mở mượt khi bấm Tạo Bàn)
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [roomTitle, setRoomTitle] = useState("");
  const [accessMode, setAccessMode] = useState("public"); // 'public' | 'password' | 'hidden'
  const [createPassword, setCreatePassword] = useState("");
  const [createTurbo, setCreateTurbo] = useState(false);

  // Vào phòng bằng Mã 5 ký tự (kèm mật khẩu nếu phòng khóa)
  const [roomCode, setRoomCode] = useState("");
  const [codePassword, setCodePassword] = useState("");
  const [needCodePassword, setNeedCodePassword] = useState(false);

  // Danh sách phòng trực tiếp trên trang chủ
  const [roomsList, setRoomsList] = useState([]);
  const [roomFilter, setRoomFilter] = useState("all"); // 'all' | 'lobby' | 'playing'
  const [unlockingRoomCode, setUnlockingRoomCode] = useState(null);
  const [unlockRoomPwd, setUnlockRoomPwd] = useState("");

  // Nhân vật Dân Làng 3D & Kho Avatar 3D Người Thật Cá Nhân Hóa (0% Dicebear, sẵn sàng đồng bộ DB User)
  const [citizenModelId, setCitizenModelId] = useState(() => getStoredCitizenModelId());
  const [showAvatarVault, setShowAvatarVault] = useState(false);
  const [, setCatalogTick] = useState(0);
  const [goldenHourInfo, setGoldenHourInfo] = useState(null);
  const [voiceHealth, setVoiceHealth] = useState(null);
  const [progression, setProgression] = useState(() => getPlayerProgressionState());

  useEffect(() => {
    let alive = true;
    const fetchServerStatus = () => {
      const apiBase = getApiBaseUrl();
      fetch(`${apiBase}/api/golden-hour`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!alive || !data?.ok) return;
          setGoldenHourInfo(data);
          setProgression(getPlayerProgressionState(data.serverDateKey));
        })
        .catch(() => {});

      fetch(`${apiBase}/api/voice-status`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!alive || !data?.ok) return;
          setVoiceHealth(data);
        })
        .catch(() => {});
    };
    fetchServerStatus();
    const timer = window.setInterval(fetchServerStatus, 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const unsub = subscribeCitizenAvatarCatalog(() => setCatalogTick((t) => t + 1));
    loadCitizenAvatarCatalog().then(() => {
      setCitizenModelId(getStoredCitizenModelId());
    });
    return unsub;
  }, []);

  const selectedCitizenMeta = getCitizenAvatarMeta(citizenModelId);
  const selectedAvatarUrl =
    selectedCitizenMeta.portraitBadge || "/portraits/badges/villager_cloak.webp";

  // Rules modal
  const [showRules, setShowRules] = useState(false);
  const [rulesTab, setRulesTab] = useState("roles");
  const autoInviteHandledRef = useRef(false);

  // Tự động bắt Link mời 1-Chạm (?room=ABCDE) từ Zalo / Messenger / TikTok Bio
  useEffect(() => {
    if (autoInviteHandledRef.current || typeof window === "undefined") return;
    const socket = socketRef.current;
    if (!socket) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const invitedCode = (params.get("room") || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
      if (invitedCode.length !== 5) return;
      autoInviteHandledRef.current = true;
      setRoomCode(invitedCode);

      // Xóa tham số ?room= khỏi thanh địa chỉ để F5 sau này không bị kẹt vòng lặp
      params.delete("room");
      const restQuery = params.toString();
      const cleanUrl = `${window.location.pathname}${restQuery ? `?${restQuery}` : ""}${window.location.hash || ""}`;
      window.history.replaceState({}, "", cleanUrl);

      const finalName = (sessionStorage.getItem("ws_name") || "").trim() || suggestName();
      setLoading(true);
      persistName(finalName);

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
          // Nếu bàn đang chơi hoặc đang tổng kết -> tự động đưa vào Chế độ Vào Xem & Đặt Ghế Ván Sau!
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
  }, [socketRef, selectedCitizenMeta.id, selectedAvatarUrl]);

  // Nạp ngầm trước Đợt 1 (Ghế, Bếp lửa, Sân đá, Đài treo cổ) để vào phòng 3D mượt tức thì
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

  function persistName(n) {
    sessionStorage.setItem("ws_name", n);
  }

  function handleSelectCitizen(nextId) {
    const meta = saveStoredCitizenModelId(nextId);
    setCitizenModelId(meta.id);
  }

  function finalizeJoinSuccess(res, finalName) {
    if (res.playerId) {
      sessionStorage.setItem("ws_playerId", res.playerId);
      saveSession(res.roomCode, res.sessionToken || "", res.playerId, finalName);
    }
    onJoined(res.roomCode);
  }

  function handleCreateRoom({ soloQuickStart = false } = {}) {
    setError("");
    const finalName = name.trim() || suggestName();

    let effectiveMode = accessMode;
    let effectivePwd = createPassword.trim();
    if (!soloQuickStart && effectiveMode === "password" && !effectivePwd) {
      setError("Vui lòng nhập mật khẩu cho phòng khóa (hoặc chọn Công khai / Phòng ẩn)!");
      return;
    }
    if (soloQuickStart && effectiveMode === "password" && !effectivePwd) {
      // Nếu bấm Chơi Nhanh 1 Mình mà chưa điền mật khẩu -> mặc định mở phòng bình thường để 1-Click chạy ngay
      effectiveMode = "public";
    }

    setLoading(true);
    persistName(finalName);
    socketRef.current.emit(
      "room:create",
      {
        name: finalName,
        citizenModelId: selectedCitizenMeta.id,
        avatarUrl: selectedAvatarUrl,
        roomTitle: roomTitle.trim(),
        accessMode: effectiveMode,
        password: effectivePwd,
        isTurbo: createTurbo,
        soloQuickStart,
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
    const finalName = name.trim() || suggestName();
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
          // Tự động chuyển sang Vào Xem & Đặt Ghế nếu bàn đang đấu!
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
    const finalName = name.trim() || suggestName();
    setLoading(true);
    persistName(finalName);

    socketRef.current.emit(
      "room:quickMatch",
      {
        name: finalName,
        citizenModelId: selectedCitizenMeta.id,
        avatarUrl: selectedAvatarUrl,
        preferTurbo: createTurbo,
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
    const finalName = name.trim() || suggestName();
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
    const finalName = name.trim() || suggestName();
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

  const waitingCount = roomsList.filter((r) => r.phase === "lobby").length;
  const playingCount = roomsList.filter((r) => r.phase !== "lobby").length;
  const filteredRooms = roomsList.filter((r) => {
    if (roomFilter === "lobby") return r.phase === "lobby";
    if (roomFilter === "playing") return r.phase !== "lobby";
    return true;
  });

  const completedQuestsCount = (progression.quests || []).filter((q) => q.completed).length;
  const questsSummaryTooltip = (progression.quests || [])
    .map((q) => `${q.completed ? "✅" : "▫️"} ${q.label} (+${q.rewardXp} XP)`)
    .join("  |  ");

  const accessHintText =
    accessMode === "password"
      ? "🔐 Bàn khóa — khách nhập đúng mật khẩu mới vào được."
      : accessMode === "hidden"
        ? "🕵️ Bàn ẩn — chỉ vào được bằng Mã 5 ký tự."
        : "🌍 Công khai trên sảnh để mọi người dễ ghép bàn cùng.";

  const renderPortraitSrc = (rawUrl) => {
    if (!rawUrl) return "/portraits/badges/villager_cloak.webp?v=44";
    return rawUrl.startsWith("/portraits/") && !rawUrl.includes("?") ? `${rawUrl}?v=44` : rawUrl;
  };

  return (
    <>
      {/* Nền Làng Bắc Âu Huyết Nguyệt 3D UE5 Render (0% WebGL phụ trên Trang chủ, 100% mượt Mobile!) */}
      <div className="home-arcane-backdrop" aria-hidden="true">
        <div className="home-arcane-keyart" />
        <div className="home-arcane-vignette" />
        <div className="home-arcane-rune-halo" />
        <span className="home-arcane-ember" style={{ left: "14%", animationDelay: "0s", animationDuration: "9.5s" }} />
        <span className="home-arcane-ember" style={{ left: "31%", animationDelay: "2.2s", animationDuration: "8.2s" }} />
        <span className="home-arcane-ember" style={{ left: "52%", animationDelay: "4.1s", animationDuration: "10.4s" }} />
        <span className="home-arcane-ember" style={{ left: "71%", animationDelay: "1.4s", animationDuration: "8.8s" }} />
        <span className="home-arcane-ember" style={{ left: "86%", animationDelay: "3.3s", animationDuration: "9.8s" }} />
      </div>

      <CitizenAvatarVaultModal
        open={showAvatarVault}
        onClose={() => setShowAvatarVault(false)}
        selectedId={selectedCitizenMeta.id}
        onSelect={handleSelectCitizen}
      />

      {/* Rules Modal */}
      {showRules && (
        <div className="rules-modal-overlay" onClick={() => setShowRules(false)}>
          <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rules-modal-header">
              <h2>📖 Cẩm Nang 12 Vai Ma Sói 3D</h2>
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
                  {ROLE_RULES.map((r) => (
                    <div key={r.key} className="rules-role-row">
                      <RolePortrait roleKey={r.key} size={46} glow />
                      <div>
                        <div className="rules-role-name">{r.name}</div>
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
                      <div className="flow-title">Chơi 1 Mình Hoặc Cùng Bạn Bè</div>
                      <div className="flow-desc">
                        Không cần chờ đủ 6 người! Bạn có thể bấm <strong>Chơi Nhanh 1 Mình</strong> hoặc tạo phòng bất kỳ rồi hệ thống tự động lấp đầy ghế còn thiếu bằng AI Bot thông minh.
                      </div>
                    </div>
                  </div>
                  <div className="flow-step">
                    <span className="flow-icon">🌙</span>
                    <div>
                      <div className="flow-title">Đêm Bí Mật</div>
                      <div className="flow-desc">
                        Thần Tình Yêu (Đêm 1) → Bảo Vệ → Sói / Sói Đầu Đàn → Phù Thủy → Tiên Tri.
                      </div>
                    </div>
                  </div>
                  <div className="flow-step">
                    <span className="flow-icon">☀️</span>
                    <div>
                      <div className="flow-title">Bình Minh & Thảo Luận</div>
                      <div className="flow-desc">
                        Công bố sự kiện đêm qua, Thợ Săn (nếu hy sinh) có 15s bắn trả thù, Trưởng Làng có thể giơ Quyền Trượng x2 phiếu.
                      </div>
                    </div>
                  </div>
                  <div className="flow-step">
                    <span className="flow-icon">🗳️</span>
                    <div>
                      <div className="flow-title">Đề Cử & Pháp Trường</div>
                      <div className="flow-desc">
                        Chỉ tay đề cử nghi phạm lên ghế nóng biện hộ, sau đó cả làng quyết định Treo Cổ hay Tha.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {rulesTab === "tips" && (
                <div className="rules-tips">
                  <div className="tip-item">💡 Muốn test nhanh vai mới (Thợ Săn, Thần Tình Yêu, Sói Đầu Đàn...)? Bấm <strong>⚡ Chơi Nhanh 1 Mình</strong> rồi chọn vai ngay trong sảnh!</div>
                  <div className="tip-item">💡 Muốn lập bàn riêng cho nhóm bạn? Chọn <strong>🔐 Đặt Mật Khẩu</strong> hoặc <strong>🕵️ Phòng Ẩn (Cần Mã)</strong> rồi gửi mã 5 ký tự.</div>
                  <div className="tip-item">💡 Khi chơi với AI Bot, bấm <strong>⏩ Bỏ qua thảo luận</strong> là toàn bộ AI Bot sẽ tự đồng thuận chuyển ngay sang vòng Vote!</div>
                  <div className="tip-item">💡 Cuối trận nhớ bấm xem <strong>Băng Ghi Hình Sự Thật 3D</strong> để thưởng thức toàn bộ mưu kế đêm qua!</div>
                </div>
              )}
            </div>

            <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowRules(false)}>
              Đã hiểu, vào chơi!
            </button>
          </div>
        </div>
      )}

      {/* ==================== TRANG CHỦ 2 CỘT V4.4 (QUY TẮC 3 GIÂY): HỒ SƠ & CHƠI NGAY | SẢNH TRỰC TUYẾN ==================== */}
      <div className="home-hub-shell">
        <header className="home-hub-topbar">
          <div className="home-brand-group">
            <div className="home-crest-emblem" aria-hidden="true">🐺</div>
            <div>
              <h1 className="home-brand-title">MA SÓI ONLINE 3D</h1>
              <div className="home-brand-sub">Làng Đêm Huyết Nguyệt • Suy Luận & Đàm Thoại 3D</div>
            </div>
            <span className="home-live-pill">
              🟢 {waitingCount} chờ • 🔥 {playingCount} đang đấu
            </span>
            <span
              className={`home-golden-pill ${goldenHourInfo?.active ? "active" : ""}`}
              title="Khung giờ Vàng Đêm Huyết Nguyệt 20:00 – 23:00 (UTC+7) nhân đôi toàn bộ XP!"
            >
              {goldenHourInfo?.active ? "🌕 ĐANG X2 XP" : "🌙 X2 XP: 20h–23h"}
            </span>
            {voiceHealth && !voiceHealth.livekitHealthy && (
              <span
                className="home-live-pill"
                title={`Trạng thái Đàm thoại: ${voiceHealth.livekitStatus || "Đang kiểm tra"}`}
                style={{
                  borderColor: "rgba(251, 191, 36, 0.55)",
                  background: "rgba(146, 64, 14, 0.28)",
                  color: "#fde68a",
                }}
              >
                {!voiceHealth.livekitConfigured
                  ? "⚠️ Voice: Thiếu Key"
                  : voiceHealth.livekitStatus === "LIVEKIT_QUOTA_EXCEEDED"
                    ? "⚠️ Voice: Hết Quota"
                    : "⏳ Đang kết nối Voice"}
              </span>
            )}
          </div>

          <div className="home-topbar-actions">
            {voiceHealth?.livekitHealthy && (
              <span
                className="home-voice-ready-dot"
                title="Đàm thoại 3D Giữ-Để-Nói đã sẵn sàng"
              >
                🎙️ Voice 3D
              </span>
            )}
            {onOpenChoreoStudio && (
              <button
                type="button"
                className="btn-home-top studio-choreo"
                onClick={onOpenChoreoStudio}
                title="Diễn thử hoạt cảnh 9 vai trên sân khấu 3D"
              >
                🎬 Hoạt Cảnh
              </button>
            )}
            {onOpenArchitectStudio && (
              <button
                type="button"
                className="btn-home-top studio-d5"
                onClick={onOpenArchitectStudio}
                title="Mở Studio Cảnh Quan D5 sắp xếp Model 3D"
              >
                🏗️ Studio D5
              </button>
            )}
            {!import.meta.env.PROD && (
              <span
                className="btn-home-top local-env-chip"
                title="Đang chạy bản kiểm thử Local nối thẳng http://localhost:3001 (Chưa đẩy lên Cloud)"
              >
                🧪 LOCAL :3001
              </span>
            )}
            <button type="button" className="btn-home-top btn-rules-book" onClick={() => setShowRules(true)}>
              📖 Cẩm Nang
            </button>
          </div>
        </header>

        {error && <div className="error" style={{ marginBottom: 0 }}>⚠️ {error}</div>}

        <div className="home-hub-grid">
          {/* ==================== CỘT TRÁI (400px): 3 KHỐI TINH GỌN CHUẨN GAME AAA ==================== */}
          <section className="home-panel-card home-left-column">
            {/* KHỐI 1: ĐỊNH DANH NGƯỜI CHƠI & CHỌN NHÂN VẬT 3D */}
            <div className="home-identity-block">
              <div className="home-section-label">
                <span>👤 Định Danh Thợ Săn Đêm</span>
                <span className="nordic-rank-chip" style={{ borderColor: progression.rankBorderHex }}>
                  {progression.rankBadge} Lv.{progression.level} {progression.rankTitle}
                </span>
              </div>

              <input
                className="home-name-input"
                type="text"
                value={name}
                maxLength={20}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nhập biệt danh của bạn..."
                autoFocus
              />

              <div className="nordic-xp-card compact-v44" title={questsSummaryTooltip}>
                <div className="nordic-xp-top">
                  <span>
                    ✨ {progression.xpInLevel}/{progression.xpForNextLevel} XP
                    {goldenHourInfo?.active ? " • 🌕 X2" : ""}
                  </span>
                  <span className="nordic-xp-stats-right">
                    <span>🔥 {progression.streakDays || 0} ngày</span>
                    <span>• 🏆 {progression.winsCount} thắng</span>
                    <span className="quest-mini-counter">
                      • 📜 {completedQuestsCount}/{(progression.quests || []).length} NV
                    </span>
                  </span>
                </div>
                <div className="nordic-xp-bar-track">
                  <div
                    className="nordic-xp-bar-fill"
                    style={{ width: `${progression.progressPct}%` }}
                  />
                </div>
              </div>

              <div className="citizen-profile-strip">
                <div className="citizen-strip-header">
                  <span className="citizen-strip-label">🎭 Diện mạo Dân Làng 3D:</span>
                  <button
                    type="button"
                    className="btn-open-avatar-vault"
                    onClick={() => setShowAvatarVault(true)}
                    title="Mở Kho Nhân Vật 3D & Avatar Người Thật Cá Nhân Hóa"
                  >
                    + Kho 3D
                  </button>
                </div>

                <div className="citizen-strip-row">
                  {BUILTIN_VILLAGER_AVATARS.map((item) => {
                    const isSelected = selectedCitizenMeta.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`citizen-mini-card ${isSelected ? "selected" : ""}`}
                        onClick={() => handleSelectCitizen(item.id)}
                        title={`${item.label} — ${item.desc}`}
                      >
                        <img
                          src={renderPortraitSrc(item.portraitCard || item.portraitBadge)}
                          alt={item.label}
                          className="citizen-mini-thumb"
                        />
                        <span className="citizen-mini-name">{item.shortLabel}</span>
                      </button>
                    );
                  })}
                </div>

                {selectedCitizenMeta.source === "custom_3d_human" || selectedCitizenMeta.source === "teen_academy_3d" ? (
                  <div className="citizen-active-custom-banner">
                    <span>✨ Avatar 3D: <strong>{selectedCitizenMeta.label}</strong></span>
                    <button
                      type="button"
                      className="btn-open-avatar-vault"
                      onClick={() => setShowAvatarVault(true)}
                    >
                      Đổi
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="home-teen-slot-teaser"
                    onClick={() => setShowAvatarVault(true)}
                    title="Mở xem 6 Cổng Chờ Nhân Vật Teen Học Viện (Sẵn sàng gắn file .GLB từ Tripo -> Blender)"
                  >
                    <span className="teen-teaser-badge">SẮP MỞ</span>
                    <span className="teen-teaser-text">🎓 Thế Hệ Học Viện Teen 3D • 6 Cổng Chờ .GLB</span>
                    <span className="teen-teaser-arrow">›</span>
                  </button>
                )}
              </div>
            </div>

            {/* KHỐI 2: PHÂN CẤP HÀNH ĐỘNG 3 GIÂY (1 NÚT HERO CHỦ LỰC + 2 NÚT CHẾ ĐỘ ĐỐI XỨNG) */}
            <div className="home-action-hierarchy">
              <div className="quick-match-hero-card">
                <button
                  type="button"
                  className="btn-quick-match-gold"
                  disabled={loading}
                  onClick={handleQuickMatch}
                >
                  <span className="hero-cta-main">🔥 VÀO CHƠI NGAY</span>{" "}
                  <span className="hero-cta-sub">Ghép bàn 1-chạm • Tự bù ghế trống bằng AI</span>
                </button>
                <div className="quick-match-showcase-strip">
                  <div className="quick-match-portraits-row">
                    {["wolf", "alpha_wolf", "seer", "witch", "hunter", "mayor"].map((rk) => (
                      <RolePortrait key={rk} roleKey={rk} size={30} />
                    ))}
                  </div>
                  <span className="quick-match-tagline">12 vai 3D điện ảnh</span>
                </div>
              </div>

              <div className="home-secondary-modes-grid">
                <button
                  type="button"
                  className="btn-mode-card solo-mode"
                  disabled={loading}
                  onClick={() => handleCreateRoom({ soloQuickStart: true })}
                  title="Vào thẳng sảnh Làng 3D cùng 7 AI Bot thông minh, tự chọn vai muốn thử rồi đấu ngay!"
                >
                  <span className="mode-card-title">⚡ Đấu AI Solo</span>{" "}
                  <span className="mode-card-sub">8 ghế • Tự chọn vai</span>
                </button>

                <button
                  type="button"
                  className={`btn-mode-card create-mode ${showCreatePanel ? "active" : ""}`}
                  disabled={loading}
                  onClick={() => setShowCreatePanel((v) => !v)}
                  title="Mở bàn mới cho nhóm bạn (Công khai, Khóa mật khẩu hoặc Phòng ẩn)"
                >
                  <span className="mode-card-title">
                    {showCreatePanel ? "▾ Đóng Thiết Lập" : "➕ Tạo Bàn Mới"}
                  </span>{" "}
                  <span className="mode-card-sub">Cùng bạn bè • 6–16 ghế</span>
                </button>
              </div>
            </div>

            {/* KHỐI 3: NGĂN TẠO BÀN MỞ RỘNG MƯỢT (PROGRESSIVE DISCLOSURE) */}
            {showCreatePanel && (
              <div className="create-setup-box">
                <div className="home-section-label" style={{ marginBottom: 0 }}>
                  <span>🛠️ Thiết Lập Bàn Mới</span>
                  <button
                    type="button"
                    className={`turbo-mini-pill ${createTurbo ? "on" : ""}`}
                    onClick={() => setCreateTurbo((v) => !v)}
                    title="Rút gọn thời gian thảo luận cho ván đấu 5 phút tốc độ cao"
                  >
                    ⚡ Tốc chiến 5p: {createTurbo ? "BẬT" : "Tắt"}
                  </button>
                </div>

                <input
                  type="text"
                  value={roomTitle}
                  maxLength={36}
                  onChange={(e) => setRoomTitle(e.target.value)}
                  placeholder="Tên bàn (VD: Hội Sói Đêm Khuya)..."
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
                    type="password"
                    value={createPassword}
                    maxLength={32}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="🔐 Đặt mật khẩu bàn..."
                  />
                )}

                <div className="access-mode-hint">{accessHintText}</div>

                <button
                  type="button"
                  className="btn-launch-new-room"
                  disabled={loading}
                  onClick={() => handleCreateRoom({ soloQuickStart: false })}
                >
                  🚀 Mở Bàn Ngay ({accessMode === "password" ? "Có Mật Khẩu" : accessMode === "hidden" ? "Phòng Ẩn" : "Công Khai"})
                </button>
              </div>
            )}
          </section>

          {/* ==================== CỘT PHẢI: MÃ BÀN GỌN 1 DÒNG + SẢNH PHÒNG TRỰC TUYẾN ==================== */}
          <section className="home-panel-card home-right-column">
            <form className="join-code-strip compact-inline" onSubmit={handleJoinByCode}>
              <div className="join-code-row">
                <span className="join-code-kicker">🔑 Mã bàn:</span>
                <input
                  className="join-code-input"
                  value={roomCode}
                  maxLength={5}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="NHẬP 5 KÝ TỰ"
                />
                <button
                  type="button"
                  className={`btn-toggle-code-pwd ${needCodePassword ? "active" : ""}`}
                  onClick={() => setNeedCodePassword((v) => !v)}
                  title="Bàn có mật khẩu? Bấm để nhập mật khẩu"
                >
                  🔐
                </button>
                <button type="submit" className="btn-join-by-code" disabled={loading}>
                  Vào Bàn ➤
                </button>
              </div>

              {needCodePassword && (
                <div className="join-code-pwd-row">
                  <input
                    type="password"
                    value={codePassword}
                    maxLength={32}
                    onChange={(e) => setCodePassword(e.target.value)}
                    placeholder="🔐 Nhập mật khẩu của bàn này..."
                  />
                </div>
              )}
            </form>

            {/* DANH SÁCH PHÒNG TRỰC TIẾP */}
            <div className="browser-header-row">
              <h2 className="browser-title">📡 Sảnh Làng Trực Tuyến ({roomsList.length})</h2>
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
                  className={`browser-filter-btn ${roomFilter === "lobby" ? "active" : ""}`}
                  onClick={() => setRoomFilter("lobby")}
                >
                  🟢 Chờ ({waitingCount})
                </button>
                <button
                  type="button"
                  className={`browser-filter-btn ${roomFilter === "playing" ? "active" : ""}`}
                  onClick={() => setRoomFilter("playing")}
                >
                  🔥 Đang đấu ({playingCount})
                </button>
                <button
                  type="button"
                  className="browser-filter-btn"
                  onClick={refreshRoomsManual}
                  title="Làm mới danh sách bàn"
                >
                  🔄
                </button>
              </div>
            </div>

            {filteredRooms.length === 0 ? (
              <div className="rooms-empty-box cinematic-empty">
                <div className="empty-moon-crest">🌕🐺</div>
                <div className="empty-headline">
                  {roomsList.length === 0
                    ? "Đêm yên tĩnh — chưa có bàn công khai nào đang mở"
                    : "Không có bàn nào khớp bộ lọc hiện tại"}
                </div>
                <div className="empty-subtext">
                  Khởi động ngay ván đấu 3D cùng 7 AI Bot biết suy luận hoặc lập bàn mới rủ hội bạn vào!
                </div>
                <div className="empty-quick-actions">
                  <button
                    type="button"
                    className="btn-empty-solo"
                    disabled={loading}
                    onClick={() => handleCreateRoom({ soloQuickStart: true })}
                  >
                    ⚡ Đấu Ngay Cùng AI (8 Ghế)
                  </button>
                  <button
                    type="button"
                    className="btn-empty-create"
                    disabled={loading}
                    onClick={() => setShowCreatePanel(true)}
                  >
                    ➕ Mở Bàn Công Khai
                  </button>
                </div>
              </div>
            ) : (
              <div className="rooms-browser-list">
                {filteredRooms.map((r) => {
                  const isLobby = r.phase === "lobby";
                  const isUnlocking = unlockingRoomCode === r.code;
                  const phaseBadgeText = isLobby
                    ? "🟢 Đang chờ"
                    : r.phase === "ended"
                      ? "🏁 Tổng kết"
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
                            <div
                              className="room-host-avatar"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "1.3rem",
                              }}
                            >
                              🐺
                            </div>
                          )}

                          <div className="room-card-info">
                            <div className="room-card-title-row">
                              <span className="room-card-title">{r.roomTitle}</span>
                              <span className={`room-tag ${isLobby ? "status-lobby" : "status-playing"}`}>
                                {phaseBadgeText}
                              </span>
                              {r.hasPassword && (
                                <span className="room-tag lock-pwd">🔐 Khóa</span>
                              )}
                              {r.isTurbo && (
                                <span className="room-tag turbo-tag">⚡ 5p</span>
                              )}
                            </div>

                            <div className="room-card-meta">
                              <span>👑 {r.hostName}</span>
                              <span>
                                👤 {r.humanCount}
                                {r.botCount > 0 ? `+${r.botCount}🤖` : ""}/{r.maxSeats} ghế
                                {r.spectatorCount > 0 ? ` • 👀 ${r.spectatorCount}` : ""}
                              </span>
                              {!isLobby && r.phase === "playing" && (
                                <span style={{ color: "#fde68a", fontWeight: 700 }}>
                                  {PHASE_SHORT_LABELS[r.nightDayPhase] || "Đang đấu"} • 💚 {r.aliveCount}/{r.totalPlayers}
                                </span>
                              )}
                              {!r.hasPassword && <span className="room-card-code">#{r.code}</span>}
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
                            {r.hasPassword ? "🔐 Mở Khóa" : "Vào Bàn ➤"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-room-spectate"
                            disabled={loading}
                            onClick={() => handleSpectateCard(r)}
                            title="Ngồi xem sân khấu 3D trực tiếp (Zero-Leak) và tự động giữ ghế cho ván kế tiếp!"
                          >
                            {r.hasPassword ? "🔐 Xem" : "👀 Vào Xem"}
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
                            type="password"
                            value={unlockRoomPwd}
                            maxLength={32}
                            onChange={(e) => setUnlockRoomPwd(e.target.value)}
                            placeholder={`🔐 Nhập mật khẩu vào "${r.roomTitle}"...`}
                            autoFocus
                          />
                          <button type="submit" className="btn-inline-pwd-submit" disabled={loading}>
                            Mở khóa & Vào ➤
                          </button>
                          <button
                            type="button"
                            className="btn-inline-pwd-cancel"
                            onClick={() => {
                              setUnlockingRoomCode(null);
                              setUnlockRoomPwd("");
                            }}
                          >
                            Đóng
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
    </>
  );
}
