import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { ROLE_COLORS, ROLE_EMOJIS, ROLE_LABELS } from "../../config/roles.config.js";
import { ROLE_COSTUME_MANIFEST } from "../config/roleCostumeManifest.js";
import { resolveActiveCharacterSlot } from "../config/characterManifest.js";
import { SEAT_TOP_Y } from "../utils/seatLayout.js";
import SmartPropGLB from "../props/SmartPropGLB.jsx";
import SkinnedCharacterGLB, { useOptionalCharacterGlb } from "./SkinnedCharacterGLB.jsx";
import { getProceduralGroundAssets } from "../utils/proceduralGroundPBR.js";
import { getSoftGlowHaloTexture } from "../shaders/villageCinematicShaders.js";
import {
  RoleHandSocket3D,
  RoleHeadSocket3D,
  RoleTorsoSocket3D,
  SleepingMotes3D,
} from "./RoleSocketAttachment3D.jsx";

let sharedOrganicBodyGeos = null;
function getOrganicBodyGeos() {
  if (sharedOrganicBodyGeos) return sharedOrganicBodyGeos;
  // Tà áo choàng vải dạ Bắc Âu rủ mềm mại từ vai xuống ghế (Lathe 24 cạnh mượt, 0% khối trụ thô)
  const tunicPts = [
    new THREE.Vector2(0.0, 0.02),
    new THREE.Vector2(0.215, 0.04),
    new THREE.Vector2(0.195, 0.16),
    new THREE.Vector2(0.172, 0.28),
    new THREE.Vector2(0.188, 0.42),
    new THREE.Vector2(0.155, 0.52),
    new THREE.Vector2(0.115, 0.56),
  ];
  const mantlePts = [
    new THREE.Vector2(0.245, 0.37),
    new THREE.Vector2(0.225, 0.45),
    new THREE.Vector2(0.175, 0.53),
    new THREE.Vector2(0.125, 0.57),
  ];
  const ghostRobePts = [
    new THREE.Vector2(0.005, -0.05),
    new THREE.Vector2(0.075, 0.08),
    new THREE.Vector2(0.155, 0.24),
    new THREE.Vector2(0.135, 0.38),
    new THREE.Vector2(0.09, 0.44),
  ];
  sharedOrganicBodyGeos = {
    tunicGeo: new THREE.LatheGeometry(tunicPts, 24),
    mantleGeo: new THREE.LatheGeometry(mantlePts, 24),
    ghostRobeGeo: new THREE.LatheGeometry(ghostRobePts, 20),
  };
  return sharedOrganicBodyGeos;
}

function ProceduralOakChair() {
  return (
    <group>
      {/* Mặt ghế gỗ sồi vát cạnh tại y = 0.45..0.48m */}
      <mesh position={[0, SEAT_TOP_Y - 0.025, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.54, 0.055, 0.5]} />
        <meshStandardMaterial color="#5c3a21" roughness={0.84} />
      </mesh>
      {/* Đai sắt đinh tán quanh mặt ghế */}
      <mesh position={[0, SEAT_TOP_Y - 0.048, 0]}>
        <boxGeometry args={[0.555, 0.02, 0.515]} />
        <meshStandardMaterial color="#27272a" metalness={0.55} roughness={0.5} />
      </mesh>
      {/* 4 chân ghế gỗ dày + thanh giằng ngang chắc chắn */}
      {[
        [-0.21, -0.19],
        [0.21, -0.19],
        [-0.21, 0.19],
        [0.21, 0.19],
      ].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, (SEAT_TOP_Y - 0.05) / 2, lz]} castShadow>
          <boxGeometry args={[0.068, SEAT_TOP_Y - 0.05, 0.068]} />
          <meshStandardMaterial color="#3f2716" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.16, -0.19]} castShadow>
        <boxGeometry args={[0.42, 0.045, 0.045]} />
        <meshStandardMaterial color="#3f2716" roughness={0.9} />
      </mesh>
      {/* 2 trụ tựa lưng + bản gỗ chạm khắc thấp (tổng cao 0.92m không che Camera qua vai) */}
      {[-0.2, 0.2].map((bx, i) => (
        <mesh key={i} position={[bx, SEAT_TOP_Y + 0.22, -0.21]} castShadow>
          <boxGeometry args={[0.065, 0.44, 0.06]} />
          <meshStandardMaterial color="#3f2716" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, SEAT_TOP_Y + 0.3, -0.21]} castShadow>
        <boxGeometry args={[0.48, 0.24, 0.048]} />
        <meshStandardMaterial color="#4e301b" roughness={0.85} />
      </mesh>
    </group>
  );
}

// Bảng màu Vải Dạ Trung Cổ Trầm Sang (10 sắc độ tách biệt rõ từng ghế nhưng ăn nhập 100% với lửa trại & gỗ đá Bắc Âu!)
const VILLAGER_TUNIC_PALETTE = [
  "#7f2936", // Đỏ Rượu Burgundy Cổ
  "#284b63", // Xanh Thép Bắc Âu
  "#8a5224", // Nâu Hổ Phách Da Thuộc
  "#264e36", // Xanh Rừng Thông Sẫm
  "#4b3869", // Tím Chàm Hoàng Gia
  "#6b5b2b", // Vàng Rêu Ô-liu Cổ
  "#22575e", // Xanh Đá Phiến Biển Bắc
  "#6e3426", // Đỏ Đồng Nung
  "#2d3a66", // Chàm Đêm Sương Mù
  "#662c4b", // Tím Dâu Rừng Sẫm
];

/**
 * Nhân vật Modular Socket 8 Vai + Procedural Bone Spring 60 FPS (Phương án 1A + 2A):
 * - Giai đoạn 1 (Trong Game): Bảo mật Zero-Leak tuyệt đối (người khác luôn ẩn danh dưới áo choàng Dân Làng;
 *   chính mình thấy đạo cụ vai riêng; Sói thấy đồng bọn ban đêm; người chết hóa Linh Hồn bay lơ lửng).
 * - Giai đoạn 2 (Kết Game Kể Story 2A): Mở khóa tạo hình 8 Vai, hỗ trợ du hành thời gian (sống/chết/hóa Sói theo từng Đêm)
 *   và diễn các tư thế castLunge / hitRecoil / cheer đồng bộ với tia VFX 3D!
 */
export default function GreyboxActor({
  player,
  seatTransform,
  cameraMode = "shoulder",
  isMe,
  isNight,
  phase,
  myRole,
  hasWinner,
  isSelected,
  selectedActionMeta = null,
  isDefendant,
  isWolfVictim,
  isWolfTeammate,
  wolfPicksOnThis = 0,
  seerResult = null,
  nominationVoters = [],
  hasPointTarget = false,
  myFinalVote = null,
  isSpeaking = false,
  lookTargetWorld = null,
  chatBubbleText = null,
  playerReactions = [],
  chairCalib = null,
  reloadToken = 0,
  architectMode = false,
  recapActorState = null,
  onSelect,
}) {
  const [hovered, setHovered] = useState(false);

  const actorRootRef = useRef(null);
  const spineRef = useRef(null);
  const headRef = useRef(null);
  const leftArmRef = useRef(null);
  const rightArmRef = useRef(null);
  const ghostSpiritRef = useRef(null);
  const selectRingRef = useRef(null);
  const labelDomRef = useRef(null);
  const labelWorldPos = useMemo(() => new THREE.Vector3(), []);
  const { contactAOMap } = useMemo(() => getProceduralGroundAssets(), []);

  // Trong lúc chiếu lại Story 2A, trạng thái Sống/Chết có thể tua ngược theo từng Đêm/Ngày!
  const actualIsDead = !player.alive;
  const effectiveIsDead =
    hasWinner && typeof recapActorState?.simAlive === "boolean"
      ? !recapActorState.simAlive
      : actualIsDead;

  const recapPose = hasWinner ? recapActorState?.pose || null : null; // 'castLunge' | 'hitRecoil' | 'cheer' | 'defend' | null
  const enduringFire = Boolean(recapActorState?.enduringFire);

  const seed = useMemo(() => {
    let s = 0;
    for (let i = 0; i < player.id.length; i++) s += player.id.charCodeAt(i);
    return (s % 100) * 0.13;
  }, [player.id]);

  // ==================== MA TRẬN BẢO MẬT TẠO HÌNH ZERO-LEAK (8 VAI) ====================
  const authorizedWolfForm = useMemo(() => {
    if (hasWinner) {
      if (recapActorState && recapActorState.isRevealed === false) return false;
      const activeRole = recapActorState?.overrideRole || player.role;
      return activeRole === "wolf";
    }
    return (
      (isNight && !actualIsDead && ((isMe && myRole === "wolf") || isWolfTeammate)) ||
      (actualIsDead && player.role === "wolf")
    );
  }, [hasWinner, recapActorState, player.role, isNight, actualIsDead, isMe, myRole, isWolfTeammate]);

  // Vai trò thực tế được phép gắn Phụ kiện 3D lên nhân vật trên màn hình của người đang xem:
  const visibleCostumeRole = useMemo(() => {
    if (hasWinner) {
      if (recapActorState && recapActorState.isRevealed === false) return null;
      return recapActorState?.overrideRole || player.role || "villager";
    }
    if (authorizedWolfForm) return "wolf";
    if (actualIsDead && player.role) return player.role;
    // Chỉ riêng bản thân (isMe) nhìn thấy phụ kiện vai bí mật của mình trên máy mình!
    if (isMe && myRole) return myRole;
    return null;
  }, [hasWinner, recapActorState, player.role, authorizedWolfForm, actualIsDead, isMe, myRole]);

  const isWolfVisual = visibleCostumeRole === "wolf";
  const activeCharSlot = useMemo(
    () => resolveActiveCharacterSlot({ hasWinner, visibleCostumeRole }),
    [hasWinner, visibleCostumeRole]
  );
  const characterGlbEntry = useOptionalCharacterGlb(activeCharSlot);
  const organicGeos = useMemo(() => getOrganicBodyGeos(), []);
  const glowHaloTex = useMemo(() => getSoftGlowHaloTexture(), []);

  const revealedRole = hasWinner
    ? recapActorState?.isRevealed === false
      ? null
      : recapActorState?.overrideRole || player.role
    : isMe
      ? myRole
      : player.role;
  const roleAccentColor = revealedRole ? ROLE_COLORS[revealedRole] || "#fbbf24" : "#94a3b8";

  // Màu trang phục thân nhân vật
  const tunicColor = useMemo(() => {
    if (effectiveIsDead) return "#1e3a5f";
    if (isWolfVisual) return "#691414";
    if (hasWinner && visibleCostumeRole && ROLE_COSTUME_MANIFEST[visibleCostumeRole]) {
      return ROLE_COSTUME_MANIFEST[visibleCostumeRole].tunicColor;
    }
    return VILLAGER_TUNIC_PALETTE[seatTransform.seatIdx % VILLAGER_TUNIC_PALETTE.length];
  }, [effectiveIsDead, isWolfVisual, hasWinner, visibleCostumeRole, seatTransform.seatIdx]);

  const skinColor = effectiveIsDead ? "#7dd3fc" : isWolfVisual ? "#27272a" : "#d9a97c";
  const pantsColor = effectiveIsDead ? "#0c4a6e" : isWolfVisual ? "#18181b" : "#222933";
  const cloakTrimColor = useMemo(() => {
    const c = new THREE.Color(tunicColor);
    c.multiplyScalar(0.68);
    return `#${c.getHexString()}`;
  }, [tunicColor]);
  const bodyOpacity = effectiveIsDead ? 0.24 : 1;

  // Ngủ gục ban đêm nếu không phải Sói đang thức và không phải lượt vai của chính mình
  const isMyActiveNightRole =
    isMe &&
    ((phase === "night_guard" && myRole === "guard") ||
      (phase === "night_wolf" && myRole === "wolf") ||
      (phase === "night_witch" && myRole === "witch") ||
      (phase === "night_seer" && myRole === "seer"));
  const isSleeping =
    isNight && !hasWinner && !effectiveIsDead && !authorizedWolfForm && !isMyActiveNightRole;

  // ==================== PROCEDURAL SPRING ANIMATION 60 FPS ====================
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const breathPhase = t * 2.1 + seed;

    // 1. Thân trên: Thở / Ngủ / Chết / Hoặc Diễn Kịch Story 2A (castLunge, hitRecoil, cheer)
    if (spineRef.current) {
      let targetLeanX = 0;
      let targetPosY = SEAT_TOP_Y;
      let targetPosZ = 0;

      if (effectiveIsDead) {
        targetLeanX = 0.34;
        targetPosY = SEAT_TOP_Y - 0.02;
      } else if (recapPose === "castLunge") {
        targetLeanX = 0.28 + Math.sin(t * 7.5) * 0.06;
        targetPosY = SEAT_TOP_Y + 0.04;
        targetPosZ = 0.12;
      } else if (recapPose === "hitRecoil") {
        targetLeanX = -0.26 + Math.sin(t * 18) * 0.05;
        targetPosY = SEAT_TOP_Y + 0.02;
        targetPosZ = -0.07;
      } else if (recapPose === "cheer") {
        targetLeanX = -0.08 + Math.sin(t * 6.5) * 0.05;
        targetPosY = SEAT_TOP_Y + Math.abs(Math.sin(t * 5.2 + seed)) * 0.055;
      } else if (isSleeping) {
        targetLeanX = 0.19 + Math.sin(t * 1.1 + seed) * 0.02;
      } else {
        targetLeanX = isDefendant || recapPose === "defend" ? -0.07 : Math.sin(breathPhase) * 0.025;
        targetPosY = SEAT_TOP_Y + Math.sin(breathPhase) * 0.009;
      }

      spineRef.current.rotation.x = THREE.MathUtils.lerp(spineRef.current.rotation.x, targetLeanX, delta * 6.5);
      spineRef.current.position.y = THREE.MathUtils.lerp(spineRef.current.position.y, targetPosY, delta * 6.5);
      spineRef.current.position.z = THREE.MathUtils.lerp(spineRef.current.position.z, targetPosZ, delta * 6.5);
    }

    // 2. Xương Đầu (Head LookAt theo người đang nói Mic / Bị cáo / Mục tiêu Story 2A)
    if (headRef.current) {
      let targetYaw = 0;
      let targetPitch = 0;

      if (effectiveIsDead) {
        targetPitch = 0.42;
      } else if (recapPose === "hitRecoil") {
        targetPitch = -0.22;
        targetYaw = Math.sin(t * 22) * 0.18;
      } else if (recapPose === "cheer") {
        targetPitch = -0.14 + Math.sin(t * 6) * 0.08;
        targetYaw = Math.sin(t * 3.5 + seed) * 0.22;
      } else if (isSleeping) {
        targetPitch = 0.36;
        targetYaw = Math.sin(t * 0.6 + seed) * 0.06;
      } else if (isSpeaking) {
        targetPitch = Math.sin(t * 11) * 0.09;
        targetYaw = Math.cos(t * 6.5) * 0.12;
      } else if (lookTargetWorld) {
        const dx = lookTargetWorld.x - seatTransform.x;
        const dz = lookTargetWorld.z - seatTransform.z;
        if (Math.hypot(dx, dz) > 0.2) {
          const worldAngle = Math.atan2(dx, dz);
          let relYaw = worldAngle - seatTransform.facingYaw;
          while (relYaw > Math.PI) relYaw -= Math.PI * 2;
          while (relYaw < -Math.PI) relYaw += Math.PI * 2;
          targetYaw = THREE.MathUtils.clamp(relYaw * 0.75, -0.88, 0.88);
        }
      } else {
        targetYaw = Math.sin(t * 0.75 + seed) * 0.14;
        targetPitch = Math.cos(t * 1.1 + seed) * 0.04;
      }

      headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, targetYaw, delta * 5.8);
      headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, targetPitch, delta * 5.8);
    }

    // 3. Đôi cánh tay (Chỉ tay / Diễn thuyết Mic / Sói giương vuốt / Story Cast & Cheer)
    if (rightArmRef.current && leftArmRef.current) {
      let targetRightX = -0.48;
      let targetLeftX = -0.48;

      if (effectiveIsDead || isSleeping) {
        targetRightX = -0.28;
        targetLeftX = -0.28;
      } else if (recapPose === "cheer") {
        targetRightX = -2.45 + Math.sin(t * 7 + seed) * 0.22;
        targetLeftX = -2.45 + Math.cos(t * 7 + seed) * 0.22;
      } else if (recapPose === "castLunge") {
        targetRightX = -1.55 + Math.sin(t * 10) * 0.25;
        targetLeftX = visibleCostumeRole === "guard" ? -1.25 : -1.35 + Math.cos(t * 10) * 0.2;
      } else if (recapPose === "hitRecoil") {
        targetRightX = -1.15;
        targetLeftX = -1.15;
      } else if (hasPointTarget && (phase === "day_nominate" || phase === "day_defense")) {
        targetRightX = -1.44;
        targetLeftX = -0.45;
      } else if (isSpeaking || (isDefendant && phase === "day_defense") || recapPose === "defend") {
        targetRightX = -0.78 + Math.sin(t * 8.5 + seed) * 0.34;
        targetLeftX = -0.78 + Math.cos(t * 7.8 + seed) * 0.34;
      } else if (isWolfVisual && (phase === "night_wolf" || hasWinner)) {
        targetRightX = -0.92 + Math.sin(t * 3.8 + seed) * 0.12;
        targetLeftX = -0.92 + Math.cos(t * 3.8 + seed) * 0.12;
      }

      rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, targetRightX, delta * 7);
      leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, targetLeftX, delta * 7);
    }

    // 4. Linh hồn Hồn Ma bay dập dềnh phía trên ghế khi nhân vật đã tử nạn
    if (ghostSpiritRef.current) {
      ghostSpiritRef.current.position.y = SEAT_TOP_Y + 0.52 + Math.sin(t * 2.2 + seed) * 0.085;
      ghostSpiritRef.current.rotation.y = Math.sin(t * 0.9 + seed) * 0.18;
    }

    // 5. Vòng chọn mục tiêu xoay nhẹ dưới đất
    if (selectRingRef.current) {
      selectRingRef.current.rotation.z += delta * 1.6;
    }

    // 6. Kẹp tỷ lệ chữ trên màn hình
    if (labelDomRef.current) {
      labelWorldPos.set(seatTransform.x, 1.5, seatTransform.z);
      const dist = state.camera.position.distanceTo(labelWorldPos);
      const clampedScale = THREE.MathUtils.clamp(6.2 / Math.max(dist, 6.2), 0.82, 1.0);
      labelDomRef.current.style.transform = `scale(${clampedScale.toFixed(3)})`;
    }
  });

  const handlePointerClick = (e) => {
    e.stopPropagation();
    if (!actualIsDead && onSelect) {
      onSelect(player.id);
    }
  };

  // Khi bật D5 Architect Mode: cho tia chuột xuyên thẳng qua toàn bộ Ghế & Nhân vật
  useEffect(() => {
    if (!actorRootRef.current) return;
    const noop = () => {};
    actorRootRef.current.traverse((obj) => {
      if (obj.isMesh) {
        obj.raycast = architectMode ? noop : THREE.Mesh.prototype.raycast;
      }
    });
  }, [architectMode, reloadToken, effectiveIsDead, visibleCostumeRole]);

  return (
    <group
      ref={actorRootRef}
      position={[seatTransform.x, 0, seatTransform.z]}
      rotation={[0, seatTransform.facingYaw, 0]}
    >
      {/* ============ 0. BÓNG TIẾP XÚC MỀM DƯỚI CHÂN GHẾ & GIÀY ============ */}
      <mesh position={[0, 0.008, -0.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.58, 22]} />
        <meshBasicMaterial
          map={contactAOMap}
          transparent
          opacity={effectiveIsDead ? 0.34 : 0.66}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      <mesh position={[0, 0.009, 0.28]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.28, 16]} />
        <meshBasicMaterial
          map={contactAOMap}
          transparent
          opacity={effectiveIsDead ? 0.14 : 0.44}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>

      {/* ============ 1. GHẾ GỖ SỒI CHUẨN CAO 0.48m ============ */}
      <SmartPropGLB
        propKey="prop_chair"
        calib={chairCalib}
        reloadToken={reloadToken}
        disableRaycast={architectMode}
        fallback={<ProceduralOakChair />}
      />

      {/* ============ 2. VÒNG SÁNG TRẠNG THÁI DƯỚI CHÂN GHẾ ============ */}
      {isMe && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <ringGeometry args={[0.46, 0.56, 32]} />
          <meshBasicMaterial color={roleAccentColor} transparent opacity={0.85} />
        </mesh>
      )}

      {(isSelected || (hovered && !actualIsDead && !hasWinner)) && (
        <mesh ref={selectRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, 0]}>
          <ringGeometry args={[0.56, 0.68, 24]} />
          <meshBasicMaterial
            color={isSelected ? "#f59e0b" : "#fde68a"}
            transparent
            opacity={isSelected ? 0.95 : 0.45}
          />
        </mesh>
      )}

      {isSpeaking && !effectiveIsDead && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.028, 0]}>
          <ringGeometry args={[0.62, 0.74, 32]} />
          <meshBasicMaterial color="#22c55e" transparent opacity={0.85} />
        </mesh>
      )}

      {(isDefendant || recapPose === "defend") && !effectiveIsDead && (
        <mesh position={[0, 1.85, 0]}>
          <cylinderGeometry args={[0.18, 0.75, 3.7, 20, 1, true]} />
          <meshBasicMaterial
            color="#f97316"
            transparent
            opacity={0.16}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Ngọn nến tắt trước ghế nếu người chơi đã tử nạn */}
      {effectiveIsDead && (
        <group position={[0, 0, 0.46]}>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.035, 0.042, 0.16, 10]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.17, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.03, 6]} />
            <meshBasicMaterial color="#1e293b" />
          </mesh>
        </group>
      )}

      {/* ============ 3. THÂN NHÂN VẬT NGỒI GHẾ + SOCKET ĐẠO CỤ 8 VAI ============ */}
      <group
        onClick={architectMode || hasWinner ? undefined : handlePointerClick}
        onPointerOver={
          architectMode || hasWinner
            ? undefined
            : (e) => {
                e.stopPropagation();
                if (!actualIsDead) {
                  setHovered(true);
                  document.body.style.cursor = "pointer";
                }
              }
        }
        onPointerOut={
          architectMode || hasWinner
            ? undefined
            : () => {
                setHovered(false);
                document.body.style.cursor = "auto";
              }
        }
      >
        {/* ƯU TIÊN NHÂN VẬT 3D CÓ XƯƠNG AUTO-RIG .GLB TỪ TRIPO AI (Nếu đã thả file vào client/public/models/characters/) */}
        {characterGlbEntry ? (
          <SkinnedCharacterGLB
            slotKey={activeCharSlot}
            templateEntry={characterGlbEntry}
            tunicColor={tunicColor}
            effectiveIsDead={effectiveIsDead}
            isWolfVictim={isWolfVictim}
            recapPose={recapPose}
            isSleeping={isSleeping}
            isDefendant={isDefendant}
            isSpeaking={isSpeaking}
            hasPointTarget={hasPointTarget}
            phase={phase}
            hasWinner={hasWinner}
            lookTargetWorld={lookTargetWorld}
            seatTransform={seatTransform}
            seed={seed}
          />
        ) : (
          <>
            {/* Hai đùi & bắp chân giải phẫu bo tròn mềm (CapsuleGeometry) ngồi chuẩn mặt ghế y = 0.48m */}
            <group position={[0, SEAT_TOP_Y, 0]}>
              <mesh position={[0, 0.048, 0.07]} scale={[1.15, 0.65, 1.05]} castShadow={!effectiveIsDead}>
                <sphereGeometry args={[0.175, 20, 16]} />
                <meshStandardMaterial
                  color={cloakTrimColor}
                  transparent={effectiveIsDead}
                  opacity={bodyOpacity}
                  roughness={0.9}
                />
              </mesh>

              {[-0.105, 0.105].map((lx, idx) => (
                <group key={idx} position={[lx, 0.042, 0.08]}>
                  <mesh position={[0, 0, 0.085]} rotation={[Math.PI / 2, 0, 0]} castShadow={!effectiveIsDead}>
                    <capsuleGeometry args={[0.062, 0.19, 10, 16]} />
                    <meshStandardMaterial
                      color={pantsColor}
                      transparent={effectiveIsDead}
                      opacity={bodyOpacity}
                      roughness={0.86}
                    />
                  </mesh>
                  <mesh position={[0, -0.21, 0.23]} castShadow={!effectiveIsDead}>
                    <capsuleGeometry args={[0.052, 0.28, 10, 16]} />
                    <meshStandardMaterial
                      color={effectiveIsDead ? pantsColor : "#271c15"}
                      transparent={effectiveIsDead}
                      opacity={bodyOpacity}
                      roughness={0.8}
                    />
                  </mesh>
                  <mesh position={[0, -0.43, 0.275]} scale={[0.96, 0.68, 1.48]}>
                    <sphereGeometry args={[0.064, 14, 14]} />
                    <meshStandardMaterial
                      color={effectiveIsDead ? "#0284c7" : "#1c140f"}
                      transparent={effectiveIsDead}
                      opacity={bodyOpacity}
                      roughness={0.76}
                    />
                  </mesh>
                </group>
              ))}
            </group>

            {/* Cụm Xương Sống & Tà Áo Choàng Vải Dạ Rủ Mềm (LatheGeometry 24 cạnh — 0% khối hộp!) */}
            <group ref={spineRef} position={[0, SEAT_TOP_Y, 0]}>
              <mesh
                geometry={organicGeos.tunicGeo}
                position={[0, 0.01, -0.01]}
                scale={[isWolfVisual ? 1.24 : 1.04, 1, 0.86]}
                castShadow={!effectiveIsDead}
              >
                <meshStandardMaterial
                  color={tunicColor}
                  emissive={
                    recapPose === "hitRecoil"
                      ? "#ef4444"
                      : isWolfVictim
                        ? "#ef4444"
                        : "#000000"
                  }
                  emissiveIntensity={recapPose === "hitRecoil" ? 0.65 : isWolfVictim ? 0.45 : 0}
                  transparent={effectiveIsDead}
                  opacity={bodyOpacity}
                  roughness={0.88}
                  side={THREE.DoubleSide}
                />
              </mesh>

              {/* Choàng vai lông/vải dạ cổ tròn mượt */}
              <mesh
                geometry={organicGeos.mantleGeo}
                position={[0, 0.01, -0.015]}
                scale={[isWolfVisual ? 1.28 : 1.06, 1, 0.88]}
                castShadow={!effectiveIsDead}
              >
                <meshStandardMaterial
                  color={isWolfVisual ? "#221317" : cloakTrimColor}
                  transparent={effectiveIsDead}
                  opacity={bodyOpacity}
                  roughness={0.92}
                  side={THREE.DoubleSide}
                />
              </mesh>

              {/* Đai thắt lưng da tròn + Khuy đồng chạm tròn Bắc Âu (0% boxGeometry!) */}
              {!effectiveIsDead && (
                <group position={[0, 0.195, -0.01]}>
                  <mesh rotation={[Math.PI / 2, 0, 0]} scale={[isWolfVisual ? 1.2 : 1.02, 0.86, 1]}>
                    <torusGeometry args={[0.184, 0.021, 10, 26]} />
                    <meshStandardMaterial color="#231710" roughness={0.78} />
                  </mesh>
                  <mesh position={[0, 0, 0.168]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.028, 0.0085, 10, 20]} />
                    <meshStandardMaterial color="#d97706" metalness={0.84} roughness={0.28} />
                  </mesh>
                </group>
              )}

              {/* SOCKET ĐẠO CỤ THÂN/VAI/THẮT LƯNG */}
              {!effectiveIsDead && visibleCostumeRole && (
                <RoleTorsoSocket3D
                  roleKey={visibleCostumeRole}
                  enduringFire={enduringFire}
                  seed={seed}
                />
              )}

              {/* Cụm Đầu & Mũ Trùm Ẩn Danh Mềm Mại (Head Group) */}
              <group ref={headRef} position={[0, 0.58, -0.01]}>
                <mesh position={[0, 0.028, -0.008]} rotation={[Math.PI / 2, 0, 0]} scale={[1.04, 0.96, 1]}>
                  <torusGeometry args={[0.125, 0.032, 10, 24]} />
                  <meshStandardMaterial
                    color={cloakTrimColor}
                    transparent={effectiveIsDead}
                    opacity={bodyOpacity}
                    roughness={0.9}
                  />
                </mesh>

                <mesh position={[0, 0.145, 0.015]} castShadow={!effectiveIsDead}>
                  <sphereGeometry args={[0.122, 22, 20]} />
                  <meshStandardMaterial
                    color={skinColor}
                    transparent={effectiveIsDead}
                    opacity={bodyOpacity}
                    roughness={0.7}
                  />
                </mesh>

                {/* Mũ trùm ẩn danh vòm vải mềm */}
                {!isWolfVisual && visibleCostumeRole !== "guard" && (
                  <group>
                    <mesh
                      position={[0, 0.162, -0.016]}
                      scale={[1.07, 1.12, 1.15]}
                      castShadow={!effectiveIsDead}
                    >
                      <sphereGeometry args={[0.142, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.76]} />
                      <meshStandardMaterial
                        color={tunicColor}
                        transparent={effectiveIsDead}
                        opacity={bodyOpacity}
                        roughness={0.9}
                        side={THREE.DoubleSide}
                      />
                    </mesh>
                    {visibleCostumeRole !== "witch" && visibleCostumeRole !== "villager" && (
                      <mesh
                        position={[0, 0.22, -0.092]}
                        rotation={[-0.78, 0, 0]}
                        castShadow={!effectiveIsDead}
                      >
                        <capsuleGeometry args={[0.056, 0.11, 8, 14]} />
                        <meshStandardMaterial
                          color={cloakTrimColor}
                          transparent={effectiveIsDead}
                          opacity={bodyOpacity}
                          roughness={0.92}
                        />
                      </mesh>
                    )}
                  </group>
                )}

                {/* Hai mắt biểu cảm */}
                {!isSleeping && !effectiveIsDead && (
                  <>
                    <mesh position={[-0.044, 0.152, 0.128]}>
                      <sphereGeometry args={[isWolfVisual ? 0.021 : 0.016, 12, 12]} />
                      <meshBasicMaterial color={isWolfVisual ? "#f59e0b" : "#1e293b"} />
                    </mesh>
                    <mesh position={[0.044, 0.152, 0.128]}>
                      <sphereGeometry args={[isWolfVisual ? 0.021 : 0.016, 12, 12]} />
                      <meshBasicMaterial color={isWolfVisual ? "#f59e0b" : "#1e293b"} />
                    </mesh>
                  </>
                )}

                {isSleeping && <SleepingMotes3D seed={seed} />}

                {!effectiveIsDead && visibleCostumeRole && (
                  <RoleHeadSocket3D roleKey={visibleCostumeRole} />
                )}
              </group>

              {/* Cánh Tay Trái giải phẫu bo tròn (CapsuleGeometry) */}
              <group ref={leftArmRef} position={[isWolfVisual ? 0.245 : 0.2, 0.48, 0]}>
                <mesh position={[0, -0.17, 0]} castShadow={!effectiveIsDead}>
                  <capsuleGeometry args={[0.054, 0.24, 10, 16]} />
                  <meshStandardMaterial
                    color={tunicColor}
                    transparent={effectiveIsDead}
                    opacity={bodyOpacity}
                    roughness={0.88}
                  />
                </mesh>
                <mesh position={[0, -0.365, 0]}>
                  <sphereGeometry args={[0.044, 14, 14]} />
                  <meshStandardMaterial
                    color={skinColor}
                    transparent={effectiveIsDead}
                    opacity={bodyOpacity}
                    roughness={0.72}
                  />
                </mesh>
                {!effectiveIsDead && visibleCostumeRole && (
                  <RoleHandSocket3D roleKey={visibleCostumeRole} side="left" />
                )}
              </group>

              {/* Cánh Tay Phải giải phẫu bo tròn (CapsuleGeometry) */}
              <group ref={rightArmRef} position={[isWolfVisual ? -0.245 : -0.2, 0.48, 0]}>
                <mesh position={[0, -0.17, 0]} castShadow={!effectiveIsDead}>
                  <capsuleGeometry args={[0.054, 0.24, 10, 16]} />
                  <meshStandardMaterial
                    color={tunicColor}
                    transparent={effectiveIsDead}
                    opacity={bodyOpacity}
                    roughness={0.88}
                  />
                </mesh>
                <mesh position={[0, -0.365, 0]}>
                  <sphereGeometry args={[0.044, 14, 14]} />
                  <meshStandardMaterial
                    color={skinColor}
                    transparent={effectiveIsDead}
                    opacity={bodyOpacity}
                    roughness={0.72}
                  />
                </mesh>
                {!effectiveIsDead && visibleCostumeRole && (
                  <RoleHandSocket3D roleKey={visibleCostumeRole} side="right" />
                )}
              </group>
            </group>
          </>
        )}

        {/* ============ 3B. HỒN MA LINH HỒN SƯƠNG MỜ KHI TỬ NẠN (SPECTRAL GHOST SOUL) ============ */}
        {effectiveIsDead && (
          <group ref={ghostSpiritRef} position={[0, SEAT_TOP_Y + 0.52, 0]}>
            <mesh geometry={organicGeos.ghostRobeGeo} position={[0, 0.02, 0]}>
              <meshStandardMaterial
                color="#38bdf8"
                emissive="#0ea5e9"
                emissiveIntensity={0.68}
                transparent
                opacity={0.44}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[0, 0.46, 0]}>
              <sphereGeometry args={[0.112, 18, 18]} />
              <meshStandardMaterial
                color="#bae6fd"
                emissive="#38bdf8"
                emissiveIntensity={0.75}
                transparent
                opacity={0.56}
                depthWrite={false}
              />
            </mesh>
            <sprite position={[0, 0.34, 0]} scale={[0.78, 0.78, 1]}>
              <spriteMaterial
                map={glowHaloTex}
                color="#38bdf8"
                transparent
                opacity={0.42}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
            {[-0.038, 0.038].map((gx, gi) => (
              <mesh key={gi} position={[gx, 0.465, 0.102]}>
                <sphereGeometry args={[0.015, 10, 10]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            ))}
            {visibleCostumeRole && (
              <group position={[0, 0.32, 0]}>
                <RoleHeadSocket3D roleKey={visibleCostumeRole} isGhost opacity={0.62} />
              </group>
            )}
          </group>
        )}
      </group>

      {/* ============ 4. BẢNG TÊN & BÓNG THOẠI REPLAY KHÔNG GIAN THẬT (<Html>) ============ */}
      <Html
        position={[0, effectiveIsDead ? 1.66 : 1.54, 0]}
        center
        zIndexRange={[15, 0]}
        style={{ pointerEvents: architectMode || hasWinner ? "none" : "auto" }}
      >
        <div
          ref={labelDomRef}
          onClick={() => !actualIsDead && !hasWinner && onSelect && onSelect(player.id)}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "3px",
            pointerEvents: architectMode || actualIsDead || hasWinner ? "none" : "auto",
            opacity: architectMode ? 0.45 : 1,
            cursor: actualIsDead || hasWinner ? "default" : "pointer",
            userSelect: "none",
            whiteSpace: "nowrap",
            transformOrigin: "center bottom",
          }}
        >
          {/* Phản ứng Emoji bay lên */}
          {playerReactions.map((r, idx) => (
            <div key={r.id || idx} className="floating-reaction" style={{ position: "static", fontSize: "18px" }}>
              {r.emoji}
            </div>
          ))}

          {/* Bóng thoại Mật Đàm Sói / Lời Khai Dân Làng phát lại ngay trên đầu nhân vật thật trong Replay! */}
          {hasWinner && recapActorState?.replayChatBubble && (
            <div
              style={{
                background: recapActorState.isWolfWhisper
                  ? "linear-gradient(135deg, rgba(127, 29, 29, 0.95), rgba(69, 10, 10, 0.96))"
                  : "rgba(15, 23, 42, 0.94)",
                border: recapActorState.isWolfWhisper
                  ? "1px solid rgba(252, 165, 165, 0.68)"
                  : "1px solid rgba(253, 224, 71, 0.55)",
                color: recapActorState.isWolfWhisper ? "#fee2e2" : "#fef9c3",
                padding: "4px 10px",
                borderRadius: "12px",
                fontSize: "11.5px",
                fontWeight: 700,
                maxWidth: "215px",
                whiteSpace: "normal",
                textAlign: "center",
                lineHeight: 1.32,
                boxShadow: "0 6px 18px rgba(0, 0, 0, 0.72)",
              }}
            >
              {recapActorState.isWolfWhisper ? "🐺 " : "💬 "}
              {recapActorState.replayChatBubble}
            </div>
          )}

          {/* Nhãn sự kiện nổi bật khi đang chiếu Story 2A */}
          {hasWinner && recapActorState?.badgeText && (
            <div
              style={{
                background: recapActorState.badgeColor || "#ef4444",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: "10.5px",
                padding: "2px 8px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.5)",
                boxShadow: "0 3px 12px rgba(0,0,0,0.65)",
              }}
            >
              {recapActorState.badgeText}
            </div>
          )}

          {/* Bong bóng chat nhanh trong trận */}
          {chatBubbleText && !hasWinner && (
            <div
              style={{
                background: "rgba(15, 23, 42, 0.9)",
                border: "1px solid rgba(255,255,255,0.24)",
                color: "#f8fafc",
                padding: "2px 8px",
                borderRadius: "10px",
                fontSize: "11px",
                maxWidth: "145px",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {chatBubbleText}
            </div>
          )}

          {/* Nút [✓ Xác nhận] nổi ngay cạnh nhân vật đang được chọn */}
          {isSelected && !actualIsDead && !hasWinner && selectedActionMeta?.canConfirm && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                marginBottom: "1px",
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  selectedActionMeta.onConfirm?.();
                }}
                style={{
                  width: "auto",
                  margin: 0,
                  padding: "3px 10px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: 800,
                  background: selectedActionMeta.accent || "#f59e0b",
                  color: "#ffffff",
                  border: "1px solid rgba(255,255,255,0.45)",
                  boxShadow: "0 3px 10px rgba(0,0,0,0.65)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ✓ {selectedActionMeta.label}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  selectedActionMeta.onClear?.();
                }}
                title="Bỏ chọn"
                style={{
                  width: "20px",
                  height: "20px",
                  margin: 0,
                  padding: 0,
                  borderRadius: "50%",
                  fontSize: "10px",
                  fontWeight: 800,
                  background: "rgba(15, 23, 42, 0.88)",
                  color: "#cbd5e1",
                  border: "1px solid rgba(255,255,255,0.25)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Bảng tên nhân vật */}
          {(!isMe || cameraMode === "overview" || isSelected || hasWinner) && (
            <div
              title={
                nominationVoters.length > 0 && phase === "day_nominate"
                  ? `Người đề cử: ${nominationVoters.map((v) => v.name).join(", ")}`
                  : undefined
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 8px",
                borderRadius: "999px",
                fontSize: "11.5px",
                lineHeight: 1.25,
                fontWeight: isMe ? 800 : 600,
                background: effectiveIsDead
                  ? "rgba(15, 23, 42, 0.58)"
                  : isSelected && !hasWinner
                    ? "rgba(245, 158, 11, 0.92)"
                    : "rgba(6, 9, 30, 0.8)",
                color:
                  isSelected && !effectiveIsDead && !hasWinner
                    ? "#0f172a"
                    : hasWinner && revealedRole
                      ? ROLE_COLORS[revealedRole] || "#f8fafc"
                      : isMe
                        ? roleAccentColor
                        : effectiveIsDead
                          ? "#94a3b8"
                          : "#f1f5f9",
                border: `1px solid ${
                  hasWinner && recapActorState?.isSpotlight
                    ? "#fde047"
                    : isSelected && !effectiveIsDead && !hasWinner
                      ? "#fde68a"
                      : isMe
                        ? roleAccentColor
                        : isDefendant
                          ? "#fb923c"
                          : isWolfTeammate
                            ? "#ef4444"
                            : "rgba(255,255,255,0.18)"
                }`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.48)",
                backdropFilter: "blur(6px)",
              }}
            >
              {isSpeaking && <span>🔊</span>}
              {!player.connected && <span>🔌</span>}
              {effectiveIsDead && <span>👻</span>}
              {isDefendant && !hasWinner && <span title="Đang trên Ghế Nóng">⚖️</span>}
              {isWolfVictim && !hasWinner && <span title="Bị Sói cắn đêm nay">🩸</span>}
              <span>{player.name}</span>
              {isMe && <span>★</span>}
              {(actualIsDead || (hasWinner && revealedRole)) && (revealedRole || player.role) && (
                <span style={{ fontSize: "10.5px", fontWeight: 700, opacity: 0.95 }}>
                  {ROLE_EMOJIS[revealedRole || player.role]}{" "}
                  {hasWinner ? ROLE_LABELS[revealedRole || player.role] : ""}
                </span>
              )}
              {!hasWinner && wolfPicksOnThis > 0 && (
                <span
                  style={{
                    background: "#dc2626",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: "10px",
                    padding: "0 5px",
                    borderRadius: "999px",
                  }}
                >
                  {wolfPicksOnThis}🐺
                </span>
              )}
              {!hasWinner && seerResult && phase === "night_seer" && (
                <span
                  style={{
                    background: seerResult === "wolf" ? "#dc2626" : "#2563eb",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: "10px",
                    padding: "0 5px",
                    borderRadius: "999px",
                  }}
                >
                  {seerResult === "wolf" ? "🔴SÓI" : "🔵Tốt"}
                </span>
              )}
              {!hasWinner && nominationVoters.length > 0 && phase === "day_nominate" && (
                <span
                  style={{
                    background: "rgba(250, 204, 21, 0.28)",
                    color: isSelected ? "#0f172a" : "#fef08a",
                    fontWeight: 800,
                    fontSize: "10px",
                    padding: "0 5px",
                    borderRadius: "999px",
                  }}
                >
                  🗳️{nominationVoters.length}
                </span>
              )}
              {!hasWinner && myFinalVote && phase === "day_final_vote" && (
                <span
                  style={{
                    background: myFinalVote === "hang" ? "#dc2626" : "#16a34a",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: "10px",
                    padding: "0 5px",
                    borderRadius: "999px",
                  }}
                >
                  {myFinalVote === "hang" ? "🪢" : "🕊️"}
                </span>
              )}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}
