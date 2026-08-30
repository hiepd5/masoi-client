import { useState } from "react";
import { useSocket } from "./hooks/useSocket.js";
import Lobby from "./components/Lobby.jsx";
import Room from "./components/Room.jsx";

export default function App() {
  const { socketRef, connected, roomData, setRoomData } = useSocket();
  const [roomCode, setRoomCode] = useState(null);

  if (!connected) {
    return (
      <div className="card">
        <p className="status-text">Đang kết nối tới máy chủ...</p>
      </div>
    );
  }

  return roomCode ? (
    <Room 
      socketRef={socketRef} 
      roomCode={roomCode} 
      roomData={roomData}
      onLeave={() => { setRoomCode(null); setRoomData(null); }} 
    />
  ) : (
    <Lobby socketRef={socketRef} onJoined={(code) => setRoomCode(code)} />
  );
}
