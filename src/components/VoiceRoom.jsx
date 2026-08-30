import { useEffect, useState } from "react";
import { LiveKitRoom, useTracks, useLocalParticipant, AudioTrack, ControlBar } from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import "./VoiceRoom.css";

function VoiceParticipantManager({ isNight, myRole }) {
  const { localParticipant } = useLocalParticipant();
  
  useEffect(() => {
    if (isNight && myRole !== "wolf") {
      if (localParticipant?.isMicrophoneEnabled) {
        localParticipant.setMicrophoneEnabled(false);
      }
    }
  }, [isNight, myRole, localParticipant]);

  return null;
}

function CustomAudioRenderer({ isNight, myRole, wolfTeammates }) {
  const tracks = useTracks([Track.Source.Microphone]);
  
  return (
    <>
      {tracks.map((trackRef) => {
        let shouldPlay = true;
        if (isNight) {
          if (myRole === "wolf") {
            shouldPlay = wolfTeammates.includes(trackRef.participant.identity) || trackRef.participant.isLocal;
          } else {
            shouldPlay = false;
          }
        }
        if (!shouldPlay || trackRef.participant.isLocal) return null;
        return <AudioTrack key={trackRef.participant.identity} trackRef={trackRef} volume={1} />; 
      })}
    </>
  );
}

export default function VoiceRoom({ socketRef, isNight, myRole, wolfTeammates }) {
  const [token, setToken] = useState(null);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    socketRef.current.emit("livekit:token", {}, (res) => {
      if (res.error) {
        setError(res.error);
      } else {
        setToken(res.token);
        setUrl(res.url);
      }
    });
  }, [socketRef]);

  if (error) return <div className="voice-error">Lỗi Voice: {error}</div>;
  if (!token || !url) return <div className="voice-loading">Đang kết nối Voice...</div>;

  return (
    <div className="voice-room-container">
      <LiveKitRoom
        serverUrl={url}
        token={token}
        connect={true}
        video={false}
        audio={false} 
        className="livekit-custom"
      >
        <VoiceParticipantManager isNight={isNight} myRole={myRole} />
        <CustomAudioRenderer isNight={isNight} myRole={myRole} wolfTeammates={wolfTeammates} />
        
        <div className="voice-controls">
          <p className="voice-status">
            {isNight 
              ? (myRole === "wolf" ? "🐺 Kênh Bầy Sói" : "Mọi người đang ngủ...")
              : "☀️ Kênh Chung Làng Chài"}
          </p>
          <div className="voice-buttons">
            <ControlBar variation="minimal" controls={{ microphone: true, camera: false, screenShare: false, leave: false }} />
          </div>
        </div>
      </LiveKitRoom>
    </div>
  );
}

