import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.PROD
  ? "https://masoi-server-production.up.railway.app"
  : "http://localhost:3001";

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [roomData, setRoomData] = useState(null);
  // Lưu roomCode hiện tại để auto-rejoin khi mất kết nối
  const activeRoomCodeRef = useRef(null);

  useEffect(() => {
    const socket = io(SERVER_URL, { autoConnect: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // Auto-rejoin nếu đang ở trong phòng và bị mất kết nối
      const roomCode = activeRoomCodeRef.current;
      const playerName = sessionStorage.getItem("ws_name");
      if (roomCode && playerName) {
        socket.emit("room:join", { roomCode, name: playerName }, (res) => {
          if (res?.ok) {
            // Cập nhật playerId nếu có (trường hợp reconnect, server giữ id cũ)
            if (res.playerId) sessionStorage.setItem("ws_playerId", res.playerId);
          }
        });
      }
    });

    socket.on("disconnect", () => setConnected(false));
    socket.on("room:update", (data) => setRoomData(data));

    return () => {
      socket.disconnect();
    };
  }, []);

  function setActiveRoom(code) {
    activeRoomCodeRef.current = code;
  }

  return { socketRef, connected, roomData, setRoomData, setActiveRoom };
}
