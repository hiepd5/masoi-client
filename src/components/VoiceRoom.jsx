import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  LiveKitRoom,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  AudioTrack,
  StartAudio,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import "./VoiceRoom.css";

// Quản lý trạng thái Micro theo Phase & Tình trạng Sống/Chết
function VoiceParticipantManager({ isNight, myRole, isAlive, userMicPreference }) {
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (!localParticipant) return;

    if (!isAlive) {
      // Người chết bị tắt mic tuyệt đối
      localParticipant.setMicrophoneEnabled(false);
      return;
    }

    if (isNight) {
      if (myRole === "wolf") {
        // Sói được phép nói trong kênh bầy sói ban đêm
        localParticipant.setMicrophoneEnabled(userMicPreference);
      } else {
        // Dân làng đang ngủ -> cưỡng chế tắt mic
        localParticipant.setMicrophoneEnabled(false);
      }
    } else {
      // Ban ngày: Khôi phục mic theo sở thích của người chơi còn sống
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
    const checkPlayback = () => {
      setBlocked(!room.canPlaybackAudio);
    };
    checkPlayback();
    room.on("audioPlaybackChanged", checkPlayback);
    return () => {
      room.off("audioPlaybackChanged", checkPlayback);
    };
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
          // Ban đêm: Chỉ Sói còn sống mới nghe thấy đồng đội Sói nói
          if (myRole === "wolf" && isAlive) {
            shouldPlay = wolfTeammates.includes(identity);
          } else {
            // Dân làng hoặc người chết không nghe thấy gì ban đêm
            shouldPlay = false;
          }
        } else {
          // Ban ngày: Mọi người (kể cả người chết đang theo dõi) đều nghe thấy những ai còn sống nói
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
}) {
  const tracks = useTracks([Track.Source.Microphone]);
  const room = useRoomContext();

  // Kiểm tra quyền được phép bật mic
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

  // Phát hiện người đang phát âm thanh để highlight
  useEffect(() => {
    const speakers = tracks
      .filter((t) => (t.participant.audioLevel || 0) > 0.03)
      .map((t) => t.participant.identity);
    onSpeakingChange?.(speakers);
  }, [tracks, onSpeakingChange]);

  // Label trạng thái kênh
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
              ? "Đang bật mic"
              : "Bật mic"}
          </span>
        </button>
      </div>

      {/* Danh sách người trong phòng voice */}
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

  const fetchToken = useCallback(() => {
    if (!socketRef?.current) return;
    socketRef.current.emit("livekit:token", {}, (res) => {
      if (res?.error) {
        setError(res.error);
      } else if (res?.token && res?.url) {
        setToken(res.token);
        setUrl(res.url);
        setError(null);
      }
    });
  }, [socketRef]);

  useEffect(() => {
    fetchToken();

    // Lắng nghe khi socket reconnect để làm mới token
    const socket = socketRef?.current;
    if (socket) {
      socket.on("connect", fetchToken);
      return () => {
        socket.off("connect", fetchToken);
      };
    }
  }, [fetchToken, socketRef]);

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

  return (
    <div className="voice-room-wrapper">
      {friendlyError && (
        <div className="voice-error-banner">
          <span>{friendlyError}</span>
          <button className="voice-error-close" onClick={() => setError(null)} title="Đóng">✕</button>
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
          onError={(err) => setError(err.message)}
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
          />
        </LiveKitRoom>
      )}
    </div>
  );
}
