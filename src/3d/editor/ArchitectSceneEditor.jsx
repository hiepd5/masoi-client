import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  EXTERIOR_ASSET_CATALOG,
  EXTERIOR_CATEGORIES,
  NO_BUILD_SEAT_RADIUS,
  SPAWNABLE_ASSET_TYPES,
  clampScale,
  isNodeViolatingSeatZone,
  round3,
} from "./defaultVillageLayout.js";

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;
const NOOP_RAYCAST = () => {};

const GIZMO_COLORS = {
  x: "#ff1f2d",
  y: "#0cf043",
  z: "#125eff",
  center: "#f1f5f9",
  hover: "#fde047",
};

function isTypingInInput(target) {
  if (!target) return false;
  const tag = (target.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Viền Tím Phát Sáng Bao Quanh Vật Thể Đang Chọn (Chuẩn D5 / Tripo Contour Silhouette):
 * - Không bao giờ sửa trực tiếp vật liệu gốc dùng chung của 84 cây thông / 7 ngôi nhà.
 * - Tự động đồng bộ ma trận thế giới mỗi khung hình & tự bắt kịp ngay khi .GLB vừa tải xong.
 */
function SelectedObjectHighlightShell({ targetObj, violating = false }) {
  const shellGroupRef = useRef(null);
  const entriesRef = useRef([]);
  const lastMeshCountRef = useRef(-1);
  const frameCounterRef = useRef(0);

  const { backMat, tintMat } = useMemo(() => {
    const bMat = new THREE.MeshBasicMaterial({
      color: "#c084fc",
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    });
    const tMat = new THREE.MeshBasicMaterial({
      color: "#a855f7",
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0.11,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    return { backMat: bMat, tintMat: tMat };
  }, []);

  useEffect(() => {
    backMat.color.set(violating ? "#ef4444" : "#c084fc");
    tintMat.color.set(violating ? "#ef4444" : "#a855f7");
  }, [violating, backMat, tintMat]);

  useEffect(() => {
    return () => {
      backMat.dispose();
      tintMat.dispose();
    };
  }, [backMat, tintMat]);

  const rebuildProxies = useMemo(
    () => () => {
      const holder = shellGroupRef.current;
      if (!holder) return;
      while (holder.children.length > 0) {
        holder.remove(holder.children[0]);
      }
      entriesRef.current = [];

      if (!targetObj) {
        lastMeshCountRef.current = 0;
        return;
      }

      const sourceMeshes = [];
      targetObj.traverse((child) => {
        if (
          child.isMesh &&
          !child.isInstancedMesh &&
          child.geometry &&
          child.name !== "__d5_hitbox__" &&
          child.name !== "__contact_ao_disc__"
        ) {
          sourceMeshes.push(child);
        }
      });

      lastMeshCountRef.current = sourceMeshes.length;

      sourceMeshes.forEach((srcMesh) => {
        const geom = srcMesh.geometry;
        if (!geom.boundingSphere) {
          geom.computeBoundingSphere();
        }
        const c = geom.boundingSphere ? geom.boundingSphere.center : new THREE.Vector3();
        const expandFactor = 1.036;
        const tPlus = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z);
        const mScale = new THREE.Matrix4().makeScale(expandFactor, expandFactor, expandFactor);
        const tMinus = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
        const expandMatrix = new THREE.Matrix4().multiplyMatrices(tPlus, mScale).multiply(tMinus);

        const contourMesh = new THREE.Mesh(geom, backMat);
        contourMesh.matrixAutoUpdate = false;
        contourMesh.frustumCulled = false;
        contourMesh.raycast = NOOP_RAYCAST;
        contourMesh.renderOrder = 990;

        const rimMesh = new THREE.Mesh(geom, tintMat);
        rimMesh.matrixAutoUpdate = false;
        rimMesh.frustumCulled = false;
        rimMesh.raycast = NOOP_RAYCAST;
        rimMesh.renderOrder = 991;

        holder.add(contourMesh);
        holder.add(rimMesh);
        entriesRef.current.push({ srcMesh, contourMesh, rimMesh, expandMatrix });
      });
    },
    [targetObj, backMat, tintMat]
  );

  useEffect(() => {
    rebuildProxies();
  }, [rebuildProxies]);

  useFrame(() => {
    if (!targetObj || !shellGroupRef.current) return;

    frameCounterRef.current += 1;
    if (frameCounterRef.current % 15 === 0) {
      let count = 0;
      targetObj.traverse((child) => {
        if (
          child.isMesh &&
          !child.isInstancedMesh &&
          child.geometry &&
          child.name !== "__d5_hitbox__" &&
          child.name !== "__contact_ao_disc__"
        ) {
          count += 1;
        }
      });
      if (count !== lastMeshCountRef.current) {
        rebuildProxies();
      }
    }

    targetObj.updateWorldMatrix(true, true);
    for (let i = 0; i < entriesRef.current.length; i++) {
      const { srcMesh, contourMesh, rimMesh, expandMatrix } = entriesRef.current[i];
      contourMesh.matrix.multiplyMatrices(srcMesh.matrixWorld, expandMatrix);
      rimMesh.matrix.copy(srcMesh.matrixWorld);
    }
  });

  return <group ref={shellGroupRef} />;
}

/**
 * 1. LỚP 3D TRONG <Canvas>:
 * - Vòng Chỉ Giới Đỏ Đứt Nét bảo vệ khu vực ghế ngồi (R = 6.2m, bao trọn kịch trần 12 ghế người chơi)
 * - Viền Tím Silhouette + Vòng Sáng Chân Đế cho đối tượng đang chọn
 * - Gizmo Đa Năng Gắn Giữa Tâm 3D Vật Thể (D5 / Tripo Universal Center Gizmo):
 *   + Chế độ 1/V: 3 Mũi tên Đỏ/Lục/Lam + 3 Ô vuông trượt mặt phẳng + Khối trắng trượt sàn + 3 Đầu Nón Xoay Nhanh ngay tại tâm!
 *   + Chế độ 2/R: 3 Vòng Gimbal Xoay chính xác X·Y·Z
 *   + Chế độ 3/C: 3 Trục Scale X·Y·Z (mọc từ mặt đất y=0) + Scale mặt phẳng + Khối Trắng Scale Đều XYZ
 */
export function ArchitectGizmo3D({
  circleRadius = 4.2,
  selectedNode,
  nodeGroupRefs,
  gizmoMode = "translate",
  gizmoSpace = "world",
  uniformScaleLock = false,
  shiftSnap = false,
  lastGizmoDragEndMsRef = null,
  onGizmoDraggingChange,
  onBeginTransform,
  onBeginShiftCloneDrag,
  onLiveTransformSample,
  onCommitTransform,
}) {
  const { camera, gl } = useThree();
  const gizmoRootRef = useRef(null);
  const gizmoPickersGroupRef = useRef(null);

  const [hoveredHandle, setHoveredHandle] = useState(null);
  const [activeHandle, setActiveHandle] = useState(null);
  const dragSessionRef = useRef(null);
  const lastLiveEmitRef = useRef(0);

  const targetObj = selectedNode ? nodeGroupRefs.current?.[selectedNode.id] || null : null;
  const meta = selectedNode ? EXTERIOR_ASSET_CATALOG[selectedNode.type] : null;

  // Khi ở chế độ Scale, BẮT BUỘC dùng Local Space để vật thể đã xoay chéo không bao giờ bị kéo méo hình bình hành!
  const effectiveSpace = gizmoMode === "scale" ? "local" : gizmoSpace;

  // Giữ tham chiếu mới nhất cho sự kiện DOM Capture-Phase mà không phải gỡ/gắn lại listener liên tục
  const latestRef = useRef({});
  latestRef.current = {
    selectedNode,
    targetObj,
    nodeGroupRefs,
    meta,
    gizmoMode,
    effectiveSpace,
    uniformScaleLock,
    shiftSnap,
    lastGizmoDragEndMsRef,
    onGizmoDraggingChange,
    onBeginTransform,
    onBeginShiftCloneDrag,
    onLiveTransformSample,
    onCommitTransform,
  };

  // Cập nhật vị trí Gizmo nằm đúng TÂM HÌNH KHỐI 3D + Giữ kích thước không đổi trên màn hình ở mọi cự ly Camera
  useFrame(() => {
    const root = gizmoRootRef.current;
    const obj = latestRef.current.targetObj;
    const nodeMeta = latestRef.current.meta;
    if (!root || !obj) return;

    const centerOffsetY = (nodeMeta?.centerHeight ?? 1.5) * obj.scale.y;
    root.position.set(obj.position.x, obj.position.y + centerOffsetY, obj.position.z);

    if (latestRef.current.effectiveSpace === "local") {
      root.quaternion.copy(obj.quaternion);
    } else {
      root.quaternion.identity();
    }

    const dist = camera.position.distanceTo(root.position);
    const screenScale = THREE.MathUtils.clamp(dist * 0.148, 0.48, 7.5);
    root.scale.setScalar(screenScale);
    root.updateMatrixWorld(true);
  });

  // Reset hover khi bỏ chọn hoặc đổi chế độ Gizmo
  useEffect(() => {
    setHoveredHandle(null);
    if (!dragSessionRef.current) {
      setActiveHandle(null);
    }
  }, [selectedNode?.id, gizmoMode]);

  // Capture-Phase Raycaster ưu tiên tuyệt đối cho Gizmo (xuyên tường nhà / tán thông, khóa OrbitControls ngay tức khắc!)
  useEffect(() => {
    const dom = gl?.domElement;
    if (!dom) return undefined;

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hitPoint = new THREE.Vector3();

    const updateRay = (clientX, clientY) => {
      const rect = dom.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return rect;
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      return rect;
    };

    const pickGizmoHandle = (clientX, clientY) => {
      const pickers = gizmoPickersGroupRef.current;
      const { selectedNode: sel, targetObj: obj } = latestRef.current;
      if (!pickers || !sel || !obj) return null;
      gizmoRootRef.current?.updateMatrixWorld(true);
      updateRay(clientX, clientY);
      const hits = raycaster.intersectObjects(pickers.children, true);
      for (let i = 0; i < hits.length; i++) {
        const hid = hits[i].object?.userData?.handleId;
        if (hid) return hid;
      }
      return null;
    };

    const handleDomPointerMoveHover = (ev) => {
      if (dragSessionRef.current) return;
      if (ev.buttons !== 0) return;
      const hid = pickGizmoHandle(ev.clientX, ev.clientY);
      setHoveredHandle((prev) => (prev === hid ? prev : hid));
      if (hid) {
        document.body.style.cursor = "grab";
      }
    };

    const handleDomPointerDownCapture = (ev) => {
      if (ev.button !== 0) return;
      const hid = pickGizmoHandle(ev.clientX, ev.clientY);
      if (!hid) return;

      const {
        selectedNode: sel,
        targetObj: obj,
        onGizmoDraggingChange: setDragging,
        onBeginTransform: beginTx,
        onBeginShiftCloneDrag: beginShiftClone,
      } = latestRef.current;
      if (!sel || !obj || !gizmoRootRef.current) return;

      // Chặn đứng OrbitControls & R3F click xuyên xuống mái nhà/mặt đất!
      ev.stopImmediatePropagation();
      ev.stopPropagation();
      ev.preventDefault();

      // Chuẩn Kiến trúc sư D5 / 3ds Max: Giữ phím Shift + Kéo trục/mặt phẳng Di chuyển = Nhân bản tại chỗ & kéo bản sao mới trượt dọc trục!
      const isMoveHandle = hid.startsWith("move_") || hid.startsWith("plane_");
      let activeNodeId = sel.id;
      let isShiftClone = false;
      if (ev.shiftKey && isMoveHandle && sel.deletable !== false && typeof beginShiftClone === "function") {
        const cloned = beginShiftClone(sel);
        if (cloned?.id) {
          activeNodeId = cloned.id;
          isShiftClone = true;
        }
      }

      const rect = updateRay(ev.clientX, ev.clientY);
      const startPos = obj.position.clone();
      const startQuat = obj.quaternion.clone();
      const startScale = obj.scale.clone();
      const worldPivot = gizmoRootRef.current.position.clone();
      const gizmoQuat = gizmoRootRef.current.quaternion.clone();
      const gizmoWorldScale = gizmoRootRef.current.scale.x || 1;

      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);

      let axisWorld = new THREE.Vector3(0, 1, 0);
      if (hid.endsWith("_x")) axisWorld.set(1, 0, 0).applyQuaternion(gizmoQuat).normalize();
      else if (hid.endsWith("_y")) axisWorld.set(0, 1, 0).applyQuaternion(gizmoQuat).normalize();
      else if (hid.endsWith("_z")) axisWorld.set(0, 0, 1).applyQuaternion(gizmoQuat).normalize();

      const dragPlane = new THREE.Plane();
      let startAxisParam = 0;
      const startPlaneHit = worldPivot.clone();

      if (hid.startsWith("move_") && hid !== "move_xz_center") {
        const perp = new THREE.Vector3().crossVectors(axisWorld, camDir);
        const planeNormal = new THREE.Vector3().crossVectors(perp, axisWorld);
        if (planeNormal.lengthSq() < 1e-5) planeNormal.copy(camDir).negate();
        planeNormal.normalize();
        dragPlane.setFromNormalAndCoplanarPoint(planeNormal, worldPivot);
        if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
          startAxisParam = hitPoint.clone().sub(worldPivot).dot(axisWorld);
        }
      } else if (hid === "scale_x" || hid === "scale_y" || hid === "scale_z") {
        const perp = new THREE.Vector3().crossVectors(axisWorld, camDir);
        const planeNormal = new THREE.Vector3().crossVectors(perp, axisWorld);
        if (planeNormal.lengthSq() < 1e-5) planeNormal.copy(camDir).negate();
        planeNormal.normalize();
        dragPlane.setFromNormalAndCoplanarPoint(planeNormal, worldPivot);
        if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
          startAxisParam = hitPoint.clone().sub(worldPivot).dot(axisWorld);
        }
      } else if (hid === "move_xz_center" || hid === "plane_xz" || hid === "plane_yz" || hid === "plane_xy") {
        const planeNormal = new THREE.Vector3(0, 1, 0);
        if (hid === "plane_xz") planeNormal.set(0, 1, 0).applyQuaternion(gizmoQuat).normalize();
        else if (hid === "plane_yz") planeNormal.set(1, 0, 0).applyQuaternion(gizmoQuat).normalize();
        else if (hid === "plane_xy") planeNormal.set(0, 0, 1).applyQuaternion(gizmoQuat).normalize();

        if (Math.abs(planeNormal.dot(camDir)) < 0.14) {
          planeNormal.copy(camDir).negate();
        }
        dragPlane.setFromNormalAndCoplanarPoint(planeNormal, worldPivot);
        if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
          startPlaneHit.copy(hitPoint);
        }
      }

      const pProj = worldPivot.clone().project(camera);
      const pivotScreenX = rect.left + ((pProj.x + 1) * 0.5) * rect.width;
      const pivotScreenY = rect.top + ((-pProj.y + 1) * 0.5) * rect.height;
      const prevAngle = Math.atan2(ev.clientY - pivotScreenY, ev.clientX - pivotScreenX);

      dragSessionRef.current = {
        handleId: hid,
        nodeId: activeNodeId,
        isShiftClone,
        pendingClonePos: startPos.clone(),
        startClientX: ev.clientX,
        startClientY: ev.clientY,
        startPos,
        startQuat,
        startScale,
        worldPivot,
        axisWorld,
        gizmoWorldScale,
        dragPlane,
        startAxisParam,
        startPlaneHit,
        pivotScreenX,
        pivotScreenY,
        prevAngle,
        accumAngle: 0,
        camAxisDot: axisWorld.dot(camDir),
      };

      setActiveHandle(hid);
      setHoveredHandle(hid);
      document.body.style.cursor = "grabbing";
      setDragging?.(true);
      if (!isShiftClone) {
        beginTx?.();
      }

      const onWindowMove = (moveEv) => {
        const sess = dragSessionRef.current;
        const cur = latestRef.current;
        if (!sess) return;
        const liveObj =
          cur.nodeGroupRefs?.current?.[sess.nodeId] || (!sess.isShiftClone ? cur.targetObj : null);

        updateRay(moveEv.clientX, moveEv.clientY);
        // Phím Shift nay dành riêng cho Copy-Drag mượt không giật nấc; Snap chỉ kích hoạt khi bật nút 🧲 Snap hoặc giữ Alt!
        const snapOn = Boolean(cur.shiftSnap || moveEv.altKey);
        const lockUniform = Boolean(cur.uniformScaleLock);

        if (sess.handleId === "move_x" || sess.handleId === "move_y" || sess.handleId === "move_z") {
          if (raycaster.ray.intersectPlane(sess.dragPlane, hitPoint)) {
            let delta = hitPoint.clone().sub(sess.worldPivot).dot(sess.axisWorld) - sess.startAxisParam;
            delta = THREE.MathUtils.clamp(delta, -48, 48);
            if (snapOn) delta = Math.round(delta / 0.25) * 0.25;

            const nextPos = sess.startPos.clone().addScaledVector(sess.axisWorld, delta);
            nextPos.y = THREE.MathUtils.clamp(nextPos.y, -8.0, 32.0);
            const rXZ = Math.hypot(nextPos.x, nextPos.z);
            if (rXZ > 66) {
              nextPos.x = (nextPos.x / rXZ) * 66;
              nextPos.z = (nextPos.z / rXZ) * 66;
            }
            sess.pendingClonePos = nextPos.clone();
            if (liveObj) liveObj.position.copy(nextPos);
          }
        } else if (
          sess.handleId === "move_xz_center" ||
          sess.handleId === "plane_xz" ||
          sess.handleId === "plane_yz" ||
          sess.handleId === "plane_xy"
        ) {
          if (raycaster.ray.intersectPlane(sess.dragPlane, hitPoint)) {
            const deltaVec = hitPoint.clone().sub(sess.startPlaneHit);
            if (deltaVec.length() > 48) deltaVec.setLength(48);
            const nextPos = sess.startPos.clone().add(deltaVec);
            if (
              sess.handleId === "move_xz_center" ||
              (sess.handleId === "plane_xz" && cur.effectiveSpace === "world")
            ) {
              nextPos.y = sess.startPos.y;
            }
            if (snapOn) {
              nextPos.x = Math.round(nextPos.x / 0.25) * 0.25;
              if (
                sess.handleId !== "move_xz_center" &&
                !(sess.handleId === "plane_xz" && cur.effectiveSpace === "world")
              ) {
                nextPos.y = Math.round(nextPos.y / 0.25) * 0.25;
              }
              nextPos.z = Math.round(nextPos.z / 0.25) * 0.25;
            }
            nextPos.y = THREE.MathUtils.clamp(nextPos.y, -8.0, 32.0);
            const rXZ = Math.hypot(nextPos.x, nextPos.z);
            if (rXZ > 66) {
              nextPos.x = (nextPos.x / rXZ) * 66;
              nextPos.z = (nextPos.z / rXZ) * 66;
            }
            sess.pendingClonePos = nextPos.clone();
            if (liveObj) liveObj.position.copy(nextPos);
          }
        } else if (!liveObj) {
          return;
        } else if (sess.handleId === "rot_x" || sess.handleId === "rot_y" || sess.handleId === "rot_z") {
          let rawTheta = 0;
          if (Math.abs(sess.camAxisDot) < 0.16) {
            // Góc nhìn ngang mép vòng xoay -> dùng trượt ngang/dọc mượt mà không điểm mù
            const dx = moveEv.clientX - sess.startClientX;
            const dy = moveEv.clientY - sess.startClientY;
            rawTheta = (dx - dy * 0.35) * 0.011;
          } else {
            const curAngle = Math.atan2(
              moveEv.clientY - sess.pivotScreenY,
              moveEv.clientX - sess.pivotScreenX
            );
            let step = curAngle - sess.prevAngle;
            while (step > Math.PI) step -= Math.PI * 2;
            while (step < -Math.PI) step += Math.PI * 2;
            sess.prevAngle = curAngle;
            sess.accumAngle += step;
            const sign = sess.camAxisDot >= 0 ? 1 : -1;
            rawTheta = sess.accumAngle * sign;
          }

          if (snapOn) {
            const snapRad = Math.PI / 12; // 15 độ
            rawTheta = Math.round(rawTheta / snapRad) * snapRad;
          }

          const qDelta = new THREE.Quaternion().setFromAxisAngle(sess.axisWorld, rawTheta);
          liveObj.quaternion.multiplyQuaternions(qDelta, sess.startQuat).normalize();
        } else if (
          sess.handleId === "scale_x" ||
          sess.handleId === "scale_y" ||
          sess.handleId === "scale_z"
        ) {
          if (raycaster.ray.intersectPlane(sess.dragPlane, hitPoint)) {
            const delta = hitPoint.clone().sub(sess.worldPivot).dot(sess.axisWorld) - sess.startAxisParam;
            let factor = Math.max(0.1, 1 + delta / Math.max(0.25, sess.gizmoWorldScale));
            if (snapOn) factor = Math.max(0.15, Math.round(factor / 0.05) * 0.05);

            if (lockUniform) {
              liveObj.scale.set(
                clampScale(sess.startScale.x * factor),
                clampScale(sess.startScale.y * factor),
                clampScale(sess.startScale.z * factor)
              );
            } else {
              const nextS = sess.startScale.clone();
              if (sess.handleId === "scale_x") nextS.x = clampScale(sess.startScale.x * factor);
              if (sess.handleId === "scale_y") nextS.y = clampScale(sess.startScale.y * factor);
              if (sess.handleId === "scale_z") nextS.z = clampScale(sess.startScale.z * factor);
              liveObj.scale.copy(nextS);
            }
          }
        } else if (
          sess.handleId === "scale_xyz" ||
          sess.handleId === "scale_xz" ||
          sess.handleId === "scale_yz" ||
          sess.handleId === "scale_xy"
        ) {
          const pxDelta = (moveEv.clientX - sess.startClientX) - (moveEv.clientY - sess.startClientY);
          let factor = Math.max(0.1, 1 + pxDelta * 0.0065);
          if (snapOn) factor = Math.max(0.15, Math.round(factor / 0.05) * 0.05);

          if (sess.handleId === "scale_xyz" || lockUniform) {
            liveObj.scale.set(
              clampScale(sess.startScale.x * factor),
              clampScale(sess.startScale.y * factor),
              clampScale(sess.startScale.z * factor)
            );
          } else if (sess.handleId === "scale_xz") {
            liveObj.scale.set(
              clampScale(sess.startScale.x * factor),
              sess.startScale.y,
              clampScale(sess.startScale.z * factor)
            );
          } else if (sess.handleId === "scale_yz") {
            liveObj.scale.set(
              sess.startScale.x,
              clampScale(sess.startScale.y * factor),
              clampScale(sess.startScale.z * factor)
            );
          } else if (sess.handleId === "scale_xy") {
            liveObj.scale.set(
              clampScale(sess.startScale.x * factor),
              clampScale(sess.startScale.y * factor),
              sess.startScale.z
            );
          }
        }

        const now = performance.now();
        if (now - lastLiveEmitRef.current > 30) {
          lastLiveEmitRef.current = now;
          if (liveObj) {
            cur.onLiveTransformSample?.({
              id: sess.nodeId,
              position: [round3(liveObj.position.x), round3(liveObj.position.y), round3(liveObj.position.z)],
              rotation: [round3(liveObj.rotation.x), round3(liveObj.rotation.y), round3(liveObj.rotation.z)],
              scale: [clampScale(liveObj.scale.x), clampScale(liveObj.scale.y), clampScale(liveObj.scale.z)],
            });
          } else if (sess.isShiftClone && sess.pendingClonePos) {
            cur.onLiveTransformSample?.({
              id: sess.nodeId,
              position: [
                round3(sess.pendingClonePos.x),
                round3(sess.pendingClonePos.y),
                round3(sess.pendingClonePos.z),
              ],
            });
          }
        }
      };

      const onWindowUp = () => {
        window.removeEventListener("pointermove", onWindowMove);
        window.removeEventListener("pointerup", onWindowUp);
        window.removeEventListener("pointercancel", onWindowUp);

        const sess = dragSessionRef.current;
        dragSessionRef.current = null;
        setActiveHandle(null);
        document.body.style.cursor = "auto";

        const cur = latestRef.current;
        if (cur.lastGizmoDragEndMsRef) {
          cur.lastGizmoDragEndMsRef.current = performance.now();
        }
        cur.onGizmoDraggingChange?.(false);

        if (sess) {
          const liveObj =
            cur.nodeGroupRefs?.current?.[sess.nodeId] || (!sess.isShiftClone ? cur.targetObj : null);
          if (liveObj) {
            cur.onCommitTransform?.(sess.nodeId, {
              position: [round3(liveObj.position.x), round3(liveObj.position.y), round3(liveObj.position.z)],
              rotation: [round3(liveObj.rotation.x), round3(liveObj.rotation.y), round3(liveObj.rotation.z)],
              scale: [clampScale(liveObj.scale.x), clampScale(liveObj.scale.y), clampScale(liveObj.scale.z)],
            });
          } else if (sess.isShiftClone && sess.pendingClonePos) {
            cur.onCommitTransform?.(sess.nodeId, {
              position: [
                round3(sess.pendingClonePos.x),
                round3(sess.pendingClonePos.y),
                round3(sess.pendingClonePos.z),
              ],
            });
          }
        }
      };

      window.addEventListener("pointermove", onWindowMove);
      window.addEventListener("pointerup", onWindowUp);
      window.addEventListener("pointercancel", onWindowUp);
    };

    dom.addEventListener("pointerdown", handleDomPointerDownCapture, { capture: true });
    dom.addEventListener("pointermove", handleDomPointerMoveHover);
    return () => {
      dom.removeEventListener("pointerdown", handleDomPointerDownCapture, { capture: true });
      dom.removeEventListener("pointermove", handleDomPointerMoveHover);
      dragSessionRef.current = null;
      latestRef.current.onGizmoDraggingChange?.(false);
    };
  }, [camera, gl]);

  // Vòng đứt nét chỉ giới cấm đặt công trình đè lên ghế người chơi (R = 6.2m)
  const safetyDashSegments = useMemo(() => {
    const count = 48;
    return Array.from({ length: count }, (_, i) => {
      if (i % 2 === 1) return null;
      const a0 = (i / count) * Math.PI * 2;
      const a1 = ((i + 0.72) / count) * Math.PI * 2;
      return { id: i, start: a0, len: a1 - a0 };
    }).filter(Boolean);
  }, []);

  const violating = isNodeViolatingSeatZone(selectedNode);
  const selRadius = Math.max(0.85, (meta?.aoRadius || 1.2) * 0.92);

  const colorOf = (id, baseColor) =>
    activeHandle === id || hoveredHandle === id ? GIZMO_COLORS.hover : baseColor;

  return (
    <group>
      {/* 1. VÒNG CHỈ GIỚI BẢO VỆ GHẾ NGỒI (R = 6.2m cho kịch trần 12 người + Vòng ghế hiện tại) */}
      <group position={[0, 0.025, 0]}>
        {safetyDashSegments.map((seg) => (
          <mesh key={seg.id} raycast={NOOP_RAYCAST} rotation={[-Math.PI / 2, 0, seg.start]}>
            <ringGeometry args={[NO_BUILD_SEAT_RADIUS - 0.055, NO_BUILD_SEAT_RADIUS + 0.055, 6, 1, 0, seg.len]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={0.78} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        ))}

        {/* Vòng tham chiếu hàng ghế hiện tại */}
        <mesh raycast={NOOP_RAYCAST} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[circleRadius - 0.03, circleRadius + 0.03, 64]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.42} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>

      {/* 2. VIỀN TÍM BAO QUANH SILHOUETTE 3D + VÒNG SÁNG CHÂN ĐẾ CHO ĐỐI TƯỢNG ĐANG CHỌN */}
      {selectedNode && targetObj && (
        <SelectedObjectHighlightShell targetObj={targetObj} violating={violating} />
      )}

      {selectedNode && (
        <group position={selectedNode.position}>
          <mesh raycast={NOOP_RAYCAST} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
            <ringGeometry
              args={[
                selRadius * Math.max(selectedNode.scale[0], selectedNode.scale[2]) * 0.92,
                selRadius * Math.max(selectedNode.scale[0], selectedNode.scale[2]) * 1.05,
                40,
              ]}
            />
            <meshBasicMaterial
              color={violating ? "#ef4444" : "#c084fc"}
              transparent
              opacity={0.85}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* 3. GIZMO TÂM 3D CHUẨN D5 RENDER / TRIPO STUDIO (LUÔN NỔI TRÊN MỌI VẬT THỂ renderOrder=999) */}
      {selectedNode && targetObj && (
        <group
          ref={gizmoRootRef}
          position={[
            targetObj.position.x,
            targetObj.position.y + (meta?.centerHeight ?? 1.5) * targetObj.scale.y,
            targetObj.position.z,
          ]}
          renderOrder={999}
        >
          {/* ==================== LỚP HIỂN THỊ THỊ GIÁC SẮC NÉT ==================== */}
          {gizmoMode === "translate" && (
            <group>
              {/* Khối lập phương trắng giữa tâm (Trượt tự do trên sàn XZ) */}
              <mesh raycast={NOOP_RAYCAST} renderOrder={999}>
                <boxGeometry args={[0.15, 0.15, 0.15]} />
                <meshBasicMaterial
                  color={colorOf("move_xz_center", GIZMO_COLORS.center)}
                  transparent
                  opacity={0.76}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>

              {/* Mũi tên +X (Đỏ) */}
              <group rotation={[0, 0, -Math.PI / 2]}>
                <mesh raycast={NOOP_RAYCAST} position={[0, 0.46, 0]} renderOrder={999}>
                  <cylinderGeometry args={[0.017, 0.017, 0.88, 12]} />
                  <meshBasicMaterial
                    color={colorOf("move_x", GIZMO_COLORS.x)}
                    depthTest={false}
                    depthWrite={false}
                    toneMapped={false}
                    fog={false}
                  />
                </mesh>
                <mesh raycast={NOOP_RAYCAST} position={[0, 0.95, 0]} renderOrder={999}>
                  <coneGeometry args={[0.068, 0.21, 18]} />
                  <meshBasicMaterial
                    color={colorOf("move_x", GIZMO_COLORS.x)}
                    depthTest={false}
                    depthWrite={false}
                    toneMapped={false}
                    fog={false}
                  />
                </mesh>
              </group>

              {/* Mũi tên +Y (Xanh lá - Thẳng đứng) */}
              <group>
                <mesh raycast={NOOP_RAYCAST} position={[0, 0.46, 0]} renderOrder={999}>
                  <cylinderGeometry args={[0.017, 0.017, 0.88, 12]} />
                  <meshBasicMaterial
                    color={colorOf("move_y", GIZMO_COLORS.y)}
                    depthTest={false}
                    depthWrite={false}
                    toneMapped={false}
                    fog={false}
                  />
                </mesh>
                <mesh raycast={NOOP_RAYCAST} position={[0, 0.95, 0]} renderOrder={999}>
                  <coneGeometry args={[0.068, 0.21, 18]} />
                  <meshBasicMaterial
                    color={colorOf("move_y", GIZMO_COLORS.y)}
                    depthTest={false}
                    depthWrite={false}
                    toneMapped={false}
                    fog={false}
                  />
                </mesh>
              </group>

              {/* Mũi tên +Z (Xanh dương) */}
              <group rotation={[Math.PI / 2, 0, 0]}>
                <mesh raycast={NOOP_RAYCAST} position={[0, 0.46, 0]} renderOrder={999}>
                  <cylinderGeometry args={[0.017, 0.017, 0.88, 12]} />
                  <meshBasicMaterial
                    color={colorOf("move_z", GIZMO_COLORS.z)}
                    depthTest={false}
                    depthWrite={false}
                    toneMapped={false}
                    fog={false}
                  />
                </mesh>
                <mesh raycast={NOOP_RAYCAST} position={[0, 0.95, 0]} renderOrder={999}>
                  <coneGeometry args={[0.068, 0.21, 18]} />
                  <meshBasicMaterial
                    color={colorOf("move_z", GIZMO_COLORS.z)}
                    depthTest={false}
                    depthWrite={false}
                    toneMapped={false}
                    fog={false}
                  />
                </mesh>
              </group>

              {/* 3 Ô vuông bán trong suốt trượt mặt phẳng XZ (Lục), YZ (Đỏ), XY (Lam) */}
              <mesh raycast={NOOP_RAYCAST} position={[0.23, 0, 0.23]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={999}>
                <planeGeometry args={[0.21, 0.21]} />
                <meshBasicMaterial
                  color={colorOf("plane_xz", GIZMO_COLORS.y)}
                  transparent
                  opacity={activeHandle === "plane_xz" || hoveredHandle === "plane_xz" ? 0.85 : 0.52}
                  side={THREE.DoubleSide}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>
              <mesh raycast={NOOP_RAYCAST} position={[0, 0.23, 0.23]} rotation={[0, Math.PI / 2, 0]} renderOrder={999}>
                <planeGeometry args={[0.21, 0.21]} />
                <meshBasicMaterial
                  color={colorOf("plane_yz", GIZMO_COLORS.x)}
                  transparent
                  opacity={activeHandle === "plane_yz" || hoveredHandle === "plane_yz" ? 0.85 : 0.52}
                  side={THREE.DoubleSide}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>
              <mesh raycast={NOOP_RAYCAST} position={[0.23, 0.23, 0]} renderOrder={999}>
                <planeGeometry args={[0.21, 0.21]} />
                <meshBasicMaterial
                  color={colorOf("plane_xy", GIZMO_COLORS.z)}
                  transparent
                  opacity={activeHandle === "plane_xy" || hoveredHandle === "plane_xy" ? 0.85 : 0.52}
                  side={THREE.DoubleSide}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>

              {/* 3 Đầu Nón Xoay Nhanh Quanh Tâm (Chuẩn Ảnh Mẫu Tripo/D5: Vừa kéo vị trí vừa xoay hướng ngay tức thì!) */}
              {/* Nón Đỏ: Xoay trục X (nằm trên cung YZ) */}
              <mesh
                raycast={NOOP_RAYCAST}
                position={[0, 0.52, 0.42]}
                rotation={[-0.72, 0, 0]}
                renderOrder={999}
              >
                <coneGeometry args={[0.065, 0.17, 16]} />
                <meshBasicMaterial
                  color={colorOf("rot_x", GIZMO_COLORS.x)}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>

              {/* Nón Xanh Dương: Xoay trục Z (nằm trên cung XY) */}
              <mesh
                raycast={NOOP_RAYCAST}
                position={[0.42, 0.52, 0]}
                rotation={[0, 0, 0.72]}
                renderOrder={999}
              >
                <coneGeometry args={[0.065, 0.17, 16]} />
                <meshBasicMaterial
                  color={colorOf("rot_z", GIZMO_COLORS.z)}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>

              {/* Nón Xanh Lá: Xoay ngang Yaw trục Y (nằm dưới tâm trên mặt XZ) */}
              <mesh
                raycast={NOOP_RAYCAST}
                position={[0.46, -0.02, 0.46]}
                rotation={[Math.PI, 0, 0]}
                renderOrder={999}
              >
                <coneGeometry args={[0.072, 0.185, 16]} />
                <meshBasicMaterial
                  color={colorOf("rot_y", GIZMO_COLORS.y)}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>
            </group>
          )}

          {gizmoMode === "rotate" && (
            <group>
              <mesh raycast={NOOP_RAYCAST} rotation={[0, Math.PI / 2, 0]} renderOrder={999}>
                <torusGeometry args={[0.96, 0.022, 12, 64]} />
                <meshBasicMaterial
                  color={colorOf("rot_x", GIZMO_COLORS.x)}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>
              <mesh raycast={NOOP_RAYCAST} rotation={[Math.PI / 2, 0, 0]} renderOrder={999}>
                <torusGeometry args={[0.96, 0.022, 12, 64]} />
                <meshBasicMaterial
                  color={colorOf("rot_y", GIZMO_COLORS.y)}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>
              <mesh raycast={NOOP_RAYCAST} renderOrder={999}>
                <torusGeometry args={[0.96, 0.022, 12, 64]} />
                <meshBasicMaterial
                  color={colorOf("rot_z", GIZMO_COLORS.z)}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>
              <mesh raycast={NOOP_RAYCAST} renderOrder={999}>
                <sphereGeometry args={[0.08, 12, 12]} />
                <meshBasicMaterial
                  color={GIZMO_COLORS.center}
                  transparent
                  opacity={0.75}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>
            </group>
          )}

          {gizmoMode === "scale" && (
            <group>
              {/* Khối Trắng Giữa Tâm: Kéo Phóng To / Thu Nhỏ Đều Cả 3 Chiều X·Y·Z */}
              <mesh raycast={NOOP_RAYCAST} renderOrder={999}>
                <boxGeometry args={[0.19, 0.19, 0.19]} />
                <meshBasicMaterial
                  color={colorOf("scale_xyz", GIZMO_COLORS.center)}
                  transparent
                  opacity={0.86}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>

              {/* Trục Scale X (Rộng) */}
              <group rotation={[0, 0, -Math.PI / 2]}>
                <mesh raycast={NOOP_RAYCAST} position={[0, 0.45, 0]} renderOrder={999}>
                  <cylinderGeometry args={[0.017, 0.017, 0.86, 10]} />
                  <meshBasicMaterial
                    color={colorOf("scale_x", GIZMO_COLORS.x)}
                    depthTest={false}
                    depthWrite={false}
                    toneMapped={false}
                    fog={false}
                  />
                </mesh>
                <mesh raycast={NOOP_RAYCAST} position={[0, 0.92, 0]} renderOrder={999}>
                  <boxGeometry args={[0.135, 0.135, 0.135]} />
                  <meshBasicMaterial
                    color={colorOf("scale_x", GIZMO_COLORS.x)}
                    depthTest={false}
                    depthWrite={false}
                    toneMapped={false}
                    fog={false}
                  />
                </mesh>
              </group>

              {/* Trục Scale Y (Cao - tự mọc từ mặt đất y=0 lên!) */}
              <group>
                <mesh raycast={NOOP_RAYCAST} position={[0, 0.45, 0]} renderOrder={999}>
                  <cylinderGeometry args={[0.017, 0.017, 0.86, 10]} />
                  <meshBasicMaterial
                    color={colorOf("scale_y", GIZMO_COLORS.y)}
                    depthTest={false}
                    depthWrite={false}
                    toneMapped={false}
                    fog={false}
                  />
                </mesh>
                <mesh raycast={NOOP_RAYCAST} position={[0, 0.92, 0]} renderOrder={999}>
                  <boxGeometry args={[0.135, 0.135, 0.135]} />
                  <meshBasicMaterial
                    color={colorOf("scale_y", GIZMO_COLORS.y)}
                    depthTest={false}
                    depthWrite={false}
                    toneMapped={false}
                    fog={false}
                  />
                </mesh>
              </group>

              {/* Trục Scale Z (Sâu) */}
              <group rotation={[Math.PI / 2, 0, 0]}>
                <mesh raycast={NOOP_RAYCAST} position={[0, 0.45, 0]} renderOrder={999}>
                  <cylinderGeometry args={[0.017, 0.017, 0.86, 10]} />
                  <meshBasicMaterial
                    color={colorOf("scale_z", GIZMO_COLORS.z)}
                    depthTest={false}
                    depthWrite={false}
                    toneMapped={false}
                    fog={false}
                  />
                </mesh>
                <mesh raycast={NOOP_RAYCAST} position={[0, 0.92, 0]} renderOrder={999}>
                  <boxGeometry args={[0.135, 0.135, 0.135]} />
                  <meshBasicMaterial
                    color={colorOf("scale_z", GIZMO_COLORS.z)}
                    depthTest={false}
                    depthWrite={false}
                    toneMapped={false}
                    fog={false}
                  />
                </mesh>
              </group>

              {/* 3 Ô vuông Scale theo từng cặp mặt phẳng */}
              <mesh raycast={NOOP_RAYCAST} position={[0.24, 0, 0.24]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={999}>
                <planeGeometry args={[0.2, 0.2]} />
                <meshBasicMaterial
                  color={colorOf("scale_xz", GIZMO_COLORS.y)}
                  transparent
                  opacity={0.5}
                  side={THREE.DoubleSide}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>
              <mesh raycast={NOOP_RAYCAST} position={[0, 0.24, 0.24]} rotation={[0, Math.PI / 2, 0]} renderOrder={999}>
                <planeGeometry args={[0.2, 0.2]} />
                <meshBasicMaterial
                  color={colorOf("scale_yz", GIZMO_COLORS.x)}
                  transparent
                  opacity={0.5}
                  side={THREE.DoubleSide}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>
              <mesh raycast={NOOP_RAYCAST} position={[0.24, 0.24, 0]} renderOrder={999}>
                <planeGeometry args={[0.2, 0.2]} />
                <meshBasicMaterial
                  color={colorOf("scale_xy", GIZMO_COLORS.z)}
                  transparent
                  opacity={0.5}
                  side={THREE.DoubleSide}
                  depthTest={false}
                  depthWrite={false}
                  toneMapped={false}
                  fog={false}
                />
              </mesh>
            </group>
          )}

          {/* ==================== LỚP PICKER VÔ HÌNH TIẾT DIỆN RỘNG (BẮT CHUỘT NHẠY 100%) ==================== */}
          <group ref={gizmoPickersGroupRef}>
            {gizmoMode === "translate" && (
              <>
                <mesh userData={{ handleId: "move_xz_center" }}>
                  <boxGeometry args={[0.24, 0.24, 0.24]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>

                <mesh position={[0.62, 0, 0]} rotation={[0, 0, -Math.PI / 2]} userData={{ handleId: "move_x" }}>
                  <cylinderGeometry args={[0.095, 0.095, 0.92, 8]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh position={[0, 0.62, 0]} userData={{ handleId: "move_y" }}>
                  <cylinderGeometry args={[0.095, 0.095, 0.92, 8]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh position={[0, 0, 0.62]} rotation={[Math.PI / 2, 0, 0]} userData={{ handleId: "move_z" }}>
                  <cylinderGeometry args={[0.095, 0.095, 0.92, 8]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>

                <mesh position={[0.23, 0, 0.23]} userData={{ handleId: "plane_xz" }}>
                  <boxGeometry args={[0.26, 0.06, 0.26]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh position={[0, 0.23, 0.23]} userData={{ handleId: "plane_yz" }}>
                  <boxGeometry args={[0.06, 0.26, 0.26]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh position={[0.23, 0.23, 0]} userData={{ handleId: "plane_xy" }}>
                  <boxGeometry args={[0.26, 0.26, 0.06]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>

                <mesh position={[0, 0.52, 0.42]} userData={{ handleId: "rot_x" }}>
                  <sphereGeometry args={[0.145, 10, 10]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh position={[0.42, 0.52, 0]} userData={{ handleId: "rot_z" }}>
                  <sphereGeometry args={[0.145, 10, 10]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh position={[0.46, -0.02, 0.46]} userData={{ handleId: "rot_y" }}>
                  <sphereGeometry args={[0.155, 10, 10]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
              </>
            )}

            {gizmoMode === "rotate" && (
              <>
                <mesh rotation={[0, Math.PI / 2, 0]} userData={{ handleId: "rot_x" }}>
                  <torusGeometry args={[0.96, 0.095, 8, 48]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]} userData={{ handleId: "rot_y" }}>
                  <torusGeometry args={[0.96, 0.095, 8, 48]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh userData={{ handleId: "rot_z" }}>
                  <torusGeometry args={[0.96, 0.095, 8, 48]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
              </>
            )}

            {gizmoMode === "scale" && (
              <>
                <mesh userData={{ handleId: "scale_xyz" }}>
                  <boxGeometry args={[0.28, 0.28, 0.28]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh position={[0.62, 0, 0]} rotation={[0, 0, -Math.PI / 2]} userData={{ handleId: "scale_x" }}>
                  <cylinderGeometry args={[0.095, 0.095, 0.88, 8]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh position={[0, 0.62, 0]} userData={{ handleId: "scale_y" }}>
                  <cylinderGeometry args={[0.095, 0.095, 0.88, 8]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh position={[0, 0, 0.62]} rotation={[Math.PI / 2, 0, 0]} userData={{ handleId: "scale_z" }}>
                  <cylinderGeometry args={[0.095, 0.095, 0.88, 8]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh position={[0.24, 0, 0.24]} userData={{ handleId: "scale_xz" }}>
                  <boxGeometry args={[0.25, 0.06, 0.25]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh position={[0, 0.24, 0.24]} userData={{ handleId: "scale_yz" }}>
                  <boxGeometry args={[0.06, 0.25, 0.25]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh position={[0.24, 0.24, 0]} userData={{ handleId: "scale_xy" }}>
                  <boxGeometry args={[0.25, 0.25, 0.06]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
                </mesh>
              </>
            )}
          </group>
        </group>
      )}
    </group>
  );
}

/**
 * 2. LỚP GIAO DIỆN NỔI KIẾN TRÚC SƯ D5 STUDIO (BÊN NGOÀI <Canvas>)
 */
export function ArchitectOverlayHUD({
  nodes = [],
  selectedNode,
  liveSample = null,
  gizmoMode,
  setGizmoMode,
  gizmoSpace,
  setGizmoSpace,
  uniformScaleLock,
  setUniformScaleLock,
  shiftSnap,
  setShiftSnap,
  canUndo,
  canRedo,
  hasUnsavedDraft,
  savingToServer,
  statusBanner,
  standaloneArchitect = false,
  studioMood = "auto",
  onChangeStudioMood,
  studioSeatCount = 8,
  onChangeStudioSeatCount,
  loadedGlbCount = 0,
  totalGlbCount = 12,
  showPropTuner = false,
  onTogglePropTuner,
  presetsIndex = null,
  activePresetId = "nordic_village_v3",
  onSelectPresetId,
  onCreateCleanStarterPreset,
  onCloneCurrentPreset,
  onRenameActivePreset,
  onSetDefaultPreset,
  onDeleteActivePreset,
  syncingTripoConcepts = false,
  onSyncTripoConcepts,
  conceptCount = 0,
  onSelectNodeId,
  onUpdateNodeFields,
  onDropToGround,
  onPushOutsideSeatZone,
  onPushAllViolationsOutside,
  onFocusSelected,
  onDuplicateSelected,
  onDeleteSelected,
  onSpawnAssetType,
  onUndo,
  onRedo,
  onSaveToProject,
  onExportJson,
  onImportJsonFile,
  onResetDefaultLayout,
  onExitArchitectMode,
}) {
  const [rightTab, setRightTab] = useState("inspector"); // 'inspector' | 'library' | 'outliner'
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const fileInputRef = useRef(null);

  const presetsList = presetsIndex?.presets || [];
  const defaultPresetId = presetsIndex?.defaultPresetId || "nordic_village_v3";
  const activePresetMeta =
    presetsList.find((p) => p.id === activePresetId) || presetsList[0] || null;
  const isBuiltInPreset = Boolean(
    activePresetMeta?.builtIn || activePresetId === "nordic_village_v3"
  );
  const isDefaultPreset = defaultPresetId === activePresetId;

  // Phím tắt chuẩn D5 Render / Tripo Studio (Giữ Shift + Kéo trục Di chuyển = Copy nhân bản mượt dọc trục)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (isTypingInInput(e.target)) return;

      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && key === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndo?.();
        return;
      }
      if ((ctrl && key === "y") || (ctrl && e.shiftKey && key === "z")) {
        e.preventDefault();
        onRedo?.();
        return;
      }
      if (ctrl && key === "d") {
        e.preventDefault();
        onDuplicateSelected?.();
        return;
      }
      if (ctrl && key === "s") {
        e.preventDefault();
        onSaveToProject?.();
        return;
      }

      if (ctrl || e.altKey) return;

      if (key === "1" || key === "v") {
        setGizmoMode("translate");
      } else if (key === "2" || key === "r") {
        setGizmoMode("rotate");
      } else if (key === "3" || key === "c") {
        setGizmoMode("scale");
      } else if (key === "g") {
        onDropToGround?.();
      } else if (key === "f") {
        onFocusSelected?.();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNode?.deletable) {
          e.preventDefault();
          onDeleteSelected?.();
        }
      } else if (e.key === "Escape") {
        onSelectNodeId?.(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    selectedNode,
    setGizmoMode,
    onUndo,
    onRedo,
    onDuplicateSelected,
    onSaveToProject,
    onDropToGround,
    onFocusSelected,
    onDeleteSelected,
    onSelectNodeId,
  ]);

  const displayNode =
    selectedNode && liveSample && liveSample.id === selectedNode.id
      ? { ...selectedNode, ...liveSample }
      : selectedNode;

  const violatingNodes = useMemo(
    () => nodes.filter((n) => isNodeViolatingSeatZone(n)),
    [nodes]
  );
  const selectedViolating = isNodeViolatingSeatZone(displayNode);

  const filteredOutlinerNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return nodes.filter((n) => {
      if (categoryFilter === "concepts") {
        if (!EXTERIOR_ASSET_CATALOG[n.type]?.isConcept) return false;
      } else if (categoryFilter !== "all" && n.category !== categoryFilter) {
        return false;
      }
      if (q && !n.label.toLowerCase().includes(q) && !n.id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [nodes, categoryFilter, searchQuery]);

  const filteredLibraryItems = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    const candidateTypes = [...SPAWNABLE_ASSET_TYPES];
    if (!nodes.some((n) => n.type === "plaza_cobblestone") && !candidateTypes.includes("plaza_cobblestone")) {
      candidateTypes.push("plaza_cobblestone");
    }
    return candidateTypes
      .map((type) => EXTERIOR_ASSET_CATALOG[type])
      .filter((item) => {
        if (!item) return false;
        if (libraryFilter === "concepts") {
          if (!item.isConcept) return false;
        } else if (libraryFilter !== "all" && item.category !== libraryFilter) {
          return false;
        }
        if (
          q &&
          !item.label.toLowerCase().includes(q) &&
          !(item.sourceName || "").toLowerCase().includes(q) &&
          !item.type.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      });
  }, [libraryFilter, librarySearch, nodes, conceptCount]);

  const handleNumericAxisChange = (field, axisIdx, rawVal, isDegrees = false) => {
    if (!selectedNode) return;
    const parsed = Number(rawVal);
    if (!Number.isFinite(parsed)) return;

    const currentArr = [...(selectedNode[field] || [0, 0, 0])];
    if (field === "scale") {
      const nextVal = clampScale(parsed);
      if (uniformScaleLock) {
        const base = currentArr[axisIdx] || 1;
        const ratio = base > 0.001 ? nextVal / base : 1;
        onUpdateNodeFields(selectedNode.id, {
          scale: [
            clampScale(currentArr[0] * ratio),
            clampScale(currentArr[1] * ratio),
            clampScale(currentArr[2] * ratio),
          ],
        });
        return;
      }
      currentArr[axisIdx] = nextVal;
      onUpdateNodeFields(selectedNode.id, { scale: currentArr });
    } else if (field === "rotation") {
      currentArr[axisIdx] = round3(isDegrees ? parsed * DEG2RAD : parsed);
      onUpdateNodeFields(selectedNode.id, { rotation: currentArr });
    } else {
      currentArr[axisIdx] = round3(parsed);
      onUpdateNodeFields(selectedNode.id, { position: currentArr });
    }
  };

  return (
    <>
      {/* ==================== 1 & 2. CỤM THANH D5 STUDIO + ÁNH SÁNG 4 BUỔI + KHO .GLB TRÊN ĐỈNH ==================== */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 25,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
          pointerEvents: "none",
          maxWidth: "calc(100% - 24px)",
        }}
      >
        {/* DÒNG 1: THANH CÔNG CỤ GIZMO 3 TRỤC + LƯU CỐ ĐỊNH */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            padding: "6px 10px",
            background: "rgba(9, 14, 28, 0.92)",
            border: "1px solid rgba(245, 158, 11, 0.45)",
            borderRadius: "14px",
            backdropFilter: "blur(14px)",
            boxShadow: "0 10px 28px rgba(0, 0, 0, 0.65)",
            pointerEvents: "auto",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 800,
              color: "#fbbf24",
              paddingRight: "6px",
              borderRight: "1px solid rgba(255,255,255,0.14)",
              whiteSpace: "nowrap",
            }}
          >
            🏗️ D5 STUDIO
          </span>

          {/* 3 Chế độ Gizmo chính: Move+QuickRotate Tâm / Gimbal Rotate / Scale 3 Chiều */}
          {[
            { id: "translate", label: "✥ Tâm Di chuyển + Xoay (1/V)", accent: "#3b82f6" },
            { id: "rotate", label: "↻ Vòng Xoay (2/R)", accent: "#10b981" },
            { id: "scale", label: "⤢ Scale X·Y·Z (3/C)", accent: "#f59e0b" },
          ].map((m) => {
            const active = gizmoMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setGizmoMode(m.id)}
                style={{
                  width: "auto",
                  margin: 0,
                  padding: "4px 10px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  background: active ? m.accent : "rgba(30, 41, 59, 0.72)",
                  color: active ? "#ffffff" : "#cbd5e1",
                  border: `1px solid ${active ? "rgba(255,255,255,0.45)" : "rgba(148,163,184,0.2)"}`,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {m.label}
              </button>
            );
          })}

          {/* Tuỳ chọn ngữ cảnh theo chế độ Gizmo */}
          {gizmoMode === "scale" ? (
            <button
              type="button"
              onClick={() => setUniformScaleLock((v) => !v)}
              style={{
                width: "auto",
                margin: 0,
                padding: "4px 9px",
                borderRadius: "8px",
                fontSize: "10.5px",
                fontWeight: 700,
                background: uniformScaleLock ? "rgba(168, 85, 247, 0.32)" : "rgba(34, 197, 94, 0.2)",
                color: uniformScaleLock ? "#e9d5ff" : "#86efac",
                border: `1px solid ${uniformScaleLock ? "rgba(168,85,247,0.5)" : "rgba(34,197,94,0.4)"}`,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              title="Mặc định MỞ KHÓA để bạn kéo riêng Đỏ (Rộng X) / Lục (Cao Y) / Lam (Sâu Z), hoặc BẬT KHÓA để phóng to đều 3 chiều!"
            >
              {uniformScaleLock ? "🔒 Khóa đều XYZ" : "🔓 Từng chiều X·Y·Z"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setGizmoSpace((s) => (s === "world" ? "local" : "world"))}
              style={{
                width: "auto",
                margin: 0,
                padding: "4px 8px",
                borderRadius: "8px",
                fontSize: "10.5px",
                fontWeight: 600,
                background: "rgba(30, 41, 59, 0.7)",
                color: "#93c5fd",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              title="Đổi hệ trục kéo Thế giới (World) hoặc Nội bộ theo mặt tiền công trình (Local)"
            >
              {gizmoSpace === "world" ? "🌐 Trục World" : "🧭 Trục Local"}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShiftSnap((s) => !s)}
            style={{
              width: "auto",
              margin: 0,
              padding: "4px 8px",
              borderRadius: "8px",
              fontSize: "10.5px",
              fontWeight: 600,
              background: shiftSnap ? "rgba(14, 165, 233, 0.28)" : "rgba(30, 41, 59, 0.65)",
              color: shiftSnap ? "#bae6fd" : "#94a3b8",
              border: "1px solid rgba(148,163,184,0.22)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            title="Bật bắt dính bước 0.25m & góc 15° (hoặc giữ phím Alt khi kéo)"
          >
            🧲 Snap {shiftSnap ? "BẬT" : "TẮT"}
          </button>

          <button
            type="button"
            disabled={!selectedNode}
            onClick={onDropToGround}
            style={{
              width: "auto",
              margin: 0,
              padding: "4px 8px",
              borderRadius: "8px",
              fontSize: "10.5px",
              fontWeight: 600,
              background: "rgba(30, 41, 59, 0.7)",
              color: selectedNode ? "#e2e8f0" : "#64748b",
              border: "1px solid rgba(148,163,184,0.2)",
              cursor: selectedNode ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
            }}
            title="Hạ chân đế vật thể chạm đúng mặt sân y = 0 (Phím G)"
          >
            ⚓ y=0 (G)
          </button>

          <button
            type="button"
            disabled={!selectedNode}
            onClick={onDuplicateSelected}
            style={{
              width: "auto",
              margin: 0,
              padding: "4px 8px",
              borderRadius: "8px",
              fontSize: "10.5px",
              fontWeight: 600,
              background: "rgba(30, 41, 59, 0.7)",
              color: selectedNode ? "#fde68a" : "#64748b",
              border: "1px solid rgba(245, 158, 11, 0.25)",
              cursor: selectedNode ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
            }}
            title="Nhân bản nhanh vật thể đang chọn (Ctrl + D)"
          >
            📋 Nhân bản
          </button>

          <button
            type="button"
            disabled={!selectedNode?.deletable}
            onClick={onDeleteSelected}
            style={{
              width: "auto",
              margin: 0,
              padding: "4px 8px",
              borderRadius: "8px",
              fontSize: "10.5px",
              fontWeight: 600,
              background: selectedNode?.deletable ? "rgba(239, 68, 68, 0.2)" : "rgba(30, 41, 59, 0.45)",
              color: selectedNode?.deletable ? "#fca5a5" : "#64748b",
              border: "1px solid rgba(239, 68, 68, 0.28)",
              cursor: selectedNode?.deletable ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
            }}
            title="Xóa vật thể đang chọn (Phím Delete)"
          >
            🗑️ Xóa
          </button>

          {/* Undo / Redo */}
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            style={{
              width: "auto",
              margin: 0,
              padding: "4px 7px",
              borderRadius: "8px",
              fontSize: "10.5px",
              background: "rgba(30, 41, 59, 0.65)",
              color: canUndo ? "#e2e8f0" : "#475569",
              border: "1px solid rgba(148,163,184,0.18)",
              cursor: canUndo ? "pointer" : "not-allowed",
            }}
            title="Hoàn tác (Ctrl + Z)"
          >
            ↩
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            style={{
              width: "auto",
              margin: 0,
              padding: "4px 7px",
              borderRadius: "8px",
              fontSize: "10.5px",
              background: "rgba(30, 41, 59, 0.65)",
              color: canRedo ? "#e2e8f0" : "#475569",
              border: "1px solid rgba(148,163,184,0.18)",
              cursor: canRedo ? "pointer" : "not-allowed",
            }}
            title="Làm lại (Ctrl + Y)"
          >
            ↪
          </button>

          {/* Lưu cố định 1-Click vào dự án / Bối cảnh đang chọn */}
          <button
            type="button"
            disabled={savingToServer}
            onClick={onSaveToProject}
            style={{
              width: "auto",
              margin: 0,
              padding: "4px 11px",
              borderRadius: "8px",
              fontSize: "11px",
              fontWeight: 800,
              background: hasUnsavedDraft
                ? "linear-gradient(135deg, #16a34a, #059669)"
                : "rgba(16, 185, 129, 0.25)",
              color: "#ffffff",
              border: "1px solid rgba(74, 222, 128, 0.55)",
              boxShadow: hasUnsavedDraft ? "0 0 12px rgba(34, 197, 94, 0.45)" : "none",
              cursor: savingToServer ? "wait" : "pointer",
              whiteSpace: "nowrap",
            }}
            title={`Ghi cố định bối cảnh "${activePresetMeta?.name || activePresetId}" (${
              isBuiltInPreset
                ? "client/public/config/village_layout.json"
                : `client/public/config/presets/${activePresetId}.json`
            }) — Phím tắt Ctrl + S`}
          >
            {savingToServer
              ? "⏳ Đang lưu..."
              : hasUnsavedDraft
                ? "💾 Lưu Bối Cảnh *"
                : "✅ Đã Lưu Bối Cảnh"}
          </button>

          <button
            type="button"
            onClick={onExitArchitectMode}
            style={{
              width: "auto",
              margin: 0,
              padding: "4px 9px",
              borderRadius: "8px",
              fontSize: "10.5px",
              fontWeight: 700,
              background: "rgba(239, 68, 68, 0.22)",
              color: "#fecaca",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            title={standaloneArchitect ? "Đóng Studio và quay lại sảnh game" : "Đóng chế độ D5 Studio và quay về Camera người chơi"}
          >
            {standaloneArchitect ? "🚪 Về Sảnh Game" : "✕ Đóng Edit"}
          </button>
        </div>

        {/* DÒNG 1.5: QUẢN LÝ ĐA BỐI CẢNH (MULTI-SCENE PRESETS) + TẠO SÂN TRỐNG / NHÂN BẢN / QUÉT TRIPO */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            padding: "4px 10px",
            background: "rgba(9, 14, 28, 0.90)",
            border: "1px solid rgba(56, 189, 248, 0.35)",
            borderRadius: "12px",
            backdropFilter: "blur(12px)",
            boxShadow: "0 6px 18px rgba(0, 0, 0, 0.52)",
            pointerEvents: "auto",
          }}
        >
          <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#7dd3fc", whiteSpace: "nowrap" }}>
            🗺️ Bối cảnh:
          </span>

          <select
            value={activePresetId}
            onChange={(e) => onSelectPresetId?.(e.target.value)}
            style={{
              width: "auto",
              maxWidth: "255px",
              margin: 0,
              padding: "3px 8px",
              borderRadius: "7px",
              fontSize: "10.5px",
              fontWeight: 700,
              background: "rgba(15, 23, 42, 0.92)",
              color: "#f8fafc",
              border: "1px solid rgba(56, 189, 248, 0.45)",
              cursor: "pointer",
            }}
            title="Chuyển đổi giữa Bản Lề V3 và các Bối cảnh tùy chọn bạn đã tạo"
          >
            {(presetsList.length > 0
              ? presetsList
              : [{ id: "nordic_village_v3", name: "🌲 Làng Bắc Âu V3 (Chuẩn)", nodeCount: nodes.length }]
            ).map((p) => (
              <option key={p.id} value={p.id}>
                {defaultPresetId === p.id ? "⭐ " : ""}
                {p.name} ({p.nodeCount ?? 0})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onCreateCleanStarterPreset}
            style={{
              width: "auto",
              margin: 0,
              padding: "3px 8px",
              borderRadius: "7px",
              fontSize: "10px",
              fontWeight: 800,
              background: "linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.35))",
              color: "#a7f3d0",
              border: "1px solid rgba(52, 211, 153, 0.5)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            title="Tạo Bối cảnh mới sạch sẽ (chỉ giữ Sân Đá + Bếp Lửa ở tâm [0,0,0]) để bạn tự xếp không gian từ đầu!"
          >
            ✨ Tạo Sân Trống
          </button>

          <button
            type="button"
            onClick={onCloneCurrentPreset}
            style={{
              width: "auto",
              margin: 0,
              padding: "3px 8px",
              borderRadius: "7px",
              fontSize: "10px",
              fontWeight: 700,
              background: "rgba(59, 130, 246, 0.22)",
              color: "#bfdbfe",
              border: "1px solid rgba(96, 165, 250, 0.42)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            title="Tạo Bối cảnh mới bằng cách nhân bản toàn bộ vật thể từ bối cảnh đang mở"
          >
            📋 Nhân bản cảnh
          </button>

          {!isBuiltInPreset && (
            <button
              type="button"
              onClick={onRenameActivePreset}
              style={{
                width: "auto",
                margin: 0,
                padding: "3px 7px",
                borderRadius: "7px",
                fontSize: "10px",
                fontWeight: 600,
                background: "rgba(30, 41, 59, 0.72)",
                color: "#e2e8f0",
                border: "1px solid rgba(148, 163, 184, 0.28)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              title="Đổi tên hiển thị cho bối cảnh tùy chọn này"
            >
              ✏️ Đổi tên
            </button>
          )}

          <button
            type="button"
            onClick={onSetDefaultPreset}
            disabled={isDefaultPreset}
            style={{
              width: "auto",
              margin: 0,
              padding: "3px 7px",
              borderRadius: "7px",
              fontSize: "10px",
              fontWeight: 700,
              background: isDefaultPreset ? "rgba(245, 158, 11, 0.28)" : "rgba(30, 41, 59, 0.72)",
              color: isDefaultPreset ? "#fde68a" : "#cbd5e1",
              border: `1px solid ${isDefaultPreset ? "rgba(245, 158, 11, 0.55)" : "rgba(148, 163, 184, 0.25)"}`,
              cursor: isDefaultPreset ? "default" : "pointer",
              whiteSpace: "nowrap",
            }}
            title={
              isDefaultPreset
                ? "Bối cảnh này đang là mặc định khi mở phòng mới"
                : "Đặt bối cảnh này làm bối cảnh mặc định cho sảnh chờ"
            }
          >
            {isDefaultPreset ? "⭐ Mặc định" : "☆ Đặt mặc định"}
          </button>

          {!isBuiltInPreset && (
            <button
              type="button"
              onClick={onDeleteActivePreset}
              style={{
                width: "auto",
                margin: 0,
                padding: "3px 7px",
                borderRadius: "7px",
                fontSize: "10px",
                fontWeight: 700,
                background: "rgba(239, 68, 68, 0.18)",
                color: "#fca5a5",
                border: "1px solid rgba(239, 68, 68, 0.35)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              title="Xóa bối cảnh tùy chọn này (Bản Lề V3 gốc luôn được bảo vệ an toàn)"
            >
              🗑️ Xóa cảnh
            </button>
          )}

          <button
            type="button"
            disabled={syncingTripoConcepts}
            onClick={() => {
              onSyncTripoConcepts?.();
              setRightTab("library");
              setLibraryFilter("concepts");
            }}
            style={{
              width: "auto",
              margin: 0,
              marginLeft: "2px",
              padding: "3px 8px",
              borderRadius: "7px",
              fontSize: "10px",
              fontWeight: 800,
              background: "rgba(168, 85, 247, 0.26)",
              color: "#e9d5ff",
              border: "1px solid rgba(192, 132, 252, 0.5)",
              cursor: syncingTripoConcepts ? "wait" : "pointer",
              whiteSpace: "nowrap",
            }}
            title="Quét thư mục MODEL CONCEPT THEM và nạp nóng mọi file .GLB mới vào Tab ➕ Thêm mới ngay lập tức!"
          >
            {syncingTripoConcepts
              ? "⏳ Đang quét..."
              : `🌟 Kho Concept (${conceptCount}) 🔄`}
          </button>
        </div>

        {/* DÒNG 2: BỘ ĐỔI ÁNH SÁNG 4 BUỔI + VÒNG GHẾ THAM CHIẾU KHÓA CỨNG + KHO 12 .GLB */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            padding: "4px 9px",
            background: "rgba(9, 14, 28, 0.88)",
            border: "1px solid rgba(148, 163, 184, 0.28)",
            borderRadius: "12px",
            backdropFilter: "blur(12px)",
            boxShadow: "0 6px 18px rgba(0, 0, 0, 0.5)",
            pointerEvents: "auto",
          }}
        >
          <span style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", whiteSpace: "nowrap" }}>
            🌤️ Ánh sáng:
          </span>
          {[
            ...(!standaloneArchitect ? [{ id: "auto", label: "🎬 Theo ván" }] : []),
            { id: "day", label: "☀️ Ngày" },
            { id: "dawn", label: "🌅 Bình minh" },
            { id: "dusk_trial", label: "🌆 Xét xử" },
            { id: "night", label: "🌙 Đêm" },
          ].map((m) => {
            const active = studioMood === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChangeStudioMood?.(m.id)}
                style={{
                  width: "auto",
                  margin: 0,
                  padding: "3px 8px",
                  borderRadius: "7px",
                  fontSize: "10px",
                  fontWeight: 700,
                  background: active ? "rgba(245, 158, 11, 0.28)" : "rgba(30, 41, 59, 0.65)",
                  color: active ? "#fde68a" : "#cbd5e1",
                  border: `1px solid ${active ? "rgba(245, 158, 11, 0.55)" : "rgba(148, 163, 184, 0.18)"}`,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {m.label}
              </button>
            );
          })}

          {standaloneArchitect && (
            <>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "#94a3b8",
                  marginLeft: "4px",
                  paddingLeft: "6px",
                  borderLeft: "1px solid rgba(255,255,255,0.14)",
                  whiteSpace: "nowrap",
                }}
              >
                🪑 Khung ghế khóa:
              </span>
              {[6, 8, 12].map((cnt) => {
                const active = studioSeatCount === cnt;
                return (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => onChangeStudioSeatCount?.(cnt)}
                    style={{
                      width: "auto",
                      margin: 0,
                      padding: "3px 7px",
                      borderRadius: "7px",
                      fontSize: "10px",
                      fontWeight: 700,
                      background: active ? "rgba(56, 189, 248, 0.26)" : "rgba(30, 41, 59, 0.65)",
                      color: active ? "#bae6fd" : "#94a3b8",
                      border: `1px solid ${active ? "rgba(56, 189, 248, 0.5)" : "rgba(148, 163, 184, 0.18)"}`,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                    title={`Kiểm tra khoảng lùi công trình với vòng tròn ${cnt} ghế người chơi (đã khóa cứng)`}
                  >
                    {cnt} ghế
                  </button>
                );
              })}
            </>
          )}

          <button
            type="button"
            onClick={onTogglePropTuner}
            style={{
              width: "auto",
              margin: 0,
              marginLeft: "4px",
              padding: "3px 9px",
              borderRadius: "7px",
              fontSize: "10px",
              fontWeight: 800,
              background: showPropTuner
                ? "rgba(59, 130, 246, 0.85)"
                : loadedGlbCount === totalGlbCount
                  ? "rgba(16, 185, 129, 0.22)"
                  : "rgba(30, 41, 59, 0.75)",
              color: showPropTuner
                ? "#ffffff"
                : loadedGlbCount === totalGlbCount
                  ? "#86efac"
                  : "#fcd34d",
              border: `1px solid ${
                showPropTuner
                  ? "rgba(147, 197, 253, 0.6)"
                  : loadedGlbCount === totalGlbCount
                    ? "rgba(34, 197, 94, 0.45)"
                    : "rgba(245, 158, 11, 0.4)"
              }`,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            title="Mở bảng kiểm tra & căn tâm gốc 12 file .GLB từ Tripo Pro ngay trong Studio"
          >
            🔧 Kho .GLB ({loadedGlbCount}/{totalGlbCount})
          </button>
        </div>

        {/* DÒNG 3: CẢNH BÁO VÙNG CẤM GHẾ NGỒI (NẾU LẤN R < 6.2m) HOẶC THÔNG BÁO TRẠNG THÁI */}
        {(selectedViolating || violatingNodes.length > 0 || statusBanner) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "5px 12px",
              borderRadius: "999px",
              fontSize: "11px",
              fontWeight: 700,
              background:
                selectedViolating || violatingNodes.length > 0
                  ? "rgba(127, 29, 29, 0.92)"
                  : "rgba(6, 78, 59, 0.92)",
              color: "#ffffff",
              border: `1px solid ${
                selectedViolating || violatingNodes.length > 0 ? "#ef4444" : "#34d399"
              }`,
              boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
              pointerEvents: "auto",
              whiteSpace: "nowrap",
            }}
          >
            {selectedViolating ? (
              <>
                <span>⚠️ "{displayNode?.label}" đang lọt vào Vòng Ghế Người Chơi (R &lt; 6.2m)!</span>
                <button
                  type="button"
                  onClick={() => onPushOutsideSeatZone?.(displayNode.id)}
                  style={{
                    width: "auto",
                    margin: 0,
                    padding: "2px 9px",
                    borderRadius: "999px",
                    fontSize: "10.5px",
                    fontWeight: 800,
                    background: "#f59e0b",
                    color: "#0f172a",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  🛡️ Đẩy tự động ra ngoài biên ghế
                </button>
              </>
            ) : violatingNodes.length > 0 ? (
              <>
                <span>⚠️ Có {violatingNodes.length} vật thể đang lấn vào Vòng Ghế (R &lt; 6.2m)</span>
                <button
                  type="button"
                  onClick={onPushAllViolationsOutside}
                  style={{
                    width: "auto",
                    margin: 0,
                    padding: "2px 9px",
                    borderRadius: "999px",
                    fontSize: "10.5px",
                    fontWeight: 800,
                    background: "#f59e0b",
                    color: "#0f172a",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  🛡️ Đẩy tất cả ra biên an toàn
                </button>
              </>
            ) : (
              <span>{statusBanner}</span>
            )}
          </div>
        )}
      </div>

      {/* ==================== 3. THANH GỢI Ý BAY CAMERA D5 GỌN Ở ĐÁY TRÁI ==================== */}
      <div
        style={{
          position: "absolute",
          bottom: "10px",
          left: "10px",
          zIndex: 20,
          padding: "5px 10px",
          borderRadius: "10px",
          fontSize: "10.5px",
          color: "#cbd5e1",
          background: "rgba(9, 14, 28, 0.82)",
          border: "1px solid rgba(148, 163, 184, 0.22)",
          backdropFilter: "blur(8px)",
          pointerEvents: "none",
        }}
      >
        🎥 <b>Camera D5:</b> <b>W·A·S·D</b> bay • <b>E/Q</b> lên/xuống • <b>Shift + Kéo trục</b> = Copy nhân bản • <b>Chuột phải</b> xoay nhìn • <b>Lăn chuột</b> Zoom • <b>F</b> Tới vật chọn
      </div>

      {/* ==================== 4. CỘT INSPECTOR & THƯ VIỆN BÊN PHẢI KIỂU D5 RENDER ==================== */}
      <div
        style={{
          position: "absolute",
          top: "128px",
          right: "10px",
          zIndex: 24,
          width: panelCollapsed ? "auto" : "min(308px, calc(100vw - 20px))",
          maxHeight: "calc(100% - 140px)",
          display: "flex",
          flexDirection: "column",
          background: "rgba(9, 14, 28, 0.92)",
          border: "1px solid rgba(148, 163, 184, 0.28)",
          borderRadius: "14px",
          backdropFilter: "blur(14px)",
          boxShadow: "0 14px 32px rgba(0,0,0,0.62)",
          color: "#e2e8f0",
          fontSize: "11px",
          pointerEvents: "auto",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "7px 10px",
            borderBottom: panelCollapsed ? "none" : "1px solid rgba(148,163,184,0.18)",
            gap: "6px",
          }}
        >
          {!panelCollapsed && (
            <div style={{ display: "flex", gap: "4px", flex: 1 }}>
              {[
                { id: "inspector", label: "📐 Thông số" },
                { id: "library", label: "➕ Thêm mới" },
                { id: "outliner", label: `📑 Lớp (${nodes.length})` },
              ].map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => setRightTab(tb.id)}
                  style={{
                    flex: 1,
                    margin: 0,
                    padding: "4px 5px",
                    borderRadius: "7px",
                    fontSize: "10.5px",
                    fontWeight: 700,
                    background: rightTab === tb.id ? "rgba(245, 158, 11, 0.22)" : "rgba(30, 41, 59, 0.55)",
                    color: rightTab === tb.id ? "#fde68a" : "#94a3b8",
                    border: `1px solid ${rightTab === tb.id ? "rgba(245,158,11,0.45)" : "transparent"}`,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tb.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setPanelCollapsed((c) => !c)}
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
            title={panelCollapsed ? "Mở bảng thông số D5" : "Thu gọn bảng bên phải"}
          >
            {panelCollapsed ? "📐 Mở Bảng D5" : "▸"}
          </button>
        </div>

        {!panelCollapsed && (
          <div style={{ padding: "9px 10px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "9px" }}>
            {/* ---------------- TAB 1: BẢNG THÔNG SỐ X / Y / Z CHÍNH XÁC ---------------- */}
            {rightTab === "inspector" && (
              <>
                {!displayNode ? (
                  <div
                    style={{
                      padding: "14px 10px",
                      textAlign: "center",
                      color: "#94a3b8",
                      background: "rgba(30, 41, 59, 0.42)",
                      borderRadius: "10px",
                      lineHeight: 1.45,
                    }}
                  >
                    👆 <b>Click chuột trái</b> vào bất kỳ Nhà cổ, Tháp chuông, Đài treo cổ, Cột đèn, Hàng rào, Đá hoặc Cây thông nào trên sân để hiện <b>3 mũi tên &amp; nút Scale 3 chiều</b>!
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        background: "rgba(30, 41, 59, 0.6)",
                        borderRadius: "9px",
                        padding: "7px 9px",
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
                        <strong style={{ color: "#fde68a", fontSize: "11.5px" }}>{displayNode.label}</strong>
                        <button
                          type="button"
                          onClick={onFocusSelected}
                          style={{
                            width: "auto",
                            margin: 0,
                            padding: "2px 7px",
                            borderRadius: "5px",
                            fontSize: "10px",
                            background: "rgba(59, 130, 246, 0.22)",
                            color: "#93c5fd",
                            border: "1px solid rgba(59, 130, 246, 0.35)",
                            cursor: "pointer",
                          }}
                        >
                          🎯 Tới (F)
                        </button>
                      </div>
                      <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "3px" }}>
                        Cách tâm lửa:{" "}
                        <b style={{ color: selectedViolating ? "#fca5a5" : "#cbd5e1" }}>
                          {Math.hypot(displayNode.position[0], displayNode.position[2]).toFixed(2)}m
                        </b>{" "}
                        {displayNode.allowCenterZone ? "(Cho phép ở tâm)" : `(An toàn >= ${NO_BUILD_SEAT_RADIUS}m)`}
                      </div>
                    </div>

                    {/* VỊ TRÍ X / Y / Z (Mét) */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontWeight: 700, color: "#cbd5e1" }}>
                        <span>✥ Vị trí Position (m)</span>
                        <span
                          onClick={onDropToGround}
                          style={{ color: "#38bdf8", cursor: "pointer", fontSize: "10px" }}
                        >
                          ⚓ Đặt Y=0
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "5px" }}>
                        {[
                          { label: "X", idx: 0, color: "#f87171" },
                          { label: "Y", idx: 1, color: "#4ade80" },
                          { label: "Z", idx: 2, color: "#60a5fa" },
                        ].map((ax) => (
                          <label key={ax.label} style={{ display: "flex", alignItems: "center", gap: "3px", background: "rgba(15,23,42,0.85)", border: "1px solid rgba(148,163,184,0.22)", borderRadius: "6px", padding: "3px 5px" }}>
                            <span style={{ color: ax.color, fontWeight: 800, fontSize: "10.5px" }}>{ax.label}</span>
                            <input
                              type="number"
                              step="0.1"
                              value={Number(displayNode.position[ax.idx] ?? 0).toFixed(2)}
                              onChange={(e) => handleNumericAxisChange("position", ax.idx, e.target.value)}
                              style={{
                                width: "100%",
                                margin: 0,
                                padding: "1px 2px",
                                background: "transparent",
                                border: "none",
                                color: "#f8fafc",
                                fontSize: "11px",
                                outline: "none",
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* GÓC XOAY X / Y / Z (Độ) */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontWeight: 700, color: "#cbd5e1" }}>
                        <span>↻ Góc xoay Rotation (°)</span>
                        <span
                          onClick={() =>
                            onUpdateNodeFields(selectedNode.id, {
                              rotation: [
                                0,
                                round3((selectedNode.rotation[1] || 0) + Math.PI / 4),
                                0,
                              ],
                            })
                          }
                          style={{ color: "#6ee7b7", cursor: "pointer", fontSize: "10px" }}
                        >
                          ↻ +45°
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "5px" }}>
                        {[
                          { label: "X", idx: 0, color: "#f87171" },
                          { label: "Y", idx: 1, color: "#4ade80" },
                          { label: "Z", idx: 2, color: "#60a5fa" },
                        ].map((ax) => (
                          <label key={ax.label} style={{ display: "flex", alignItems: "center", gap: "3px", background: "rgba(15,23,42,0.85)", border: "1px solid rgba(148,163,184,0.22)", borderRadius: "6px", padding: "3px 5px" }}>
                            <span style={{ color: ax.color, fontWeight: 800, fontSize: "10.5px" }}>{ax.label}</span>
                            <input
                              type="number"
                              step="5"
                              value={Math.round((displayNode.rotation[ax.idx] ?? 0) * RAD2DEG)}
                              onChange={(e) => handleNumericAxisChange("rotation", ax.idx, e.target.value, true)}
                              style={{
                                width: "100%",
                                margin: 0,
                                padding: "1px 2px",
                                background: "transparent",
                                border: "none",
                                color: "#f8fafc",
                                fontSize: "11px",
                                outline: "none",
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* SCALE TO NHỎ RIÊNG TỪNG CHIỀU X / Y / Z + ĐỒNG BỘ */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", fontWeight: 700, color: "#cbd5e1" }}>
                        <span>⤢ Scale 3 Chiều (Rộng·Cao·Sâu)</span>
                        <span
                          onClick={() => setUniformScaleLock((v) => !v)}
                          style={{
                            color: uniformScaleLock ? "#d8b4fe" : "#86efac",
                            cursor: "pointer",
                            fontSize: "10px",
                          }}
                        >
                          {uniformScaleLock ? "🔒 Đều XYZ" : "🔓 Riêng 3 trục"}
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "5px" }}>
                        {[
                          { label: "X", idx: 0, color: "#f87171", tip: "Chiều Rộng ngang" },
                          { label: "Y", idx: 1, color: "#4ade80", tip: "Chiều Cao từ đất lên" },
                          { label: "Z", idx: 2, color: "#60a5fa", tip: "Chiều Sâu trước-sau" },
                        ].map((ax) => (
                          <label
                            key={ax.label}
                            title={ax.tip}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "3px",
                              background: "rgba(15,23,42,0.85)",
                              border: "1px solid rgba(148,163,184,0.22)",
                              borderRadius: "6px",
                              padding: "3px 5px",
                            }}
                          >
                            <span style={{ color: ax.color, fontWeight: 800, fontSize: "10.5px" }}>{ax.label}</span>
                            <input
                              type="number"
                              step="0.05"
                              min="0.1"
                              max="12"
                              value={Number(displayNode.scale[ax.idx] ?? 1).toFixed(2)}
                              onChange={(e) => handleNumericAxisChange("scale", ax.idx, e.target.value)}
                              style={{
                                width: "100%",
                                margin: 0,
                                padding: "1px 2px",
                                background: "transparent",
                                border: "none",
                                color: "#f8fafc",
                                fontSize: "11px",
                                outline: "none",
                              }}
                            />
                          </label>
                        ))}
                      </div>

                      {/* Thanh trượt phóng to/thu nhỏ đều cả 3 chiều tiện lợi */}
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
                        <span style={{ fontSize: "10px", color: "#94a3b8", whiteSpace: "nowrap" }}>Đều XYZ:</span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateNodeFields(selectedNode.id, {
                              scale: displayNode.scale.map((s) => clampScale(s * 0.9)),
                            })
                          }
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
                          -10%
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateNodeFields(selectedNode.id, {
                              scale: [1, 1, 1],
                            })
                          }
                          style={{
                            width: "auto",
                            margin: 0,
                            padding: "2px 7px",
                            fontSize: "10px",
                            borderRadius: "5px",
                            background: "rgba(255,255,255,0.06)",
                            color: "#cbd5e1",
                            border: "1px solid rgba(255,255,255,0.14)",
                            cursor: "pointer",
                          }}
                        >
                          1.0x
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateNodeFields(selectedNode.id, {
                              scale: displayNode.scale.map((s) => clampScale(s * 1.1)),
                            })
                          }
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
                          +10%
                        </button>
                      </div>
                    </div>

                    {/* CỜ KIẾN TRÚC BỀ MẶT SÂN ĐÁ & VÙNG TÂM GHẾ */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "5px",
                        padding: "7px 8px",
                        borderRadius: "8px",
                        background: "rgba(15, 23, 42, 0.72)",
                        border: "1px solid rgba(148, 163, 184, 0.2)",
                      }}
                    >
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8" }}>
                        🛡️ Quyền đặt Tâm Sân &amp; Khóa Nền:
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateNodeFields(selectedNode.id, {
                            allowCenterZone: !displayNode.allowCenterZone,
                          })
                        }
                        style={{
                          width: "100%",
                          margin: 0,
                          padding: "4px 8px",
                          borderRadius: "6px",
                          fontSize: "10px",
                          fontWeight: 700,
                          textAlign: "left",
                          background: displayNode.allowCenterZone
                            ? "rgba(16, 185, 129, 0.24)"
                            : "rgba(30, 41, 59, 0.65)",
                          color: displayNode.allowCenterZone ? "#86efac" : "#cbd5e1",
                          border: `1px solid ${
                            displayNode.allowCenterZone
                              ? "rgba(52, 211, 153, 0.48)"
                              : "rgba(148, 163, 184, 0.2)"
                          }`,
                          cursor: "pointer",
                        }}
                        title="Bật cho các nền sân đá / thảm / tiểu cảnh tâm để cho phép đặt bên trong vòng ghế R < 6.2m"
                      >
                        {displayNode.allowCenterZone
                          ? "✅ Cho phép đặt ở vùng tâm ghế (R < 6.2m)"
                          : "⭕ Cấm lấn vùng ghế (Bấm để mở khóa tâm)"}
                      </button>

                      <button
                        type="button"
                        disabled={displayNode.type === "plaza_cobblestone"}
                        onClick={() =>
                          onUpdateNodeFields(selectedNode.id, {
                            lockClick: !displayNode.lockClick,
                          })
                        }
                        style={{
                          width: "100%",
                          margin: 0,
                          padding: "4px 8px",
                          borderRadius: "6px",
                          fontSize: "10px",
                          fontWeight: 700,
                          textAlign: "left",
                          background:
                            displayNode.lockClick || displayNode.type === "plaza_cobblestone"
                              ? "rgba(56, 189, 248, 0.24)"
                              : "rgba(30, 41, 59, 0.65)",
                          color:
                            displayNode.lockClick || displayNode.type === "plaza_cobblestone"
                              ? "#bae6fd"
                              : "#cbd5e1",
                          border: `1px solid ${
                            displayNode.lockClick || displayNode.type === "plaza_cobblestone"
                              ? "rgba(56, 189, 248, 0.48)"
                              : "rgba(148, 163, 184, 0.2)"
                          }`,
                          cursor: displayNode.type === "plaza_cobblestone" ? "default" : "pointer",
                        }}
                        title="Khi khóa làm Nền, chuột sẽ click xuyên qua mặt sàn lớn này để dễ chọn cây/nhà bên trên. Bạn luôn chọn lại nền này được ở Tab 📑 Lớp!"
                      >
                        {displayNode.lockClick || displayNode.type === "plaza_cobblestone"
                          ? "🔒 Đang khóa làm Nền (Click xuyên — Chọn lại ở Tab 📑 Lớp)"
                          : "🪨 Khóa làm Nền Sân (Click xuyên qua)"}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ---------------- TAB 2: THƯ VIỆN THẢ THÊM VẬT THỂ RA SÂN (GỒM CẢ KHO CONCEPT MỚI!) ---------------- */}
            {rightTab === "library" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "10px", color: "#cbd5e1", fontWeight: 700 }}>
                    📦 Kho Model ({filteredLibraryItems.length} mẫu)
                  </span>
                  <button
                    type="button"
                    disabled={syncingTripoConcepts}
                    onClick={onSyncTripoConcepts}
                    style={{
                      width: "auto",
                      margin: 0,
                      padding: "3px 8px",
                      borderRadius: "6px",
                      fontSize: "10px",
                      fontWeight: 800,
                      background: "rgba(168, 85, 247, 0.25)",
                      color: "#e9d5ff",
                      border: "1px solid rgba(192, 132, 252, 0.45)",
                      cursor: syncingTripoConcepts ? "wait" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                    title="Quét thư mục MODEL CONCEPT THEM để nạp thêm file .GLB mới mà không cần khởi động lại Server"
                  >
                    {syncingTripoConcepts ? "⏳ Đang quét..." : "🔄 Quét Kho Tripo"}
                  </button>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {EXTERIOR_CATEGORIES.map((cat) => {
                    const active = libraryFilter === cat.id;
                    const isConceptTab = cat.id === "concepts";
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setLibraryFilter(cat.id)}
                        style={{
                          width: "auto",
                          margin: 0,
                          padding: "2px 6px",
                          borderRadius: "6px",
                          fontSize: "10px",
                          fontWeight: isConceptTab ? 800 : 600,
                          background: active
                            ? isConceptTab
                              ? "rgba(168, 85, 247, 0.35)"
                              : "rgba(59, 130, 246, 0.28)"
                            : "rgba(30, 41, 59, 0.55)",
                          color: active
                            ? isConceptTab
                              ? "#f3e8ff"
                              : "#bfdbfe"
                            : isConceptTab
                              ? "#d8b4fe"
                              : "#94a3b8",
                          border: `1px solid ${
                            active ? "rgba(192, 132, 252, 0.5)" : "rgba(148,163,184,0.18)"
                          }`,
                          cursor: "pointer",
                        }}
                      >
                        {cat.label}
                        {isConceptTab ? ` (${conceptCount})` : ""}
                      </button>
                    );
                  })}
                </div>

                <input
                  type="text"
                  placeholder="🔍 Lọc tên model / concept..."
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  style={{
                    width: "100%",
                    margin: 0,
                    padding: "4px 8px",
                    borderRadius: "7px",
                    fontSize: "10.5px",
                    background: "rgba(15, 23, 42, 0.85)",
                    border: "1px solid rgba(148, 163, 184, 0.22)",
                    color: "#f8fafc",
                  }}
                />

                <div style={{ maxHeight: "260px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "5px" }}>
                  {filteredLibraryItems.length === 0 ? (
                    <div
                      style={{
                        padding: "12px 8px",
                        textAlign: "center",
                        color: "#94a3b8",
                        background: "rgba(30, 41, 59, 0.38)",
                        borderRadius: "8px",
                        fontSize: "10.5px",
                      }}
                    >
                      Chưa có model khớp bộ lọc. Bạn có thể chép file <code>.GLB</code> vào thư mục{" "}
                      <b>MODEL CONCEPT THEM</b> rồi bấm <b>🔄 Quét Kho Tripo</b>!
                    </div>
                  ) : (
                    filteredLibraryItems.map((item) => {
                      const dims = Array.isArray(item.hitBoxSize)
                        ? `${item.hitBoxSize[0]}×${item.hitBoxSize[1]}m`
                        : item.hitHeight
                          ? `Cao ${item.hitHeight}m`
                          : "";
                      return (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => {
                            onSpawnAssetType?.(item.type);
                            setRightTab("inspector");
                          }}
                          style={{
                            width: "100%",
                            margin: 0,
                            padding: "6px 9px",
                            borderRadius: "8px",
                            fontSize: "11px",
                            fontWeight: 600,
                            textAlign: "left",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "6px",
                            background: item.isConcept
                              ? "rgba(88, 28, 135, 0.28)"
                              : "rgba(30, 41, 59, 0.65)",
                            color: "#f1f5f9",
                            border: `1px solid ${
                              item.isConcept
                                ? "rgba(192, 132, 252, 0.42)"
                                : "rgba(148, 163, 184, 0.2)"
                            }`,
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.label}
                            </span>
                            {(item.isConcept || dims) && (
                              <span style={{ fontSize: "9.5px", color: item.isConcept ? "#d8b4fe" : "#94a3b8" }}>
                                {item.isConcept ? `🌟 Concept • ${item.sizeMB} MB` : ""}
                                {item.isConcept && dims ? " • " : ""}
                                {dims}
                                {item.allowCenterZone ? " • Tâm sân" : ""}
                              </span>
                            )}
                          </div>
                          <span style={{ color: "#fbbf24", fontWeight: 800, whiteSpace: "nowrap" }}>＋ Đặt</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ---------------- TAB 3: DANH SÁCH LỚP SCENE OUTLINER ---------------- */}
            {rightTab === "outliner" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {EXTERIOR_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryFilter(cat.id)}
                      style={{
                        width: "auto",
                        margin: 0,
                        padding: "2px 6px",
                        borderRadius: "6px",
                        fontSize: "10px",
                        background:
                          categoryFilter === cat.id ? "rgba(59, 130, 246, 0.28)" : "rgba(30, 41, 59, 0.55)",
                        color: categoryFilter === cat.id ? "#bfdbfe" : "#94a3b8",
                        border: "1px solid rgba(148,163,184,0.18)",
                        cursor: "pointer",
                      }}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="🔍 Tìm nhà, cây, nền đá..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    margin: 0,
                    padding: "4px 8px",
                    borderRadius: "7px",
                    fontSize: "11px",
                    background: "rgba(15, 23, 42, 0.85)",
                    border: "1px solid rgba(148, 163, 184, 0.22)",
                    color: "#f8fafc",
                  }}
                />

                <div style={{ maxHeight: "230px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "3px" }}>
                  {filteredOutlinerNodes.map((n) => {
                    const isSel = selectedNode?.id === n.id;
                    const bad = isNodeViolatingSeatZone(n);
                    const isLockedSurface = Boolean(n.lockClick || n.type === "plaza_cobblestone");
                    const isConceptNode = Boolean(EXTERIOR_ASSET_CATALOG[n.type]?.isConcept);
                    return (
                      <div
                        key={n.id}
                        onClick={() => onSelectNodeId(n.id)}
                        style={{
                          padding: "4px 7px",
                          borderRadius: "6px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "4px",
                          cursor: "pointer",
                          background: isSel
                            ? "rgba(245, 158, 11, 0.24)"
                            : bad
                              ? "rgba(239, 68, 68, 0.16)"
                              : "rgba(30, 41, 59, 0.45)",
                          border: `1px solid ${
                            isSel ? "rgba(245, 158, 11, 0.5)" : "transparent"
                          }`,
                          fontSize: "10.5px",
                        }}
                      >
                        <span
                          style={{
                            color: isSel ? "#fde68a" : "#e2e8f0",
                            fontWeight: isSel ? 700 : 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {bad ? "⚠️ " : ""}
                          {isLockedSurface ? "🔒 " : ""}
                          {isConceptNode ? "🌟 " : ""}
                          {n.label}
                        </span>
                        <span style={{ color: "#64748b", fontSize: "9.5px", whiteSpace: "nowrap" }}>
                          {n.position[0].toFixed(1)}, {n.position[2].toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ---------------- CHÂN BẢNG: XUẤT / NHẬP JSON & KHÔI PHỤC GỐC ---------------- */}
            <div
              style={{
                borderTop: "1px solid rgba(148,163,184,0.16)",
                paddingTop: "7px",
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
              }}
            >
              <button
                type="button"
                onClick={onExportJson}
                style={{
                  flex: 1,
                  margin: 0,
                  padding: "4px 6px",
                  borderRadius: "6px",
                  fontSize: "10px",
                  background: "rgba(30, 41, 59, 0.7)",
                  color: "#cbd5e1",
                  border: "1px solid rgba(148,163,184,0.2)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                📤 Xuất .JSON
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: 1,
                  margin: 0,
                  padding: "4px 6px",
                  borderRadius: "6px",
                  fontSize: "10px",
                  background: "rgba(30, 41, 59, 0.7)",
                  color: "#cbd5e1",
                  border: "1px solid rgba(148,163,184,0.2)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                📥 Nhập .JSON
              </button>
              <button
                type="button"
                onClick={onResetDefaultLayout}
                style={{
                  width: "100%",
                  margin: 0,
                  padding: "4px 6px",
                  borderRadius: "6px",
                  fontSize: "10px",
                  background: "rgba(239, 68, 68, 0.12)",
                  color: "#fca5a5",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  cursor: "pointer",
                }}
              >
                ↺ Khôi phục bố cục mặc định ban đầu
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImportJsonFile?.(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
