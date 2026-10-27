import { useEffect, useState, useRef, useCallback, useMemo } from "react";
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

const VOICE_INPUT_MODE_KEY = "ws_voice_input_mode";
const MAX_AUTO_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS_MS = [1500, 4000, 8000];

// Cấu hình thu âm Mono 24kHz nhẹ CPU + lọc ồn phần cứng
const VOICE_CAPTURE_OPTIONS = {
  channelCount: 1,
  sampleRate: 24000,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

// Cấu hình phòng LiveKit chuyên Thoại Game (giảm ~67-75% băng thông so với mặc định 48kbps Music)
const VOICE_ROOM_OPTIONS = {
  adaptiveStream: false,
  dynacast: false,
  webAudioMix: false,
  disconnectOnPageLeave: true,
  stopLocalTrackOnUnpublish: true,
  audioCaptureDefaults: VOICE_CAPTURE_OPTIONS,
  publishDefaults: {
    audioPreset: { maxBitrate: 16_000, priority: "high" },
    dtx: true, // Ngắt truyền gói tin (0 kbps upload) khi người chơi im lặng
    red: true, // Chống mất chữ trên mạng 4G/WiFi yếu
    forceStereo: false,
    simulcast: false,
    // Giữ false cho người còn sống để bấm nhả Push-to-Talk nhạy 0ms, không ngắt tai nghe Bluetooth AirPods
    stopMicTrackOnMute: false,
  },
};

// KHÓA KÉP ZERO-LEAK: Không tự động subscribe bất kỳ luồng âm thanh nào cho đến khi qua bộ lọc vai trò/ban đêm
const VOICE_CONNECT_OPTIONS = {
  autoSubscribe: false,
  maxRetries: 2,
};

const AUDIO_RENDER_EVENTS = [
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.ParticipantDisconnected,
];

const PANEL_TRACK_EVENTS = [
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.ActiveSpeakersChanged,
];

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

function canHearRemoteIdentity(identity, { isNight, myRole, isAlive, wolfTeammates, volumeMap }) {
  if (!identity) return false;
  if (volumeMap?.[identity] === 0) return false;
  if (isNight) {
    return Boolean(isWolfTeamRole(myRole) && isAlive && wolfTeammates.includes(identity));
  }
  return true;
}

// Điều phối thuê bao SFU chủ động: Cắt 100% gói tin chiều về (0 kbps) vào ban đêm cho Dân Làng & khi Mute cá nhân
function SelectiveSubscriptionManager({ isNight, myRole, isAlive, wolfTeammates, volumeMap }) {
  const room = useRoomContext();

  const syncSubscriptions = useCallback(() => {
    if (!room?.remoteParticipants) return;
    room.remoteParticipants.forEach((participant) => {
      const shouldSubAudio = canHearRemoteIdentity(participant.identity, {
        isNight,
        myRole,
        isAlive,
        wolfTeammates,
        volumeMap,
      });

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
  }, [room, isNight, myRole, isAlive, wolfTeammates, volumeMap]);

  useEffect(() => {
    syncSubscriptions();
  }, [syncSubscriptions]);

  useEffect(() => {
    if (!room) return;
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

// Quản lý trạng thái Micro theo Phase, Tình trạng Sống/Chết & Chế độ Rảnh tay / Giữ nói (Push-to-Talk)
function VoiceParticipantManager({
  isNight,
  myRole,
  isAlive,
  inputMode,
  userMicPreference,
  isPttPressed,
}) {
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (!localParticipant) return;

    // Khán giả đã chết: ngắt hẳn track thu âm phần cứng để giải phóng pin & tai nghe Bluetooth Stereo
    if (!isAlive) {
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

    const canSpeak = !isNight || isWolfTeamRole(myRole);
    const wantMicOn = canSpeak && (inputMode === "ptt" ? isPttPressed : userMicPreference);

    if (localParticipant.isMicrophoneEnabled !== wantMicOn) {
      localParticipant.setMicrophoneEnabled(wantMicOn).catch(() => {});
    }
  }, [isNight, myRole, isAlive, inputMode, userMicPreference, isPttPressed, localParticipant]);

  return null;
}

// Đồng bộ danh sách người đang nói lên sân khấu 3D bằng sự kiện debounce chuẩn (Chống bão re-render 20Hz & Chống lộ Sói ban đêm)
function ActiveSpeakersSync({
  isNight,
  myRole,
  isAlive,
  myId,
  wolfTeammates,
  volumeMap,
  onSpeakingChange,
}) {
  const room = useRoomContext();
  const lastKeyRef = useRef("");

  const pushSpeakers = useCallback(() => {
    if (!room || !onSpeakingChange) return;

    const canLocalSpeak = Boolean(isAlive && (!isNight || isWolfTeamRole(myRole)));
    const active = Array.isArray(room.activeSpeakers) ? room.activeSpeakers : [];
    const allowedIds = [];

    for (const p of active) {
      if (!p) continue;
      if (p.isLocal) {
        if (canLocalSpeak && p.isMicrophoneEnabled) {
          const selfId = myId || p.identity;
          if (selfId && !allowedIds.includes(selfId)) allowedIds.push(selfId);
        }
      } else if (
        canHearRemoteIdentity(p.identity, {
          isNight,
          myRole,
          isAlive,
          wolfTeammates,
          volumeMap,
        })
      ) {
        if (!allowedIds.includes(p.identity)) {
          allowedIds.push(p.identity);
        }
      }
    }

    allowedIds.sort();
    const nextKey = allowedIds.join("|");
    if (nextKey !== lastKeyRef.current) {
      lastKeyRef.current = nextKey;
      onSpeakingChange(allowedIds);
    }
  }, [room, isNight, myRole, isAlive, myId, wolfTeammates, volumeMap, onSpeakingChange]);

  useEffect(() => {
    pushSpeakers();
  }, [pushSpeakers]);

  useEffect(() => {
    if (!room) return;
    room.on(RoomEvent.ActiveSpeakersChanged, pushSpeakers);
    room.on(RoomEvent.TrackMuted, pushSpeakers);
    room.on(RoomEvent.ParticipantDisconnected, pushSpeakers);
    room.on(RoomEvent.Connected, pushSpeakers);
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, pushSpeakers);
      room.off(RoomEvent.TrackMuted, pushSpeakers);
      room.off(RoomEvent.ParticipantDisconnected, pushSpeakers);
      room.off(RoomEvent.Connected, pushSpeakers);
    };
  }, [room, pushSpeakers]);

  useEffect(() => {
    return () => {
      if (lastKeyRef.current !== "") {
        lastKeyRef.current = "";
        onSpeakingChange?.([]);
      }
    };
  }, [onSpeakingChange]);

  return null;
}

// Xử lý chặn âm thanh tự phát (Autoplay Policy) + tự nối lại tiếng sau cuộc gọi Zalo/Điện thoại (Chốt #12)
function AutoplayBlockNotice() {
  const room = useRoomContext();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!room) return;
    const checkPlayback = () => setBlocked(!room.canPlaybackAudio);
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
      room.off(RoomEvent.AudioPlaybackStatusChanged, checkPlayback);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [room]);

  if (!blocked) return null;

  return (
    <div className="voice-autoplay-notice" onClick={() => room.startAudio()}>
      <span>
        🔊 Trình duyệt đang chặn âm thanh. <b>Bấm vào đây để nghe</b>
      </span>
    </div>
  );
}

// Bộ phát âm thanh đã lọc qua SFU Subscription (chỉ mount các track đã thực sự subscribe)
function CustomAudioRenderer({ isNight, myRole, isAlive, wolfTeammates, volumeMap }) {
  const tracks = useTracks([Track.Source.Microphone], {
    onlySubscribed: true,
    updateOnlyOn: AUDIO_RENDER_EVENTS,
  });

  return (
    <>
      {tracks.map((trackRef) => {
        const identity = trackRef.participant.identity;
        if (trackRef.participant.isLocal) return null;

        const allowed = canHearRemoteIdentity(identity, {
          isNight,
          myRole,
          isAlive,
          wolfTeammates,
          volumeMap,
        });
        if (!allowed) return null;

        const vol = volumeMap[identity] ?? 1;
        return <AudioTrack key={identity} trackRef={trackRef} volume={vol} />;
      })}
    </>
  );
}

// Bảng điều khiển giao diện Voice
function VoicePanel({
  isNight,
  myRole,
  isAlive,
  inputMode,
  setInputMode,
  userMicPreference,
  setUserMicPreference,
  isPttPressed,
  setIsPttPressed,
  volumeMap,
  setVolumeMap,
  onLeaveVoice,
}) {
  const tracks = useTracks([Track.Source.Microphone], {
    onlySubscribed: false,
    updateOnlyOn: PANEL_TRACK_EVENTS,
  });

  const canSpeak = Boolean(isAlive && (!isNight || isWolfTeamRole(myRole)));
  const isNightSilentShield = Boolean(isNight && !(isWolfTeamRole(myRole) && isAlive));

  function toggleMic() {
    if (!canSpeak) return;
    setUserMicPreference((prev) => !prev);
  }

  function toggleMute(identity) {
    setVolumeMap((prev) => ({
      ...prev,
      [identity]: prev[identity] === 0 ? 1 : 0,
    }));
  }

  function switchInputMode(nextMode) {
    setInputMode(nextMode);
    setIsPttPressed(false);
    try {
      localStorage.setItem(VOICE_INPUT_MODE_KEY, nextMode);
    } catch {
      // ignore storage quota
    }
  }

  // Phím Space giữ để nói (tự nhường phím khi đang gõ ô Chat & tự nhả Mic khi ẩn tab)
  useEffect(() => {
    if (inputMode !== "ptt" || !canSpeak) {
      setIsPttPressed(false);
      return;
    }

    const handleKeyDown = (e) => {
      if (e.code !== "Space" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingInTextField(e.target)) return;
      e.preventDefault();
      if (!e.repeat) {
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
  }, [inputMode, canSpeak, setIsPttPressed]);

  let channelLabel = "☀️ Kênh Chung";
  if (!isAlive) {
    channelLabel = "💀 Khán Giả (Chỉ nghe)";
  } else if (isNight) {
    channelLabel = isWolfTeamRole(myRole) ? "🐺 Kênh Bầy Sói" : "🌙 Đêm Ngủ (0 kbps)";
  }

  const visibleRemoteTracks = useMemo(() => {
    if (isNightSilentShield) return [];
    return tracks.filter((t) => {
      if (t.participant.isLocal) return false;
      if (isNight) {
        return wolfTeammates.includes(t.participant.identity);
      }
      return true;
    });
  }, [tracks, isNightSilentShield, isNight, wolfTeammates]);

  const isLocalTransmitting =
    canSpeak && (inputMode === "ptt" ? isPttPressed : userMicPreference);

  return (
    <div className="voice-panel">
      <AutoplayBlockNotice />

      <div className="voice-header">
        <span className="voice-status-label" title="Nén Thoại Opus 16kbps + DTX tự ngắt băng thông khi im lặng">
          {channelLabel}
        </span>
        <div className="voice-header-actions">
          {isAlive && (
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
                title="Giữ phím Space (máy tính) hoặc giữ nút Mic (điện thoại) để nói — phù hợp nơi ồn ào"
              >
                Giữ nói
              </button>
            </div>
          )}

          {inputMode === "ptt" && isAlive ? (
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
                  ? "Ban đêm dân làng phải giữ im lặng"
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
                !canSpeak ? "mic-disabled" : isLocalTransmitting ? "mic-on" : "mic-off"
              }`}
              onClick={toggleMic}
              disabled={!canSpeak}
              title={
                !isAlive
                  ? "Khán giả chỉ nghe, không mở phần cứng Micro"
                  : isNight && !isWolfTeamRole(myRole)
                  ? "Ban đêm dân làng phải ngủ"
                  : userMicPreference
                  ? "Tắt mic của bạn"
                  : "Bật mic của bạn"
              }
            >
              {!canSpeak ? "🔒" : isLocalTransmitting ? "🎤" : "🔇"}
              <span className="mic-btn-text">
                {!canSpeak ? "Khóa mic" : isLocalTransmitting ? "Đang bật" : "Bật mic"}
              </span>
            </button>
          )}

          <button
            type="button"
            className="btn-leave-voice"
            onClick={onLeaveVoice}
            title="Rời kênh voice (ngắt kết nối WebRTC ngay lập tức)"
          >
            📵
          </button>
        </div>
      </div>

      <div className="voice-participants">
        {isNightSilentShield ? (
          <span className="voice-empty-hint">
            🌙 Kênh thoại đang khóa ngủ đêm — 0 kbps (bảo mật & tiết kiệm)
          </span>
        ) : (
          <>
            {visibleRemoteTracks.map((trackRef) => {
              const participant = trackRef.participant;
              const identity = participant.identity;
              const displayName = participant.name || identity.slice(0, 8);
              const isMuted = volumeMap[identity] === 0;
              const isSpeaking = !isMuted && Boolean(participant.isSpeaking);

              return (
                <div
                  key={identity}
                  className={`voice-participant ${isSpeaking ? "speaking" : ""} ${
                    isMuted ? "participant-muted" : ""
                  }`}
                >
                  <span className="voice-participant-name" title={displayName}>
                    {isMuted ? "🔇 " : isSpeaking ? "🔊 " : "🎙️ "}
                    {displayName}
                  </span>
                  <button
                    type="button"
                    className={`btn-mute-player ${isMuted ? "muted" : ""}`}
                    onClick={() => toggleMute(identity)}
                    title={
                      isMuted
                        ? "Bỏ tắt tiếng (nối lại luồng âm thanh người này)"
                        : "Tắt tiếng & ngắt tải gói tin âm thanh từ người này (0 kbps)"
                    }
                  >
                    {isMuted ? "🔇" : "🔉"}
                  </button>
                </div>
              );
            })}
            {visibleRemoteTracks.length === 0 && (
              <span className="voice-empty-hint">
                {isNight ? "Chưa có Sói nào khác bật kênh thoại" : "Chưa có ai khác bật mic"}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT — VoiceRoom Eco + Zero-Leak Architecture
// ============================================================
export default function VoiceRoom({
  socketRef,
  isNight,
  myRole,
  isAlive = true,
  myId,
  wolfTeammates = [],
  onSpeakingChange,
}) {
  const [token, setToken] = useState(null);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const [volumeMap, setVolumeMap] = useState({});
  const [userMicPreference, setUserMicPreference] = useState(true);
  const [inputMode, setInputMode] = useState(() => {
    try {
      return localStorage.getItem(VOICE_INPUT_MODE_KEY) === "ptt" ? "ptt" : "vad";
    } catch {
      return "vad";
    }
  });
  const [isPttPressed, setIsPttPressed] = useState(false);

  // OPT 1: Lazy connect — mặc định chưa tham gia, chờ người dùng bấm nút
  const [hasJoined, setHasJoined] = useState(false);
  const tokenFetchedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearReconnectTimer();
      onSpeakingChange?.([]);
    };
  }, [clearReconnectTimer, onSpeakingChange]);

  // OPT 4: Chỉ fetch token khi chưa có token hợp lệ
  const fetchToken = useCallback(() => {
    if (!socketRef?.current) return;
    if (tokenFetchedRef.current && token && !error) return;

    socketRef.current.emit("livekit:token", {}, (res) => {
      if (res?.error) {
        setError(res.error);
        tokenFetchedRef.current = false;
      } else if (res?.token && res?.url) {
        setToken(res.token);
        setUrl(res.url);
        setError(null);
        tokenFetchedRef.current = true;
      }
    });
  }, [socketRef, token, error]);

  useEffect(() => {
    if (!hasJoined) return;
    fetchToken();

    const socket = socketRef?.current;
    if (socket) {
      socket.on("connect", fetchToken);
      return () => socket.off("connect", fetchToken);
    }
  }, [fetchToken, socketRef, hasJoined]);

  // OPT 3: Người chết → tự động disconnect khỏi LiveKit ngay để tiết kiệm phút & nhả phần cứng Mic
  const prevAliveRef = useRef(isAlive);
  useEffect(() => {
    if (prevAliveRef.current === true && isAlive === false) {
      clearReconnectTimer();
      reconnectAttemptsRef.current = 0;
      setIsPttPressed(false);
      if (hasJoined) {
        setHasJoined(false);
        setToken(null);
        setUrl(null);
        tokenFetchedRef.current = false;
        onSpeakingChange?.([]);
      }
    }
    prevAliveRef.current = isAlive;
  }, [isAlive, hasJoined, clearReconnectTimer, onSpeakingChange]);

  // OPT 2: Hàm rời voice thủ công (nút 📵 trong VoicePanel)
  const handleLeaveVoice = useCallback(() => {
    clearReconnectTimer();
    reconnectAttemptsRef.current = 0;
    setIsPttPressed(false);
    setHasJoined(false);
    setToken(null);
    setUrl(null);
    setError(null);
    tokenFetchedRef.current = false;
    onSpeakingChange?.([]);
  }, [clearReconnectTimer, onSpeakingChange]);

  const friendlyError = useMemo(() => {
    if (!error) return null;
    if (
      error === "LIVEKIT_QUOTA_EXCEEDED" ||
      /429|quota|connection minutes/i.test(error) ||
      /could not establish signal/i.test(error) ||
      /websocket error/i.test(error)
    ) {
      return "🎙️ Kênh thoại tạm thời không khả dụng (hạn mức miễn phí tháng này đã hết). Bạn vẫn chat văn bản và nghe MC bình thường!";
    }
    return `🎤 Voice lỗi: ${error}`;
  }, [error]);

  // OPT 1: Chưa join → hiển thị nút mời tham gia
  if (!hasJoined) {
    return (
      <div className="voice-room-wrapper">
        {friendlyError && (
          <div className="voice-error-banner">
            <span>{friendlyError}</span>
            <button
              type="button"
              className="voice-error-close"
              onClick={() => setError(null)}
              title="Đóng"
            >
              ✕
            </button>
          </div>
        )}
        <div className="voice-join-prompt">
          <div className="voice-join-icon">🎙️</div>
          <div className="voice-join-text">
            {!isAlive
              ? "Bạn đã chết. Tham gia chế độ Chỉ Nghe (0% hao pin Micro)."
              : "Tham gia kênh Voice tiết kiệm (Opus 16kbps · Tự ngắt 0 kbps khi im lặng)."}
          </div>
          <button
            type="button"
            className="btn-join-voice"
            onClick={() => {
              clearReconnectTimer();
              reconnectAttemptsRef.current = 0;
              setHasJoined(true);
              setError(null);
            }}
          >
            🎙️ Tham gia Voice
          </button>
          <span className="voice-join-hint">Không tham gia thì game vẫn chạy bình thường</span>
        </div>
      </div>
    );
  }

  return (
    <div className="voice-room-wrapper">
      {friendlyError && (
        <div className="voice-error-banner">
          <span>{friendlyError}</span>
          <button
            type="button"
            className="voice-error-close"
            onClick={() => {
              clearReconnectTimer();
              reconnectAttemptsRef.current = 0;
              setError(null);
              setHasJoined(false);
            }}
            title="Đóng"
          >
            ✕
          </button>
        </div>
      )}

      {!token || !url ? (
        !friendlyError && <div className="voice-loading">🎤 Đang kết nối kênh thoại...</div>
      ) : (
        <LiveKitRoom
          serverUrl={url}
          token={token}
          connect={true}
          video={false}
          audio={isAlive ? VOICE_CAPTURE_OPTIONS : false}
          options={VOICE_ROOM_OPTIONS}
          connectOptions={VOICE_CONNECT_OPTIONS}
          className="livekit-custom"
          onConnected={() => {
            clearReconnectTimer();
            reconnectAttemptsRef.current = 0;
          }}
          onError={(err) => {
            setError(err?.message || "Không thể kết nối kênh thoại.");
            tokenFetchedRef.current = false;
          }}
          onDisconnected={(reason) => {
            onSpeakingChange?.([]);
            setIsPttPressed(false);
            if (!hasJoined) return;

            // Nếu bị kick hoặc trùng phiên thì dừng ngay không loop
            if (
              reason === DisconnectReason.CLIENT_INITIATED ||
              reason === DisconnectReason.DUPLICATE_IDENTITY ||
              reason === DisconnectReason.PARTICIPANT_REMOVED ||
              reason === DisconnectReason.ROOM_DELETED
            ) {
              setHasJoined(false);
              setToken(null);
              setUrl(null);
              tokenFetchedRef.current = false;
              return;
            }

            // Giới hạn tối đa 3 lần thử kết nối lại (Exponential Backoff: 1.5s -> 4s -> 8s)
            if (reconnectAttemptsRef.current >= MAX_AUTO_RECONNECT_ATTEMPTS) {
              setHasJoined(false);
              setToken(null);
              setUrl(null);
              tokenFetchedRef.current = false;
              setError("Mạng chập chờn — đã tạm ngắt Voice để tiết kiệm tài nguyên. Bấm Tham gia lại khi mạng ổn định.");
              return;
            }

            const delayMs =
              RECONNECT_DELAYS_MS[reconnectAttemptsRef.current] ||
              RECONNECT_DELAYS_MS[RECONNECT_DELAYS_MS.length - 1];
            reconnectAttemptsRef.current += 1;

            clearReconnectTimer();
            setToken(null);
            setUrl(null);
            tokenFetchedRef.current = false;
            reconnectTimerRef.current = setTimeout(() => {
              fetchToken();
            }, delayMs);
          }}
        >
          <SelectiveSubscriptionManager
            isNight={isNight}
            myRole={myRole}
            isAlive={isAlive}
            wolfTeammates={wolfTeammates}
            volumeMap={volumeMap}
          />
          <VoiceParticipantManager
            isNight={isNight}
            myRole={myRole}
            isAlive={isAlive}
            inputMode={inputMode}
            userMicPreference={userMicPreference}
            isPttPressed={isPttPressed}
          />
          <ActiveSpeakersSync
            isNight={isNight}
            myRole={myRole}
            isAlive={isAlive}
            myId={myId}
            wolfTeammates={wolfTeammates}
            volumeMap={volumeMap}
            onSpeakingChange={onSpeakingChange}
          />
          <CustomAudioRenderer
            isNight={isNight}
            myRole={myRole}
            isAlive={isAlive}
            wolfTeammates={wolfTeammates}
            volumeMap={volumeMap}
          />
          <VoicePanel
            isNight={isNight}
            myRole={myRole}
            isAlive={isAlive}
            inputMode={inputMode}
            setInputMode={setInputMode}
            userMicPreference={userMicPreference}
            setUserMicPreference={setUserMicPreference}
            isPttPressed={isPttPressed}
            setIsPttPressed={setIsPttPressed}
            volumeMap={volumeMap}
            setVolumeMap={setVolumeMap}
            onLeaveVoice={handleLeaveVoice}
          />
        </LiveKitRoom>
      )}
    </div>
  );
}
