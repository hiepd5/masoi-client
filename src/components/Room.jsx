import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
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
import { getTtsCacheKey, normalizeTtsText } from "../utils/ttsTextUtils.js";
import "./Room.css";

const WerewolfScene3D = lazy(() => import("../3d/scene/WerewolfScene3D.jsx"));

const ORDERED_ROLES = PLAYABLE_ROLE_KEYS;

export default function Room({ socketRef, roomCode, roomData, onLeave, onOpenArchitectStudio = null }) {
  const room = roomData;
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [showPwdEditor, setShowPwdEditor] = useState(false);
  const [pwdDraft, setPwdDraft] = useState("");

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

  // URL server Render để proxy TTS & kiểm tra trạng thái sống thật (giải quyết CORS cho production)
  const SERVER_BASE_URL = import.meta.env.PROD
    ? 'https://masoi-server-2eca.onrender.com'
    : 'http://localhost:3001';
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

  // Xây dựng bộ câu thông báo động khớp 1:1 với gameController.js (sau khi đã bù đủ AI Bot, không nổ tổ hợp O(N^2))
  function buildDynamicPhrases(players) {
    const validPlayers = (players || []).filter((p) => p && p.name);
    const phrases = [];
    const seen = new Set();
    const addUnique = (s) => {
      const k = getTtsCacheKey(s);
      if (k && !seen.has(k)) {
        seen.add(k);
        phrases.push(s);
      }
    };

    for (const p of validPlayers) {
      const name = p.name;
      const defenseSec = p.isBot ? 8 : 60;
      addUnique(`Trời đã sáng. Đêm qua ${name} đã không qua khỏi.`);
      addUnique(`${name} bị đề cử nhiều nhất. Mời lần lượt lên biện hộ.`);
      addUnique(`🎤 Mời ${name} lên biện hộ. (${defenseSec} giây)`);
      addUnique(`⚖️ Mời cả làng vote cho ${name}: Treo cổ hay Tha.`);
      addUnique(`Làng đã quyết định! ${name} sẽ rời khỏi ván đấu. Xin hãy giữ im lặng tuyệt đối.`);
      addUnique(`Làng đã tha ${name}! Không ai bị xử tử hôm nay.`);
    }
    return phrases;
  }

  // Chia nhỏ theo từng cụm 6 câu + hỗ trợ lấy bù pendingKeys sau 3.2s để không bao giờ đụng trần Timeout Proxy Render
  async function pregenVoice(players, abortSignal) {
    if (!mcVoiceEnabled || pregenInProgressRef.current) return;
    const allPhrases = buildDynamicPhrases(players).filter(
      (p) => !voiceCacheRef.current.has(getTtsCacheKey(p))
    );
    if (allPhrases.length === 0) return;

    const CHUNK_SIZE = 6;
    const serverBatchUrl = `${SERVER_BASE_URL}/api/tts-batch`;

    pregenInProgressRef.current = true;
    setVoicePregening(true);
    let successCount = 0;
    const totalTarget = allPhrases.length;
    setVoicePregenProgress({ done: 0, total: totalTarget });

    try {
      let queueToFetch = [...allPhrases];
      for (let pass = 0; pass < 3 && queueToFetch.length > 0; pass += 1) {
        if (abortSignal?.aborted) break;
        if (pass > 0) {
          await new Promise((r) => setTimeout(r, 3200));
          if (abortSignal?.aborted) break;
        }
        const nextPending = [];
        for (let idx = 0; idx < queueToFetch.length; idx += CHUNK_SIZE) {
          if (abortSignal?.aborted) break;
          const chunk = queueToFetch
            .slice(idx, idx + CHUNK_SIZE)
            .filter((p) => !voiceCacheRef.current.has(getTtsCacheKey(p)));
          if (chunk.length === 0) continue;

          const resp = await fetch(serverBatchUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phrases: chunk, voice: vsProfileId, speed: 0.82 }),
            signal: abortSignal,
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.json();
          if (data?.vsOnline === false) {
            setVsStatusReady(false);
            setVsServerOffline(true);
            return;
          }
          const results = data?.results || {};
          const pendingSet = new Set(Array.isArray(data?.pending) ? data.pending : []);
          for (const phrase of chunk) {
            const trimmed = phrase.trim();
            const b64 = results[trimmed];
            if (b64) {
              const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
              const blob = new Blob([bytes], { type: 'audio/mpeg' });
              setCachedVoiceBlobUrl(phrase, blob);
              successCount += 1;
            } else if (pendingSet.has(trimmed)) {
              nextPending.push(phrase);
            }
          }
          if (successCount > 0 || data?.vsOnline === true) {
            setVsStatusReady(true);
            setVsServerOffline(false);
          }
          const completedSoFar = allPhrases.filter((p) =>
            voiceCacheRef.current.has(getTtsCacheKey(p))
          ).length;
          setVoicePregenProgress({ done: completedSoFar, total: totalTarget });
        }
        queueToFetch = nextPending;
      }
      if (successCount === 0 && !abortSignal?.aborted) {
        await probeVoiceServerStatus({ force: true });
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        console.warn('[VoicePregen] failed:', e.message);
        await probeVoiceServerStatus({ force: true });
      }
    } finally {
      pregenInProgressRef.current = false;
      setVoicePregening(false);
    }
  }

  // Giải phóng Blob URL cũ khi quay lại Sảnh Chờ; tự động kích hoạt Pre-gen khi vào ván hoặc khi Voice vừa bật lại (voiceRecheckTick)
  useEffect(() => {
    if (!room?.phase || room.phase === 'lobby') {
      if (voiceCacheRef.current.size > 0) {
        for (const blobUrl of voiceCacheRef.current.values()) {
          try { URL.revokeObjectURL(blobUrl); } catch {}
        }
        voiceCacheRef.current.clear();
      }
      setVoicePregening(false);
      return undefined;
    }

    if (room.phase === 'playing' && mcVoiceEnabled && Array.isArray(room.players) && room.players.length > 0) {
      const hasUncached = buildDynamicPhrases(room.players).some(
        (p) => !voiceCacheRef.current.has(getTtsCacheKey(p))
      );
      if (!hasUncached) return undefined;
      const ctrl = new AbortController();
      pregenVoice(room.players, ctrl.signal);
      return () => ctrl.abort();
    }
    return undefined;
  }, [room?.phase, room?.code, room?.players?.length, mcVoiceEnabled, voiceRecheckTick]);

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
  async function speakVoiceStudio(text) {
    if (!VOICESTUDIO_URL) return false; // production HTTPS → skip
    const cached = voiceCacheRef.current.get(getTtsCacheKey(text));
    if (cached) return await playMp3(cached);
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
      return blobUrl ? await playMp3(blobUrl) : false;
    } catch {
      vsAvailableRef.current = false;
      probeVoiceServerStatus({ force: true });
      return false;
    }
  }

  // Gọi /api/tts trên server Render (tra LRU RAM Cache ~5ms hoặc qua ngrok) kèm Circuit Breaker 8s
  async function speakViaServerProxy(text) {
    // Ưu tiên 1: Cache RAM ở Client (0ms)
    const cached = voiceCacheRef.current.get(getTtsCacheKey(text));
    if (cached) return await playMp3(cached);
    if (Date.now() < proxyCooldownUntilRef.current) return false;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 16000);
      const resp = await fetch(SERVER_TTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      return blobUrl ? await playMp3(blobUrl) : false;
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

  // Giữ nguyên Blob URL nằm trong voiceCacheRef xuyên suốt ván đấu (chỉ dọn khi về Lobby để phát lại không bao giờ lỗi 404)
  function playMp3(src, { revokeOnEnd = false } = {}) {
    return new Promise((resolve) => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      const cleanup = (ok) => {
        if (revokeOnEnd && typeof src === 'string' && src.startsWith('blob:')) {
          try { URL.revokeObjectURL(src); } catch {}
        }
        resolve(ok);
      };
      const audio = new Audio(src);
      audio.volume = 0.92;
      currentAudioRef.current = audio;
      audio.onended = () => cleanup(true);
      audio.onerror = () => cleanup(false);
      audio.play().catch(() => cleanup(false));
    });
  }

  useEffect(() => {
    if (!mcVoiceEnabled) return;
    if (mcLog.length === 0) return;
    const newMessages = mcLog.slice(lastSpokenRef.current + 1).filter(m => m.type !== 'player');
    if (newMessages.length === 0) { lastSpokenRef.current = mcLog.length - 1; return; }

    async function playAll() {
      const vsOnline = await checkVoiceStudio();
      const playerNames = (room?.players || []).map((p) => p?.name).filter(Boolean);

      for (const msg of newMessages) {
        const text = msg.text || msg;
        if (!text) continue;

        // Ưu tiên 1: Nếu câu đã có sẵn bản Voice Clone cá nhân hóa trong Cache RAM -> Phát ngay 0ms!
        const cachedBlobUrl = voiceCacheRef.current.get(getTtsCacheKey(text));
        if (cachedBlobUrl) {
          const cachedOk = await playMp3(cachedBlobUrl);
          if (cachedOk) continue;
        }

        const isPersonalized =
          text.includes('AI Bot') || playerNames.some((n) => text.includes(n));

        // Ưu tiên 2A (Câu chuyển pha chung không chứa tên riêng): Phát ngay 27 file MP3 tĩnh trên Vercel (0ms)
        if (!isPersonalized) {
          const staticSrc = findAudioFile(text);
          if (staticSrc) {
            const mp3Played = await playMp3(staticSrc);
            if (mp3Played) continue;
          }
        }

        // Ưu tiên 2B (Câu có tên người chơi hoặc chưa có MP3 tĩnh): Gọi VoiceStudio / Server RAM Cache (~5ms nếu Server đã tạo trước!)
        let dynamicPlayed = false;
        if (VOICESTUDIO_URL) {
          if (vsOnline) {
            dynamicPlayed = await speakVoiceStudio(text);
          } else {
            dynamicPlayed = await speakViaServerProxy(text);
          }
        } else {
          dynamicPlayed = await speakViaServerProxy(text);
        }
        if (dynamicPlayed) continue;

        // Ưu tiên 3 (Khi PC cá nhân tắt / Offline): Nếu câu trùng mẫu MP3 tĩnh chung (begin_vote, hang_announce, spare_announce) thì phát MP3 tiếng Việt
        if (isPersonalized) {
          const fallbackStaticSrc = findAudioFile(text);
          if (fallbackStaticSrc) {
            await playMp3(fallbackStaticSrc);
          }
        }
        // Tuyệt đối 0% window.speechSynthesis — giữ im lặng sạch sẽ thay vì đọc giọng Tiếng Anh!
      }
    }

    playAll();

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
        ? generateDefaultRoles(Math.max(6, room.players.length))
        : generateExpandedV33Roles(Math.max(8, room.players.length));
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

  // Chuyen sang man hinh choi game khi van bat dau
  if (room.phase === "playing" || room.phase === "ended") {
    return (
      <PlayingView 
        room={room} 
        socketRef={socketRef} 
        mcLog={mcLog}
        mcVoiceEnabled={mcVoiceEnabled}
        setMcVoiceEnabled={setMcVoiceEnabled}
        onLeave={handleLeave}
        voicePregening={voicePregening}
        voicePregenProgress={voicePregenProgress}
        vsServerOffline={vsServerOffline}
        vsStatusReady={vsStatusReady}
        vsStatusChecking={vsStatusChecking}
        onRecheckVoice={handleManualRecheckVoice}
        voiceRecheckTick={voiceRecheckTick}
      />
    );
  }

  const me = room.players.find((p) => p.id === myId);
  const rolesConfig = room.rolesConfig || generateDefaultRoles(Math.max(6, room.players.length));
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
          <span
            className={`lobby-privacy-chip mode-${roomAccessMode}`}
            title={
              roomAccessMode === "hidden"
                ? "Phòng ẩn khỏi trang chủ — chỉ vào được bằng Mã 5 ký tự"
                : roomAccessMode === "password"
                  ? "Phòng có khóa mật khẩu"
                  : "Phòng mở công khai trên trang chủ"
            }
          >
            {roomAccessMode === "hidden"
              ? "🕵️ Phòng ẩn (Gửi mã)"
              : roomAccessMode === "password"
                ? "🔐 Có mật khẩu"
                : "🌍 Công khai"}
          </span>
        </div>

        <div className="lobby-header-center">
          <div className="lobby-stat-chip">
            👤 {realHumansCount} người{botCount > 0 ? ` + 🤖 ${botCount} Bot` : ""} / {seatRingTarget} ghế
          </div>
          <div className={`lobby-stat-chip ${isAllReady ? "ready-all" : ""}`}>
            🟢 {readyCount}/{totalPlayers} sẵn sàng
          </div>
          <div className={`lobby-stat-chip ${isRolesValidForStart && hasWolf ? "roles-matched" : "roles-mismatch"}`}>
            🎭 {totalRoles} vai{missingBotsToFill > 0 ? ` (Tự bù +${missingBotsToFill} 🤖)` : ""}
          </div>
        </div>

        <div className="lobby-header-actions">
          <button
            type="button"
            className="btn-lobby-pill"
            onClick={handleManualRecheckVoice}
            title={
              vsServerOffline
                ? "Máy chủ VoiceStudio cá nhân đang tắt (vẫn phát MP3 tĩnh tiếng Việt, 0% tiếng Anh) — Bấm để kiểm tra lại ngay!"
                : "Máy chủ Voice Clone cá nhân (RTX 3090) đang trực tuyến sẵn sàng — Bấm để làm mới trạng thái"
            }
            style={{
              borderColor: vsServerOffline
                ? "rgba(248, 113, 113, 0.55)"
                : "rgba(52, 211, 153, 0.55)",
              background: vsServerOffline
                ? "rgba(127, 29, 29, 0.42)"
                : "rgba(6, 78, 59, 0.38)",
              color: vsServerOffline ? "#fecaca" : "#a7f3d0",
              fontWeight: 700,
            }}
          >
            {vsStatusChecking
              ? "⏳ Đang kiểm tra Voice..."
              : vsServerOffline
                ? "🔴 Voice Offline (Bấm thử lại)"
                : vsStatusReady
                  ? "🟢 Voice Clone Sẵn Sàng"
                  : "🟡 Đang kết nối Voice..."}
          </button>

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

              {/* Thanh Bảo Mật Phòng & Điều Khiển AI Bot Chính Thức (Chủ Phòng) */}
              {me?.isHost && (
                <div className="lobby-access-bot-panel">
                  <div className="lobby-access-row">
                    <span className="mini-panel-label">🔒 Chế độ phòng:</span>
                    <div className="lobby-mini-pills">
                      <button
                        type="button"
                        className={`mini-pill ${roomAccessMode === "public" && !showPwdEditor ? "active-pub" : ""}`}
                        onClick={() => {
                          setShowPwdEditor(false);
                          handleChangeAccessMode("public");
                        }}
                      >
                        🌍 Công khai
                      </button>
                      <button
                        type="button"
                        className={`mini-pill ${roomAccessMode === "password" || showPwdEditor ? "active-pwd" : ""}`}
                        onClick={() => setShowPwdEditor((v) => !v)}
                      >
                        🔐 Mật khẩu
                      </button>
                      <button
                        type="button"
                        className={`mini-pill ${roomAccessMode === "hidden" && !showPwdEditor ? "active-hid" : ""}`}
                        onClick={() => {
                          setShowPwdEditor(false);
                          handleChangeAccessMode("hidden");
                        }}
                      >
                        🕵️ Phòng ẩn
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
                        placeholder="Nhập mật khẩu mới cho phòng..."
                        autoFocus
                      />
                      <button type="submit" className="btn-save-pwd">
                        Lưu khóa
                      </button>
                    </form>
                  )}

                  <div className="lobby-access-row">
                    <span className="mini-panel-label">🤖 Ghế AI Bot:</span>
                    <div className="lobby-mini-pills">
                      <button
                        type="button"
                        className="mini-pill bot-btn"
                        onClick={() => handleManageBots("fill_roles")}
                        title="Triệu hồi AI Bot ngồi vào ghế 3D cho khớp tổng số vai đang chọn"
                      >
                        ⚡ Lấp đủ ({totalRoles} ghế)
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
                          className="mini-pill bot-clear"
                          onClick={() => handleManageBots("clear")}
                        >
                          🗑️ Xóa Bot ({botCount})
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Thanh Chọn Vai Muốn Test Khi Đang Ở Phòng 1 Mình (Tự Khóa Công Bằng Khi Có Người Thứ 2!) */}
              {realHumansCount === 1 && (
                <div className="solo-role-picker-box">
                  <div className="solo-role-picker-header">
                    <span>🎯 Chơi 1 mình — Chọn vai muốn thử:</span>
                    <span className="solo-fair-note">Tự khóa ngẫu nhiên nếu có người thứ 2 vào</span>
                  </div>
                  <div className="solo-role-chips">
                    <button
                      type="button"
                      className={`solo-role-chip ${!activeSoloRole ? "selected" : ""}`}
                      onClick={() => handleSelectSoloRole(null)}
                    >
                      🎲 Ngẫu nhiên
                    </button>
                    {ORDERED_ROLES.map((rk) => {
                      const rc = ROLES_CONFIG[rk];
                      if (!rc) return null;
                      return (
                        <button
                          key={rk}
                          type="button"
                          className={`solo-role-chip ${activeSoloRole === rk ? "selected" : ""}`}
                          onClick={() => handleSelectSoloRole(rk)}
                        >
                          {rc.emoji} {rc.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Thanh Thiết Lập Nhanh 1-Click cho Chủ Phòng / Chú thích đồng bộ cho Khách */}
              {me?.isHost ? (
                <div className="roles-preset-bar compact">
                  <div className="roles-preset-buttons">
                    <button
                      type="button"
                      className="btn-preset-v33"
                      onClick={() => handlePresetRoles("v33")}
                      title="Bật ngay Thợ Săn · Thần Tình Yêu · Sói Đầu Đàn · Trưởng Làng cân bằng!"
                    >
                      🔥 Mở Rộng V3.3 ({Math.max(8, totalPlayers)}p)
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
                      title="Tự động bù Nông Dân cho khớp số ghế"
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

              {!isRolesValidForStart && (
                <div className="roles-mismatch-alert">
                  ⚠️ Đang chọn <strong>{totalRoles}</strong> vai cho <strong>{totalPlayers}</strong> ghế (tối thiểu 6 vai & không ít hơn số người trong phòng).{" "}
                  {me?.isHost ? "Bấm '+ / -', 'Mở Rộng V3.3' hoặc '➕ Bù Dân' để cân bằng." : "Chờ chủ phòng cân chỉnh."}
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
          <span className={`checklist-item ${realHumansCount >= 1 ? "valid" : "invalid"}`}>
            ✅ {realHumansCount} người{botCount > 0 ? ` + ${botCount} 🤖` : ""}
            {missingBotsToFill > 0 ? ` (Tự bù +${missingBotsToFill} 🤖)` : ""}
          </span>
          <span className={`checklist-item ${isAllReady ? "valid" : "invalid"}`}>
            {isAllReady ? "✅" : "⚠️"} Sẵn sàng ({readyCount}/{totalPlayers})
          </span>
          <span className={`checklist-item ${isRolesValidForStart && hasWolf ? "valid" : "invalid"}`}>
            {isRolesValidForStart && hasWolf ? "✅" : "⚠️"} Bộ bài {totalRoles} vai (≥1 Sói)
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
              !isAllReady
                ? `Còn ${unreadyPlayers.length} người chơi chưa sẵn sàng`
                : !isRolesValidForStart
                  ? `Cần tối thiểu 6 vai và không ít hơn số người hiện có (${totalRoles}/${totalPlayers})`
                  : !hasWolf
                    ? "Cần ít nhất 1 Sói hoặc 1 Sói Đầu Đàn"
                    : missingBotsToFill > 0
                      ? `Hệ thống sẽ tự triệu hồi thêm +${missingBotsToFill} AI Bot lấp đủ ${totalRoles} ghế và vào Đêm 1 ngay!`
                      : "Bấm để phân vai bí mật và bắt đầu Đêm đầu tiên!"
            }
          >
            {missingBotsToFill > 0
              ? `🚀 BẮT ĐẦU NGAY (Tự Bù +${missingBotsToFill} 🤖 Bot)`
              : "🚀 PHÂN VAI & BẮT ĐẦU VÁN ĐẤU"}
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
