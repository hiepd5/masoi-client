import * as THREE from "three";

/**
 * =============================================================================
 * ĐỘNG CƠ HOẠT CẢNH KHÔNG GIAN & XƯƠNG KÉP 9 NHÂN VẬT (ACTOR CHOREOGRAPHY 3D)
 * - Chạy đồng bộ 60 FPS với 0 cấp phát rác bộ nhớ trên đường nóng.
 * - Tương thích KÉP 1:1 cho cả:
 *   (1) Nhân vật Procedural hiện tại (`GreyboxActor.jsx` — kiểm thử ngay hôm nay)
 *   (2) Nhân vật `.GLB` Auto-Rig tương lai từ Tripo AI (`SkinnedCharacterGLB.jsx`)
 * - Đảm bảo: Đường cong Bezier né đống lửa trung tâm (R >= 1.92m), tách góc quạt
 *   khi 2–3 Sói cùng vồ, bắt tọa độ Đài Treo Cổ động từ D5 Layout, và giữ 100% Zero-Leak.
 * =============================================================================
 */

export const CAMPFIRE_SAFE_RADIUS = 1.92;

export function normalizeAngleRad(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep01(v) {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
}

function easeOutCubic(v) {
  const x = clamp01(v);
  return 1 - Math.pow(1 - x, 3);
}

function easeInOutQuad(v) {
  const x = clamp01(v);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

/**
 * Chuyển tọa độ Thế giới (World X, Y, Z, Yaw) sang Hệ quy chiếu Cục bộ của Ghế (Seat Local)
 * để Ghế Sồi (`prop_chair`) đứng yên 100% tại chỗ, chỉ riêng Thân Nhân Vật (`actorBodyMoverRef`) rời ghế!
 */
export function worldToSeatLocal(worldX, worldY, worldZ, worldYaw, seatTransform) {
  if (!seatTransform) {
    return { localX: 0, localY: worldY, localZ: 0, localYaw: 0 };
  }
  const dx = worldX - seatTransform.x;
  const dz = worldZ - seatTransform.z;
  const syaw = seatTransform.facingYaw || 0;
  const cosNeg = Math.cos(syaw);
  const sinNeg = -Math.sin(syaw);

  // Phép quay nghịch đảo R_y(-syaw) trong Three.js
  const localX = dx * cosNeg + dz * sinNeg;
  const localZ = -dx * sinNeg + dz * cosNeg;
  const localYaw = normalizeAngleRad(worldYaw - syaw);

  return {
    localX,
    localY: worldY,
    localZ,
    localYaw,
  };
}

/**
 * Giải Đường Cong Bezier Bậc 2 tự lượn vòng tránh Đống Lửa Trung Tâm [0, 0, 0]
 * để nhân vật không bao giờ nhảy hoặc đi bộ xuyên qua lửa!
 */
export function computeCampfireSafeBezierXZ(
  startX,
  startZ,
  endX,
  endZ,
  minClearance = CAMPFIRE_SAFE_RADIUS,
  preferredSide = 0
) {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const segLenSq = dx * dx + dz * dz;

  let midX = (startX + endX) * 0.5;
  let midZ = (startZ + endZ) * 0.5;

  if (segLenSq < 0.001) {
    return { p0: [startX, startZ], p1: [midX, midZ], p2: [endX, endZ] };
  }

  // Hình chiếu gốc tọa độ (0,0) lên đoạn thẳng P0->P2
  const projT = clamp01((-startX * dx - startZ * dz) / segLenSq);
  const closestX = startX + dx * projT;
  const closestZ = startZ + dz * projT;
  const closestDist = Math.hypot(closestX, closestZ);

  if (closestDist < minClearance) {
    // Chọn hướng pháp tuyến vòng ra ngoài đống lửa mượt nhất
    const segLen = Math.sqrt(segLenSq);
    const nx1 = -dz / segLen;
    const nz1 = dx / segLen;
    const nx2 = -nx1;
    const nz2 = -nz1;

    let outX = closestX;
    let outZ = closestZ;
    const outLen = Math.hypot(outX, outZ);

    if (outLen > 0.12 && preferredSide === 0) {
      outX /= outLen;
      outZ /= outLen;
    } else {
      const sideSign = preferredSide !== 0 ? preferredSide : startX * dz - startZ * dx >= 0 ? 1 : -1;
      outX = sideSign >= 0 ? nx1 : nx2;
      outZ = sideSign >= 0 ? nz1 : nz2;
    }

    // Điểm điều khiển Bezier bậc 2 cần đẩy xa hơn minClearance (~1.65 lần) để đỉnh parabol B(0.5) >= minClearance
    const controlRadius = minClearance * 1.72;
    midX = outX * controlRadius;
    midZ = outZ * controlRadius;
  } else if (preferredSide !== 0) {
    // Tách nhẹ đường bay cánh quạt khi nhiều Sói cùng lao tới từ 1 phía
    const segLen = Math.sqrt(segLenSq);
    const nx = -dz / segLen;
    const nz = dx / segLen;
    midX += nx * preferredSide * 0.65;
    midZ += nz * preferredSide * 0.65;
  }

  return {
    p0: [startX, startZ],
    p1: [midX, midZ],
    p2: [endX, endZ],
  };
}

export function sampleQuadraticBezierXZ(curve, t) {
  const u = clamp01(t);
  const inv = 1 - u;
  const x = inv * inv * curve.p0[0] + 2 * inv * u * curve.p1[0] + u * u * curve.p2[0];
  const z = inv * inv * curve.p0[1] + 2 * inv * u * curve.p1[1] + u * u * curve.p2[1];

  // Đạo hàm tiếp tuyến để xoay mặt nhân vật đúng hướng lao tới
  const tx = 2 * inv * (curve.p1[0] - curve.p0[0]) + 2 * u * (curve.p2[0] - curve.p1[0]);
  const tz = 2 * inv * (curve.p1[1] - curve.p0[1]) + 2 * u * (curve.p2[1] - curve.p1[1]);
  const tangentYaw = Math.hypot(tx, tz) > 0.001 ? Math.atan2(tx, tz) : 0;

  return { x, z, tangentYaw };
}

/**
 * Tính vị trí đáp đất trước mặt ghế nạn nhân, tự chia góc quạt (-28°, 0°, +28°) khi đàn Sói đông 2–3 con!
 */
export function computeVictimFrontLandingXZ(
  targetSeat,
  standoffDist = 0.86,
  slotIndex = 0,
  totalAttackers = 1
) {
  if (!targetSeat) return { x: 0, z: 0, faceTargetYaw: 0 };

  // Hướng từ ghế nạn nhân nhìn vào tâm sân (0,0) = hướng trước mặt ghế nạn nhân
  const baseInwardYaw = targetSeat.facingYaw || Math.atan2(-targetSeat.x, -targetSeat.z);
  let fanOffsetRad = 0;
  if (totalAttackers > 1) {
    const centerIdx = (totalAttackers - 1) * 0.5;
    fanOffsetRad = (slotIndex - centerIdx) * 0.48; // ~27.5 độ mỗi con Sói
  }

  const approachAngle = baseInwardYaw + fanOffsetRad;
  const landX = targetSeat.x + Math.sin(approachAngle) * standoffDist;
  const landZ = targetSeat.z + Math.cos(approachAngle) * standoffDist;
  const faceTargetYaw = Math.atan2(targetSeat.x - landX, targetSeat.z - landZ);

  return { x: landX, z: landZ, faceTargetYaw };
}

/**
 * Tìm tọa độ Đài Treo Cổ (`prop_gallows`) thực tế đang đặt trong D5 Architect Layout!
 */
export function resolveGallowsStageSpot(layoutNodes = [], circleRadius = 4.2) {
  const gallowsNode = Array.isArray(layoutNodes)
    ? layoutNodes.find((n) => n && n.type === "prop_gallows" && Array.isArray(n.position))
    : null;

  if (gallowsNode) {
    const gx = Number(gallowsNode.position[0]) || 0;
    const gz = Number(gallowsNode.position[2]) || -(circleRadius + 2.8);
    const gyaw = Array.isArray(gallowsNode.rotation)
      ? Number(gallowsNode.rotation[1]) || Math.atan2(-gx, -gz)
      : Math.atan2(-gx, -gz);
    // Đứng ngay trên/trước bệ gỗ pháp trường hướng mặt về phía dân làng trung tâm
    const inwardLen = Math.hypot(gx, gz) || 1;
    const standX = gx - (gx / inwardLen) * 0.55;
    const standZ = gz - (gz / inwardLen) * 0.55;
    const faceVillageYaw = Math.atan2(-standX, -standZ);
    return { x: standX, z: standZ, yaw: faceVillageYaw, rawGallowsPos: [gx, 0, gz], rawYaw: gyaw };
  }

  return {
    x: 0,
    z: -(circleRadius + 2.35),
    yaw: 0, // nhìn về +Z (về tâm làng)
    rawGallowsPos: [0, 0, -(circleRadius + 2.9)],
    rawYaw: 0,
  };
}

/**
 * Tính toán toàn bộ trạng thái Xương + Vị trí Không gian ở một thời điểm `progress` (0.0 -> 1.0)
 * cho 1 nhân vật bất kỳ!
 */
export function evaluateActorChoreography({
  choreoRoleAction,
  progress,
  seatTransform,
  seatMap,
  gallowsSpot,
  tClock = 0,
}) {
  if (!choreoRoleAction || !seatTransform) return null;

  const u = clamp01(progress);
  const {
    actionType,
    targetId = null,
    secondaryTargetId = null,
    slotIndex = 0,
    totalSlots = 1,
  } = choreoRoleAction;

  const targetSeat = targetId && seatMap ? seatMap[targetId] : null;
  const secondaryTargetSeat = secondaryTargetId && seatMap ? seatMap[secondaryTargetId] : null;

  // Khởi tạo giá trị mặc định (= ngồi yên trên ghế)
  let worldX = seatTransform.x;
  let worldY = 0;
  let worldZ = seatTransform.z;
  let worldYaw = seatTransform.facingYaw;

  let sitFactor = 1.0; // 1 = ngồi ghế 0.48m, 0 = duỗi thẳng chân đứng/nhảy
  let spineLeanX = 0;
  let spineTwistY = 0;
  let headPitchX = 0;
  let headYawY = 0;
  let leftArmPitchX = -0.45;
  let rightArmPitchX = -0.45;
  let leftArmSpreadZ = 0;
  let rightArmSpreadZ = 0;
  let leftForeArmBend = -0.52;
  let rightForeArmBend = -0.52;
  let leftThighAddX = 0;
  let rightThighAddX = 0;
  let leftKneeAddX = 0;
  let rightKneeAddX = 0;
  let leftFootPitch = 0;
  let rightFootPitch = 0;
  let jawOpen = 0;
  let tailPitch = 0;
  let tailYaw = 0;
  let hideLeftHandProp = false;
  let hideRightHandProp = false;
  let showTrialTorchOverride = false;
  let overrideCostumeRole = null;
  let bodyEmissiveHex = null;
  let bodyEmissiveIntensity = 0;

  // Hướng nhìn về mục tiêu nếu đứng tại ghế
  const yawToTargetFromSeat = targetSeat
    ? Math.atan2(targetSeat.x - seatTransform.x, targetSeat.z - seatTransform.z)
    : seatTransform.facingYaw;

  switch (actionType) {
    // =========================================================================
    // 1. MA SÓI RỜI GHẾ PHÓNG VỒ CẮN ĐƯỜNG CONG BEZIER (ĐƠN HOẶC ĐÀN 2–3 CON)
    // =========================================================================
    case "wolf_pounce": {
      const land = computeVictimFrontLandingXZ(targetSeat || { x: 0, z: 0, facingYaw: 0 }, 0.84, slotIndex, totalSlots);
      const preferredSide = totalSlots > 1 ? slotIndex - (totalSlots - 1) * 0.5 : 0;
      const curve = computeCampfireSafeBezierXZ(
        seatTransform.x,
        seatTransform.z,
        land.x,
        land.z,
        CAMPFIRE_SAFE_RADIUS,
        preferredSide
      );

      if (u < 0.16) {
        // Pha 1 (0..16%): Bật khỏi ghế sồi, khuỵu gối gồng cơ lưng, nhe nanh mở rộng hai vuốt
        const k = smoothstep01(u / 0.16);
        sitFactor = 1 - k * 0.78;
        const stepOut = sampleQuadraticBezierXZ(curve, k * 0.08);
        worldX = stepOut.x;
        worldZ = stepOut.z;
        worldYaw = stepOut.tangentYaw;
        spineLeanX = 0.46 * k;
        headPitchX = -0.24 * k;
        leftArmPitchX = -0.45 - 0.85 * k;
        rightArmPitchX = -0.45 - 0.85 * k;
        leftArmSpreadZ = 0.34 * k;
        rightArmSpreadZ = -0.34 * k;
        leftForeArmBend = -0.52 - 0.45 * k;
        rightForeArmBend = -0.52 - 0.45 * k;
        leftThighAddX = -0.45 * k;
        rightThighAddX = -0.45 * k;
        leftKneeAddX = 0.65 * k;
        rightKneeAddX = 0.65 * k;
        jawOpen = 0.28 * k;
        tailPitch = 0.32 * k;
      } else if (u < 0.43) {
        // Pha 2 (16..43%): Bật nhảy Parabol vút qua sân đá theo đường cong Bezier né đống lửa!
        const k = (u - 0.16) / 0.27;
        const sample = sampleQuadraticBezierXZ(curve, 0.08 + easeOutCubic(k) * 0.92);
        worldX = sample.x;
        worldZ = sample.z;
        worldY = Math.sin(k * Math.PI) * 0.96; // Đỉnh nhảy cao gần 1m cực kỳ uy lực
        worldYaw = k > 0.78 ? land.faceTargetYaw : sample.tangentYaw;
        sitFactor = 0.0;
        spineLeanX = 0.52 - k * 0.18;
        headPitchX = -0.28;
        // Giương cao cả 2 vuốt lên đỉnh đầu chuẩn bị bổ xuống
        leftArmPitchX = -2.35;
        rightArmPitchX = -2.35;
        leftArmSpreadZ = 0.38;
        rightArmSpreadZ = -0.38;
        leftForeArmBend = -0.78;
        rightForeArmBend = -0.78;
        // Co chân kiểu săn mồi giữa không trung
        const airTuck = Math.sin(k * Math.PI);
        leftThighAddX = -0.75 * airTuck;
        rightThighAddX = -0.35 * airTuck;
        leftKneeAddX = 1.15 * airTuck;
        rightKneeAddX = 0.85 * airTuck;
        leftFootPitch = 0.42 * airTuck;
        rightFootPitch = 0.38 * airTuck;
        jawOpen = 0.42;
        tailPitch = -0.35 * airTuck;
        tailYaw = Math.sin(k * Math.PI * 2) * 0.25;
        bodyEmissiveHex = "#dc2626";
        bodyEmissiveIntensity = 0.35 * airTuck;
      } else if (u < 0.68) {
        // Pha 3 (43..68%): Đáp sầm trước ghế nạn nhân & Bổ chéo 2 trảo liên hoàn (khớp Camera Shake 1550ms!)
        const k = (u - 0.43) / 0.25;
        worldX = land.x;
        worldZ = land.z;
        worldY = 0;
        worldYaw = land.faceTargetYaw;
        sitFactor = 0.16; // Tấn săn mồi thấp vững chãi
        const slashWave = Math.sin(k * Math.PI * 2.2);
        spineLeanX = 0.38 + Math.max(0, slashWave) * 0.24;
        spineTwistY = slashWave * 0.36;
        headPitchX = -0.12 + slashWave * 0.15;
        leftArmPitchX = slashWave >= 0 ? -0.55 : -2.15;
        rightArmPitchX = slashWave >= 0 ? -2.15 : -0.55;
        leftForeArmBend = slashWave >= 0 ? -0.18 : -1.05;
        rightForeArmBend = slashWave >= 0 ? -1.05 : -0.18;
        leftArmSpreadZ = 0.22;
        rightArmSpreadZ = -0.22;
        leftThighAddX = -0.38;
        rightThighAddX = -0.18;
        leftKneeAddX = 0.55;
        rightKneeAddX = 0.32;
        jawOpen = 0.54 * Math.abs(Math.sin(k * Math.PI * 2));
        tailPitch = 0.25;
        tailYaw = -slashWave * 0.45;
        bodyEmissiveHex = "#ef4444";
        bodyEmissiveIntensity = 0.48 * (1 - k * 0.5);
      } else {
        // Pha 4 (68..100%): Bật nhún rút lui mượt theo cung Bezier về lại ghế ngồi xuống
        const k = easeInOutQuad((u - 0.68) / 0.32);
        const sample = sampleQuadraticBezierXZ(curve, 1 - k);
        worldX = sample.x;
        worldZ = sample.z;
        worldY = Math.sin(k * Math.PI) * 0.48;
        worldYaw =
          k > 0.78
            ? THREE.MathUtils.lerp(land.faceTargetYaw, seatTransform.facingYaw, (k - 0.78) / 0.22)
            : normalizeAngleRad(sample.tangentYaw + Math.PI);
        sitFactor = k > 0.72 ? smoothstep01((k - 0.72) / 0.28) : 0;
        spineLeanX = (1 - k) * 0.28;
        leftArmPitchX = THREE.MathUtils.lerp(-1.1, -0.48, k);
        rightArmPitchX = THREE.MathUtils.lerp(-1.1, -0.48, k);
        leftForeArmBend = THREE.MathUtils.lerp(-0.75, -0.52, k);
        rightForeArmBend = THREE.MathUtils.lerp(-0.75, -0.52, k);
        const hopTuck = Math.sin(k * Math.PI);
        leftThighAddX = -0.42 * hopTuck;
        rightThighAddX = -0.42 * hopTuck;
        leftKneeAddX = 0.68 * hopTuck;
        rightKneeAddX = 0.68 * hopTuck;
        jawOpen = (1 - k) * 0.16;
      }
      break;
    }

    // =========================================================================
    // 2. ĐỐI KHÁNG KÉP: SÓI LAO TỚI ĐẬP VÀO KHIÊN BẢO VỆ BỊ HẤT BẬT NGỬA!
    // =========================================================================
    case "wolf_blocked_recoil": {
      const clashSpot = computeVictimFrontLandingXZ(
        targetSeat || { x: 0, z: 0, facingYaw: 0 },
        1.32,
        slotIndex,
        totalSlots
      );
      const preferredSide = totalSlots > 1 ? slotIndex - (totalSlots - 1) * 0.5 : 0;
      const curve = computeCampfireSafeBezierXZ(
        seatTransform.x,
        seatTransform.z,
        clashSpot.x,
        clashSpot.z,
        CAMPFIRE_SAFE_RADIUS,
        preferredSide
      );

      if (u < 0.36) {
        // Phóng vút tới định vồ nạn nhân
        const k = u / 0.36;
        const sample = sampleQuadraticBezierXZ(curve, easeOutCubic(k));
        worldX = sample.x;
        worldZ = sample.z;
        worldY = Math.sin(k * Math.PI) * 0.85;
        worldYaw = sample.tangentYaw;
        sitFactor = k < 0.2 ? 1 - k * 5 : 0;
        spineLeanX = 0.45;
        leftArmPitchX = -2.25;
        rightArmPitchX = -2.25;
        leftForeArmBend = -0.76;
        rightForeArmBend = -0.76;
        leftThighAddX = -0.55;
        rightThighAddX = -0.35;
        leftKneeAddX = 0.9;
        rightKneeAddX = 0.65;
        jawOpen = 0.44;
      } else if (u < 0.68) {
        // VA SẦM VÀO KHIÊN ÁNH SÁNG LÚC u=0.36 -> BẬT NGỬA VĂNG LÙI LẠI!
        const k = (u - 0.36) / 0.32;
        const knockProgress = 1 - easeOutCubic(k) * 0.55;
        const sample = sampleQuadraticBezierXZ(curve, knockProgress);
        worldX = sample.x;
        worldZ = sample.z;
        worldY = Math.sin(k * Math.PI) * 0.62;
        worldYaw = clashSpot.faceTargetYaw;
        sitFactor = 0.1;
        spineLeanX = -0.38 * (1 - k * 0.4); // Ngửa bật người ra sau vì chấn động khiên!
        headPitchX = -0.35;
        headYawY = Math.sin(k * 20) * 0.22;
        leftArmPitchX = -1.35;
        rightArmPitchX = -1.35;
        leftForeArmBend = -0.25;
        rightForeArmBend = -0.25;
        leftArmSpreadZ = 0.62 * (1 - k * 0.3);
        rightArmSpreadZ = -0.62 * (1 - k * 0.3);
        jawOpen = 0.48 * (1 - k * 0.5);
        tailPitch = 0.45 * (1 - k);
        bodyEmissiveHex = "#f59e0b";
        bodyEmissiveIntensity = (1 - k) * 0.75;
      } else {
        // Lồm cồm nhảy lùi nốt về ghế
        const k = easeInOutQuad((u - 0.68) / 0.32);
        const sample = sampleQuadraticBezierXZ(curve, 0.45 * (1 - k));
        worldX = sample.x;
        worldZ = sample.z;
        worldY = Math.sin(k * Math.PI) * 0.28;
        worldYaw = THREE.MathUtils.lerp(clashSpot.faceTargetYaw, seatTransform.facingYaw, k);
        sitFactor = k > 0.65 ? (k - 0.65) / 0.35 : 0;
        spineLeanX = 0.18 * (1 - k);
      }
      break;
    }

    // =========================================================================
    // 3. BẢO VỆ PHÓNG CẮT NGANG DỰNG KHIÊN CHẮN TRƯỚC GHẾ ĐỒNG ĐỘI (DUAL-CLASH)
    // =========================================================================
    case "guard_intercept": {
      const shieldSpot = computeVictimFrontLandingXZ(targetSeat || { x: 0, z: 0, facingYaw: 0 }, 0.88, 0, 1);
      // Hướng lưng Bảo Vệ che cho nạn nhân, mặt quay thẳng ra ngoài đối diện đàn Sói!
      const faceOutwardYaw = normalizeAngleRad(shieldSpot.faceTargetYaw + Math.PI);
      const curve = computeCampfireSafeBezierXZ(
        seatTransform.x,
        seatTransform.z,
        shieldSpot.x,
        shieldSpot.z,
        CAMPFIRE_SAFE_RADIUS,
        0
      );

      if (u < 0.31) {
        // Lao cắt ngang siêu tốc tới trước nạn nhân sớm hơn Sói 0.15s!
        const k = easeOutCubic(u / 0.31);
        const sample = sampleQuadraticBezierXZ(curve, k);
        worldX = sample.x;
        worldZ = sample.z;
        worldY = Math.sin(k * Math.PI) * 0.58;
        worldYaw = k > 0.75 ? faceOutwardYaw : sample.tangentYaw;
        sitFactor = k < 0.18 ? 1 - k * 5.5 : 0;
        spineLeanX = 0.32;
        leftArmPitchX = -1.45; // Giương khiên tay trái ra trước ngực
        leftForeArmBend = -1.12;
        rightArmPitchX = -0.85;
        rightForeArmBend = -0.72;
      } else if (u < 0.74) {
        // Cắm chân trụ tấn thấp, dộng Khiên Sắt đỡ cú vồ trời giáng của Đàn Sói!
        const k = (u - 0.31) / 0.43;
        const impactShock = k < 0.35 ? Math.sin((k / 0.35) * Math.PI) : 0;
        // Bị đẩy lùi nhẹ 0.12m khi chịu lực va chạm của Sói rồi đứng sừng sững!
        const pushBack = impactShock * 0.14;
        worldX = shieldSpot.x - Math.sin(faceOutwardYaw) * pushBack;
        worldZ = shieldSpot.z - Math.cos(faceOutwardYaw) * pushBack;
        worldY = 0;
        worldYaw = faceOutwardYaw;
        sitFactor = 0.28 + impactShock * 0.12; // Tấn hiệp sĩ thấp vững chắc
        spineLeanX = 0.22 - impactShock * 0.18;
        spineTwistY = -0.24; // Đưa vai trái cầm khiên chắn thẳng phía trước
        leftArmPitchX = -1.48 - impactShock * 0.15;
        leftForeArmBend = -1.24 - impactShock * 0.16;
        rightArmPitchX = -0.95;
        rightForeArmBend = -0.88;
        leftThighAddX = -0.35;
        rightThighAddX = 0.15;
        leftKneeAddX = 0.55;
        rightKneeAddX = 0.25;
        bodyEmissiveHex = "#3b82f6";
        bodyEmissiveIntensity = 0.55 * impactShock;
      } else {
        // Thu khiên nhảy lùi về ghế sồi
        const k = easeInOutQuad((u - 0.74) / 0.26);
        const sample = sampleQuadraticBezierXZ(curve, 1 - k);
        worldX = sample.x;
        worldZ = sample.z;
        worldY = Math.sin(k * Math.PI) * 0.34;
        worldYaw = THREE.MathUtils.lerp(faceOutwardYaw, seatTransform.facingYaw, k);
        sitFactor = k > 0.68 ? (k - 0.68) / 0.32 : 0;
        leftArmPitchX = THREE.MathUtils.lerp(-1.35, -0.48, k);
        leftForeArmBend = THREE.MathUtils.lerp(-1.12, -0.55, k);
      }
      break;
    }

    // =========================================================================
    // 4. BẢO VỆ ĐỨNG DẬY CANH GÁC TĨNH (KHI ĐÊM ĐÓ SÓI CẮN GHẾ KHÁC)
    // =========================================================================
    case "guard_patrol_cast": {
      const standCurve = smoothstep01(u < 0.2 ? u / 0.2 : u > 0.8 ? (1 - u) / 0.2 : 1);
      const fwd = 0.36 * standCurve;
      worldX = seatTransform.x + Math.sin(seatTransform.facingYaw) * fwd;
      worldZ = seatTransform.z + Math.cos(seatTransform.facingYaw) * fwd;
      worldYaw = THREE.MathUtils.lerp(seatTransform.facingYaw, yawToTargetFromSeat, standCurve * 0.85);
      sitFactor = 1 - standCurve * 0.88;
      spineLeanX = 0.08 * standCurve;
      spineTwistY = -0.18 * standCurve;
      leftArmPitchX = -0.48 - 0.98 * standCurve; // Nâng khiên tay trái uy nghiêm
      leftForeArmBend = -0.55 - 0.65 * standCurve;
      rightArmPitchX = -0.48 - 0.45 * standCurve;
      headYawY = Math.sin(u * Math.PI * 2) * 0.22 * standCurve;
      break;
    }

    // =========================================================================
    // 5. NẠN NHÂN BỊ SÓI VỒ / TRÚNG ĐỘC (GIẬT BẮN NGỬA TRÊN GHẾ KHỚP ĐÒN ĐÁNH)
    // =========================================================================
    case "victim_hit_recoil": {
      const hitStart = 0.38;
      if (u >= hitStart) {
        const k = clamp01((u - hitStart) / 0.42);
        const shock = Math.sin(k * Math.PI);
        sitFactor = 1.0;
        spineLeanX = -0.34 * shock + Math.sin(tClock * 26) * 0.05 * shock;
        headPitchX = -0.28 * shock;
        headYawY = Math.sin(tClock * 28) * 0.24 * shock;
        // Giơ chéo hai tay gập khuỷu lên đỡ mặt theo phản xạ tự vệ
        leftArmPitchX = -0.48 - 1.15 * shock;
        rightArmPitchX = -0.48 - 1.15 * shock;
        leftForeArmBend = -0.55 - 0.85 * shock;
        rightForeArmBend = -0.55 - 0.85 * shock;
        leftArmSpreadZ = -0.22 * shock;
        rightArmSpreadZ = 0.22 * shock;
        bodyEmissiveHex = "#ef4444";
        bodyEmissiveIntensity = 0.72 * shock;
      }
      break;
    }

    // =========================================================================
    // 6. PHÙ THỦY ĐỨNG DẬY TUNG TIÊN DƯỢC CỨU MẠNG / NÉM BÌNH ĐỘC TÍM
    // =========================================================================
    case "witch_elixir_cast":
    case "witch_poison_throw": {
      const isPoison = actionType === "witch_poison_throw";
      const standWeight = smoothstep01(u < 0.18 ? u / 0.18 : u > 0.82 ? (1 - u) / 0.18 : 1);
      const fwd = 0.4 * standWeight;
      worldX = seatTransform.x + Math.sin(seatTransform.facingYaw) * fwd;
      worldZ = seatTransform.z + Math.cos(seatTransform.facingYaw) * fwd;
      worldYaw = THREE.MathUtils.lerp(seatTransform.facingYaw, yawToTargetFromSeat, standWeight);
      sitFactor = 1 - standWeight;

      const castPhase = clamp01((u - 0.18) / 0.46);
      if (!isPoison) {
        // Tay trái nâng cao Bình Tiên Dược xanh ngọc dâng lên trời rồi tung vòm hồi sinh lúc u=0.42!
        const lift = Math.sin(castPhase * Math.PI);
        spineLeanX = -0.12 * lift;
        leftArmPitchX = -0.48 - 1.95 * standWeight * (0.55 + 0.45 * lift);
        leftForeArmBend = -0.78 + 0.55 * lift;
        rightArmPitchX = -0.48 - 0.85 * standWeight;
        rightForeArmBend = -0.68;
        leftArmSpreadZ = 0.18 * lift;
        hideLeftHandProp = u >= 0.42 && u <= 0.86;
        bodyEmissiveHex = "#22c55e";
        bodyEmissiveIntensity = 0.36 * lift;
      } else {
        // Tay phải gập khuỷu vung ngược ra sau đầu lấy đà (windUp: u=0.18..0.37) -> quất mạnh ném Bình Độc Tím (hurl: u>=0.37)!
        const windUp = castPhase < 0.42 ? castPhase / 0.42 : 0;
        const hurl = castPhase >= 0.42 ? easeOutCubic((castPhase - 0.42) / 0.58) : 0;
        spineLeanX = -0.22 * windUp + 0.36 * hurl * (1 - clamp01((u - 0.65) * 3));
        spineTwistY = -0.35 * windUp + 0.38 * hurl;
        rightArmPitchX = windUp > 0 ? -2.35 * windUp - 0.48 : -2.35 + hurl * 1.25;
        rightForeArmBend = windUp > 0 ? -0.55 - 0.72 * windUp : -1.27 + hurl * 1.08;
        leftArmPitchX = -0.82 * standWeight;
        leftForeArmBend = -0.75 * standWeight;
        hideRightHandProp = u >= 0.37 && u <= 0.88;
        bodyEmissiveHex = "#9333ea";
        bodyEmissiveIntensity = 0.42 * hurl * standWeight;
      }
      break;
    }

    // =========================================================================
    // 7. TIÊN TRI ĐỨNG DẬY & LƠ LỬNG NHẸ NÂNG QUẢ CẦU PHA LÊ SOI CHÂN TƯỚNG
    // =========================================================================
    case "seer_divine_cast": {
      const standWeight = smoothstep01(u < 0.2 ? u / 0.2 : u > 0.82 ? (1 - u) / 0.18 : 1);
      const mysticFloat = Math.sin(clamp01((u - 0.18) / 0.64) * Math.PI);
      const fwd = 0.34 * standWeight;
      worldX = seatTransform.x + Math.sin(seatTransform.facingYaw) * fwd;
      worldZ = seatTransform.z + Math.cos(seatTransform.facingYaw) * fwd;
      worldY = mysticFloat * 0.11; // Lơ lửng huyền bí cách mặt sân đá 11cm!
      worldYaw = THREE.MathUtils.lerp(seatTransform.facingYaw, yawToTargetFromSeat, standWeight);
      sitFactor = 1 - standWeight;
      spineLeanX = -0.09 * mysticFloat;
      headPitchX = -0.18 * mysticFloat;
      // Hai tay cùng khum khuỷu nâng Quả Cầu Pha Lê trước ngực
      leftArmPitchX = -0.48 - 1.02 * standWeight;
      rightArmPitchX = -0.48 - 1.02 * standWeight;
      leftForeArmBend = -0.52 - 0.56 * standWeight;
      rightForeArmBend = -0.52 - 0.56 * standWeight;
      leftArmSpreadZ = -0.18 * standWeight;
      rightArmSpreadZ = 0.18 * standWeight;
      bodyEmissiveHex = "#6366f1";
      bodyEmissiveIntensity = 0.4 * mysticFloat;
      break;
    }

    // =========================================================================
    // 8. TRÁNG SĨ CỨNG CỎI TRỤ VỮNG — BẬT DẬY GỒNG CƠ NGỰC BÙNG LỬA Ý CHÍ THÉP
    // =========================================================================
    case "tough_iron_roar": {
      if (u < 0.22) {
        // Nghiến răng chịu chấn động ban đầu
        const shock = Math.sin((u / 0.22) * Math.PI);
        sitFactor = 1 - shock * 0.3;
        spineLeanX = -0.22 * shock;
        leftArmPitchX = -1.25;
        rightArmPitchX = -1.25;
        leftForeArmBend = -1.15;
        rightForeArmBend = -1.15;
      } else {
        const standWeight = smoothstep01(u < 0.36 ? (u - 0.22) / 0.14 : u > 0.84 ? (1 - u) / 0.16 : 1);
        const roarPulse = Math.sin(clamp01((u - 0.32) / 0.5) * Math.PI);
        const fwd = 0.38 * standWeight;
        worldX = seatTransform.x + Math.sin(seatTransform.facingYaw) * fwd;
        worldZ = seatTransform.z + Math.cos(seatTransform.facingYaw) * fwd;
        sitFactor = 1 - standWeight * 0.86; // Đứng tấn rộng 2 chân vững như bàn thạch
        spineLeanX = -0.22 * roarPulse; // Ưỡn căng lồng ngực
        headPitchX = -0.26 * roarPulse;
        leftArmPitchX = -0.48 - 1.35 * roarPulse;
        rightArmPitchX = -0.48 - 1.35 * roarPulse;
        leftForeArmBend = -0.82 * roarPulse - 0.35;
        rightForeArmBend = -0.82 * roarPulse - 0.35;
        leftArmSpreadZ = 0.52 * roarPulse;
        rightArmSpreadZ = -0.52 * roarPulse;
        bodyEmissiveHex = "#ea580c";
        bodyEmissiveIntensity = 0.62 * roarPulse;
      }
      break;
    }

    // =========================================================================
    // 9. KẺ BỊ NGUYỀN CO GIẬT ÔM ĐẦU & NGỬA CỔ HÚ TRĂNG HÓA THÀNH MA SÓI!
    // =========================================================================
    case "cursed_blood_metamorph": {
      const standWeight = smoothstep01(u < 0.16 ? u / 0.16 : u > 0.85 ? (1 - u) / 0.15 : 1);
      const fwd = 0.42 * standWeight;
      worldX = seatTransform.x + Math.sin(seatTransform.facingYaw) * fwd;
      worldZ = seatTransform.z + Math.cos(seatTransform.facingYaw) * fwd;
      sitFactor = 1 - standWeight;

      if (u < 0.42) {
        // Giai đoạn 1: Gập khuỷu ôm đầu co giật dữ dội vì huyết nguyền sôi sục
        const tremor = Math.sin(tClock * 34) * 0.14;
        spineLeanX = 0.36 * standWeight + tremor * 0.4;
        headPitchX = 0.32;
        headYawY = tremor;
        leftArmPitchX = -2.05 * standWeight;
        rightArmPitchX = -2.05 * standWeight;
        leftForeArmBend = -1.32 * standWeight;
        rightForeArmBend = -1.32 * standWeight;
        leftArmSpreadZ = -0.25;
        rightArmSpreadZ = 0.25;
        bodyEmissiveHex = "#9333ea";
        bodyEmissiveIntensity = 0.55 * standWeight;
      } else {
        // Giai đoạn 2 (từ 42% ~ 950ms): Bùng nổ Hóa Sói, ngửa cổ há nanh hú vang lên mặt trăng!
        overrideCostumeRole = "wolf";
        const howl = Math.sin(clamp01((u - 0.42) / 0.45) * Math.PI);
        worldY = Math.sin(clamp01((u - 0.42) / 0.18) * Math.PI) * 0.28; // Bật tung nhẹ lúc biến hình
        spineLeanX = -0.32 * howl;
        headPitchX = -0.48 * howl; // Ngửa mặt hú thẳng lên trăng
        leftArmPitchX = -0.48 - 1.75 * howl;
        rightArmPitchX = -0.48 - 1.75 * howl;
        leftForeArmBend = -0.42;
        rightForeArmBend = -0.42;
        leftArmSpreadZ = 0.58 * howl;
        rightArmSpreadZ = -0.58 * howl;
        jawOpen = 0.56 * howl;
        tailPitch = -0.25 * howl;
        bodyEmissiveHex = "#dc2626";
        bodyEmissiveIntensity = 0.68 * howl;
      }
      break;
    }

    // =========================================================================
    // 10. ÁP GIẢI BƯỚC BỘ RA ĐÀI TREO CỔ D5 (TREO CỔ THƯỜNG vs CHÁN ĐỜI ĐẮC THẮNG!)
    // =========================================================================
    case "gallows_walk_hang":
    case "gallows_walk_tanner_win": {
      const isTannerWin = actionType === "gallows_walk_tanner_win";
      const gSpot = gallowsSpot || { x: 0, z: -6.5, yaw: 0 };
      const curve = computeCampfireSafeBezierXZ(
        seatTransform.x,
        seatTransform.z,
        gSpot.x,
        gSpot.z,
        CAMPFIRE_SAFE_RADIUS,
        0
      );

      if (u < 0.46) {
        // Bước bộ lảo đảo theo đường cong tránh lửa ra thẳng Đài Treo Cổ!
        const walkK = easeInOutQuad(u / 0.46);
        const sample = sampleQuadraticBezierXZ(curve, walkK);
        worldX = sample.x;
        worldZ = sample.z;
        worldYaw = walkK > 0.85 ? gSpot.yaw : sample.tangentYaw;
        sitFactor = u < 0.08 ? 1 - u / 0.08 : 0;

        // Chu kỳ bước chân đối xứng chân trái - chân phải + đánh khuỷu tay & cổ chân tự nhiên
        const stride = Math.sin(walkK * Math.PI * 7);
        worldY = Math.abs(stride) * 0.045;
        spineLeanX = isTannerWin ? 0.06 : 0.22; // Kẻ bị kết án cúi đầu nặng bước
        headPitchX = isTannerWin ? -0.05 : 0.28;
        leftThighAddX = -stride * 0.58;
        rightThighAddX = stride * 0.58;
        leftKneeAddX = Math.max(0, stride) * 0.72;
        rightKneeAddX = Math.max(0, -stride) * 0.72;
        leftFootPitch = stride * 0.28;
        rightFootPitch = -stride * 0.28;
        leftArmPitchX = -0.35 + stride * 0.42;
        rightArmPitchX = -0.35 - stride * 0.42;
        leftForeArmBend = -0.45 - Math.max(0, -stride) * 0.35;
        rightForeArmBend = -0.45 - Math.max(0, stride) * 0.35;
      } else {
        // Đứng trên Đài Treo Cổ đón nhận Phán Quyết Định Mệnh!
        const climaxK = clamp01((u - 0.46) / 0.54);
        worldX = gSpot.x;
        worldZ = gSpot.z;
        worldYaw = gSpot.yaw;
        sitFactor = 0;

        if (isTannerWin) {
          // CHÁN ĐỜI THẮNG LỢI: Dang rộng 2 tay ngửa mặt cười điên loạn trong hào quang tím!
          const laughBounce = Math.abs(Math.sin(tClock * 8.5)) * 0.08;
          worldY = 0.14 + laughBounce;
          spineLeanX = -0.26;
          headPitchX = -0.38;
          headYawY = Math.sin(tClock * 9) * 0.22;
          leftArmPitchX = -2.35;
          rightArmPitchX = -2.35;
          leftForeArmBend = -0.42;
          rightForeArmBend = -0.42;
          leftArmSpreadZ = 0.62;
          rightArmSpreadZ = -0.62;
          bodyEmissiveHex = "#a855f7";
          bodyEmissiveIntensity = 0.65;
        } else {
          // Treo cổ phán quyết: giật nảy tại khoảnh khắc sập bệ rồi rũ đầu bất động
          const dropShock = climaxK < 0.25 ? Math.sin((climaxK / 0.25) * Math.PI) : 0;
          worldY = 0.22 * smoothstep01(climaxK * 3) - dropShock * 0.08;
          spineLeanX = 0.28 * smoothstep01(climaxK * 2);
          headPitchX = 0.44 * smoothstep01(climaxK * 2);
          leftArmPitchX = -0.18;
          rightArmPitchX = -0.18;
          leftForeArmBend = -0.22;
          rightForeArmBend = -0.22;
          leftKneeAddX = 0.22;
          rightKneeAddX = 0.18;
          leftFootPitch = 0.35;
          rightFootPitch = 0.35;
        }
      }
      break;
    }

    // =========================================================================
    // 11. DÂN LÀNG ĐỨNG BẬT DẬY GIƠ NGỌN ĐUỐC PHÁN QUYẾT / CHỈ TAY ĐỀ CỬ
    // =========================================================================
    case "tribunal_torch_stand":
    case "day_accuse_stand": {
      const isTorch = actionType === "tribunal_torch_stand";
      const standWeight = smoothstep01(u < 0.18 ? u / 0.18 : u > 0.84 ? (1 - u) / 0.16 : 1);
      const fwd = 0.28 * standWeight;
      worldX = seatTransform.x + Math.sin(seatTransform.facingYaw) * fwd;
      worldZ = seatTransform.z + Math.cos(seatTransform.facingYaw) * fwd;
      worldYaw = THREE.MathUtils.lerp(seatTransform.facingYaw, yawToTargetFromSeat, standWeight);
      sitFactor = 1 - standWeight;
      spineLeanX = (isTorch ? -0.06 : 0.18) * standWeight;
      showTrialTorchOverride = isTorch && standWeight > 0.25;

      if (isTorch) {
        // Giơ cao Ngọn Đuốc Phán Quyết tay phải rực cháy
        const wave = Math.sin(tClock * 5.5 + slotIndex) * 0.08;
        rightArmPitchX = -0.48 - (1.82 + wave) * standWeight;
        rightForeArmBend = -0.32 * standWeight - 0.25 * (1 - standWeight);
        leftArmPitchX = -0.58 * standWeight;
        leftForeArmBend = -0.55;
      } else {
        // Đứng nhổm về trước duỗi thẳng khuỷu tay phải chỉ thẳng mặt nghi phạm!
        rightArmPitchX = -0.48 - 1.05 * standWeight;
        rightForeArmBend = -0.12 * standWeight - 0.52 * (1 - standWeight);
        leftArmPitchX = -0.45;
        leftForeArmBend = -0.55;
      }
      break;
    }

    // =========================================================================
    // 12. SÓI NHỔM DẬY GẦM GỪ TRÊN GHẾ TRONG ĐÊM (CHỈ MÀN HÌNH PHE SÓI THẤY — ZERO LEAK!)
    // =========================================================================
    case "wolf_stalk_preview": {
      sitFactor = 0.45; // Nhổm nửa thân rời mặt ghế như thú săn mồi chuẩn bị vồ
      const fwd = 0.18;
      worldX = seatTransform.x + Math.sin(seatTransform.facingYaw) * fwd;
      worldZ = seatTransform.z + Math.cos(seatTransform.facingYaw) * fwd;
      worldYaw = THREE.MathUtils.lerp(seatTransform.facingYaw, yawToTargetFromSeat, 0.75);
      spineLeanX = 0.34 + Math.sin(tClock * 4.2) * 0.04;
      leftArmPitchX = -1.15 + Math.sin(tClock * 4.8) * 0.1;
      rightArmPitchX = -1.15 + Math.cos(tClock * 4.8) * 0.1;
      leftForeArmBend = -0.82;
      rightForeArmBend = -0.82;
      leftArmSpreadZ = 0.24;
      rightArmSpreadZ = -0.24;
      jawOpen = 0.22 + Math.sin(tClock * 5.2) * 0.08;
      tailYaw = Math.sin(tClock * 3.8) * 0.28;
      break;
    }

    // =========================================================================
    // 13. THỢ SĂN (#19) — QUỲ 1 GỐI GIƯƠNG NỎ BẠC BẮN TRẢ THÙ GIẬT NẢY VAI!
    // =========================================================================
    case "hunter_last_shot": {
      const activeW = smoothstep01(u < 0.16 ? u / 0.16 : u > 0.88 ? (1 - u) / 0.12 : 1);
      const fwd = 0.44 * activeW;
      worldX = seatTransform.x + Math.sin(seatTransform.facingYaw) * fwd;
      worldZ = seatTransform.z + Math.cos(seatTransform.facingYaw) * fwd;
      worldYaw = THREE.MathUtils.lerp(seatTransform.facingYaw, yawToTargetFromSeat, activeW);
      sitFactor = 1 - activeW;

      // Thế quỳ 1 gối xạ thủ Bắc Âu: chân trái chống vuông góc trước, gối phải chạm sát đá (-0.24m)
      worldY = -0.24 * activeW;
      leftThighAddX = -0.95 * activeW;
      leftKneeAddX = 1.42 * activeW;
      rightThighAddX = 0.25 * activeW;
      rightKneeAddX = 1.55 * activeW;
      leftFootPitch = -0.18 * activeW;
      rightFootPitch = 0.45 * activeW;

      if (u < 0.44) {
        // Nhịp 1 & 2: Nén đau giương Nỏ Bạc khóa chết tâm ngắm vào mục tiêu
        const aimW = smoothstep01(u / 0.32);
        spineLeanX = 0.18 * activeW;
        spineTwistY = -0.14 * aimW;
        headPitchX = -0.06 * aimW;
        rightArmPitchX = -0.45 - 0.98 * aimW;
        rightForeArmBend = -0.52 + 0.34 * aimW;
        leftArmPitchX = -0.45 - 0.92 * aimW;
        leftForeArmBend = -0.58;
        leftArmSpreadZ = -0.28 * aimW;
        bodyEmissiveHex = "#38bdf8";
        bodyEmissiveIntensity = 0.28 * aimW;
      } else if (u < 0.72) {
        // Nhịp 3 (44% -> 72%): BÓP CÒ PHÓNG ĐẠN BẠC — Giật nảy bả vai & ngửa ngực!
        const recoil = Math.sin(((u - 0.44) / 0.28) * Math.PI);
        spineLeanX = 0.18 - 0.32 * recoil;
        spineTwistY = -0.14 + 0.12 * recoil;
        headPitchX = -0.22 * recoil;
        rightArmPitchX = -1.43 - 0.38 * recoil;
        rightForeArmBend = -0.18 - 0.32 * recoil;
        leftArmPitchX = -1.37 - 0.22 * recoil;
        leftForeArmBend = -0.62;
        leftArmSpreadZ = -0.22;
        bodyEmissiveHex = "#e2e8f0";
        bodyEmissiveIntensity = 0.78 * recoil;
      } else {
        // Nhịp 4: Hạ nỏ thở dốc anh dũng rồi thu về ghế
        const settle = smoothstep01((u - 0.72) / 0.28);
        spineLeanX = 0.26 * (1 - settle * 0.5) * activeW;
        headPitchX = 0.24 * activeW;
        rightArmPitchX = THREE.MathUtils.lerp(-1.43, -0.55, settle);
        leftArmPitchX = THREE.MathUtils.lerp(-1.37, -0.5, settle);
      }
      break;
    }

    // =========================================================================
    // 14. THẦN TÌNH YÊU CUPID (#20) — BAY LƠ LỬNG GIƯƠNG CUNG BẮN ĐÔI TƠ HỒNG!
    // =========================================================================
    case "cupid_love_arrow": {
      const standW = smoothstep01(u < 0.16 ? u / 0.16 : u > 0.86 ? (1 - u) / 0.14 : 1);
      const fwd = 0.4 * standW;
      worldX = seatTransform.x + Math.sin(seatTransform.facingYaw) * fwd;
      worldZ = seatTransform.z + Math.cos(seatTransform.facingYaw) * fwd;
      sitFactor = 1 - standW;

      // Xoay hướng nhìn về trung điểm của Đôi Tình Nhân A & B (hoặc quét nhẹ từ A sang B)
      const yawA = yawToTargetFromSeat;
      const yawB = secondaryTargetSeat
        ? Math.atan2(secondaryTargetSeat.x - seatTransform.x, secondaryTargetSeat.z - seatTransform.z)
        : yawA;
      const panMix = smoothstep01((u - 0.36) / 0.24);
      let diffYaw = yawB - yawA;
      while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
      while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
      const aimYaw = yawA + diffYaw * (0.25 + 0.5 * panMix);
      worldYaw = THREE.MathUtils.lerp(seatTransform.facingYaw, aimYaw, standW);

      // Bay lơ lửng thần thoại cách mặt sân đá 22cm + co nhẹ chân trên không
      worldY = (0.22 + Math.sin(tClock * 4.4) * 0.035) * standW;
      leftKneeAddX = 0.34 * standW;
      rightKneeAddX = 0.52 * standW;
      leftFootPitch = 0.28 * standW;
      rightFootPitch = 0.36 * standW;

      if (u < 0.46) {
        // Kéo căng dây tơ hồng sát gò má phải, tay trái duỗi thẳng nâng Cung Pha Lê (#26)
        const drawK = smoothstep01(u / 0.38);
        spineLeanX = -0.08 * drawK;
        spineTwistY = -0.32 * drawK;
        leftArmPitchX = -0.45 - 1.08 * drawK;
        leftForeArmBend = -0.52 + 0.44 * drawK;
        leftArmSpreadZ = 0.12 * drawK;
        rightArmPitchX = -0.45 - 1.02 * drawK;
        rightForeArmBend = -0.52 - 0.92 * drawK;
        rightArmSpreadZ = -0.24 * drawK;
        bodyEmissiveHex = "#f472b6";
        bodyEmissiveIntensity = 0.42 * drawK;
      } else {
        // Buông dây bắn liên hoàn 2 mũi tên pha lê hồng!
        const releasePulse = Math.sin(clamp01((u - 0.46) / 0.32) * Math.PI);
        spineLeanX = -0.14 * standW;
        spineTwistY = -0.18 * standW;
        leftArmPitchX = -1.55 * standW;
        leftForeArmBend = -0.08;
        rightArmPitchX = (-1.52 - 0.28 * releasePulse) * standW;
        rightForeArmBend = -0.35;
        rightArmSpreadZ = -0.44 * standW;
        bodyEmissiveHex = "#ec4899";
        bodyEmissiveIntensity = 0.72 * Math.max(0.35, releasePulse) * standW;
      }
      break;
    }

    // =========================================================================
    // 15. ĐÔI TÌNH NHÂN ĐỨT TƠ HỒNG — VƯƠN TAY TUYỆT VỌNG & ÔM NGỰC QUỲ GỤC!
    // =========================================================================
    case "lovers_heartbreak_cascade": {
      const standW = smoothstep01(u < 0.14 ? u / 0.14 : u > 0.88 ? (1 - u) / 0.12 : 1);
      const fwd = 0.36 * standW;
      worldX = seatTransform.x + Math.sin(seatTransform.facingYaw) * fwd;
      worldZ = seatTransform.z + Math.cos(seatTransform.facingYaw) * fwd;
      worldYaw = THREE.MathUtils.lerp(seatTransform.facingYaw, yawToTargetFromSeat, standW);
      sitFactor = 1 - standW;

      if (u < 0.44) {
        // Nhịp 1: Đứng bật dậy vươn hai tay về phía người thương đối diện trước khi dây tơ đứt
        const reach = smoothstep01(u / 0.34);
        spineLeanX = 0.22 * reach;
        leftArmPitchX = -0.45 - 1.05 * reach;
        rightArmPitchX = -0.45 - 1.05 * reach;
        leftForeArmBend = -0.24;
        rightForeArmBend = -0.24;
        bodyEmissiveHex = "#f472b6";
        bodyEmissiveIntensity = 0.38 * reach;
      } else {
        // Nhịp 2 (44%+): Dây Tơ Hồng Nổ Vỡ — Giật ôm chặt lồng ngực và khuỵu cả 2 gối xuống đất!
        const shatterK = smoothstep01((u - 0.44) / 0.26);
        const tremor = Math.sin(tClock * 26) * 0.06 * (1 - clamp01((u - 0.65) / 0.25));
        worldY = -0.3 * shatterK * standW;
        leftThighAddX = -0.62 * shatterK * standW;
        rightThighAddX = -0.62 * shatterK * standW;
        leftKneeAddX = 1.48 * shatterK * standW;
        rightKneeAddX = 1.48 * shatterK * standW;
        spineLeanX = (0.44 * shatterK + tremor) * standW;
        headPitchX = 0.42 * shatterK * standW;
        leftArmPitchX = -1.18 * standW;
        rightArmPitchX = -1.18 * standW;
        leftForeArmBend = -1.45 * standW;
        rightForeArmBend = -1.45 * standW;
        leftArmSpreadZ = -0.26 * standW;
        rightArmSpreadZ = 0.26 * standW;
        bodyEmissiveHex = "#f43f5e";
        bodyEmissiveIntensity = 0.68 * (1 - clamp01((u - 0.52) / 0.38));
      }
      break;
    }

    // =========================================================================
    // 16. SÓI ĐẦU ĐÀN (#21) — PHÓNG VỒ BEZIER KHẮC ẤN HUYẾT NGUYỆT & HÚ TRĂNG!
    // =========================================================================
    case "alpha_blood_convert": {
      const land = computeVictimFrontLandingXZ(targetSeat || { x: 0, z: 0, facingYaw: 0 }, 0.88, 0, 1);
      const curve = computeCampfireSafeBezierXZ(
        seatTransform.x,
        seatTransform.z,
        land.x,
        land.z,
        CAMPFIRE_SAFE_RADIUS,
        0
      );

      if (u < 0.34) {
        // Nhịp 1: Sói Vương 2.18m phóng bật cao 1.08m uy lực vượt lửa trại
        const jumpK = clamp01((u - 0.06) / 0.28);
        const sample = sampleQuadraticBezierXZ(curve, easeInOutQuad(jumpK));
        const arcSin = Math.sin(jumpK * Math.PI);
        worldX = sample.x;
        worldZ = sample.z;
        worldY = arcSin * 1.08;
        worldYaw = jumpK < 0.82 ? sample.tangentYaw : land.faceTargetYaw;
        sitFactor = u < 0.08 ? 1 - u / 0.08 : 0;
        spineLeanX = 0.44;
        leftArmPitchX = -2.05 * arcSin - 0.45;
        rightArmPitchX = -2.05 * arcSin - 0.45;
        leftArmSpreadZ = 0.38;
        rightArmSpreadZ = -0.38;
        leftKneeAddX = 0.62 * arcSin;
        rightKneeAddX = 0.48 * arcSin;
        jawOpen = 0.48 * arcSin;
        tailPitch = 0.32 * arcSin;
      } else if (u < 0.56) {
        // Nhịp 2 (34% -> 56%): Đáp sầm xuống đất, ấn thẳng vuốt phải khắc Huyết Ấn Đỏ Thẫm lên con mồi!
        const brandK = smoothstep01((u - 0.34) / 0.18);
        worldX = land.x;
        worldZ = land.z;
        worldY = 0;
        worldYaw = land.faceTargetYaw;
        sitFactor = 0;
        spineLeanX = 0.34;
        spineTwistY = -0.24 * brandK;
        rightArmPitchX = -1.68;
        rightForeArmBend = -0.18;
        leftArmPitchX = -0.95;
        leftArmSpreadZ = 0.36;
        jawOpen = 0.42;
        bodyEmissiveHex = "#dc2626";
        bodyEmissiveIntensity = 0.68 * brandK;
      } else if (u < 0.8) {
        // Nhịp 3 (56% -> 80%): Ngửa ngực há nanh hú vang lên Huyết Nguyệt gọi đàn!
        const howlK = Math.sin(((u - 0.56) / 0.24) * Math.PI);
        worldX = land.x;
        worldZ = land.z;
        worldY = 0.04 * howlK;
        worldYaw = land.faceTargetYaw;
        sitFactor = 0;
        spineLeanX = -0.36 * howlK;
        headPitchX = -0.54 * howlK;
        leftArmPitchX = -0.55 - 1.72 * howlK;
        rightArmPitchX = -0.55 - 1.72 * howlK;
        leftArmSpreadZ = 0.58 * howlK;
        rightArmSpreadZ = -0.58 * howlK;
        leftForeArmBend = -0.38;
        rightForeArmBend = -0.38;
        jawOpen = 0.65 * howlK;
        tailPitch = -0.3 * howlK;
        bodyEmissiveHex = "#dc2626";
        bodyEmissiveIntensity = 0.82 * howlK;
      } else {
        // Nhịp 4 (80% -> 100%): Bật lùi về lại ngai ghế Sói Vương
        const retK = clamp01((u - 0.8) / 0.2);
        const sample = sampleQuadraticBezierXZ(curve, 1 - easeInOutQuad(retK));
        const arcSin = Math.sin(retK * Math.PI);
        worldX = sample.x;
        worldZ = sample.z;
        worldY = arcSin * 0.64;
        worldYaw = THREE.MathUtils.lerp(land.faceTargetYaw, seatTransform.facingYaw, retK);
        sitFactor = retK > 0.78 ? (retK - 0.78) / 0.22 : 0;
        spineLeanX = 0.22 * (1 - retK);
      }
      break;
    }

    // =========================================================================
    // 17. TRƯỞNG LÀNG (#22) — BƯỚC LÊN GIƠ CAO & DẬM QUYỀN TRƯỢNG PHIẾU X2!
    // =========================================================================
    case "mayor_decree_slam": {
      const standW = smoothstep01(u < 0.16 ? u / 0.16 : u > 0.86 ? (1 - u) / 0.14 : 1);
      const fwd = 0.44 * standW;
      worldX = seatTransform.x + Math.sin(seatTransform.facingYaw) * fwd;
      worldZ = seatTransform.z + Math.cos(seatTransform.facingYaw) * fwd;
      worldYaw = THREE.MathUtils.lerp(seatTransform.facingYaw, yawToTargetFromSeat, standW * 0.65);
      sitFactor = 1 - standW;

      if (u < 0.42) {
        // Nhịp 1: Đứng thẳng uy nghiêm, giơ cao Quyền Trượng Đại Bàng đón nắng Hoàng Kim
        const raiseK = smoothstep01(u / 0.36);
        spineLeanX = -0.14 * raiseK;
        headPitchX = -0.2 * raiseK;
        rightArmPitchX = -0.45 - 2.02 * raiseK;
        rightForeArmBend = -0.22;
        rightArmSpreadZ = -0.14 * raiseK;
        leftArmPitchX = -0.62 * raiseK;
        leftForeArmBend = -0.78;
        leftArmSpreadZ = 0.22 * raiseK;
        bodyEmissiveHex = "#f59e0b";
        bodyEmissiveIntensity = 0.42 * raiseK;
      } else {
        // Nhịp 2 (42%+): DẬM MẠNH ĐẾ QUYỀN TRƯỢNG XUỐNG SÂN ĐÁ — Lan tỏa Sắc Lệnh Hoàng Kim x2!
        const slamSnap = smoothstep01((u - 0.42) / 0.09);
        const shockPulse = Math.sin(clamp01((u - 0.42) / 0.36) * Math.PI);
        worldY = -0.05 * shockPulse * standW;
        leftKneeAddX = 0.16 * shockPulse * standW;
        rightKneeAddX = 0.16 * shockPulse * standW;
        spineLeanX = THREE.MathUtils.lerp(-0.14, 0.14, slamSnap) * standW;
        headPitchX = 0.04 * standW;
        rightArmPitchX = THREE.MathUtils.lerp(-2.47, -0.96, slamSnap) * standW;
        rightForeArmBend = THREE.MathUtils.lerp(-0.22, -0.42, slamSnap);
        leftArmPitchX = -0.68 * standW;
        leftForeArmBend = -0.85;
        leftArmSpreadZ = 0.25 * standW;
        bodyEmissiveHex = "#fbbf24";
        bodyEmissiveIntensity = (0.35 + 0.5 * shockPulse) * standW;
      }
      break;
    }

    default:
      return null;
  }

  const localTransform = worldToSeatLocal(worldX, worldY, worldZ, worldYaw, seatTransform);

  return {
    ...localTransform,
    worldX,
    worldY,
    worldZ,
    worldYaw,
    sitFactor: clamp01(sitFactor),
    spineLeanX,
    spineTwistY,
    headPitchX,
    headYawY,
    leftArmPitchX,
    rightArmPitchX,
    leftArmSpreadZ,
    rightArmSpreadZ,
    leftForeArmBend,
    rightForeArmBend,
    leftThighAddX,
    rightThighAddX,
    leftKneeAddX,
    rightKneeAddX,
    leftFootPitch,
    rightFootPitch,
    jawOpen,
    tailPitch,
    tailYaw,
    hideLeftHandProp,
    hideRightHandProp,
    showTrialTorchOverride,
    overrideCostumeRole,
    bodyEmissiveHex,
    bodyEmissiveIntensity,
  };
}

/**
 * Xây dựng mảng các đường cong Quỹ đạo 3D (Debug Trajectories) để hiển thị trực tiếp
 * trên sân đá trong chế độ '📐 Đường Quỹ Đạo 3D & Gợi Ý Rig Tripo'!
 */
export function buildChoreographyDebugArcs({ actorChoreoMap, seatMap, gallowsSpot }) {
  if (!actorChoreoMap || !seatMap) return [];
  const arcs = [];

  Object.entries(actorChoreoMap).forEach(([actorId, spec]) => {
    const startSeat = seatMap[actorId];
    if (!startSeat || !spec) return;

    let endXZ = null;
    let color = "#f59e0b";
    let peakHeight = 0.85;
    const preferredSide =
      (spec.totalSlots || 1) > 1 ? (spec.slotIndex || 0) - ((spec.totalSlots || 1) - 1) * 0.5 : 0;

    if (spec.actionType === "wolf_pounce" && spec.targetId && seatMap[spec.targetId]) {
      const land = computeVictimFrontLandingXZ(
        seatMap[spec.targetId],
        0.84,
        spec.slotIndex || 0,
        spec.totalSlots || 1
      );
      endXZ = [land.x, land.z];
      color = "#ef4444";
      peakHeight = 0.96;
    } else if (spec.actionType === "wolf_blocked_recoil" && spec.targetId && seatMap[spec.targetId]) {
      const land = computeVictimFrontLandingXZ(
        seatMap[spec.targetId],
        1.32,
        spec.slotIndex || 0,
        spec.totalSlots || 1
      );
      endXZ = [land.x, land.z];
      color = "#f97316";
      peakHeight = 0.85;
    } else if (spec.actionType === "guard_intercept" && spec.targetId && seatMap[spec.targetId]) {
      const land = computeVictimFrontLandingXZ(seatMap[spec.targetId], 0.88, 0, 1);
      endXZ = [land.x, land.z];
      color = "#3b82f6";
      peakHeight = 0.58;
    } else if (spec.actionType === "alpha_blood_convert" && spec.targetId && seatMap[spec.targetId]) {
      const land = computeVictimFrontLandingXZ(seatMap[spec.targetId], 0.88, 0, 1);
      endXZ = [land.x, land.z];
      color = "#dc2626";
      peakHeight = 1.08;
    } else if (spec.actionType === "hunter_last_shot" && spec.targetId && seatMap[spec.targetId]) {
      const tSeat = seatMap[spec.targetId];
      arcs.push({
        id: `arc_${actorId}_hunter_shot`,
        color: "#e2e8f0",
        points: [
          [startSeat.x, 0.92, startSeat.z],
          [(startSeat.x + tSeat.x) * 0.5, 0.98, (startSeat.z + tSeat.z) * 0.5],
          [tSeat.x, 0.88, tSeat.z],
        ],
        landingXZ: [tSeat.x, tSeat.z],
      });
      return;
    } else if (spec.actionType === "cupid_love_arrow") {
      const targets = [
        spec.targetId ? seatMap[spec.targetId] : null,
        spec.secondaryTargetId ? seatMap[spec.secondaryTargetId] : null,
      ].filter(Boolean);
      targets.forEach((tSeat, ti) => {
        const pts = [];
        for (let i = 0; i <= 20; i++) {
          const k = i / 20;
          pts.push([
            THREE.MathUtils.lerp(startSeat.x, tSeat.x, k),
            1.15 + Math.sin(k * Math.PI) * 0.65 - k * 0.25,
            THREE.MathUtils.lerp(startSeat.z, tSeat.z, k),
          ]);
        }
        arcs.push({
          id: `arc_${actorId}_cupid_${ti}`,
          color: "#ec4899",
          points: pts,
          landingXZ: [tSeat.x, tSeat.z],
        });
      });
      if (targets.length === 2) {
        arcs.push({
          id: `arc_${actorId}_cupid_tether`,
          color: "#f9a8d4",
          points: [
            [targets[0].x, 0.78, targets[0].z],
            [(targets[0].x + targets[1].x) * 0.5, 1.08, (targets[0].z + targets[1].z) * 0.5],
            [targets[1].x, 0.78, targets[1].z],
          ],
          landingXZ: [targets[1].x, targets[1].z],
        });
      }
      return;
    } else if (
      spec.actionType === "gallows_walk_hang" ||
      spec.actionType === "gallows_walk_tanner_win"
    ) {
      const g = gallowsSpot || { x: 0, z: -6.5 };
      endXZ = [g.x, g.z];
      color = spec.actionType === "gallows_walk_tanner_win" ? "#a855f7" : "#eab308";
      peakHeight = 0.08; // Đường đi bộ sát mặt đất
    }

    if (!endXZ) return;

    const curve = computeCampfireSafeBezierXZ(
      startSeat.x,
      startSeat.z,
      endXZ[0],
      endXZ[1],
      CAMPFIRE_SAFE_RADIUS,
      preferredSide
    );

    const points = [];
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const xz = sampleQuadraticBezierXZ(curve, t);
      const y = 0.06 + Math.sin(t * Math.PI) * peakHeight;
      points.push([xz.x, y, xz.z]);
    }

    arcs.push({
      id: `arc_${actorId}_${spec.actionType}`,
      color,
      points,
      landingXZ: endXZ,
    });
  });

  return arcs;
}

/**
 * Sổ tay Gợi Ý Kỹ Thuật Tạo Model Tripo AI 1:1 theo từng Vai Trò khi Dev bấm xem trong Studio!
 */
export const TRIPO_ROLE_RIG_GUIDES = {
  wolf: {
    slotFile: "char_wolf.glb",
    title: "🐺 Ma Sói Bắc Âu (Wolf — Cao 1.82m)",
    rigNotes:
      "Dùng A-Pose mở nách 45°, chân dạng chữ V nhẹ. TUYỆT ĐỐI KHÔNG làm áo choàng dài chạm gót chân để khi bật nhảy cao 0.96m và co gối vồ mồi không bị xuyên đùi!",
    socketNote: "Hai bàn tay xòe vuốt tự nhiên (không cầm vũ khí rời).",
  },
  guard: {
    slotFile: "char_guard.glb",
    title: "🛡️ Hộ Vệ Giáp Da (Guard — Cao 1.74m)",
    rigNotes:
      "Giáp vai da thuộc tách khấc khỏi bắp tay để tay trái giơ ngang -85° đỡ đòn Sói mượt mà. Vạt giáp hông ngắn trên đầu gối để xuống tấn thấp (sitFactor=0.28) cực đẹp.",
    socketNote: "KHÔNG gắn khiên vào model gốc — Engine tự gắn prop_guard_shield.glb vào tay trái!",
  },
  witch: {
    slotFile: "char_witch.glb",
    title: "🧪 Phù Thủy Rừng Sương (Witch — Cao 1.66m)",
    rigNotes:
      "Ống tay áo loe vừa phải ở cổ tay, tà váy xẻ tà trước hoặc rộng mềm để đứng bật dậy và vung cao tay phải ném bình độc góc -135° không bị kéo rách lưới nách.",
    socketNote: "Hai bàn tay để trống — Engine tự gắn prop_witch_elixir.glb (trái) & prop_witch_poison.glb (phải)!",
  },
  seer: {
    slotFile: "char_seer.glb",
    title: "🔮 Tiên Tri Cổ Ngữ (Seer — Cao 1.68m)",
    rigNotes:
      "Khăn choàng cổ ngữ mở thoáng vùng trước ngực 25cm để khi hai tay khum nâng Quả Cầu Pha Lê trước ngực không bị chìm vào vải áo.",
    socketNote: "Engine tự đặt Quả Cầu prop_seer_orb.glb lơ lửng phát sáng trên lòng bàn tay!",
  },
  tough_guy: {
    slotFile: "char_tough_guy.glb",
    title: "💪 Tráng Sĩ Cứng Cỏi (Tough Guy — Cao 1.78m)",
    rigNotes:
      "Thân trên vạm vỡ, không mặc áo choàng kín ngực để lộ rõ hiệu ứng bùng lửa cam bất khuất khi ưỡn ngực gồng chữ V chịu đòn Sói.",
    socketNote: "Nắm đấm hoặc bàn tay mở nhẹ tự nhiên, chuẩn Auto-Rig Humanoid.",
  },
  cursed: {
    slotFile: "char_cursed.glb",
    title: "🌑 Kẻ Bị Nguyền (Cursed — Cao 1.68m)",
    rigNotes:
      "Áo choàng rách gấu ngang hông, cổ thoáng để diễn cảnh ôm đầu co giật và ngửa cổ -28° hú trăng trước khi chuyển form sang char_wolf.glb!",
    socketNote: "Có thể thêm vết ấn cổ ngữ tối màu trên mu bàn tay phải.",
  },
  tanner: {
    slotFile: "char_tanner.glb",
    title: "💀 Kẻ Chán Đời (Tanner — Cao 1.67m)",
    rigNotes:
      "Quần ống gọn quanh bắp chân & cổ chân để chu kỳ bước bộ (walkCycle) từ ghế ra Đài Treo Cổ và màn dang rộng 2 tay cười đắc thắng lên hình sắc nét nhất!",
    socketNote: "Engine tự gắn cuộn thừng prop_tanner_noose.glb bên hông/tay.",
  },
  villager_true: {
    slotFile: "char_villager_true.glb",
    title: "🌾 Dân Làng Chân Chất (Villager True — Cao 1.68m)",
    rigNotes:
      "Áo tunic vải đay dài ngang đùi trên (tintableCloak = true để Engine tự nhuộm 10 sắc màu Bắc Âu cho từng ghế). Rất gọn để đồng loạt đứng dậy giơ đuốc!",
    socketNote: "Tay phải tự động cầm prop_trial_torch.glb khi bỏ phiếu Treo Cổ!",
  },
  villager_cloak: {
    slotFile: "char_villager_cloak.glb",
    title: "🧥 Áo Choàng Ẩn Danh Trong Trận (Cloak — Cao 1.68m)",
    rigNotes:
      "Model quan trọng nhất lúc đang chơi (nhân bản cho mọi ghế ẩn danh): mũ trùm che trán nhưng thoáng cằm để xoay đầu theo Mic, vạt áo rủ gọn tới gối để ngồi ghế 0.48m đẹp 100%.",
    socketNote: "Bề mặt áo choàng trung tính để nhận 10 màu nhuộm ghế tự động.",
  },
  hunter: {
    slotFile: "char_hunter.glb (#19) + prop_hand_hunter_crossbow.glb (#25)",
    title: "🏹 Thợ Săn Bạc Bắc Âu (Hunter — Cao 1.86m)",
    rigNotes:
      "Áo khoác da xanh rừng rậm xẻ vạt trước từ thắt lưng trở xuống để chân trái chống vuông 90° & gối phải chạm đất (thế quỳ 1 gối bắn trả thù) không bị căng rách tà áo!",
    socketNote: "TUYỆT ĐỐI để 2 bàn tay trống A-Pose — Cổng #25 tự gắn Nỏ Bạc Hạng Nặng vào xương RightHand!",
  },
  cupid: {
    slotFile: "char_cupid.glb (#20) + prop_hand_cupid_bow.glb (#26)",
    title: "💘 Thần Tình Yêu Bắc Âu (Cupid — Cao 1.76m)",
    rigNotes:
      "Đôi cánh lông vũ sau lưng gọn nhẹ (sải cánh <= 0.75m, gắn cứng xương Chest) để không che khuất người ngồi cạnh; ống tay lụa gọn để tay phải kéo căng dây cung sát má!",
    socketNote: "Bàn tay trái mở nhẹ — Cổng #26 tự gắn Cung Pha Lê Tơ Hồng vào xương LeftHand!",
  },
  alpha_wolf: {
    slotFile: "char_alpha_wolf.glb (#21)",
    title: "🐺👑 Sói Đầu Đàn Huyết Nguyệt (Alpha Wolf — Cao 2.18m)",
    rigNotes:
      "Cao to đồ sộ hơn Sói thường (2.18m vs 2.05m), có đủ 20 xương (gồm Jaw đớp nanh + Tail đuôi). Vương miện sắt sừng gắn liền đỉnh đầu (headCrownRatio = 0.86), giáp vai lông thú tách khấc nách 45°.",
    socketNote: "Hai bàn tay vuốt sắc khổng lồ khắc cổ ngữ đỏ thẫm (không dùng vũ khí rời).",
  },
  mayor: {
    slotFile: "char_mayor.glb (#22) + prop_hand_mayor_scepter.glb (#27)",
    title: "👑 Trưởng Làng Quyền Trượng (Mayor — Cao 1.84m)",
    rigNotes:
      "Áo choàng nhung đỏ thẫm viền lông gấu mở thoáng vạt trước để đứng thẳng giơ cao tay phải góc -140° và dậm mạnh Quyền Trượng xuống sân đá cực kỳ uy nghiêm!",
    socketNote: "Bàn tay phải để trống — Cổng #27 tự gắn Quyền Trượng Đại Bàng Hoàng Kim vào xương RightHand!",
  },
  villager_female: {
    slotFile: "char_villager_female.glb (#23)",
    title: "🧣 Thôn Nữ Khăn Choàng (Villager Female — Cao 1.72m)",
    rigNotes:
      "Khăn len trùm vai gọn gàng, váy dạ Bắc Âu mềm tới bắp chân (garmentSkirt = 0.42) để xoay vòng ghế ẩn danh seatIndex % 3 ngồi khít mặt ghế sồi 0.48m.",
    socketNote: "Hỗ trợ tintableCloak nhuộm sắc màu ghế tự động & cầm Đuốc Phán Quyết tay phải.",
  },
  villager_elder: {
    slotFile: "char_villager_elder.glb (#24)",
    title: "🧙‍♂️ Bô Lão Thông Thái (Villager Elder — Cao 1.74m)",
    rigNotes:
      "Chòm râu bạc tết gọn trước ngực (gắn mượt theo Chest/Head), áo dạ cổ lông ấm áp để đa dạng tạo hình vòng tròn Dân Làng Bắc Âu.",
    socketNote: "Hỗ trợ tintableCloak & cầm Đuốc Phán Quyết tay phải.",
  },
};

/**
 * 10 Kịch bản Diễn Thử 1-Click trong '🎬 Studio Hoạt Cảnh 9 Vai' (chạy ngay trên 8–9 ghế mẫu!)
 */
export const STUDIO_CHOREO_SCENARIOS = [
  // ================== 6 KỊCH BẢN MỞ RỘNG V3.3 (DỰNG TRƯỚC ÁNH SÁNG & CỔNG #19->#27) ==================
  {
    id: "hunter_silver_revenge",
    tier: "v3_3",
    label: "🏹💥 Thợ Săn Quỳ Bắn Đạn Bạc",
    roleFocus: "hunter",
    mood: "dawn",
    durationMs: 4800,
    defaultShotType: "high_pack_hunt",
    vfxType: "hunter_shot",
    description:
      "[Cổng #19 + #25 · Bình Minh] Thợ Săn bước khuỵu 1 gối trước ghế, giương Nỏ Bạc Hạng Nặng khóa mục tiêu rồi bóp cò phóng tia đạn bạc xuyên tâm làm lóe sáng cả sân đá!",
    buildMap: (ids) => {
      const hunter = ids[2] || ids[0];
      const wolfTarget = ids[6] || ids[1];
      return {
        sourceId: hunter,
        targetId: wolfTarget,
        roles: { [hunter]: "hunter", [wolfTarget]: "wolf" },
        choreo: {
          [hunter]: { actionType: "hunter_last_shot", targetId: wolfTarget },
          [wolfTarget]: { actionType: "victim_hit_recoil", targetId: hunter },
        },
      };
    },
  },
  {
    id: "cupid_twin_tether",
    tier: "v3_3",
    label: "💘✨ Cupid Bắn Đôi Tên Tơ Hồng",
    roleFocus: "cupid",
    mood: "night",
    durationMs: 5200,
    defaultShotType: "high_pack_hunt",
    vfxType: "cupid_tether",
    description:
      "[Cổng #20 + #26 · Đêm Trăng] Thần Tình Yêu Cupid bay lơ lửng cách đất 22cm, kéo căng Cung Pha Lê Hồng bắn 2 mũi tên vòng cung kết nối Sợi Tơ Hồng phát sáng giữa Ghế #3 & Ghế #6!",
    buildMap: (ids) => {
      const cupid = ids[0];
      const loverA = ids[2] || ids[1];
      const loverB = ids[5] || ids[3] || ids[1];
      return {
        sourceId: cupid,
        targetId: loverA,
        secondaryTargetId: loverB,
        roles: { [cupid]: "cupid", [loverA]: "guard", [loverB]: "wolf" },
        choreo: {
          [cupid]: {
            actionType: "cupid_love_arrow",
            targetId: loverA,
            secondaryTargetId: loverB,
          },
        },
      };
    },
  },
  {
    id: "lovers_tragic_shatter",
    tier: "v3_3",
    label: "💔🕯️ Đôi Tình Nhân Đứt Tơ Hồng",
    roleFocus: "cupid",
    mood: "dawn",
    durationMs: 4800,
    defaultShotType: "high_pack_hunt",
    vfxType: "lovers_shatter",
    description:
      "[Hiệu Ứng Dây Chuyền · Bình Minh Sương Lạnh] Khi 1 người ngã xuống, Sợi Tơ Hồng căng giữa 2 ghế nổ vỡ thành mảnh tinh thể pha lê hồng — người còn lại ôm ngực khuỵu gối gục theo!",
    buildMap: (ids) => {
      const fallenPartner = ids[2] || ids[0];
      const heartbroken = ids[5] || ids[1];
      return {
        sourceId: heartbroken,
        targetId: fallenPartner,
        secondaryTargetId: heartbroken,
        roles: { [fallenPartner]: "seer", [heartbroken]: "hunter", [ids[0]]: "cupid" },
        choreo: {
          [heartbroken]: {
            actionType: "lovers_heartbreak_cascade",
            targetId: fallenPartner,
            secondaryTargetId: heartbroken,
          },
          [fallenPartner]: { actionType: "victim_hit_recoil", targetId: heartbroken },
        },
      };
    },
  },
  {
    id: "alpha_wolf_blood_brand",
    tier: "v3_3",
    label: "🐺👑 Sói Đầu Đàn Huyết Nguyệt",
    roleFocus: "alpha_wolf",
    mood: "night",
    durationMs: 5400,
    defaultShotType: "high_pack_hunt",
    vfxType: "alpha_blood_moon",
    description:
      "[Cổng #21 · Đêm Huyết Nguyệt] Sói Đầu Đàn cao 2.18m đội Vương Miện Sừng Thép phóng vọt cao 1.08m khắc Ấn Huyết Nguyệt đỏ thẫm đồng hóa nạn nhân rồi ngửa cổ tru vang!",
    buildMap: (ids) => {
      const alpha = ids[0];
      const convertVictim = ids[4] || ids[1];
      const packMate = ids[7] || ids[2];
      return {
        sourceId: alpha,
        targetId: convertVictim,
        roles: { [alpha]: "alpha_wolf", [packMate]: "wolf", [convertVictim]: "villager" },
        choreo: {
          [alpha]: { actionType: "alpha_blood_convert", targetId: convertVictim },
          [packMate]: { actionType: "wolf_stalk_preview", targetId: convertVictim },
          [convertVictim]: { actionType: "cursed_blood_metamorph", targetId: alpha },
        },
      };
    },
  },
  {
    id: "mayor_golden_decree",
    tier: "v3_3",
    label: "👑⚖️ Trưởng Làng Dậm Trượng x2",
    roleFocus: "mayor",
    mood: "dusk_trial",
    durationMs: 4800,
    defaultShotType: "high_tribunal",
    vfxType: "mayor_decree",
    description:
      "[Cổng #22 + #27 · Hoàng Hôn Phán Quyết] Trưởng Làng bước lên giơ cao Quyền Trượng Đại Bàng đón nắng rồi dậm mạnh xuống sân đá phát sóng chấn động Hoàng Kim x2 lá phiếu!",
    buildMap: (ids) => {
      const mayor = ids[1] || ids[0];
      const suspect = ids[5] || ids[2] || ids[0];
      const choreo = {
        [mayor]: { actionType: "mayor_decree_slam", targetId: suspect },
      };
      const roles = { [mayor]: "mayor", [suspect]: "wolf" };
      ids.forEach((id, idx) => {
        if (id !== mayor && id !== suspect && idx % 2 === 0) {
          roles[id] = "villager";
          choreo[id] = { actionType: "day_accuse_stand", targetId: suspect, slotIndex: idx };
        }
      });
      return {
        sourceId: mayor,
        targetId: suspect,
        roles,
        choreo,
      };
    },
  },
  {
    id: "villager_trio_showcase",
    tier: "v3_3",
    label: "🧣🧙‍♂️ Vòng Ghế 3 Tạo Hình Dân Làng",
    roleFocus: "villager_female",
    mood: "day",
    durationMs: 5000,
    defaultShotType: "high_tribunal",
    vfxType: null,
    description:
      "[Cổng #11 · #23 · #24 · Ban Ngày] Soi trực quan sự đa dạng của vòng tròn Dân Làng xen kẽ 3 tạo hình (Nông Dân · Thôn Nữ Khăn Choàng · Bô Lão Râu Bạc) dưới nắng ban ngày!",
    buildMap: (ids) => {
      const roles = {};
      const choreo = {};
      const trio = ["villager", "villager_female", "villager_elder"];
      ids.forEach((id, idx) => {
        roles[id] = trio[idx % 3];
        if (idx % 2 === 1) {
          choreo[id] = { actionType: "tribunal_torch_stand", targetId: ids[0], slotIndex: idx };
        }
      });
      return {
        sourceId: ids[1] || ids[0],
        targetId: ids[0],
        roles,
        choreo,
      };
    },
  },

  // ================== 11 KỊCH BẢN GỐC BẢN LỀ V3.2 ==================
  {
    id: "wolf_solo_pounce",
    label: "🐺 1 Sói Phóng Vồ Cắn",
    roleFocus: "wolf",
    mood: "night",
    durationMs: 4800,
    defaultShotType: "high_pack_hunt",
    vfxType: "wolf_attack",
    description: "Sói #1 rời ghế, bật nhảy đường cong Bezier né đống lửa [0,0,0] sang vồ chéo 2 vuốt vào Nạn nhân #5 đối diện rồi nhảy lùi về ghế.",
    buildMap: (ids) => ({
      sourceId: ids[0],
      targetId: ids[4] || ids[1],
      roles: { [ids[0]]: "wolf", [ids[4] || ids[1]]: "villager" },
      choreo: {
        [ids[0]]: { actionType: "wolf_pounce", targetId: ids[4] || ids[1], slotIndex: 0, totalSlots: 1 },
        [ids[4] || ids[1]]: { actionType: "victim_hit_recoil", targetId: ids[0] },
      },
    }),
  },
  {
    id: "wolf_pack_3_fan",
    label: "🐺🐺🐺 3 Sói Vây Cánh Quạt",
    roleFocus: "wolf",
    mood: "night",
    durationMs: 5200,
    defaultShotType: "high_pack_hunt",
    vfxType: "wolf_attack",
    description: "Cả đàn 3 con Sói đồng loạt rời ghế từ 3 hướng, lượn vòng tránh lửa và tách góc quạt (-28°, 0°, +28°) vồ hội đồng Nạn nhân #5 không hề chồng mesh!",
    buildMap: (ids) => {
      const target = ids[4] || ids[3];
      const w0 = ids[0];
      const w1 = ids[1];
      const w2 = ids[7] || ids[2];
      return {
        sourceId: w0,
        coActorIds: [w0, w1, w2],
        targetId: target,
        roles: { [w0]: "wolf", [w1]: "wolf", [w2]: "wolf", [target]: "seer" },
        choreo: {
          [w0]: { actionType: "wolf_pounce", targetId: target, slotIndex: 0, totalSlots: 3 },
          [w1]: { actionType: "wolf_pounce", targetId: target, slotIndex: 1, totalSlots: 3 },
          [w2]: { actionType: "wolf_pounce", targetId: target, slotIndex: 2, totalSlots: 3 },
          [target]: { actionType: "victim_hit_recoil", targetId: w0 },
        },
      };
    },
  },
  {
    id: "guard_dual_clash",
    label: "🛡️⚔️🐺 Bảo Vệ Cản Khiên Hất Văng Sói",
    roleFocus: "guard",
    mood: "night",
    durationMs: 5200,
    defaultShotType: "actor_pov",
    vfxType: "guard_block",
    description: "Đối kháng Kép: Đàn Sói lao tới vồ Tiên Tri #5, nhưng Bảo Vệ #3 phóng cắt ngang sớm hơn 0.15s cắm Khiên Sắt đỡ đòn — hất Sói bật ngửa nhào lộn về ghế!",
    buildMap: (ids) => {
      const wolf = ids[0];
      const guard = ids[2] || ids[1];
      const saved = ids[4] || ids[3];
      return {
        sourceId: guard,
        targetId: saved,
        roles: { [wolf]: "wolf", [guard]: "guard", [saved]: "seer" },
        choreo: {
          [guard]: { actionType: "guard_intercept", targetId: saved },
          [wolf]: { actionType: "wolf_blocked_recoil", targetId: saved, slotIndex: 0, totalSlots: 1 },
        },
      };
    },
  },
  {
    id: "witch_elixir_save",
    label: "🧪💚 Phù Thủy Tung Tiên Dược Cứu",
    roleFocus: "witch",
    mood: "night",
    durationMs: 4600,
    defaultShotType: "actor_pov",
    vfxType: "witch_save",
    description: "Phù Thủy đứng bật dậy trước ghế, tay trái nâng cao Bình Tiên Dược xanh ngọc dâng sáng rồi tung vòm hồi sinh sang ghế Nạn nhân.",
    buildMap: (ids) => {
      const witch = ids[3] || ids[0];
      const target = ids[6] || ids[1];
      return {
        sourceId: witch,
        targetId: target,
        roles: { [witch]: "witch", [target]: "villager" },
        choreo: {
          [witch]: { actionType: "witch_elixir_cast", targetId: target },
        },
      };
    },
  },
  {
    id: "witch_poison_hurl",
    label: "🧪☠️ Phù Thủy Quăng Bình Độc Tím",
    roleFocus: "witch",
    mood: "night",
    durationMs: 4600,
    defaultShotType: "actor_pov",
    vfxType: "witch_poison",
    description: "Phù Thủy bước lên xoay vai vung tay phải quăng mạnh Bình Độc Tím đập vỡ dưới chân ghế kẻ tình nghi!",
    buildMap: (ids) => {
      const witch = ids[3] || ids[0];
      const target = ids[1];
      return {
        sourceId: witch,
        targetId: target,
        roles: { [witch]: "witch", [target]: "wolf" },
        choreo: {
          [witch]: { actionType: "witch_poison_throw", targetId: target },
          [target]: { actionType: "victim_hit_recoil", targetId: witch },
        },
      };
    },
  },
  {
    id: "seer_orb_divine",
    label: "🔮 Tiên Tri Nâng Cầu Pha Lê Soi",
    roleFocus: "seer",
    mood: "night",
    durationMs: 4600,
    defaultShotType: "actor_pov",
    vfxType: "seer_scan",
    description: "Tiên Tri bước ra trước ghế, lơ lửng nhẹ cách mặt đá 11cm, hai tay khum nâng Quả Cầu Pha Lê chiếu tia soi vạch trần Ma Sói!",
    buildMap: (ids) => {
      const seer = ids[5] || ids[0];
      const target = ids[0] === seer ? ids[1] : ids[0];
      return {
        sourceId: seer,
        targetId: target,
        roles: { [seer]: "seer", [target]: "wolf" },
        choreo: {
          [seer]: { actionType: "seer_divine_cast", targetId: target },
        },
      };
    },
  },
  {
    id: "tough_iron_endure",
    label: "💪 Cứng Cỏi Gồng Lửa Chịu Đòn",
    roleFocus: "tough_guy",
    mood: "night",
    durationMs: 4600,
    defaultShotType: "actor_portrait",
    vfxType: "tough_guy_endure",
    description: "Sau cú cắn của Sói, Tráng Sĩ Cứng Cỏi đứng phắt dậy trụ tấn vững chãi, ưỡn căng ngực bung rộng 2 tay chữ V bùng ngọn lửa cam ý chí thép!",
    buildMap: (ids) => {
      const tough = ids[2] || ids[0];
      return {
        sourceId: tough,
        targetId: tough,
        roles: { [tough]: "tough_guy" },
        enduringIds: [tough],
        choreo: {
          [tough]: { actionType: "tough_iron_roar", targetId: tough },
        },
      };
    },
  },
  {
    id: "cursed_metamorph",
    label: "🌑➡️🐺 Bị Nguyền Co Giật Hóa Sói",
    roleFocus: "cursed",
    mood: "night",
    durationMs: 5000,
    defaultShotType: "actor_portrait",
    vfxType: "cursed_transform",
    description: "Kẻ Bị Nguyền đứng bật dậy ôm đầu co giật dữ dội rồi tung người ngửa cổ hú vang lên trăng, biến hình trực tiếp thành Ma Sói!",
    buildMap: (ids) => {
      const cursed = ids[6] || ids[0];
      return {
        sourceId: cursed,
        targetId: cursed,
        roles: { [cursed]: "cursed" },
        choreo: {
          [cursed]: { actionType: "cursed_blood_metamorph", targetId: cursed },
        },
      };
    },
  },
  {
    id: "tanner_gallows_laugh",
    label: "🪢💀 Chán Đời Ra Pháp Trường & Cười Thắng",
    roleFocus: "tanner",
    mood: "dusk_trial",
    durationMs: 6000,
    defaultShotType: "high_tribunal",
    vfxType: "day_tribunal",
    description: "Cả làng đứng bật dậy giơ Đuốc Phán Quyết; Kẻ Chán Đời bước bộ vòng qua lửa ra đúng Đài Treo Cổ D5 rồi dang rộng 2 tay ngửa mặt cười điên loạn đắc thắng!",
    buildMap: (ids) => {
      const tanner = ids[4] || ids[0];
      const choreo = {
        [tanner]: { actionType: "gallows_walk_tanner_win", targetId: tanner },
      };
      const votesDetail = {};
      const roles = { [tanner]: "tanner" };
      ids.forEach((id, idx) => {
        if (id !== tanner) {
          roles[id] = idx % 3 === 0 ? "wolf" : "villager";
          votesDetail[id] = "hang";
          choreo[id] = { actionType: "tribunal_torch_stand", targetId: tanner, slotIndex: idx };
        }
      });
      return {
        sourceId: tanner,
        targetId: tanner,
        roles,
        votesDetail,
        isHanged: true,
        choreo,
      };
    },
  },
  {
    id: "villager_tribunal_hang",
    label: "🔥🌾 Dân Làng Giơ Đuốc & Treo Cổ Sói",
    roleFocus: "villager_true",
    mood: "dusk_trial",
    durationMs: 6000,
    defaultShotType: "high_tribunal",
    vfxType: "day_tribunal",
    description: "Dân Làng đồng loạt đứng bật dậy giơ cao Ngọn Đuốc Phán Quyết rực cháy trong khi Ma Sói bị áp giải bước lên Đài Treo Cổ nhận phán quyết!",
    buildMap: (ids) => {
      const wolf = ids[0];
      const choreo = {
        [wolf]: { actionType: "gallows_walk_hang", targetId: wolf },
      };
      const votesDetail = {};
      const roles = { [wolf]: "wolf" };
      ids.forEach((id, idx) => {
        if (id !== wolf) {
          roles[id] = idx === 2 ? "guard" : idx === 3 ? "witch" : idx === 5 ? "seer" : "villager";
          votesDetail[id] = "hang";
          choreo[id] = { actionType: "tribunal_torch_stand", targetId: wolf, slotIndex: idx };
        }
      });
      return {
        sourceId: wolf,
        targetId: wolf,
        roles,
        votesDetail,
        isHanged: true,
        choreo,
      };
    },
  },
  {
    id: "cloak_wolf_night_stalk",
    label: "🧥 Áo Choàng Ẩn Danh & Sói Rình Đêm",
    roleFocus: "villager_cloak",
    mood: "night",
    durationMs: 4500,
    defaultShotType: "high_pack_hunt",
    vfxType: null,
    description: "Kiểm chứng In-Game Zero-Leak: Dân làng mặc Áo Choàng Ẩn Danh ngủ gật thở đều, chỉ riêng đồng bọn Sói thấy nhau nhổm dậy gầm gừ rình con mồi!",
    inGameCloakPreview: true,
    buildMap: (ids) => {
      const w0 = ids[0];
      const w1 = ids[3] || ids[1];
      const victim = ids[5] || ids[2];
      return {
        sourceId: w0,
        targetId: victim,
        roles: { [w0]: "wolf", [w1]: "wolf" },
        choreo: {
          [w0]: { actionType: "wolf_stalk_preview", targetId: victim },
          [w1]: { actionType: "wolf_stalk_preview", targetId: victim },
        },
      };
    },
  },
];
