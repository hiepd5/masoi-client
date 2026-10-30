import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import PlayingView from "./PlayingView.jsx";
import VoiceRoom, { VoiceSessionProvider, VoiceQuickMicPill } from "./VoiceRoom.jsx";
import RolePortrait from "./RolePortrait.jsx";
import CitizenAvatarVaultModal from "./CitizenAvatarVaultModal.jsx";
import Scene3DErrorBoundary from "../3d/components/Scene3DErrorBoundary.jsx";
import {
  getCitizenAvatarMeta,
  getStoredCitizenModelId,
  loadCitizenAvatarCatalog,
  saveStoredCitizenModelId,
  subscribeCitizenAvatarCatalog,
} from "../config/citizenAvatars.config.js";
import {
  PLAYABLE_ROLE_KEYS,
  ROLES_CONFIG,
  ROLE_PORTRAIT_CARDS,
  generateDefaultRoles,
  generateExpandedV33Roles,
} from "../config/roles.config.js";
import {
  DEFAULT_SCENE_PRESET_ID,
  loadScenePresetsIndex,
} from "../3d/editor/defaultVillageLayout.js";
import { getTtsCacheKey, normalizeTtsText } from "../utils/ttsTextUtils.js";
import { unlockCinemaAudioEngine } from "../utils/cinemaVideoRecorder.js";
import { getSession } from "../hooks/useSocket.js";
import { getApiBaseUrl, isNativeCapacitor } from "../config/runtimeEnv.js";
import {
  UNIVERSE_IDS,
  UNIVERSE_THEMES,
  sanitizeUniverseId,
  getUniverseTheme,
  getUniverseRoleMeta,
} from "../config/universeThemes.config.js";
import StealthCamouflageOverlay, { BossKeyTriggerButton } from "./StealthCamouflageOverlay.jsx";
import { SFX } from "./SFX.js";
import "./Room.css";

const WerewolfScene3D = lazy(() => import("../3d/scene/WerewolfScene3D.jsx"));

const ORDERED_ROLES = PLAYABLE_ROLE_KEYS;

export default function Room({ socketRef, roomCode, roomData, onLeave, onOpenArchitectStudio = null }) {
  const room = roomData;
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showPwdEditor, setShowPwdEditor] = useState(false);
  const [pwdDraft, setPwdDraft] = useState("");
  const [showAvatarVault, setShowAvatarVault] = useState(false);
  const [, setAvatarCatalogTick] = useState(0);

  useEffect(() => {
    const unsub = subscribeCitizenAvatarCatalog(() => setAvatarCatalogTick((t) => t + 1));
    loadCitizenAvatarCatalog();
    return unsub;
  }, []);

  // Drawer tabs bên phải Sảnh 3D: 'roles' | 'chat' + nút thu gọn để ngắm 3D 100% màn hình
  const [mobileTab, setMobileTab] = useState("roles");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const roomSettingsRef = useRef(null);
  const [lobbyView3D, setLobbyView3D] = useState(() => (localStorage.getItem("ws_view_mode") || "3d") !== "2d");
  const [lobbyBubbleLog, setLobbyBubbleLog] = useState({});
  const [hasUnreadChat, setHasUnreadChat] = useState(false);

  useEffect(() => {
    if (!showRoomSettings) return undefined;
    const onPointerDownOutside = (e) => {
      if (roomSettingsRef.current && !roomSettingsRef.current.contains(e.target)) {
        setShowRoomSettings(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDownOutside);
    return () => document.removeEventListener("pointerdown", onPointerDownOutside);
  }, [showRoomSettings]);

  // Lobby chat
  const [chatInput, setChatInput] = useState("");
  const [lobbyMessages, setLobbyMessages] = useState(room?.lobbyMessages || []);
  const chatEndRef = useRef(null);

  // MC audio / Voice + Auto-Ducking (-40%) cho kênh đàm thoại người chơi & Giọng AI Bot thu sẵn
  const universeId = sanitizeUniverseId(room?.universeId);
  const uTheme = getUniverseTheme(universeId);
  const headphoneUnlockedRef = useRef(false);

  const [mcLog, setMcLog] = useState([]);
  const [mcVoiceEnabled, setMcVoiceEnabled] = useState(
    () => !getUniverseTheme(room?.universeId).silentByDefault
  );
  const [botVoiceEnabled, setBotVoiceEnabled] = useState(() => {
    if (getUniverseTheme(room?.universeId).silentByDefault) return false;
    return localStorage.getItem("ws_bot_voice") !== "0";
  });

  // Đồng bộ cờ tắt tiếng & chủ đề âm hiệu SFX theo Vũ trụ hiện tại
  useEffect(() => {
    SFX.setMuted(!mcVoiceEnabled);
    SFX.setUniverse(universeId);
  }, [mcVoiceEnabled, universeId]);

  // Luật 0dB Mặc Định khi vào Vũ Trụ có cấu hình silentByDefault
  useEffect(() => {
    if (uTheme.silentByDefault && !headphoneUnlockedRef.current) {
      setMcVoiceEnabled(false);
      setBotVoiceEnabled(false);
    }
  }, [universeId, uTheme.silentByDefault]);

  const handleToggleStealthHeadphones = useCallback(() => {
    setMcVoiceEnabled((prev) => {
      const next = !prev;
      headphoneUnlockedRef.current = next;
      setBotVoiceEnabled(next);
      return next;
    });
  }, []);

  const handleSetRoomUniverse = useCallback(
    (nextUId) => {
      const clean = sanitizeUniverseId(nextUId);
      if (clean === universeId) return;
      socketRef.current?.emit("room:setUniverse", { universeId: clean }, (res) => {
        if (res?.error) setError(res.error);
      });
    },
    [socketRef, universeId]
  );
  const [isMcSpeakingNow, setIsMcSpeakingNow] = useState(false);
  const [speakingIds, setSpeakingIds] = useState([]);
  const lastSpokenRef = useRef(-1);
  const mcPlayQueueRef = useRef([]);
  const mcWorkerRunningRef = useRef(false);
  const currentAudioRef = useRef(null);
  const currentAudioMetaRef = useRef(null);
  const currentPhaseRef = useRef(room?.game?.nightDayPhase || room?.phase || "lobby");

  const hasBotsInRoom = Boolean((room?.players || []).some((p) => p.isBot));
  const effectiveMcPacingMode =
    room?.game?.mcPacingMode ||
    room?.mcPacingMode ||
    (hasBotsInRoom && !room?.isTurbo ? "full" : "fast");
  const mcPacingModeRef = useRef(effectiveMcPacingMode);
  mcPacingModeRef.current = effectiveMcPacingMode;

  const handleToggleBotVoice = useCallback(() => {
    setBotVoiceEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("ws_bot_voice", next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);

  const handleToggleMcPacing = useCallback(() => {
    const nextMode = mcPacingModeRef.current === "full" ? "fast" : "full";
    if (nextMode === "fast") {
      mcPlayQueueRef.current = mcPlayQueueRef.current.filter((m) => m?.isImportant);
    }
    socketRef.current?.emit("room:setMcPacing", { mode: nextMode });
  }, [socketRef]);

  const handleVoiceSpeakingChange = useCallback((nextIds) => {
    setSpeakingIds((prev) => {
      if (prev.length === nextIds.length && prev.every((id, idx) => id === nextIds[idx])) {
        return prev;
      }
      return nextIds;
    });
  }, []);

  useEffect(() => {
    currentPhaseRef.current = room?.game?.nightDayPhase || room?.phase || "lobby";
  }, [room?.game?.nightDayPhase, room?.phase]);

  // Pre-gen voice cache: Map<normalizedKey, blobURL>
  const voiceCacheRef = useRef(new Map());
  const pregenInProgressRef = useRef(false);
  const [voicePregening, setVoicePregening] = useState(false);
  const [voicePregenProgress, setVoicePregenProgress] = useState({ done: 0, total: 0 });
  const [vsServerOffline, setVsServerOffline] = useState(false);
  const [vsStatusReady, setVsStatusReady] = useState(false);
  const [vsStatusChecking, setVsStatusChecking] = useState(false);
  const [voiceRecheckTick, setVoiceRecheckTick] = useState(0);

  // Danh sách Bối cảnh 3D (Scene Presets) cho Chủ Phòng chọn ở sảnh chờ
  const [scenePresets, setScenePresets] = useState([]);
  const syncedDefaultPresetRef = useRef(false);

  // Rạp Chiếu Cá Nhân Không Bị Ngắt Ngang (Personal Non-Disruptive Cinema):
  // Giữ bản chụp trận vừa kết thúc cho từng máy cá nhân để ai chưa xem hết câu chuyện vẫn thưởng thức trọn vẹn,
  // còn ai bấm Về Sảnh Chờ sẽ vào thẳng Sảnh 3D ngay (0ms) mà không đá người khác ra giữa chừng!
  const [frozenRecapSnapshot, setFrozenRecapSnapshot] = useState(null);
  const [dismissedRecapKey, setDismissedRecapKey] = useState(null);

  const myId = sessionStorage.getItem("ws_playerId") || socketRef.current?.id;
  const me = room?.isSpectator
    ? null
    : room?.players?.find((p) => p.id === myId) ||
      room?.players?.find((p) => p.sessionToken) ||
      null;

  const liveEndedKey =
    room?.phase === "ended" && room?.game?.winner && Array.isArray(room?.game?.history)
      ? `${room.code}_${room.game.gameStartedAt || "ended"}`
      : null;

  useEffect(() => {
    if (liveEndedKey && room) {
      setFrozenRecapSnapshot({ key: liveEndedKey, room });
      return;
    }
    if (room?.phase === "playing" && !room?.game?.winner) {
      setFrozenRecapSnapshot(null);
      setDismissedRecapKey(null);
    }
  }, [liveEndedKey, room]);

  const activeRecapKey = liveEndedKey || frozenRecapSnapshot?.key || null;
  const isWatchingPersonalRecap = Boolean(
    activeRecapKey &&
      dismissedRecapKey !== activeRecapKey &&
      room?.phase !== "playing" &&
      (room?.phase === "ended" || frozenRecapSnapshot?.room)
  );

  useEffect(() => {
    if (room?.phase && room.phase !== "lobby") return;
    let alive = true;
    loadScenePresetsIndex({ bustCache: true }).then((idx) => {
      if (!alive || !Array.isArray(idx?.presets)) return;
      setScenePresets(idx.presets);

      const meNow = room?.players?.find((p) => p.id === myId);
      if (
        !syncedDefaultPresetRef.current &&
        sanitizeUniverseId(room?.universeId) === "classic" &&
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
      const isImportant =
        type !== "mc" ||
        /chiến thắng|rời khỏi ván đấu|ĐOÀNG|Quyền Trượng|Tơ hồng|Hơi thở cuối/i.test(msg);
      setMcLog((prev) => [
        ...prev,
        {
          text: msg,
          type,
          phaseTag: currentPhaseRef.current,
          isImportant,
        },
      ]);
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
    { pattern: /lá bài định mệnh|bí mật xem thân phận/,  file: 'role_reveal_intro.mp3' },
    { pattern: /Thần Tình Yêu ơi.*thức dậy/,            file: 'cupid_wake.mp3' },
    { pattern: /Thần Tình Yêu đã ngủ lại.*Bảo Vệ/,      file: 'guard_wake.mp3' },
    { pattern: /Thần Tình Yêu đã ngủ lại/,              file: 'cupid_sleep.mp3' },
    { pattern: /Đêm đầu tiên buông xuống/,               file: 'game_start.mp3' },
    { pattern: /Bảo Vệ ơi, hãy thức dậy/,                file: 'guard_wake.mp3' },
    { pattern: /Bảo Vệ ơi.*thức dậy/,                   file: 'night_starts.mp3' },
    { pattern: /Bảo Vệ đã ngủ lại.*Sói ơi/,             file: 'wolf_wake.mp3' },
    { pattern: /Phù Thủy ơi.*không ai bị cắn/,          file: 'witch_wake_nodeath.mp3' },
    { pattern: /Sói đã ngủ lại.*Phù Thủy/,               file: 'witch_wake.mp3' },
    { pattern: /Phù Thủy đã ngủ lại.*Tiên Tri/,         file: 'seer_wake.mp3' },
    { pattern: /Thợ Săn.*hơi thở cuối|bắn.*đạn bạc trả thù/, file: 'hunter_revenge.mp3' },
    { pattern: /giơ cao Quyền Trượng Vàng|công bố thân phận Trưởng Làng/, file: 'mayor_reveal.mp3' },
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
    // Chỉ gọi trực tiếp khi chạy Web Dev HTTP trên PC — tránh CORS trên HTTPS hoặc App Capacitor Native
    if (!isNativeCapacitor() && window.location.protocol === 'http:') return 'http://localhost:3900';
    return null; // Production HTTPS / Capacitor App → dùng server proxy /api/tts
  })();

  // URL server Render / Local để proxy TTS & kiểm tra trạng thái sống thật (tương thích 100% Web + CapacitorJS)
  const SERVER_BASE_URL = getApiBaseUrl();
  const SERVER_TTS_URL = `${SERVER_BASE_URL}/api/tts`;
  const SERVER_TTS_STATUS_URL = `${SERVER_BASE_URL}/api/tts-status`;

  const vsProfileId = localStorage.getItem('mc_voice_profile_id') || 'b5d182f3';

  // Kiểm tra VoiceStudio có sẵn không (cache 30s để không spam; Circuit Breaker cho Render Proxy)
  const vsAvailableRef = useRef(null); // null = unknown, true/false
  const vsLastCheckRef = useRef(0);
  const proxyCooldownUntilRef = useRef(0);

  const probeVoiceServerStatus = useCallback(async ({ force = false } = {}) => {
    if (force) setVsStatusChecking(true);
    let isOnline = false;
    try {
      if (VOICESTUDIO_URL) {
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 3200);
          const resp = await fetch(`${VOICESTUDIO_URL}/health`, { signal: ctrl.signal });
          clearTimeout(tid);
          if (resp.ok) {
            const d = await resp.json();
            isOnline = ['ok', 'ready', 'starting'].includes(d?.status);
          }
          vsAvailableRef.current = isOnline;
          vsLastCheckRef.current = Date.now();
        } catch {
          vsAvailableRef.current = false;
        }
      }
      if (!isOnline) {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 12000);
        const resp = await fetch(
          `${SERVER_TTS_STATUS_URL}${force ? '?force=1' : ''}`,
          { signal: ctrl.signal, cache: 'no-store' }
        );
        clearTimeout(tid);
        if (resp.ok) {
          let d = await resp.json();
          if (d?.vsOnline === null) {
            const resp2 = await fetch(`${SERVER_TTS_STATUS_URL}?force=1`, { cache: 'no-store' });
            if (resp2.ok) d = await resp2.json();
          }
          isOnline = d?.vsOnline === true;
        }
      }
      if (isOnline) {
        proxyCooldownUntilRef.current = 0;
        setVsStatusReady(true);
        setVsServerOffline((prevOffline) => {
          if (prevOffline) setVoiceRecheckTick((t) => t + 1);
          return false;
        });
        if (force) setVoiceRecheckTick((t) => t + 1);
      } else {
        setVsStatusReady(false);
        setVsServerOffline(true);
      }
    } catch {
      setVsStatusReady(false);
      setVsServerOffline(true);
    } finally {
      if (force) setVsStatusChecking(false);
    }
    return isOnline;
  }, [VOICESTUDIO_URL, SERVER_TTS_STATUS_URL]);

  // Adaptive Polling: 15s khi đang Offline để tự xanh lại ngay khi bật máy; 45s khi đang Online
  useEffect(() => {
    if (!mcVoiceEnabled) return undefined;
    probeVoiceServerStatus({ force: false });
    const intervalMs = vsServerOffline ? 15000 : 45000;
    const timer = setInterval(() => {
      probeVoiceServerStatus({ force: vsServerOffline });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [mcVoiceEnabled, vsServerOffline, probeVoiceServerStatus]);

  const handleManualRecheckVoice = useCallback(() => {
    probeVoiceServerStatus({ force: true });
  }, [probeVoiceServerStatus]);

  function setCachedVoiceBlobUrl(rawText, blob) {
    const key = getTtsCacheKey(rawText);
    if (!key || !blob || blob.size < 500) return null;
    const prevUrl = voiceCacheRef.current.get(key);
    if (prevUrl) return prevUrl;
    const url = URL.createObjectURL(blob);
    voiceCacheRef.current.set(key, url);
    return url;
  }

  // Mở khóa sớm WebAudio ngay từ cú click đầu tiên ở Sảnh Chờ / Vào Bàn để Phim Kể Chuyện cuối game phát tiếng tức thì 100%!
  useEffect(() => {
    const unlockOnce = () => {
      unlockCinemaAudioEngine();
    };
    window.addEventListener("pointerdown", unlockOnce, { passive: true });
    window.addEventListener("touchstart", unlockOnce, { passive: true });
    window.addEventListener("keydown", unlockOnce);
    return () => {
      window.removeEventListener("pointerdown", unlockOnce);
      window.removeEventListener("touchstart", unlockOnce);
      window.removeEventListener("keydown", unlockOnce);
    };
  }, []);

  // Zero-Waste: Cắt bỏ hoàn toàn 48 câu tạo sẵn giả định ở giây 0 để dành 100% GPU RTX 3090 cho Phim Kể Chuyện cuối game!
  // Giải phóng Blob URL cũ khi quay lại Sảnh Chờ; tự động ngắt tiếng thông báo cũ của Room khi chuyển sang màn Kết Game (EndGameRecap)
  useEffect(() => {
    if (!room?.phase || room.phase === 'lobby') {
      if (voiceCacheRef.current.size > 0) {
        for (const blobUrl of voiceCacheRef.current.values()) {
          try { URL.revokeObjectURL(blobUrl); } catch {}
        }
        voiceCacheRef.current.clear();
      }
      setVoicePregening(false);
      setVoicePregenProgress({ done: 0, total: 0 });
      return undefined;
    }

    if (room.phase === 'ended' || Boolean(room?.game?.winner)) {
      if (currentAudioRef.current) {
        try {
          currentAudioRef.current.pause();
        } catch {}
        currentAudioRef.current = null;
      }
      setIsMcSpeakingNow(false);
      setVoicePregening(false);
    }
    return undefined;
  }, [room?.phase, room?.game?.winner]);

  async function checkVoiceStudio() {
    // Không có URL trực tiếp (production HTTPS) → trả false để dùng server proxy
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

  // Gọi VoiceStudio OpenAI-compat /v1/audio/speech → lưu Cache RAM → play
  async function speakVoiceStudio(text, meta = null) {
    if (!VOICESTUDIO_URL) return false; // production HTTPS → skip
    const cached = voiceCacheRef.current.get(getTtsCacheKey(text));
    if (cached) return await playMp3(cached, { meta });
    const cleanInput = normalizeTtsText(text);
    if (!cleanInput) return false;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 14000);
      const resp = await fetch(`${VOICESTUDIO_URL}/v1/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer local',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          model: 'omnivoice',
          voice: vsProfileId || 'b5d182f3',
          input: cleanInput,
          response_format: 'mp3',
          speed: 0.82,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      const ctype = (resp.headers.get('content-type') || '').toLowerCase();
      if (!resp.ok || (!ctype.includes('audio') && !ctype.includes('octet-stream'))) {
        vsAvailableRef.current = false;
        probeVoiceServerStatus({ force: true });
        return false;
      }
      const blob = await resp.blob();
      if (blob.size < 500) return false;
      setVsStatusReady(true);
      setVsServerOffline(false);
      const blobUrl = setCachedVoiceBlobUrl(text, blob);
      return blobUrl ? await playMp3(blobUrl, { meta }) : false;
    } catch {
      vsAvailableRef.current = false;
      probeVoiceServerStatus({ force: true });
      return false;
    }
  }

  // Gọi /api/tts trên server Render (tra LRU RAM Cache ~5ms hoặc qua ngrok) kèm Circuit Breaker 8s
  async function speakViaServerProxy(text, meta = null) {
    // Ưu tiên 1: Cache RAM ở Client (0ms)
    const cached = voiceCacheRef.current.get(getTtsCacheKey(text));
    if (cached) return await playMp3(cached, { meta });
    if (Date.now() < proxyCooldownUntilRef.current) return false;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 16000);
      const resp = await fetch(SERVER_TTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-game-session': room?.mySessionToken || getSession()?.sessionToken || '',
        },
        body: JSON.stringify({ text, voice: vsProfileId, speed: 0.82 }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      const ctype = (resp.headers.get('content-type') || '').toLowerCase();
      if (!resp.ok || !ctype.includes('audio')) {
        proxyCooldownUntilRef.current = Date.now() + 8000;
        probeVoiceServerStatus({ force: true });
        return false;
      }
      const blob = await resp.blob();
      if (blob.size < 500) {
        proxyCooldownUntilRef.current = Date.now() + 8000;
        probeVoiceServerStatus({ force: true });
        return false;
      }
      setVsStatusReady(true);
      setVsServerOffline(false);
      const blobUrl = setCachedVoiceBlobUrl(text, blob);
      return blobUrl ? await playMp3(blobUrl, { meta }) : false;
    } catch {
      proxyCooldownUntilRef.current = Date.now() + 8000;
      probeVoiceServerStatus({ force: true });
      return false;
    }
  }

  function findAudioFile(text) {
    for (const { pattern, file } of AUDIO_MAP) {
      if (pattern.test(text)) return `/audio/${file}`;
    }
    return null;
  }

  // Fade-out mượt 180ms cho câu gọi dậy của pha cũ khi Smart Pacing / Turbo chuyển sang pha mới (giữ trọn câu báo tử / phán quyết / thắng thua)
  const fadeOutCurrentMcAudio = useCallback((durationMs = 180) => {
    const audio = currentAudioRef.current;
    if (!audio) return;
    currentAudioRef.current = null;
    currentAudioMetaRef.current = null;
    setIsMcSpeakingNow(false);
    const startVol = audio.volume || 0.92;
    const steps = 6;
    const stepMs = Math.max(16, Math.round(durationMs / steps));
    let cur = 0;
    const timer = setInterval(() => {
      cur += 1;
      try {
        audio.volume = Math.max(0, startVol * (1 - cur / steps));
        if (cur >= steps) {
          clearInterval(timer);
          audio.pause();
        }
      } catch {
        clearInterval(timer);
      }
    }, stepMs);
  }, []);

  useEffect(() => {
    const activePhase = room?.game?.nightDayPhase;
    if (!activePhase) return;
    // Khi bật Nhịp Đọc Trọn (Full-Read Pacing cho phòng Bot): KHÔNG cắt cụt câu dẫn MC ở 180ms để người mới nghe hiểu trọn vẹn!
    if (mcPacingModeRef.current === "full" && hasBotsInRoom) {
      return;
    }
    const meta = currentAudioMetaRef.current;
    if (
      currentAudioRef.current &&
      meta &&
      !meta.isImportant &&
      meta.phaseTag &&
      meta.phaseTag !== activePhase
    ) {
      fadeOutCurrentMcAudio(180);
    }
  }, [room?.game?.nightDayPhase, fadeOutCurrentMcAudio, hasBotsInRoom]);

  // Giữ nguyên Blob URL nằm trong voiceCacheRef xuyên suốt ván đấu (chỉ dọn khi về Lobby để phát lại không bao giờ lỗi 404)
  function playMp3(src, { revokeOnEnd = false, meta = null } = {}) {
    return new Promise((resolve) => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      currentAudioMetaRef.current = meta;
      const cleanup = (ok) => {
        if (currentAudioRef.current === audio) {
          currentAudioRef.current = null;
          currentAudioMetaRef.current = null;
          setIsMcSpeakingNow(false);
        } else if (!currentAudioRef.current) {
          setIsMcSpeakingNow(false);
        }
        if (revokeOnEnd && typeof src === 'string' && src.startsWith('blob:')) {
          try { URL.revokeObjectURL(src); } catch {}
        }
        resolve(ok);
      };
      const audio = new Audio(src);
      audio.volume = 0.92;
      currentAudioRef.current = audio;
      setIsMcSpeakingNow(true);
      audio.onended = () => cleanup(true);
      audio.onerror = () => cleanup(false);
      audio.play().catch(() => cleanup(false));
    });
  }

  useEffect(() => {
    if (!mcVoiceEnabled) {
      mcPlayQueueRef.current = [];
      if (currentAudioRef.current) {
        try {
          currentAudioRef.current.pause();
        } catch {}
        currentAudioRef.current = null;
      }
      setIsMcSpeakingNow(false);
      return;
    }
    if (mcLog.length === 0) return;
    // Khi đã kết thúc ván đấu (hoặc đang xem tiếp Phim Kể Chuyện cá nhân), tắt ngay luồng đọc chat thông báo của Room để nhường 100% Loa & GPU cho Bộ Phim!
    if (room?.phase === 'ended' || Boolean(room?.game?.winner) || isWatchingPersonalRecap) {
      mcPlayQueueRef.current = [];
      if (currentAudioRef.current) {
        try {
          currentAudioRef.current.pause();
        } catch {}
        currentAudioRef.current = null;
      }
      setIsMcSpeakingNow(false);
      lastSpokenRef.current = mcLog.length - 1;
      return;
    }
    const newMessages = mcLog.slice(lastSpokenRef.current + 1).filter(m => m.type !== 'player');
    lastSpokenRef.current = mcLog.length - 1;
    if (newMessages.length === 0) return;

    mcPlayQueueRef.current.push(...newMessages);
    // Chống ứ đọng vô hạn nếu tồn quá 3 câu cũ khi mạng lag đột biến
    while (mcPlayQueueRef.current.length > 3) {
      const staleIdx = mcPlayQueueRef.current.findIndex((m) => !m?.isImportant);
      if (staleIdx >= 0) mcPlayQueueRef.current.splice(staleIdx, 1);
      else break;
    }

    if (mcWorkerRunningRef.current) return;
    mcWorkerRunningRef.current = true;

    async function drainMcQueue() {
      try {
        while (mcPlayQueueRef.current.length > 0) {
          const msg = mcPlayQueueRef.current.shift();
          const text = msg?.text || msg;
          if (!text) continue;
          const msgMeta = {
            phaseTag: msg?.phaseTag || currentPhaseRef.current,
            isImportant: Boolean(msg?.isImportant),
          };
          const allowFullRead = mcPacingModeRef.current === "full";
          // Ở chế độ Nhanh: bỏ qua câu gọi dậy cũ nếu mạch game đã chuyển sang pha mới trước khi tới lượt đọc
          if (
            !allowFullRead &&
            !msgMeta.isImportant &&
            msg?.phaseTag &&
            currentPhaseRef.current &&
            msg.phaseTag !== currentPhaseRef.current
          ) {
            continue;
          }

          // Ưu tiên 1: Nếu câu đã có sẵn bản Voice Clone cá nhân hóa trong Cache RAM -> Phát ngay 0ms!
          const cachedBlobUrl = voiceCacheRef.current.get(getTtsCacheKey(text));
          if (cachedBlobUrl) {
            const cachedOk = await playMp3(cachedBlobUrl, { meta: msgMeta });
            if (cachedOk) continue;
          }

          const playerNames = (room?.players || []).map((p) => p?.name).filter(Boolean);
          const isPersonalized =
            text.includes('AI Bot') || playerNames.some((n) => text.includes(n));

          // Ưu tiên 2A (Câu chuyển pha chung không chứa tên riêng): Chỉ phát 27 file MP3 trung cổ khi ở Vũ Trụ Ma Sói gốc!
          if (!isPersonalized && universeId === "classic") {
            const staticSrc = findAudioFile(text);
            if (staticSrc) {
              const mp3Played = await playMp3(staticSrc, { meta: msgMeta });
              if (mp3Played) continue;
            }
          }

          // Ưu tiên 2B (Câu có tên người chơi hoặc Công Sở / Học Đường đọc chuẩn từ ngữ mới qua VoiceStudio):
          const vsOnline = await checkVoiceStudio();
          let dynamicPlayed = false;
          if (VOICESTUDIO_URL) {
            if (vsOnline) {
              dynamicPlayed = await speakVoiceStudio(text, msgMeta);
            } else {
              dynamicPlayed = await speakViaServerProxy(text, msgMeta);
            }
          } else {
            dynamicPlayed = await speakViaServerProxy(text, msgMeta);
          }
          if (dynamicPlayed) continue;

          // Ưu tiên 3 (Khi PC cá nhân tắt / Offline): Chỉ phát MP3 tĩnh ở Vũ Trụ Ma Sói gốc
          if (isPersonalized && universeId === "classic") {
            const fallbackStaticSrc = findAudioFile(text);
            if (fallbackStaticSrc) {
              await playMp3(fallbackStaticSrc, { meta: msgMeta });
            }
          }
          // Tuyệt đối 0% window.speechSynthesis — giữ im lặng sạch sẽ thay vì đọc giọng Tiếng Anh!
        }
      } finally {
        mcWorkerRunningRef.current = false;
      }
    }

    drainMcQueue();
  }, [mcLog, mcVoiceEnabled, room?.phase, room?.game?.winner, isWatchingPersonalRecap]);

  function copyRoomCode() {
    navigator.clipboard?.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2200);
  }

  function copyInviteLink() {
    const shareUrl = `${window.location.origin}/?room=${encodeURIComponent(roomCode)}`;
    navigator.clipboard?.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2400);
  }

  function handleLeave() {
    setFrozenRecapSnapshot(null);
    setDismissedRecapKey(null);
    socketRef.current.emit("room:leave");
    onLeave();
  }

  const handleExitRecapToLobby = useCallback(() => {
    const targetKey =
      liveEndedKey ||
      frozenRecapSnapshot?.key ||
      (room?.game?.winner ? `${room.code}_${room.game.gameStartedAt || "ended"}` : "ended");
    setDismissedRecapKey(targetKey);
    setError("");
    if (room?.phase === "ended") {
      const meNow = room.players?.find((p) => p.id === myId);
      if (meNow?.isHost) {
        socketRef.current?.emit("room:restart");
      } else if (meNow && !room.isSpectator) {
        socketRef.current?.emit("room:rematchReady");
      }
    }
  }, [liveEndedKey, frozenRecapSnapshot?.key, room, myId, socketRef]);

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

  function handleSelectRoomCitizen(nextId) {
    const meta = saveStoredCitizenModelId(nextId);
    setError("");
    socketRef.current?.emit("room:setCitizenModel", { citizenModelId: meta.id }, (res) => {
      if (res && !res.ok) {
        setError(res.error || "Không thể đổi nhân vật 3D.");
      }
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
    if (!me?.isHost || !room) return;
    setError("");
    const currentCounts =
      room.rolesConfig || generateDefaultRoles(Math.max(6, room.players.length));
    const current = Number(currentCounts[roleKey]) || 0;
    const totalRolesNow = Object.values(currentCounts).reduce(
      (s, v) => s + (Number(v) || 0),
      0
    );
    const totalWolfNow =
      (Number(currentCounts.wolf) || 0) + (Number(currentCounts.alpha_wolf) || 0);
    const isWolfCard = roleKey === "wolf" || roleKey === "alpha_wolf";
    if (delta < 0 && isWolfCard && current <= 1 && totalWolfNow <= 1) {
      setError("Bàn chơi cần tối thiểu 1 Ma Sói (hoặc bấm 👑 Đầu Đàn để đổi loại Sói).");
      return;
    }
    if (delta > 0 && totalRolesNow >= 18) {
      setError("Tối đa 18 vai trong một bàn chơi.");
      return;
    }
    const nextVal = Math.max(0, current + delta);
    if (nextVal === current) return;

    const newConfig = { ...currentCounts, [roleKey]: nextVal };
    socketRef.current.emit("room:setRolesConfig", { rolesConfig: newConfig }, (res) => {
      if (res && !res.ok) setError(res.error || "Lỗi cập nhật vai trò.");
    });
  }

  function handleSetTableScale(requestedTotal) {
    if (!me?.isHost || !room) return;
    setError("");
    const rawTarget = Math.max(6, Math.min(18, Number(requestedTotal) || 6));
    const minBySeated = Math.max(6, room.players.length);
    if (rawTarget < room.players.length) {
      setError(
        `Đang có ${room.players.length} ghế có người/Bot ngồi — hãy bấm '-1 Bot' hoặc '🗑️ Xóa Bot' nếu muốn hạ bàn xuống ${rawTarget} người.`
      );
    }
    const targetTotal = Math.max(minBySeated, rawTarget);
    const baseCfg = {
      ...(room.rolesConfig || generateDefaultRoles(Math.max(6, room.players.length))),
    };

    const sumNonVillager = () =>
      Object.entries(baseCfg)
        .filter(([k]) => k !== "villager")
        .reduce((s, [, c]) => s + (Number(c) || 0), 0);

    let nonVillager = sumNonVillager();
    if (targetTotal >= nonVillager) {
      baseCfg.villager = targetTotal - nonVillager;
    } else {
      baseCfg.villager = 0;
      const trimOrder = [
        "tanner",
        "cursed",
        "tough_guy",
        "cupid",
        "mayor",
        "hunter",
        "guard",
        "witch",
        "seer",
        "wolf",
        "alpha_wolf",
      ];
      for (const rk of trimOrder) {
        while (nonVillager > targetTotal && (Number(baseCfg[rk]) || 0) > 0) {
          const totalWolfLeft =
            (Number(baseCfg.wolf) || 0) + (Number(baseCfg.alpha_wolf) || 0);
          if ((rk === "wolf" || rk === "alpha_wolf") && totalWolfLeft <= 1) {
            break;
          }
          baseCfg[rk] = Math.max(0, (Number(baseCfg[rk]) || 0) - 1);
          nonVillager -= 1;
        }
      }
    }

    socketRef.current.emit("room:setRolesConfig", { rolesConfig: baseCfg }, (res) => {
      if (res && !res.ok) setError(res.error || "Không thể chỉnh quy mô bàn.");
    });
  }

  function handleChangeTotalWolves(delta) {
    if (!me?.isHost || !room || !delta) return;
    setError("");
    const currentCounts = {
      ...(room.rolesConfig || generateDefaultRoles(Math.max(6, room.players.length))),
    };
    const wolfNow = Number(currentCounts.wolf) || 0;
    const alphaNow = Number(currentCounts.alpha_wolf) || 0;
    const totalWolfNow = wolfNow + alphaNow;
    const villagerNow = Number(currentCounts.villager) || 0;
    const totalRolesNow = Object.values(currentCounts).reduce(
      (s, v) => s + (Number(v) || 0),
      0
    );

    if (delta < 0) {
      if (totalWolfNow <= 1) {
        setError("Bàn chơi phải có tối thiểu 1 Ma Sói.");
        return;
      }
      if (wolfNow > 0) {
        currentCounts.wolf = wolfNow - 1;
      } else {
        currentCounts.alpha_wolf = Math.max(0, alphaNow - 1);
      }
      currentCounts.villager = villagerNow + 1;
    } else {
      const maxWolvesAllowed = Math.min(8, Math.max(1, totalRolesNow - 1));
      if (totalWolfNow >= maxWolvesAllowed && villagerNow <= 0 && totalRolesNow >= 18) {
        setError("Số lượng Sói đã chạm trần tối đa của bàn.");
        return;
      }
      currentCounts.wolf = wolfNow + 1;
      if (villagerNow > 0) {
        currentCounts.villager = villagerNow - 1;
      } else if (totalRolesNow >= 18) {
        setError("Hãy giảm bớt 1 vai đặc biệt trước khi tăng thêm Sói (tối đa 18 vai).");
        return;
      }
    }

    socketRef.current.emit("room:setRolesConfig", { rolesConfig: currentCounts }, (res) => {
      if (res && !res.ok) setError(res.error || "Không thể chỉnh số lượng Sói.");
    });
  }

  function handleToggleAlphaWolf() {
    if (!me?.isHost || !room) return;
    setError("");
    const currentCounts = {
      ...(room.rolesConfig || generateDefaultRoles(Math.max(6, room.players.length))),
    };
    const wolfNow = Number(currentCounts.wolf) || 0;
    const alphaNow = Number(currentCounts.alpha_wolf) || 0;
    if (alphaNow > 0) {
      currentCounts.alpha_wolf = 0;
      currentCounts.wolf = wolfNow + alphaNow;
    } else if (wolfNow > 0) {
      currentCounts.wolf = wolfNow - 1;
      currentCounts.alpha_wolf = 1;
    } else {
      currentCounts.alpha_wolf = 1;
    }
    socketRef.current.emit("room:setRolesConfig", { rolesConfig: currentCounts }, (res) => {
      if (res && !res.ok) setError(res.error || "Không thể bật/tắt Sói Đầu Đàn.");
    });
  }

  function handlePresetRoles(mode = "v33") {
    if (!me?.isHost || !room) return;
    setError("");
    const currentTotal = Object.values(room.rolesConfig || {}).reduce(
      (s, v) => s + (Number(v) || 0),
      0
    );
    const scaleBase = Math.min(18, Math.max(currentTotal, room.players.length));
    const preset =
      mode === "classic"
        ? generateDefaultRoles(Math.max(6, scaleBase))
        : generateExpandedV33Roles(Math.max(8, scaleBase));
    socketRef.current.emit("room:setRolesConfig", { rolesConfig: preset }, (res) => {
      if (res && !res.ok) setError(res.error || "Lỗi thiết lập preset.");
    });
  }

  function handleChangeAccessMode(nextMode, providedPwd = "") {
    if (!me?.isHost) return;
    setError("");
    if (nextMode === "password" && !providedPwd.trim()) {
      setShowPwdEditor(true);
      return;
    }
    socketRef.current.emit(
      "room:setAccess",
      { accessMode: nextMode, password: providedPwd.trim() },
      (res) => {
        if (res && !res.ok) {
          setError(res.error || "Không thể đổi chế độ bảo mật phòng.");
          return;
        }
        setShowPwdEditor(false);
        setPwdDraft("");
      }
    );
  }

  function handleManageBots(action, count = 1) {
    if (!me?.isHost) return;
    setError("");
    socketRef.current.emit("room:manageBots", { action, count }, (res) => {
      if (res && !res.ok) setError(res.error || "Không chỉnh được ghế AI Bot.");
    });
  }

  function handleToggleTurbo() {
    if (!me?.isHost) return;
    setError("");
    socketRef.current.emit("room:setTurbo", { isTurbo: !room?.isTurbo }, (res) => {
      if (res && !res.ok) setError(res.error || "Không đổi được chế độ Tốc Chiến.");
    });
  }

  function handleSelectSoloRole(roleKey) {
    setError("");
    socketRef.current.emit("room:setSoloRole", { role: roleKey || null }, (res) => {
      if (res && !res.ok) setError(res.error || "Không thể chọn vai test.");
    });
  }

  function handleKickPlayer(targetPlayer) {
    if (!me?.isHost || !targetPlayer || targetPlayer.id === myId) return;
    if (targetPlayer.isBot) {
      socketRef.current.emit("room:kick", { targetId: targetPlayer.id }, (res) => {
        if (res && !res.ok) setError(res.error || "Không xóa được Bot.");
      });
      return;
    }
    if (window.confirm(`Kick ${targetPlayer.name} khỏi phòng?`)) {
      socketRef.current.emit("room:kick", { targetId: targetPlayer.id }, (res) => {
        if (res && !res.ok) alert(res.error || "Không kick được.");
      });
    }
  }

  function handleAutoFillVillagers() {
    if (!me?.isHost) return;
    setError("");
    const currentCounts = room.rolesConfig || generateDefaultRoles(Math.max(6, room.players.length));
    const specialCount = Object.entries(currentCounts)
      .filter(([k]) => k !== "villager")
      .reduce((sum, [, count]) => sum + (Number(count) || 0), 0);

    const targetTotal = Math.max(6, room.players.length);
    const villagers = Math.max(0, targetTotal - specialCount);
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

  // Thông số phiên Voice liên thông Sảnh Chờ 3D <-> Trong Trận <-> Ván Mới (0ms rớt kết nối)
  const liveIsSpectator = Boolean(room.isSpectator);
  const liveMe = me;
  const isLobbyNow =
    room.phase === "lobby" || (room.phase === "ended" && !isWatchingPersonalRecap);
  const voiceMyId = liveIsSpectator
    ? room.mySpectatorId
      ? `spec_${room.mySpectatorId}`
      : myId
    : liveMe?.id || myId;
  const voiceMyName = liveIsSpectator ? "Khán Giả" : liveMe?.name || "Bạn";
  const voiceMyRole =
    liveIsSpectator || isLobbyNow ? null : room.game?.myRole || liveMe?.role || null;
  const voiceIsAlive = isLobbyNow
    ? !liveIsSpectator
    : Boolean(liveMe?.alive !== false && !liveIsSpectator);
  const voiceNightDayPhase = isLobbyNow ? "lobby" : room.game?.nightDayPhase || null;
  const voiceHasWinner = !isLobbyNow && Boolean(room.game?.winner);
  const voiceWolfTeammates = isLobbyNow ? [] : room.game?.wolfTeammates || [];

  // Chuyển sang màn hình chơi game hoặc giữ Rạp Chiếu Cá Nhân (vẫn nằm trong cùng VoiceSessionProvider gốc!)
  let roomScreenBody = null;
  if (room.phase === "playing" || isWatchingPersonalRecap) {
    const liveFreshToken =
      liveMe?.sessionToken ||
      room.spectatorSessionToken ||
      getSession()?.sessionToken ||
      "";
    const baseRecapRoom =
      room.phase === "playing" || room.phase === "ended"
        ? room
        : frozenRecapSnapshot?.room || room;
    const effectivePlayingRoom = liveFreshToken
      ? { ...baseRecapRoom, freshSessionToken: liveFreshToken }
      : baseRecapRoom;

    roomScreenBody = (
      <PlayingView
        room={effectivePlayingRoom}
        socketRef={socketRef}
        mcLog={mcLog}
        mcVoiceEnabled={mcVoiceEnabled}
        setMcVoiceEnabled={setMcVoiceEnabled}
        onToggleStealthHeadphones={handleToggleStealthHeadphones}
        onLeave={handleLeave}
        onExitRecapToLobby={handleExitRecapToLobby}
        voicePregening={voicePregening}
        voicePregenProgress={voicePregenProgress}
        vsServerOffline={vsServerOffline}
        vsStatusReady={vsStatusReady}
        vsStatusChecking={vsStatusChecking}
        onRecheckVoice={handleManualRecheckVoice}
        voiceRecheckTick={voiceRecheckTick}
        voiceSpeakingIds={speakingIds}
        isMcSpeakingNow={isMcSpeakingNow}
        botVoiceEnabled={botVoiceEnabled}
        onToggleBotVoice={handleToggleBotVoice}
        mcPacingMode={effectiveMcPacingMode}
        canToggleMcPacing={Boolean(effectivePlayingRoom?.canToggleMcPacing)}
        onToggleMcPacing={handleToggleMcPacing}
      />
    );
  } else {
    const rolesConfig = room.rolesConfig || generateDefaultRoles(Math.max(6, room.players.length));
    const totalRoles = Object.values(rolesConfig).reduce((s, v) => s + (Number(v) || 0), 0);

    const activeScenePresetId = room.scenePresetId || DEFAULT_SCENE_PRESET_ID;
    const effectivePresets =
      scenePresets.length > 0
        ? scenePresets
        : [
            {
              id: DEFAULT_SCENE_PRESET_ID,
              name: "🌲 Làng Sương Bắc Âu",
              shortLabel: "Làng Sương",
              thumbnailUrl: "/backgrounds/preset_nordic_mist.webp",
              nodeCount: 154,
            },
          ];
    const activeSceneMeta =
      effectivePresets.find((p) => p.id === activeScenePresetId) || effectivePresets[0];
    const withPortraitVer = (rawUrl) => {
      if (!rawUrl) return "/portraits/badges/villager_cloak.webp?v=44";
      return rawUrl.startsWith("/portraits/") && !rawUrl.includes("?") ? `${rawUrl}?v=44` : rawUrl;
    };

    // Điều kiện bắt đầu game (Hỗ trợ cả Đủ Người lẫn Chơi 1 Mình Tự Bù AI Bot!)
    const totalPlayers = room.players.length;
    const realHumansCount = room.players.filter((p) => !p.isBot).length;
    const botCount = totalPlayers - realHumansCount;
    const unreadyPlayers = room.players.filter((p) => !p.isBot && !p.isHost && !p.ready);
    const readyCount = room.players.filter((p) => p.ready).length;
    const isAllReady = unreadyPlayers.length === 0;
    const missingBotsToFill = Math.max(0, totalRoles - totalPlayers);
    const isRolesMatched = totalRoles === totalPlayers;
    const isRolesValidForStart = totalRoles >= 6 && totalPlayers <= totalRoles;
    const totalWolfTeam =
      (Number(rolesConfig.wolf) || 0) + (Number(rolesConfig.alpha_wolf) || 0);
    const hasWolf = totalWolfTeam >= 1;
    const canStartGame = realHumansCount >= 1 && isAllReady && isRolesValidForStart && hasWolf;
    const seatRingTarget = Math.min(18, Math.max(totalRoles || 6, totalPlayers, 6));
    const roomAccessMode = room.accessMode || "public";
    const activeSoloRole = realHumansCount === 1 ? room.soloPracticeRole || null : null;

    roomScreenBody = (
      <div className={`lobby-3d-shell ${lobbyView3D ? "mode-3d" : "mode-2d"}`}>
      <StealthCamouflageOverlay universeId={universeId} phaseKey="lobby" />
      <CitizenAvatarVaultModal
        open={showAvatarVault}
        onClose={() => setShowAvatarVault(false)}
        selectedId={me?.citizenModelId || getStoredCitizenModelId()}
        onSelect={handleSelectRoomCitizen}
      />

      {/* ==================== 1. SÂN KHẤU LÀNG 3D TỔNG QUAN (AI VÀO PHÒNG NGỒI GHẾ DÂN LÀNG / AVATAR 3D CÁ NHÂN HÓA!) ==================== */}
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
                  🏡 Đang dựng không gian 3D {uTheme.shortTab}...
                </div>
              }
            >
              <WerewolfScene3D
                roomCode={room.code}
                universeId={universeId}
                players={room.players}
                me={me}
                phase="lobby"
                isNight={universeId === "classic"}
                myRole={null}
                hasWinner={false}
                lobbyTargetSeatCount={seatRingTarget}
                onLobbyKickPlayer={handleKickPlayer}
                wolfChatLog={lobbyBubbleLog}
                speakingIds={speakingIds}
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
                const citizenMeta = p ? getCitizenAvatarMeta(p.citizenModelId) : null;
                return (
                  <div key={p?.id || `empty-${idx}`} className={`lobby-2d-seat-card ${p ? "occupied" : "empty"}`}>
                    <div className="seat-wolf-icon">
                      {p ? (
                        <img
                          src={withPortraitVer(citizenMeta?.portraitBadge || "/portraits/badges/villager_cloak.webp")}
                          alt={p.name}
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: "50%",
                            objectFit: "cover",
                            border: "1.5px solid rgba(251, 191, 36, 0.65)",
                          }}
                        />
                      ) : (
                        "🪑"
                      )}
                    </div>
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

      {/* ==================== 2. THANH KÍNH MỜ TRÊN ĐỈNH V4.4 (5 CỤM GỌN GÀNG + MENU CÀI ĐẶT ⚙️) ==================== */}
      <header className="lobby-3d-topbar v44-clean-topbar">
        {/* CỤM 1: MÃ PHÒNG + LINK MỜI + NHÃN BẢO MẬT NHỎ */}
        <div className="lobby-header-left">
          <div className="lobby-room-code-badge" onClick={copyRoomCode} title="Nhấn để sao chép mã bàn">
            <span className="code-text">{room.code}</span>
            <span className="copy-hint">{copiedCode ? "✅" : "📋"}</span>
          </div>
          <button
            type="button"
            className={`btn-invite-compact ${copiedLink ? "copied" : ""}`}
            onClick={copyInviteLink}
            title="Sao chép liên kết mời bạn bè vào thẳng bàn"
          >
            <span>{copiedLink ? "✅ Đã chép" : "🔗 Mời"}</span>
            <span className="invite-mode-dot" title={roomAccessMode === "hidden" ? "Phòng ẩn" : roomAccessMode === "password" ? "Có mật khẩu" : "Công khai"}>
              {roomAccessMode === "hidden" ? "🕵️" : roomAccessMode === "password" ? "🔐" : "🌍"}
            </span>
          </button>
          {room.isTurbo && (
            <span className="lobby-turbo-mini" title="Chế độ Tốc Chiến 5 Phút">
              ⚡ 5p
            </span>
          )}
        </div>

        {/* CỤM 2: 1 VIÊN THUỐC THỐNG KÊ HỢP NHẤT */}
        <div className="lobby-header-center">
          <div className={`lobby-unified-capsule ${isRolesValidForStart && hasWolf ? "ok" : "warn"}`}>
            <span>👥 {totalPlayers}/{seatRingTarget} ghế</span>
            <span className="capsule-sep">•</span>
            <span>
              🎭 {totalRoles} vai{missingBotsToFill > 0 ? ` (+${missingBotsToFill} 🤖)` : ""}
            </span>
            {totalPlayers > 1 && (
              <>
                <span className="capsule-sep">•</span>
                <span>🟢 {readyCount}/{totalPlayers}</span>
              </>
            )}
          </div>
          {!import.meta.env.PROD && (
            <span
              className="local-dev-env-badge"
              title="Đang chạy bản kiểm thử Local nối thẳng http://localhost:3001 (Chưa đẩy lên Cloud)"
            >
              🧪 LOCAL
            </span>
          )}
        </div>

        {/* CỤM 3–5: BOSS KEY + TAI NGHE 0dB + MIC GIỮ NÓI + ĐÓNG/MỞ BỘ BÀI + ⚙️ CÀI ĐẶT + RỜI */}
        <div className="lobby-header-actions">
          <BossKeyTriggerButton universeId={universeId} />
          {uTheme.silentByDefault && (
            <button
              type="button"
              className={`btn-lobby-pill ${mcVoiceEnabled ? "active" : ""}`}
              onClick={handleToggleStealthHeadphones}
              title={
                mcVoiceEnabled
                  ? "Đang bật âm thanh Tai nghe — Bấm để quay về Chế độ 0dB Im Lặng"
                  : "Chế độ 0dB Im Lặng mặc định khi ở Văn Phòng / Lớp Học — Bấm khi bạn đã đeo tai nghe!"
              }
            >
              {mcVoiceEnabled ? "🎧 Tai nghe: BẬT" : "🔇 0dB (Bật Tai Nghe)"}
            </button>
          )}
          <VoiceQuickMicPill />

          <button
            type="button"
            className={`btn-lobby-pill ${drawerOpen ? "active" : ""}`}
            onClick={() => setDrawerOpen((v) => !v)}
            title="Thu gọn bảng bên phải để ngắm toàn cảnh Làng 3D hoặc mở lại Bộ Bài"
          >
            {drawerOpen ? "👁️ Ngắm 3D" : `🃏 Bộ Bài (${totalRoles})`}
            {!drawerOpen && hasUnreadChat && <span className="tab-unread-dot" />}
          </button>

          <div className="room-settings-popover-anchor" ref={roomSettingsRef}>
            <button
              type="button"
              className={`btn-lobby-pill btn-gear-trigger ${showRoomSettings ? "active" : ""}`}
              onClick={() => setShowRoomSettings((v) => !v)}
              title="Đổi Nhân Vật 3D, Âm thanh MC/Bot & Chế độ hiển thị"
            >
              ⚙️ <span className="gear-label-desktop">Tùy chọn</span>
            </button>

            {showRoomSettings && (
              <div className="room-settings-popover">
                <div className="popover-section-title">Cài Đặt Nhanh Sảnh 3D</div>

                <button
                  type="button"
                  className="popover-action-row highlight-gold"
                  onClick={() => {
                    setShowRoomSettings(false);
                    setShowAvatarVault(true);
                  }}
                >
                  <span>🎭 Đổi Diện Mạo Dân Làng 3D</span>
                  <span className="popover-badge">Mở Kho</span>
                </button>

                <button
                  type="button"
                  className="popover-action-row"
                  onClick={() => {
                    const next = !lobbyView3D;
                    setLobbyView3D(next);
                    localStorage.setItem("ws_view_mode", next ? "3d" : "2d");
                  }}
                >
                  <span>🖥️ Chế độ hiển thị Sảnh</span>
                  <span className="popover-badge">{lobbyView3D ? "🎮 3D Đầy Đủ" : "⚡ 2D Nhẹ"}</span>
                </button>

                {(botCount > 0 || missingBotsToFill > 0) && room.canToggleMcPacing && (
                  <button
                    type="button"
                    className="popover-action-row"
                    onClick={handleToggleMcPacing}
                  >
                    <span>🎙️ Nhịp đọc Quản Trò MC</span>
                    <span className="popover-badge">
                      {effectiveMcPacingMode === "full" ? "🐢 Đọc Trọn" : "⚡ Nhịp Nhanh"}
                    </span>
                  </button>
                )}

                {(botCount > 0 || missingBotsToFill > 0) && (
                  <button
                    type="button"
                    className="popover-action-row"
                    onClick={handleToggleBotVoice}
                  >
                    <span>🤖 Giọng tranh biện AI Bot</span>
                    <span className="popover-badge">
                      {botVoiceEnabled ? "🤖🔊 Đang Bật" : "🔇 Đang Tắt"}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  className="popover-action-row"
                  onClick={handleManualRecheckVoice}
                >
                  <span>🔊 Máy chủ Giọng MC</span>
                  <span className={`popover-badge ${vsServerOffline ? "warn" : "ok"}`}>
                    {vsStatusChecking
                      ? "⏳ Kiểm tra..."
                      : vsServerOffline
                        ? "MP3 Chuẩn (Thử lại)"
                        : vsStatusReady
                          ? "🟢 Sẵn sàng"
                          : "🟡 Kết nối..."}
                  </span>
                </button>

                {onOpenArchitectStudio && (
                  <button
                    type="button"
                    className="popover-action-row"
                    onClick={() => {
                      setShowRoomSettings(false);
                      onOpenArchitectStudio();
                    }}
                  >
                    <span>🏗️ Studio Cảnh Quan D5</span>
                    <span className="popover-badge">Dev</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <button className="btn-header-leave" onClick={handleLeave} title="Rời khỏi bàn">
            🚪 <span className="leave-label-desktop">Rời</span>
          </button>
        </div>
      </header>

      {/* ==================== 3. NGĂN KÍNH MỜ BÊN PHẢI V4.4: 3 THẺ BẢN ĐỒ 3D + BỘ BÀI TAROT UE5 + CHAT ==================== */}
      {drawerOpen && (
        <aside className="lobby-3d-drawer">
          <div className="lobby-drawer-tabs">
            <button
              type="button"
              className={`lobby-drawer-tab ${mobileTab === "roles" ? "active" : ""}`}
              onClick={() => setMobileTab("roles")}
            >
              🃏 Bộ Bài ({totalRoles} vai)
            </button>
            <button
              type="button"
              className={`lobby-drawer-tab ${mobileTab === "chat" ? "active" : ""}`}
              onClick={() => {
                setMobileTab("chat");
                setHasUnreadChat(false);
              }}
            >
              💬 Trò Chuyện ({lobbyMessages.length})
              {hasUnreadChat && <span className="tab-unread-dot" />}
            </button>
            <button
              type="button"
              className="lobby-drawer-mobile-min"
              onClick={() => setDrawerOpen(false)}
              title="Thu gọn để ngắm toàn cảnh Làng 3D"
            >
              ▾ 3D
            </button>
          </div>

          {mobileTab === "roles" ? (
            <div className="lobby-drawer-content">
              {/* CHUYỂN ĐỔI 3 VŨ TRỤ NGAY TRONG PHÒNG CHỜ (Đồng bộ tức thì cho cả 6–18 ghế!) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 6,
                  padding: "6px",
                  borderRadius: 12,
                  background: "rgba(9, 14, 28, 0.85)",
                  border: "1px solid rgba(148, 163, 184, 0.25)",
                }}
              >
                {UNIVERSE_IDS.map((uKey) => {
                  const ut = UNIVERSE_THEMES[uKey];
                  const isCur = universeId === uKey;
                  return (
                    <button
                      key={uKey}
                      type="button"
                      disabled={!me?.isHost && !isCur}
                      onClick={() => me?.isHost && handleSetRoomUniverse(uKey)}
                      title={
                        me?.isHost
                          ? `Đổi toàn bộ không gian 3D & bộ vai sang ${ut.brandTitle}`
                          : `Phòng đang ở không gian ${ut.brandTitle}`
                      }
                      style={{
                        margin: 0,
                        padding: "7px 6px",
                        borderRadius: 9,
                        fontSize: "0.73rem",
                        fontWeight: 800,
                        border: isCur
                          ? `1.5px solid ${ut.accentHex}`
                          : "1px solid rgba(148, 163, 184, 0.18)",
                        background: isCur
                          ? "rgba(30, 41, 59, 0.96)"
                          : "rgba(15, 23, 42, 0.55)",
                        color: isCur ? "#fff" : "#94a3b8",
                        cursor: me?.isHost ? "pointer" : "default",
                      }}
                    >
                      {ut.tabIcon} {ut.shortTab}
                    </button>
                  );
                })}
              </div>

              {/* 3 THẺ BẢN ĐỒ 3D TRỰC QUAN (Thay thế <select> thô) */}
              <div className="scene-map-picker-block">
                <div className="scene-map-header">
                  <span className="scene-bar-label">🗺️ Không Gian Sân Khấu 3D</span>
                  <span className="scene-active-caption">
                    {activeSceneMeta?.name || "🌲 Làng Sương Bắc Âu"}
                  </span>
                </div>
                <div className="scene-map-cards-grid v45-map-grid">
                  {effectivePresets.map((p) => {
                    const isSelectedMap = p.id === activeScenePresetId;
                    const mapThumb =
                      p.thumbnailUrl ||
                      (p.id === "dark_academia_courtyard"
                        ? "/backgrounds/preset_dark_academia.webp"
                        : p.id === "blood_moon_sanctuary"
                          ? "/backgrounds/preset_blood_moon.webp"
                          : p.id.includes("dau_truong")
                            ? "/backgrounds/preset_stone_arena.webp"
                            : "/backgrounds/preset_nordic_mist.webp");
                    const shortTitle =
                      p.shortLabel || p.name.replace(/^[^\s]+\s/, "").split("(")[0].trim();
                    const isBlockoutMap = p.id === "dark_academia_courtyard" || p.slotMode === "blockout_ready";
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`scene-map-card ${isSelectedMap ? "selected" : ""} ${!me?.isHost ? "readonly" : ""}`}
                        onClick={() => me?.isHost && handleSelectScenePreset(p.id)}
                        disabled={!me?.isHost && !isSelectedMap}
                        title={p.description || p.name}
                      >
                        <img src={mapThumb} alt={shortTitle} className="scene-map-thumb" loading="lazy" />
                        {isBlockoutMap && (
                          <span className="scene-map-slot-pill">🧱 Box→GLB</span>
                        )}
                        <div className="scene-map-overlay">
                          <span className="scene-map-name">{shortTitle}</span>
                          {isSelectedMap && <span className="scene-map-check">✓</span>}
                        </div>
                      </button>
                    );
                  })}
                  <div
                    className="scene-map-card is-coming-slot"
                    title="Cổng chờ Bản đồ Teen #5: Phố Đêm Neon Cyber-Folk — Sẵn sàng gắn preset & mô hình 3D trong bản cập nhật tới"
                  >
                    <img
                      src="/backgrounds/preset_neon_market_slot.webp"
                      alt="Phố Đêm Neon (Sắp mở)"
                      className="scene-map-thumb"
                      loading="lazy"
                    />
                    <span className="scene-map-slot-pill coming">⏳ Cổng chờ</span>
                    <div className="scene-map-overlay">
                      <span className="scene-map-name">🏮 Phố Đêm</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* DẢI VUỐT NGANG CHỌN VAI THỬ KHI Ở 1 MÌNH (0% thanh cuộn dọc lồng nhau!) */}
              {realHumansCount === 1 && (
                <div className="solo-role-picker-box clean-ribbon">
                  <div className="solo-role-picker-header">
                    <span>🎯 Đấu AI — Chọn vai bạn muốn hóa thân:</span>
                    <span className="solo-fair-note">Tự khóa nếu thêm người thật</span>
                  </div>
                  <div className="solo-role-chips horizontal-ribbon">
                    <button
                      type="button"
                      className={`solo-role-chip ${!activeSoloRole ? "selected" : ""}`}
                      onClick={() => handleSelectSoloRole(null)}
                    >
                      🎲 Ngẫu nhiên
                    </button>
                    {ORDERED_ROLES.map((rk) => {
                      const rc = getUniverseRoleMeta(rk, universeId);
                      if (!rc) return null;
                      return (
                        <button
                          key={rk}
                          type="button"
                          className={`solo-role-chip ${activeSoloRole === rk ? "selected" : ""}`}
                          onClick={() => handleSelectSoloRole(rk)}
                          style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
                        >
                          {universeId === "classic" ? (
                            <RolePortrait roleKey={rk} size={18} />
                          ) : (
                            <span>{rc.emoji}</span>
                          )}
                          <span>{rc.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* THANH QUY MÔ NHANH 1-CHẠM + NÚT MỞ RỘNG TÙY CHỈNH SÂU (PROGRESSIVE DISCLOSURE) */}
              {me?.isHost ? (
                <>
                  <div className="deck-quick-toolbar">
                    <div className="quick-size-pills">
                      {[6, 8, 10, 12, 16].map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          className={`quick-size-pill ${totalRoles === sz ? "active" : ""}`}
                          onClick={() => handleSetTableScale(sz)}
                          title={`Đặt quy mô bàn ${sz} người chơi`}
                        >
                          {sz}p
                        </button>
                      ))}
                    </div>

                    <div className="deck-quick-presets">
                      <button
                        type="button"
                        className="btn-preset-v33"
                        onClick={() => handlePresetRoles("v33")}
                        title="Cân bằng tự động đủ Thợ Săn, Thần Tình Yêu, Sói Đầu Đàn, Trưởng Làng"
                      >
                        🔥 Đủ Vai
                      </button>
                      <button
                        type="button"
                        className="btn-preset-default"
                        onClick={() => handlePresetRoles("classic")}
                        title="Bộ vai cổ điển dễ làm quen"
                      >
                        ⚖️ Cổ Điển
                      </button>
                      <button
                        type="button"
                        className={`btn-toggle-adv-setup ${showAdvancedSetup ? "active" : ""}`}
                        onClick={() => setShowAdvancedSetup((v) => !v)}
                        title="Mở tùy chỉnh chi tiết Số Sói, AI Bot, Mật khẩu & Tốc chiến"
                      >
                        🎛️ {showAdvancedSetup ? "Thu gọn" : "Tùy chỉnh"}
                      </button>
                    </div>
                  </div>

                  {showAdvancedSetup && (
                    <div className="advanced-setup-drawer">
                      <div className="quick-scale-row">
                        <span className="quick-scale-label">👥 Quy mô bàn:</span>
                        <div className="quick-scale-controls">
                          <button
                            type="button"
                            className="btn-quick-step"
                            onClick={() => handleSetTableScale(totalRoles - 1)}
                            disabled={totalRoles <= 6}
                          >
                            −
                          </button>
                          <span className="quick-step-readout">{totalRoles} người</span>
                          <button
                            type="button"
                            className="btn-quick-step"
                            onClick={() => handleSetTableScale(totalRoles + 1)}
                            disabled={totalRoles >= 18}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="btn-preset-autofill"
                            onClick={handleAutoFillVillagers}
                            title="Bù Nông Dân khớp ghế"
                          >
                            ➕ Bù Dân (x{Number(rolesConfig.villager) || 0})
                          </button>
                        </div>
                      </div>

                      <div className="quick-scale-row">
                        <span className="quick-scale-label">🐺 Phe Ma Sói:</span>
                        <div className="quick-scale-controls">
                          <button
                            type="button"
                            className="btn-quick-step wolf"
                            onClick={() => handleChangeTotalWolves(-1)}
                            disabled={totalWolfTeam <= 1}
                          >
                            −
                          </button>
                          <span className="quick-step-readout wolf">{totalWolfTeam} Sói</span>
                          <button
                            type="button"
                            className="btn-quick-step wolf"
                            onClick={() => handleChangeTotalWolves(1)}
                            disabled={totalWolfTeam >= Math.min(8, Math.max(1, totalRoles - 1))}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className={`quick-alpha-pill ${(Number(rolesConfig.alpha_wolf) || 0) > 0 ? "active" : ""}`}
                            onClick={handleToggleAlphaWolf}
                          >
                            👑 Đầu Đàn: {(Number(rolesConfig.alpha_wolf) || 0) > 0 ? "CÓ" : "TẮT"}
                          </button>
                        </div>
                      </div>

                      <div className="lobby-access-row">
                        <span className="mini-panel-label">🤖 Ghế AI Bot:</span>
                        <div className="lobby-mini-pills">
                          <button
                            type="button"
                            className="mini-pill bot-btn"
                            onClick={() => handleManageBots("fill_roles")}
                          >
                            ⚡ Khớp ({totalRoles})
                          </button>
                          <button
                            type="button"
                            className="mini-pill bot-btn"
                            onClick={() => handleManageBots("add", 1)}
                            disabled={totalPlayers >= 18}
                          >
                            +1 Bot
                          </button>
                          {botCount > 0 && (
                            <button
                              type="button"
                              className="mini-pill bot-btn"
                              onClick={() => handleManageBots("remove", 1)}
                            >
                              −1 Bot
                            </button>
                          )}
                          {botCount > 0 && (
                            <button
                              type="button"
                              className="mini-pill bot-clear"
                              onClick={() => handleManageBots("clear")}
                            >
                              🗑️ Xóa ({botCount})
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="lobby-access-row">
                        <span className="mini-panel-label">🔒 Bảo mật & Nhịp:</span>
                        <div className="lobby-mini-pills">
                          <button
                            type="button"
                            className={`mini-pill ${roomAccessMode === "public" && !showPwdEditor ? "active-pub" : ""}`}
                            onClick={() => {
                              setShowPwdEditor(false);
                              handleChangeAccessMode("public");
                            }}
                          >
                            🌍 Mở
                          </button>
                          <button
                            type="button"
                            className={`mini-pill ${roomAccessMode === "password" || showPwdEditor ? "active-pwd" : ""}`}
                            onClick={() => setShowPwdEditor((v) => !v)}
                          >
                            🔐 Khóa
                          </button>
                          <button
                            type="button"
                            className={`mini-pill ${roomAccessMode === "hidden" && !showPwdEditor ? "active-hid" : ""}`}
                            onClick={() => {
                              setShowPwdEditor(false);
                              handleChangeAccessMode("hidden");
                            }}
                          >
                            🕵️ Ẩn
                          </button>
                          <button
                            type="button"
                            className={`mini-pill ${room.isTurbo ? "active-pwd" : ""}`}
                            onClick={handleToggleTurbo}
                          >
                            ⚡ 5p: {room.isTurbo ? "BẬT" : "Tắt"}
                          </button>
                        </div>
                      </div>

                      {showPwdEditor && (
                        <form
                          className="lobby-pwd-inline-row"
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleChangeAccessMode("password", pwdDraft);
                          }}
                        >
                          <input
                            type="password"
                            value={pwdDraft}
                            maxLength={32}
                            onChange={(e) => setPwdDraft(e.target.value)}
                            placeholder="Nhập mật khẩu bàn..."
                            autoFocus
                          />
                          <button type="submit" className="btn-save-pwd">
                            Lưu
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="guest-sync-banner">
                  👀 Bộ bài đồng bộ trực tiếp từ Chủ bàn — thẻ sáng là vai có mặt trong ván!
                </div>
              )}

              {!isRolesValidForStart && (
                <div className="roles-mismatch-alert">
                  ⚠️ Đang có <strong>{totalRoles}</strong> vai / <strong>{totalPlayers}</strong> ghế (cần ≥6 vai).{" "}
                  {me?.isHost ? "Hãy chọn quy mô 6p–16p hoặc bấm 🔥 Đủ Vai." : "Chờ chủ bàn cân chỉnh."}
                </div>
              )}

              {/* LƯỚI 12 THẺ BÀI VAI TRÒ 3 VŨ TRỤ (MA SÓI / CÔNG SỞ / HỌC ĐƯỜNG) */}
              <div className="roles-thumb-grid">
                {ORDERED_ROLES.map((roleKey) => {
                  const conf = getUniverseRoleMeta(roleKey, universeId);
                  const count = Number(rolesConfig[roleKey]) || 0;
                  const isWolfCard = roleKey === "wolf" || roleKey === "alpha_wolf";
                  const disableMinus =
                    count <= 0 || (isWolfCard && count === 1 && totalWolfTeam <= 1);
                  const teamText =
                    conf.team === "wolf"
                      ? uTheme.factions?.wolf || "Phe Sói"
                      : conf.team === "neutral"
                        ? uTheme.factions?.neutral || "Độc Lập"
                        : uTheme.factions?.village || "Phe Dân";
                  const showStudioCard = universeId === "classic" && Boolean(ROLE_PORTRAIT_CARDS[roleKey]);

                  return (
                    <div
                      key={roleKey}
                      className={`role-thumb-card ${count > 0 ? "active-thumb" : "zero-thumb"}`}
                      style={{ "--role-accent": conf.color || "#fbbf24" }}
                      title={`${conf.label} (${teamText}): ${conf.description}`}
                    >
                      <div
                        className={`role-thumb-art ${showStudioCard ? "has-studio-portrait" : ""}`}
                        style={{ background: conf.thumbGradient || "linear-gradient(145deg, #1e293b, #334155)" }}
                      >
                        {showStudioCard ? (
                          <img
                            src={withPortraitVer(ROLE_PORTRAIT_CARDS[roleKey])}
                            alt={conf.label}
                            loading="lazy"
                            decoding="async"
                            className="role-thumb-studio-img"
                          />
                        ) : (
                          <div className="role-thumb-emblem">{conf.emoji}</div>
                        )}
                        <span className={`role-thumb-team ${conf.team}`}>{teamText}</span>
                        <span className={`role-thumb-qty-badge ${count > 0 ? "has-qty" : ""}`}>
                          x{count}
                        </span>
                      </div>

                      <div className="role-thumb-meta">
                        <div className="role-thumb-title">{conf.label}</div>
                        <div className="role-thumb-skill">{conf.shortSkill || conf.description}</div>
                      </div>

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
                          {count > 0 ? `Có ${count} vai` : "Ẩn"}
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
                  <span>👥 Ghế quanh lửa trại ({totalPlayers}/{seatRingTarget})</span>
                  {!editingName ? (
                    <button
                      type="button"
                      className="btn-mini-rename"
                      onClick={() => {
                        setNameInput(me?.name || "");
                        setEditingName(true);
                      }}
                    >
                      ✏️ Đổi tên
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
                            title={`Mời ${p.name} rời ghế`}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <VoiceRoom />
              </div>

              <div className="lobby-chat-messages">
                {lobbyMessages.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#94a3b8", margin: "auto", fontSize: "0.82rem" }}>
                    💬 Nhắn tin tại đây sẽ hiện bong bóng thoại ngay trên đầu Nhân vật 3D của bạn quanh lửa trại!
                  </div>
                ) : (
                  lobbyMessages.map((msg) => {
                    const isMine = msg.senderId === myId;
                    return (
                      <div key={msg.id} className={`lobby-chat-msg ${isMine ? "mine" : ""}`}>
                        <img className="lobby-chat-avatar" src={withPortraitVer(msg.avatar)} alt={msg.senderName} />
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
                  placeholder="Nhắn tin lên đầu Nhân vật 3D..."
                  maxLength={100}
                />
                <button type="submit">Gửi</button>
              </form>
            </div>
          )}
        </aside>
      )}

      {/* ==================== 4. THANH KHỞI HÀNH GỌN ĐẸP DƯỚI ĐÁY SÂN KHẤU 3D ==================== */}
      <footer className={`lobby-3d-launch-dock v44-clean-dock ${drawerOpen ? "with-drawer" : "full-stage"}`}>
        {!canStartGame && (
          <div className="lobby-dock-hint-pill warn">
            {!isAllReady
              ? `⏳ Đang chờ ${unreadyPlayers.length} người sẵn sàng`
              : !hasWolf
                ? "⚠️ Cần ít nhất 1 Ma Sói"
                : `⚠️ Cần tối thiểu 6 vai (${totalRoles}/${totalPlayers})`}
          </div>
        )}

        {error && (
          <div className="lobby-dock-error">
            ⚠️ {error}
          </div>
        )}

        {room.phase === "ended" ? (
          me?.isHost ? (
            <button
              className="btn-start-game-master"
              onClick={() => socketRef.current?.emit("room:restart")}
              title="Mở khóa bàn sảnh chờ cho ván đấu tiếp theo"
            >
              🏰 MỞ SẢNH VÁN MỚI NGAY
            </button>
          ) : room.isSpectator ? (
            <button
              className="btn-ready-toggle is-ready"
              disabled
              style={{ maxWidth: 420, cursor: "default", opacity: 0.95 }}
            >
              🪑 Đã đặt ghế — Tự vào bàn khi ván trước khép màn
            </button>
          ) : (
            <button
              className="btn-ready-toggle is-ready"
              disabled
              style={{ maxWidth: 420, cursor: "default", opacity: 0.95 }}
            >
              ✅ Đang chờ người chơi khác xem nốt phim tổng kết...
            </button>
          )
        ) : me?.isHost ? (
          <button
            className="btn-start-game-master"
            onClick={handleStartGame}
            disabled={!canStartGame}
            title={
              missingBotsToFill > 0
                ? `Tự động triệu hồi thêm +${missingBotsToFill} AI Bot lấp đủ ${totalRoles} ghế và vào Đêm 1 ngay!`
                : "Phân vai bí mật và bắt đầu Đêm đầu tiên!"
            }
          >
            <span>🚀 BẮT ĐẦU VÁN ĐẤU</span>
            {missingBotsToFill > 0 && (
              <span className="start-bot-subpill">+{missingBotsToFill} AI Bot</span>
            )}
          </button>
        ) : (
          <button
            className={`btn-ready-toggle ${me?.ready ? "is-ready" : ""}`}
            onClick={handleToggleReady}
            style={{ maxWidth: 320 }}
          >
            {me?.ready ? "✅ ĐÃ SẴN SÀNG (Bấm hủy)" : "🙋 SẴN SÀNG XUẤT TRẬN"}
          </button>
        )}
      </footer>
    </div>
    );
  }

  return (
    <VoiceSessionProvider
      socketRef={socketRef}
      roomCode={room.code}
      isLobby={isLobbyNow}
      humanCount={room.humanCount ?? 1}
      spectatorCount={room.spectatorCount ?? 0}
      nightDayPhase={voiceNightDayPhase}
      hasWinner={voiceHasWinner}
      isSpectator={liveIsSpectator}
      myId={voiceMyId}
      myName={voiceMyName}
      myRole={voiceMyRole}
      isAlive={voiceIsAlive}
      wolfTeammates={voiceWolfTeammates}
      mcDuckingActive={isMcSpeakingNow}
      isSuppressedForRecap={isWatchingPersonalRecap}
      onSpeakingChange={handleVoiceSpeakingChange}
    >
      {roomScreenBody}
    </VoiceSessionProvider>
  );
}
