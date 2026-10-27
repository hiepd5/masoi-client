import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

function isTypingInField(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function easeInOutCubic(x) {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Hệ thống Camera 3D Đạo Diễn Điện Ảnh & Gameplay Kép:
 * - Trong trận (!hasWinner): Giữ nguyên góc 'shoulder' qua vai cá nhân & 'overview' toàn vòng ghế.
 * - Phim Kể Chuyện Cuối Ván (recapShot):
 *   + VAI CÁ NHÂN (`actor_pov` & `actor_portrait`): Đến lượt ai lập tức lướt Dolly êm ái (Cubic Ease-In-Out 1.45s) về đứng sát sau vai phải người đó (`y = 1.74m`, lệch vai `0.58m` né lửa trại) nhìn thẳng sang mục tiêu, hoặc cận chân dung nghiêng 32° khi độc thoại/biện hộ/biến hình!
 *   + HÀNH ĐỘNG TẬP THỂ (`high_pack_hunt` & `high_tribunal` / `orbit_reveal`): CHỈ mở rộng khung hình bay vút lên cao (`y = 4.95m – 5.3m`) khi cả Đàn Sói lao ra cắn hoặc Cả Làng chỉ tay Vote / Phán quyết pháp trường!
 * - Dev Setup (architectMode = true): Bay tự do WASD/QE + Orbit/Pan D5 Studio.
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
  recapShot = null,
  onRecapManualOrbit = null,
  seatMap = {},
}) {
  const controlsRef = useRef(null);
  const { camera } = useThree();
  const keysHeldRef = useRef({});
  const forwardVec = useRef(new THREE.Vector3());
  const rightVec = useRef(new THREE.Vector3());
  const moveDelta = useRef(new THREE.Vector3());
  const orbitStoppedByUserRef = useRef(false);
  const shakeRef = useRef({ strength: 0, elapsed: 0, duration: 0.48 });

  const transitionRef = useRef({
    active: true,
    useCubicDolly: false,
    elapsed: 0,
    duration: 0.65,
    startPos: new THREE.Vector3(0, 2.2, 6),
    startTarget: new THREE.Vector3(0, 1.2, 0),
    goalPos: new THREE.Vector3(0, 2.2, 6),
    goalTarget: new THREE.Vector3(0, 1.2, 0),
    baseGoalPos: new THREE.Vector3(0, 2.2, 6),
  });

  function beginTransition(goalPos, goalTarget, duration = 0.65, useCubicDolly = false) {
    const ctrl = controlsRef.current;
    transitionRef.current = {
      active: true,
      useCubicDolly,
      elapsed: 0,
      duration,
      startPos: camera.position.clone(),
      startTarget: ctrl ? ctrl.target.clone() : goalTarget.clone(),
      goalPos: goalPos.clone(),
      goalTarget: goalTarget.clone(),
      baseGoalPos: goalPos.clone(),
    };
  }

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

  // Chuyển cảnh khi đổi chế độ Gameplay / Bật tắt D5 Architect (Bỏ qua nếu đang chiếu phim Recap)
  useEffect(() => {
    if (architectMode) {
      if (!prevArchitectModeRef.current) {
        prevArchitectModeRef.current = true;
        beginTransition(
          new THREE.Vector3(0, 11.8, circleRadius + 15.5),
          new THREE.Vector3(0, 1.0, -1.2),
          0.65,
          false
        );
      }
      return;
    }
    prevArchitectModeRef.current = false;

    if (recapShot?.shotKey) return;

    const seat = mySeatTransform || { x: 0, z: circleRadius };
    const dist = Math.hypot(seat.x, seat.z) || 1;
    const ux = seat.x / dist;
    const uz = seat.z / dist;
    const rx = uz;
    const rz = -ux;

    if (cameraMode === "overview") {
      const camDist = circleRadius + 3.5;
      beginTransition(
        new THREE.Vector3(ux * camDist, 5.3, uz * camDist),
        new THREE.Vector3(0, 0.75, 0),
        0.6,
        false
      );
    } else {
      const targetX = seat.x + rx * 0.28 - ux * 0.18;
      const targetY = 1.26;
      const targetZ = seat.z + rz * 0.28 - uz * 0.18;

      const camX = seat.x + ux * 1.85 + rx * 0.48;
      const camY = 1.78;
      const camZ = seat.z + uz * 1.85 + rz * 0.48;

      beginTransition(
        new THREE.Vector3(camX, camY, camZ),
        new THREE.Vector3(targetX, targetY, targetZ),
        0.6,
        false
      );
    }
  }, [
    architectMode,
    cameraMode,
    mySeatTransform?.x,
    mySeatTransform?.z,
    circleRadius,
    resetCounter,
    Boolean(recapShot?.shotKey),
  ]);

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

    beginTransition(nextPos, target, 0.5, false);
  }, [architectMode, focusRequest?.counter]);

  // ==================== ĐẠO DIỄN GÓC MÁY PHIM KỂ CHUYỆN CHUYÊN NGHIỆP ====================
  useEffect(() => {
    if (architectMode || !recapShot?.shotKey) return;

    let shakeTimer = null;
    if (recapShot.shakeStrength && recapShot.shakeStrength > 0) {
      const delayMs = recapShot.shakeDelayMs || 0;
      if (delayMs > 0) {
        shakeTimer = setTimeout(() => {
          shakeRef.current = {
            strength: recapShot.shakeStrength,
            elapsed: 0,
            duration: 0.48,
          };
        }, delayMs);
      } else {
        shakeRef.current = {
          strength: recapShot.shakeStrength,
          elapsed: 0,
          duration: 0.48,
        };
      }
    }

    if (recapShot.followDirector === false) {
      orbitStoppedByUserRef.current = true;
      return () => {
        if (shakeTimer) clearTimeout(shakeTimer);
      };
    }

    orbitStoppedByUserRef.current = false;

    const sSeat = recapShot.sourceId ? seatMap[recapShot.sourceId] : null;
    const tSeat = recapShot.targetId ? seatMap[recapShot.targetId] : null;
    const dollySpeedScale = recapShot.dollySpeedScale || 1;

    // 1. GÓC QUA VAI CÁ NHÂN NHÌN SANG MỤC TIÊU (`actor_pov` — Bảo Vệ, từng Sói rình/thì thầm, Phù Thủy, Tiên Tri, Cá nhân chỉ tay)
    if (recapShot.shotType === "actor_pov" && sSeat && tSeat && sSeat !== tSeat) {
      const dx = tSeat.x - sSeat.x;
      const dz = tSeat.z - sSeat.z;
      const dLen = Math.hypot(dx, dz) || 1;
      const fx = dx / dLen;
      const fz = dz / dLen;
      // Vector sang vai phải của người đang hành động (vuông góc hướng nhìn) -> né hoàn toàn lửa trại ở giữa sân!
      const rx = -fz;
      const rz = fx;

      const goalPos = new THREE.Vector3(
        sSeat.x - fx * 1.44 + rx * 0.58,
        1.74,
        sSeat.z - fz * 1.44 + rz * 0.58
      );
      // Điểm ngắm hội tụ 82% về ngực-mặt mục tiêu + 18% vai người hành động (Bố cục 1/3 điện ảnh chuẩn!)
      const goalTarget = new THREE.Vector3(
        sSeat.x * 0.18 + tSeat.x * 0.82,
        1.16,
        sSeat.z * 0.18 + tSeat.z * 0.82
      );

      beginTransition(goalPos, goalTarget, 1.45 / dollySpeedScale, true);
      return () => {
        if (shakeTimer) clearTimeout(shakeTimer);
      };
    }

    // 2. GÓC CHÂN DUNG CÁ NHÂN (`actor_portrait` / `focus_seat` — Dân phát biểu, Bị cáo biện hộ, Kẻ Bị Nguyền hóa Sói, Tráng Sĩ gồng máu, MVP)
    const portraitSeat = tSeat || sSeat;
    if ((recapShot.shotType === "actor_portrait" || recapShot.shotType === "focus_seat" || (recapShot.shotType === "actor_pov" && portraitSeat)) && portraitSeat) {
      const len = Math.hypot(portraitSeat.x, portraitSeat.z) || 1;
      const outX = portraitSeat.x / len;
      const outZ = portraitSeat.z / len;
      const sideX = -outZ;
      const sideZ = outX;

      // Đặt máy phía trước ngực nhân vật 2.15m, nghiêng 32 độ để thấy chiều sâu gương mặt & bóng thoại
      const goalPos = new THREE.Vector3(
        portraitSeat.x - outX * 2.15 + sideX * 0.82,
        recapShot.isMvp ? 1.82 : 1.58,
        portraitSeat.z - outZ * 2.15 + sideZ * 0.82
      );
      // Tránh không để ống kính lọt vào giữa ngọn lửa trại trung tâm (R < 1.35m)
      if (Math.hypot(goalPos.x, goalPos.z) < 1.35) {
        goalPos.x += sideX * 1.05;
        goalPos.z += sideZ * 1.05;
      }

      const goalTarget = new THREE.Vector3(portraitSeat.x, 1.22, portraitSeat.z);
      beginTransition(goalPos, goalTarget, 1.42 / dollySpeedScale, true);
      return () => {
        if (shakeTimer) clearTimeout(shakeTimer);
      };
    }

    // 3. ĐẠI CẢNH MỞ RỘNG LÊN CAO KHI ĐÀN SÓI CÙNG VỒ CẮN (`high_pack_hunt`)
    if ((recapShot.shotType === "high_pack_hunt" || recapShot.shotType === "clash_pair") && tSeat) {
      const midX = sSeat ? (sSeat.x + tSeat.x) * 0.5 : tSeat.x * 0.5;
      const midZ = sSeat ? (sSeat.z + tSeat.z) * 0.5 : tSeat.z * 0.5;
      let perpX = sSeat ? -(tSeat.z - sSeat.z) : -tSeat.z;
      let perpZ = sSeat ? tSeat.x - sSeat.x : tSeat.x;
      const pLen = Math.hypot(perpX, perpZ) || 1;
      perpX /= pLen;
      perpZ /= pLen;

      const camDist = circleRadius + 2.75;
      const goalPos = new THREE.Vector3(perpX * camDist, 4.95, perpZ * camDist);
      const goalTarget = new THREE.Vector3(midX * 0.58, 0.88, midZ * 0.58);

      beginTransition(goalPos, goalTarget, 1.72 / dollySpeedScale, true);
      return () => {
        if (shakeTimer) clearTimeout(shakeTimer);
      };
    }

    // 4. ĐẠI CẢNH MỞ RỘNG LÊN CAO KHI CẢ LÀNG BỎ PHIẾU / PHÁN QUYẾT PHÁP TRƯỜNG (`high_tribunal`)
    if ((recapShot.shotType === "high_tribunal" || recapShot.shotType === "tribunal") && tSeat) {
      const len = Math.hypot(tSeat.x, tSeat.z) || 1;
      const oppX = -tSeat.x / len;
      const oppZ = -tSeat.z / len;
      const sideX = -oppZ;
      const sideZ = oppX;
      const camDist = circleRadius + 2.95;

      // Đặt máy trên cao đối diện chếch 28 độ nhìn bao quát toàn bộ dân làng phóng phiếu về phía Bị Cáo!
      const goalPos = new THREE.Vector3(
        (oppX * 0.88 + sideX * 0.46) * camDist,
        5.25,
        (oppZ * 0.88 + sideZ * 0.46) * camDist
      );
      const goalTarget = new THREE.Vector3(tSeat.x * 0.42, 0.92, tSeat.z * 0.42);

      beginTransition(goalPos, goalTarget, 1.78 / dollySpeedScale, true);
      return () => {
        if (shakeTimer) clearTimeout(shakeTimer);
      };
    }

    // 5. ĐẠI CẢNH MỞ MÀN TOÀN NGÔI LÀNG (`orbit_reveal`)
    beginTransition(
      new THREE.Vector3(0, 4.9, circleRadius + 3.15),
      new THREE.Vector3(0, 0.85, 0),
      1.65 / dollySpeedScale,
      true
    );
    return () => {
      if (shakeTimer) clearTimeout(shakeTimer);
    };
  }, [
    architectMode,
    recapShot?.shotKey,
    recapShot?.relockToken,
    recapShot?.followDirector,
    circleRadius,
    seatMap,
  ]);

  useFrame((state, delta) => {
    const tr = transitionRef.current;
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    if (tr.active) {
      tr.elapsed += delta;
      if (tr.useCubicDolly) {
        const progress = Math.min(1, tr.elapsed / Math.max(0.25, tr.duration));
        const eased = easeInOutCubic(progress);
        camera.position.lerpVectors(tr.startPos, tr.goalPos, eased);
        ctrl.target.lerpVectors(tr.startTarget, tr.goalTarget, eased);
        ctrl.update();
        if (progress >= 1) {
          tr.active = false;
        }
      } else {
        const alpha = Math.min(1, delta * 6.5);
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
      }
    } else if (!architectMode && recapShot && !orbitStoppedByUserRef.current) {
      const t = state.clock.elapsedTime;
      if (
        recapShot.shotType === "orbit_reveal" ||
        recapShot.shotType === "high_tribunal" ||
        recapShot.shotType === "high_pack_hunt"
      ) {
        // Quỹ đạo Crane trên cao xoay cực chậm, sang trọng như phim điện ảnh (tự co giãn mượt theo tốc độ xem)
        const speedScale = Math.min(3, Math.max(0.75, Number(recapShot.dollySpeedScale) || 1));
        const orbitSpeed =
          (recapShot.shotType === "orbit_reveal" ? 0.16 : 0.075) * Math.sqrt(speedScale);
        const angle = Math.atan2(camera.position.x, camera.position.z) + delta * orbitSpeed;
        const orbitR = Math.hypot(camera.position.x, camera.position.z) || circleRadius + 2.9;
        camera.position.x = Math.sin(angle) * orbitR;
        camera.position.z = Math.cos(angle) * orbitR;
        ctrl.update();
      } else if (recapShot.shotType === "actor_pov" || recapShot.shotType === "actor_portrait") {
        // Nhịp thở ống kính cầm tay tinh tế (Subtle Cinema Handheld Breathing) khi giữ góc cá nhân
        camera.position.x = THREE.MathUtils.lerp(
          camera.position.x,
          tr.baseGoalPos.x + Math.sin(t * 1.15) * 0.045,
          delta * 2.2
        );
        camera.position.y = THREE.MathUtils.lerp(
          camera.position.y,
          tr.baseGoalPos.y + Math.cos(t * 1.45) * 0.025,
          delta * 2.2
        );
        ctrl.update();
      }
    } else if (architectMode && !isGizmoDragging) {
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

    // Rung chấn ống kính điện ảnh khi Sói vồ / Khiên đỡ đòn / Phán quyết Treo cổ
    const shk = shakeRef.current;
    if (shk.strength > 0 && shk.elapsed < shk.duration) {
      shk.elapsed += delta;
      const decay = Math.max(0, 1 - shk.elapsed / shk.duration);
      const amp = shk.strength * decay * decay;
      const t = state.clock.elapsedTime;
      camera.position.x += Math.sin(t * 46) * amp * 0.13;
      camera.position.y += Math.cos(t * 52) * amp * 0.1;
    }

    if (camera.position.y < 0.35) {
      camera.position.y = 0.35;
    }

    if (cameraStateRef) {
      cameraStateRef.current = {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [ctrl.target.x, ctrl.target.y, ctrl.target.z],
      };
    }
  });

  const stopAutoGlide = () => {
    orbitStoppedByUserRef.current = true;
    if (transitionRef.current.active) {
      transitionRef.current.active = false;
    }
    if (recapShot && onRecapManualOrbit) {
      onRecapManualOrbit();
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

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={Boolean(recapShot)}
      screenSpacePanning={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.78}
      zoomSpeed={0.9}
      minDistance={recapShot ? 1.15 : cameraMode === "overview" ? 3.2 : 1.25}
      maxDistance={recapShot ? circleRadius + 9.0 : cameraMode === "overview" ? circleRadius + 5.8 : 4.2}
      minPolarAngle={0.16}
      maxPolarAngle={Math.PI / 2 - 0.04}
      onStart={stopAutoGlide}
    />
  );
}
