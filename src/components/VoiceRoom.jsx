import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LiveKitRoom,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  AudioTrack,
} from "@livekit/components-react";
import { DisconnectReason, RoomEvent, Track } from "livekit-client";
import "@livekit/components-styles";
import { isWolfTeamRole } from "../config/roles.config.js";
import { VOICE_CAPTURE_OPTIONS, useP2PVoiceMesh } from "../utils/p2pVoiceEngine.js";
import "./VoiceRoom.css";

const VOICE_INPUT_MODE_KEY = "ws_voice_input_mode";
const LIVEKIT_TOKEN_TIMEOUT_MS = 5500;

// Cấu hình phòng LiveKit chuyên Thoại Game (Opus 16kbps + DTX 0 kbps khi im lặng)
const VOICE_ROOM_OPTIONS = {
  adaptiveStream: false,
  dynacast: false,
  webAudioMix: false,
  disconnectOnPageLeave: true,
  stopLocalTrackOnUnpublish: true,
  audioCaptureDefaults: VOICE_CAPTURE_OPTIONS,
  publishDefaults: {
    audioPreset: { maxBitrate: 16_000, priority: "high" },
    dtx: true,
    red: true,
    forceStereo: false,
    simulcast: false,
    stopMicTrackOnMute: false,
  },
};

// KHÓA KÉP ZERO-LEAK: Không tự động subscribe bất kỳ luồng âm thanh nào cho đến khi qua bộ lọc vai trò/ban đêm
const VOICE_CONNECT_OPTIONS = {
  autoSubscribe: false,
  maxRetries: 1,
};

const AUDIO_RENDER_EVENTS = [
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.ParticipantDisconnected,
];

const PANEL_SYNC_EVENTS = [
  RoomEvent.Connected,
  RoomEvent.Reconnected,
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.ActiveSpeakersChanged,
];

const VoiceSessionContext = createContext(null);

export function useVoiceSession() {
  return useContext(VoiceSessionContext);
}

function isTypingInTextField(target) {
  const el = target || (typeof document !== "undefined" ? document.activeElement : null);
  if (!el) return false;
  const tag = String(el.tagName || "").toUpperCase();
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    Boolean(el.isContentEditable)
  );
}

// Điều phối thuê bao SFU chủ động: Cắt 100% gói tin chiều về (0 kbps) vào ban đêm cho Dân Làng, lúc lật bài 6s & khi Mute cá nhân
function SelectiveSubscriptionManager({ shouldHearIdentity, isSuppressedForRecap }) {
  const room = useRoomContext();

  const syncSubscriptions = useCallback(() => {
    if (!room?.remoteParticipants) return;
    room.remoteParticipants.forEach((participant) => {
      const shouldSubAudio =
        !isSuppressedForRecap && Boolean(shouldHearIdentity(participant.identity));

      participant.audioTrackPublications.forEach((pub) => {
        try {
          if (typeof pub.setSubscribed === "function" && pub.isDesired !== shouldSubAudio) {
            pub.setSubscribed(shouldSubAudio);
          }
        } catch {
          // ignore transient signaling state
        }
      });

      participant.videoTrackPublications.forEach((pub) => {
        try {
          if (typeof pub.setSubscribed === "function" && pub.isDesired !== false) {
            pub.setSubscribed(false);
          }
        } catch {
          // ignore
        }
      });
    });
  }, [room, shouldHearIdentity, isSuppressedForRecap]);

  useEffect(() => {
    syncSubscriptions();
  }, [syncSubscriptions]);

  useEffect(() => {
    if (!room) return undefined;
    room.on(RoomEvent.Connected, syncSubscriptions);
    room.on(RoomEvent.Reconnected, syncSubscriptions);
    room.on(RoomEvent.ParticipantConnected, syncSubscriptions);
    room.on(RoomEvent.TrackPublished, syncSubscriptions);
    return () => {
      room.off(RoomEvent.Connected, syncSubscriptions);
      room.off(RoomEvent.Reconnected, syncSubscriptions);
      room.off(RoomEvent.ParticipantConnected, syncSubscriptions);
      room.off(RoomEvent.TrackPublished, syncSubscriptions);
    };
  }, [room, syncSubscriptions]);

  return null;
}

// Quản lý trạng thái Micro phần cứng an toàn (Không văng kênh khi máy thiếu Mic -> tự giữ chế độ Chỉ Nghe!)
function VoiceParticipantManager({
  canPublish,
  wantTransmitNow,
  micRetryNonce,
  onMicWarning,
}) {
  const { localParticipant } = useLocalParticipant();
  const micBlockedRef = useRef(false);
  const lastNonceRef = useRef(micRetryNonce);

  useEffect(() => {
    if (lastNonceRef.current !== micRetryNonce) {
      lastNonceRef.current = micRetryNonce;
      micBlockedRef.current = false;
    }
  }, [micRetryNonce]);

  useEffect(() => {
    if (!localParticipant) return;

    // Người đã chết hoặc Khán giả: ngắt hẳn track thu âm phần cứng (0% hao pin & giữ nguyên phiên Chỉ Nghe)
    if (!canPublish) {
      localParticipant.setMicrophoneEnabled(false).catch(() => {});
      localParticipant.audioTrackPublications?.forEach((pub) => {
        try {
          if (pub.track) {
            localParticipant.unpublishTrack(pub.track, true);
          }
        } catch {
          // ignore
        }
      });
      return;
    }

    if (wantTransmitNow && micBlockedRef.current) {
      return;
    }

    if (localParticipant.isMicrophoneEnabled !== wantTransmitNow) {
      localParticipant
        .setMicrophoneEnabled(wantTransmitNow, VOICE_CAPTURE_OPTIONS)
        .then(() => {
          if (wantTransmitNow) {
            micBlockedRef.current = false;
            onMicWarning?.(null);
          }
        })
        .catch((err) => {
          micBlockedRef.current = true;
          const errName = String(err?.name || err?.message || "");
          if (/NotAllowed|Permission/i.test(errName)) {
            onMicWarning?.("Bạn đang chặn quyền Micro — vẫn nghe mọi người bình thường (Chỉ Nghe).");
          } else if (/NotFound|Device/i.test(errName)) {
            onMicWarning?.("Không tìm thấy thiết bị Micro — đang ở chế độ Chỉ Nghe.");
          } else {
            onMicWarning?.("Không mở được Micro — bạn vẫn nghe mọi người bình thường.");
          }
        });
    }
  }, [canPublish, wantTransmitNow, micRetryNonce, localParticipant, onMicWarning]);

  return null;
}

// Đồng bộ danh sách Thành viên & Người đang nói từ LiveKit SFU ra Context chung (Hiện cả Bạn & người tắt Mic)
function LiveKitRosterAndSpeakersSync({
  myId,
  canSpeak,
  wantTransmitNow,
  shouldHearIdentity,
  isSuppressedForRecap,
  onPeersSync,
  onSpeakingSync,
  onAutoplayStateChange,
}) {
  const room = useRoomContext();

  const syncState = useCallback(() => {
    if (!room) return;

    // 1. Danh sách tất cả người tham gia kênh thoại từ xa
    const peers = [];
    room.remoteParticipants?.forEach((p) => {
      if (!p?.identity) return;
      peers.push({
        identity: p.identity,
        displayName: p.name || p.identity.slice(0, 8),
        canPublish: !String(p.identity).startsWith("spec_"),
        isSpectator: String(p.identity).startsWith("spec_"),
        isMicEnabled: Boolean(p.isMicrophoneEnabled),
      });
    });
    onPeersSync(peers);

    // 2. Danh sách người đang phát sóng âm (Zero-Leak)
    const active = Array.isArray(room.activeSpeakers) ? room.activeSpeakers : [];
    const allowedIds = [];
    if (!isSuppressedForRecap) {
      for (const p of active) {
        if (!p) continue;
        if (p.isLocal) {
          if (canSpeak && wantTransmitNow && p.isMicrophoneEnabled) {
            const selfId = myId || p.identity;
            if (selfId && !allowedIds.includes(selfId)) allowedIds.push(selfId);
          }
        } else if (shouldHearIdentity(p.identity)) {
          if (!allowedIds.includes(p.identity)) {
            allowedIds.push(p.identity);
          }
        }
      }
    }
    allowedIds.sort();
    onSpeakingSync(allowedIds);
  }, [
    room,
    myId,
    canSpeak,
    wantTransmitNow,
    shouldHearIdentity,
    isSuppressedForRecap,
    onPeersSync,
    onSpeakingSync,
  ]);

  useEffect(() => {
    syncState();
  }, [syncState]);

  useEffect(() => {
    if (!room) return undefined;
    PANEL_SYNC_EVENTS.forEach((ev) => room.on(ev, syncState));

    const checkPlayback = () => {
      onAutoplayStateChange(!room.canPlaybackAudio, () => {
        room.startAudio?.().catch(() => {});
      });
    };
    checkPlayback();
    room.on(RoomEvent.AudioPlaybackStatusChanged, checkPlayback);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        room.startAudio?.().catch(() => {});
        checkPlayback();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      PANEL_SYNC_EVENTS.forEach((ev) => room.off(ev, syncState));
      room.off(RoomEvent.AudioPlaybackStatusChanged, checkPlayback);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [room, syncState, onAutoplayStateChange]);

  return null;
}

// Bộ phát âm thanh LiveKit kèm Auto-Ducking (-40% -> 0.6x khi MC đọc) & Tạm ngắt khi xem Phim Kể Chuyện
function CustomAudioRenderer({
  shouldHearIdentity,
  volumeMap,
  mcDuckingActive,
  isSuppressedForRecap,
}) {
  const tracks = useTracks([Track.Source.Microphone], {
    onlySubscribed: true,
    updateOnlyOn: AUDIO_RENDER_EVENTS,
  });

  const duckFactor = isSuppressedForRecap ? 0 : mcDuckingActive ? 0.6 : 1;

  return (
    <>
      {tracks.map((trackRef) => {
        const identity = trackRef.participant.identity;
        if (trackRef.participant.isLocal) return null;
        if (duckFactor <= 0 || !shouldHearIdentity(identity)) return null;

        const baseVol = volumeMap[identity] ?? 1;
        const effectiveVol = Math.max(0, Math.min(1, baseVol * duckFactor));
        return <AudioTrack key={identity} trackRef={trackRef} volume={effectiveVol} />;
      })}
    </>
  );
}

// =============================================================================
// PROVIDER GỐC CẤP PHÒNG (Giữ kết nối WebRTC xuyên suốt Sảnh Chờ <-> Trong Trận <-> Ván Mới)
// =============================================================================
export function VoiceSessionProvider({
  socketRef,
  roomCode,
  isLobby = false,
  nightDayPhase = null,
  hasWinner = false,
  isSpectator = false,
  myId = null,
  myName = "Bạn",
  myRole = null,
  isAlive = true,
  wolfTeammates = [],
  mcDuckingActive = false,
  isSuppressedForRecap = false,
  onSpeakingChange,
  children,
}) {
  const [hasJoined, setHasJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [engineMode, setEngineMode] = useState("idle"); // 'idle' | 'livekit' | 'p2p'
  const [lkToken, setLkToken] = useState(null);
  const [lkUrl, setLkUrl] = useState(null);
  const [lkConnected, setLkConnected] = useState(false);
  const [lkRemotePeers, setLkRemotePeers] = useState([]);
  const [lkSpeakingIds, setLkSpeakingIds] = useState([]);
  const [lkMicWarning, setLkMicWarning] = useState(null);
  const [lkAutoplayBlocked, setLkAutoplayBlocked] = useState(false);

  const [volumeMap, setVolumeMap] = useState({});
  const [userMicPreference, setUserMicPreference] = useState(true);
  const [micRetryNonce, setMicRetryNonce] = useState(0);
  const [inputMode, setInputMode] = useState(() => {
    try {
      return localStorage.getItem(VOICE_INPUT_MODE_KEY) === "ptt" ? "ptt" : "vad";
    } catch {
      return "vad";
    }
  });
  const [isPttPressed, setIsPttPressed] = useState(false);

  const tokenCanPublishRef = useRef(false);
  const lkStartAudioFnRef = useRef(null);
  const lkSignalFailuresRef = useRef(0);
  const tokenTimeoutRef = useRef(null);
  const lastBroadcastSpeakersKeyRef = useRef("");

  // Phân loại chính xác trạng thái Zero-Leak theo từng giây của ván đấu
  const isRoleReveal = Boolean(!isLobby && !hasWinner && nightDayPhase === "role_reveal");
  const isNightPhase = Boolean(
    !isLobby && !hasWinner && String(nightDayPhase || "").startsWith("night_")
  );
  const canPublish = Boolean(isAlive && !isSpectator);

  const canSpeak = useMemo(() => {
    if (!canPublish || isSuppressedForRecap) return false;
    if (isLobby || hasWinner) return true;
    if (isRoleReveal) return false; // Khóa cứng 6s Nhận Vai Định Mệnh chống lộ cảm thán!
    if (isNightPhase) return Boolean(isWolfTeamRole(myRole));
    return true;
  }, [canPublish, isSuppressedForRecap, isLobby, hasWinner, isRoleReveal, isNightPhase, myRole]);

  const isNightSilentShield = Boolean(
    (isRoleReveal || (isNightPhase && !(isWolfTeamRole(myRole) && canPublish))) && !isLobby
  );

  const wantTransmitNow = Boolean(
    hasJoined &&
      canSpeak &&
      !isSuppressedForRecap &&
      (inputMode === "ptt" ? isPttPressed : userMicPreference)
  );

  const shouldHearIdentity = useCallback(
    (identity) => {
      if (!identity || String(identity).startsWith("spec_")) return false;
      if (isSuppressedForRecap) return false;
      if (volumeMap?.[identity] === 0) return false;
      if (isLobby || hasWinner) return true;
      if (isRoleReveal) return false;
      if (isNightPhase) {
        return Boolean(
          isWolfTeamRole(myRole) && isAlive && !isSpectator && wolfTeammates.includes(identity)
        );
      }
      return true;
    },
    [
      isSuppressedForRecap,
      volumeMap,
      isLobby,
      hasWinner,
      isRoleReveal,
      isNightPhase,
      myRole,
      isAlive,
      isSpectator,
      wolfTeammates,
    ]
  );

  const clearTokenTimeout = useCallback(() => {
    if (tokenTimeoutRef.current) {
      clearTimeout(tokenTimeoutRef.current);
      tokenTimeoutRef.current = null;
    }
  }, []);

  const switchToP2PFallback = useCallback(() => {
    clearTokenTimeout();
    setLkToken(null);
    setLkUrl(null);
    setLkConnected(false);
    setLkRemotePeers([]);
    setLkSpeakingIds([]);
    setLkAutoplayBlocked(false);
    setConnecting(false);
    setEngineMode("p2p");
  }, [clearTokenTimeout]);

  const requestVoiceSession = useCallback(
    ({ forceRefresh = false } = {}) => {
      const socket = socketRef?.current;
      if (!socket || !roomCode) return;
      if (!forceRefresh && engineMode === "livekit" && lkToken && lkUrl) return;

      clearTokenTimeout();
      setConnecting(true);

      let settled = false;
      tokenTimeoutRef.current = setTimeout(() => {
        if (settled) return;
        settled = true;
        switchToP2PFallback();
      }, LIVEKIT_TOKEN_TIMEOUT_MS);

      socket.emit("livekit:token", {}, (res) => {
        if (settled) return;
        settled = true;
        clearTokenTimeout();

        if (res?.mode === "livekit" && res?.token && res?.url) {
          tokenCanPublishRef.current = Boolean(res.canPublish);
          lkSignalFailuresRef.current = 0;
          setLkToken(res.token);
          setLkUrl(res.url);
          setEngineMode("livekit");
          setConnecting(false);
          return;
        }

        // Bất kỳ trường hợp hết hạn mức 429 / chưa cấu hình LiveKit -> nhảy sang P2P Mesh 0đ ngay lập tức!
        switchToP2PFallback();
      });
    },
    [socketRef, roomCode, engineMode, lkToken, lkUrl, clearTokenTimeout, switchToP2PFallback]
  );

  // Tự động cấp lại Token có quyền nói (canPublish: true) khi người chết ván trước quay về Sảnh / sang ván mới!
  useEffect(() => {
    if (!hasJoined) return;
    if (engineMode === "idle") {
      requestVoiceSession({ forceRefresh: true });
      return;
    }
    if (engineMode === "livekit" && canPublish && !tokenCanPublishRef.current) {
      requestVoiceSession({ forceRefresh: true });
    }
  }, [hasJoined, engineMode, canPublish, requestVoiceSession]);

  // Nếu đổi sang mã phòng khác -> reset sạch
  const prevRoomCodeRef = useRef(roomCode);
  useEffect(() => {
    if (prevRoomCodeRef.current && roomCode && prevRoomCodeRef.current !== roomCode) {
      clearTokenTimeout();
      setHasJoined(false);
      setEngineMode("idle");
      setLkToken(null);
      setLkUrl(null);
      setLkConnected(false);
      setLkRemotePeers([]);
      setLkSpeakingIds([]);
    }
    prevRoomCodeRef.current = roomCode;
  }, [roomCode, clearTokenTimeout]);

  // Động cơ dự phòng P2P Mesh ($0/tháng — chỉ chạy khi engineMode === 'p2p')
  const p2p = useP2PVoiceMesh({
    active: Boolean(hasJoined && engineMode === "p2p"),
    socketRef,
    roomCode,
    myFallbackId: myId,
    myFallbackName: myName,
    canPublish,
    wantTransmitNow,
    volumeMap,
    mcDuckingActive,
    isSuppressedForRecap,
    shouldHearIdentity,
  });

  // Phím Space giữ để nói toàn cục (hoạt động ngay cả khi đang mở tab Sân Khấu 3D!)
  useEffect(() => {
    if (!hasJoined || inputMode !== "ptt" || !canSpeak) {
      setIsPttPressed(false);
      return undefined;
    }

    const handleKeyDown = (e) => {
      if (e.code !== "Space" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingInTextField(e.target)) return;
      e.preventDefault();
      if (!e.repeat) {
        setMicRetryNonce((n) => n + 1);
        setIsPttPressed(true);
      }
    };

    const handleKeyUp = (e) => {
      if (e.code !== "Space") return;
      setIsPttPressed(false);
    };

    const releaseMic = () => setIsPttPressed(false);
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") {
        setIsPttPressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", releaseMic);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", releaseMic);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [hasJoined, inputMode, canSpeak]);

  // Hợp nhất danh sách người đang nói (LiveKit hoặc P2P) và báo lên Sân khấu 3D
  const activeSpeakingIds = useMemo(() => {
    if (!hasJoined || isSuppressedForRecap) return [];
    return engineMode === "p2p" ? p2p.speakingIds : lkSpeakingIds;
  }, [hasJoined, isSuppressedForRecap, engineMode, p2p.speakingIds, lkSpeakingIds]);

  useEffect(() => {
    const key = activeSpeakingIds.join("|");
    if (key !== lastBroadcastSpeakersKeyRef.current) {
      lastBroadcastSpeakersKeyRef.current = key;
      onSpeakingChange?.(activeSpeakingIds);
    }
  }, [activeSpeakingIds, onSpeakingChange]);

  useEffect(() => {
    return () => {
      clearTokenTimeout();
      onSpeakingChange?.([]);
    };
  }, [clearTokenTimeout, onSpeakingChange]);

  const joinVoice = useCallback(() => {
    setLkMicWarning(null);
    p2p.clearMicWarning?.();
    setMicRetryNonce((n) => n + 1);
    setHasJoined(true);
    setEngineMode("idle");
  }, [p2p]);

  const leaveVoice = useCallback(() => {
    clearTokenTimeout();
    setIsPttPressed(false);
    setHasJoined(false);
    setConnecting(false);
    setEngineMode("idle");
    setLkToken(null);
    setLkUrl(null);
    setLkConnected(false);
    setLkRemotePeers([]);
    setLkSpeakingIds([]);
    setLkMicWarning(null);
    setLkAutoplayBlocked(false);
    onSpeakingChange?.([]);
  }, [clearTokenTimeout, onSpeakingChange]);

  const toggleMic = useCallback(() => {
    if (!canSpeak) return;
    setMicRetryNonce((n) => n + 1);
    setUserMicPreference((prev) => !prev);
  }, [canSpeak]);

  const toggleMutePeer = useCallback((identity) => {
    if (!identity) return;
    setVolumeMap((prev) => ({
      ...prev,
      [identity]: prev[identity] === 0 ? 1 : 0,
    }));
  }, []);

  const switchInputMode = useCallback((nextMode) => {
    setInputMode(nextMode);
    setIsPttPressed(false);
    try {
      localStorage.setItem(VOICE_INPUT_MODE_KEY, nextMode);
    } catch {
      // ignore storage quota
    }
  }, []);

  const handleLkAutoplayChange = useCallback((blocked, startFn) => {
    lkStartAudioFnRef.current = startFn || null;
    setLkAutoplayBlocked(Boolean(blocked));
  }, []);

  const resumeAudioPlayback = useCallback(() => {
    if (engineMode === "p2p") {
      p2p.resumePlayback();
    } else {
      lkStartAudioFnRef.current?.();
      setLkAutoplayBlocked(false);
    }
  }, [engineMode, p2p]);

  const rawRemotePeers = engineMode === "p2p" ? p2p.remotePeers : lkRemotePeers;
  const visibleRemotePeers = useMemo(() => {
    if (isNightSilentShield) return [];
    return rawRemotePeers.filter((p) => {
      if (!p?.identity || p.identity === myId) return false;
      if (p.isSpectator || String(p.identity).startsWith("spec_")) return false;
      if (isNightPhase) {
        return wolfTeammates.includes(p.identity);
      }
      return true;
    });
  }, [rawRemotePeers, isNightSilentShield, myId, isNightPhase, wolfTeammates]);

  let channelLabel = "☀️ Kênh Chung";
  if (isSuppressedForRecap) {
    channelLabel = "🎬 Tạm ngắt (Đang xem phim)";
  } else if (isSpectator) {
    channelLabel = "👀 Khán Giả (Chỉ nghe)";
  } else if (!isAlive) {
    channelLabel = "💀 Đã hy sinh (Chỉ nghe)";
  } else if (isLobby) {
    channelLabel = "🏡 Thoại Sảnh Chờ";
  } else if (isRoleReveal) {
    channelLabel = "🎭 Nhận Vai (Khóa Mic 6s)";
  } else if (isNightPhase) {
    channelLabel = isWolfTeamRole(myRole) ? "🐺 Kênh Bầy Sói" : "🌙 Đêm Ngủ (0 kbps)";
  }

  const activeWarning = engineMode === "p2p" ? p2p.micWarning : lkMicWarning;
  const clearActiveWarning = useCallback(() => {
    setLkMicWarning(null);
    p2p.clearMicWarning?.();
  }, [p2p]);

  const autoplayBlocked = engineMode === "p2p" ? p2p.autoplayBlocked : lkAutoplayBlocked;
  const isEngineReady =
    engineMode === "p2p" ? p2p.connected : Boolean(engineMode === "livekit" && lkConnected);

  const sessionValue = useMemo(
    () => ({
      hasJoined,
      connecting: connecting || (hasJoined && !isEngineReady),
      isEngineReady,
      engineMode,
      isLobby,
      isRoleReveal,
      isNightPhase,
      isNightSilentShield,
      isSuppressedForRecap,
      mcDuckingActive,
      canPublish,
      canSpeak,
      wantTransmitNow,
      myId,
      myName,
      myRole,
      isAlive,
      isSpectator,
      inputMode,
      switchInputMode,
      userMicPreference,
      toggleMic,
      isPttPressed,
      setIsPttPressed,
      volumeMap,
      toggleMutePeer,
      visibleRemotePeers,
      activeSpeakingIds,
      channelLabel,
      activeWarning,
      clearActiveWarning,
      autoplayBlocked,
      resumeAudioPlayback,
      joinVoice,
      leaveVoice,
    }),
    [
      hasJoined,
      connecting,
      isEngineReady,
      engineMode,
      isLobby,
      isRoleReveal,
      isNightPhase,
      isNightSilentShield,
      isSuppressedForRecap,
      mcDuckingActive,
      canPublish,
      canSpeak,
      wantTransmitNow,
      myId,
      myName,
      myRole,
      isAlive,
      isSpectator,
      inputMode,
      switchInputMode,
      userMicPreference,
      toggleMic,
      isPttPressed,
      volumeMap,
      toggleMutePeer,
      visibleRemotePeers,
      activeSpeakingIds,
      channelLabel,
      activeWarning,
      clearActiveWarning,
      autoplayBlocked,
      resumeAudioPlayback,
      joinVoice,
      leaveVoice,
    ]
  );

  return (
    <VoiceSessionContext.Provider value={sessionValue}>
      {/* Cầu âm thanh LiveKit chạy ngầm liên thông không bao giờ bị unmount khi đổi Tab / Sảnh <-> Trận */}
      {hasJoined && engineMode === "livekit" && lkToken && lkUrl && (
        <LiveKitRoom
          serverUrl={lkUrl}
          token={lkToken}
          connect={true}
          video={false}
          audio={false}
          options={VOICE_ROOM_OPTIONS}
          connectOptions={VOICE_CONNECT_OPTIONS}
          className="livekit-custom"
          onConnected={() => {
            lkSignalFailuresRef.current = 0;
            setLkConnected(true);
            setConnecting(false);
          }}
          onError={(err) => {
            const msg = String(err?.message || "");
            // Nếu chỉ là lỗi quyền Micro nội bộ thì giữ nguyên phòng SFU ở chế độ Chỉ Nghe
            if (/NotAllowed|NotFound|Permission|microphone|device/i.test(msg)) {
              setLkMicWarning("Không mở được Micro — đang giữ chế độ Chỉ Nghe.");
              return;
            }
            // Lỗi kết nối WebSocket / hết hạn mức LiveKit -> nhảy êm sang P2P Mesh < 300ms!
            switchToP2PFallback();
          }}
          onDisconnected={(reason) => {
            setLkConnected(false);
            setLkSpeakingIds([]);
            setIsPttPressed(false);
            if (!hasJoined) return;

            if (
              reason === DisconnectReason.CLIENT_INITIATED ||
              reason === DisconnectReason.DUPLICATE_IDENTITY ||
              reason === DisconnectReason.PARTICIPANT_REMOVED ||
              reason === DisconnectReason.ROOM_DELETED
            ) {
              setHasJoined(false);
              setEngineMode("idle");
              setLkToken(null);
              setLkUrl(null);
              return;
            }

            lkSignalFailuresRef.current += 1;
            if (lkSignalFailuresRef.current >= 1) {
              switchToP2PFallback();
            }
          }}
        >
          <SelectiveSubscriptionManager
            shouldHearIdentity={shouldHearIdentity}
            isSuppressedForRecap={isSuppressedForRecap}
          />
          <VoiceParticipantManager
            canPublish={canPublish}
            wantTransmitNow={wantTransmitNow}
            micRetryNonce={micRetryNonce}
            onMicWarning={setLkMicWarning}
          />
          <LiveKitRosterAndSpeakersSync
            myId={myId}
            canSpeak={canSpeak}
            wantTransmitNow={wantTransmitNow}
            shouldHearIdentity={shouldHearIdentity}
            isSuppressedForRecap={isSuppressedForRecap}
            onPeersSync={setLkRemotePeers}
            onSpeakingSync={setLkSpeakingIds}
            onAutoplayStateChange={handleLkAutoplayChange}
          />
          <CustomAudioRenderer
            shouldHearIdentity={shouldHearIdentity}
            volumeMap={volumeMap}
            mcDuckingActive={mcDuckingActive}
            isSuppressedForRecap={isSuppressedForRecap}
          />
        </LiveKitRoom>
      )}
      {children}
    </VoiceSessionContext.Provider>
  );
}

// =============================================================================
// NÚT NỔI TRÊN SÂN KHẤU 3D (Cho cả Sảnh Chờ & Màn Hình Chơi Mobile/PC)
// =============================================================================
export function VoiceQuickMicPill({ className = "" }) {
  const voice = useVoiceSession();
  if (!voice) return null;

  const {
    hasJoined,
    connecting,
    engineMode,
    canPublish,
    canSpeak,
    isRoleReveal,
    isSuppressedForRecap,
    wantTransmitNow,
    inputMode,
    isPttPressed,
    setIsPttPressed,
    toggleMic,
    joinVoice,
    visibleRemotePeers,
    activeSpeakingIds,
    myId,
  } = voice;

  if (!hasJoined) {
    return (
      <button
        type="button"
        className={`voice-quick-pill join-cta ${className}`.trim()}
        onClick={joinVoice}
        title="Tham gia kênh đàm thoại trực tiếp (giữ kết nối xuyên suốt Sảnh Chờ & Trong Trận)"
      >
        <span>🎙️</span>
        <span>Bật Voice</span>
      </button>
    );
  }

  const isSelfSpeaking = Boolean(myId && activeSpeakingIds.includes(myId));
  const remoteSpeaker = visibleRemotePeers.find((p) => activeSpeakingIds.includes(p.identity));
  const peerCount = (canPublish ? 1 : 0) + visibleRemotePeers.length;
  const modeTag = engineMode === "p2p" ? "⚡P2P" : "☁️SFU";

  if (connecting) {
    return (
      <div className={`voice-quick-pill connecting ${className}`.trim()}>
        <span>⏳ Đang nối Voice...</span>
      </div>
    );
  }

  if (isSuppressedForRecap) {
    return (
      <div
        className={`voice-quick-pill locked ${className}`.trim()}
        title="Tự động mở lại ngay khi bạn bấm Về Sảnh Chờ"
      >
        <span>🎬 Tạm ngắt thoại</span>
      </div>
    );
  }

  if (!canPublish) {
    return (
      <div
        className={`voice-quick-pill listen-only ${remoteSpeaker ? "remote-speaking" : ""} ${className}`.trim()}
        title={`Đang nghe kênh thoại (${modeTag}) — 0% tốn pin Micro`}
      >
        <span>{remoteSpeaker ? `🔊 ${remoteSpeaker.displayName}` : "👂 Chỉ nghe"}</span>
        <span className="voice-pill-count">{peerCount}</span>
      </div>
    );
  }

  if (!canSpeak) {
    return (
      <div
        className={`voice-quick-pill locked ${className}`.trim()}
        title={
          isRoleReveal
            ? "Khóa Mic 6 giây nhận vai để tránh lộ cảm thán"
            : "Ban đêm dân làng tự động khóa Mic (0 kbps)"
        }
      >
        <span>🔒 {isRoleReveal ? "Nhận vai" : "Khóa đêm"}</span>
      </div>
    );
  }

  if (inputMode === "ptt") {
    return (
      <button
        type="button"
        className={`voice-quick-pill ${isPttPressed ? "mic-live" : "mic-ptt"} ${
          isSelfSpeaking ? "self-speaking" : ""
        } ${className}`.trim()}
        onPointerDown={(e) => {
          e.preventDefault();
          setIsPttPressed(true);
        }}
        onPointerUp={() => setIsPttPressed(false)}
        onPointerLeave={() => setIsPttPressed(false)}
        onPointerCancel={() => setIsPttPressed(false)}
        title="Nhấn giữ nút này (hoặc phím Space) để nói"
      >
        <span>{isPttPressed ? "🎙️ Đang nói" : "⌨️ Giữ nói"}</span>
        <span className="voice-pill-count">{peerCount}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`voice-quick-pill ${wantTransmitNow ? "mic-live" : "mic-muted"} ${
        isSelfSpeaking ? "self-speaking" : remoteSpeaker ? "remote-speaking" : ""
      } ${className}`.trim()}
      onClick={toggleMic}
      title={
        wantTransmitNow
          ? `Đang bật Mic (${modeTag}) — Nhấn để tắt Mic`
          : `Đang tắt Mic (${modeTag}) — Nhấn để bật Mic`
      }
    >
      <span>
        {wantTransmitNow ? (isSelfSpeaking ? "🔊 Đang nói" : "🎤 Mic bật") : "🔇 Mic tắt"}
      </span>
      <span className="voice-pill-count">{peerCount}</span>
    </button>
  );
}

// =============================================================================
// BẢNG ĐIỀU KHIỂN CHI TIẾT TRONG CỘT PHẢI (SẢNH CHỜ & TRONG TRẬN)
// =============================================================================
function VoiceRoomConsumerView() {
  const voice = useVoiceSession();
  if (!voice) return null;

  const {
    hasJoined,
    connecting,
    engineMode,
    isNightPhase,
    isNightSilentShield,
    mcDuckingActive,
    canPublish,
    canSpeak,
    wantTransmitNow,
    myId,
    myName,
    myRole,
    inputMode,
    switchInputMode,
    userMicPreference,
    toggleMic,
    isPttPressed,
    setIsPttPressed,
    volumeMap,
    toggleMutePeer,
    visibleRemotePeers,
    activeSpeakingIds,
    channelLabel,
    activeWarning,
    clearActiveWarning,
    autoplayBlocked,
    resumeAudioPlayback,
    joinVoice,
    leaveVoice,
  } = voice;

  if (!hasJoined) {
    return (
      <div className="voice-room-wrapper">
        <div className="voice-join-prompt">
          <div className="voice-join-row">
            <span className="voice-join-icon">🎙️</span>
            <div className="voice-join-text">
              {!canPublish
                ? "Chế độ Chỉ Nghe (0% hao pin Micro — nghe trực tiếp bàn thảo luận)."
                : "Thoại trực tiếp liên thông Sảnh & Trận (Opus 16kbps · Tự ngắt 0 kbps khi im lặng)."}
            </div>
          </div>
          <button type="button" className="btn-join-voice" onClick={joinVoice}>
            🎙️ Tham gia Voice
          </button>
        </div>
      </div>
    );
  }

  const isSelfSpeaking = Boolean(myId && activeSpeakingIds.includes(myId));

  return (
    <div className="voice-room-wrapper">
      <div className="voice-panel">
        {autoplayBlocked && (
          <div className="voice-autoplay-notice" onClick={resumeAudioPlayback}>
            <span>
              🔊 Trình duyệt đang tạm chặn tiếng thoại. <b>Bấm vào đây để nghe ngay</b>
            </span>
          </div>
        )}

        {activeWarning && (
          <div className="voice-soft-warning">
            <span>ℹ️ {activeWarning}</span>
            <button
              type="button"
              className="voice-error-close"
              onClick={clearActiveWarning}
              title="Ẩn thông báo"
            >
              ✕
            </button>
          </div>
        )}

        <div className="voice-header">
          <div className="voice-title-group">
            <span
              className="voice-status-label"
              title="Nén Thoại Opus 16kbps + Tự giảm 40% âm lượng khi MC đọc truyện"
            >
              {channelLabel}
            </span>
            <span
              className={`voice-engine-badge ${engineMode === "p2p" ? "p2p" : "sfu"}`}
              title={
                engineMode === "p2p"
                  ? "Đang chạy WebRTC P2P Mesh trực tiếp ($0 không giới hạn)"
                  : "Đang chạy máy chủ LiveKit Cloud SFU"
              }
            >
              {connecting ? "⏳..." : engineMode === "p2p" ? "⚡ P2P" : "☁️ SFU"}
            </span>
            {mcDuckingActive && (
              <span
                className="voice-duck-badge"
                title="Đang tự động hạ 40% âm lượng thoại để nghe rõ lời dẫn của MC"
              >
                🔉 MC
              </span>
            )}
          </div>

          <div className="voice-header-actions">
            {canPublish && (
              <div className="voice-mode-switch" role="group" aria-label="Chế độ thu âm">
                <button
                  type="button"
                  className={`voice-mode-btn ${inputMode === "vad" ? "active" : ""}`}
                  onClick={() => switchInputMode("vad")}
                  title="Rảnh tay thông minh (DTX: tự hạ về 0 kbps khi bạn im lặng)"
                >
                  Rảnh tay
                </button>
                <button
                  type="button"
                  className={`voice-mode-btn ${inputMode === "ptt" ? "active" : ""}`}
                  onClick={() => switchInputMode("ptt")}
                  title="Giữ phím Space (máy tính) hoặc giữ nút Mic (điện thoại) để nói"
                >
                  Giữ nói
                </button>
              </div>
            )}

            {canPublish ? (
              inputMode === "ptt" ? (
                <button
                  type="button"
                  className={`btn-mic btn-ptt-hold ${
                    !canSpeak ? "mic-disabled" : isPttPressed ? "mic-on ptt-holding" : "mic-off"
                  }`}
                  disabled={!canSpeak}
                  onPointerDown={(e) => {
                    if (!canSpeak) return;
                    e.preventDefault();
                    setIsPttPressed(true);
                  }}
                  onPointerUp={() => setIsPttPressed(false)}
                  onPointerLeave={() => setIsPttPressed(false)}
                  onPointerCancel={() => setIsPttPressed(false)}
                  title={
                    !canSpeak
                      ? "Đang khóa Mic theo pha trò chơi"
                      : "Nhấn giữ nút này hoặc giữ phím Space để nói"
                  }
                >
                  {!canSpeak ? "🔒" : isPttPressed ? "🎙️" : "⌨️"}
                  <span className="mic-btn-text">
                    {!canSpeak ? "Khóa mic" : isPttPressed ? "Đang nói..." : "Giữ nói"}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className={`btn-mic ${
                    !canSpeak ? "mic-disabled" : wantTransmitNow ? "mic-on" : "mic-off"
                  }`}
                  onClick={toggleMic}
                  disabled={!canSpeak}
                  title={
                    !canSpeak
                      ? isNightPhase && !isWolfTeamRole(myRole)
                        ? "Ban đêm dân làng phải giữ im lặng"
                        : "Đang tạm khóa Mic"
                      : userMicPreference
                        ? "Tắt mic của bạn"
                        : "Bật mic của bạn"
                  }
                >
                  {!canSpeak ? "🔒" : wantTransmitNow ? "🎤" : "🔇"}
                  <span className="mic-btn-text">
                    {!canSpeak ? "Khóa mic" : wantTransmitNow ? "Đang bật" : "Bật mic"}
                  </span>
                </button>
              )
            ) : (
              <span className="voice-listen-tag" title="Đã nhả phần cứng Micro (0% tốn pin)">
                👂 Chỉ nghe
              </span>
            )}

            <button
              type="button"
              className="btn-leave-voice"
              onClick={leaveVoice}
              title="Rời kênh voice (ngắt kết nối WebRTC ngay lập tức)"
            >
              📵
            </button>
          </div>
        </div>

        <div className="voice-participants">
          {isNightSilentShield ? (
            <span className="voice-empty-hint">
              🌙 Kênh thoại đang khóa bảo mật — 0 kbps (chống lộ vai tuyệt đối)
            </span>
          ) : (
            <>
              {/* Thẻ của chính bạn luôn hiện đầu tiên để biết chắc chắn mình đã vào kênh & thấy sóng âm */}
              <div
                className={`voice-participant self-card ${isSelfSpeaking ? "speaking" : ""} ${
                  !wantTransmitNow ? "participant-muted" : ""
                }`}
              >
                <span className="voice-participant-name" title={myName || "Bạn"}>
                  {!canPublish
                    ? "👂 "
                    : !canSpeak
                      ? "🔒 "
                      : isSelfSpeaking
                        ? "🔊 "
                        : wantTransmitNow
                          ? "🎙️ "
                          : "🔇 "}
                  Bạn
                </span>
              </div>

              {visibleRemotePeers.map((peer) => {
                const identity = peer.identity;
                const displayName = peer.displayName || identity.slice(0, 8);
                const isMuted = volumeMap[identity] === 0;
                const isSpeaking = !isMuted && activeSpeakingIds.includes(identity);

                return (
                  <div
                    key={identity}
                    className={`voice-participant ${isSpeaking ? "speaking" : ""} ${
                      isMuted ? "participant-muted" : ""
                    }`}
                  >
                    <span className="voice-participant-name" title={displayName}>
                      {isMuted ? "🔇 " : isSpeaking ? "🔊 " : !peer.canPublish ? "👂 " : "🎙️ "}
                      {displayName}
                    </span>
                    <button
                      type="button"
                      className={`btn-mute-player ${isMuted ? "muted" : ""}`}
                      onClick={() => toggleMutePeer(identity)}
                      title={
                        isMuted
                          ? "Bỏ tắt tiếng người chơi này"
                          : "Tắt tiếng riêng người chơi này trên máy bạn"
                      }
                    >
                      {isMuted ? "🔇" : "🔉"}
                    </button>
                  </div>
                );
              })}

              {visibleRemotePeers.length === 0 && (
                <span className="voice-empty-hint">
                  {isNightPhase
                    ? "Đang chờ đồng bọn Sói khác vào kênh thoại..."
                    : "Đã vào kênh — mời bạn bè bấm Tham gia Voice!"}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// EXPORT MẶC ĐỊNH (Tự động dùng Provider cấp phòng nếu có, hoặc tự bọc độc lập)
// =============================================================================
export default function VoiceRoom(props) {
  const existingSession = useVoiceSession();
  if (existingSession) {
    return <VoiceRoomConsumerView />;
  }

  return (
    <VoiceSessionProvider
      socketRef={props.socketRef}
      roomCode={props.roomCode || "standalone"}
      isLobby={Boolean(props.isLobby)}
      nightDayPhase={props.nightDayPhase || (props.isNight ? "night_wolf" : "day_discuss")}
      hasWinner={Boolean(props.hasWinner)}
      isSpectator={Boolean(props.isSpectator)}
      myId={props.myId}
      myName={props.myName || "Bạn"}
      myRole={props.myRole}
      isAlive={props.isAlive !== false}
      wolfTeammates={props.wolfTeammates || []}
      mcDuckingActive={Boolean(props.mcDuckingActive)}
      isSuppressedForRecap={Boolean(props.isSuppressedForRecap)}
      onSpeakingChange={props.onSpeakingChange}
    >
      <VoiceRoomConsumerView />
    </VoiceSessionProvider>
  );
}
