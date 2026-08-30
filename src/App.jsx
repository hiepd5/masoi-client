import { useState } from "react";
import { useSocket } from "./hooks/useSocket.js";
import Lobby from "./components/Lobby.jsx";
import Room from "./components/Room.jsx";

export default function App() {
  const { socketRef, connected, roomData, setRoomData, setActiveRoom } = useSocket();
  const [roomCode, setRoomCode] = useState(null);

  if (!connected) {
    return (
      <div className="card">
        <p className="status-text">Đang kết nối tới máy chủ...</p>
      </div>
    );
  }

  function handleJoined(code) {
    setActiveRoom(code);
    setRoomCode(code);
  }

  function handleLeave() {
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
