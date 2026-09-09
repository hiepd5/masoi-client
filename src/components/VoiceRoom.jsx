import { useEffect, useState, useCallback } from "react";
import { LiveKitRoom, useTracks, useLocalParticipant, useRoomContext, AudioTrack } from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import "./VoiceRoom.css";

function VoiceParticipantManager({ isNight, myRole }) {
  const { localParticipant } = useLocalParticipant();
  useEffect(() => {
    if (isNight && myRole !== "wolf") {
      localParticipant?.setMicrophoneEnabled(false);
    }
  }, [isNight, myRole, localParticipant]);
  return null;
}

function CustomAudioRenderer({ isNight, myRole, wolfTeammates, volumeMap }) {
  const tracks = useTracks([Track.Source.Microphone]);
  return (
    <>
      {tracks.map((trackRef) => {
        const identity = trackRef.participant.identity;
        if (trackRef.participant.isLocal) return null;
        let shouldPlay = true;
        if (isNight) {
          shouldPlay = myRole === "wolf" && (wolfTeammates.includes(identity) || trackRef.participant.isLocal);
        }
        if (!shouldPlay) return null;
        const vol = volumeMap[identity] ?? 1;
        return <AudioTrack key={identity} trackRef={trackRef} volume={vol} />;
      })}
    </>
  );
}

function VoicePanel({ isNight, myRole, wolfTeammates, volumeMap, setVolumeMap, onSpeakingChange }) {
  const tracks = useTracks([Track.Source.Microphone]);
  const { localParticipant } = useLocalParticipant();
  const [micOn, setMicOn] = useState(true);

  function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    localParticipant?.setMicrophoneEnabled(next);
  }

  function toggleMute(identity) {
    setVolumeMap(prev => ({ ...prev, [identity]: prev[identity] === 0 ? 1 : 0 }));
  }

  // Detect who is speaking
  useEffect(() => {
    const speakers = tracks
      .filter(t => t.participant.audioLevel > 0.05)
      .map(t => t.participant.identity);
    onSpeakingChange?.(speakers);
  }, [tracks, onSpeakingChange]);

  return (
    <div className="voice-panel">
      <div className="voice-header">
        <span className="voice-status-label">
          {isNight ? (myRole === "wolf" ? "🐺 Kênh Bầy Sói" : "🌙 Mọi người đang ngủ") : "☀️ Kênh Chung"}
        </span>
        <button
          className={`btn-mic ${micOn ? 'mic-on' : 'mic-off'}`}
          onClick={toggleMic}
          title={micOn ? 'Tắt mic' : 'Bật mic'}
        >
          {micOn ? '🎤' : '🔇'}
        </button>
      </div>

      <div className="voice-participants">
        {tracks
          .filter(t => !t.participant.isLocal)
          .map(trackRef => {
            const identity = trackRef.participant.identity;
            const isMuted = volumeMap[identity] === 0;
            const isSpeaking = trackRef.participant.audioLevel > 0.05;
            return (
              <div key={identity} className={`voice-participant ${isSpeaking ? 'speaking' : ''}`}>
                <span className="voice-participant-name">
                  {isSpeaking ? '🔊 ' : ''}{identity.slice(0, 8)}
                </span>
                <button
                  className={`btn-mute-player ${isMuted ? 'muted' : ''}`}
                  onClick={() => toggleMute(identity)}
                  title={isMuted ? 'Bỏ tắt tiếng' : 'Tắt tiếng người này'}
                >
                  {isMuted ? '🔇' : '🔉'}
                </button>
              </div>
            );
          })}
      </div>
    </div>
  );
}

export default function VoiceRoom({ socketRef, isNight, myRole, wolfTeammates, onSpeakingChange }) {
  const [token, setToken] = useState(null);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const [volumeMap, setVolumeMap] = useState({});

  useEffect(() => {
    socketRef.current.emit("livekit:token", {}, (res) => {
      if (res.error) setError(res.error);
      else { setToken(res.token); setUrl(res.url); }
    });
  }, [socketRef]);

  if (error) return <div className="voice-error">🎤 Lỗi Voice: {error}</div>;
  if (!token || !url) return <div className="voice-loading">🎤 Đang kết nối voice...</div>;

  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect={true}
      video={false}
      audio={false}
      className="livekit-custom"
    >
      <VoiceParticipantManager isNight={isNight} myRole={myRole} />
      <CustomAudioRenderer isNight={isNight} myRole={myRole} wolfTeammates={wolfTeammates} volumeMap={volumeMap} />
      <VoicePanel
        isNight={isNight}
        myRole={myRole}
        wolfTeammates={wolfTeammates}
        volumeMap={volumeMap}
        setVolumeMap={setVolumeMap}
        onSpeakingChange={onSpeakingChange}
      />
    </LiveKitRoom>
  );
}
