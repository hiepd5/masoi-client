import { useState, useEffect, useRef } from "react";
import { saveSession, getDeviceId } from "../hooks/useSocket.js";
import RolePortrait from "./RolePortrait.jsx";
import "./Lobby.css";

const RANDOM_NAMES = [
  "Rồng Lửa", "Bóng Đêm", "Sói Xám", "Ánh Sao", "Hổ Phách",
  "Mây Trắng", "Cáo Vàng", "Bão Tố", "Ngọc Bích", "Sấm Sét",
];

const DICEBEAR_SEEDS = [
  "wolf", "fox", "bear", "dragon", "witch", "guard", "seer", "farmer",
  "ninja", "ghost", "knight", "wizard", "hunter", "monk", "sage",
  "rogue", "bard", "paladin", "ranger", "druid",
];

const CUSTOM_AVATARS = Array.from({ length: 10 }, (_, i) =>
  `/avatars/custom/avatar_${String(i + 1).padStart(2, "0")}.png`
);

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

  // Thiết lập Tạo Phòng Mới
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

  // Avatar
  const [avatarTab, setAvatarTab] = useState("custom");
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState(
    () => sessionStorage.getItem("ws_avatar_url") || CUSTOM_AVATARS[0]
  );

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
  }, [socketRef, selectedAvatarUrl]);

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

  function persistAvatar(url) {
    sessionStorage.setItem("ws_avatar_url", url);
    setSelectedAvatarUrl(url);
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

  const dicebearUrl = (seed) =>
    `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;

  const waitingCount = roomsList.filter((r) => r.phase === "lobby").length;
  const playingCount = roomsList.filter((r) => r.phase !== "lobby").length;
  const filteredRooms = roomsList.filter((r) => {
    if (roomFilter === "lobby") return r.phase === "lobby";
    if (roomFilter === "playing") return r.phase !== "lobby";
    return true;
  });

  const accessHintText =
    accessMode === "password"
      ? "🔐 Phòng vẫn hiện trên danh sách trang chủ nhưng khách phải nhập đúng mật khẩu mới vào được."
      : accessMode === "hidden"
        ? "🕵️ Phòng ẩn hoàn toàn khỏi danh sách chung — chỉ ai nhận Mã phòng 5 ký tự từ bạn mới vào được!"
        : "🌍 Phòng hiển thị công khai ở cột bên phải để mọi người có thể bấm vào giao lưu & test cùng.";

  return (
    <>
      {/* Nền Làng Cổ Ngữ Dark Nordic Arcane (Chốt #11: Không mở WebGL thứ 2 trên Trang chủ, 100% an toàn RAM Mobile!) */}
      <div className="home-arcane-backdrop" aria-hidden="true">
        <div className="home-arcane-rune-halo" />
      </div>

      {/* Rules Modal */}
      {showRules && (
        <div className="rules-modal-overlay" onClick={() => setShowRules(false)}>
          <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rules-modal-header">
              <h2>📖 Sổ Tay 12 Vai Ma Sói 3D (V4.1)</h2>
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

      {/* ==================== TRANG CHỦ 2 CỘT: HỒ SƠ & TẠO PHÒNG | MÃ PHÒNG & DANH SÁCH TRỰC TIẾP ==================== */}
      <div className="home-hub-shell">
        <header className="home-hub-topbar">
          <div className="home-brand-group">
            <div>
              <h1 className="home-brand-title">🐺 Ma Sói Online 3D</h1>
              <div className="home-brand-sub">Suy luận • Ẩn vai • Chơi 1 mình với AI Bot hoặc lập phòng cùng bạn bè</div>
            </div>
            <span className="home-live-pill">
              🟢 {waitingCount} phòng chờ • 🔥 {playingCount} đang đấu
            </span>
          </div>

          <div className="home-topbar-actions">
            {onOpenChoreoStudio && (
              <button
                type="button"
                className="btn-home-top studio-choreo"
                onClick={onOpenChoreoStudio}
                title="Diễn thử hoạt cảnh 9 vai trên sân khấu 3D"
              >
                🎬 Studio Hoạt Cảnh
              </button>
            )}
            {onOpenArchitectStudio && (
              <button
                type="button"
                className="btn-home-top studio-d5"
                onClick={onOpenArchitectStudio}
                title="Mở Studio Cảnh Quan D5 sắp xếp 12 Model 3D"
              >
                🏗️ Studio D5
              </button>
            )}
            <button type="button" className="btn-home-top" onClick={() => setShowRules(true)}>
              📖 Luật Chơi
            </button>
          </div>
        </header>

        {error && <div className="error" style={{ marginBottom: 0 }}>⚠️ {error}</div>}

        <div className="home-hub-grid">
          {/* ==================== CỘT TRÁI: HỒ SƠ + CHƠI NHANH 1 MÌNH + SETUP PHÒNG ==================== */}
          <section className="home-panel-card">
            <div>
              <div className="home-section-label">
                <span>👤 Hồ Sơ Của Bạn</span>
              </div>
              <input
                className="home-name-input"
                type="text"
                value={name}
                maxLength={20}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nhập tên hiển thị (để trống tự đặt tên ngầu)..."
                autoFocus
              />
            </div>

            <div>
              <div className="home-avatar-tabs">
                {[
                  { id: "custom", label: "🎨 Ảnh thật" },
                  { id: "dice", label: "🤖 Nhân vật" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`home-avatar-tab ${avatarTab === tab.id ? "active" : ""}`}
                    onClick={() => setAvatarTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="home-avatar-grid">
                {avatarTab === "custom"
                  ? CUSTOM_AVATARS.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt="avatar"
                        className={`home-avatar-item ${selectedAvatarUrl === url ? "selected" : ""}`}
                        onClick={() => persistAvatar(url)}
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    ))
                  : DICEBEAR_SEEDS.map((seed) => {
                      const url = dicebearUrl(seed);
                      return (
                        <img
                          key={seed}
                          src={url}
                          alt={seed}
                          className={`home-avatar-item ${selectedAvatarUrl === url ? "selected" : ""}`}
                          onClick={() => persistAvatar(url)}
                        />
                      );
                    })}
              </div>
            </div>

            {/* NÚT VÀNG CHỦ LỰC V4.1: GHÉP BÀN NHANH 1-CHẠM + TRƯNG BÀY DÀN NHÂN VẬT 3D STUDIO */}
            <div className="quick-match-hero-card">
              <button
                type="button"
                className="btn-quick-match-gold"
                disabled={loading}
                onClick={handleQuickMatch}
              >
                🔥 CHƠI NGAY — Ghép Bàn Nhanh 1-Chạm
              </button>
              <div className="quick-match-showcase-strip">
                <div className="quick-match-portraits-row">
                  {["wolf", "alpha_wolf", "seer", "witch", "hunter", "mayor"].map((rk) => (
                    <RolePortrait key={rk} roleKey={rk} size={30} />
                  ))}
                </div>
                <span style={{ fontSize: "0.74rem", color: "#fde68a", fontWeight: 600 }}>
                  Vào ngay bàn đông nhất • Tự bù AI Bot thông minh
                </span>
              </div>
            </div>

            {/* HỘP 1-CLICK CHƠI NHANH 1 MÌNH KHÔNG CẦN ĐỦ 6 NGƯỜI */}
            <div className="solo-hero-box">
              <button
                type="button"
                className="btn-solo-quickstart"
                disabled={loading}
                onClick={() => handleCreateRoom({ soloQuickStart: true })}
              >
                ⚡ Luyện Tập 1 Mình (8 Ghế V4.1 + Tự Chọn Vai)
              </button>
              <p className="solo-hero-desc">
                🎯 Vào thẳng sảnh 3D với 7 AI Bot biết tranh biện — tự chọn vai muốn thử rồi xuất trận ngay!
              </p>
            </div>

            {/* HỘP TẠO PHÒNG TÙY CHỈNH: CÔNG KHAI / MẬT KHẨU / PHÒNG ẨN CẦN MÃ */}
            <div className="create-setup-box">
              <div className="home-section-label" style={{ marginBottom: 0 }}>
                <span>🛠️ Tạo Phòng Mới & Bảo Mật</span>
              </div>

              <input
                type="text"
                value={roomTitle}
                maxLength={36}
                onChange={(e) => setRoomTitle(e.target.value)}
                placeholder="Tên bàn (tùy chọn — VD: Hội Sói Đêm Khuya)"
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
                  placeholder="🔐 Đặt mật khẩu cho phòng..."
                />
              )}

              <div className="access-mode-hint">{accessHintText}</div>

              <button
                type="button"
                onClick={() => setCreateTurbo((v) => !v)}
                style={{
                  width: "100%",
                  margin: "0 0 8px 0",
                  padding: "8px 12px",
                  borderRadius: "10px",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: createTurbo
                    ? "linear-gradient(135deg, rgba(245, 158, 11, 0.26), rgba(234, 88, 12, 0.24))"
                    : "rgba(30, 41, 59, 0.65)",
                  border: createTurbo
                    ? "1px solid rgba(251, 191, 36, 0.72)"
                    : "1px solid rgba(148, 163, 184, 0.25)",
                  color: createTurbo ? "#fef08a" : "#cbd5e1",
                }}
              >
                <span>⚡ Chế độ Tốc Chiến (5 Phút / Ván)</span>
                <span>{createTurbo ? "ĐANG BẬT ✓" : "Tắt"}</span>
              </button>

              <button
                type="button"
                className="btn-primary"
                style={{ marginBottom: 0 }}
                disabled={loading}
                onClick={() => handleCreateRoom({ soloQuickStart: false })}
              >
                ➕ Tạo Phòng Mới ({accessMode === "password" ? "Có Mật Khẩu" : accessMode === "hidden" ? "Phòng Ẩn Cần Mã" : "Công Khai"})
              </button>
            </div>
          </section>

          {/* ==================== CỘT PHẢI: NHẬP MÃ PHÒNG RIÊNG + DANH SÁCH PHÒNG ĐANG CHỜ / ĐANG CHƠI ==================== */}
          <section className="home-panel-card">
            <form className="join-code-strip" onSubmit={handleJoinByCode}>
              <div className="home-section-label" style={{ marginBottom: 0 }}>
                <span>🔑 Có Mã Phòng Riêng / Phòng Ẩn?</span>
                {!needCodePassword && (
                  <button
                    type="button"
                    onClick={() => setNeedCodePassword(true)}
                    style={{
                      width: "auto",
                      margin: 0,
                      padding: "2px 8px",
                      fontSize: "0.7rem",
                      background: "transparent",
                      color: "#a5b4fc",
                      border: "1px solid rgba(165,180,252,0.35)",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    + Kèm mật khẩu
                  </button>
                )}
              </div>

              <div className="join-code-row">
                <input
                  className="join-code-input"
                  value={roomCode}
                  maxLength={5}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="NHẬP MÃ 5 KÝ TỰ (VD: A3F9K)"
                />
                <button type="submit" className="btn-join-by-code" disabled={loading}>
                  Vào bằng Mã ➤
                </button>
              </div>

              {needCodePassword && (
                <div className="join-code-pwd-row">
                  <input
                    type="password"
                    value={codePassword}
                    maxLength={32}
                    onChange={(e) => setCodePassword(e.target.value)}
                    placeholder="🔐 Nhập mật khẩu của phòng này..."
                  />
                </div>
              )}
            </form>

            {/* DANH SÁCH PHÒNG TRỰC TIẾP */}
            <div className="browser-header-row">
              <h2 className="browser-title">📡 Sảnh Phòng Trực Tiếp ({roomsList.length})</h2>
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
                  🟢 Đang chờ ({waitingCount})
                </button>
                <button
                  type="button"
                  className={`browser-filter-btn ${roomFilter === "playing" ? "active" : ""}`}
                  onClick={() => setRoomFilter("playing")}
                >
                  🔥 Đang chơi ({playingCount})
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

            {filteredRooms.length === 0 ? (
              <div className="rooms-empty-box">
                <div style={{ fontSize: "2rem" }}>🌕</div>
                <div>
                  {roomsList.length === 0
                    ? "Hiện chưa có bàn công khai nào đang mở trên sảnh."
                    : "Không có phòng nào khớp bộ lọc này."}
                </div>
                <div style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                  Bạn có thể bấm <strong>⚡ Chơi Nhanh 1 Mình</strong> để vào test ngay cùng 7 AI Bot mà không cần đợi ai!
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
                      ? "🏁 Đang tổng kết"
                      : `🔥 Đang chơi • Ngày ${r.dayNumber || 1}`;

                  return (
                    <div
                      key={r.code}
                      className={`room-browser-card ${isLobby ? "is-lobby" : "is-playing"}`}
                    >
                      <div className="room-card-main">
                        <div className="room-card-left">
                          {r.hostAvatar ? (
                            <img className="room-host-avatar" src={r.hostAvatar} alt={r.hostName} />
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
                              <span className={`room-tag ${r.hasPassword ? "lock-pwd" : "lock-open"}`}>
                                {r.hasPassword ? "🔐 Mật khẩu" : "🌍 Mở"}
                              </span>
                              {r.hasExpandedRoles && (
                                <span className="room-tag v33-badge">✨ V3.3</span>
                              )}
                              {r.isTurbo && (
                                <span
                                  className="room-tag"
                                  style={{
                                    background: "rgba(245, 158, 11, 0.24)",
                                    borderColor: "rgba(251, 191, 36, 0.65)",
                                    color: "#fef08a",
                                  }}
                                >
                                  ⚡ 5 Phút
                                </span>
                              )}
                            </div>

                            <div className="room-card-meta">
                              <span>👑 {r.hostName}</span>
                              <span>
                                👤 {r.humanCount} người
                                {r.botCount > 0 ? ` + 🤖 ${r.botCount} Bot` : ""} / {r.maxSeats} ghế
                                {r.spectatorCount > 0 ? ` • 👀 ${r.spectatorCount}` : ""}
                              </span>
                              {!isLobby && r.phase === "playing" && (
                                <span style={{ color: "#fde68a", fontWeight: 700 }}>
                                  {PHASE_SHORT_LABELS[r.nightDayPhase] || "Đang đấu"} • 💚 {r.aliveCount}/{r.totalPlayers} sống
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
                            {r.hasPassword ? "🔐 Nhập mật khẩu" : "Vào Phòng ➤"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-room-spectate"
                            disabled={loading}
                            onClick={() => handleSpectateCard(r)}
                            title="Ngồi xem sân khấu 3D trực tiếp (Zero-Leak) và tự động giữ ghế cho ván kế tiếp!"
                          >
                            {r.hasPassword ? "🔐 Xem & Đặt Ghế" : "👀 Vào Xem & Đặt Ghế"}
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
