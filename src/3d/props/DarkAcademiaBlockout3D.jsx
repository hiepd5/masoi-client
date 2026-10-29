import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import SmartPropGLB from "./SmartPropGLB.jsx";
import { getSoftGlowHaloTexture } from "../shaders/villageCinematicShaders.js";

export const DARK_ACADEMIA_PROP_TYPES = [
  "acad_clocktower",
  "acad_cloister_wing",
  "acad_iron_gate",
  "acad_owl_statue",
  "acad_floating_candles",
  "acad_alchemy_brazier",
  "acad_stone_bench",
  "acad_cypress_tree",
];

const NOOP_RAYCAST = () => {};

// Bộ vật liệu PBR dùng chung cho toàn bộ 28 công trình Box-Blockout (tiết kiệm VRAM & Draw State tối đa)
let sharedMaterials = null;
function getSharedAcademiaMaterials() {
  if (sharedMaterials) return sharedMaterials;
  sharedMaterials = {
    darkStone: new THREE.MeshStandardMaterial({
      color: "#2b2d42",
      roughness: 0.86,
      metalness: 0.08,
    }),
    trimStone: new THREE.MeshStandardMaterial({
      color: "#434663",
      roughness: 0.78,
      metalness: 0.12,
    }),
    slateRoof: new THREE.MeshStandardMaterial({
      color: "#16192b",
      roughness: 0.64,
      metalness: 0.22,
    }),
    wroughtIron: new THREE.MeshStandardMaterial({
      color: "#11131d",
      roughness: 0.45,
      metalness: 0.78,
    }),
    brassAccent: new THREE.MeshStandardMaterial({
      color: "#d9a441",
      roughness: 0.36,
      metalness: 0.82,
      emissive: "#78350f",
      emissiveIntensity: 0.28,
    }),
    amberGlass: new THREE.MeshStandardMaterial({
      color: "#fde68a",
      emissive: "#f59e0b",
      emissiveIntensity: 1.85,
      roughness: 0.22,
      metalness: 0.05,
    }),
    violetGlass: new THREE.MeshStandardMaterial({
      color: "#e9d5ff",
      emissive: "#9333ea",
      emissiveIntensity: 1.75,
      roughness: 0.24,
      metalness: 0.08,
    }),
    candleWax: new THREE.MeshStandardMaterial({
      color: "#fef3c7",
      emissive: "#fbbf24",
      emissiveIntensity: 0.35,
      roughness: 0.65,
    }),
    candleFlame: new THREE.MeshBasicMaterial({
      color: "#fde047",
    }),
    arcaneFlame: new THREE.MeshBasicMaterial({
      color: "#c084fc",
    }),
    arcaneCore: new THREE.MeshBasicMaterial({
      color: "#67e8f9",
    }),
    barkDark: new THREE.MeshStandardMaterial({
      color: "#24191c",
      roughness: 0.92,
    }),
    cypressLeafA: new THREE.MeshStandardMaterial({
      color: "#132a2e",
      roughness: 0.85,
      metalness: 0.04,
    }),
    cypressLeafB: new THREE.MeshStandardMaterial({
      color: "#1b3640",
      roughness: 0.82,
      metalness: 0.05,
    }),
    spellBookRed: new THREE.MeshStandardMaterial({
      color: "#7f1d1d",
      roughness: 0.65,
    }),
    spellBookViolet: new THREE.MeshStandardMaterial({
      color: "#4c1d95",
      roughness: 0.62,
    }),
    godRayViolet: new THREE.MeshBasicMaterial({
      color: "#a855f7",
      transparent: true,
      opacity: 0.11,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    godRayAmber: new THREE.MeshBasicMaterial({
      color: "#f59e0b",
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };
  return sharedMaterials;
}

/**
 * 1. acad_clocktower (3.8 x 11.5 x 3.8m)
 * Tháp Đồng Hồ Huyết Nguyệt — Khối Box Gothic nhiều tầng, kim giờ/phút quay thật & quả lắc đồng đung đưa.
 */
function ClocktowerBlockout({ isNightActive = true }) {
  const mats = getSharedAcademiaMaterials();
  const haloTex = useMemo(() => getSoftGlowHaloTexture(), []);
  const minuteHandRef = useRef(null);
  const hourHandRef = useRef(null);
  const pendulumRef = useRef(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (minuteHandRef.current) {
      minuteHandRef.current.rotation.z = -t * 0.22;
    }
    if (hourHandRef.current) {
      hourHandRef.current.rotation.z = -t * 0.035 - 0.8;
    }
    if (pendulumRef.current) {
      pendulumRef.current.rotation.z = Math.sin(t * 2.1) * 0.24;
    }
  });

  return (
    <group>
      {/* Đế đá bậc tam cấp (Y = 0.00 -> 1.10m) */}
      <mesh position={[0, 0.28, 0]} material={mats.darkStone} castShadow receiveShadow>
        <boxGeometry args={[3.8, 0.56, 3.8]} />
      </mesh>
      <mesh position={[0, 0.82, 0]} material={mats.trimStone} castShadow receiveShadow>
        <boxGeometry args={[3.35, 0.52, 3.35]} />
      </mesh>

      {/* Thân tháp giữa + Khoang hở treo quả lắc đồng (Y = 1.08 -> 6.40m) */}
      <mesh position={[0, 3.74, -0.35]} material={mats.darkStone} castShadow receiveShadow>
        <boxGeometry args={[2.65, 5.32, 1.95]} />
      </mesh>
      {/* 4 Trụ ốp góc Buttress Box tạo khối kiến trúc khỏe */}
      {[
        [-1.28, -1.28],
        [1.28, -1.28],
        [-1.28, 1.28],
        [1.28, 1.28],
      ].map(([bx, bz], i) => (
        <mesh key={`bt-${i}`} position={[bx, 3.85, bz]} material={mats.trimStone} castShadow>
          <boxGeometry args={[0.52, 5.6, 0.52]} />
        </mesh>
      ))}

      {/* Cửa sổ kính màu tím chạy dọc thân tháp */}
      <mesh position={[-0.68, 4.1, 0.65]} material={mats.violetGlass}>
        <boxGeometry args={[0.38, 2.35, 0.08]} />
      </mesh>
      <mesh position={[0.68, 4.1, 0.65]} material={mats.violetGlass}>
        <boxGeometry args={[0.38, 2.35, 0.08]} />
      </mesh>

      {/* Quả lắc đồng đung đưa ở hốc vòm trước tháp */}
      <group ref={pendulumRef} position={[0, 4.85, 0.88]}>
        <mesh position={[0, -1.05, 0]} material={mats.brassAccent}>
          <boxGeometry args={[0.07, 2.1, 0.07]} />
        </mesh>
        <mesh position={[0, -2.15, 0]} material={mats.brassAccent}>
          <cylinderGeometry args={[0.32, 0.32, 0.12, 12]} />
        </mesh>
      </group>

      {/* Tầng mặt Đồng Hồ La Mã phát sáng (Y = 6.50 -> 8.55m) */}
      <mesh position={[0, 7.52, 0]} material={mats.trimStone} castShadow>
        <boxGeometry args={[2.95, 2.08, 2.95]} />
      </mesh>
      {/* Đĩa mặt đồng hồ phía Nam (nhìn thẳng về tâm bàn Ma Sói) */}
      <mesh position={[0, 7.55, 1.5]} rotation={[Math.PI / 2, 0, 0]} material={mats.amberGlass}>
        <cylinderGeometry args={[0.92, 0.92, 0.08, 16]} />
      </mesh>
      <mesh position={[0, 7.55, 1.53]} rotation={[Math.PI / 2, 0, 0]} material={mats.wroughtIron}>
        <cylinderGeometry args={[0.98, 0.98, 0.04, 16, 1, true]} />
      </mesh>
      {/* Kim phút & Kim giờ xoay thật */}
      <group ref={minuteHandRef} position={[0, 7.55, 1.57]}>
        <mesh position={[0, 0.34, 0]} material={mats.wroughtIron}>
          <boxGeometry args={[0.07, 0.72, 0.04]} />
        </mesh>
      </group>
      <group ref={hourHandRef} position={[0, 7.55, 1.59]}>
        <mesh position={[0, 0.22, 0]} material={mats.wroughtIron}>
          <boxGeometry args={[0.09, 0.48, 0.04]} />
        </mesh>
      </group>

      {/* Mái chóp đá đen Gothic & Kim thu lôi vàng đồng (Y = 8.56 -> 11.50m) */}
      <mesh position={[0, 9.85, 0]} rotation={[0, Math.PI / 4, 0]} material={mats.slateRoof} castShadow>
        <coneGeometry args={[2.18, 2.65, 4]} />
      </mesh>
      <mesh position={[0, 11.32, 0]} material={mats.brassAccent}>
        <boxGeometry args={[0.1, 0.55, 0.1]} />
      </mesh>

      {/* Quầng hào quang mặt đồng hồ trong sương đêm */}
      <sprite raycast={NOOP_RAYCAST} position={[0, 7.55, 1.9]} scale={[3.8, 3.8, 1]}>
        <spriteMaterial
          map={haloTex}
          color="#fbbf24"
          transparent
          opacity={isNightActive ? 0.52 : 0.32}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}

/**
 * 2. acad_cloister_wing (6.4 x 5.8 x 2.8m)
 * Dãy Hành Lang Vòm Kính Màu Học Viện + Tia God-Ray xuyên sương xuống sân đá.
 */
function CloisterWingBlockout({ isNightActive = true, seed = 0 }) {
  const mats = getSharedAcademiaMaterials();
  const useVioletPrimary = Math.round(seed * 10) % 2 === 0;

  return (
    <group>
      {/* Nền bậc đá hành lang */}
      <mesh position={[0, 0.22, 0]} material={mats.darkStone} receiveShadow>
        <boxGeometry args={[6.4, 0.44, 2.8]} />
      </mesh>
      {/* Khối tường hậu ký túc xá */}
      <mesh position={[0, 2.45, -0.55]} material={mats.darkStone} castShadow receiveShadow>
        <boxGeometry args={[6.1, 4.05, 1.45]} />
      </mesh>

      {/* 4 Cột trụ đá hành lang phía trước tạo 3 nhịp vòm Box */}
      {[-2.7, -0.9, 0.9, 2.7].map((px, idx) => (
        <group key={`pier-${idx}`} position={[px, 0, 0.85]}>
          <mesh position={[0, 1.85, 0]} material={mats.trimStone} castShadow>
            <boxGeometry args={[0.48, 3.25, 0.52]} />
          </mesh>
          <mesh position={[0, 3.55, 0]} material={mats.darkStone}>
            <boxGeometry args={[0.62, 0.24, 0.64]} />
          </mesh>
        </group>
      ))}

      {/* Dầm ngang vòm cổ điển nối các cột */}
      <mesh position={[0, 3.82, 0.85]} material={mats.trimStone} castShadow>
        <boxGeometry args={[6.25, 0.42, 0.56]} />
      </mesh>

      {/* 3 Ô kính màu phát sáng lớn (tím huyền bí xen kẽ vàng ấm) + Tia sáng Volumetric God-Rays */}
      {[-1.8, 0, 1.8].map((wx, idx) => {
        const isViolet = (idx % 2 === 0) === useVioletPrimary;
        return (
          <group key={`win-${idx}`} position={[wx, 2.45, 0.22]}>
            <mesh material={isViolet ? mats.violetGlass : mats.amberGlass}>
              <boxGeometry args={[1.02, 2.05, 0.08]} />
            </mesh>
            {/* Song cửa sắt chữ thập */}
            <mesh position={[0, 0, 0.06]} material={mats.wroughtIron}>
              <boxGeometry args={[0.08, 2.08, 0.04]} />
            </mesh>
            <mesh position={[0, 0.25, 0.06]} material={mats.wroughtIron}>
              <boxGeometry args={[1.04, 0.08, 0.04]} />
            </mesh>
            {/* Luồng sáng God-Ray chéo nhẹ xuống sân */}
            {isNightActive && (
              <mesh
                raycast={NOOP_RAYCAST}
                position={[0, -1.05, 1.45]}
                rotation={[-0.62, 0, 0]}
                material={isViolet ? mats.godRayViolet : mats.godRayAmber}
              >
                <planeGeometry args={[1.15, 3.2]} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Mái dốc đá đen + 2 cửa sổ áp mái Dormer */}
      <mesh position={[0, 4.95, -0.15]} rotation={[0, Math.PI / 4, 0]} scale={[1.55, 1, 0.68]} material={mats.slateRoof} castShadow>
        <coneGeometry args={[3.05, 1.75, 4]} />
      </mesh>
      {[-1.55, 1.55].map((dx, i) => (
        <group key={`dormer-${i}`} position={[dx, 4.82, 0.55]}>
          <mesh material={mats.trimStone}>
            <boxGeometry args={[0.78, 0.78, 0.68]} />
          </mesh>
          <mesh position={[0, 0, 0.36]} material={mats.amberGlass}>
            <boxGeometry args={[0.42, 0.48, 0.05]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * 3. acad_iron_gate (4.8 x 5.2 x 1.2m)
 * Cổng Sắt Rèn & Trụ Đá Huy Hiệu Học Viện (hướng 6h Nam mở lối vào sân).
 */
function IronGateBlockout({ isNightActive = true }) {
  const mats = getSharedAcademiaMaterials();
  const haloTex = useMemo(() => getSoftGlowHaloTexture(), []);

  return (
    <group>
      {/* 2 Trụ đá lớn hai bên cổng */}
      {[-2.05, 2.05].map((px, idx) => (
        <group key={`gate-pier-${idx}`} position={[px, 0, 0]}>
          <mesh position={[0, 0.3, 0]} material={mats.darkStone} castShadow receiveShadow>
            <boxGeometry args={[0.98, 0.6, 1.15]} />
          </mesh>
          <mesh position={[0, 2.15, 0]} material={mats.trimStone} castShadow>
            <boxGeometry args={[0.78, 3.15, 0.88]} />
          </mesh>
          <mesh position={[0, 3.85, 0]} material={mats.darkStone}>
            <boxGeometry args={[0.96, 0.28, 1.02]} />
          </mesh>
          {/* Đèn lồng huy hiệu trên đỉnh trụ cổng */}
          <mesh position={[0, 4.35, 0]} material={mats.amberGlass}>
            <boxGeometry args={[0.38, 0.58, 0.38]} />
          </mesh>
          <mesh position={[0, 4.78, 0]} rotation={[0, Math.PI / 4, 0]} material={mats.wroughtIron}>
            <coneGeometry args={[0.36, 0.36, 4]} />
          </mesh>
          <sprite raycast={NOOP_RAYCAST} position={[0, 4.35, 0]} scale={[1.8, 1.8, 1]}>
            <spriteMaterial
              map={haloTex}
              color="#fbbf24"
              transparent
              opacity={isNightActive ? 0.55 : 0.35}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        </group>
      ))}

      {/* Khung vòm sắt rèn & các thanh chấn song Box */}
      <mesh position={[0, 3.72, 0]} material={mats.wroughtIron}>
        <boxGeometry args={[3.45, 0.16, 0.16]} />
      </mesh>
      <mesh position={[0, 4.35, 0]} material={mats.wroughtIron}>
        <boxGeometry args={[2.15, 0.22, 0.18]} />
      </mesh>
      <mesh position={[0, 4.35, 0]} material={mats.violetGlass}>
        <boxGeometry args={[0.55, 0.55, 0.22]} />
      </mesh>
      {[-1.35, -0.9, -0.45, 0.45, 0.9, 1.35].map((bx, i) => (
        <mesh key={`bar-${i}`} position={[bx, 1.95, 0]} material={mats.wroughtIron} castShadow>
          <boxGeometry args={[0.08, 3.75, 0.08]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 4. acad_owl_statue (1.6 x 3.4 x 1.6m)
 * Tượng Đá Cú Đêm / Sói Hộ Vệ Học Viện cầm lồng đèn tím.
 */
function OwlStatueBlockout({ isNightActive = true }) {
  const mats = getSharedAcademiaMaterials();
  const haloTex = useMemo(() => getSoftGlowHaloTexture(), []);

  return (
    <group>
      {/* Bệ tượng đá bậc thang */}
      <mesh position={[0, 0.24, 0]} material={mats.darkStone} castShadow receiveShadow>
        <boxGeometry args={[1.55, 0.48, 1.55]} />
      </mesh>
      <mesh position={[0, 1.05, 0]} material={mats.trimStone} castShadow>
        <boxGeometry args={[1.08, 1.15, 1.08]} />
      </mesh>
      {/* Phù điêu cổ ngữ phát sáng trước bệ */}
      <mesh position={[0, 1.08, 0.56]} material={mats.violetGlass}>
        <boxGeometry args={[0.46, 0.58, 0.04]} />
      </mesh>
      {/* Khối tượng Cú/Sói cách điệu Low-Poly Box */}
      <mesh position={[0, 2.22, -0.04]} material={mats.darkStone} castShadow>
        <boxGeometry args={[0.74, 1.12, 0.68]} />
      </mesh>
      {/* Đôi cánh xếp hai bên */}
      <mesh position={[-0.44, 2.18, -0.02]} rotation={[0, 0, 0.14]} material={mats.trimStone}>
        <boxGeometry args={[0.18, 0.92, 0.54]} />
      </mesh>
      <mesh position={[0.44, 2.18, -0.02]} rotation={[0, 0, -0.14]} material={mats.trimStone}>
        <boxGeometry args={[0.18, 0.92, 0.54]} />
      </mesh>
      {/* Đầu & 2 tai nhọn + Mắt tím rực */}
      <mesh position={[0, 2.96, 0.04]} material={mats.trimStone} castShadow>
        <boxGeometry args={[0.58, 0.46, 0.54]} />
      </mesh>
      <mesh position={[-0.22, 3.28, 0.04]} rotation={[0, 0, 0.2]} material={mats.darkStone}>
        <boxGeometry args={[0.14, 0.26, 0.18]} />
      </mesh>
      <mesh position={[0.22, 3.28, 0.04]} rotation={[0, 0, -0.2]} material={mats.darkStone}>
        <boxGeometry args={[0.14, 0.26, 0.18]} />
      </mesh>
      <mesh position={[-0.14, 2.98, 0.32]} material={mats.amberGlass}>
        <boxGeometry args={[0.1, 0.08, 0.04]} />
      </mesh>
      <mesh position={[0.14, 2.98, 0.32]} material={mats.amberGlass}>
        <boxGeometry args={[0.1, 0.08, 0.04]} />
      </mesh>
      {isNightActive && (
        <sprite raycast={NOOP_RAYCAST} position={[0, 1.15, 0.72]} scale={[1.35, 1.35, 1]}>
          <spriteMaterial
            map={haloTex}
            color="#a855f7"
            transparent
            opacity={0.44}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      )}
    </group>
  );
}

/**
 * 5. acad_floating_candles (2.2 x 3.6 x 2.2m)
 * Chùm 7 Ngọn Nến Phép Thuật Bay Lơ Lửng (Hogwarts / Wednesday Vibe) nhấp nhô mượt mà.
 */
function FloatingCandlesBlockout({ seed = 0, isNightActive = true }) {
  const mats = getSharedAcademiaMaterials();
  const haloTex = useMemo(() => getSoftGlowHaloTexture(), []);
  const groupRef = useRef(null);

  const candles = useMemo(
    () => [
      { x: 0, y: 3.15, z: 0, h: 0.42, phase: 0.0 },
      { x: -0.62, y: 2.65, z: 0.42, h: 0.34, phase: 1.1 },
      { x: 0.58, y: 2.82, z: -0.38, h: 0.38, phase: 2.2 },
      { x: -0.45, y: 2.25, z: -0.55, h: 0.3, phase: 3.1 },
      { x: 0.68, y: 2.38, z: 0.52, h: 0.32, phase: 4.0 },
      { x: -0.18, y: 3.45, z: 0.65, h: 0.28, phase: 4.9 },
      { x: 0.24, y: 1.98, z: -0.68, h: 0.35, phase: 5.7 },
    ],
    []
  );

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime + seed * 3.1;
    const children = groupRef.current.children;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const obj = children[i];
      if (!obj) continue;
      obj.position.y = c.y + Math.sin(t * 1.45 + c.phase) * 0.14;
      obj.rotation.z = Math.sin(t * 0.9 + c.phase) * 0.04;
    }
  });

  return (
    <group>
      {/* Đế đá cổ ngữ nhỏ dưới sàn đánh dấu tâm trụ neo */}
      <mesh position={[0, 0.04, 0]} material={mats.trimStone} receiveShadow>
        <boxGeometry args={[0.52, 0.08, 0.52]} />
      </mesh>
      <group ref={groupRef}>
        {candles.map((c, idx) => (
          <group key={`fc-${idx}`} position={[c.x, c.y, c.z]}>
            <mesh material={mats.candleWax}>
              <cylinderGeometry args={[0.042, 0.048, c.h, 8]} />
            </mesh>
            <mesh position={[0, c.h * 0.5 + 0.055, 0]} material={mats.candleFlame}>
              <coneGeometry args={[0.032, 0.095, 6]} />
            </mesh>
          </group>
        ))}
      </group>
      <sprite raycast={NOOP_RAYCAST} position={[0, 2.75, 0]} scale={[2.6, 2.6, 1]}>
        <spriteMaterial
          map={haloTex}
          color="#fde047"
          transparent
          opacity={isNightActive ? 0.45 : 0.28}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}

/**
 * 6. acad_alchemy_brazier (1.3 x 1.8 x 1.3m)
 * Đỉnh Lửa Giả Kim Tím Lam — Ngọn lửa ma thuật phập phồng quanh vòng ghế.
 */
function AlchemyBrazierBlockout({ seed = 0, isNightActive = true }) {
  const mats = getSharedAcademiaMaterials();
  const haloTex = useMemo(() => getSoftGlowHaloTexture(), []);
  const flameRef = useRef(null);

  useFrame((state) => {
    if (!flameRef.current) return;
    const t = state.clock.elapsedTime * 3.8 + seed * 5.0;
    const s = 0.92 + Math.sin(t) * 0.12 + Math.cos(t * 1.7) * 0.06;
    flameRef.current.scale.set(s, 0.88 + Math.sin(t * 1.3) * 0.18, s);
    flameRef.current.rotation.y += 0.025;
  });

  return (
    <group>
      <mesh position={[0, 0.14, 0]} material={mats.darkStone} castShadow receiveShadow>
        <boxGeometry args={[0.96, 0.28, 0.96]} />
      </mesh>
      {/* 3 Chân kiềng sắt rèn */}
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((ang, i) => (
        <mesh
          key={`leg-${i}`}
          position={[Math.sin(ang) * 0.28, 0.62, Math.cos(ang) * 0.28]}
          rotation={[Math.cos(ang) * 0.16, 0, -Math.sin(ang) * 0.16]}
          material={mats.wroughtIron}
          castShadow
        >
          <boxGeometry args={[0.1, 0.92, 0.1]} />
        </mesh>
      ))}
      {/* Chảo gang đỡ lửa */}
      <mesh position={[0, 1.08, 0]} material={mats.wroughtIron} castShadow>
        <cylinderGeometry args={[0.48, 0.26, 0.28, 8]} />
      </mesh>
      {/* Lõi lửa Giả Kim tím-lam sống động */}
      <group ref={flameRef} position={[0, 1.38, 0]}>
        <mesh rotation={[0, Math.PI / 4, 0]} material={mats.arcaneFlame}>
          <coneGeometry args={[0.32, 0.62, 5]} />
        </mesh>
        <mesh position={[0, -0.04, 0]} material={mats.arcaneCore}>
          <coneGeometry args={[0.17, 0.42, 4]} />
        </mesh>
      </group>
      <sprite raycast={NOOP_RAYCAST} position={[0, 1.45, 0]} scale={[2.1, 2.1, 1]}>
        <spriteMaterial
          map={haloTex}
          color="#c084fc"
          transparent
          opacity={isNightActive ? 0.56 : 0.36}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}

/**
 * 7. acad_stone_bench (2.4 x 0.95 x 0.85m)
 * Ghế Băng Đá Sân Học Viện & Chồng Sách Cổ Phép Thuật.
 */
function StoneBenchBlockout() {
  const mats = getSharedAcademiaMaterials();
  return (
    <group>
      {/* 2 Chân ghế đá */}
      <mesh position={[-0.85, 0.24, 0]} material={mats.darkStone} castShadow receiveShadow>
        <boxGeometry args={[0.32, 0.48, 0.68]} />
      </mesh>
      <mesh position={[0.85, 0.24, 0]} material={mats.darkStone} castShadow receiveShadow>
        <boxGeometry args={[0.32, 0.48, 0.68]} />
      </mesh>
      {/* Mặt ghế đá */}
      <mesh position={[0, 0.52, 0]} material={mats.trimStone} castShadow receiveShadow>
        <boxGeometry args={[2.32, 0.12, 0.78]} />
      </mesh>
      {/* Tựa lưng thấp chạm khắc */}
      <mesh position={[0, 0.76, -0.3]} material={mats.darkStone} castShadow>
        <boxGeometry args={[2.18, 0.36, 0.12]} />
      </mesh>
      {/* Chồng sách phép thuật & đèn nhỏ để quên trên ghế */}
      <mesh position={[0.68, 0.62, 0.05]} rotation={[0, 0.22, 0]} material={mats.spellBookViolet}>
        <boxGeometry args={[0.34, 0.08, 0.26]} />
      </mesh>
      <mesh position={[0.66, 0.69, 0.04]} rotation={[0, -0.18, 0]} material={mats.spellBookRed}>
        <boxGeometry args={[0.3, 0.07, 0.23]} />
      </mesh>
      <mesh position={[-0.78, 0.68, 0.08]} material={mats.amberGlass}>
        <boxGeometry args={[0.16, 0.22, 0.16]} />
      </mesh>
    </group>
  );
}

/**
 * 8. acad_cypress_tree (2.2 x 7.8 x 2.2m)
 * Cây Bách Tùng Cắt Tỉa Học Viện Đêm — Các tầng khối Box/Cone đung đưa theo gió đêm.
 */
function CypressTreeBlockout({ seed = 0 }) {
  const mats = getSharedAcademiaMaterials();
  const swayRef = useRef(null);

  useFrame((state) => {
    if (!swayRef.current) return;
    const t = state.clock.elapsedTime + seed * 4.3;
    swayRef.current.rotation.z = Math.sin(t * 0.95) * 0.026;
    swayRef.current.rotation.x = Math.cos(t * 0.75) * 0.018;
  });

  return (
    <group>
      {/* Thân gỗ gốc */}
      <mesh position={[0, 0.75, 0]} material={mats.barkDark} castShadow>
        <boxGeometry args={[0.38, 1.5, 0.38]} />
      </mesh>
      {/* Tán lá Bách Tùng nhiều tầng xoay góc 45 độ kiểu Stylized Architectural Blockout */}
      <group ref={swayRef} position={[0, 1.15, 0]}>
        <mesh position={[0, 0.95, 0]} material={mats.cypressLeafA} castShadow>
          <boxGeometry args={[1.68, 1.75, 1.68]} />
        </mesh>
        <mesh position={[0, 2.35, 0]} rotation={[0, Math.PI / 4, 0]} material={mats.cypressLeafB} castShadow>
          <boxGeometry args={[1.38, 1.65, 1.38]} />
        </mesh>
        <mesh position={[0, 3.68, 0]} material={mats.cypressLeafA} castShadow>
          <boxGeometry args={[1.06, 1.55, 1.06]} />
        </mesh>
        <mesh position={[0, 4.92, 0]} rotation={[0, Math.PI / 4, 0]} material={mats.cypressLeafB} castShadow>
          <boxGeometry args={[0.74, 1.35, 0.74]} />
        </mesh>
        <mesh position={[0, 6.05, 0]} rotation={[0, Math.PI / 4, 0]} material={mats.cypressLeafA}>
          <coneGeometry args={[0.46, 1.25, 4]} />
        </mesh>
      </group>
    </group>
  );
}

export function DarkAcademiaBlockoutFallback({ type, isNightActive = true, seed = 0 }) {
  switch (type) {
    case "acad_clocktower":
      return <ClocktowerBlockout isNightActive={isNightActive} />;
    case "acad_cloister_wing":
      return <CloisterWingBlockout isNightActive={isNightActive} seed={seed} />;
    case "acad_iron_gate":
      return <IronGateBlockout isNightActive={isNightActive} />;
    case "acad_owl_statue":
      return <OwlStatueBlockout isNightActive={isNightActive} />;
    case "acad_floating_candles":
      return <FloatingCandlesBlockout isNightActive={isNightActive} seed={seed} />;
    case "acad_alchemy_brazier":
      return <AlchemyBrazierBlockout isNightActive={isNightActive} seed={seed} />;
    case "acad_stone_bench":
      return <StoneBenchBlockout />;
    case "acad_cypress_tree":
    default:
      return <CypressTreeBlockout seed={seed} />;
  }
}

/**
 * Node Ngoại Cảnh Học Viện Huyết Nguyệt — Bọc sẵn SmartPropGLB (optionalHeroProp: true, 0 lỗi 404).
 * Khi thả file `acad_*.glb` đã gán map từ Blender vào `client/public/models/props/`,
 * SmartPropGLB tự động thay thế 1:1 cho khối Box-Blockout mà không cần xếp lại vị trí!
 */
export default function DarkAcademiaSocketNode({
  type,
  isNightActive = true,
  calib,
  reloadToken = 0,
  seed = 0,
  disableRaycast = false,
}) {
  return (
    <SmartPropGLB
      propKey={type}
      calib={calib}
      reloadToken={reloadToken}
      disableRaycast={disableRaycast}
      fallback={<DarkAcademiaBlockoutFallback type={type} isNightActive={isNightActive} seed={seed} />}
    />
  );
}
