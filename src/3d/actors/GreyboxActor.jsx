import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { ROLE_COLORS, ROLE_EMOJIS, ROLE_LABELS } from "../../config/roles.config.js";
import { SEAT_TOP_Y } from "../utils/seatLayout.js";
import SmartPropGLB from "../props/SmartPropGLB.jsx";
import { getProceduralGroundAssets } from "../utils/proceduralGroundPBR.js";

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

// Bảng màu áo Dân Làng ban ngày (biến tấu tự động để các ghế không trùng màu nhau)
const VILLAGER_TUNIC_PALETTE = [
  "#3b82f6", // Xanh lam
  "#d97706", // Cam đất
  "#059669", // Xanh ngọc lục
  "#7c3aed", // Tím chàm
  "#db2777", // Hồng sẫm
  "#0891b2", // Xanh biển
  "#65a30d", // Xanh rêu
  "#b45309", // Nâu hổ phách
  "#4f46e5", // Chàm
  "#be123c", // Đỏ rượu
];

/**
 * Nhân vật Khối Hộp Có Khớp (Articulated Greybox Character — Chuẩn cao 1.75m, ngồi ghế y = 0.48m):
 * Kiểm chứng toàn bộ tỷ lệ ngồi ghế, hướng nhìn cổ (Head LookAt), nói Mic, chỉ tay đề cử,
 * hóa Sói ban đêm (Zero-Leak) và hóa Linh Hồn khi chết trước khi thay model .glb từ Blender ở Ngày 3.
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
  onSelect,
}) {
  const [hovered, setHovered] = useState(false);

  const actorRootRef = useRef(null);
  const spineRef = useRef(null);
  const headRef = useRef(null);
  const leftArmRef = useRef(null);
  const rightArmRef = useRef(null);
  const selectRingRef = useRef(null);
  const labelDomRef = useRef(null);
  const labelWorldPos = useMemo(() => new THREE.Vector3(), []);
  const { contactAOMap } = useMemo(() => getProceduralGroundAssets(), []);

  const isDead = !player.alive;
  const seed = useMemo(() => {
    let s = 0;
    for (let i = 0; i < player.id.length; i++) s += player.id.charCodeAt(i);
    return (s % 100) * 0.13;
  }, [player.id]);

  // Chỉ lộ hình thái Sói khi đúng luật: đêm bầy Sói nhìn nhau, hoặc đã chết lật bài là Sói, hoặc ván đã kết thúc
  const authorizedWolfForm =
    (!hasWinner && isNight && !isDead && ((isMe && myRole === "wolf") || isWolfTeammate)) ||
    ((isDead || hasWinner) && player.role === "wolf");

  // Lộ màu vai trò thật khi là chính mình, khi đã chết, hoặc khi kết thúc ván
  const revealedRole = isMe ? myRole : player.role;
  const roleAccentColor = revealedRole ? ROLE_COLORS[revealedRole] || "#fbbf24" : "#94a3b8";

  // Màu trang phục thân nhân vật
  const tunicColor = useMemo(() => {
    if (isDead) return "#38bdf8";
    if (authorizedWolfForm) return "#7f1d1d";
    if (hasWinner && player.role && ROLE_COLORS[player.role]) {
      return ROLE_COLORS[player.role];
    }
    return VILLAGER_TUNIC_PALETTE[seatTransform.seatIdx % VILLAGER_TUNIC_PALETTE.length];
  }, [isDead, authorizedWolfForm, hasWinner, player.role, seatTransform.seatIdx]);

  const skinColor = isDead ? "#7dd3fc" : authorizedWolfForm ? "#374151" : "#f1c27d";
  const pantsColor = isDead ? "#0284c7" : authorizedWolfForm ? "#1f2937" : "#334155";
  const opacity = isDead ? 0.36 : 1;

  // Ngủ gục ban đêm nếu không phải Sói đang thức và không phải lượt vai của chính mình
  const isMyActiveNightRole =
    isMe &&
    ((phase === "night_guard" && myRole === "guard") ||
      (phase === "night_wolf" && myRole === "wolf") ||
      (phase === "night_witch" && myRole === "witch") ||
      (phase === "night_seer" && myRole === "seer"));
  const isSleeping = isNight && !hasWinner && !isDead && !authorizedWolfForm && !isMyActiveNightRole;

  // Procedural Life: Nhịp thở lệch pha + Xoay cổ nhìn người nói Mic / Ghế nóng + Cử động tay
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const breathPhase = t * 2.1 + seed;

    // 1. Thân trên thở nhẹ (hoặc nhấp nhô nhanh hơn khi bật Mic nói / Biện hộ)
    if (spineRef.current) {
      if (isDead) {
        spineRef.current.rotation.x = THREE.MathUtils.lerp(spineRef.current.rotation.x, 0.22, delta * 4);
        spineRef.current.position.y = SEAT_TOP_Y + 0.04 + Math.sin(t * 1.4 + seed) * 0.025;
      } else if (isSleeping) {
        spineRef.current.rotation.x = THREE.MathUtils.lerp(spineRef.current.rotation.x, 0.18, delta * 4);
        spineRef.current.position.y = SEAT_TOP_Y;
      } else {
        const lean = isDefendant ? -0.06 : Math.sin(breathPhase) * 0.025;
        spineRef.current.rotation.x = THREE.MathUtils.lerp(spineRef.current.rotation.x, lean, delta * 6);
        spineRef.current.position.y = SEAT_TOP_Y + Math.sin(breathPhase) * 0.008;
      }
    }

    // 2. Xương Đầu (Head LookAt theo người đang nói Mic / Bị cáo Ghế Nóng)
    if (headRef.current) {
      let targetYaw = 0;
      let targetPitch = 0;

      if (isDead) {
        targetPitch = 0.28;
      } else if (isSleeping) {
        targetPitch = 0.36;
        targetYaw = Math.sin(t * 0.6 + seed) * 0.06;
      } else if (isSpeaking) {
        targetPitch = Math.sin(t * 11) * 0.09;
        targetYaw = Math.cos(t * 6.5) * 0.12;
      } else if (lookTargetWorld) {
        // Đổi góc từ ghế mình nhìn sang ghế người đang nói (giới hạn cổ xoay tối đa +-50 độ để tự nhiên)
        const dx = lookTargetWorld.x - seatTransform.x;
        const dz = lookTargetWorld.z - seatTransform.z;
        if (Math.hypot(dx, dz) > 0.2) {
          const worldAngle = Math.atan2(dx, dz);
          let relYaw = worldAngle - seatTransform.facingYaw;
          while (relYaw > Math.PI) relYaw -= Math.PI * 2;
          while (relYaw < -Math.PI) relYaw += Math.PI * 2;
          targetYaw = THREE.MathUtils.clamp(relYaw * 0.72, -0.85, 0.85);
        }
      } else {
        targetYaw = Math.sin(t * 0.75 + seed) * 0.14;
        targetPitch = Math.cos(t * 1.1 + seed) * 0.04;
      }

      headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, targetYaw, delta * 5.5);
      headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, targetPitch, delta * 5.5);
    }

    // 3. Cánh tay phải (Chỉ tay đề cử / Khua tay khi nói Mic / Biện hộ)
    if (rightArmRef.current && leftArmRef.current) {
      if (isDead || isSleeping) {
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, -0.35, delta * 5);
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, -0.35, delta * 5);
      } else if (hasPointTarget && (phase === "day_nominate" || phase === "day_defense")) {
        // Chỉ thẳng tay về phía trước tố cáo!
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, -1.42, delta * 8);
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, -0.45, delta * 6);
      } else if (isSpeaking || (isDefendant && phase === "day_defense")) {
        rightArmRef.current.rotation.x = -0.75 + Math.sin(t * 8.5 + seed) * 0.32;
        leftArmRef.current.rotation.x = -0.75 + Math.cos(t * 7.8 + seed) * 0.32;
      } else if (authorizedWolfForm && phase === "night_wolf") {
        // Tư thế giương vuốt rình mồi ban đêm của Sói
        rightArmRef.current.rotation.x = -0.95 + Math.sin(t * 4 + seed) * 0.12;
        leftArmRef.current.rotation.x = -0.95 + Math.cos(t * 4 + seed) * 0.12;
      } else {
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, -0.48, delta * 5);
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, -0.48, delta * 5);
      }
    }

    // 4. Vòng chọn mục tiêu xoay nhẹ dưới đất
    if (selectRingRef.current) {
      selectRingRef.current.rotation.z += delta * 1.6;
    }

    // 5. Kẹp tỷ lệ chữ trên màn hình (Clamped Screen-Space Scale: tối đa 1.0x ở gần, thu nhẹ 0.82x ở ghế xa)
    if (labelDomRef.current) {
      labelWorldPos.set(seatTransform.x, 1.5, seatTransform.z);
      const dist = state.camera.position.distanceTo(labelWorldPos);
      const clampedScale = THREE.MathUtils.clamp(6.2 / Math.max(dist, 6.2), 0.82, 1.0);
      labelDomRef.current.style.transform = `scale(${clampedScale.toFixed(3)})`;
    }
  });

  const handlePointerClick = (e) => {
    e.stopPropagation();
    if (!isDead && onSelect) {
      onSelect(player.id);
    }
  };

  // Khi bật D5 Architect Mode: cho tia chuột xuyên thẳng qua toàn bộ Ghế & Nhân vật để click chọn Nhà / Cây phía sau dễ dàng 100%!
  useEffect(() => {
    if (!actorRootRef.current) return;
    const noop = () => {};
    actorRootRef.current.traverse((obj) => {
      if (obj.isMesh) {
        obj.raycast = architectMode ? noop : THREE.Mesh.prototype.raycast;
      }
    });
  }, [architectMode, reloadToken, isDead, authorizedWolfForm]);

  return (
    <group
      ref={actorRootRef}
      position={[seatTransform.x, 0, seatTransform.z]}
      rotation={[0, seatTransform.facingYaw, 0]}
    >
      {/* ============ 0. BÓNG TIẾP XÚC MỀM DƯỚI CHÂN GHẾ & GIÀY (CONTACT AO DISC) ============ */}
      <mesh position={[0, 0.008, -0.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.58, 22]} />
        <meshBasicMaterial
          map={contactAOMap}
          transparent
          opacity={isDead ? 0.36 : 0.66}
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
          opacity={isDead ? 0.16 : 0.44}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>

      {/* ============ 1. GHẾ GỖ SỒI CHUẨN CAO 0.48m (HOT-PLUG prop_chair.glb TỪ TRIPO PRO) ============ */}
      <SmartPropGLB
        propKey="prop_chair"
        calib={chairCalib}
        reloadToken={reloadToken}
        disableRaycast={architectMode}
        fallback={<ProceduralOakChair />}
      />

      {/* ============ 2. VÒNG SÁNG TRẠNG THÁI DƯỚI CHÂN GHẾ ============ */}
      {/* Vòng nhận diện ghế của chính mình */}
      {isMe && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <ringGeometry args={[0.46, 0.56, 32]} />
          <meshBasicMaterial color={roleAccentColor} transparent opacity={0.85} />
        </mesh>
      )}

      {/* Vòng mục tiêu đang được click chọn */}
      {(isSelected || (hovered && !isDead)) && (
        <mesh ref={selectRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, 0]}>
          <ringGeometry args={[0.56, 0.68, 24]} />
          <meshBasicMaterial color={isSelected ? "#f59e0b" : "#fde68a"} transparent opacity={isSelected ? 0.95 : 0.45} />
        </mesh>
      )}

      {/* Vòng sóng âm xanh lá khi bật Mic nói */}
      {isSpeaking && !isDead && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.028, 0]}>
          <ringGeometry args={[0.62, 0.74, 32]} />
          <meshBasicMaterial color="#22c55e" transparent opacity={0.85} />
        </mesh>
      )}

      {/* Cột đèn Spotlight chiếu thẳng xuống Bị Cáo trên Ghế Nóng */}
      {isDefendant && !isDead && (
        <mesh position={[0, 1.85, 0]}>
          <cylinderGeometry args={[0.18, 0.75, 3.7, 20, 1, true]} />
          <meshBasicMaterial color="#f97316" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}

      {/* Ngọn nến tắt trước ghế nếu người chơi đã chết (!p.alive) */}
      {isDead && (
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

      {/* ============ 3. NHÂN VẬT KHỐI HỘP CÓ KHỚP (GREYBOX RIG — KHÓA CỨNG KHI BẬT D5 ARCHITECT) ============ */}
      <group
        onClick={architectMode ? undefined : handlePointerClick}
        onPointerOver={
          architectMode
            ? undefined
            : (e) => {
                e.stopPropagation();
                if (!isDead) {
                  setHovered(true);
                  document.body.style.cursor = "pointer";
                }
              }
        }
        onPointerOut={
          architectMode
            ? undefined
            : () => {
                setHovered(false);
                document.body.style.cursor = "auto";
              }
        }
      >
        {/* Hai chân đang ngồi trên ghế (Hips -> Thigh -> Calf) */}
        <group position={[0, SEAT_TOP_Y, 0]}>
          {[-0.11, 0.11].map((lx, idx) => (
            <group key={idx} position={[lx, 0.04, 0.08]}>
              {/* Đùi nằm ngang trên mặt ghế */}
              <mesh position={[0, 0, 0.08]} castShadow={!isDead}>
                <boxGeometry args={[0.13, 0.12, 0.34]} />
                <meshStandardMaterial color={pantsColor} transparent={isDead} opacity={opacity} roughness={0.75} />
              </mesh>
              {/* Bắp chân thả vuông góc xuống đất */}
              <mesh position={[0, -0.22, 0.22]} castShadow={!isDead}>
                <boxGeometry args={[0.11, 0.42, 0.12]} />
                <meshStandardMaterial color={pantsColor} transparent={isDead} opacity={opacity} roughness={0.75} />
              </mesh>
              {/* Giày chạm sàn y = 0 */}
              <mesh position={[0, -0.43, 0.26]}>
                <boxGeometry args={[0.12, 0.08, 0.2]} />
                <meshStandardMaterial color="#1e293b" transparent={isDead} opacity={opacity} />
              </mesh>
            </group>
          ))}
        </group>

        {/* Cụm Xương Sống & Thân Trên (Spine Group — tâm tại mặt ghế y = 0.48m) */}
        <group ref={spineRef} position={[0, SEAT_TOP_Y, 0]}>
          {/* Thân áo (Torso) */}
          <mesh position={[0, 0.31, -0.02]} castShadow={!isDead}>
            <boxGeometry args={[authorizedWolfForm ? 0.44 : 0.36, 0.48, 0.23]} />
            <meshStandardMaterial
              color={tunicColor}
              emissive={isDead ? "#0ea5e9" : isWolfVictim ? "#ef4444" : "#000000"}
              emissiveIntensity={isDead ? 0.35 : isWolfVictim ? 0.45 : 0}
              transparent={isDead}
              opacity={opacity}
              roughness={0.65}
            />
          </mesh>

          {/* Cụm Đầu & Cổ (Head Group — có LookAt xoay tự nhiên) */}
          <group ref={headRef} position={[0, 0.62, -0.01]}>
            {/* Khối Đầu */}
            <mesh position={[0, 0.12, 0]} castShadow={!isDead}>
              <boxGeometry args={[0.26, 0.26, 0.26]} />
              <meshStandardMaterial
                color={skinColor}
                emissive={isDead ? "#38bdf8" : "#000000"}
                emissiveIntensity={isDead ? 0.3 : 0}
                transparent={isDead}
                opacity={opacity}
                roughness={0.6}
              />
            </mesh>

            {/* Mũ / Tóc định hướng phía trên đầu */}
            <mesh position={[0, 0.26, -0.01]}>
              <boxGeometry args={[0.28, 0.07, 0.28]} />
              <meshStandardMaterial
                color={authorizedWolfForm ? "#111827" : tunicColor}
                transparent={isDead}
                opacity={opacity}
              />
            </mesh>

            {/* Hai mắt định hướng mặt trước (+Z) */}
            {!isSleeping && (
              <>
                <mesh position={[-0.06, 0.13, 0.132]}>
                  <boxGeometry args={[0.045, 0.035, 0.01]} />
                  <meshBasicMaterial color={authorizedWolfForm ? "#ef4444" : isDead ? "#e0f2fe" : "#0f172a"} />
                </mesh>
                <mesh position={[0.06, 0.13, 0.132]}>
                  <boxGeometry args={[0.045, 0.035, 0.01]} />
                  <meshBasicMaterial color={authorizedWolfForm ? "#ef4444" : isDead ? "#e0f2fe" : "#0f172a"} />
                </mesh>
              </>
            )}

            {/* Hình thái Người Sói Box: Mọc 2 tai nhọn + Mõm Sói! */}
            {authorizedWolfForm && (
              <>
                <mesh position={[-0.09, 0.31, -0.02]} rotation={[0, 0, 0.18]}>
                  <coneGeometry args={[0.055, 0.15, 4]} />
                  <meshStandardMaterial color="#450a0a" />
                </mesh>
                <mesh position={[0.09, 0.31, -0.02]} rotation={[0, 0, -0.18]}>
                  <coneGeometry args={[0.055, 0.15, 4]} />
                  <meshStandardMaterial color="#450a0a" />
                </mesh>
                <mesh position={[0, 0.08, 0.16]}>
                  <boxGeometry args={[0.13, 0.1, 0.12]} />
                  <meshStandardMaterial color="#1f2937" />
                </mesh>
              </>
            )}
          </group>

          {/* Cánh tay Trái (Pivot tại vai trái) */}
          <group ref={leftArmRef} position={[authorizedWolfForm ? 0.27 : 0.23, 0.5, 0]}>
            <mesh position={[0, -0.18, 0]} castShadow={!isDead}>
              <boxGeometry args={[0.1, 0.38, 0.1]} />
              <meshStandardMaterial color={tunicColor} transparent={isDead} opacity={opacity} roughness={0.7} />
            </mesh>
            <mesh position={[0, -0.39, 0]}>
              <boxGeometry args={[0.09, 0.09, 0.09]} />
              <meshStandardMaterial color={skinColor} transparent={isDead} opacity={opacity} />
            </mesh>
          </group>

          {/* Cánh tay Phải (Pivot tại vai phải — giơ thẳng khi Chỉ tay đề cử!) */}
          <group ref={rightArmRef} position={[authorizedWolfForm ? -0.27 : -0.23, 0.5, 0]}>
            <mesh position={[0, -0.18, 0]} castShadow={!isDead}>
              <boxGeometry args={[0.1, 0.38, 0.1]} />
              <meshStandardMaterial color={tunicColor} transparent={isDead} opacity={opacity} roughness={0.7} />
            </mesh>
            <mesh position={[0, -0.39, 0]}>
              <boxGeometry args={[0.09, 0.09, 0.09]} />
              <meshStandardMaterial color={skinColor} transparent={isDead} opacity={opacity} />
            </mesh>
          </group>
        </group>
      </group>

      {/* ============ 4. BẢNG TÊN & NÚT XÁC NHẬN CẠNH NHÂN VẬT (<Html> KHÔNG PHÓNG ĐẠI) ============ */}
      <Html
        position={[0, 1.48, 0]}
        center
        zIndexRange={[15, 0]}
        style={{ pointerEvents: architectMode ? "none" : "auto" }}
      >
        <div
          ref={labelDomRef}
          onClick={() => !isDead && onSelect && onSelect(player.id)}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "3px",
            pointerEvents: architectMode || isDead ? "none" : "auto",
            opacity: architectMode ? 0.45 : 1,
            cursor: isDead ? "default" : "pointer",
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

          {/* Bong bóng chat nhanh */}
          {chatBubbleText && (
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
          {isSelected && !isDead && selectedActionMeta?.canConfirm && (
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

          {/* Ẩn bảng tên của chính mình khi ở Góc Qua Vai (trừ khi tự chọn mình / ván kết thúc / sang Góc Cao Toàn Vòng) */}
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
                background: isDead
                  ? "rgba(15, 23, 42, 0.58)"
                  : isSelected
                    ? "rgba(245, 158, 11, 0.92)"
                    : "rgba(6, 9, 30, 0.76)",
                color: isSelected && !isDead ? "#0f172a" : isMe ? roleAccentColor : isDead ? "#94a3b8" : "#f1f5f9",
                border: `1px solid ${
                  isSelected && !isDead
                    ? "#fde68a"
                    : isMe
                      ? roleAccentColor
                      : isDefendant
                        ? "#fb923c"
                        : isWolfTeammate
                          ? "#ef4444"
                          : "rgba(255,255,255,0.16)"
                }`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.48)",
                backdropFilter: "blur(6px)",
              }}
            >
              {isSpeaking && <span>🔊</span>}
              {!player.connected && <span>🔌</span>}
              {isDead && <span>👻</span>}
              {isDefendant && <span title="Đang trên Ghế Nóng">⚖️</span>}
              {isWolfVictim && <span title="Bị Sói cắn đêm nay">🩸</span>}
              <span>{player.name}</span>
              {isMe && <span>★</span>}
              {(isDead || hasWinner) && player.role && (
                <span style={{ fontSize: "10.5px", opacity: 0.9 }}>
                  {ROLE_EMOJIS[player.role]}
                </span>
              )}
              {wolfPicksOnThis > 0 && (
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
              {seerResult && phase === "night_seer" && (
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
              {nominationVoters.length > 0 && phase === "day_nominate" && (
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
              {myFinalVote && phase === "day_final_vote" && (
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
