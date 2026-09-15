import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  LiveKitRoom,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  AudioTrack,
} from "@livekit/components-react";
import { Track, Room, RoomEvent } from "livekit-client";
import "@livekit/components-styles";
import "./VoiceRoom.css";

// Quản lý trạng thái Micro theo Phase & Tình trạng Sống/Chết
function VoiceParticipantManager({ isNight, myRole, isAlive, userMicPreference }) {
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (!localParticipant) return;

    if (!isAlive) {
      localParticipant.setMicrophoneEnabled(false);
      return;
    }

    if (isNight) {
      if (myRole === "wolf") {
        localParticipant.setMicrophoneEnabled(userMicPreference);
      } else {
        localParticipant.setMicrophoneEnabled(false);
      }
    } else {
      localParticipant.setMicrophoneEnabled(userMicPreference);
    }
  }, [isNight, myRole, isAlive, userMicPreference, localParticipant]);

  return null;
}

// Xử lý chặn âm thanh tự phát (Autoplay Policy) của trình duyệt
function AutoplayBlockNotice() {
  const room = useRoomContext();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!room) return;
    const checkPlayback = () => setBlocked(!room.canPlaybackAudio);
    checkPlayback();
    room.on(RoomEvent.AudioPlaybackStatusChanged, checkPlayback);
    return () => room.off(RoomEvent.AudioPlaybackStatusChanged, checkPlayback);
  }, [room]);

  if (!blocked) return null;

  return (
    <div className="voice-autoplay-notice" onClick={() => room.startAudio()}>
      <span>🔊 Trình duyệt đang chặn âm thanh. <b>Bấm vào đây để nghe</b></span>
    </div>
  );
}

// Bộ lọc âm thanh theo luật chơi Ma Sói
function CustomAudioRenderer({ isNight, myRole, isAlive, wolfTeammates, volumeMap }) {
  const tracks = useTracks([Track.Source.Microphone]);

  return (
    <>
      {tracks.map((trackRef) => {
        const identity = trackRef.participant.identity;
        if (trackRef.participant.isLocal) return null;

        let shouldPlay = false;
        if (isNight) {
          if (myRole === "wolf" && isAlive) {
            shouldPlay = wolfTeammates.includes(identity);
          }
        } else {
          shouldPlay = true;
        }

        if (!shouldPlay) return null;

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
  userMicPreference,
  setUserMicPreference,
  volumeMap,
  setVolumeMap,
  onSpeakingChange,
  onLeaveVoice,
}) {
  const tracks = useTracks([Track.Source.Microphone]);
  const room = useRoomContext();

  const canSpeak = isAlive && (!isNight || myRole === "wolf");

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

  useEffect(() => {
    const speakers = tracks
      .filter((t) => (t.participant.audioLevel || 0) > 0.03)
      .map((t) => t.participant.identity);
    onSpeakingChange?.(speakers);
  }, [tracks, onSpeakingChange]);

  let channelLabel = "☀️ Kênh Chung";
  if (!isAlive) {
    channelLabel = "💀 Khán Giả (Chỉ nghe)";
  } else if (isNight) {
    channelLabel = myRole === "wolf" ? "🐺 Kênh Bầy Sói" : "🌙 Mọi người đang ngủ";
  }

  return (
    <div className="voice-panel">
      <AutoplayBlockNotice />

      <div className="voice-header">
        <span className="voice-status-label">{channelLabel}</span>
        <div className="voice-header-actions">
          <button
            className={`btn-mic ${
              !canSpeak ? "mic-disabled" : userMicPreference ? "mic-on" : "mic-off"
            }`}
            onClick={toggleMic}
            disabled={!canSpeak}
            title={
              !isAlive
                ? "Người chết phải giữ im lặng"
                : isNight && myRole !== "wolf"
                ? "Ban đêm dân làng phải ngủ"
                : userMicPreference
                ? "Tắt mic của bạn"
                : "Bật mic của bạn"
            }
          >
            {!canSpeak ? "🔒" : userMicPreference ? "🎤" : "🔇"}
            <span className="mic-btn-text">
              {!canSpeak
                ? "Khóa mic"
                : userMicPreference
                ? "Đang bật"
                : "Bật mic"}
            </span>
          </button>
          {/* OPT 2: Nút rời voice — disconnect khỏi LiveKit để tiết kiệm phút */}
          <button
            className="btn-leave-voice"
            onClick={onLeaveVoice}
            title="Rời kênh voice (tiết kiệm dữ liệu)"
          >
            📵
          </button>
        </div>
      </div>

      <div className="voice-participants">
        {tracks
          .filter((t) => !t.participant.isLocal)
          .map((trackRef) => {
            const participant = trackRef.participant;
            const identity = participant.identity;
            const displayName = participant.name || identity.slice(0, 8);
            const isMuted = volumeMap[identity] === 0;
            const isSpeaking = (participant.audioLevel || 0) > 0.03;

            return (
              <div
                key={identity}
                className={`voice-participant ${isSpeaking ? "speaking" : ""}`}
              >
                <span className="voice-participant-name" title={displayName}>
                  {isSpeaking ? "🔊 " : "🎙️ "}
                  {displayName}
                </span>
                <button
                  className={`btn-mute-player ${isMuted ? "muted" : ""}`}
                  onClick={() => toggleMute(identity)}
                  title={isMuted ? "Bỏ tắt tiếng người này" : "Tắt tiếng người này"}
                >
                  {isMuted ? "🔇" : "🔉"}
                </button>
              </div>
            );
          })}
        {tracks.filter((t) => !t.participant.isLocal).length === 0 && (
          <span className="voice-empty-hint">Chưa có ai khác bật mic</span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT — VoiceRoom với 4 tối ưu tiết kiệm phút
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

  // OPT 1: Lazy connect — mặc định chưa tham gia, chờ người dùng bấm nút
  const [hasJoined, setHasJoined] = useState(false);
  // Theo dõi token đã được fetch chưa (để skip reconnect nếu còn valid)
  const tokenFetchedRef = useRef(false);

  // OPT 4: Chỉ fetch token khi chưa có token (tránh spam reconnect)
  const fetchToken = useCallback(() => {
    if (!socketRef?.current) return;
    // OPT 4 FIX: Nếu đã có token hợp lệ và chưa có lỗi thì không fetch lại
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
    // Chỉ fetch token khi người dùng đã chọn tham gia voice
    if (!hasJoined) return;
    fetchToken();

    // Lắng nghe khi socket reconnect — chỉ fetch lại nếu chưa có token
    const socket = socketRef?.current;
    if (socket) {
      socket.on("connect", fetchToken);
      return () => socket.off("connect", fetchToken);
    }
  }, [fetchToken, socketRef, hasJoined]);

  // OPT 3: Người chết → tự động disconnect khỏi LiveKit
  const prevAliveRef = useRef(isAlive);
  useEffect(() => {
    if (prevAliveRef.current === true && isAlive === false) {
      // Vừa chết → rời voice để tiết kiệm phút
      if (hasJoined) {
        setHasJoined(false);
        setToken(null);
        setUrl(null);
        tokenFetchedRef.current = false;
      }
    }
    prevAliveRef.current = isAlive;
  }, [isAlive, hasJoined]);

  // OPT 2: Hàm rời voice thủ công (nút 📵 trong VoicePanel)
  const handleLeaveVoice = useCallback(() => {
    setHasJoined(false);
    setToken(null);
    setUrl(null);
    setError(null);
    tokenFetchedRef.current = false;
  }, []);

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

  // ---- Render ----

  // OPT 1: Chưa join → hiển thị nút mời tham gia
  if (!hasJoined) {
    return (
      <div className="voice-room-wrapper">
        {friendlyError && (
          <div className="voice-error-banner">
            <span>{friendlyError}</span>
            <button className="voice-error-close" onClick={() => setError(null)} title="Đóng">✕</button>
          </div>
        )}
        <div className="voice-join-prompt">
          <div className="voice-join-icon">🎙️</div>
          <div className="voice-join-text">
            {!isAlive
              ? "Bạn đã chết. Tham gia để nghe (chỉ nghe, không nói)."
              : "Tham gia kênh Voice để nói chuyện với mọi người."}
          </div>
          <button
            className="btn-join-voice"
            onClick={() => {
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
          <button className="voice-error-close" onClick={() => { setError(null); setHasJoined(false); }} title="Đóng">✕</button>
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
          audio={true}
          className="livekit-custom"
          onError={(err) => {
            setError(err.message);
            tokenFetchedRef.current = false;
          }}
          onDisconnected={() => {
            // Nếu bị disconnect không chủ ý, reset token để reconnect đúng cách
            if (hasJoined) {
              tokenFetchedRef.current = false;
              setToken(null);
              setUrl(null);
            }
          }}
        >
          <VoiceParticipantManager
            isNight={isNight}
            myRole={myRole}
            isAlive={isAlive}
            userMicPreference={userMicPreference}
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
            userMicPreference={userMicPreference}
            setUserMicPreference={setUserMicPreference}
            volumeMap={volumeMap}
            setVolumeMap={setVolumeMap}
            onSpeakingChange={onSpeakingChange}
            onLeaveVoice={handleLeaveVoice}
          />
        </LiveKitRoom>
      )}
    </div>
  );
}
