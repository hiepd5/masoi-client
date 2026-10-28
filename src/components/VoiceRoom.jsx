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
import "./VoiceRoom.css";

const LIVEKIT_TOKEN_TIMEOUT_MS = 6500;
const MAX_CONTINUOUS_PTT_MS = 45_000; // Tự nhả Mic nếu kẹt phím Space quá 45s
const LOBBY_IDLE_SLEEP_MS = 4 * 60_000; // Tự nghỉ tiết kiệm phút LiveKit nếu treo Sảnh Chờ > 4 phút không ai nói

export const VOICE_CAPTURE_OPTIONS = {
  channelCount: 1,
  sampleRate: 24000,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

// Cấu hình phòng Thuần LiveKit SFU Siêu Tiết Kiệm (Opus Mono 14kbps + DTX 0 kbps + Bộ Đàm Giữ-Để-Nói)
const VOICE_ROOM_OPTIONS = {
  adaptiveStream: false,
  dynacast: false,
  webAudioMix: false,
  disconnectOnPageLeave: true,
  stopLocalTrackOnUnpublish: true,
  audioCaptureDefaults: VOICE_CAPTURE_OPTIONS,
  publishDefaults: {
    audioPreset: { maxBitrate: 14_000, priority: "high" },
    dtx: true,
    red: true,
    forceStereo: false,
    simulcast: false,
    stopMicTrackOnMute: false,
  },
};

// KHÓA KÉP ZERO-LEAK & BỀN KẾT NỐI: Không tự subscribe trước khi qua bộ lọc vai trò, tự thử nối lại 6 lần khi đổi mạng 4G/Wi-Fi
const VOICE_CONNECT_OPTIONS = {
  autoSubscribe: false,
  maxRetries: 6,
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

function describeLiveKitIssue(reason, rawMessage = "") {
  const code = String(reason || "").toUpperCase();
  if (code === "LIVEKIT_NOT_CONFIGURED") {
    return "Máy chủ chưa cấu hình khóa LiveKit Cloud (LIVEKIT_URL / API_KEY / API_SECRET).";
  }
  if (code === "LIVEKIT_QUOTA_EXCEEDED" || /429|quota|limit/i.test(rawMessage)) {
    return "Dự án LiveKit Cloud đang chạm hạn mức gói miễn phí (429) — vui lòng kiểm tra Quota.";
  }
  if (code === "LIVEKIT_AUTH_INVALID" || /401|403|unauthorized|invalid token/i.test(rawMessage)) {
    return "Khóa LiveKit API Key/Secret không hợp lệ hoặc đã hết hạn.";
  }
  if (code === "TOKEN_TIMEOUT") {
    return "Kết nối cấp khóa LiveKit phản hồi chậm — bấm Kết nối lại để vào kênh.";
  }
  return "Kết nối LiveKit SFU bị gián đoạn tạm thời — bấm Kết nối lại để vào kênh.";
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

// Quản lý Micro Bộ Đàm (0 kbps tuyệt đối khi nhả tay; giải phóng hẳn phần cứng Mic khi sang Ban Đêm / Chết / Chỉ Nghe)
function VoiceParticipantManager({
  canPublish,
  canSpeak,
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

    // Khi bị khóa nói (Ban đêm Dân Làng / 6s Nhận Vai / Người chết / Khán giả): ngắt sạch phần cứng Micro (0% hao pin)
    if (!canPublish || !canSpeak) {
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
            onMicWarning?.(
              "Bạn đang chặn quyền Micro — vẫn nghe mọi người bình thường (Chỉ Nghe)."
            );
          } else if (/NotFound|Device/i.test(errName)) {
            onMicWarning?.("Không tìm thấy thiết bị Micro — đang ở chế độ Chỉ Nghe.");
          } else {
            onMicWarning?.("Không mở được Micro — bạn vẫn nghe mọi người bình thường.");
          }
        });
    }
  }, [canPublish, canSpeak, wantTransmitNow, micRetryNonce, localParticipant, onMicWarning]);

  return null;
}

// Đồng bộ danh sách Thành viên & Người đang nói từ LiveKit SFU ra Context chung
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
// PROVIDER GỐC THUẦN LIVEKIT SFU (CHẾ ĐỘ BỘ ĐÀM GIỮ-ĐỂ-NÓI SIÊU TIẾT KIỆM)
// =============================================================================
export function VoiceSessionProvider({
  socketRef,
  roomCode,
  isLobby = false,
  humanCount = 2,
  spectatorCount = 0,
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
  const [lkToken, setLkToken] = useState(null);
  const [lkUrl, setLkUrl] = useState(null);
  const [lkIdentity, setLkIdentity] = useState(null);
  const [lkTokenCanPublish, setLkTokenCanPublish] = useState(false);
  const [lkConnected, setLkConnected] = useState(false);
  const [lkConnectionError, setLkConnectionError] = useState(null);
  const [reconnectSeq, setReconnectSeq] = useState(0);

  const [lkRemotePeers, setLkRemotePeers] = useState([]);
  const [lkSpeakingIds, setLkSpeakingIds] = useState([]);
  const [lkMicWarning, setLkMicWarning] = useState(null);
  const [lkAutoplayBlocked, setLkAutoplayBlocked] = useState(false);

  const [volumeMap, setVolumeMap] = useState({});
  const [micRetryNonce, setMicRetryNonce] = useState(0);
  // Khóa cố định 100% chế độ Bộ Đàm "Giữ Nút Mic / Giữ Phím Space Để Nói" (0 kbps khi nhả tay)
  const inputMode = "ptt";
  const [isPttPressed, setIsPttPressed] = useState(false);

  const lkStartAudioFnRef = useRef(null);
  const tokenTimeoutRef = useRef(null);
  const pttSafetyTimerRef = useRef(null);
  const lastActivityAtRef = useRef(Date.now());
  const lastBroadcastSpeakersKeyRef = useRef("");

  // Phân loại chính xác trạng thái Zero-Leak theo từng giây của ván đấu
  const isRoleReveal = Boolean(!isLobby && !hasWinner && nightDayPhase === "role_reveal");
  const isNightPhase = Boolean(
    !isLobby && !hasWinner && String(nightDayPhase || "").startsWith("night_")
  );
  // Tiết kiệm 100% phút Quota LiveKit khi vào trận Solo chỉ có 1 người thật đấu với AI Bot (tự nối lại ngay khi có người thứ 2!)
  const isSoloBotMatch = Boolean(
    !isLobby && (Number(humanCount) || 0) <= 1 && (Number(spectatorCount) || 0) <= 0
  );
  const isEcoPaused = Boolean(isSuppressedForRecap || isSoloBotMatch);
  const isEcoPausedRef = useRef(isEcoPaused);
  isEcoPausedRef.current = isEcoPaused;
  const canPublish = Boolean(isAlive && !isSpectator);

  const canSpeak = useMemo(() => {
    if (!canPublish || isEcoPaused) return false;
    if (isLobby || hasWinner) return true;
    if (isRoleReveal) return false; // Khóa cứng 6s Nhận Vai Định Mệnh chống lộ cảm thán!
    if (isNightPhase) return Boolean(isWolfTeamRole(myRole));
    return true;
  }, [canPublish, isEcoPaused, isLobby, hasWinner, isRoleReveal, isNightPhase, myRole]);

  const isNightSilentShield = Boolean(
    (isRoleReveal || (isNightPhase && !(isWolfTeamRole(myRole) && canPublish))) && !isLobby
  );

  const wantTransmitNow = Boolean(
    hasJoined && lkConnected && canSpeak && !isSuppressedForRecap && isPttPressed
  );

  // Ngay khi chuyển pha không được phép nói hoặc xem Recap -> nhả nút PTT tức thì
  useEffect(() => {
    if (!canSpeak || isSuppressedForRecap) {
      setIsPttPressed(false);
    }
  }, [canSpeak, isSuppressedForRecap]);

  // Chống kẹt nút PTT / phím Space quá 45 giây liên tục + lưới nhả chuột/chạm toàn cục
  useEffect(() => {
    if (!isPttPressed) {
      if (pttSafetyTimerRef.current) {
        clearTimeout(pttSafetyTimerRef.current);
        pttSafetyTimerRef.current = null;
      }
      return undefined;
    }

    lastActivityAtRef.current = Date.now();
    pttSafetyTimerRef.current = setTimeout(() => {
      setIsPttPressed(false);
      setLkMicWarning(
        "Đã tự nhả Mic sau 45s giữ liên tục để tiết kiệm băng thông — nhấn giữ lại để nói tiếp."
      );
    }, MAX_CONTINUOUS_PTT_MS);

    const releaseOnGlobalPointerEnd = () => {
      setIsPttPressed(false);
    };

    window.addEventListener("pointerup", releaseOnGlobalPointerEnd);
    window.addEventListener("pointercancel", releaseOnGlobalPointerEnd);
    window.addEventListener("touchend", releaseOnGlobalPointerEnd);
    window.addEventListener("touchcancel", releaseOnGlobalPointerEnd);
    window.addEventListener("blur", releaseOnGlobalPointerEnd);

    return () => {
      if (pttSafetyTimerRef.current) {
        clearTimeout(pttSafetyTimerRef.current);
        pttSafetyTimerRef.current = null;
      }
      window.removeEventListener("pointerup", releaseOnGlobalPointerEnd);
      window.removeEventListener("pointercancel", releaseOnGlobalPointerEnd);
      window.removeEventListener("touchend", releaseOnGlobalPointerEnd);
      window.removeEventListener("touchcancel", releaseOnGlobalPointerEnd);
      window.removeEventListener("blur", releaseOnGlobalPointerEnd);
    };
  }, [isPttPressed]);

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

  const requestVoiceSession = useCallback(
    ({ forceRefresh = false } = {}) => {
      const socket = socketRef?.current;
      if (!socket || !roomCode) return;
      if (!forceRefresh && lkToken && lkUrl && !lkConnectionError) return;

      clearTokenTimeout();
      setConnecting(true);
      setLkConnectionError(null);

      let settled = false;
      tokenTimeoutRef.current = setTimeout(() => {
        if (settled) return;
        settled = true;
        setConnecting(false);
        setLkConnectionError(describeLiveKitIssue("TOKEN_TIMEOUT"));
      }, LIVEKIT_TOKEN_TIMEOUT_MS);

      socket.emit("livekit:token", {}, (res) => {
        if (settled) return;
        settled = true;
        clearTokenTimeout();

        if (res?.ok && res?.mode === "livekit" && res?.token && res?.url) {
          setLkTokenCanPublish(Boolean(res.canPublish));
          setLkIdentity(res.identity || myId || null);
          setLkToken(res.token);
          setLkUrl(res.url);
          setLkConnectionError(null);
          if (forceRefresh) {
            setReconnectSeq((n) => n + 1);
          }
          return;
        }

        setConnecting(false);
        setLkConnected(false);
        setLkToken(null);
        setLkUrl(null);
        setLkConnectionError(
          res?.error || describeLiveKitIssue(res?.reason || res?.fallbackReason)
        );
      });
    },
    [socketRef, roomCode, lkToken, lkUrl, lkConnectionError, myId, clearTokenTimeout]
  );

  // Tự động cấp lại Token LiveKit có quyền nói (canPublish: true) hoặc đổi identity khi từ Khán Giả / Người Chết sang ván mới!
  useEffect(() => {
    if (!hasJoined || isSuppressedForRecap) return;
    if (!lkToken && !connecting && !lkConnectionError) {
      requestVoiceSession({ forceRefresh: true });
      return;
    }
    const desiredIdentity = myId || null;
    const identityChanged = Boolean(
      lkToken && desiredIdentity && lkIdentity && desiredIdentity !== lkIdentity
    );
    const needUpgradePublish = Boolean(lkToken && canPublish && !lkTokenCanPublish);
    if (identityChanged || needUpgradePublish) {
      requestVoiceSession({ forceRefresh: true });
    }
  }, [
    hasJoined,
    isSuppressedForRecap,
    lkToken,
    connecting,
    lkConnectionError,
    myId,
    lkIdentity,
    canPublish,
    lkTokenCanPublish,
    requestVoiceSession,
  ]);

  // Nếu đổi sang mã phòng khác -> reset sạch
  const prevRoomCodeRef = useRef(roomCode);
  useEffect(() => {
    if (prevRoomCodeRef.current && roomCode && prevRoomCodeRef.current !== roomCode) {
      clearTokenTimeout();
      setIsPttPressed(false);
      setHasJoined(false);
      setConnecting(false);
      setLkToken(null);
      setLkUrl(null);
      setLkIdentity(null);
      setLkTokenCanPublish(false);
      setLkConnected(false);
      setLkConnectionError(null);
      setLkRemotePeers([]);
      setLkSpeakingIds([]);
    }
    prevRoomCodeRef.current = roomCode;
  }, [roomCode, clearTokenTimeout]);

  // Phím Space giữ để nói toàn cục trên máy tính (tự bỏ qua khi đang gõ ô Chat)
  useEffect(() => {
    if (!hasJoined || !canSpeak || isSuppressedForRecap) {
      setIsPttPressed(false);
      return undefined;
    }

    const handleKeyDown = (e) => {
      if (e.code !== "Space" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingInTextField(e.target)) return;
      e.preventDefault();
      if (!e.repeat) {
        lastActivityAtRef.current = Date.now();
        setMicRetryNonce((n) => n + 1);
        setIsPttPressed(true);
      }
    };

    const handleKeyUp = (e) => {
      if (e.code !== "Space") return;
      setIsPttPressed(false);
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") {
        setIsPttPressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [hasJoined, canSpeak, isSuppressedForRecap]);

  // Danh sách người đang nói và cập nhật mốc hoạt động chống tốn phút Sảnh Chờ treo máy
  const activeSpeakingIds = useMemo(() => {
    if (!hasJoined || isSuppressedForRecap) return [];
    return lkSpeakingIds;
  }, [hasJoined, isSuppressedForRecap, lkSpeakingIds]);

  useEffect(() => {
    if (activeSpeakingIds.length > 0) {
      lastActivityAtRef.current = Date.now();
    }
    const key = activeSpeakingIds.join("|");
    if (key !== lastBroadcastSpeakersKeyRef.current) {
      lastBroadcastSpeakersKeyRef.current = key;
      onSpeakingChange?.(activeSpeakingIds);
    }
  }, [activeSpeakingIds, onSpeakingChange]);

  // Tự ngắt tiết kiệm hạn mức 5,000 phút LiveKit nếu chỉ treo tab ở Sảnh Chờ > 8 phút không ai nói (tuyệt đối không ngắt khi đang trong trận!)
  useEffect(() => {
    if (!hasJoined || !isLobby) return undefined;
    lastActivityAtRef.current = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityAtRef.current >= LOBBY_IDLE_SLEEP_MS) {
        setIsPttPressed(false);
        setHasJoined(false);
        setConnecting(false);
        setLkToken(null);
        setLkUrl(null);
        setLkConnected(false);
        setLkRemotePeers([]);
        setLkSpeakingIds([]);
        setLkMicWarning(
          "💤 Đã tạm nghỉ Voice Sảnh sau 4 phút yên lặng để tiết kiệm hạn mức LiveKit — bấm Bật Voice để nối lại ngay."
        );
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [hasJoined, isLobby]);

  useEffect(() => {
    return () => {
      clearTokenTimeout();
      onSpeakingChange?.([]);
    };
  }, [clearTokenTimeout, onSpeakingChange]);

  const startHoldToTalk = useCallback(
    (e) => {
      e?.preventDefault?.();
      if (!canSpeak || isSuppressedForRecap || !lkConnected) return;
      lastActivityAtRef.current = Date.now();
      setMicRetryNonce((n) => n + 1);
      setIsPttPressed(true);
    },
    [canSpeak, isSuppressedForRecap, lkConnected]
  );

  const stopHoldToTalk = useCallback(() => {
    setIsPttPressed(false);
  }, []);

  const joinVoice = useCallback(() => {
    lastActivityAtRef.current = Date.now();
    setLkMicWarning(null);
    setLkConnectionError(null);
    setMicRetryNonce((n) => n + 1);
    setHasJoined(true);
    setLkToken(null);
    setLkUrl(null);
  }, []);

  const retryLiveKitConnection = useCallback(() => {
    lastActivityAtRef.current = Date.now();
    setLkMicWarning(null);
    setLkConnectionError(null);
    setMicRetryNonce((n) => n + 1);
    setHasJoined(true);
    requestVoiceSession({ forceRefresh: true });
  }, [requestVoiceSession]);

  const leaveVoice = useCallback(() => {
    clearTokenTimeout();
    setIsPttPressed(false);
    setHasJoined(false);
    setConnecting(false);
    setLkToken(null);
    setLkUrl(null);
    setLkIdentity(null);
    setLkTokenCanPublish(false);
    setLkConnected(false);
    setLkConnectionError(null);
    setLkRemotePeers([]);
    setLkSpeakingIds([]);
    setLkMicWarning(null);
    setLkAutoplayBlocked(false);
    onSpeakingChange?.([]);
  }, [clearTokenTimeout, onSpeakingChange]);

  const toggleMutePeer = useCallback((identity) => {
    if (!identity) return;
    setVolumeMap((prev) => ({
      ...prev,
      [identity]: prev[identity] === 0 ? 1 : 0,
    }));
  }, []);

  const handleLkAutoplayChange = useCallback((blocked, startFn) => {
    lkStartAudioFnRef.current = startFn || null;
    setLkAutoplayBlocked(Boolean(blocked));
  }, []);

  const resumeAudioPlayback = useCallback(() => {
    lkStartAudioFnRef.current?.();
    setLkAutoplayBlocked(false);
  }, []);

  const visibleRemotePeers = useMemo(() => {
    if (isNightSilentShield) return [];
    return lkRemotePeers.filter((p) => {
      if (!p?.identity || p.identity === myId) return false;
      if (p.isSpectator || String(p.identity).startsWith("spec_")) return false;
      if (isNightPhase) {
        return wolfTeammates.includes(p.identity);
      }
      return true;
    });
  }, [lkRemotePeers, isNightSilentShield, myId, isNightPhase, wolfTeammates]);

  let channelLabel = "☀️ Kênh Chung";
  if (isSuppressedForRecap) {
    channelLabel = "🎬 Tạm nghỉ (Đang xem phim)";
  } else if (isSoloBotMatch) {
    channelLabel = "🤖 Đấu Bot (0 phút Quota)";
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

  const clearActiveWarning = useCallback(() => {
    setLkMicWarning(null);
  }, []);

  const isEngineReady = Boolean(lkConnected && !lkConnectionError);
  const engineMode = hasJoined ? "livekit" : "idle";
  const roomInstanceKey = `${lkUrl || "lk"}_${lkIdentity || myId || "me"}_${
    lkTokenCanPublish ? "pub" : "sub"
  }_${reconnectSeq}`;

  const sessionValue = useMemo(
    () => ({
      hasJoined,
      connecting: Boolean(
        connecting || (hasJoined && !isEcoPaused && !isEngineReady && !lkConnectionError)
      ),
      isEngineReady,
      engineMode,
      connectionError: lkConnectionError,
      isLobby,
      isSoloBotMatch,
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
      isPttPressed,
      startHoldToTalk,
      stopHoldToTalk,
      volumeMap,
      toggleMutePeer,
      visibleRemotePeers,
      activeSpeakingIds,
      channelLabel,
      activeWarning: lkMicWarning,
      clearActiveWarning,
      autoplayBlocked: lkAutoplayBlocked,
      resumeAudioPlayback,
      joinVoice,
      retryLiveKitConnection,
      leaveVoice,
    }),
    [
      hasJoined,
      connecting,
      isEngineReady,
      engineMode,
      lkConnectionError,
      isLobby,
      isSoloBotMatch,
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
      isPttPressed,
      startHoldToTalk,
      stopHoldToTalk,
      volumeMap,
      toggleMutePeer,
      visibleRemotePeers,
      activeSpeakingIds,
      channelLabel,
      lkMicWarning,
      clearActiveWarning,
      lkAutoplayBlocked,
      resumeAudioPlayback,
      joinVoice,
      retryLiveKitConnection,
      leaveVoice,
    ]
  );

  return (
    <VoiceSessionContext.Provider value={sessionValue}>
      {/* Cầu âm thanh Thuần LiveKit SFU (Tự tạm ngắt connect=false khi xem Phim Cuối Ván & khi Đấu Solo Bot để 0 tốn phút Quota!) */}
      {hasJoined && lkToken && lkUrl && !lkConnectionError && (
        <LiveKitRoom
          key={roomInstanceKey}
          serverUrl={lkUrl}
          token={lkToken}
          connect={!isSuppressedForRecap && !isSoloBotMatch}
          video={false}
          audio={false}
          options={VOICE_ROOM_OPTIONS}
          connectOptions={VOICE_CONNECT_OPTIONS}
          className="livekit-custom"
          onConnected={() => {
            setLkConnected(true);
            setConnecting(false);
            setLkConnectionError(null);
          }}
          onError={(err) => {
            const msg = String(err?.message || "");
            if (/NotAllowed|NotFound|Permission|microphone|device/i.test(msg)) {
              setLkMicWarning("Không mở được Micro — đang giữ chế độ Chỉ Nghe.");
              return;
            }
            setConnecting(false);
            setLkConnected(false);
            setLkConnectionError(describeLiveKitIssue("LIVEKIT_ERROR", msg));
          }}
          onDisconnected={(reason) => {
            setLkConnected(false);
            setLkSpeakingIds([]);
            setIsPttPressed(false);
            if (!hasJoined || isSuppressedForRecap || isEcoPausedRef.current) return;

            if (
              reason === DisconnectReason.CLIENT_INITIATED ||
              reason === DisconnectReason.DUPLICATE_IDENTITY ||
              reason === DisconnectReason.PARTICIPANT_REMOVED ||
              reason === DisconnectReason.ROOM_DELETED
            ) {
              setHasJoined(false);
              setLkToken(null);
              setLkUrl(null);
              return;
            }

            setConnecting(false);
            setLkConnectionError(
              "Mất kết nối tới máy chủ LiveKit — bấm Kết nối lại để vào tiếp."
            );
          }}
        >
          <SelectiveSubscriptionManager
            shouldHearIdentity={shouldHearIdentity}
            isSuppressedForRecap={isSuppressedForRecap}
          />
          <VoiceParticipantManager
            canPublish={canPublish}
            canSpeak={canSpeak}
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
// NÚT BỘ ĐÀM NỔI TRÊN SÂN KHẤU 3D (Sảnh Chờ & Màn Hình Chơi Mobile/PC)
// =============================================================================
export function VoiceQuickMicPill({ className = "" }) {
  const voice = useVoiceSession();
  if (!voice) return null;

  const {
    hasJoined,
    connecting,
    connectionError,
    canPublish,
    canSpeak,
    isSoloBotMatch,
    isRoleReveal,
    isSuppressedForRecap,
    isPttPressed,
    startHoldToTalk,
    stopHoldToTalk,
    joinVoice,
    retryLiveKitConnection,
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
        title="Tham gia kênh đàm thoại LiveKit Cloud (Chế độ Bộ Đàm Giữ-Để-Nói siêu tiết kiệm 0 kbps khi nhả tay)"
      >
        <span>🎙️</span>
        <span>Bật Voice</span>
      </button>
    );
  }

  if (connectionError) {
    return (
      <button
        type="button"
        className={`voice-quick-pill mic-muted ${className}`.trim()}
        onClick={retryLiveKitConnection}
        title={connectionError}
      >
        <span>🔄 Nối lại LiveKit</span>
      </button>
    );
  }

  const isSelfSpeaking = Boolean(myId && activeSpeakingIds.includes(myId));
  const remoteSpeaker = visibleRemotePeers.find((p) => activeSpeakingIds.includes(p.identity));
  const peerCount = (canPublish ? 1 : 0) + visibleRemotePeers.length;

  if (isSuppressedForRecap || isSoloBotMatch) {
    return (
      <div
        className={`voice-quick-pill locked ${className}`.trim()}
        title={
          isSoloBotMatch
            ? "Đang đấu Solo với AI Bot — tự tạm nghỉ LiveKit để tiết kiệm 100% phút Quota (tự nối lại ngay khi có người thật vào)"
            : "Đang tạm ngắt kết nối LiveKit để tiết kiệm phút Quota khi xem phim — tự nối lại khi về Sảnh"
        }
      >
        <span>{isSoloBotMatch ? "🤖 Solo (0 phút)" : "🎬 Tạm nghỉ Voice"}</span>
      </div>
    );
  }

  if (connecting) {
    return (
      <div className={`voice-quick-pill connecting ${className}`.trim()}>
        <span>⏳ Đang nối LiveKit...</span>
      </div>
    );
  }

  if (!canPublish) {
    return (
      <div
        className={`voice-quick-pill listen-only ${remoteSpeaker ? "remote-speaking" : ""} ${className}`.trim()}
        title="Đang nghe kênh thoại LiveKit SFU — 0% tốn pin Micro"
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

  return (
    <button
      type="button"
      className={`voice-quick-pill ${isPttPressed ? "mic-live" : "mic-ptt"} ${
        isSelfSpeaking ? "self-speaking" : remoteSpeaker ? "remote-speaking" : ""
      } ${className}`.trim()}
      onPointerDown={startHoldToTalk}
      onPointerUp={stopHoldToTalk}
      onPointerLeave={stopHoldToTalk}
      onPointerCancel={stopHoldToTalk}
      onContextMenu={(e) => e.preventDefault()}
      title="Nhấn giữ nút này (hoặc giữ phím Space trên PC) để nói — nhả tay tự ngắt 0 kbps!"
    >
      <span>
        {isPttPressed
          ? "🎙️ Đang phát..."
          : remoteSpeaker
            ? `🔊 ${remoteSpeaker.displayName}`
            : "🎙️ Giữ để nói"}
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
    connectionError,
    isNightPhase,
    isNightSilentShield,
    mcDuckingActive,
    canPublish,
    canSpeak,
    wantTransmitNow,
    myId,
    myName,
    myRole,
    isPttPressed,
    startHoldToTalk,
    stopHoldToTalk,
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
    retryLiveKitConnection,
    leaveVoice,
  } = voice;

  if (!hasJoined) {
    return (
      <div className="voice-room-wrapper">
        <div className="voice-join-prompt">
          {activeWarning && (
            <div className="voice-soft-warning" style={{ width: "100%" }}>
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
          <div className="voice-join-row">
            <span className="voice-join-icon">🎙️</span>
            <div className="voice-join-text">
              {!canPublish
                ? "LiveKit Cloud SFU • Chế độ Chỉ Nghe (0% hao pin Micro — nghe trực tiếp bàn thảo luận)."
                : "LiveKit Cloud SFU • Bộ Đàm Giữ-Để-Nói (Giữ nút Mic hoặc phím Space để nói — nhả tay 0 kbps)."}
            </div>
          </div>
          <button type="button" className="btn-join-voice" onClick={joinVoice}>
            🎙️ Bật Voice
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

        {connectionError && (
          <div className="voice-soft-warning voice-error-banner">
            <span>⚠️ {connectionError}</span>
            <button
              type="button"
              className="btn-retry-livekit"
              onClick={retryLiveKitConnection}
            >
              🔄 Kết nối lại
            </button>
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
              title="Nén Thoại Opus Mono 14kbps + Tự giảm 40% âm lượng khi MC đọc truyện"
            >
              {channelLabel}
            </span>
            <span
              className="voice-engine-badge sfu"
              title="Thuần LiveKit Cloud SFU • Bộ Đàm Giữ-Để-Nói (0.00 kbps khi nhả tay)"
            >
              {connecting
                ? "⏳ LiveKit..."
                : connectionError
                  ? "⚠️ Gián đoạn"
                  : wantTransmitNow
                    ? "📡 Đang phát 14kbps"
                    : "☁️ LiveKit • 0 kbps"}
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
            {canPublish ? (
              <button
                type="button"
                className={`btn-mic btn-ptt-hold ${
                  !canSpeak || Boolean(connectionError) || connecting
                    ? "mic-disabled"
                    : isPttPressed
                      ? "mic-on ptt-holding"
                      : "mic-off"
                }`}
                disabled={!canSpeak || Boolean(connectionError) || connecting}
                onPointerDown={startHoldToTalk}
                onPointerUp={stopHoldToTalk}
                onPointerLeave={stopHoldToTalk}
                onPointerCancel={stopHoldToTalk}
                onContextMenu={(e) => e.preventDefault()}
                title={
                  !canSpeak
                    ? isNightPhase && !isWolfTeamRole(myRole)
                      ? "Ban đêm dân làng phải giữ im lặng (0 kbps)"
                      : "Đang khóa Mic theo pha trò chơi"
                    : "Nhấn giữ nút này (hoặc giữ phím Space trên PC) để nói — nhả tay tự ngắt 0 kbps"
                }
              >
                {!canSpeak ? "🔒" : isPttPressed ? "🎙️" : "⌨️"}
                <span className="mic-btn-text">
                  {!canSpeak
                    ? "Khóa mic"
                    : isPttPressed
                      ? "Đang phát..."
                      : "Giữ để nói (Space)"}
                </span>
              </button>
            ) : (
              <span className="voice-listen-tag" title="Đã nhả phần cứng Micro (0% tốn pin)">
                👂 Chỉ nghe
              </span>
            )}

            <button
              type="button"
              className="btn-leave-voice"
              onClick={leaveVoice}
              title="Rời kênh LiveKit (ngắt kết nối WebRTC ngay lập tức)"
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
              <div
                className={`voice-participant self-card ${isSelfSpeaking || wantTransmitNow ? "speaking" : ""} ${
                  !wantTransmitNow ? "participant-muted" : ""
                }`}
              >
                <span className="voice-participant-name" title={myName || "Bạn"}>
                  {!canPublish
                    ? "👂 "
                    : !canSpeak
                      ? "🔒 "
                      : wantTransmitNow
                        ? "🎙️ "
                        : "🔇 "}
                  Bạn {wantTransmitNow ? "(Đang giữ)" : ""}
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
                    ? "Giữ nút Mic / Space để bàn mưu kín cùng bầy Sói..."
                    : "Giữ nút Mic (hoặc phím Space) khi cần phát biểu — nhả tay tự tắt 0 kbps!"}
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
