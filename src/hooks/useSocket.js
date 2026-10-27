import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.PROD
  ? "https://masoi-server-2eca.onrender.com"
  : "http://localhost:3001";

// Định danh thiết bị ẩn danh (chống mở 2 tab cày/soi bài trên bàn công khai Production - SEC-07)
export function getDeviceId() {
  try {
    let id = localStorage.getItem("ws_device_id");
    if (!id || id.length < 8) {
      id = `dev_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-6)}`;
      localStorage.setItem("ws_device_id", id);
    }
    return id;
  } catch {
    return "dev_fallback01";
  }
}

// Each browser tab gets a unique key so sessions don't cross-contaminate
function getTabId() {
  let id = sessionStorage.getItem('ws_tab_id');
  if (!id) {
    id = Math.random().toString(36).slice(2, 9);
    sessionStorage.setItem('ws_tab_id', id);
  }
  return id;
}

function getSessionKey() {
  return `ws_session_${getTabId()}`;
}

export function saveSession(roomCode, sessionToken, playerId, name) {
  localStorage.setItem(getSessionKey(), JSON.stringify({ roomCode, sessionToken, playerId, name }));
}

export function clearSession() {
  localStorage.removeItem(getSessionKey());
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(getSessionKey()));
  } catch { return null; }
}

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [roomData, setRoomData] = useState(null);
  const [reconnectStatus, setReconnectStatus] = useState(null); // null | 'reconnecting' | 'failed'
  const [kicked, setKicked] = useState(null); // null | string (reason)
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
              // Token hết hạn / phòng đã đóng: chỉ thử vào lại nếu phòng đang ở sảnh chờ (SEC-03 chặn vào ngang bằng tên khi đang chơi)
              if (session?.name && session?.roomCode && res?.phase !== "playing") {
                socket.emit("room:join",
                  { roomCode: session.roomCode, name: session.name, deviceId: getDeviceId() },
                  (res2) => {
                    if (res2?.ok) {
                      saveSession(session.roomCode, res2.sessionToken || session.sessionToken, res2.playerId, session.name);
                      sessionStorage.setItem("ws_playerId", res2.playerId);
                      activeRoomCodeRef.current = session.roomCode;
                      setReconnectStatus(null);
                    } else {
                      clearSession();
                      setReconnectStatus('failed');
                    }
                  }
                );
              } else {
                clearSession();
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
      const promotedMe = data?.players?.find((p) => p.sessionToken);
      if (promotedMe?.id) {
        sessionStorage.setItem("ws_playerId", promotedMe.id);
      }
      // Keep session token fresh from server data (hỗ trợ cả ghế chính thức & hàng chờ Khán giả)
      const token =
        data?.mySessionToken ||
        promotedMe?.sessionToken ||
        data?.spectatorSessionToken;
      if (token) {
        const session = getSession();
        if (session) {
          saveSession(
            session.roomCode,
            token,
            promotedMe?.id || data?.mySpectatorId || session.playerId,
            session.name
          );
        }
      }
    });

    // Respond to server heartbeat
    socket.on('ping:server', () => {
      socket.emit('pong:client');
    });

    // Kicked by host
    socket.on('room:kicked', ({ reason }) => {
      clearSession();
      setKicked(reason || 'Bạn đã bị kick khỏi phòng.');
    });

    return () => {
      socket.off('ping:server');
      socket.off('room:kicked');
      socket.disconnect();
    };
  }, []);

  function setActiveRoom(code) {
    activeRoomCodeRef.current = code;
  }

  return { socketRef, connected, roomData, setRoomData, setActiveRoom, reconnectStatus, kicked, clearKicked: () => setKicked(null) };
}
