import { useState, useEffect, lazy, Suspense } from "react";
import { useSocket, clearSession } from "./hooks/useSocket.js";
import Lobby from "./components/Lobby.jsx";
import Room from "./components/Room.jsx";
import DevSandbox from "./components/DevSandbox.jsx";
import Scene3DErrorBoundary from "./3d/components/Scene3DErrorBoundary.jsx";
import { isDevArchitectAllowed } from "./3d/editor/defaultVillageLayout.js";

const WerewolfScene3D = lazy(() => import("./3d/scene/WerewolfScene3D.jsx"));

export default function App() {
  const { socketRef, connected, roomData, setRoomData, setActiveRoom, reconnectStatus, kicked, clearKicked } = useSocket();
  const [roomCode, setRoomCode] = useState(null);
  const [standaloneStudioOpen, setStandaloneStudioOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const p = new URLSearchParams(window.location.search);
      return isDevArchitectAllowed() && p.get("studio") === "1";
    } catch {
      return false;
    }
  });
  const canOpenArchitect = isDevArchitectAllowed();

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

  // Cho phép mở Studio Cảnh Quan D5 độc lập 1-Click ngay cả khi chưa tạo phòng / chưa nối Server!
  if (canOpenArchitect && standaloneStudioOpen) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100dvh",
          zIndex: 9999,
          background: "#050a18",
          overflow: "hidden",
        }}
      >
        <Scene3DErrorBoundary onFallback2D={() => setStandaloneStudioOpen(false)}>
          <Suspense
            fallback={
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fbbf24",
                  fontSize: "15px",
                  fontWeight: 800,
                }}
              >
                🏗️ Đang khởi tạo Studio Cảnh Quan D5 (Nạp 12/12 Model Tripo Pro)...
              </div>
            }
          >
            <WerewolfScene3D
              standaloneArchitect
              onExitStandalone={() => setStandaloneStudioOpen(false)}
            />
          </Suspense>
        </Scene3DErrorBoundary>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="card">
        <p className="status-text">Đang kết nối tới máy chủ...</p>
        {canOpenArchitect && (
          <button
            type="button"
            onClick={() => setStandaloneStudioOpen(true)}
            style={{
              marginTop: "12px",
              width: "100%",
              padding: "10px 14px",
              borderRadius: "10px",
              fontSize: "13.5px",
              fontWeight: 800,
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "#0f172a",
              border: "1px solid #fde047",
              boxShadow: "0 4px 16px rgba(245, 158, 11, 0.45)",
              cursor: "pointer",
            }}
          >
            🏗️ Mở Studio Cảnh Quan D5 (3D Ngoại Cảnh)
          </button>
        )}
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
    <>
      <Room 
        socketRef={socketRef} 
        roomCode={roomCode} 
        roomData={roomData}
        onLeave={handleLeave}
        onOpenArchitectStudio={canOpenArchitect ? () => setStandaloneStudioOpen(true) : null}
      />
      {import.meta.env.DEV && <DevSandbox socketRef={socketRef} room={roomData} />}
    </>
  ) : (
    <Lobby
      socketRef={socketRef}
      onJoined={handleJoined}
      onOpenArchitectStudio={canOpenArchitect ? () => setStandaloneStudioOpen(true) : null}
    />
  );
}
