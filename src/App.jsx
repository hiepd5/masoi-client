import { useState, useEffect, lazy, Suspense } from "react";
import { useSocket, clearSession } from "./hooks/useSocket.js";
import Lobby from "./components/Lobby.jsx";
import Room from "./components/Room.jsx";
import DevSandbox from "./components/DevSandbox.jsx";
import Scene3DErrorBoundary from "./3d/components/Scene3DErrorBoundary.jsx";
import { isDevArchitectAllowed } from "./3d/editor/defaultVillageLayout.js";
import { resolveInitialLobbyUniverse, getUniverseTheme } from "./config/universeThemes.config.js";

const WerewolfScene3D = lazy(() => import("./3d/scene/WerewolfScene3D.jsx"));

const WARMUP_TIPS = [
  "💡 Chọn 1 trong 3 không gian (Ma Sói • Công Sở • Học Đường) để bước vào ván đấu suy luận 3D ngay!",
  "🤖 Không cần chờ đủ người — bấm 'Chơi Cùng BOT AI' là đấu ngay cùng 7 AI thông minh!",
  "⚡ Bấm 'Vào Chơi Nhanh' để ghép bàn trực tuyến 1-chạm cùng mọi người!",
  "🔑 Có mã phòng của bạn bè? Nhập 5 ký tự ở sảnh để vào thẳng bàn!",
  "🎬 Cuối mỗi ván đấu có Phim 3D tua lại toàn bộ diễn biến bí mật!",
];

function NordicServerWarmupScreen({ canOpenArchitect, onOpenStudio }) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const initialUniverseId = resolveInitialLobbyUniverse();
  const uTheme = getUniverseTheme(initialUniverseId);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const tipIdx = Math.floor(elapsedSec / 4) % WARMUP_TIPS.length;
  const pct = Math.min(94, Math.round(18 + (1 - Math.exp(-elapsedSec / 14)) * 78));

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        background:
          "radial-gradient(circle at 50% 24%, rgba(56, 189, 248, 0.14), rgba(9, 13, 24, 0.96) 62%), #060a14",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          padding: "26px 22px",
          borderRadius: "22px",
          background: "rgba(15, 23, 42, 0.86)",
          backdropFilter: "blur(16px)",
          border: `1px solid ${uTheme.panelBorderRgba || "rgba(234, 179, 8, 0.32)"}`,
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
          textAlign: "center",
          color: "#f8fafc",
        }}
      >
        <div style={{ fontSize: "2.5rem", marginBottom: "8px", filter: "drop-shadow(0 0 16px rgba(250, 204, 21, 0.35))" }}>
          🐺 💼 🎒
        </div>
        <h1 style={{ margin: "0 0 6px", fontSize: "1.28rem", fontWeight: 800, color: "#fef08a" }}>
          {uTheme.brandTitle || "Suy Luận 3D Đa Vũ Trụ"}
        </h1>
        <p style={{ margin: "0 0 16px", fontSize: "0.88rem", color: "#cbd5e1", lineHeight: 1.45 }}>
          {elapsedSec < 3
            ? "⚡ Đang kết nối máy chủ trực tuyến..."
            : "🔔 Đang đánh thức máy chủ đám mây (tự động vào ngay sau vài giây)..."}
        </p>

        {/* Thanh tiến trình ánh trăng vàng - chàm */}
        <div
          style={{
            width: "100%",
            height: "8px",
            borderRadius: "999px",
            background: "rgba(30, 41, 59, 0.9)",
            overflow: "hidden",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            marginBottom: "10px",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: "999px",
              background: "linear-gradient(90deg, #eab308, #f97316, #6366f1)",
              transition: "width 0.8s ease-out",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.75rem",
            color: "#94a3b8",
            marginBottom: "16px",
          }}
        >
          <span>⚡ Tín hiệu: Đang đồng bộ</span>
          <span>⏱ {elapsedSec}s</span>
        </div>

        <div
          style={{
            padding: "11px 14px",
            borderRadius: "12px",
            background: "rgba(30, 41, 59, 0.65)",
            border: "1px solid rgba(99, 102, 241, 0.28)",
            fontSize: "0.82rem",
            color: "#e2e8f0",
            lineHeight: 1.45,
            minHeight: "54px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {WARMUP_TIPS[tipIdx]}
        </div>

        {canOpenArchitect && (
          <div style={{ marginTop: "14px" }}>
            <button
              type="button"
              onClick={() => onOpenStudio("choreo")}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "13.5px",
                fontWeight: 800,
                background: "linear-gradient(135deg, #9333ea, #4f46e5)",
                color: "#ffffff",
                border: "1px solid #d8b4fe",
                boxShadow: "0 4px 16px rgba(147, 51, 234, 0.45)",
                cursor: "pointer",
              }}
            >
              🎬 Mở Studio Hoạt Cảnh 9 Vai (Test Trước Khi Xây Model)
            </button>
            <button
              type="button"
              onClick={() => onOpenStudio("architect")}
              style={{
                marginTop: "8px",
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
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { socketRef, connected, roomData, setRoomData, setActiveRoom, reconnectStatus, kicked, clearKicked } = useSocket();
  const [roomCode, setRoomCode] = useState(null);
  const [standaloneStudioMode, setStandaloneStudioMode] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const p = new URLSearchParams(window.location.search);
      if (!isDevArchitectAllowed()) return null;
      if (p.get("choreo") === "1") return "choreo";
      if (p.get("studio") === "1") return "architect";
      return null;
    } catch {
      return null;
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

  // Cho phép mở Studio Cảnh Quan D5 hoặc Studio Hoạt Cảnh 9 Vai độc lập 1-Click ngay cả khi chưa tạo phòng!
  if (canOpenArchitect && standaloneStudioMode) {
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
        <Scene3DErrorBoundary onFallback2D={() => setStandaloneStudioMode(null)}>
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
                {standaloneStudioMode === "choreo"
                  ? "🎬 Đang khởi tạo Studio Hoạt Cảnh 9 Vai (Pre-vis Rig & Đường Nhảy Bezier)..."
                  : "🏗️ Đang khởi tạo Studio Cảnh Quan D5 (Nạp 12/12 Model Tripo Pro)..."}
              </div>
            }
          >
            <WerewolfScene3D
              standaloneArchitect={standaloneStudioMode === "architect"}
              standaloneChoreo={standaloneStudioMode === "choreo"}
              scenePresetId={roomData?.scenePresetId || null}
              universeId={roomData?.universeId || "classic"}
              onExitStandalone={() => setStandaloneStudioMode(null)}
            />
          </Suspense>
        </Scene3DErrorBoundary>
      </div>
    );
  }

  if (!connected) {
    return (
      <NordicServerWarmupScreen
        canOpenArchitect={canOpenArchitect}
        onOpenStudio={(mode) => setStandaloneStudioMode(mode)}
      />
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
        onOpenArchitectStudio={canOpenArchitect ? () => setStandaloneStudioMode("architect") : null}
      />
      {import.meta.env.DEV && <DevSandbox socketRef={socketRef} room={roomData} />}
    </>
  ) : (
    <Lobby
      socketRef={socketRef}
      onJoined={handleJoined}
      onOpenArchitectStudio={canOpenArchitect ? () => setStandaloneStudioMode("architect") : null}
      onOpenChoreoStudio={canOpenArchitect ? () => setStandaloneStudioMode("choreo") : null}
    />
  );
}
