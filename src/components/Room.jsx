import { Suspense, lazy, useEffect, useRef, useState } from "react";
import PlayingView from "./PlayingView.jsx";
import Scene3DErrorBoundary from "../3d/components/Scene3DErrorBoundary.jsx";
import {
  PLAYABLE_ROLE_KEYS,
  ROLES_CONFIG,
  generateDefaultRoles,
  generateExpandedV33Roles,
} from "../config/roles.config.js";
import {
  DEFAULT_SCENE_PRESET_ID,
  loadScenePresetsIndex,
} from "../3d/editor/defaultVillageLayout.js";
import "./Room.css";

const WerewolfScene3D = lazy(() => import("../3d/scene/WerewolfScene3D.jsx"));

const ORDERED_ROLES = PLAYABLE_ROLE_KEYS;

export default function Room({ socketRef, roomCode, roomData, onLeave, onOpenArchitectStudio = null }) {
  const room = roomData;
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  // Drawer tabs bên phải Sảnh 3D: 'roles' | 'chat' + nút thu gọn để ngắm 3D 100% màn hình
  const [mobileTab, setMobileTab] = useState("roles");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [lobbyView3D, setLobbyView3D] = useState(() => (localStorage.getItem("ws_view_mode") || "3d") !== "2d");
  const [lobbyBubbleLog, setLobbyBubbleLog] = useState({});
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

  // Danh sách Bối cảnh 3D (Scene Presets) cho Chủ Phòng chọn ở sảnh chờ
  const [scenePresets, setScenePresets] = useState([]);
  const syncedDefaultPresetRef = useRef(false);

  const myId = sessionStorage.getItem("ws_playerId") || socketRef.current?.id;

  useEffect(() => {
    if (room?.phase && room.phase !== "lobby") return;
    let alive = true;
    loadScenePresetsIndex({ bustCache: true }).then((idx) => {
      if (!alive || !Array.isArray(idx?.presets)) return;
      setScenePresets(idx.presets);

      const meNow = room?.players?.find((p) => p.id === myId);
      if (
        !syncedDefaultPresetRef.current &&
        meNow?.isHost &&
        room?.phase === "lobby" &&
        (room?.players?.length || 0) <= 1 &&
        (!room?.scenePresetId || room.scenePresetId === DEFAULT_SCENE_PRESET_ID) &&
        idx.defaultPresetId &&
        idx.defaultPresetId !== DEFAULT_SCENE_PRESET_ID
      ) {
        syncedDefaultPresetRef.current = true;
        socketRef.current?.emit("room:setScenePreset", { presetId: idx.defaultPresetId });
      }
    });
    return () => {
      alive = false;
    };
  }, [room?.phase, myId]);

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
      if (msg?.senderId && msg?.text) {
        setLobbyBubbleLog((prev) => ({ ...prev, [msg.senderId]: msg.text }));
        setTimeout(() => {
          setLobbyBubbleLog((prev) => {
            if (prev[msg.senderId] !== msg.text) return prev;
            const next = { ...prev };
            delete next[msg.senderId];
            return next;
          });
        }, 4200);
      }
      if (!drawerOpen || mobileTab !== "chat") {
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

  // ============ AUDIO: MP3 pre-generated + VoiceStudio Hybrid TTS ============
  // Thứ tự ưu tiên: (1) MP3 file khớp pattern → (2) VoiceStudio local API → (3) speechSynthesis fallback
  const AUDIO_MAP = [
    { pattern: /Đêm đầu tiên buông xuống/,               file: 'game_start.mp3' },
    { pattern: /Bảo Vệ ơi.*thức dậy/,                   file: 'night_starts.mp3' },
    { pattern: /Bảo Vệ đã ngủ lại.*Sói ơi/,             file: 'wolf_wake.mp3' },
    { pattern: /Sói đã ngủ lại.*Phù Thủy/,               file: 'witch_wake.mp3' },
    { pattern: /Phù Thủy đã ngủ lại.*Tiên Tri/,         file: 'seer_wake.mp3' },
    { pattern: /Thần Tình Yêu ơi.*thức dậy/,            file: 'cupid_wake.mp3' },
    { pattern: /Thần Tình Yêu đã ngủ lại/,              file: 'cupid_sleep.mp3' },
    { pattern: /Đêm qua không ai chết/,                  file: 'no_death.mp3' },
    { pattern: /đêm đẫm máu/i,                           file: 'night_bloody.mp3' },
    { pattern: /Cả làng thảo luận/,                     file: 'begin_discuss.mp3' },
    { pattern: /Mời cả làng đề cử/,                     file: 'begin_nominate.mp3' },
    { pattern: /Không ai bị đề cử/,                     file: 'no_nominee.mp3' },
    { pattern: /Treo cổ hay Tha/,                        file: 'begin_vote.mp3' },
    { pattern: /sẽ rời khỏi ván đấu/,                   file: 'hang_announce.mp3' },
    { pattern: /Làng đã tha/,                            file: 'spare_announce.mp3' },
    { pattern: /Phe Sói chiến thắng/,                    file: 'wolf_wins.mp3' },
    { pattern: /Phe Dân chiến thắng/,                    file: 'village_wins.mp3' },
    { pattern: /Chán Đời.*thắng/,                        file: 'tanner_wins.mp3' },
    { pattern: /Cặp Đôi Định Mệnh.*chiến thắng/,        file: 'lovers_win.mp3' },
    // Recap
    { pattern: /những gì đã xảy ra trong đêm qua/,      file: 'recap_intro.mp3' },
    { pattern: /Bầy Sói đã bí mật lựa chọn/,           file: 'recap_wolf.mp3' },
    { pattern: /Bảo Vệ đã dũng cảm đứng canh/,         file: 'recap_guard.mp3' },
    { pattern: /bình cứu chữa để vực dậy/,              file: 'recap_witch_save.mp3' },
    { pattern: /rút bình độc.*gieo chết/,               file: 'recap_witch_poison.mp3' },
  ];

  // ── VoiceStudio Hybrid TTS ──────────────────────────────────────────────
  // Chỉ kích hoạt trực tiếp khi chạy local HTTP (tránh Mixed-Content CORS khi deploy HTTPS)
  // Trên production HTTPS → dùng /api/tts server proxy để không bị CORS
  // Override local: localStorage.setItem('mc_vs_url', 'https://your-vs-host')
  const VOICESTUDIO_URL = (() => {
    const override = localStorage.getItem('mc_vs_url');
    if (override) return override;
    // Chỉ gọi trực tiếp khi local HTTP — tránh CORS trên production HTTPS
    if (window.location.protocol === 'http:') return 'http://localhost:3900';
    return null; // Production HTTPS → dùng server proxy /api/tts
  })();

  // URL server Render để proxy TTS (giải quyết CORS cho production)
  const SERVER_TTS_URL = import.meta.env.PROD
    ? 'https://masoi-server-2eca.onrender.com/api/tts'
    : 'http://localhost:3001/api/tts';

  const vsProfileId = localStorage.getItem('mc_voice_profile_id') || null;

  // Kiểm tra VoiceStudio có sẵn không (cache 30s để không spam)
  const vsAvailableRef = useRef(null); // null = unknown, true/false
  const vsLastCheckRef = useRef(0);

  async function checkVoiceStudio() {
    // Không có URL (production HTTPS) → luôn trả false, không cần check
    if (!VOICESTUDIO_URL) return false;
    const now = Date.now();
    if (vsAvailableRef.current !== null && now - vsLastCheckRef.current < 30000) {
      return vsAvailableRef.current;
    }
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 2000);
      const resp = await fetch(`${VOICESTUDIO_URL}/health`, { signal: ctrl.signal });
      clearTimeout(tid);
      const data = await resp.json();
      vsAvailableRef.current = ['ok', 'ready', 'starting'].includes(data?.status);
    } catch {
      vsAvailableRef.current = false;
    }
    vsLastCheckRef.current = Date.now();
    return vsAvailableRef.current;
  }

  // Gọi VoiceStudio OpenAI-compat /v1/audio/speech → trả blob URL → play
  async function speakVoiceStudio(text) {
    if (!VOICESTUDIO_URL) return false; // production HTTPS → skip
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 25000); // timeout 25s
      const resp = await fetch(`${VOICESTUDIO_URL}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer local' },
        body: JSON.stringify({
          model: 'omnivoice',
          voice: vsProfileId || 'alloy',
          input: text,
          response_format: 'mp3',
          speed: 0.88,   // nhẹ chậm hơn, tone huyền bí
        }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (!resp.ok) return false;
      const blob = await resp.blob();
      if (blob.size < 500) return false;
      await playMp3(URL.createObjectURL(blob));
      return true;
    } catch {
      vsAvailableRef.current = false; // đánh dấu offline
      return false;
    }
  }

  // Gọi /api/tts trên server Render (HTTPS-safe, không bị CORS) → dùng cho production
  // Server Render forward sang VoiceStudio qua ngrok tunnel
  async function speakViaServerProxy(text) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 35000); // timeout 35s (server timeout 30s + buffer)
      const resp = await fetch(SERVER_TTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: vsProfileId, speed: 0.88 }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (!resp.ok) return false;
      const blob = await resp.blob();
      if (blob.size < 500) return false;
      await playMp3(URL.createObjectURL(blob));
      return true;
    } catch {
      return false;
    }
  }

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

  // Browser TTS fallback cuối cùng
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
      // Kiểm tra VoiceStudio 1 lần cho cả batch
      const vsOnline = await checkVoiceStudio();

      for (const msg of newMessages) {
        const text = msg.text || msg;

        // Ưu tiên 1: MP3 file pre-generated (0 latency, giọng clone hoàn hảo)
        const audioSrc = findAudioFile(text);
        if (audioSrc) {
          await playMp3(audioSrc);
          continue;
        }

        // Ưu tiên 2: Server proxy /api/tts → VoiceStudio qua ngrok (HTTPS-safe, giọng clone)
        // Dùng cho phrase động có tên người chơi trên production
        const proxyOk = await speakViaServerProxy(text);
        if (proxyOk) continue;

        // Ưu tiên 3: VoiceStudio local trực tiếp (local dev HTTP only)
        if (vsOnline) {
          const ok = await speakVoiceStudio(text);
          if (ok) continue;
        }

        // Ưu tiên 4: Browser speechSynthesis fallback (giọng hệ thống)
        await speakTTS(text, voice);
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
    const totalWolfNow =
      (Number(currentCounts.wolf) || 0) + (Number(currentCounts.alpha_wolf) || 0);
    const isWolfCard = roleKey === "wolf" || roleKey === "alpha_wolf";
    if (delta < 0 && isWolfCard && current <= 1 && totalWolfNow <= 1) {
      return; // Giữ tối thiểu 1 Sói hoặc 1 Sói Đầu Đàn
    }
    const nextVal = Math.max(0, current + delta);
    if (nextVal === current) return;

    const newConfig = { ...currentCounts, [roleKey]: nextVal };
    socketRef.current.emit("room:setRolesConfig", { rolesConfig: newConfig }, (res) => {
      if (res && !res.ok) setError(res.error || "Lỗi cập nhật vai trò.");
    });
  }

  function handlePresetRoles(mode = "v33") {
    if (!me?.isHost) return;
    setError("");
    const preset =
      mode === "classic"
        ? generateDefaultRoles(room.players.length)
        : generateExpandedV33Roles(room.players.length);
    socketRef.current.emit("room:setRolesConfig", { rolesConfig: preset }, (res) => {
      if (res && !res.ok) setError(res.error || "Lỗi thiết lập preset.");
    });
  }

  function handleKickPlayer(targetPlayer) {
    if (!me?.isHost || !targetPlayer || targetPlayer.id === myId) return;
    if (window.confirm(`Kick ${targetPlayer.name} khỏi phòng?`)) {
      socketRef.current.emit("room:kick", { targetId: targetPlayer.id }, (res) => {
        if (res && !res.ok) alert(res.error || "Không kick được.");
      });
    }
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

  function handleSelectScenePreset(presetId) {
    if (!me?.isHost || !presetId) return;
    setError("");
    socketRef.current.emit("room:setScenePreset", { presetId }, (res) => {
      if (res && !res.ok) {
        setError(res.error || "Không thể đổi bối cảnh không gian.");
      }
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

  const activeScenePresetId = room.scenePresetId || DEFAULT_SCENE_PRESET_ID;
  const effectivePresets =
    scenePresets.length > 0
      ? scenePresets
      : [
          {
            id: DEFAULT_SCENE_PRESET_ID,
            name: "🌲 Làng Bắc Âu V3 (Chuẩn 141 thực thể)",
            nodeCount: 141,
          },
        ];
  const activeSceneMeta =
    effectivePresets.find((p) => p.id === activeScenePresetId) || effectivePresets[0];

  // Điều kiện bắt đầu game (tính cả Sói thường lẫn Sói Đầu Đàn)
  const totalPlayers = room.players.length;
  const isMinPlayers = totalPlayers >= 6;
  const unreadyPlayers = room.players.filter((p) => !p.ready);
  const readyCount = room.players.filter((p) => p.ready).length;
  const isAllReady = unreadyPlayers.length === 0;
  const isRolesMatched = totalRoles === totalPlayers;
  const totalWolfTeam =
    (Number(rolesConfig.wolf) || 0) + (Number(rolesConfig.alpha_wolf) || 0);
  const hasWolf = totalWolfTeam >= 1;
  const canStartGame = isMinPlayers && isAllReady && isRolesMatched && hasWolf;
  const seatRingTarget = Math.min(18, Math.max(totalRoles || 6, totalPlayers, 6));

  return (
    <div className={`lobby-3d-shell ${lobbyView3D ? "mode-3d" : "mode-2d"}`}>
      {/* ==================== 1. SÂN KHẤU LÀNG 3D TỔNG QUAN (AI VÀO PHÒNG NGỒI GHẾ HÓA SÓI NGAY!) ==================== */}
      <div className="lobby-3d-stage-bg">
        {lobbyView3D ? (
          <Scene3DErrorBoundary
            onFallback2D={() => {
              setLobbyView3D(false);
              localStorage.setItem("ws_view_mode", "2d");
            }}
          >
            <Suspense
              fallback={
                <div className="lobby-3d-loading">
                  🐺 Đang dựng vòng ghế Sói 3D quanh lửa trại...
                </div>
              }
            >
              <WerewolfScene3D
                players={room.players}
                me={me}
                phase="lobby"
                isNight={true}
                myRole="wolf"
                hasWinner={false}
                lobbyTargetSeatCount={seatRingTarget}
                onLobbyKickPlayer={handleKickPlayer}
                wolfChatLog={lobbyBubbleLog}
                scenePresetId={activeScenePresetId}
              />
            </Suspense>
          </Scene3DErrorBoundary>
        ) : (
          <div className="lobby-2d-fallback-ring">
            <div className="lobby-2d-bonfire">🔥 Vòng Tròn Sảnh Chờ ({totalPlayers}/{seatRingTarget} ghế)</div>
            <div className="lobby-2d-seats">
              {Array.from({ length: seatRingTarget }, (_, idx) => {
                const p = room.players[idx];
                return (
                  <div key={p?.id || `empty-${idx}`} className={`lobby-2d-seat-card ${p ? "occupied" : "empty"}`}>
                    <div className="seat-wolf-icon">{p ? "🐺" : "🪑"}</div>
                    <div className="seat-wolf-name">{p ? p.name : `Ghế #${idx + 1}`}</div>
                    {p && (
                      <div className="seat-wolf-state">
                        {p.isHost ? "👑 Chủ phòng" : p.ready ? "🟢 Sẵn sàng" : "⏳ Chờ"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ==================== 2. THANH KÍNH MỜ TRÊN ĐỈNH (MÃ PHÒNG + CHỈ SỐ + NÚT THU GỌN BẢNG VAI) ==================== */}
      <header className="lobby-3d-topbar">
        <div className="lobby-header-left">
          <div className="lobby-room-code-badge" onClick={copyRoomCode} title="Nhấn để copy mã phòng mời bạn bè">
            <span className="code-text">{room.code}</span>
            <span className="copy-hint">{copiedCode ? "✅ Đã copy!" : "📋 Copy"}</span>
          </div>
          <span className="lobby-wolf-stage-hint">
            🐺 <strong>Sảnh Ghế Nóng:</strong> Vào ván mới bí mật phân vai!
          </span>
        </div>

        <div className="lobby-header-center">
          <div className="lobby-stat-chip">
            🐺 {totalPlayers}/{seatRingTarget} ghế
          </div>
          <div className={`lobby-stat-chip ${isAllReady ? "ready-all" : ""}`}>
            🟢 {readyCount}/{totalPlayers} sẵn sàng
          </div>
          <div className={`lobby-stat-chip ${isRolesMatched && hasWolf ? "roles-matched" : "roles-mismatch"}`}>
            🎭 {totalRoles}/{totalPlayers} vai
          </div>
        </div>

        <div className="lobby-header-actions">
          <button
            type="button"
            className="btn-lobby-pill"
            onClick={() => {
              const next = !lobbyView3D;
              setLobbyView3D(next);
              localStorage.setItem("ws_view_mode", next ? "3d" : "2d");
            }}
            title="Chuyển đổi Sảnh 3D hoặc Sảnh 2D siêu nhẹ"
          >
            {lobbyView3D ? "🎮 3D" : "⚡ 2D"}
          </button>

          <button
            type="button"
            className={`btn-lobby-pill ${drawerOpen ? "active" : ""}`}
            onClick={() => setDrawerOpen((v) => !v)}
            title="Thu gọn hoặc mở rộng Bảng Thumbnail Vai Trò & Chat để ngắm toàn cảnh 3D"
          >
            {drawerOpen ? "👁️ Ngắm 3D" : `🎭 Bảng Vai (${totalRoles}/${totalPlayers})`}
            {!drawerOpen && hasUnreadChat && <span className="tab-unread-dot" />}
          </button>

          {onOpenArchitectStudio && (
            <button
              type="button"
              className="btn-lobby-architect"
              onClick={onOpenArchitectStudio}
              title="Mở Studio Cảnh Quan D5 độc lập toàn màn hình"
            >
              🏗️ Studio D5
            </button>
          )}

          <button className="btn-header-leave" onClick={handleLeave}>
            🚪 Rời
          </button>
        </div>
      </header>

      {/* ==================== 3. NGĂN KÍNH MỜ BÊN PHẢI: THUMBNAIL 12 VAI ĐỒNG BỘ + CHAT ==================== */}
      {drawerOpen && (
        <aside className="lobby-3d-drawer">
          <div className="lobby-drawer-tabs">
            <button
              type="button"
              className={`lobby-drawer-tab ${mobileTab === "roles" ? "active" : ""}`}
              onClick={() => setMobileTab("roles")}
            >
              🎭 Bộ Bài Thumbnail ({totalRoles}/{totalPlayers})
            </button>
            <button
              type="button"
              className={`lobby-drawer-tab ${mobileTab === "chat" ? "active" : ""}`}
              onClick={() => {
                setMobileTab("chat");
                setHasUnreadChat(false);
              }}
            >
              💬 Bàn Luận & Ghế ({lobbyMessages.length})
              {hasUnreadChat && <span className="tab-unread-dot" />}
            </button>
          </div>

          {mobileTab === "roles" ? (
            <div className="lobby-drawer-content">
              {/* Bộ chọn Bối cảnh 3D cập nhật trực tiếp ngôi làng dưới nền */}
              <div className="lobby-scene-bar">
                <span className="scene-bar-label">🗺️ Bối cảnh 3D:</span>
                {me?.isHost ? (
                  <select
                    className="scene-bar-select"
                    value={activeScenePresetId}
                    onChange={(e) => handleSelectScenePreset(e.target.value)}
                  >
                    {effectivePresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.nodeCount ?? 0} vật thể)
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="scene-bar-readonly">
                    {activeSceneMeta?.name || "🌲 Làng Bắc Âu V3"}
                  </span>
                )}
              </div>

              {/* Thanh Thiết Lập Nhanh 1-Click cho Chủ Phòng / Chú thích đồng bộ cho Khách */}
              {me?.isHost ? (
                <div className="roles-preset-bar compact">
                  <div className="roles-preset-buttons">
                    <button
                      type="button"
                      className="btn-preset-v33"
                      onClick={() => handlePresetRoles("v33")}
                      title="Bật ngay Thợ Săn · Thần Tình Yêu · Sói Đầu Đàn · Trưởng Làng cân bằng theo số người chơi!"
                    >
                      🔥 Mở Rộng V3.3 ({Math.max(6, totalPlayers)}p)
                    </button>
                    <button
                      type="button"
                      className="btn-preset-default"
                      onClick={() => handlePresetRoles("classic")}
                      title="Áp dụng bộ 8 vai cổ điển"
                    >
                      ⚖️ Cổ Điển
                    </button>
                    <button
                      type="button"
                      className="btn-preset-autofill"
                      onClick={handleAutoFillVillagers}
                      title="Tự động bù Nông Dân cho khớp tổng số người trong phòng"
                    >
                      ➕ Bù Dân
                    </button>
                  </div>
                </div>
              ) : (
                <div className="guest-sync-banner">
                  👀 Bảng bài trực tiếp từ Chủ phòng — các thẻ phát sáng là vai có mặt trong ván!
                </div>
              )}

              {!isRolesMatched && (
                <div className="roles-mismatch-alert">
                  ⚠️ Đang chọn <strong>{totalRoles}</strong> vai cho <strong>{totalPlayers}</strong> người chơi.{" "}
                  {me?.isHost ? "Bấm '+ / -', 'Mở Rộng V3.3' hoặc 'Bù Dân' để cân bằng." : "Chờ chủ phòng cân chỉnh."}
                </div>
              )}

              {/* LƯỚI 12 THẺ THUMBNAIL CHỨC NĂNG & SỐ LƯỢNG ĐỒNG BỘ CHO CẢ PHÒNG */}
              <div className="roles-thumb-grid">
                {ORDERED_ROLES.map((roleKey) => {
                  const conf = ROLES_CONFIG[roleKey] || {
                    label: roleKey,
                    emoji: "🎭",
                    color: "#94a3b8",
                    thumbGradient: "linear-gradient(145deg, #1e293b, #334155)",
                    shortSkill: "",
                    team: "village",
                    description: "",
                  };
                  const count = Number(rolesConfig[roleKey]) || 0;
                  const isWolfCard = roleKey === "wolf" || roleKey === "alpha_wolf";
                  const disableMinus =
                    count <= 0 || (isWolfCard && count === 1 && totalWolfTeam <= 1);
                  const teamText =
                    conf.team === "wolf" ? "Phe Sói" : conf.team === "neutral" ? "Độc Lập" : "Phe Dân";

                  return (
                    <div
                      key={roleKey}
                      className={`role-thumb-card ${count > 0 ? "active-thumb" : "zero-thumb"}`}
                      style={{ "--role-accent": conf.color || "#fbbf24" }}
                      title={`${conf.label} (${teamText}): ${conf.description}`}
                    >
                      {/* Khung ảnh Thumbnail nghệ thuật + Huy hiệu Phe + Huy hiệu Số lượng to rõ */}
                      <div
                        className="role-thumb-art"
                        style={{ background: conf.thumbGradient || "linear-gradient(145deg, #1e293b, #334155)" }}
                      >
                        <span className={`role-thumb-team ${conf.team}`}>{teamText}</span>
                        <span className={`role-thumb-qty-badge ${count > 0 ? "has-qty" : ""}`}>
                          x{count}
                        </span>
                        <div className="role-thumb-emblem">{conf.emoji}</div>
                      </div>

                      {/* Tên vai + Tag chức năng 1 dòng */}
                      <div className="role-thumb-meta">
                        <div className="role-thumb-title">{conf.label}</div>
                        <div className="role-thumb-skill">{conf.shortSkill || conf.description}</div>
                      </div>

                      {/* Bộ đếm trực tiếp cho Chủ phòng / Nhãn đồng bộ cho Khách */}
                      {me?.isHost ? (
                        <div className="role-thumb-stepper">
                          <button
                            type="button"
                            className="btn-thumb-step"
                            onClick={() => handleRoleChange(roleKey, -1)}
                            disabled={disableMinus}
                            title="Giảm số lượng"
                          >
                            −
                          </button>
                          <span className="thumb-step-val">{count}</span>
                          <button
                            type="button"
                            className="btn-thumb-step"
                            onClick={() => handleRoleChange(roleKey, 1)}
                            disabled={count >= Math.max(totalPlayers, 18)}
                            title="Tăng số lượng"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <div className={`role-thumb-guest-footer ${count > 0 ? "in-play" : ""}`}>
                          {count > 0 ? `Có ${count} vai trong ván` : "Không dùng"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* TAB 2: DANH SÁCH GHẾ GỌN + ĐỔI TÊN + CHAT BONG BÓNG 3D */
            <div className="lobby-drawer-content chat-mode">
              <div className="lobby-seat-strip">
                <div className="seat-strip-header">
                  <span>👥 Ghế trong vòng tròn ({totalPlayers}/18)</span>
                  {!editingName ? (
                    <button
                      type="button"
                      className="btn-mini-rename"
                      onClick={() => {
                        setNameInput(me?.name || "");
                        setEditingName(true);
                      }}
                    >
                      ✏️ Đổi tên tôi
                    </button>
                  ) : null}
                </div>

                {editingName && (
                  <div className="rename-box" style={{ marginBottom: 8 }}>
                    <input
                      value={nameInput}
                      maxLength={20}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Tên hiển thị mới..."
                    />
                    <button className="btn-primary" onClick={handleRename}>
                      Lưu
                    </button>
                    <button className="btn-secondary" onClick={() => setEditingName(false)}>
                      Hủy
                    </button>
                  </div>
                )}

                <div className="seat-chips-wrap">
                  {room.players.map((p, idx) => {
                    const isMeChip = p.id === myId;
                    return (
                      <div
                        key={p.id}
                        className={`seat-mini-chip ${p.ready ? "ready" : "waiting"} ${isMeChip ? "mine" : ""}`}
                      >
                        <span>{p.isHost ? "👑" : p.ready ? "🟢" : "⏳"}</span>
                        <span className="chip-name">
                          #{idx + 1} {p.name}
                        </span>
                        {me?.isHost && !isMeChip && (
                          <button
                            type="button"
                            className="chip-kick-btn"
                            onClick={() => handleKickPlayer(p)}
                            title={`Kick ${p.name}`}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lobby-chat-messages">
                {lobbyMessages.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#94a3b8", margin: "auto", fontSize: "0.82rem" }}>
                    💬 Nhắn tin tại đây sẽ hiện bong bóng thoại ngay trên đầu Sói 3D của bạn quanh lửa trại!
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
                  placeholder="Nhắn tin lên đầu Sói 3D..."
                  maxLength={100}
                />
                <button type="submit">Gửi</button>
              </form>
            </div>
          )}
        </aside>
      )}

      {/* ==================== 4. THANH KHỞI HÀNH / SẴN SÀNG NỔI DƯỚI ĐÁY SÂN KHẤU 3D ==================== */}
      <footer className={`lobby-3d-launch-dock ${drawerOpen ? "with-drawer" : "full-stage"}`}>
        <div className="lobby-checklist-box compact">
          <span className={`checklist-item ${isMinPlayers ? "valid" : "invalid"}`}>
            {isMinPlayers ? "✅" : "⚠️"} ≥6 người ({totalPlayers}/6)
          </span>
          <span className={`checklist-item ${isAllReady ? "valid" : "invalid"}`}>
            {isAllReady ? "✅" : "⚠️"} Sẵn sàng ({readyCount}/{totalPlayers})
          </span>
          <span className={`checklist-item ${isRolesMatched && hasWolf ? "valid" : "invalid"}`}>
            {isRolesMatched && hasWolf ? "✅" : "⚠️"} Khớp {totalRoles}/{totalPlayers} vai (≥1 Sói)
          </span>
        </div>

        {error && (
          <div className="lobby-dock-error">
            ⚠️ {error}
          </div>
        )}

        {me?.isHost ? (
          <button
            className="btn-start-game-master"
            onClick={handleStartGame}
            disabled={!canStartGame}
            title={
              !isMinPlayers
                ? "Cần ít nhất 6 người chơi để bắt đầu (bạn có thể bấm +5 Bot ở góc trái nếu đang test)"
                : !isAllReady
                  ? `Còn ${unreadyPlayers.length} người chơi chưa sẵn sàng`
                  : !isRolesMatched
                    ? `Tổng số vai (${totalRoles}) chưa bằng số người chơi (${totalPlayers})`
                    : !hasWolf
                      ? "Cần ít nhất 1 Sói hoặc 1 Sói Đầu Đàn"
                      : "Bấm để phân vai bí mật và bắt đầu Đêm đầu tiên!"
            }
          >
            🚀 PHÂN VAI & BẮT ĐẦU VÁN ĐẤU
          </button>
        ) : (
          <button
            className={`btn-ready-toggle ${me?.ready ? "is-ready" : ""}`}
            onClick={handleToggleReady}
            style={{ maxWidth: 320 }}
          >
            {me?.ready ? "✅ BẠN ĐÃ SẴN SÀNG (Bấm để hủy)" : "⚡ BẤM SẴN SÀNG"}
          </button>
        )}
      </footer>
    </div>
  );
}
