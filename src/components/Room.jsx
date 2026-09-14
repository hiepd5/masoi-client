import { useEffect, useRef, useState } from "react";
import PlayingView from "./PlayingView.jsx";
import { ROLES_CONFIG, generateDefaultRoles } from "../config/roles.config.js";
import "./Room.css";

const ORDERED_ROLES = ["wolf", "guard", "witch", "seer", "tough_guy", "cursed", "tanner", "villager"];

export default function Room({ socketRef, roomCode, roomData, onLeave }) {
  const room = roomData;
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  // Mobile navigation tabs: 'players' | 'roles' | 'chat'
  const [mobileTab, setMobileTab] = useState("players");
  const [hasUnreadChat, setHasUnreadChat] = useState(false);

  // Lobby chat
  const [chatInput, setChatInput] = useState("");
  const [lobbyMessages, setLobbyMessages] = useState(room?.lobbyMessages || []);
  const chatEndRef = useRef(null);

  // MC audio / Voice
  const [mcLog, setMcLog] = useState([]);
  const [mcVoiceEnabled, setMcVoiceEnabled] = useState(true);
  const lastSpokenRef = useRef(-1);
  const currentAudioRef = useRef(null);

  const myId = sessionStorage.getItem("ws_playerId") || socketRef.current?.id;

  // Sync lobby messages from roomData
  useEffect(() => {
    if (room?.lobbyMessages) {
      setLobbyMessages(room.lobbyMessages);
    }
  }, [room?.lobbyMessages]);

  // Listen to real-time lobby chat messages & MC messages
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleLobbyMsg = (msg) => {
      setLobbyMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (mobileTab !== "chat") {
        setHasUnreadChat(true);
      }
    };

    const handleMcMsg = (msg) => {
      let type = "mc";
      if (msg.includes("không qua khỏi") || msg.includes("bị treo cổ") || msg.includes("chết")) type = "death";
      else if (msg.includes("không ai chết") || msg.includes("được tha")) type = "save";
      setMcLog((prev) => [...prev, { text: msg, type }]);
    };

    socket.on("room:lobbyMessage", handleLobbyMsg);
    socket.on("mc:message", handleMcMsg);

    return () => {
      socket.off("room:lobbyMessage", handleLobbyMsg);
      socket.off("mc:message", handleMcMsg);
    };
  }, [socketRef, mobileTab]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (mobileTab === "chat" || window.innerWidth >= 768) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lobbyMessages, mobileTab]);

  // Clear unread badge when entering chat tab
  useEffect(() => {
    if (mobileTab === "chat") {
      setHasUnreadChat(false);
    }
  }, [mobileTab]);

  // ============ AUDIO: MiniMax MP3 + TTS fallback ============
  const AUDIO_MAP = [
    { pattern: /Đêm đầu tiên buông xuống/,        file: 'game_start.mp3' },
    { pattern: /Bảo Vệ ơi.*thức dậy/,             file: 'night_starts.mp3' },
    { pattern: /Bảo Vệ đã ngủ lại.*Sói ơi/,       file: 'wolf_wake.mp3' },
    { pattern: /Sói đã ngủ lại.*Phù Thủy/,         file: 'witch_wake.mp3' },
    { pattern: /Phù Thủy đã ngủ lại.*Tiên Tri/,   file: 'seer_wake.mp3' },
    { pattern: /Đêm qua không ai chết/,            file: 'no_death.mp3' },
    { pattern: /đêm đẫm máu/i,                     file: 'night_bloody.mp3' },
    { pattern: /Cả làng thảo luận/,               file: 'begin_discuss.mp3' },
    { pattern: /Mời cả làng đề cử/,               file: 'begin_nominate.mp3' },
    { pattern: /Không ai bị đề cử/,               file: 'no_nominee.mp3' },
    { pattern: /Treo cổ hay Tha/,                  file: 'begin_vote.mp3' },
    { pattern: /sẽ rời khỏi ván đấu/,             file: 'hang_announce.mp3' },
    { pattern: /Làng đã tha/,                      file: 'spare_announce.mp3' },
    { pattern: /Phe Sói chiến thắng/,              file: 'wolf_wins.mp3' },
    { pattern: /Phe Dân chiến thắng/,              file: 'village_wins.mp3' },
    { pattern: /Chán Đời.*thắng/,                  file: 'tanner_wins.mp3' },
  ];

  function findAudioFile(text) {
    for (const { pattern, file } of AUDIO_MAP) {
      if (pattern.test(text)) return `/audio/${file}`;
    }
    return null;
  }

  function playMp3(src) {
    return new Promise((resolve) => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      const audio = new Audio(src);
      audio.volume = 0.92;
      currentAudioRef.current = audio;
      audio.onended = resolve;
      audio.onerror = resolve;
      audio.play().catch(resolve);
    });
  }

  function speakTTS(text, voice) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'vi-VN';
      utter.rate = 0.82;
      utter.pitch = 0.95;
      utter.volume = 0.9;
      if (voice) utter.voice = voice;
      utter.onend = resolve;
      utter.onerror = resolve;
      window.speechSynthesis.speak(utter);
    });
  }

  function pickBestViVoice() {
    const voices = window.speechSynthesis?.getVoices() || [];
    const vi = voices.filter(v => v.lang === 'vi-VN' || v.lang === 'vi');
    const preferred = [
      'Microsoft HoaiMy Online (Natural)',
      'Microsoft NamMinh Online (Natural)',
      'Microsoft HoaiMy', 'Microsoft NamMinh',
      'Google Tiếng Việt', 'Google Vietnamese',
    ];
    for (const name of preferred) {
      const found = vi.find(v => v.name.includes(name));
      if (found) return found;
    }
    return vi.find(v => v.name.toLowerCase().includes('online')) || vi[0] || null;
  }

  useEffect(() => {
    if (!mcVoiceEnabled) return;
    if (mcLog.length === 0) return;
    const newMessages = mcLog.slice(lastSpokenRef.current + 1).filter(m => m.type !== 'player');
    if (newMessages.length === 0) { lastSpokenRef.current = mcLog.length - 1; return; }

    async function playAll() {
      const voice = pickBestViVoice();
      for (const msg of newMessages) {
        const text = msg.text || msg;
        const audioSrc = findAudioFile(text);
        if (audioSrc) {
          await playMp3(audioSrc);
        } else {
          await speakTTS(text, voice);
        }
      }
    }

    if (!window.speechSynthesis || window.speechSynthesis.getVoices().length > 0) {
      playAll();
    } else {
      window.speechSynthesis.addEventListener('voiceschanged', playAll, { once: true });
    }

    lastSpokenRef.current = mcLog.length - 1;
  }, [mcLog, mcVoiceEnabled]);

  function copyRoomCode() {
    navigator.clipboard?.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2200);
  }

  function handleLeave() {
    socketRef.current.emit("room:leave");
    onLeave();
  }

  function handleRename() {
    setError("");
    socketRef.current.emit("room:rename", { newName: nameInput }, (res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditingName(false);
    });
  }

  function handleToggleReady() {
    setError("");
    socketRef.current.emit("room:toggleReady", {}, (res) => {
      if (res && !res.ok) {
        setError(res.error || "Không thể thay đổi trạng thái sẵn sàng.");
      }
    });
  }

  function handleRoleChange(roleKey, delta) {
    if (!me?.isHost) return;
    setError("");
    const currentCounts = room.rolesConfig || generateDefaultRoles(room.players.length);
    const current = Number(currentCounts[roleKey]) || 0;
    const minVal = roleKey === "wolf" ? 1 : 0;
    const nextVal = Math.max(minVal, current + delta);
    if (nextVal === current) return;

    const newConfig = { ...currentCounts, [roleKey]: nextVal };
    socketRef.current.emit("room:setRolesConfig", { rolesConfig: newConfig }, (res) => {
      if (res && !res.ok) setError(res.error || "Lỗi cập nhật vai trò.");
    });
  }

  function handlePresetRoles() {
    if (!me?.isHost) return;
    setError("");
    const preset = generateDefaultRoles(room.players.length);
    socketRef.current.emit("room:setRolesConfig", { rolesConfig: preset }, (res) => {
      if (res && !res.ok) setError(res.error || "Lỗi thiết lập preset.");
    });
  }

  function handleAutoFillVillagers() {
    if (!me?.isHost) return;
    setError("");
    const currentCounts = room.rolesConfig || generateDefaultRoles(room.players.length);
    const specialCount = Object.entries(currentCounts)
      .filter(([k]) => k !== "villager")
      .reduce((sum, [, count]) => sum + (Number(count) || 0), 0);

    const villagers = Math.max(0, room.players.length - specialCount);
    const newConfig = { ...currentCounts, villager: villagers };
    socketRef.current.emit("room:setRolesConfig", { rolesConfig: newConfig }, (res) => {
      if (res && !res.ok) setError(res.error || "Lỗi bù nông dân.");
    });
  }

  function handleSendChat(e) {
    e?.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    socketRef.current.emit("room:lobbyChat", { message: text }, (res) => {
      if (res?.ok) {
        setChatInput("");
      } else {
        setError(res?.error || "Không gửi được tin nhắn.");
      }
    });
  }

  function handleStartGame() {
    setError("");
    socketRef.current.emit("game:start", {}, (res) => {
      if (!res?.ok) {
        setError(res?.error || "Không thể bắt đầu game.");
      }
    });
  }

  if (!room) {
    return (
      <div className="card">
        <p className="status-text">Đang tải dữ liệu phòng...</p>
      </div>
    );
  }

  // Chuyển sang màn hình chơi game khi ván bắt đầu
  if (room.phase === "playing" || room.phase === "ended") {
    return (
      <PlayingView 
        room={room} 
        socketRef={socketRef} 
        mcLog={mcLog}
        mcVoiceEnabled={mcVoiceEnabled}
        setMcVoiceEnabled={setMcVoiceEnabled}
      />
    );
  }

  const me = room.players.find((p) => p.id === myId);
  const rolesConfig = room.rolesConfig || generateDefaultRoles(room.players.length);
  const totalRoles = Object.values(rolesConfig).reduce((s, v) => s + (Number(v) || 0), 0);

  // Điều kiện bắt đầu game
  const totalPlayers = room.players.length;
  const isMinPlayers = totalPlayers >= 6;
  const unreadyPlayers = room.players.filter((p) => !p.ready);
  const isAllReady = unreadyPlayers.length === 0;
  const isRolesMatched = totalRoles === totalPlayers;
  const hasWolf = (Number(rolesConfig.wolf) || 0) >= 1;
  const canStartGame = isMinPlayers && isAllReady && isRolesMatched && hasWolf;

  return (
    <div className="lobby-container">
      {/* --- TOP HEADER BAR --- */}
      <header className="lobby-header-bar">
        <div className="lobby-header-left">
          <div className="lobby-room-code-badge" onClick={copyRoomCode} title="Nhấn để copy mã phòng">
            <span className="code-text">{room.code}</span>
            <span className="copy-hint">{copiedCode ? "✅ Đã copy!" : "📋 Copy"}</span>
          </div>
        </div>

        <div className="lobby-header-center">
          <div className="lobby-stat-chip">
            👥 {totalPlayers}/18 người
          </div>
          <div className={`lobby-stat-chip ${isAllReady ? "ready-all" : ""}`}>
            🟢 {room.players.filter((p) => p.ready).length}/{totalPlayers} sẵn sàng
          </div>
          <div className={`lobby-stat-chip ${isRolesMatched ? "roles-matched" : "roles-mismatch"}`}>
            🎭 {totalRoles}/{totalPlayers} vai trò
          </div>
        </div>

        <div className="lobby-header-actions">
          <button className="btn-header-leave" onClick={handleLeave}>
            🚪 Rời phòng
          </button>
        </div>
      </header>

      {/* --- MOBILE NAVIGATION TABS (< 768px) --- */}
      <nav className="lobby-mobile-tabs">
        <button
          className={`btn-mobile-tab ${mobileTab === "players" ? "active" : ""}`}
          onClick={() => setMobileTab("players")}
        >
          👥 Người chơi ({totalPlayers})
        </button>
        <button
          className={`btn-mobile-tab ${mobileTab === "roles" ? "active" : ""}`}
          onClick={() => setMobileTab("roles")}
        >
          🎭 Vai trò ({totalRoles}/{totalPlayers})
        </button>
        <button
          className={`btn-mobile-tab ${mobileTab === "chat" ? "active" : ""}`}
          onClick={() => setMobileTab("chat")}
        >
          💬 Thảo luận {hasUnreadChat && <span className="tab-unread-dot" />}
        </button>
      </nav>

      {/* --- MAIN 3-COLUMN DASHBOARD (DESKTOP) / TABS (MOBILE) --- */}
      <main className="lobby-grid-layout">
        {/* ================= COLUMN 1: PLAYERS & READY STATUS ================= */}
        <section className={`lobby-panel ${mobileTab === "players" ? "active-mobile-tab" : ""}`}>
          <div className="lobby-panel-header">
            <h2>👥 Người chơi</h2>
            <span className="lobby-panel-badge">{totalPlayers}/18</span>
          </div>

          <div className="lobby-panel-body">
            <div className="lobby-players-list">
              {room.players.map((p) => {
                const isMe = p.id === myId;
                const isReady = Boolean(p.ready);
                return (
                  <div
                    key={p.id}
                    className={`lobby-player-item ${isMe ? "is-me" : ""} ${isReady ? "is-ready" : "not-ready"}`}
                  >
                    <div className={`lobby-player-avatar ${isReady ? "ready" : ""}`}>
                      <img src={p.avatar} alt={p.name} />
                    </div>

                    <div className="lobby-player-info">
                      <div className="lobby-player-name-row">
                        <span className="lobby-player-name">{p.name}</span>
                        {p.isHost && <span className="lobby-badge-host">Chủ phòng</span>}
                        {isMe && <span className="lobby-badge-you">Bạn</span>}
                      </div>
                      <span className={`lobby-player-status-tag ${isReady ? "ready" : "waiting"}`}>
                        {p.isHost ? "👑 Chủ phòng" : isReady ? "🟢 Đã sẵn sàng" : "⏳ Đang chờ..."}
                      </span>
                    </div>

                    {me?.isHost && !isMe && (
                      <button
                        className="btn-player-kick"
                        title={`Kick ${p.name} khỏi phòng`}
                        onClick={() => {
                          if (window.confirm(`Kick ${p.name} khỏi phòng?`)) {
                            socketRef.current.emit("room:kick", { targetId: p.id }, (res) => {
                              if (res && !res.ok) alert(res.error || "Không kick được.");
                            });
                          }
                        }}
                      >
                        Kick ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* My controls inside column 1 */}
            <div className="lobby-my-actions">
              {!me?.isHost && (
                <button
                  className={`btn-ready-toggle ${me?.ready ? "is-ready" : ""}`}
                  onClick={handleToggleReady}
                >
                  {me?.ready ? "✅ BẠN ĐÃ SẴN SÀNG (Bấm để hủy)" : "⚡ BẤM SẴN SÀNG"}
                </button>
              )}

              {!editingName ? (
                <button
                  className="btn-secondary"
                  style={{ width: "100%", margin: 0, padding: "8px" }}
                  onClick={() => {
                    setNameInput(me?.name || "");
                    setEditingName(true);
                  }}
                >
                  ✏️ Đổi tên hiển thị
                </button>
              ) : (
                <div className="rename-box">
                  <input
                    value={nameInput}
                    maxLength={20}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Tên mới..."
                  />
                  <button className="btn-primary" onClick={handleRename}>
                    Lưu
                  </button>
                  <button className="btn-secondary" onClick={() => setEditingName(false)}>
                    Hủy
                  </button>
                </div>
              )}

              <button
                className="btn-secondary"
                style={{ width: "100%", margin: 0, padding: "8px", opacity: 0.8 }}
                onClick={handleLeave}
              >
                🚪 Rời phòng
              </button>
            </div>
          </div>
        </section>

        {/* ================= COLUMN 2: ROLE DECK CONFIG ================= */}
        <section className={`lobby-panel ${mobileTab === "roles" ? "active-mobile-tab" : ""}`}>
          <div className="lobby-panel-header">
            <h2>🎭 Cấu hình vai trò</h2>
            <span
              className="lobby-panel-badge"
              style={{
                background: isRolesMatched ? "rgba(34, 197, 94, 0.25)" : "rgba(239, 68, 68, 0.25)",
                color: isRolesMatched ? "#86efac" : "#fca5a5",
                border: `1px solid ${isRolesMatched ? "#22c55e" : "#ef4444"}`,
              }}
            >
              {totalRoles} / {totalPlayers} vai
            </span>
          </div>

          <div className="lobby-panel-body">
            {me?.isHost ? (
              <div className="roles-preset-bar">
                <span>Thiết lập nhanh:</span>
                <div className="roles-preset-buttons">
                  <button
                    className="btn-preset-default"
                    onClick={handlePresetRoles}
                    title="Áp dụng cấu hình chuẩn cân bằng theo số người chơi"
                  >
                    ⚡ Gợi ý chuẩn ({totalPlayers}p)
                  </button>
                  <button
                    className="btn-preset-autofill"
                    onClick={handleAutoFillVillagers}
                    title="Tự động tính số Nông Dân bù đủ số lượng người chơi"
                  >
                    ⚖️ Bù Nông Dân
                  </button>
                </div>
              </div>
            ) : (
              <div className="roles-preset-bar">
                <span>🛡️ Chủ phòng đang điều chỉnh cấu hình vai trò</span>
              </div>
            )}

            {!isRolesMatched && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  fontSize: "0.82rem",
                  color: "#fca5a5",
                }}
              >
                ⚠️ Tổng số vai trò ({totalRoles}) chưa khớp với số người chơi ({totalPlayers}).{" "}
                {me?.isHost ? "Hãy bấm nút '+' hoặc '-' hoặc 'Bù Nông Dân' để cân bằng." : "Đang chờ chủ phòng chỉnh lại."}
              </div>
            )}

            <div className="roles-list-grid">
              {ORDERED_ROLES.map((roleKey) => {
                const conf = ROLES_CONFIG[roleKey] || {
                  label: roleKey,
                  emoji: "🎭",
                  team: "village",
                  description: "",
                };
                const count = Number(rolesConfig[roleKey]) || 0;
                const minVal = roleKey === "wolf" ? 1 : 0;

                return (
                  <div key={roleKey} className={`role-card-item ${count > 0 ? "active" : ""}`}>
                    <div className="role-info-left">
                      <div className="role-emoji-circle">{conf.emoji}</div>
                      <div className="role-details">
                        <div className="role-label-name">
                          <span>{conf.label}</span>
                          <span className={`role-team-pill ${conf.team}`}>
                            {conf.team === "wolf" ? "Phe Sói" : conf.team === "neutral" ? "Độc Lập" : "Phe Dân"}
                          </span>
                        </div>
                        <div className="role-desc-summary">{conf.description}</div>
                      </div>
                    </div>

                    {me?.isHost ? (
                      <div className="role-counter-control">
                        <button
                          className="btn-role-stepper"
                          onClick={() => handleRoleChange(roleKey, -1)}
                          disabled={count <= minVal}
                          title="Giảm số lượng"
                        >
                          -
                        </button>
                        <span className="role-count-display">{count}</span>
                        <button
                          className="btn-role-stepper"
                          onClick={() => handleRoleChange(roleKey, 1)}
                          disabled={count >= totalPlayers}
                          title="Tăng số lượng"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <div className="role-count-readonly">x{count}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ================= COLUMN 3: LOBBY CHAT ================= */}
        <section className={`lobby-panel ${mobileTab === "chat" ? "active-mobile-tab" : ""}`}>
          <div className="lobby-panel-header">
            <h2>💬 Bàn luận phòng chờ</h2>
            <span className="lobby-panel-badge">{lobbyMessages.length} tin</span>
          </div>

          <div className="lobby-panel-body">
            <div className="lobby-chat-messages">
              {lobbyMessages.length === 0 ? (
                <div style={{ textAlign: "center", color: "#64748b", margin: "auto", fontSize: "0.85rem" }}>
                  Chưa có tin nhắn nào. Hãy gửi lời chào và góp ý cấu hình ván đấu! 👋
                </div>
              ) : (
                lobbyMessages.map((msg) => {
                  const isMine = msg.senderId === myId;
                  return (
                    <div key={msg.id} className={`lobby-chat-msg ${isMine ? "mine" : ""}`}>
                      <img className="lobby-chat-avatar" src={msg.avatar} alt={msg.senderName} />
                      <div className="lobby-chat-bubble">
                        <div className="lobby-chat-header">
                          <span className="lobby-chat-sender">{isMine ? "Bạn" : msg.senderName}</span>
                          <span className="lobby-chat-time">{msg.time}</span>
                        </div>
                        <div className="lobby-chat-text">{msg.text}</div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            <form className="lobby-chat-form" onSubmit={handleSendChat}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Nhập tin nhắn..."
                maxLength={100}
              />
              <button type="submit">Gửi</button>
            </form>
          </div>
        </section>
      </main>

      {/* --- LAUNCH & STATUS DECK (HOST START & READINESS CHECKLIST) --- */}
      <footer className="lobby-launch-deck">
        <div className="lobby-checklist-box">
          <span className={`checklist-item ${isMinPlayers ? "valid" : "invalid"}`}>
            {isMinPlayers ? "✅" : "⚠️"} Tối thiểu 6 người ({totalPlayers}/6)
          </span>
          <span className={`checklist-item ${isAllReady ? "valid" : "invalid"}`}>
            {isAllReady ? "✅" : "⚠️"} Mọi người sẵn sàng ({room.players.filter((p) => p.ready).length}/{totalPlayers})
          </span>
          <span className={`checklist-item ${isRolesMatched && hasWolf ? "valid" : "invalid"}`}>
            {isRolesMatched && hasWolf ? "✅" : "⚠️"} Khớp vai trò ({totalRoles}/{totalPlayers} vai, ≥1 Sói)
          </span>
        </div>

        {error && (
          <div style={{ color: "#f87171", fontSize: "0.85rem", width: "100%", textAlign: "center" }}>
            {error}
          </div>
        )}

        {me?.isHost ? (
          <button
            className="btn-start-game-master"
            onClick={handleStartGame}
            disabled={!canStartGame}
            title={
              !isMinPlayers
                ? "Cần ít nhất 6 người chơi để bắt đầu"
                : !isAllReady
                ? `Còn ${unreadyPlayers.length} người chơi chưa sẵn sàng`
                : !isRolesMatched
                ? `Tổng số vai (${totalRoles}) chưa bằng số người chơi (${totalPlayers})`
                : !hasWolf
                ? "Cần ít nhất 1 Sói"
                : "Bấm để bắt đầu ván đấu ngay!"
            }
          >
            🚀 BẮT ĐẦU VÁN ĐẤU
          </button>
        ) : (
          <div className="lobby-mobile-dock-player">
            <button
              className={`btn-ready-toggle ${me?.ready ? "is-ready" : ""}`}
              onClick={handleToggleReady}
            >
              {me?.ready ? "✅ ĐÃ SẴN SÀNG" : "⚡ BẤM SẴN SÀNG"}
            </button>
            <button className="btn-header-leave" onClick={handleLeave}>
              🚪 Rời
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}