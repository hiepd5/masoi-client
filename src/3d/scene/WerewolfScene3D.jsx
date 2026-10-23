import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Grid } from "@react-three/drei";
import * as THREE from "three";
import CameraController3D from "../camera/CameraController3D.jsx";
import GreyboxActor from "../actors/GreyboxActor.jsx";
import VillageEnvironment3D from "../environment/VillageEnvironment3D.jsx";
import { computeCircleRadius, getSeatTransform } from "../utils/seatLayout.js";
import {
  PROP_KEYS,
  PROP_MANIFEST,
  loadPropCalibration,
  resetPropCalibration,
  savePropCalibration,
} from "../config/propManifest.js";
import {
  preloadVillagePropsInIdle,
  subscribePropStatuses,
} from "../props/SmartPropGLB.jsx";
import {
  EXTERIOR_ASSET_CATALOG,
  LAYOUT_SCHEMA_VERSION,
  NO_BUILD_SEAT_RADIUS,
  buildDefaultVillageNodes,
  clearVillageDraftLocal,
  isDevArchitectAllowed,
  isNodeViolatingSeatZone,
  loadInitialVillageLayout,
  normalizeLayoutNode,
  pushNodeOutsideSeatZone,
  round3,
  saveVillageDraftLocal,
  saveVillageLayoutToProjectFile,
} from "../editor/defaultVillageLayout.js";

// Tách rời 100% mã nguồn D5 Architect Studio khỏi Bundle của người chơi trên Web Production!
const ArchitectGizmo3D = lazy(() =>
  import("../editor/ArchitectSceneEditor.jsx").then((m) => ({ default: m.ArchitectGizmo3D }))
);
const ArchitectOverlayHUD = lazy(() =>
  import("../editor/ArchitectSceneEditor.jsx").then((m) => ({ default: m.ArchitectOverlayHUD }))
);

const MAX_UNDO_STEPS = 30;

function detectLowPowerDevice() {
  if (typeof window === "undefined") return false;
  try {
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
    const ua = (navigator.userAgent || "").toLowerCase();
    const mobileUa = /android|iphone|ipad|ipod|mobile/.test(ua);
    const lowCores = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4;
    return Boolean(coarse || mobileUa || lowCores);
  } catch {
    return false;
  }
}

/**
 * Bộ gác FPS tự động trong WebGL: Nếu máy yếu/điện thoại rớt dưới 40 FPS sẽ tự giảm nhẹ DPR xuống 0.85 để giữ mượt 60 FPS!
 */
function AdaptivePerformanceGuard({ architectMode, isLowPowerDevice, onAdjustDpr }) {
  const accRef = useRef({ frames: 0, time: 0 });
  useFrame((_, delta) => {
    if (architectMode) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (delta > 0.25) return; // bỏ qua nhịp chuyển tab

    accRef.current.frames += 1;
    accRef.current.time += delta;

    if (accRef.current.time >= 1.8) {
      const fps = accRef.current.frames / accRef.current.time;
      accRef.current.frames = 0;
      accRef.current.time = 0;

      if (fps < 39) {
        onAdjustDpr(0.85);
      } else if (fps >= 56 && !isLowPowerDevice) {
        onAdjustDpr(Math.min(1.4, window.devicePixelRatio || 1.25));
      }
    }
  });
  return null;
}

/**
 * Sân Khấu Ngôi Làng Ma Sói 3D:
 * - Người chơi thật (Production): Giữ nguyên 100% Camera Gameplay ('shoulder' / 'overview'), tải bố cục từ village_layout.json và cắt góc nhìn 8-Sector Frustum Culling siêu mượt.
 * - Dev Setup (localhost / ?architect=1): Trang bị '🏗️ D5 Architect Studio' với Gizmo 3 mũi tên (Move), Vòng xoay (Rotate) & Nút kéo Scale riêng 3 chiều X·Y·Z, khóa cứng ghế người chơi!
 */
export default function WerewolfScene3D({
  players = [],
  me,
  phase,
  isNight,
  myRole,
  hasWinner = false,
  selectedPlayerId,
  selectedActionMeta = null,
  onSelectPlayer,
  wolfVictimId,
  wolfPicksVisible,
  wolfChatLog = {},
  seerLastResult,
  nominationVotes = {},
  finalVotes = {},
  defendantId = null,
  wolfTeammates = [],
  speakingIds = [],
  reactions = [],
  standaloneArchitect = false,
  onExitStandalone = null,
  externalOpenArchitectCounter = 0,
}) {
  const isDevSetup = useMemo(() => isDevArchitectAllowed(), []);
  const isLowPowerDevice = useMemo(() => detectLowPowerDevice(), []);
  const [adaptiveDpr, setAdaptiveDpr] = useState(() => {
    if (typeof window === "undefined") return 1;
    const raw = window.devicePixelRatio || 1;
    return detectLowPowerDevice() ? Math.min(1.1, raw) : Math.min(1.4, raw);
  });

  const handleAdjustDpr = useCallback((nextVal) => {
    setAdaptiveDpr((prev) => (Math.abs(prev - nextVal) < 0.06 ? prev : nextVal));
  }, []);

  const [cameraMode, setCameraMode] = useState("shoulder"); // 'shoulder' | 'overview'
  const [resetCounter, setResetCounter] = useState(0);
  const [showMeasureGrid, setShowMeasureGrid] = useState(false);
  const [showPropTuner, setShowPropTuner] = useState(false);
  const [frustumCullingEnabled, setFrustumCullingEnabled] = useState(true);
  const [visibleSectors, setVisibleSectors] = useState(4);
  const [reloadToken, setReloadToken] = useState(0);
  const [propCalib, setPropCalib] = useState(() => loadPropCalibration());
  const [propStatuses, setPropStatuses] = useState({});
  const [propDiagnostics, setPropDiagnostics] = useState({});

  // ================== TRẠNG THÁI D5 ARCHITECT SCENE EDITOR (CHỈ DEV MỚI KÍCH HOẠT ĐƯỢC) ==================
  const [architectMode, setArchitectMode] = useState(() => Boolean(standaloneArchitect && isDevSetup));
  const [studioMood, setStudioMood] = useState(() => (standaloneArchitect ? "day" : "auto")); // 'auto' | 'day' | 'dawn' | 'dusk_trial' | 'night'
  const [studioSeatCount, setStudioSeatCount] = useState(8); // 6 | 8 | 12 (ghế tham chiếu khóa cứng trong Studio)
  const [layoutNodes, setLayoutNodes] = useState(() => buildDefaultVillageNodes());
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [gizmoMode, setGizmoMode] = useState("translate"); // 'translate' | 'rotate' | 'scale'
  const [gizmoSpace, setGizmoSpace] = useState("world"); // 'world' | 'local'
  const [uniformScaleLock, setUniformScaleLock] = useState(false);
  const [shiftSnap, setShiftSnap] = useState(false);
  const [isGizmoDragging, setIsGizmoDragging] = useState(false);
  const [liveTransformSample, setLiveTransformSample] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);
  const [savingToServer, setSavingToServer] = useState(false);
  const [statusBanner, setStatusBanner] = useState("");
  const [focusRequest, setFocusRequest] = useState({ counter: 0, position: null });

  const nodeGroupRefs = useRef({});
  const cameraStateRef = useRef({ position: [0, 10, 18], target: [0, 1, 0] });
  const preDragSnapshotRef = useRef(null);
  const lastGizmoDragEndMsRef = useRef(0);

  const flashEditorBanner = useCallback((msg) => {
    setStatusBanner(msg);
    setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? "" : prev));
    }, 3200);
  }, []);

  // Tải bố cục từ client/public/config/village_layout.json (hoặc bản nháp chưa lưu nếu đang ở Dev)
  useEffect(() => {
    let mounted = true;
    loadInitialVillageLayout().then((res) => {
      if (!mounted || !res?.nodes?.length) return;
      setLayoutNodes(res.nodes);
      setHasUnsavedDraft(Boolean(res.hasUnsavedDraft));
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    preloadVillagePropsInIdle({ includeOuterTiers: true });
    return subscribePropStatuses((snapshot) => {
      setPropStatuses(snapshot?.statuses || {});
      setPropDiagnostics(snapshot?.diagnostics || {});
    });
  }, []);

  // Mở nhanh D5 Studio khi bấm nút cam trên thanh HUD trong ván đấu
  useEffect(() => {
    if (externalOpenArchitectCounter > 0 && isDevSetup) {
      setArchitectMode(true);
    }
  }, [externalOpenArchitectCounter, isDevSetup]);

  const registerNodeRef = useCallback((nodeId, groupEl) => {
    if (groupEl) {
      nodeGroupRefs.current[nodeId] = groupEl;
    } else {
      delete nodeGroupRefs.current[nodeId];
    }
  }, []);

  const selectedNode = useMemo(
    () => layoutNodes.find((n) => n.id === selectedNodeId) || null,
    [layoutNodes, selectedNodeId]
  );

  // Hàm ghi lịch sử Undo + lưu nháp tức thì vào localStorage
  const applyLayoutMutation = useCallback((updater, snapshotOverride = null) => {
    setLayoutNodes((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const baseSnap = snapshotOverride || prev;
      setUndoStack((u) => [...u.slice(-(MAX_UNDO_STEPS - 1)), baseSnap]);
      setRedoStack([]);
      setHasUnsavedDraft(true);
      saveVillageDraftLocal(next);
      return next;
    });
  }, []);

  const handleBeginGizmoTransform = useCallback(() => {
    preDragSnapshotRef.current = layoutNodes;
  }, [layoutNodes]);

  const handleCommitGizmoTransform = useCallback(
    (nodeId, patch) => {
      setLiveTransformSample(null);
      const snap = preDragSnapshotRef.current || layoutNodes;
      preDragSnapshotRef.current = null;
      applyLayoutMutation(
        (prev) => prev.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
        snap
      );
    },
    [applyLayoutMutation, layoutNodes]
  );

  const handleUpdateNodeFields = useCallback(
    (nodeId, patch) => {
      setLiveTransformSample(null);
      applyLayoutMutation((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, ...patch } : n))
      );
    },
    [applyLayoutMutation]
  );

  const handleDropSelectedToGround = useCallback(() => {
    if (!selectedNode) return;
    handleUpdateNodeFields(selectedNode.id, {
      position: [selectedNode.position[0], 0, selectedNode.position[2]],
      rotation: [0, selectedNode.rotation[1], 0],
    });
    flashEditorBanner(`⚓ Đã hạ "${selectedNode.label}" chạm sát mặt sân y = 0!`);
  }, [selectedNode, handleUpdateNodeFields, flashEditorBanner]);

  const handlePushSingleOutsideSeatZone = useCallback(
    (nodeId) => {
      applyLayoutMutation((prev) =>
        prev.map((n) => (n.id === nodeId ? pushNodeOutsideSeatZone(n) : n))
      );
      flashEditorBanner("🛡️ Đã đẩy vật thể ra ngoài Vòng Ghế An Toàn (R >= 6.65m)!");
    },
    [applyLayoutMutation, flashEditorBanner]
  );

  const handlePushAllViolationsOutside = useCallback(() => {
    applyLayoutMutation((prev) =>
      prev.map((n) => (isNodeViolatingSeatZone(n) ? pushNodeOutsideSeatZone(n) : n))
    );
    flashEditorBanner("🛡️ Đã đẩy toàn bộ vật thể vi phạm ra ngoài Vòng Ghế Người Chơi!");
  }, [applyLayoutMutation, flashEditorBanner]);

  const handleFocusSelected = useCallback(() => {
    if (!selectedNode) return;
    const meta = EXTERIOR_ASSET_CATALOG[selectedNode.type];
    const centerY =
      (selectedNode.position[1] || 0) +
      (meta?.centerHeight || 1.5) * (selectedNode.scale?.[1] || 1) * 0.65;
    setFocusRequest((f) => ({
      counter: f.counter + 1,
      position: [selectedNode.position[0], centerY, selectedNode.position[2]],
    }));
  }, [selectedNode]);

  const handleDuplicateSelected = useCallback(() => {
    if (!selectedNode) return;
    const meta = EXTERIOR_ASSET_CATALOG[selectedNode.type];
    const newId = `${selectedNode.type}-${Date.now().toString(36).slice(-5)}`;
    const countSame = layoutNodes.filter((n) => n.type === selectedNode.type).length + 1;
    let cloneNode = normalizeLayoutNode({
      ...selectedNode,
      id: newId,
      label: `${meta?.shortLabel || selectedNode.label} #${countSame}`,
      position: [
        round3(selectedNode.position[0] + 1.35),
        round3(selectedNode.position[1]),
        round3(selectedNode.position[2] + 0.85),
      ],
      allowCenterZone: false,
      deletable: true,
    });
    if (isNodeViolatingSeatZone(cloneNode)) {
      cloneNode = pushNodeOutsideSeatZone(cloneNode);
    }
    applyLayoutMutation((prev) => [...prev, cloneNode]);
    setSelectedNodeId(cloneNode.id);
    flashEditorBanner(`📋 Đã nhân bản "${cloneNode.label}" — Kéo mũi tên để đặt vị trí!`);
  }, [selectedNode, layoutNodes, applyLayoutMutation, flashEditorBanner]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedNode || !selectedNode.deletable) return;
    const removedLabel = selectedNode.label;
    applyLayoutMutation((prev) => prev.filter((n) => n.id !== selectedNode.id));
    setSelectedNodeId(null);
    flashEditorBanner(`🗑️ Đã xóa "${removedLabel}" (Bấm Ctrl+Z nếu muốn khôi phục)`);
  }, [selectedNode, applyLayoutMutation, flashEditorBanner]);

  const handleSpawnAssetType = useCallback(
    (type) => {
      const meta = EXTERIOR_ASSET_CATALOG[type];
      if (!meta) return;

      // Đặt vật thể mới ngay vùng tâm nhìn hiện tại của Camera (nếu rơi vào Vòng Ghế thì tự đẩy ra biên an toàn!)
      const camTarget = cameraStateRef.current?.target || [0, 0, -10];
      let sx = round3(camTarget[0]);
      let sz = round3(camTarget[2]);
      if (Math.hypot(sx, sz) < NO_BUILD_SEAT_RADIUS + 0.6) {
        const angle = Math.atan2(sx || 0.2, sz || -1);
        const r = Math.max(NO_BUILD_SEAT_RADIUS + 1.5, meta.defaultSpawnRadius || 12);
        sx = round3(Math.sin(angle) * r);
        sz = round3(Math.cos(angle) * r);
      }

      const countSame = layoutNodes.filter((n) => n.type === type).length + 1;
      const newNode = normalizeLayoutNode({
        id: `${type}-${Date.now().toString(36).slice(-5)}`,
        type,
        label: `${meta.shortLabel} #${countSame}`,
        position: [sx, 0, sz],
        rotation: [0, round3(Math.atan2(-sx, -sz)), 0],
        scale: [1, 1, 1],
        seed: countSame * 1.17,
      });

      applyLayoutMutation((prev) => [...prev, newNode]);
      setSelectedNodeId(newNode.id);
      setGizmoMode("translate");
      flashEditorBanner(`➕ Đã đặt "${newNode.label}" ra sân!`);
    },
    [layoutNodes, applyLayoutMutation, flashEditorBanner]
  );

  const handleUndo = useCallback(() => {
    setUndoStack((u) => {
      if (u.length === 0) return u;
      const previous = u[u.length - 1];
      setLayoutNodes((curr) => {
        setRedoStack((r) => [...r, curr]);
        saveVillageDraftLocal(previous);
        return previous;
      });
      setHasUnsavedDraft(true);
      return u.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const restored = r[r.length - 1];
      setLayoutNodes((curr) => {
        setUndoStack((u) => [...u, curr]);
        saveVillageDraftLocal(restored);
        return restored;
      });
      setHasUnsavedDraft(true);
      return r.slice(0, -1);
    });
  }, []);

  const handleSaveLayoutToProject = useCallback(async () => {
    try {
      setSavingToServer(true);
      await saveVillageLayoutToProjectFile(layoutNodes);
      setHasUnsavedDraft(false);
      flashEditorBanner("✅ Đã lưu cố định bố cục vào client/public/config/village_layout.json!");
    } catch (err) {
      flashEditorBanner(`⚠️ Chưa ghi được lên Server (${err.message}) — Đã giữ an toàn trên trình duyệt!`);
    } finally {
      setSavingToServer(false);
    }
  }, [layoutNodes, flashEditorBanner]);

  const handleExportLayoutJson = useCallback(() => {
    const doc = {
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      updatedAtMs: Date.now(),
      updatedAtIso: new Date().toISOString(),
      nodes: layoutNodes,
    };
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "village_layout.json";
    a.click();
    URL.revokeObjectURL(url);
    flashEditorBanner("📤 Đã xuất file village_layout.json về máy!");
  }, [layoutNodes, flashEditorBanner]);

  const handleImportLayoutJson = useCallback(
    async (file) => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed?.nodes) || parsed.nodes.length === 0) {
          throw new Error("File JSON không đúng cấu trúc nodes[]");
        }
        const cleaned = parsed.nodes.map((n, i) => normalizeLayoutNode(n, i)).filter(Boolean);
        applyLayoutMutation(cleaned);
        setSelectedNodeId(null);
        flashEditorBanner(`📥 Đã nạp ${cleaned.length} vật thể từ ${file.name}!`);
      } catch (err) {
        flashEditorBanner(`⚠️ Lỗi đọc JSON: ${err.message}`);
      }
    },
    [applyLayoutMutation, flashEditorBanner]
  );

  const handleResetDefaultLayout = useCallback(() => {
    if (!window.confirm("Khôi phục toàn bộ cảnh quan về bố cục mặc định ban đầu?")) return;
    const defaults = buildDefaultVillageNodes();
    applyLayoutMutation(defaults);
    clearVillageDraftLocal();
    setSelectedNodeId(null);
    flashEditorBanner("↺ Đã khôi phục về bố cục mặc định (Bấm '💾 Lưu Cố Định' nếu muốn ghi đè file)!");
  }, [applyLayoutMutation, flashEditorBanner]);

  // ================== CĂN CHỈNH MẪU GỐC .GLB (PROP TUNER) ==================
  const updateSinglePropCalib = (propKey, patch) => {
    setPropCalib((prev) => {
      const current = prev[propKey] || { yawDeg: 0, scale: 1, yOffset: 0, zOffset: 0, showAuxRope: false };
      const next = {
        ...prev,
        [propKey]: {
          yawDeg: ((Number(current.yawDeg ?? 0) + Number(patch.addYaw ?? 0)) % 360 + 360) % 360,
          scale: Math.max(
            0.35,
            Math.min(2.5, Number(((current.scale ?? 1) + Number(patch.addScale ?? 0)).toFixed(2)))
          ),
          yOffset: Math.max(
            -1.2,
            Math.min(1.2, Number(((current.yOffset ?? 0) + Number(patch.addY ?? 0)).toFixed(2)))
          ),
          zOffset: Math.max(
            -0.8,
            Math.min(0.8, Number(((current.zOffset ?? 0) + Number(patch.addZ ?? 0)).toFixed(2)))
          ),
          showAuxRope:
            patch.toggleAuxRope !== undefined ? !current.showAuxRope : Boolean(current.showAuxRope),
        },
      };
      savePropCalibration(next);
      return next;
    });
  };

  const handleResetAllCalib = () => {
    resetPropCalibration();
    setPropCalib({});
  };

  // ================== VÒNG GHẾ NGƯỜI CHƠI (BẤT KHẢ XÂM PHẠM TRONG LÚC EDIT) ==================
  const effectivePlayers = useMemo(() => {
    if (players && players.length > 0) return players;
    const count = studioSeatCount || 8;
    return Array.from({ length: count }, (_, idx) => ({
      id: `studio-dummy-${idx + 1}`,
      name: `Ghế #${idx + 1}`,
      seatIndex: idx,
      alive: true,
      ready: true,
      avatar: `/avatars/custom/avatar_${String((idx % 10) + 1).padStart(2, "0")}.png`,
    }));
  }, [players, studioSeatCount]);

  const orderedPlayers = useMemo(() => {
    return [...effectivePlayers].sort((a, b) => (a.seatIndex ?? 0) - (b.seatIndex ?? 0));
  }, [effectivePlayers]);

  const numPlayers = orderedPlayers.length || 6;
  const circleRadius = useMemo(() => computeCircleRadius(numPlayers), [numPlayers]);

  // Chế độ xem thử ánh sáng 4 buổi trong D5 Studio (không ảnh hưởng tới logic ván đấu thật)
  const effectiveEnvironmentMood = useMemo(() => {
    if (architectMode && studioMood && studioMood !== "auto") {
      if (studioMood === "day") return { isNight: false, phase: "day_discuss", hasWinner: false };
      if (studioMood === "dawn") return { isNight: false, phase: "day_reveal", hasWinner: false };
      if (studioMood === "dusk_trial") return { isNight: false, phase: "day_final_vote", hasWinner: false };
      if (studioMood === "night") return { isNight: true, phase: "night_wolf", hasWinner: false };
    }
    return {
      isNight: Boolean(isNight),
      phase: phase || "day_discuss",
      hasWinner: Boolean(hasWinner),
    };
  }, [architectMode, studioMood, isNight, phase, hasWinner]);

  const seatMap = useMemo(() => {
    const map = {};
    orderedPlayers.forEach((p, idx) => {
      map[p.id] = getSeatTransform(idx, numPlayers, circleRadius);
    });
    return map;
  }, [orderedPlayers, numPlayers, circleRadius]);

  const mySeatTransform = (me && seatMap[me.id]) || getSeatTransform(0, numPlayers, circleRadius);

  const lookTargetWorld = useMemo(() => {
    if (defendantId && seatMap[defendantId]) return seatMap[defendantId];
    const activeSpeakerId = speakingIds?.[0];
    if (activeSpeakerId && seatMap[activeSpeakerId]) return seatMap[activeSpeakerId];
    return null;
  }, [defendantId, speakingIds, seatMap]);

  const loadedGlbCount = PROP_KEYS.filter((k) => propStatuses[k] === "loaded").length;

  return (
    <div
      className="werewolf-stage-3d"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 1,
        overflow: "hidden",
      }}
    >
      {/* ==================== THANH ĐIỀU KHIỂN GÓC TRÁI (CHỈ HIỆN NÚT DEV KHI isDevSetup = true!) ==================== */}
      {!architectMode && (
        <div
          style={{
            position: "absolute",
            top: "10px",
            left: "10px",
            zIndex: 12,
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            alignItems: "center",
            pointerEvents: "auto",
          }}
        >
          {/* 2 Nút Camera Dành Cho Mọi Người Chơi Thật */}
          <button
            type="button"
            onClick={() => setCameraMode((m) => (m === "shoulder" ? "overview" : "shoulder"))}
            style={{
              width: "auto",
              margin: 0,
              padding: "5px 11px",
              borderRadius: "999px",
              fontSize: "11.5px",
              fontWeight: 700,
              background: cameraMode === "overview" ? "rgba(245, 158, 11, 0.9)" : "rgba(15, 23, 42, 0.78)",
              color: cameraMode === "overview" ? "#0f172a" : "#e2e8f0",
              border: "1px solid rgba(255,255,255,0.22)",
              backdropFilter: "blur(8px)",
              cursor: "pointer",
            }}
            title="Chuyển giữa Góc nhập vai qua vai và Góc cao toàn vòng tròn"
          >
            {cameraMode === "shoulder" ? "🦅 Góc Cao Toàn Vòng" : "🎥 Góc Qua Vai 360°"}
          </button>

          <button
            type="button"
            onClick={() => {
              setCameraMode("shoulder");
              setResetCounter((c) => c + 1);
            }}
            style={{
              width: "auto",
              margin: 0,
              padding: "5px 10px",
              borderRadius: "999px",
              fontSize: "11.5px",
              fontWeight: 600,
              background: "rgba(15, 23, 42, 0.72)",
              color: "#cbd5e1",
              border: "1px solid rgba(255,255,255,0.16)",
              backdropFilter: "blur(8px)",
              cursor: "pointer",
            }}
            title="Đưa Camera về lại ngay sau vai nhân vật của bạn"
          >
            🎯 Về Ghế Tôi
          </button>

          {/* NHÓM CÔNG CỤ ĐẶC QUYỀN KIẾN TRÚC SƯ / DEV SETUP (Ẩn 100% ở bản Người Chơi Thật!) */}
          {isDevSetup && (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowPropTuner(false);
                  setArchitectMode(true);
                }}
                style={{
                  width: "auto",
                  margin: 0,
                  padding: "5px 12px",
                  borderRadius: "999px",
                  fontSize: "11.5px",
                  fontWeight: 800,
                  background: "linear-gradient(135deg, #d97706, #b45309)",
                  color: "#ffffff",
                  border: "1px solid rgba(253, 224, 71, 0.55)",
                  boxShadow: "0 2px 10px rgba(217, 119, 6, 0.45)",
                  cursor: "pointer",
                }}
                title="Mở Không Gian Sắp Xếp Cảnh Quan Kiểu D5 Render (3 Mũi Tên X·Y·Z + Scale Đa Chiều + Bay WASD — Chỉ Dev mới thấy!)"
              >
                🏗️ Dựng Cảnh D5 {hasUnsavedDraft ? "*" : ""}
              </button>

              <button
                type="button"
                onClick={() => setShowMeasureGrid((g) => !g)}
                style={{
                  width: "auto",
                  margin: 0,
                  padding: "5px 9px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: 600,
                  background: showMeasureGrid ? "rgba(16, 185, 129, 0.28)" : "rgba(15, 23, 42, 0.68)",
                  color: showMeasureGrid ? "#a7f3d0" : "#94a3b8",
                  border: "1px solid rgba(255,255,255,0.15)",
                  backdropFilter: "blur(8px)",
                  cursor: "pointer",
                }}
                title="Bật/tắt lưới thước đo mét chuẩn (1 ô = 1m)"
              >
                📏 Lưới Đo
              </button>

              <button
                type="button"
                onClick={() => setFrustumCullingEnabled((v) => !v)}
                style={{
                  width: "auto",
                  margin: 0,
                  padding: "5px 10px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: 700,
                  background: frustumCullingEnabled ? "rgba(16, 185, 129, 0.24)" : "rgba(15, 23, 42, 0.72)",
                  color: frustumCullingEnabled ? "#6ee7b7" : "#94a3b8",
                  border: `1px solid ${frustumCullingEnabled ? "rgba(16, 185, 129, 0.42)" : "rgba(255,255,255,0.16)"}`,
                  backdropFilter: "blur(8px)",
                  cursor: "pointer",
                }}
                title="Kiểm tra Engine Render theo góc xoay Camera (Xoay đâu hiện đến đó)"
              >
                {frustumCullingEnabled ? `👁️ View: ${visibleSectors}/8 khu` : "👁️ View: 8/8 khu"}
              </button>

              <button
                type="button"
                onClick={() => setShowPropTuner((v) => !v)}
                style={{
                  width: "auto",
                  margin: 0,
                  padding: "5px 10px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: 700,
                  background: showPropTuner ? "rgba(59, 130, 246, 0.85)" : "rgba(15, 23, 42, 0.74)",
                  color: showPropTuner ? "#ffffff" : "#cbd5e1",
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  backdropFilter: "blur(8px)",
                  cursor: "pointer",
                }}
                title="Quản lý 12 khe cắm nóng file .GLB từ Tripo Pro (Đợt 1 + Đợt 2)"
              >
                🔧 Đạo Cụ ({loadedGlbCount}/{PROP_KEYS.length} .GLB)
              </button>
            </>
          )}
        </div>
      )}

      {/* ==================== GIAO DIỆN D5 ARCHITECT STUDIO (CHỈ TẢI CHUNK KHI DEV BẬT TRÊN LOCALHOST) ==================== */}
      {isDevSetup && architectMode && (
        <Suspense fallback={null}>
          <ArchitectOverlayHUD
            nodes={layoutNodes}
            selectedNode={selectedNode}
            liveSample={liveTransformSample}
            gizmoMode={gizmoMode}
            setGizmoMode={setGizmoMode}
            gizmoSpace={gizmoSpace}
            setGizmoSpace={setGizmoSpace}
            uniformScaleLock={uniformScaleLock}
            setUniformScaleLock={setUniformScaleLock}
            shiftSnap={shiftSnap}
            setShiftSnap={setShiftSnap}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            hasUnsavedDraft={hasUnsavedDraft}
            savingToServer={savingToServer}
            statusBanner={statusBanner}
            standaloneArchitect={standaloneArchitect}
            studioMood={studioMood}
            onChangeStudioMood={setStudioMood}
            studioSeatCount={studioSeatCount}
            onChangeStudioSeatCount={setStudioSeatCount}
            loadedGlbCount={loadedGlbCount}
            totalGlbCount={PROP_KEYS.length}
            showPropTuner={showPropTuner}
            onTogglePropTuner={() => setShowPropTuner((v) => !v)}
            onSelectNodeId={setSelectedNodeId}
            onUpdateNodeFields={handleUpdateNodeFields}
            onDropToGround={handleDropSelectedToGround}
            onPushOutsideSeatZone={handlePushSingleOutsideSeatZone}
            onPushAllViolationsOutside={handlePushAllViolationsOutside}
            onFocusSelected={handleFocusSelected}
            onDuplicateSelected={handleDuplicateSelected}
            onDeleteSelected={handleDeleteSelected}
            onSpawnAssetType={handleSpawnAssetType}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onSaveToProject={handleSaveLayoutToProject}
            onExportJson={handleExportLayoutJson}
            onImportJsonFile={handleImportLayoutJson}
            onResetDefaultLayout={handleResetDefaultLayout}
            onExitArchitectMode={() => {
              setIsGizmoDragging(false);
              setShowPropTuner(false);
              if (standaloneArchitect && onExitStandalone) {
                onExitStandalone();
              } else {
                setArchitectMode(false);
              }
            }}
          />
        </Suspense>
      )}

      {/* ==================== HỘP QUẢN LÝ 12 FILE .GLB TRIPO PRO (CHỈ DEV — MỞ ĐƯỢC CẢ TRONG D5 STUDIO!) ==================== */}
      {isDevSetup && showPropTuner && (
        <div
          style={{
            position: "absolute",
            top: architectMode ? "94px" : "46px",
            left: "10px",
            zIndex: 28,
            width: "min(365px, calc(100vw - 24px))",
            maxHeight: architectMode ? "calc(100% - 144px)" : "calc(100% - 108px)",
            overflowY: "auto",
            background: "rgba(9, 14, 28, 0.92)",
            border: "1px solid rgba(148, 163, 184, 0.28)",
            borderRadius: "14px",
            padding: "10px 12px",
            backdropFilter: "blur(14px)",
            boxShadow: "0 14px 34px rgba(0, 0, 0, 0.65)",
            color: "#e2e8f0",
            fontSize: "11.5px",
            pointerEvents: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", gap: "6px" }}>
            <strong style={{ fontSize: "12px", color: "#f8fafc" }}>
              🏰 Kho 12 Đạo Cụ Tripo Pro (.GLB)
            </strong>
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                type="button"
                onClick={() => setReloadToken((t) => t + 1)}
                style={{
                  width: "auto",
                  margin: 0,
                  padding: "3px 8px",
                  borderRadius: "6px",
                  fontSize: "10.5px",
                  fontWeight: 700,
                  background: "rgba(16, 185, 129, 0.22)",
                  color: "#6ee7b7",
                  border: "1px solid rgba(16, 185, 129, 0.45)",
                  cursor: "pointer",
                }}
              >
                🔄 Quét lại .GLB
              </button>
              <button
                type="button"
                onClick={handleResetAllCalib}
                style={{
                  width: "auto",
                  margin: 0,
                  padding: "3px 7px",
                  borderRadius: "6px",
                  fontSize: "10.5px",
                  background: "rgba(255,255,255,0.08)",
                  color: "#cbd5e1",
                  border: "1px solid rgba(255,255,255,0.14)",
                  cursor: "pointer",
                }}
              >
                ↺ Mặc định
              </button>
              <button
                type="button"
                onClick={() => setShowPropTuner(false)}
                style={{
                  width: "auto",
                  margin: 0,
                  padding: "3px 7px",
                  borderRadius: "6px",
                  fontSize: "10.5px",
                  background: "rgba(239, 68, 68, 0.2)",
                  color: "#fca5a5",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          <div style={{ fontSize: "10.5px", color: "#94a3b8", marginBottom: "8px", lineHeight: 1.35 }}>
            Bảng này căn tâm gốc cho từng chủng loại <code>.GLB</code> (gồm cả ghế). Để kéo thả từng căn nhà / gốc cây bằng 3 mũi tên, hãy bấm nút cam <b>🏗️ Dựng Cảnh D5</b>!
          </div>

          {[
            { batchId: 1, title: "📦 Đợt 1 — Trung Tâm & Kiến Trúc (6 món)" },
            { batchId: 2, title: "🌲 Đợt 2 — Sân Đá, Rừng Ngẫu Nhiên & Tiểu Cảnh (6 món)" },
          ].map(({ batchId, title }) => {
            const batchKeys = PROP_KEYS.filter((k) => (PROP_MANIFEST[k]?.batch || 1) === batchId);
            const batchLoaded = batchKeys.filter((k) => propStatuses[k] === "loaded").length;
            return (
              <div key={batchId} style={{ marginBottom: batchId === 1 ? "10px" : "2px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "10.5px",
                    fontWeight: 800,
                    color: batchLoaded === batchKeys.length ? "#86efac" : "#fcd34d",
                    marginBottom: "5px",
                    paddingBottom: "3px",
                    borderBottom: "1px solid rgba(148, 163, 184, 0.18)",
                  }}
                >
                  <span>{title}</span>
                  <span>
                    {batchLoaded}/{batchKeys.length} .GLB
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {batchKeys.map((key) => {
                    const info = PROP_MANIFEST[key];
                    const st = propStatuses[key] || "fallback";
                    const diag = propDiagnostics[key] || null;
                    const c = propCalib[key] || { yawDeg: 0, scale: 1, yOffset: 0, zOffset: 0 };
                    const isLoaded = st === "loaded";

                    return (
                      <div
                        key={key}
                        style={{
                          background: "rgba(30, 41, 59, 0.55)",
                          border: `1px solid ${isLoaded ? "rgba(34, 197, 94, 0.4)" : "rgba(148, 163, 184, 0.16)"}`,
                          borderRadius: "9px",
                          padding: "6px 8px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "4px" }}>
                          <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "11px" }}>
                            {info.label}
                          </span>
                          <span
                            style={{
                              fontSize: "9.5px",
                              padding: "1px 6px",
                              borderRadius: "999px",
                              fontWeight: 700,
                              background: isLoaded ? "rgba(34, 197, 94, 0.22)" : "rgba(148, 163, 184, 0.15)",
                              color: isLoaded ? "#86efac" : "#94a3b8",
                            }}
                          >
                            {isLoaded ? "✅ .GLB Tripo" : "🧱 PBR Dựng sẵn"}
                          </span>
                        </div>

                        <div style={{ fontSize: "9.5px", color: "#94a3b8", marginTop: "2px", marginBottom: "5px" }}>
                          <code>{isLoaded && diag?.sourceName ? diag.sourceName : info.fileName}</code>
                          {isLoaded && diag?.sizeMB ? ` (${diag.sizeMB} MB)` : ""}
                          {info.flushTopSurface
                            ? " • Mặt sân khớp y=0"
                            : ` • Cao ${diag?.resolvedHeight ?? info.targetHeight}m`}
                          {isLoaded && diag?.seatMatched ? ` • Khớp đệm 0.48m (Tự xoay ${diag.autoYawDeg}°)` : ""}
                          {` • Góc +${c.yawDeg || 0}° • x${(c.scale ?? 1).toFixed(2)}`}
                        </div>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          <button
                            type="button"
                            onClick={() => updateSinglePropCalib(key, { addYaw: 90 })}
                            style={{
                              width: "auto",
                              margin: 0,
                              padding: "2px 7px",
                              fontSize: "10px",
                              borderRadius: "5px",
                              background: "rgba(59, 130, 246, 0.22)",
                              color: "#93c5fd",
                              border: "1px solid rgba(59, 130, 246, 0.35)",
                              cursor: "pointer",
                            }}
                          >
                            ↻ +90°
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSinglePropCalib(key, { addYaw: 15 })}
                            style={{
                              width: "auto",
                              margin: 0,
                              padding: "2px 6px",
                              fontSize: "10px",
                              borderRadius: "5px",
                              background: "rgba(59, 130, 246, 0.14)",
                              color: "#bfdbfe",
                              border: "1px solid rgba(59, 130, 246, 0.25)",
                              cursor: "pointer",
                            }}
                          >
                            ↻ +15°
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSinglePropCalib(key, { addScale: -0.06 })}
                            style={{
                              width: "auto",
                              margin: 0,
                              padding: "2px 7px",
                              fontSize: "10px",
                              borderRadius: "5px",
                              background: "rgba(255,255,255,0.08)",
                              color: "#e2e8f0",
                              border: "1px solid rgba(255,255,255,0.14)",
                              cursor: "pointer",
                            }}
                          >
                            Nhỏ -
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSinglePropCalib(key, { addScale: 0.06 })}
                            style={{
                              width: "auto",
                              margin: 0,
                              padding: "2px 7px",
                              fontSize: "10px",
                              borderRadius: "5px",
                              background: "rgba(255,255,255,0.08)",
                              color: "#e2e8f0",
                              border: "1px solid rgba(255,255,255,0.14)",
                              cursor: "pointer",
                            }}
                          >
                            To +
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSinglePropCalib(key, { addY: -0.03 })}
                            style={{
                              width: "auto",
                              margin: 0,
                              padding: "2px 6px",
                              fontSize: "10px",
                              borderRadius: "5px",
                              background: "rgba(255,255,255,0.06)",
                              color: "#cbd5e1",
                              border: "1px solid rgba(255,255,255,0.12)",
                              cursor: "pointer",
                            }}
                          >
                            Y-
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSinglePropCalib(key, { addY: 0.03 })}
                            style={{
                              width: "auto",
                              margin: 0,
                              padding: "2px 6px",
                              fontSize: "10px",
                              borderRadius: "5px",
                              background: "rgba(255,255,255,0.06)",
                              color: "#cbd5e1",
                              border: "1px solid rgba(255,255,255,0.12)",
                              cursor: "pointer",
                            }}
                          >
                            Y+
                          </button>
                          {key === "prop_gallows" && (
                            <button
                              type="button"
                              onClick={() => updateSinglePropCalib(key, { toggleAuxRope: true })}
                              style={{
                                width: "auto",
                                margin: 0,
                                padding: "2px 7px",
                                fontSize: "10px",
                                borderRadius: "5px",
                                background: c.showAuxRope ? "rgba(16, 185, 129, 0.25)" : "rgba(255,255,255,0.06)",
                                color: c.showAuxRope ? "#6ee7b7" : "#94a3b8",
                                border: "1px solid rgba(255,255,255,0.14)",
                                cursor: "pointer",
                              }}
                            >
                              {c.showAuxRope ? "🪢 Dây phụ: BẬT" : "🪢 Dây phụ: ẨN"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Canvas
        shadows
        dpr={architectMode ? [1, 1.5] : adaptiveDpr}
        gl={{
          antialias: !isLowPowerDevice,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.06,
        }}
        camera={{ fov: 50, near: 0.1, far: 175, position: [0, 2.2, circleRadius + 2] }}
      >
        <AdaptivePerformanceGuard
          architectMode={architectMode}
          isLowPowerDevice={isLowPowerDevice}
          onAdjustDpr={handleAdjustDpr}
        />

        {/* Toàn bộ Không Gian Ngôi Làng PBR + Scene Graph D5 + 8-Sector Frustum Culling */}
        <VillageEnvironment3D
          circleRadius={circleRadius}
          orderedPlayers={orderedPlayers}
          seatMap={seatMap}
          phase={effectiveEnvironmentMood.phase}
          isNight={effectiveEnvironmentMood.isNight}
          hasWinner={effectiveEnvironmentMood.hasWinner}
          propCalib={propCalib}
          propStatuses={propStatuses}
          reloadToken={reloadToken}
          layoutNodes={layoutNodes}
          frustumCullingEnabled={frustumCullingEnabled}
          architectMode={architectMode}
          isLowPowerDevice={isLowPowerDevice}
          isGizmoDragging={isGizmoDragging}
          lastGizmoDragEndMsRef={lastGizmoDragEndMsRef}
          registerNodeRef={registerNodeRef}
          onSelectNode={setSelectedNodeId}
          onClearSelection={() => setSelectedNodeId(null)}
          onVisibleSectorsChange={setVisibleSectors}
        />

        {/* Lưới thước đo kiến trúc chuẩn mét (raycast=null để không chặn click tia chuột vào cây/nhà!) */}
        {(showMeasureGrid || architectMode) && (
          <Grid
            raycast={() => null}
            position={[0, 0.012, 0]}
            args={[64, 64]}
            cellSize={1}
            cellThickness={0.5}
            cellColor={architectMode ? "#334155" : isNight ? "#334155" : "#2d5a40"}
            sectionSize={5}
            sectionThickness={1.1}
            sectionColor={architectMode ? "#f59e0b" : isNight ? "#60a5fa" : "#fbbf24"}
            fadeDistance={architectMode ? 58 : 24}
            fadeStrength={1.2}
          />
        )}

        {/* Gizmo Đa Năng Gắn Tâm 3D + Viền Tím Silhouette + Vòng Chỉ Giới Đỏ R=6.2m */}
        {isDevSetup && architectMode && (
          <Suspense fallback={null}>
            <ArchitectGizmo3D
              circleRadius={circleRadius}
              selectedNode={selectedNode}
              nodeGroupRefs={nodeGroupRefs}
              gizmoMode={gizmoMode}
              gizmoSpace={gizmoSpace}
              uniformScaleLock={uniformScaleLock}
              shiftSnap={shiftSnap}
              lastGizmoDragEndMsRef={lastGizmoDragEndMsRef}
              onGizmoDraggingChange={setIsGizmoDragging}
              onBeginTransform={handleBeginGizmoTransform}
              onLiveTransformSample={setLiveTransformSample}
              onCommitTransform={handleCommitGizmoTransform}
            />
          </Suspense>
        )}

        {/* Điều khiển Camera Kép (Gameplay cho Người chơi vs Bay WASD/Orbit cho Dev D5) */}
        <CameraController3D
          cameraMode={cameraMode}
          mySeatTransform={mySeatTransform}
          circleRadius={circleRadius}
          resetCounter={resetCounter}
          architectMode={architectMode}
          isGizmoDragging={isGizmoDragging}
          focusRequest={focusRequest}
          cameraStateRef={cameraStateRef}
        />

        {/* Vòng Ghế Gỗ Sồi & Nhân Vật (Bị khóa cứng tương tác chuột 100% khi bật D5 Mode!) */}
        {orderedPlayers.map((p) => {
          const seatTransform = seatMap[p.id];
          const isMe = p.id === me?.id;
          const isWolfVictim = p.id === wolfVictimId && myRole === "witch";
          const isWolfTeammate = wolfTeammates.includes(p.id);
          const isSpeaking = speakingIds.includes(p.id);

          let wolfPicksOnThis = 0;
          if (wolfPicksVisible) {
            Object.values(wolfPicksVisible).forEach((pick) => {
              if (pick.targetId === p.id) wolfPicksOnThis += 1;
            });
          }

          const voters = [];
          if (phase === "day_nominate" && nominationVotes) {
            Object.entries(nominationVotes).forEach(([voterId, vote]) => {
              if (vote?.targetId === p.id) {
                const vp = players.find((pl) => pl.id === voterId);
                if (vp) voters.push(vp);
              }
            });
          }

          const hasPointTarget = Boolean(nominationVotes?.[p.id]?.targetId);
          const seerRes = seerLastResult?.targetId === p.id ? seerLastResult.result : null;
          const playerReactions = reactions.filter((r) => r.name === p.name);

          return (
            <GreyboxActor
              key={p.id}
              player={p}
              seatTransform={seatTransform}
              cameraMode={cameraMode}
              isMe={isMe}
              isNight={effectiveEnvironmentMood.isNight}
              phase={effectiveEnvironmentMood.phase}
              myRole={myRole}
              hasWinner={effectiveEnvironmentMood.hasWinner}
              isSelected={!architectMode && selectedPlayerId === p.id}
              selectedActionMeta={!architectMode && selectedPlayerId === p.id ? selectedActionMeta : null}
              isDefendant={p.id === defendantId}
              isWolfVictim={isWolfVictim}
              isWolfTeammate={isWolfTeammate}
              wolfPicksOnThis={wolfPicksOnThis}
              seerResult={seerRes}
              nominationVoters={voters}
              hasPointTarget={hasPointTarget}
              myFinalVote={finalVotes?.[p.id] || null}
              isSpeaking={isSpeaking}
              lookTargetWorld={lookTargetWorld?.seatIdx !== seatTransform.seatIdx ? lookTargetWorld : null}
              chatBubbleText={wolfChatLog?.[p.id] || null}
              playerReactions={playerReactions}
              chairCalib={propCalib?.prop_chair}
              reloadToken={reloadToken}
              architectMode={architectMode}
              onSelect={onSelectPlayer}
            />
          );
        })}
      </Canvas>
    </div>
  );
}
