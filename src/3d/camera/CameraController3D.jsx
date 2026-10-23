import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

function isTypingInField(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Hệ thống Camera 3D Kép (Tách biệt tuyệt đối Người Chơi Thật vs Dev D5 Studio):
 * - Người chơi thật (!architectMode): Giữ nguyên 100% Camera Gameplay ('shoulder' qua vai phải 360° & 'overview' toàn vòng ghế, khóa Pan).
 * - Dev Setup (architectMode = true): Mở khóa Camera Kiến Trúc Sư kiểu D5 Render:
 *   + Orbit xoay 360° + Pan trượt mặt đất phẳng + Lăn chuột Zoom xa 1m..72m
 *   + Bay tự do bằng W/A/S/D (Tiến/Trái/Lùi/Phải) + E/Q (Lên/Xuống) + Shift (Bay nhanh 2.6x)
 *   + Phím F hội tụ ống kính vào vật thể đang chọn
 *   + Tự động ngắt xoay ống kính (enabled=false) ngay khoảnh khắc chuột cầm vào mũi tên Gizmo!
 */
export default function CameraController3D({
  cameraMode = "shoulder",
  mySeatTransform,
  circleRadius = 3.8,
  resetCounter = 0,
  architectMode = false,
  isGizmoDragging = false,
  focusRequest = null,
  cameraStateRef = null,
}) {
  const controlsRef = useRef(null);
  const { camera } = useThree();
  const keysHeldRef = useRef({});
  const forwardVec = useRef(new THREE.Vector3());
  const rightVec = useRef(new THREE.Vector3());
  const moveDelta = useRef(new THREE.Vector3());

  // Trạng thái nội suy mượt khi chuyển chế độ góc máy (~0.6s rồi trả toàn quyền điều khiển tay)
  const transitionRef = useRef({
    active: true,
    elapsed: 0,
    duration: 0.65,
    goalPos: new THREE.Vector3(0, 2.2, 6),
    goalTarget: new THREE.Vector3(0, 1.2, 0),
  });

  // Lắng nghe phím bay WASD / QE chỉ khi Dev bật chế độ D5 Architect
  useEffect(() => {
    if (!architectMode) {
      keysHeldRef.current = {};
      return undefined;
    }

    const handleKeyDown = (e) => {
      if (isTypingInField(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "w" || k === "a" || k === "s" || k === "d" || k === "q" || k === "e") {
        keysHeldRef.current[k] = true;
        transitionRef.current.active = false;
      }
      if (e.key === "Shift") {
        keysHeldRef.current.shift = true;
      }
    };

    const handleKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k in keysHeldRef.current) keysHeldRef.current[k] = false;
      if (e.key === "Shift") keysHeldRef.current.shift = false;
    };

    const handleBlur = () => {
      keysHeldRef.current = {};
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      keysHeldRef.current = {};
    };
  }, [architectMode]);

  const prevArchitectModeRef = useRef(false);

  // Chuyển cảnh khi đổi chế độ Gameplay / Bật tắt D5 Architect
  useEffect(() => {
    if (architectMode) {
      if (!prevArchitectModeRef.current) {
        prevArchitectModeRef.current = true;
        transitionRef.current = {
          active: true,
          elapsed: 0,
          duration: 0.65,
          goalPos: new THREE.Vector3(0, 11.8, circleRadius + 15.5),
          goalTarget: new THREE.Vector3(0, 1.0, -1.2),
        };
      }
      return;
    }
    prevArchitectModeRef.current = false;

    const seat = mySeatTransform || { x: 0, z: circleRadius };
    const dist = Math.hypot(seat.x, seat.z) || 1;
    const ux = seat.x / dist;
    const uz = seat.z / dist;
    const rx = uz;
    const rz = -ux;

    if (cameraMode === "overview") {
      const camDist = circleRadius + 3.5;
      transitionRef.current = {
        active: true,
        elapsed: 0,
        duration: 0.6,
        goalPos: new THREE.Vector3(ux * camDist, 5.3, uz * camDist),
        goalTarget: new THREE.Vector3(0, 0.75, 0),
      };
    } else {
      const targetX = seat.x + rx * 0.28 - ux * 0.18;
      const targetY = 1.26;
      const targetZ = seat.z + rz * 0.28 - uz * 0.18;

      const camX = seat.x + ux * 1.85 + rx * 0.48;
      const camY = 1.78;
      const camZ = seat.z + uz * 1.85 + rz * 0.48;

      transitionRef.current = {
        active: true,
        elapsed: 0,
        duration: 0.6,
        goalPos: new THREE.Vector3(camX, camY, camZ),
        goalTarget: new THREE.Vector3(targetX, targetY, targetZ),
      };
    }
  }, [architectMode, cameraMode, mySeatTransform?.x, mySeatTransform?.z, circleRadius, resetCounter]);

  // Phím F trong D5 Studio: Hội tụ mượt ống kính vào đúng vật thể đang chọn
  useEffect(() => {
    if (!architectMode || !focusRequest?.position) return;
    const [fx, fy, fz] = focusRequest.position;
    const target = new THREE.Vector3(fx, Math.max(0.8, fy + 1.2), fz);
    const offset = camera.position.clone().sub(controlsRef.current?.target || target);
    if (offset.lengthSq() < 1) offset.set(6, 5.5, 8);
    offset.normalize().multiplyScalar(10.5);
    const nextPos = target.clone().add(offset);
    nextPos.y = Math.max(2.6, nextPos.y);

    transitionRef.current = {
      active: true,
      elapsed: 0,
      duration: 0.5,
      goalPos: nextPos,
      goalTarget: target,
    };
  }, [architectMode, focusRequest?.counter]);

  useFrame((_, delta) => {
    const tr = transitionRef.current;
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    if (tr.active) {
      tr.elapsed += delta;
      const alpha = Math.min(1, delta * 7.5);
      camera.position.lerp(tr.goalPos, alpha);
      ctrl.target.lerp(tr.goalTarget, alpha);
      ctrl.update();

      if (
        tr.elapsed >= tr.duration ||
        (camera.position.distanceTo(tr.goalPos) < 0.05 &&
          ctrl.target.distanceTo(tr.goalTarget) < 0.05)
      ) {
        tr.active = false;
      }
    } else if (architectMode && !isGizmoDragging) {
      // Điều khiển bay WASD + E/Q mượt 60 FPS kiểu D5 Render
      const keys = keysHeldRef.current;
      const fwd = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
      const strafe = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      const vert = (keys.e ? 1 : 0) - (keys.q ? 1 : 0);

      if (fwd !== 0 || strafe !== 0 || vert !== 0) {
        const speed = (keys.shift ? 26.0 : 10.5) * Math.min(delta, 0.05);
        camera.getWorldDirection(forwardVec.current);
        forwardVec.current.y = 0;
        if (forwardVec.current.lengthSq() < 0.0001) {
          forwardVec.current.set(0, 0, -1);
        } else {
          forwardVec.current.normalize();
        }
        rightVec.current.crossVectors(forwardVec.current, camera.up).normalize();

        moveDelta.current.set(0, 0, 0);
        moveDelta.current.addScaledVector(forwardVec.current, fwd * speed);
        moveDelta.current.addScaledVector(rightVec.current, strafe * speed);
        moveDelta.current.y += vert * speed * 0.85;

        camera.position.add(moveDelta.current);
        ctrl.target.add(moveDelta.current);
        if (ctrl.target.y < 0.1) ctrl.target.y = 0.1;
        ctrl.update();
      }
    }

    // Khóa an toàn cứng: Không bao giờ cho ống kính chui xuống dưới mặt sàn làng (y >= 0.35m)
    if (camera.position.y < 0.35) {
      camera.position.y = 0.35;
    }

    // Xuất vị trí & tâm nhìn hiện tại cho tính năng "Thả đạo cụ mới trước mặt Camera"
    if (cameraStateRef) {
      cameraStateRef.current = {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [ctrl.target.x, ctrl.target.y, ctrl.target.z],
      };
    }
  });

  const stopAutoGlide = () => {
    if (transitionRef.current.active) {
      transitionRef.current.active = false;
    }
  };

  if (architectMode) {
    return (
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={!isGizmoDragging}
        enablePan
        screenSpacePanning={false}
        enableDamping
        dampingFactor={0.09}
        rotateSpeed={0.78}
        panSpeed={0.95}
        zoomSpeed={1.05}
        minDistance={1.0}
        maxDistance={72}
        minPolarAngle={0.08}
        maxPolarAngle={Math.PI / 2 - 0.02}
        onStart={stopAutoGlide}
      />
    );
  }

  // CHẾ ĐỘ NGƯỜI CHƠI THẬT: Giữ nguyên 100% Camera Gameplay gốc!
  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.75}
      zoomSpeed={0.85}
      minDistance={cameraMode === "overview" ? 3.2 : 1.25}
      maxDistance={cameraMode === "overview" ? circleRadius + 5.8 : 4.2}
      minPolarAngle={0.22}
      maxPolarAngle={Math.PI / 2 - 0.05}
      onStart={stopAutoGlide}
    />
  );
}
