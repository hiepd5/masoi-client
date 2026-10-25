import { useEffect, useMemo, useState } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import {
  CAMPFIRE_SAFE_RADIUS,
  STUDIO_CHOREO_SCENARIOS,
  TRIPO_ROLE_RIG_GUIDES,
  buildChoreographyDebugArcs,
} from "../animation/actorChoreography3D.js";
import {
  get3DModelRenderMode,
  subscribe3DModelRenderMode,
  toggle3DModelRenderMode,
} from "../config/seasonalEventRegistry.js";

/**
 * Vẽ Đường Cong Quỹ Đạo Nhảy Bezier 3D + Vòng An Toàn Né Lửa Trại (R = 1.92m) + Điểm Đáp Đất
 * ngay trên mặt sân đá để Kiến Trúc Sư kiểm chứng 1:1 trước khi tạo model Tripo AI!
 */
export function ChoreographyDebugArcs3D({
  visible = false,
  actorChoreoMap = null,
  seatMap = null,
  gallowsSpot = null,
}) {
  const safeCirclePoints = useMemo(() => {
    const pts = [];
    const segs = 48;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push([Math.sin(a) * CAMPFIRE_SAFE_RADIUS, 0.035, Math.cos(a) * CAMPFIRE_SAFE_RADIUS]);
    }
    return pts;
  }, []);

  const arcs = useMemo(() => {
    if (!visible) return [];
    return buildChoreographyDebugArcs({ actorChoreoMap, seatMap, gallowsSpot });
  }, [visible, actorChoreoMap, seatMap, gallowsSpot]);

  if (!visible) return null;

  return (
    <group raycast={() => null}>
      {/* Vòng ranh giới bảo vệ Đống Lửa Trung Tâm (R = 1.92m — Không đường nhảy nào được cắt qua!) */}
      <Line
        points={safeCirclePoints}
        color="#f59e0b"
        lineWidth={1.8}
        dashed
        dashSize={0.22}
        gapSize={0.14}
        transparent
        opacity={0.78}
      />

      {/* Các đường cong Bezier 3D của Sói / Bảo Vệ / Pháp Trường */}
      {arcs.map((arc) => (
        <group key={arc.id}>
          <Line
            points={arc.points}
            color={arc.color}
            lineWidth={3}
            transparent
            opacity={0.92}
          />
          {/* Vòng đánh dấu Điểm Đáp Chân Chuẩn Xác trên mặt đá */}
          <mesh
            position={[arc.landingXZ[0], 0.026, arc.landingXZ[1]]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.22, 0.34, 24]} />
            <meshBasicMaterial
              color={arc.color}
              transparent
              opacity={0.88}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Thanh Điều Khiển '🎬 Studio Hoạt Cảnh 9 Vai' (Chỉ hiện cho Dev trên Localhost)
 * Cho phép bấm 1-Click xem ngay cả 11 kịch bản hành động, đóng băng từng khung hình giữa không trung,
 * bật Slow-Motion 0.25x và đọc trực tiếp Lưu Ý Tạo Hình Tripo AI của đúng vai đang diễn!
 */
export function ChoreographyStudioHUD({
  activeScenarioId,
  onSelectScenario,
  isPlaying,
  onTogglePlay,
  onReplayFromStart,
  loopEnabled,
  onToggleLoop,
  speedScale,
  onChangeSpeed,
  progress,
  onScrubProgress,
  cameraPreset,
  onChangeCameraPreset,
  showDebugArcs,
  onToggleDebugArcs,
  showRigGuide,
  onToggleRigGuide,
  onCloseStudio,
  standaloneMode = false,
}) {
  const scenario =
    STUDIO_CHOREO_SCENARIOS.find((s) => s.id === activeScenarioId) || STUDIO_CHOREO_SCENARIOS[0];
  const rigGuide = TRIPO_ROLE_RIG_GUIDES[scenario.roleFocus] || TRIPO_ROLE_RIG_GUIDES.wolf;
  const [renderMode, setRenderMode] = useState(() => get3DModelRenderMode());

  useEffect(() => {
    return subscribe3DModelRenderMode((m) => setRenderMode(m));
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        left: "12px",
        bottom: "12px",
        zIndex: 32,
        width: "min(450px, calc(100vw - 24px))",
        maxHeight: "calc(100dvh - 68px)",
        overflowY: "auto",
        background: "rgba(8, 13, 26, 0.9)",
        border: "1px solid rgba(168, 85, 247, 0.45)",
        borderRadius: "16px",
        padding: "11px 13px",
        backdropFilter: "blur(14px)",
        boxShadow: "0 16px 40px rgba(0, 0, 0, 0.72)",
        color: "#f1f5f9",
        fontSize: "11.5px",
        pointerEvents: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
          marginBottom: "8px",
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: "13px", color: "#f3e8ff" }}>
            🎬 Studio Hoạt Cảnh 9 Nhân Vật (Tripo 3D Live)
          </div>
          <div style={{ fontSize: "10.5px", color: "#94a3b8" }}>
            Đã Rig <code>10/10 Nhân Vật (18–20 Xương)</code> + <code>6 Gói VFX Thực Chiến</code> · <code>WebP + Meshopt</code>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <button
            type="button"
            onClick={() => toggle3DModelRenderMode()}
            title="Chuyển nóng giữa Model 3D Tripo (.GLB) và Procedural Greybox để đối chiếu 1:1"
            style={{
              width: "auto",
              margin: 0,
              padding: "4px 9px",
              borderRadius: "8px",
              fontSize: "10.5px",
              fontWeight: 800,
              background:
                renderMode === "tripo_3d"
                  ? "rgba(16, 185, 129, 0.24)"
                  : "rgba(148, 163, 184, 0.2)",
              color: renderMode === "tripo_3d" ? "#6ee7b7" : "#cbd5e1",
              border:
                renderMode === "tripo_3d"
                  ? "1px solid rgba(52, 211, 153, 0.55)"
                  : "1px solid rgba(148, 163, 184, 0.35)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {renderMode === "tripo_3d" ? "🎄 3D Tripo: BẬT" : "🎭 Cổ Điển"}
          </button>
          <button
            type="button"
            onClick={onCloseStudio}
            style={{
              width: "auto",
              margin: 0,
              padding: "4px 10px",
              borderRadius: "8px",
              fontSize: "11px",
              fontWeight: 700,
              background: "rgba(239, 68, 68, 0.22)",
              color: "#fca5a5",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {standaloneMode ? "✕ Về Sảnh" : "✕ Đóng"}
          </button>
        </div>
      </div>

      {/* Lưới chọn nhanh 11 Kịch bản của 9 Vai */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "5px",
          marginBottom: "9px",
        }}
      >
        {STUDIO_CHOREO_SCENARIOS.map((sc) => {
          const active = sc.id === scenario.id;
          return (
            <button
              key={sc.id}
              type="button"
              onClick={() => onSelectScenario(sc.id)}
              style={{
                width: "100%",
                margin: 0,
                padding: "6px 8px",
                borderRadius: "9px",
                fontSize: "11px",
                fontWeight: active ? 800 : 600,
                textAlign: "left",
                background: active
                  ? "linear-gradient(135deg, rgba(147, 51, 234, 0.85), rgba(79, 70, 229, 0.85))"
                  : "rgba(30, 41, 59, 0.68)",
                color: active ? "#ffffff" : "#cbd5e1",
                border: active
                  ? "1px solid rgba(216, 180, 254, 0.75)"
                  : "1px solid rgba(148, 163, 184, 0.2)",
                cursor: "pointer",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={sc.description}
            >
              {sc.label}
            </button>
          );
        })}
      </div>

      {/* Mô tả kịch bản đang chọn */}
      <div
        style={{
          background: "rgba(15, 23, 42, 0.75)",
          border: "1px solid rgba(148, 163, 184, 0.18)",
          borderRadius: "9px",
          padding: "6px 9px",
          marginBottom: "8px",
          fontSize: "11px",
          color: "#e2e8f0",
          lineHeight: 1.4,
        }}
      >
        {scenario.description}
      </div>

      {/* Thanh kéo Scrubber đóng băng khung hình giữa không trung (0% -> 100%) */}
      <div style={{ marginBottom: "8px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "10.5px",
            color: "#cbd5e1",
            marginBottom: "3px",
          }}
        >
          <span>
            ⏱ Nhịp diễn: <b>{Math.round(progress * 100)}%</b>{" "}
            {progress < 0.18
              ? "(① Gồng rời ghế)"
              : progress < 0.44
                ? "(② Đang bay / Tung chiêu)"
                : progress < 0.72
                  ? "(③ Đòn Climax!)"
                  : "(④ Nhảy lùi về ghế)"}
          </span>
          <span>Kéo thanh để dừng soi khớp trên không</span>
        </div>
        <input
          type="range"
          min="0"
          max="1000"
          value={Math.round(progress * 1000)}
          onChange={(e) => onScrubProgress(Number(e.target.value) / 1000)}
          style={{
            width: "100%",
            margin: 0,
            accentColor: "#a855f7",
            cursor: "pointer",
          }}
        />
      </div>

      {/* Cụm Nút Phát / Tốc Độ Slow-Mo / Loop */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "5px",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <button
          type="button"
          onClick={onTogglePlay}
          style={{
            width: "auto",
            margin: 0,
            padding: "4px 10px",
            borderRadius: "8px",
            fontSize: "11px",
            fontWeight: 800,
            background: isPlaying ? "rgba(245, 158, 11, 0.25)" : "rgba(34, 197, 94, 0.3)",
            color: isPlaying ? "#fde68a" : "#86efac",
            border: "1px solid rgba(255,255,255,0.2)",
            cursor: "pointer",
          }}
        >
          {isPlaying ? "⏸ Dừng Soi Khớp" : "▶ Tiếp Tục"}
        </button>

        <button
          type="button"
          onClick={onReplayFromStart}
          style={{
            width: "auto",
            margin: 0,
            padding: "4px 9px",
            borderRadius: "8px",
            fontSize: "11px",
            fontWeight: 700,
            background: "rgba(59, 130, 246, 0.24)",
            color: "#93c5fd",
            border: "1px solid rgba(59, 130, 246, 0.38)",
            cursor: "pointer",
          }}
        >
          ↺ Diễn Lại
        </button>

        <button
          type="button"
          onClick={onToggleLoop}
          style={{
            width: "auto",
            margin: 0,
            padding: "4px 9px",
            borderRadius: "8px",
            fontSize: "11px",
            fontWeight: 700,
            background: loopEnabled ? "rgba(16, 185, 129, 0.26)" : "rgba(30, 41, 59, 0.65)",
            color: loopEnabled ? "#6ee7b7" : "#94a3b8",
            border: "1px solid rgba(255,255,255,0.16)",
            cursor: "pointer",
          }}
        >
          {loopEnabled ? "🔁 Lặp: BẬT" : "🔁 Lặp: TẮT"}
        </button>

        {[
          { val: 0.25, label: "0.25x Soi" },
          { val: 0.5, label: "0.5x Chậm" },
          { val: 1, label: "1.0x Chuẩn" },
        ].map((sp) => (
          <button
            key={sp.val}
            type="button"
            onClick={() => onChangeSpeed(sp.val)}
            style={{
              width: "auto",
              margin: 0,
              padding: "4px 8px",
              borderRadius: "8px",
              fontSize: "10.5px",
              fontWeight: 700,
              background:
                Math.abs(speedScale - sp.val) < 0.01
                  ? "rgba(168, 85, 247, 0.42)"
                  : "rgba(30, 41, 59, 0.65)",
              color: Math.abs(speedScale - sp.val) < 0.01 ? "#f3e8ff" : "#94a3b8",
              border: "1px solid rgba(255,255,255,0.15)",
              cursor: "pointer",
            }}
          >
            {sp.label}
          </button>
        ))}
      </div>

      {/* Cụm Đổi Góc Máy & Bật Đường Quỹ Đạo 3D */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "5px",
          marginBottom: showRigGuide ? "8px" : "0",
        }}
      >
        {[
          { id: "director", label: "🎥 Đạo Diễn" },
          { id: "high", label: "🦅 Trên Cao" },
          { id: "closeup", label: "👤 Cận Vai" },
          { id: "free", label: "🌀 Tự Xoay 360°" },
        ].map((cam) => (
          <button
            key={cam.id}
            type="button"
            onClick={() => onChangeCameraPreset(cam.id)}
            style={{
              width: "auto",
              margin: 0,
              padding: "4px 8px",
              borderRadius: "7px",
              fontSize: "10.5px",
              fontWeight: 700,
              background:
                cameraPreset === cam.id ? "rgba(245, 158, 11, 0.88)" : "rgba(30, 41, 59, 0.68)",
              color: cameraPreset === cam.id ? "#0f172a" : "#cbd5e1",
              border: "1px solid rgba(255,255,255,0.16)",
              cursor: "pointer",
            }}
          >
            {cam.label}
          </button>
        ))}

        <button
          type="button"
          onClick={onToggleDebugArcs}
          style={{
            width: "auto",
            margin: 0,
            padding: "4px 8px",
            borderRadius: "7px",
            fontSize: "10.5px",
            fontWeight: 700,
            background: showDebugArcs ? "rgba(14, 165, 233, 0.34)" : "rgba(30, 41, 59, 0.68)",
            color: showDebugArcs ? "#7dd3fc" : "#94a3b8",
            border: "1px solid rgba(56, 189, 248, 0.35)",
            cursor: "pointer",
          }}
        >
          📐 Quỹ Đạo Bezier: {showDebugArcs ? "BẬT" : "ẨN"}
        </button>

        <button
          type="button"
          onClick={onToggleRigGuide}
          style={{
            width: "auto",
            margin: 0,
            padding: "4px 8px",
            borderRadius: "7px",
            fontSize: "10.5px",
            fontWeight: 700,
            background: showRigGuide ? "rgba(168, 85, 247, 0.3)" : "rgba(30, 41, 59, 0.68)",
            color: showRigGuide ? "#e9d5ff" : "#94a3b8",
            border: "1px solid rgba(168, 85, 247, 0.35)",
            cursor: "pointer",
          }}
        >
          🦴 Gợi Ý Tripo
        </button>
      </div>

      {/* Hộp Gợi Ý Tạo Model Tripo AI 1:1 Cho Đúng Vai Đang Xem */}
      {showRigGuide && rigGuide && (
        <div
          style={{
            background: "rgba(30, 27, 75, 0.65)",
            border: "1px solid rgba(167, 139, 250, 0.38)",
            borderRadius: "10px",
            padding: "7px 9px",
            fontSize: "10.8px",
            lineHeight: 1.42,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
            <strong style={{ color: "#ddd6fe" }}>{rigGuide.title}</strong>
            <code style={{ color: "#fbbf24", fontSize: "10px" }}>{rigGuide.slotFile}</code>
          </div>
          <div style={{ color: "#e2e8f0", marginBottom: "3px" }}>
            • <b>Lưu ý biên độ khớp:</b> {rigGuide.rigNotes}
          </div>
          <div style={{ color: "#a5b4fc" }}>
            • <b>Socket Đạo cụ tay:</b> {rigGuide.socketNote}
          </div>
        </div>
      )}
    </div>
  );
}
