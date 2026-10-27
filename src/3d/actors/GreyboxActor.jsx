import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { ROLE_COLORS, ROLE_EMOJIS, ROLE_LABELS, getPublicCitizenPersona } from "../../config/roles.config.js";
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
import { evaluateActorChoreography } from "../animation/actorChoreography3D.js";

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
  roomCode = "MASOI",
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
  alphaWolfId = null,
  isMayorRevealed = false,
  isMyLoverPartner = false,
  isCupidSelected = false,
  isHunterPending = false,
  onLobbyKick = null,
  canLobbyKick = false,
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
  choreoActionSpec = null,
  choreoTiming = null,
  seatMap = null,
  gallowsSpot = null,
  onSelect,
}) {
  const [hovered, setHovered] = useState(false);
  const [metamorphWolfActive, setMetamorphWolfActive] = useState(false);

  const actorRootRef = useRef(null);
  const actorBodyMoverRef = useRef(null);
  const footShadowRef = useRef(null);
  const pelvisGroupRef = useRef(null);
  const leftThighRef = useRef(null);
  const rightThighRef = useRef(null);
  const leftKneeRef = useRef(null);
  const rightKneeRef = useRef(null);
  const tunicMatRef = useRef(null);
  const choreoPoseRef = useRef(null);
  const spineRef = useRef(null);
  const headRef = useRef(null);
  const leftArmRef = useRef(null);
  const rightArmRef = useRef(null);
  const ghostSpiritRef = useRef(null);
  const selectRingRef = useRef(null);
  const labelDomRef = useRef(null);
  const labelWorldPos = useMemo(() => new THREE.Vector3(), []);
  const tempEmissiveColor = useMemo(() => new THREE.Color(), []);
  const { contactAOMap } = useMemo(() => getProceduralGroundAssets(), []);

  useEffect(() => {
    if (choreoActionSpec?.actionType !== "cursed_blood_metamorph") {
      setMetamorphWolfActive(false);
    }
  }, [choreoActionSpec?.actionType, choreoTiming?.startedAtPerfMs]);

  // Trong lúc chiếu lại Story 2A, trạng thái Sống/Chết có thể tua ngược theo từng Đêm/Ngày!
  // Đặc biệt: Trong 15s 'hunter_revenge', Thợ Săn vẫn giữ thân xác thật cầm Nỏ Bạc bóp cò rồi mới hóa Hồn Ma!
  const actualIsDead = !player.alive;
  const isHoldingLastBreath = Boolean(isHunterPending && phase === "hunter_revenge" && !hasWinner);
  const effectiveIsDead =
    hasWinner && typeof recapActorState?.simAlive === "boolean"
      ? !recapActorState.simAlive
      : isHoldingLastBreath
        ? false
        : actualIsDead;

  const recapPose = hasWinner ? recapActorState?.pose || null : null; // 'castLunge' | 'hitRecoil' | 'cheer' | 'defend' | null
  const enduringFire = Boolean(recapActorState?.enduringFire);

  const seed = useMemo(() => {
    let s = 0;
    for (let i = 0; i < player.id.length; i++) s += player.id.charCodeAt(i);
    return (s % 100) * 0.13;
  }, [player.id]);

  const isEmptyLobbySeat = Boolean(player.isEmptyLobbySeat);
  const isLobbyPhase = phase === "lobby";

  // ==================== MA TRẬN BẢO MẬT TẠO HÌNH ZERO-LEAK (12 VAI V3.3 + SẢNH CHỜ SÓI 3D) ====================
  const authorizedWolfForm = useMemo(() => {
    if (isEmptyLobbySeat) return false;
    // Ở Sảnh Chờ (phase === 'lobby'): mọi người bước vào ghế nóng đều mặc tạo hình Ma Sói 3D sống động!
    if (isLobbyPhase && !hasWinner) return true;
    if (metamorphWolfActive && hasWinner) return true;
    if (hasWinner) {
      if (recapActorState && recapActorState.isRevealed === false) return false;
      const activeRole = recapActorState?.overrideRole || player.role;
      return activeRole === "wolf" || activeRole === "alpha_wolf";
    }
    return (
      (isNight &&
        !actualIsDead &&
        ((isMe && (myRole === "wolf" || myRole === "alpha_wolf")) || isWolfTeammate)) ||
      (actualIsDead && (player.role === "wolf" || player.role === "alpha_wolf"))
    );
  }, [isEmptyLobbySeat, isLobbyPhase, metamorphWolfActive, hasWinner, recapActorState, player.role, isNight, actualIsDead, isMe, myRole, isWolfTeammate]);

  // Vai trò thực tế được phép gắn Phụ kiện 3D lên nhân vật trên màn hình của người đang xem:
  // - Ở Sảnh chờ (`isLobbyPhase`) & Trong trận (mắt người khác nhìn vào): trả về `null` để ngồi đúng Avatar 3D Dân Làng / Người Thật (`player.citizenModelId`)!
  const visibleCostumeRole = useMemo(() => {
    if (isEmptyLobbySeat) return null;
    if (isLobbyPhase && !hasWinner) return null;
    if (metamorphWolfActive && hasWinner) return "wolf";
    if (hasWinner) {
      if (recapActorState && recapActorState.isRevealed === false) return null;
      return recapActorState?.overrideRole || player.role || "villager";
    }
    if (authorizedWolfForm) {
      const isAlphaActor =
        player.role === "alpha_wolf" ||
        (isMe && myRole === "alpha_wolf") ||
        (alphaWolfId && player.id === alphaWolfId);
      return isAlphaActor ? "alpha_wolf" : "wolf";
    }
    if (actualIsDead && player.role) return player.role;
    // Trưởng Làng đã công bố Quyền Trượng -> cả làng đều thấy Vương Miện & Quyền Trượng Vàng!
    if (isMayorRevealed && !actualIsDead) return "mayor";
    // Chỉ riêng bản thân (isMe) nhìn thấy phụ kiện vai bí mật của mình trên máy mình!
    if (isMe && myRole) return myRole;
    return null;
  }, [isEmptyLobbySeat, isLobbyPhase, metamorphWolfActive, hasWinner, recapActorState, player.role, player.id, authorizedWolfForm, alphaWolfId, actualIsDead, isMayorRevealed, isMe, myRole]);

  const showTrialTorchSocket = Boolean(
    (isMe && phase === "day_final_vote" && myFinalVote === "hang") ||
      choreoActionSpec?.actionType === "tribunal_torch_stand"
  );

  const publicPersona = useMemo(
    () => getPublicCitizenPersona(roomCode, seatTransform?.seatIdx ?? 0),
    [roomCode, seatTransform?.seatIdx]
  );

  const isWolfVisual = visibleCostumeRole === "wolf" || visibleCostumeRole === "alpha_wolf";
  const activeCharSlot = useMemo(
    () =>
      resolveActiveCharacterSlot({
        hasWinner,
        visibleCostumeRole,
        citizenModelId: player?.citizenModelId || null,
        seatIndex: seatTransform?.seatIdx ?? 0,
        roomCode,
        preferAltWolf: Boolean(metamorphWolfActive),
      }),
    [hasWinner, visibleCostumeRole, player?.citizenModelId, seatTransform?.seatIdx, roomCode, metamorphWolfActive]
  );
  const characterGlbEntry = useOptionalCharacterGlb(activeCharSlot);
  const isStandingSmartMesh = Boolean(
    characterGlbEntry && !characterGlbEntry.hasRig && !effectiveIsDead
  );
  const htmlBadgeY = effectiveIsDead
    ? 1.66
    : isStandingSmartMesh
      ? (characterGlbEntry.standingHeight || 1.76) + 0.22
      : 1.54;
  const htmlBadgeZ = isStandingSmartMesh ? 0.12 : 0;
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

  // Màu trang phục thân nhân vật (khóa cứng theo publicPersonaSeed của roomCode + seatIdx — Chốt #10)
  const tunicColor = useMemo(() => {
    if (effectiveIsDead) return "#1e3a5f";
    if (isWolfVisual) return "#691414";
    if (hasWinner && visibleCostumeRole && ROLE_COSTUME_MANIFEST[visibleCostumeRole]) {
      return ROLE_COSTUME_MANIFEST[visibleCostumeRole].tunicColor;
    }
    return publicPersona.tunicHex || VILLAGER_TUNIC_PALETTE[seatTransform.seatIdx % VILLAGER_TUNIC_PALETTE.length];
  }, [effectiveIsDead, isWolfVisual, hasWinner, visibleCostumeRole, publicPersona.tunicHex, seatTransform.seatIdx]);

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
    ((phase === "night_cupid" && myRole === "cupid") ||
      (phase === "night_guard" && myRole === "guard") ||
      (phase === "night_wolf" && (myRole === "wolf" || myRole === "alpha_wolf")) ||
      (phase === "night_witch" && myRole === "witch") ||
      (phase === "night_seer" && myRole === "seer"));
  const isSleeping =
    !isLobbyPhase && isNight && !hasWinner && !effectiveIsDead && !authorizedWolfForm && !isMyActiveNightRole;

  // ==================== PROCEDURAL SPRING & SPATIAL CHOREOGRAPHY 60 FPS ====================
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const breathPhase = t * 2.1 + seed;

    // 0. Tính toán Quỹ Đạo Không Gian Rời Ghế & Xương 9 Vai (Wolf Pounce / Guard Clash / Gallows Walk / Cast)
    let choreo = null;
    if (choreoActionSpec && !effectiveIsDead) {
      let progress = 0.5;
      if (typeof choreoTiming?.manualProgress === "number") {
        progress = choreoTiming.manualProgress;
      } else if (choreoTiming?.startedAtPerfMs && choreoTiming?.durationMs > 0) {
        const nowPerf = typeof performance !== "undefined" ? performance.now() : Date.now();
        progress = THREE.MathUtils.clamp(
          (nowPerf - choreoTiming.startedAtPerfMs) / choreoTiming.durationMs,
          0,
          1
        );
      }
      choreo = evaluateActorChoreography({
        choreoRoleAction: choreoActionSpec,
        progress,
        seatTransform,
        seatMap,
        gallowsSpot,
        tClock: t,
      });

      // Chuyển hình trực tiếp Kẻ Bị Nguyền -> Ma Sói đúng khoảnh khắc 42% (ngửa cổ hú trăng!)
      if (choreoActionSpec.actionType === "cursed_blood_metamorph") {
        const shouldBeWolf = Boolean(choreo?.overrideCostumeRole === "wolf");
        if (shouldBeWolf !== metamorphWolfActive) {
          setMetamorphWolfActive(shouldBeWolf);
        }
      }
    }
    choreoPoseRef.current = choreo;

    const damp = Math.min(1, delta * (choreo ? 14 : 6.8));

    // Dịch chuyển cụm cơ thể (`actorBodyMoverRef`) độc lập 100% với ghế sồi (`prop_chair` giữ nguyên tại chỗ!)
    if (actorBodyMoverRef.current) {
      const goalLX = choreo ? choreo.localX : 0;
      const goalLY = choreo ? choreo.localY : 0;
      const goalLZ = choreo ? choreo.localZ : 0;
      const goalLYaw = choreo ? choreo.localYaw : 0;

      actorBodyMoverRef.current.position.x = THREE.MathUtils.lerp(actorBodyMoverRef.current.position.x, goalLX, damp);
      actorBodyMoverRef.current.position.y = THREE.MathUtils.lerp(actorBodyMoverRef.current.position.y, goalLY, damp);
      actorBodyMoverRef.current.position.z = THREE.MathUtils.lerp(actorBodyMoverRef.current.position.z, goalLZ, damp);

      let yawDiff = goalLYaw - actorBodyMoverRef.current.rotation.y;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      actorBodyMoverRef.current.rotation.y += yawDiff * damp;

      // Bóng đổ tiếp đất dưới hai bàn chân tự bám mặt sân đá y=0.009 và thu nhỏ mềm khi Sói bật nhảy lên không!
      if (footShadowRef.current) {
        const airH = Math.max(0, actorBodyMoverRef.current.position.y);
        footShadowRef.current.position.y = -airH + 0.009;
        footShadowRef.current.position.z = choreo ? 0.04 : isStandingSmartMesh ? 0.12 : 0.28;
        const shadowScale = THREE.MathUtils.clamp(1 - airH * 0.42, 0.42, 1.08);
        footShadowRef.current.scale.setScalar(shadowScale);
      }
    }

    // Nội suy Động Khớp Đùi & Đầu Gối (sitFactor: 1.0 ngồi ghế 0.48m <-> 0.0 đứng thẳng / nhảy / đi bộ)
    const goalSitFactor = choreo ? choreo.sitFactor : 1.0;
    const goalHipY = THREE.MathUtils.lerp(0.71, SEAT_TOP_Y, goalSitFactor);

    if (pelvisGroupRef.current) {
      pelvisGroupRef.current.position.y = THREE.MathUtils.lerp(pelvisGroupRef.current.position.y, goalHipY, damp);
      const sitHalfPi = goalSitFactor * (Math.PI / 2);
      const goalLThigh = -sitHalfPi + (choreo ? choreo.leftThighAddX : 0);
      const goalRThigh = -sitHalfPi + (choreo ? choreo.rightThighAddX : 0);
      const goalLKnee = sitHalfPi + (choreo ? choreo.leftKneeAddX : 0);
      const goalRKnee = sitHalfPi + (choreo ? choreo.rightKneeAddX : 0);

      if (leftThighRef.current) {
        leftThighRef.current.rotation.x = THREE.MathUtils.lerp(leftThighRef.current.rotation.x, goalLThigh, damp);
      }
      if (rightThighRef.current) {
        rightThighRef.current.rotation.x = THREE.MathUtils.lerp(rightThighRef.current.rotation.x, goalRThigh, damp);
      }
      if (leftKneeRef.current) {
        leftKneeRef.current.rotation.x = THREE.MathUtils.lerp(leftKneeRef.current.rotation.x, goalLKnee, damp);
      }
      if (rightKneeRef.current) {
        rightKneeRef.current.rotation.x = THREE.MathUtils.lerp(rightKneeRef.current.rotation.x, goalRKnee, damp);
      }
    }

    // 1. Thân trên: Thở / Ngủ / Chết / Hoặc Diễn Kịch Không Gian 9 Vai
    if (spineRef.current) {
      let targetLeanX = 0;
      let targetTwistY = 0;
      let targetPosY = goalHipY;
      let targetPosZ = 0;

      if (choreo) {
        targetLeanX = choreo.spineLeanX;
        targetTwistY = choreo.spineTwistY || 0;
        targetPosY = goalHipY;
        targetPosZ = 0;
      } else if (effectiveIsDead) {
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
      } else if (isSpeaking) {
        targetLeanX = -0.04 + Math.sin(t * 9.5 + seed) * 0.045;
        targetPosY = SEAT_TOP_Y + Math.abs(Math.sin(t * 9.5 + seed)) * 0.024;
      } else {
        targetLeanX = isDefendant || recapPose === "defend" ? -0.07 : Math.sin(breathPhase) * 0.025;
        targetPosY = SEAT_TOP_Y + Math.sin(breathPhase) * 0.009;
      }

      spineRef.current.rotation.x = THREE.MathUtils.lerp(spineRef.current.rotation.x, targetLeanX, damp);
      spineRef.current.rotation.y = THREE.MathUtils.lerp(spineRef.current.rotation.y, targetTwistY, damp);
      spineRef.current.position.y = THREE.MathUtils.lerp(spineRef.current.position.y, targetPosY, damp);
      spineRef.current.position.z = THREE.MathUtils.lerp(spineRef.current.position.z, targetPosZ, damp);
    }

    // Hiệu ứng bừng sáng áo choàng ở nhịp Climax (Sói đỏ, Khiên lam, Lửa cam, Chán Đời tím)
    if (tunicMatRef.current) {
      const hex = choreo?.bodyEmissiveHex || (recapPose === "hitRecoil" || isWolfVictim ? "#ef4444" : null);
      const inten = choreo?.bodyEmissiveHex
        ? choreo.bodyEmissiveIntensity || 0
        : recapPose === "hitRecoil"
          ? 0.65
          : isWolfVictim
            ? 0.45
            : 0;
      if (hex && inten > 0.01) {
        tempEmissiveColor.set(hex);
        tunicMatRef.current.emissive.copy(tempEmissiveColor);
        tunicMatRef.current.emissiveIntensity = inten;
      } else {
        tunicMatRef.current.emissiveIntensity = 0;
      }
    }

    // 2. Xương Đầu (Head LookAt theo người đang nói Mic / Bị cáo / Hoạt Cảnh 9 Vai)
    if (headRef.current) {
      let targetYaw = 0;
      let targetPitch = 0;

      if (choreo) {
        targetPitch = choreo.headPitchX || 0;
        targetYaw = choreo.headYawY || 0;
      } else if (effectiveIsDead) {
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

      headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, targetYaw, damp);
      headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, targetPitch, damp);
    }

    // 3. Đôi cánh tay (Chỉ tay / Diễn thuyết Mic / Sói chém vuốt / Bảo Vệ giương khiên / Chán Đời dang tay)
    if (rightArmRef.current && leftArmRef.current) {
      let targetRightX = -0.48;
      let targetLeftX = -0.48;
      let targetRightZ = 0;
      let targetLeftZ = 0;

      if (choreo) {
        targetRightX = choreo.rightArmPitchX;
        targetLeftX = choreo.leftArmPitchX;
        targetRightZ = choreo.rightArmSpreadZ || 0;
        targetLeftZ = choreo.leftArmSpreadZ || 0;
      } else if (effectiveIsDead || isSleeping) {
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

      rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, targetRightX, damp);
      leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, targetLeftX, damp);
      rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, targetRightZ, damp);
      leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, targetLeftZ, damp);
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

    // 6. Kẹp tỷ lệ chữ trên màn hình bám theo vị trí thực tế của nhân vật (kể cả khi đang bay vồ mồi!)
    if (labelDomRef.current) {
      const wx = choreo ? choreo.worldX : seatTransform.x;
      const wy = (choreo ? choreo.worldY : 0) + htmlBadgeY;
      const wz = choreo ? choreo.worldZ : seatTransform.z;
      labelWorldPos.set(wx, wy, wz);
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
  }, [architectMode, reloadToken, effectiveIsDead, visibleCostumeRole, characterGlbEntry]);

  return (
    <group
      ref={actorRootRef}
      position={[seatTransform.x, 0, seatTransform.z]}
      rotation={[0, seatTransform.facingYaw, 0]}
    >
      {/* ============ 0. BÓNG TIẾP XÚC MỀM DƯỚI CHÂN GHẾ (CỐ ĐỊNH TẠI GHẾ) ============ */}
      <mesh
        position={[0, 0.008, isStandingSmartMesh ? -0.36 : -0.02]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
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

      {/* ============ 1. GHẾ GỖ SỒI CHUẨN CAO 0.48m (LÙI NHẸ -0.34m KHI NHÂN VẬT ĐỨNG SMART MESH ĐỂ 0% XUYÊN GHẾ!) ============ */}
      <group position={[0, 0, isStandingSmartMesh ? -0.34 : 0]}>
        <SmartPropGLB
          propKey="prop_chair"
          calib={chairCalib}
          reloadToken={reloadToken}
          disableRaycast={architectMode}
          fallback={<ProceduralOakChair />}
        />
      </group>

      {/* Ghế trống chờ khách ở Sảnh Chờ 3D: chỉ dựng Ghế Gỗ Sồi + Nhãn ghế mờ tinh tế, ai bước vào sẽ hóa Sói ngồi lên ngay! */}
      {isEmptyLobbySeat ? (
        <Html position={[0, 1.0, 0]} center zIndexRange={[20, 0]}>
          <div
            style={{
              padding: "2px 8px",
              borderRadius: "999px",
              fontSize: "10.5px",
              fontWeight: 600,
              color: "rgba(226, 232, 240, 0.58)",
              background: "rgba(15, 23, 42, 0.48)",
              border: "1px dashed rgba(148, 163, 184, 0.3)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            🪑 {player.name}
          </div>
        </Html>
      ) : (
        <>
      {/* ============ 2. VÒNG SÁNG TRẠNG THÁI DƯỚI CHÂN GHẾ ============ */}
      {isMe && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <ringGeometry args={[0.46, 0.56, 32]} />
          <meshBasicMaterial color={isLobbyPhase ? "#ef4444" : roleAccentColor} transparent opacity={0.85} />
        </mesh>
      )}

      {(isSelected || isCupidSelected || (hovered && !actualIsDead && !hasWinner)) && (
        <mesh ref={selectRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, 0]}>
          <ringGeometry args={[0.56, 0.68, 24]} />
          <meshBasicMaterial
            color={isCupidSelected ? "#ec4899" : isSelected ? "#f59e0b" : "#fde68a"}
            transparent
            opacity={isCupidSelected || isSelected ? 0.95 : 0.45}
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

      {/* ============ CỤM CƠ THỂ ĐỘNG RỜI GHẾ (actorBodyMoverRef: Sói phóng vồ / Bảo Vệ chắn khiên / Đi bộ Pháp trường) ============ */}
      <group ref={actorBodyMoverRef}>
        {/* Bóng chân tiếp đất tự động bám sân đá y=0.009 và thu nhỏ mềm khi bật nhảy lên không trung */}
        <mesh
          ref={footShadowRef}
          position={[0, 0.009, isStandingSmartMesh ? 0.12 : 0.28]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[isStandingSmartMesh ? 0.34 : 0.29, 18]} />
          <meshBasicMaterial
            map={contactAOMap}
            transparent
            opacity={effectiveIsDead ? 0.14 : 0.52}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>

        {/* ============ 3. THÂN NHÂN VẬT + SOCKET ĐẠO CỤ 9 VAI ============ */}
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
          {/* ƯU TIÊN NHÂN VẬT 3D .GLB TỪ TRIPO AI (Hỗ trợ Kép Smart Mesh Y=0.00m & Auto-Rig; khi tử nạn ẩn tượng để hiện Hồn Ma!) */}
          {characterGlbEntry ? (
            !effectiveIsDead ? (
              <>
                <SkinnedCharacterGLB
                  slotKey={activeCharSlot}
                  templateEntry={characterGlbEntry}
                  tunicColor={tunicColor}
                  effectiveIsDead={effectiveIsDead}
                  isWolfVictim={isWolfVictim}
                  recapPose={recapPose}
                  choreoPoseRef={choreoPoseRef}
                  isSleeping={isSleeping}
                  isDefendant={isDefendant}
                  isSpeaking={isSpeaking}
                  hasPointTarget={hasPointTarget}
                  phase={phase}
                  hasWinner={hasWinner}
                  lookTargetWorld={lookTargetWorld}
                  seatTransform={seatTransform}
                  visibleCostumeRole={visibleCostumeRole}
                  showTrialTorchSocket={showTrialTorchSocket}
                  seed={seed}
                />
                {isSleeping && (
                  <group
                    position={[
                      0,
                      isStandingSmartMesh
                        ? (characterGlbEntry.standingHeight || 1.76) - 0.14
                        : SEAT_TOP_Y + 0.58,
                      isStandingSmartMesh ? 0.14 : 0.02,
                    ]}
                  >
                    <SleepingMotes3D seed={seed} />
                  </group>
                )}
              </>
            ) : null
          ) : (
            <>
              {/* Khung Chậu & Khớp Chân 2 Đốt Động (Hông -> Đùi -> Đầu Gối -> Bắp Chân & Ủng) nội suy mượt giữa Ngồi 0.48m & Đứng/Nhảy/Đi bộ! */}
              <group ref={pelvisGroupRef} position={[0, SEAT_TOP_Y, 0]}>
                <mesh position={[0, 0.048, 0.05]} scale={[1.15, 0.65, 1.05]} castShadow={!effectiveIsDead}>
                  <sphereGeometry args={[0.175, 20, 16]} />
                  <meshStandardMaterial
                    color={cloakTrimColor}
                    transparent={effectiveIsDead}
                    opacity={bodyOpacity}
                    roughness={0.9}
                  />
                </mesh>

                {[-0.105, 0.105].map((lx, idx) => (
                  <group
                    key={idx}
                    ref={idx === 0 ? rightThighRef : leftThighRef}
                    position={[lx, 0.036, 0.03]}
                    rotation={[-Math.PI / 2, 0, 0]}
                  >
                    {/* Đùi (xoay quanh khớp Hông: khi ngồi gập -90° đưa gối ra trước +Z, khi đứng/nhảy duỗi thẳng 0° xuống -Y!) */}
                    <mesh position={[0, -0.115, 0]} castShadow={!effectiveIsDead}>
                      <capsuleGeometry args={[0.062, 0.19, 10, 16]} />
                      <meshStandardMaterial
                        color={pantsColor}
                        transparent={effectiveIsDead}
                        opacity={bodyOpacity}
                        roughness={0.86}
                      />
                    </mesh>

                    {/* Khớp Đầu Gối (xoay độc lập để co chân khi Sói nhảy Parabol & bước bộ ra Đài Treo Cổ!) */}
                    <group
                      ref={idx === 0 ? rightKneeRef : leftKneeRef}
                      position={[0, -0.23, 0]}
                      rotation={[Math.PI / 2, 0, 0]}
                    >
                      <mesh position={[0, -0.2, 0]} castShadow={!effectiveIsDead}>
                        <capsuleGeometry args={[0.052, 0.28, 10, 16]} />
                        <meshStandardMaterial
                          color={effectiveIsDead ? pantsColor : "#271c15"}
                          transparent={effectiveIsDead}
                          opacity={bodyOpacity}
                          roughness={0.8}
                        />
                      </mesh>
                      <mesh position={[0, -0.415, 0.045]} scale={[0.96, 0.68, 1.48]}>
                        <sphereGeometry args={[0.064, 14, 14]} />
                        <meshStandardMaterial
                          color={effectiveIsDead ? "#0284c7" : "#1c140f"}
                          transparent={effectiveIsDead}
                          opacity={bodyOpacity}
                          roughness={0.76}
                        />
                      </mesh>
                    </group>
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
                    ref={tunicMatRef}
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
                {!effectiveIsDead && (visibleCostumeRole || showTrialTorchSocket) && (
                  <RoleHandSocket3D
                    roleKey={visibleCostumeRole}
                    side="right"
                    showTrialTorch={showTrialTorchSocket}
                  />
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
        position={[0, htmlBadgeY, htmlBadgeZ]}
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
              {!player.connected && !isLobbyPhase && <span>🔌</span>}
              {isLobbyPhase && (
                <span title={player.isHost ? "Chủ phòng" : player.ready ? "Đã sẵn sàng" : "Đang chờ sẵn sàng"}>
                  {player.isHost ? "👑" : player.ready ? "🟢" : "⏳"}
                </span>
              )}
              {effectiveIsDead && <span>👻</span>}
              {isHunterPending && <span title="Thợ Săn đang ngắm bắn trả thù!">🏹</span>}
              {isMayorRevealed && !hasWinner && (
                <span
                  title="Trưởng Làng đã công bố Quyền Trượng (Lá phiếu x2)"
                  style={{
                    background: "linear-gradient(135deg, #f59e0b, #b45309)",
                    color: "#0f172a",
                    fontWeight: 900,
                    fontSize: "9.5px",
                    padding: "0 4px",
                    borderRadius: "999px",
                  }}
                >
                  👑x2
                </span>
              )}
              {isMyLoverPartner && !hasWinner && <span title="Nửa kia Tình Nhân của bạn">💘</span>}
              {isCupidSelected && !hasWinner && <span title="Đã chọn ghép đôi">💘</span>}
              {isDefendant && !hasWinner && <span title="Đang trên Ghế Nóng">⚖️</span>}
              {isWolfVictim && !hasWinner && <span title="Bị Sói cắn đêm nay">🩸</span>}
              <span>{player.name}</span>
              {isMe && <span>★</span>}
              {isLobbyPhase && canLobbyKick && onLobbyKick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLobbyKick(player);
                  }}
                  title={`Kick ${player.name} khỏi phòng`}
                  style={{
                    width: "16px",
                    height: "16px",
                    margin: "0 0 0 2px",
                    padding: 0,
                    borderRadius: "50%",
                    fontSize: "9px",
                    fontWeight: 800,
                    background: "rgba(220, 38, 38, 0.85)",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    pointerEvents: "auto",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ✕
                </button>
              )}
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
        </>
      )}
    </group>
  );
}
