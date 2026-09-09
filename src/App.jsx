import { useState, useEffect } from "react";
import { useSocket, clearSession } from "./hooks/useSocket.js";
import Lobby from "./components/Lobby.jsx";
import Room from "./components/Room.jsx";

export default function App() {
  const { socketRef, connected, roomData, setRoomData, setActiveRoom, reconnectStatus, kicked, clearKicked } = useSocket();
  const [roomCode, setRoomCode] = useState(null);

  useEffect(() => {
    if (roomData?.code && !roomCode) {
      setRoomCode(roomData.code);
      setActiveRoom(roomData.code);
    }
  }, [roomData?.code, roomCode]);

  useEffect(() => {
    if (kicked) {
      setActiveRoom(null);
      setRoomCode(null);
      alert(kicked);
      clearKicked();
    }
  }, [kicked, setActiveRoom, clearKicked]);

  if (!connected) {
    return (
      <div className="card">
        <p className="status-text">Đang kết nối tới máy chủ...</p>
      </div>
    );
  }

  if (reconnectStatus === 'reconnecting') {
    return (
      <div className="card">
        <p className="status-text">🔄 Đang khôi phục phiên chơi...</p>
      </div>
    );
  }

  function handleJoined(code) {
    setActiveRoom(code);
    setRoomCode(code);
  }

  function handleLeave() {
    clearSession();
    setActiveRoom(null);
    setRoomCode(null);
    setRoomData(null);
  }

  return roomCode ? (
    <Room 
      socketRef={socketRef} 
      roomCode={roomCode} 
      roomData={roomData}
      onLeave={handleLeave} 
    />
  ) : (
    <Lobby socketRef={socketRef} onJoined={handleJoined} />
  );
}
