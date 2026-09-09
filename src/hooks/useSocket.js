import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.PROD
  ? "https://masoi-server-production.up.railway.app"
  : "http://localhost:3001";

const SESSION_KEY = "ws_session"; // { roomCode, sessionToken, playerId, name }

export function saveSession(roomCode, sessionToken, playerId, name) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, sessionToken, playerId, name }));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch { return null; }
}

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [roomData, setRoomData] = useState(null);
  const [reconnectStatus, setReconnectStatus] = useState(null); // null | 'reconnecting' | 'failed'
  const activeRoomCodeRef = useRef(null);

  useEffect(() => {
    const socket = io(SERVER_URL, { autoConnect: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setReconnectStatus(null);
      
      // Try session token reconnect first (most reliable)
      const session = getSession();
      if (session?.roomCode && session?.sessionToken) {
        setReconnectStatus('reconnecting');
        socket.emit("room:reconnect", 
          { roomCode: session.roomCode, sessionToken: session.sessionToken },
          (res) => {
            if (res?.ok) {
              // Update playerId in session (stays same but confirm)
              saveSession(session.roomCode, session.sessionToken, res.playerId, session.name);
              // Update sessionStorage too for PlayingView/Room
              sessionStorage.setItem("ws_playerId", res.playerId);
              sessionStorage.setItem("ws_name", session.name || "");
              activeRoomCodeRef.current = session.roomCode;
              setReconnectStatus(null);
            } else {
              // Token failed — fall back to name-based rejoin
              if (session?.name && session?.roomCode) {
                socket.emit("room:join",
                  { roomCode: session.roomCode, name: session.name },
                  (res2) => {
                    if (res2?.ok) {
                      saveSession(session.roomCode, res2.sessionToken || session.sessionToken, res2.playerId, session.name);
                      sessionStorage.setItem("ws_playerId", res2.playerId);
                      activeRoomCodeRef.current = session.roomCode;
                      setReconnectStatus(null);
                    } else {
                      setReconnectStatus('failed');
                    }
                  }
                );
              } else {
                setReconnectStatus('failed');
              }
            }
          }
        );
      }
    });

    socket.on("disconnect", () => setConnected(false));
    socket.on("room:update", (data) => {
      setRoomData(data);
      // Keep session token fresh from server data
      const token = data?.mySessionToken || data?.players?.find(p => p.sessionToken)?.sessionToken;
      if (token) {
        const session = getSession();
        if (session) {
          saveSession(session.roomCode, token, session.playerId, session.name);
        }
      }
    });

    return () => { socket.disconnect(); };
  }, []);

  function setActiveRoom(code) {
    activeRoomCodeRef.current = code;
  }

  return { socketRef, connected, roomData, setRoomData, setActiveRoom, reconnectStatus };
}
