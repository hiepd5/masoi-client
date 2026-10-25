import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  CAMPFIRE_SAFE_RADIUS,
  computeCampfireSafeBezierXZ,
  computeVictimFrontLandingXZ,
  normalizeAngleRad,
  sampleQuadraticBezierXZ,
} from "../animation/actorChoreography3D.js";
import {
  getDriftingMistTexture,
  getSoftGlowHaloTexture,
} from "../shaders/villageCinematicShaders.js";

/**
 * =============================================================================
 * TẦNG HIỆU ỨNG THỊ GIÁC THỰC CHIẾN KHỚP XƯƠNG 1:1 (ACTION CHOREO VFX 3D)
 * - 0 KB tải mạng: Tái sử dụng CanvasTexture nội bộ + Hình học chia sẻ.
 * - 0 cấp phát bộ nhớ rác trong `useFrame` (60 FPS vững chắc trên Web/Mobile).
 * - Đồng bộ tuyệt đối `0.0 -> 1.0` theo `choreoTiming` cho cả 3 chế độ:
 *   (1) Studio Hoạt Cảnh `/?choreo=1` (kéo thanh tua tiến/lùi `0.25x` từng khung hình!)
 *   (2) Phim Điện Ảnh Cuối Trận (`EndGameRecap`)
 *   (3) Hành Động Đêm/Ngày Trực Tiếp Trên Máy Người Chơi (`100% Zero-Leak`)
 * =============================================================================
 */

const NOOP_RAYCAST = () => null;
const UP_Y = new THREE.Vector3(0, 1, 0);
const TMP_VEC_A = new THREE.Vector3();
const TMP_VEC_B = new THREE.Vector3();
const TMP_DIR = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutCubic(v) {
  const x = clamp01(v);
  return 1 - Math.pow(1 - x, 3);
}

function resolveChoreoProgress(choreoTiming) {
  if (!choreoTiming) return -1;
  if (typeof choreoTiming.manualProgress === "number") {
    return clamp01(choreoTiming.manualProgress);
  }
  if (choreoTiming.startedAtPerfMs && choreoTiming.durationMs > 0) {
    const nowPerf = typeof performance !== "undefined" ? performance.now() : Date.now();
    const raw = (nowPerf - choreoTiming.startedAtPerfMs) / choreoTiming.durationMs;
    if (raw < 0 || raw > 1.02) return -1;
    return clamp01(raw);
  }
  return -1;
}

let sharedVfxGeos = null;
function getSharedVfxGeos() {
  if (sharedVfxGeos) return sharedVfxGeos;
  sharedVfxGeos = {
    ringThin: new THREE.RingGeometry(0.68, 0.86, 36),
    ringWide: new THREE.RingGeometry(0.42, 0.92, 36),
    hexRing: new THREE.RingGeometry(0.72, 0.88, 6),
    flaskBody: new THREE.SphereGeometry(0.088, 14, 12),
    flaskNeck: new THREE.CylinderGeometry(0.028, 0.036, 0.068, 10),
    flaskCork: new THREE.CylinderGeometry(0.03, 0.025, 0.032, 8),
    shard: new THREE.OctahedronGeometry(0.042, 0),
    clawArc: new THREE.TorusGeometry(0.46, 0.024, 7, 22, Math.PI * 0.72),
    clawArcInner: new THREE.TorusGeometry(0.46, 0.011, 6, 20, Math.PI * 0.68),
    shieldDome: new THREE.SphereGeometry(0.76, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
    beamCyl: new THREE.CylinderGeometry(0.045, 0.085, 1.0, 12, 1, true),
    beamCore: new THREE.CylinderGeometry(0.018, 0.032, 1.0, 8, 1, true),
    pillarCyl: new THREE.CylinderGeometry(0.56, 0.72, 2.35, 20, 1, true),
  };
  return sharedVfxGeos;
}

/**
 * 1. GÓI VFX PHÙ THỦY NÉM BÌNH ĐỘC TÍM (`witch_poison_throw`)
 * - `u = 0.37..0.55`: Bình độc pha lê tím rời tay phải Phù Thủy, bay cầu vồng cao +1.85m, xoay nhào lộn kèm vệt sao tím.
 * - `u = 0.54..0.96`: Đập vỡ tung tại ghế nạn nhân -> 8 mảnh thủy tinh tím văng tứ phía + vòng cổ ngữ độc lan rộng + 5 đám khói kịch độc bốc lên!
 */
function WitchPoisonThrowVfx({ actorSeat, targetSeat, choreoTiming, geos, glowTex, mistTex }) {
  const rootRef = useRef(null);
  const flaskGroupRef = useRef(null);
  const trailRefs = useRef([]);
  const ringRef = useRef(null);
  const ringMatRef = useRef(null);
  const flashSpriteRef = useRef(null);
  const shardRefs = useRef([]);
  const mistRefs = useRef([]);

  const shardSeeds = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const ang = (i / 8) * Math.PI * 2 + (i % 2) * 0.22;
        return {
          vx: Math.cos(ang) * (0.85 + (i % 3) * 0.28),
          vz: Math.sin(ang) * (0.85 + ((i + 1) % 3) * 0.28),
          vy: 1.45 + (i % 4) * 0.32,
          spinX: 6 + i * 1.4,
          spinZ: -5 - i * 1.1,
        };
      }),
    []
  );

  useFrame((state) => {
    const u = resolveChoreoProgress(choreoTiming);
    if (!rootRef.current) return;
    if (u < 0.35 || u > 0.98 || !actorSeat || !targetSeat) {
      rootRef.current.visible = false;
      return;
    }
    rootRef.current.visible = true;

    const yawToTarget = Math.atan2(targetSeat.x - actorSeat.x, targetSeat.z - actorSeat.z);
    // Vị trí bàn tay phải Phù Thủy lúc vung ném ở u = 0.37
    const startX =
      actorSeat.x + Math.sin(actorSeat.facingYaw) * 0.42 + Math.cos(yawToTarget) * 0.22;
    const startY = 1.52;
    const startZ =
      actorSeat.z + Math.cos(actorSeat.facingYaw) * 0.42 - Math.sin(yawToTarget) * 0.22;

    const endX = targetSeat.x;
    const endY = 0.36;
    const endZ = targetSeat.z;
    const distXZ = Math.hypot(endX - startX, endZ - startZ);
    const arcPeakH = THREE.MathUtils.clamp(1.15 + distXZ * 0.22, 1.35, 2.35);

    const sampleArcPos = (kFlight, outVec) => {
      const f = clamp01(kFlight);
      const px = THREE.MathUtils.lerp(startX, endX, f);
      const pz = THREE.MathUtils.lerp(startZ, endZ, f);
      const py =
        THREE.MathUtils.lerp(startY, endY, f) + Math.sin(f * Math.PI) * arcPeakH;
      outVec.set(px, py, pz);
    };

    // Pha bay của Bình Độc: u = 0.37 -> 0.54
    const inFlight = u >= 0.37 && u <= 0.545;
    if (flaskGroupRef.current) {
      flaskGroupRef.current.visible = inFlight;
      if (inFlight) {
        const k = (u - 0.37) / 0.175;
        sampleArcPos(k, TMP_VEC_A);
        flaskGroupRef.current.position.copy(TMP_VEC_A);
        flaskGroupRef.current.rotation.set(k * Math.PI * 5.2, yawToTarget, k * 2.4);
      }
    }

    // 5 hạt sao giả kim tím bám đuôi Bình Độc
    for (let i = 0; i < 5; i += 1) {
      const spr = trailRefs.current[i];
      if (!spr) continue;
      const lagU = u - (i + 1) * 0.016;
      const showTrail = lagU >= 0.37 && lagU <= 0.555;
      spr.visible = showTrail;
      if (showTrail) {
        const k = (lagU - 0.37) / 0.175;
        sampleArcPos(k, TMP_VEC_A);
        spr.position.copy(TMP_VEC_A);
        const s = (1 - i / 5.5) * 0.42;
        spr.scale.set(s, s, 1);
        spr.material.opacity = (1 - i / 5.5) * 0.85;
      }
    }

    // Pha nổ vỡ kịch độc tại ghế mục tiêu: u = 0.54 -> 0.97
    const shattered = u >= 0.535;
    const kBoom = shattered ? clamp01((u - 0.535) / 0.435) : 0;

    if (ringRef.current && ringMatRef.current) {
      ringRef.current.visible = shattered;
      if (shattered) {
        ringRef.current.position.set(endX, 0.035, endZ);
        const ringScale = 0.35 + easeOutCubic(kBoom) * 1.65;
        ringRef.current.scale.set(ringScale, ringScale, 1);
        ringRef.current.rotation.z = state.clock.elapsedTime * 1.4;
        ringMatRef.current.opacity = (1 - kBoom) * 0.88;
      }
    }

    if (flashSpriteRef.current) {
      const showFlash = u >= 0.53 && u <= 0.72;
      flashSpriteRef.current.visible = showFlash;
      if (showFlash) {
        const kf = (u - 0.53) / 0.19;
        flashSpriteRef.current.position.set(endX, 0.62, endZ);
        const fs = 0.65 + Math.sin(kf * Math.PI) * 1.75;
        flashSpriteRef.current.scale.set(fs, fs, 1);
        flashSpriteRef.current.material.opacity = Math.sin(kf * Math.PI) * 0.95;
      }
    }

    for (let i = 0; i < shardSeeds.length; i += 1) {
      const mesh = shardRefs.current[i];
      if (!mesh) continue;
      const showShard = shattered && kBoom < 0.78;
      mesh.visible = showShard;
      if (showShard) {
        const dt = kBoom * 0.85;
        const seed = shardSeeds[i];
        const sy = Math.max(0.03, 0.42 + seed.vy * dt - 3.6 * dt * dt);
        mesh.position.set(endX + seed.vx * dt, sy, endZ + seed.vz * dt);
        mesh.rotation.set(dt * seed.spinX, i, dt * seed.spinZ);
        const sc = Math.max(0.15, 1 - kBoom * 1.15);
        mesh.scale.setScalar(sc);
      }
    }

    for (let i = 0; i < 5; i += 1) {
      const mSpr = mistRefs.current[i];
      if (!mSpr) continue;
      mSpr.visible = shattered;
      if (shattered) {
        const ang = (i / 5) * Math.PI * 2 + kBoom * 1.8;
        const rad = 0.22 + easeOutCubic(kBoom) * 0.58;
        const liftY = 0.28 + easeOutCubic(kBoom) * (0.95 + (i % 3) * 0.28);
        mSpr.position.set(endX + Math.cos(ang) * rad, liftY, endZ + Math.sin(ang) * rad);
        const w = 0.95 + kBoom * 0.95;
        mSpr.scale.set(w * 1.35, w * 0.85, 1);
        const fade = kBoom < 0.2 ? kBoom / 0.2 : 1 - (kBoom - 0.2) / 0.8;
        mSpr.material.opacity = clamp01(fade) * 0.78;
      }
    }
  });

  return (
    <group ref={rootRef} visible={false}>
      {/* Bình Độc 3D đang bay */}
      <group ref={flaskGroupRef} visible={false}>
        <mesh geometry={geos.flaskBody} raycast={NOOP_RAYCAST}>
          <meshStandardMaterial
            color="#a855f7"
            emissive="#9333ea"
            emissiveIntensity={1.65}
            roughness={0.18}
            metalness={0.12}
          />
        </mesh>
        <mesh position={[0, 0.095, 0]} geometry={geos.flaskNeck} raycast={NOOP_RAYCAST}>
          <meshStandardMaterial color="#e9d5ff" roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.138, 0]} geometry={geos.flaskCork} raycast={NOOP_RAYCAST}>
          <meshStandardMaterial color="#78350f" roughness={0.85} />
        </mesh>
        <sprite scale={[0.58, 0.58, 1]} raycast={NOOP_RAYCAST}>
          <spriteMaterial
            map={glowTex}
            color="#d8b4fe"
            transparent
            opacity={0.9}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      </group>

      {/* Đuôi sao giả kim */}
      {[0, 1, 2, 3, 4].map((idx) => (
        <sprite
          key={`ptrail_${idx}`}
          ref={(el) => {
            trailRefs.current[idx] = el;
          }}
          visible={false}
          raycast={NOOP_RAYCAST}
        >
          <spriteMaterial
            map={glowTex}
            color={idx % 2 === 0 ? "#c084fc" : "#e879f9"}
            transparent
            opacity={0.75}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}

      {/* Vòng cổ ngữ độc tím dưới chân ghế nạn nhân */}
      <mesh
        ref={ringRef}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={geos.ringWide}
        raycast={NOOP_RAYCAST}
      >
        <meshBasicMaterial
          ref={ringMatRef}
          color="#a855f7"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Chớp nổ vỡ bình */}
      <sprite ref={flashSpriteRef} visible={false} raycast={NOOP_RAYCAST}>
        <spriteMaterial
          map={glowTex}
          color="#f0abfc"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>

      {/* 8 mảnh thủy tinh tím văng tứ phía */}
      {shardSeeds.map((_, idx) => (
        <mesh
          key={`pshard_${idx}`}
          ref={(el) => {
            shardRefs.current[idx] = el;
          }}
          visible={false}
          geometry={geos.shard}
          raycast={NOOP_RAYCAST}
        >
          <meshBasicMaterial
            color={idx % 2 === 0 ? "#d8b4fe" : "#a855f7"}
            blending={THREE.AdditiveBlending}
            transparent
            opacity={0.92}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* 5 đám khói sương kịch độc tím bốc lên */}
      {[0, 1, 2, 3, 4].map((idx) => (
        <sprite
          key={`pmist_${idx}`}
          ref={(el) => {
            mistRefs.current[idx] = el;
          }}
          visible={false}
          raycast={NOOP_RAYCAST}
        >
          <spriteMaterial
            map={mistTex}
            color={idx % 2 === 0 ? "#a855f7" : "#d946ef"}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/**
 * 2. GÓI VFX PHÙ THỦY TUNG TIÊN DƯỢC CỨU MẠNG (`witch_elixir_cast`)
 * - `u = 0.42..0.58`: Tinh cầu Tiên Dược Ngọc Lục Bảo bay vòm từ tay trái Phù Thủy sang người được cứu.
 * - `u = 0.56..0.96`: Cột sáng Hồi Sinh Xanh Ngọc + 2 vòng cổ ngữ vàng kim + 8 đom đóm sinh mệnh bay lên!
 */
function WitchElixirCastVfx({ actorSeat, targetSeat, choreoTiming, geos, glowTex }) {
  const rootRef = useRef(null);
  const orbRef = useRef(null);
  const pillarRef = useRef(null);
  const pillarMatRef = useRef(null);
  const ringARef = useRef(null);
  const ringBRef = useRef(null);
  const sparkRefs = useRef([]);

  useFrame((state) => {
    const u = resolveChoreoProgress(choreoTiming);
    if (!rootRef.current) return;
    const dst = targetSeat || actorSeat;
    if (u < 0.4 || u > 0.98 || !actorSeat || !dst) {
      rootRef.current.visible = false;
      return;
    }
    rootRef.current.visible = true;

    const startX = actorSeat.x + Math.sin(actorSeat.facingYaw) * 0.4;
    const startY = 1.68;
    const startZ = actorSeat.z + Math.cos(actorSeat.facingYaw) * 0.4;

    const inFlight = u >= 0.41 && u <= 0.58;
    if (orbRef.current) {
      orbRef.current.visible = inFlight;
      if (inFlight) {
        const k = (u - 0.41) / 0.17;
        const px = THREE.MathUtils.lerp(startX, dst.x, k);
        const pz = THREE.MathUtils.lerp(startZ, dst.z, k);
        const py = THREE.MathUtils.lerp(startY, 0.92, k) + Math.sin(k * Math.PI) * 1.15;
        orbRef.current.position.set(px, py, pz);
        const s = 0.55 + Math.sin(k * Math.PI) * 0.25;
        orbRef.current.scale.set(s, s, 1);
      }
    }

    const activeHeal = u >= 0.55;
    const kh = activeHeal ? clamp01((u - 0.55) / 0.42) : 0;
    const env = Math.sin(kh * Math.PI);

    if (pillarRef.current && pillarMatRef.current) {
      pillarRef.current.visible = activeHeal;
      if (activeHeal) {
        pillarRef.current.position.set(dst.x, 1.18, dst.z);
        const radS = 0.72 + kh * 0.42;
        pillarRef.current.scale.set(radS, 0.65 + env * 0.55, radS);
        pillarRef.current.rotation.y = state.clock.elapsedTime * 1.6;
        pillarMatRef.current.opacity = env * 0.42;
      }
    }

    if (ringARef.current) {
      ringARef.current.visible = activeHeal;
      if (activeHeal) {
        ringARef.current.position.set(dst.x, 0.04 + kh * 0.65, dst.z);
        const rs = 0.65 + easeOutCubic(kh) * 0.85;
        ringARef.current.scale.set(rs, rs, 1);
        ringARef.current.material.opacity = env * 0.85;
      }
    }
    if (ringBRef.current) {
      ringBRef.current.visible = activeHeal;
      if (activeHeal) {
        ringBRef.current.position.set(dst.x, 0.035, dst.z);
        const rs = 0.85 + kh * 0.55;
        ringBRef.current.scale.set(rs, rs, 1);
        ringBRef.current.rotation.z = -state.clock.elapsedTime * 1.8;
        ringBRef.current.material.opacity = env * 0.75;
      }
    }

    for (let i = 0; i < 8; i += 1) {
      const sp = sparkRefs.current[i];
      if (!sp) continue;
      sp.visible = activeHeal;
      if (activeHeal) {
        const ang = (i / 8) * Math.PI * 2 + kh * 3.4;
        const r = 0.42 + (i % 3) * 0.14;
        const y = 0.18 + ((kh * 1.35 + i * 0.12) % 1.0) * 1.95;
        sp.position.set(dst.x + Math.cos(ang) * r, y, dst.z + Math.sin(ang) * r);
        const sc = 0.24 + (i % 2) * 0.1;
        sp.scale.set(sc, sc, 1);
        sp.material.opacity = env * 0.92;
      }
    }
  });

  return (
    <group ref={rootRef} visible={false}>
      <sprite ref={orbRef} visible={false} raycast={NOOP_RAYCAST}>
        <spriteMaterial
          map={glowTex}
          color="#34d399"
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>

      <mesh ref={pillarRef} visible={false} geometry={geos.pillarCyl} raycast={NOOP_RAYCAST}>
        <meshBasicMaterial
          ref={pillarMatRef}
          color="#10b981"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh
        ref={ringARef}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={geos.ringThin}
        raycast={NOOP_RAYCAST}
      >
        <meshBasicMaterial
          color="#6ee7b7"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh
        ref={ringBRef}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={geos.hexRing}
        raycast={NOOP_RAYCAST}
      >
        <meshBasicMaterial
          color="#fde047"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => (
        <sprite
          key={`espark_${idx}`}
          ref={(el) => {
            sparkRefs.current[idx] = el;
          }}
          visible={false}
          raycast={NOOP_RAYCAST}
        >
          <spriteMaterial
            map={glowTex}
            color={idx % 2 === 0 ? "#6ee7b7" : "#fde047"}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/**
 * 3. GÓI VFX MA SÓI BẬT NHẢY & BỔ TRẢO CHÉO X (`wolf_pounce`)
 * - `u = 0.16..0.43`: Vệt huyết ảnh đỏ thẫm bám theo quỹ đạo nhảy Bezier của Sói.
 * - `u = 0.42..0.72`: Chấn động bụi tuyết khi đáp đất + 2 Đòn Móng Vuốt Ba Lưỡi Chữ X đỏ rực trước ngực nạn nhân + tia lửa máu!
 */
function WolfPounceSlashVfx({
  actorSeat,
  targetSeat,
  slotIndex = 0,
  totalSlots = 1,
  choreoTiming,
  geos,
  glowTex,
}) {
  const rootRef = useRef(null);
  const leapTrailRefs = useRef([]);
  const landRingRef = useRef(null);
  const slashGroupARef = useRef(null);
  const slashGroupBRef = useRef(null);
  const sparkRefs = useRef([]);

  const slashMats = useMemo(
    () => ({
      outerA: new THREE.MeshBasicMaterial({
        color: "#ef4444",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      innerA: new THREE.MeshBasicMaterial({
        color: "#fecaca",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      outerB: new THREE.MeshBasicMaterial({
        color: "#dc2626",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      innerB: new THREE.MeshBasicMaterial({
        color: "#fef2f2",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    }),
    []
  );

  useFrame(() => {
    const u = resolveChoreoProgress(choreoTiming);
    if (!rootRef.current) return;
    if (u < 0.14 || u > 0.76 || !actorSeat || !targetSeat) {
      rootRef.current.visible = false;
      return;
    }
    rootRef.current.visible = true;

    const land = computeVictimFrontLandingXZ(targetSeat, 0.92, slotIndex, totalSlots);
    const preferredSide = totalSlots > 1 ? slotIndex - (totalSlots - 1) * 0.5 : 0;
    const curve = computeCampfireSafeBezierXZ(
      actorSeat.x,
      actorSeat.z,
      land.x,
      land.z,
      CAMPFIRE_SAFE_RADIUS,
      preferredSide
    );

    // Vệt huyết ảnh khi Sói đang phóng trên không: u = 0.15..0.44
    for (let i = 0; i < 4; i += 1) {
      const spr = leapTrailRefs.current[i];
      if (!spr) continue;
      const lagU = u - i * 0.025;
      const showLeap = lagU >= 0.15 && lagU <= 0.44;
      spr.visible = showLeap;
      if (showLeap) {
        const k = clamp01((lagU - 0.14) / 0.29);
        const sample = sampleQuadraticBezierXZ(curve, easeOutCubic(k));
        const y = 0.85 + Math.sin(k * Math.PI) * 1.18;
        spr.position.set(sample.x, y, sample.z);
        const s = (1 - i * 0.18) * 0.72;
        spr.scale.set(s, s, 1);
        spr.material.opacity = (1 - i * 0.22) * 0.62;
      }
    }

    // Vòng chấn động đáp sầm xuống đất trước mặt nạn nhân: u = 0.42..0.70
    const showLand = u >= 0.42 && u <= 0.72;
    if (landRingRef.current) {
      landRingRef.current.visible = showLand;
      if (showLand) {
        const kl = (u - 0.42) / 0.3;
        landRingRef.current.position.set(land.x, 0.032, land.z);
        const rs = 0.42 + easeOutCubic(kl) * 1.28;
        landRingRef.current.scale.set(rs, rs, 1);
        landRingRef.current.material.opacity = (1 - kl) * 0.78;
      }
    }

    // Tâm điểm trảo cào ngay trước ngực nạn nhân
    const slashX = THREE.MathUtils.lerp(land.x, targetSeat.x, 0.62);
    const slashZ = THREE.MathUtils.lerp(land.z, targetSeat.z, 0.62);
    const faceYaw = land.faceTargetYaw;

    // Nhát cào chéo 1 (Tay phải Sói): u = 0.43..0.59
    const showSlashA = u >= 0.43 && u <= 0.6;
    if (slashGroupARef.current) {
      slashGroupARef.current.visible = showSlashA;
      if (showSlashA) {
        const ka = (u - 0.43) / 0.17;
        slashGroupARef.current.position.set(slashX, 1.02, slashZ);
        slashGroupARef.current.rotation.set(0, faceYaw, Math.PI * 0.26);
        const sc = 0.72 + easeOutCubic(ka) * 0.45;
        slashGroupARef.current.scale.setScalar(sc);
        const op = Math.sin(ka * Math.PI);
        slashMats.outerA.opacity = op * 0.94;
        slashMats.innerA.opacity = op * 0.98;
      }
    }

    // Nhát cào chéo 2 tạo chữ X (Tay trái Sói): u = 0.51..0.70
    const showSlashB = u >= 0.51 && u <= 0.71;
    if (slashGroupBRef.current) {
      slashGroupBRef.current.visible = showSlashB;
      if (showSlashB) {
        const kb = (u - 0.51) / 0.2;
        slashGroupBRef.current.position.set(slashX, 0.98, slashZ);
        slashGroupBRef.current.rotation.set(0, faceYaw, -Math.PI * 0.26);
        const sc = 0.72 + easeOutCubic(kb) * 0.48;
        slashGroupBRef.current.scale.setScalar(sc);
        const op = Math.sin(kb * Math.PI);
        slashMats.outerB.opacity = op * 0.94;
        slashMats.innerB.opacity = op * 0.98;
      }
    }

    // Tia lửa đỏ bắn tung tóe khi móng vuốt cào trúng: u = 0.44..0.72
    const showSparks = u >= 0.44 && u <= 0.72;
    for (let i = 0; i < 6; i += 1) {
      const sp = sparkRefs.current[i];
      if (!sp) continue;
      sp.visible = showSparks;
      if (showSparks) {
        const ks = (u - 0.44) / 0.28;
        const ang = (i / 6) * Math.PI * 2 + slotIndex;
        const spread = easeOutCubic(ks) * (0.55 + (i % 2) * 0.25);
        sp.position.set(
          slashX + Math.cos(ang) * spread,
          1.0 + Math.sin(ang * 2) * 0.32 - ks * 0.25,
          slashZ + Math.sin(ang) * spread
        );
        const s = (1 - ks) * 0.36;
        sp.scale.set(s, s, 1);
        sp.material.opacity = (1 - ks) * 0.92;
      }
    }
  });

  const clawOffsets = [-0.11, 0, 0.11];

  return (
    <group ref={rootRef} visible={false}>
      {[0, 1, 2, 3].map((idx) => (
        <sprite
          key={`wleap_${idx}`}
          ref={(el) => {
            leapTrailRefs.current[idx] = el;
          }}
          visible={false}
          raycast={NOOP_RAYCAST}
        >
          <spriteMaterial
            map={glowTex}
            color="#ef4444"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}

      <mesh
        ref={landRingRef}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={geos.ringThin}
        raycast={NOOP_RAYCAST}
      >
        <meshBasicMaterial
          color="#f87171"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Bộ 3 móng vuốt chéo phải */}
      <group ref={slashGroupARef} visible={false}>
        {clawOffsets.map((off, idx) => (
          <group key={`ca_${idx}`} position={[off, 0, idx === 1 ? 0.04 : 0]}>
            <mesh geometry={geos.clawArc} material={slashMats.outerA} raycast={NOOP_RAYCAST} />
            <mesh geometry={geos.clawArcInner} material={slashMats.innerA} raycast={NOOP_RAYCAST} />
          </group>
        ))}
      </group>

      {/* Bộ 3 móng vuốt chéo trái (tạo X-Slash) */}
      <group ref={slashGroupBRef} visible={false}>
        {clawOffsets.map((off, idx) => (
          <group key={`cb_${idx}`} position={[off, 0, idx === 1 ? 0.04 : 0]}>
            <mesh geometry={geos.clawArc} material={slashMats.outerB} raycast={NOOP_RAYCAST} />
            <mesh geometry={geos.clawArcInner} material={slashMats.innerB} raycast={NOOP_RAYCAST} />
          </group>
        ))}
      </group>

      {[0, 1, 2, 3, 4, 5].map((idx) => (
        <sprite
          key={`wspark_${idx}`}
          ref={(el) => {
            sparkRefs.current[idx] = el;
          }}
          visible={false}
          raycast={NOOP_RAYCAST}
        >
          <spriteMaterial
            map={glowTex}
            color={idx % 2 === 0 ? "#fca5a5" : "#fb923c"}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/**
 * 4. GÓI VFX BẢO VỆ DỰNG VÒM KHIÊN RUNE LAM & NỔ TIA LỬA CẢN ĐÒN (`guard_intercept` & `guard_patrol_cast`)
 */
function GuardShieldBarrierVfx({
  mode,
  actorSeat,
  targetSeat,
  choreoTiming,
  geos,
  glowTex,
}) {
  const rootRef = useRef(null);
  const domeGroupRef = useRef(null);
  const domeSolidMatRef = useRef(null);
  const domeWireMatRef = useRef(null);
  const floorHexRef = useRef(null);
  const clashFlashRef = useRef(null);
  const sparkRefs = useRef([]);

  useFrame((state) => {
    const u = resolveChoreoProgress(choreoTiming);
    if (!rootRef.current) return;
    const dst = targetSeat || actorSeat;
    if (u < 0.16 || u > 0.88 || !dst) {
      rootRef.current.visible = false;
      return;
    }
    rootRef.current.visible = true;

    const isClash = mode === "guard_intercept";
    const shieldSpot = isClash
      ? computeVictimFrontLandingXZ(dst, 0.88, 0, 1)
      : { x: dst.x, z: dst.z, faceTargetYaw: dst.facingYaw || 0 };
    const faceOutwardYaw = isClash
      ? normalizeAngleRad(shieldSpot.faceTargetYaw + Math.PI)
      : dst.facingYaw || 0;

    const activeDome = isClash ? u >= 0.27 && u <= 0.76 : u >= 0.18 && u <= 0.86;
    if (domeGroupRef.current && domeSolidMatRef.current && domeWireMatRef.current) {
      domeGroupRef.current.visible = activeDome;
      if (activeDome) {
        const kd = isClash ? (u - 0.27) / 0.49 : (u - 0.18) / 0.68;
        const env = Math.sin(clamp01(kd) * Math.PI);
        const fwd = isClash ? 0.34 : 0;
        domeGroupRef.current.position.set(
          shieldSpot.x + Math.sin(faceOutwardYaw) * fwd,
          isClash ? 0.96 : 0.45,
          shieldSpot.z + Math.cos(faceOutwardYaw) * fwd
        );
        // Xoay vòm bán cầu chắn thẳng ra phía trước mặt Bảo Vệ (nếu clash) hoặc chụp bảo vệ trên ghế (nếu patrol)
        domeGroupRef.current.rotation.set(isClash ? Math.PI * 0.5 : 0, faceOutwardYaw, 0);
        const sc = isClash ? 0.92 + env * 0.18 : 1.05;
        domeGroupRef.current.scale.setScalar(sc);
        domeSolidMatRef.current.opacity = env * (isClash ? 0.34 : 0.22);
        domeWireMatRef.current.opacity = env * 0.72;
      }
    }

    if (floorHexRef.current) {
      floorHexRef.current.visible = activeDome;
      if (activeDome) {
        floorHexRef.current.position.set(dst.x, 0.036, dst.z);
        floorHexRef.current.rotation.z = state.clock.elapsedTime * 1.1;
        floorHexRef.current.scale.set(1.18, 1.18, 1);
        floorHexRef.current.material.opacity = 0.68;
      }
    }

    // Chớp nổ & 8 tia lửa xanh-vàng khi Sói đập sầm vào Khiên lúc u = 0.35..0.60
    const showImpact = isClash && u >= 0.34 && u <= 0.62;
    const ki = showImpact ? (u - 0.34) / 0.28 : 0;
    const cx = shieldSpot.x + Math.sin(faceOutwardYaw) * 0.52;
    const cz = shieldSpot.z + Math.cos(faceOutwardYaw) * 0.52;

    if (clashFlashRef.current) {
      clashFlashRef.current.visible = showImpact;
      if (showImpact) {
        clashFlashRef.current.position.set(cx, 1.02, cz);
        const fs = 0.85 + Math.sin(ki * Math.PI) * 1.85;
        clashFlashRef.current.scale.set(fs, fs, 1);
        clashFlashRef.current.material.opacity = Math.sin(ki * Math.PI) * 0.95;
      }
    }

    for (let i = 0; i < 8; i += 1) {
      const sp = sparkRefs.current[i];
      if (!sp) continue;
      sp.visible = showImpact;
      if (showImpact) {
        const ang = (i / 8) * Math.PI * 2;
        const rad = easeOutCubic(ki) * (0.78 + (i % 2) * 0.32);
        sp.position.set(
          cx + Math.cos(ang) * rad,
          1.02 + Math.sin(ang) * rad * 0.65,
          cz + Math.sin(ang * 1.5) * 0.35
        );
        const s = (1 - ki) * 0.38;
        sp.scale.set(s, s, 1);
        sp.material.opacity = (1 - ki) * 0.95;
      }
    }
  });

  return (
    <group ref={rootRef} visible={false}>
      <group ref={domeGroupRef} visible={false}>
        <mesh geometry={geos.shieldDome} raycast={NOOP_RAYCAST}>
          <meshBasicMaterial
            ref={domeSolidMatRef}
            color="#38bdf8"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh geometry={geos.shieldDome} scale={[1.02, 1.02, 1.02]} raycast={NOOP_RAYCAST}>
          <meshBasicMaterial
            ref={domeWireMatRef}
            color="#bae6fd"
            wireframe
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      <mesh
        ref={floorHexRef}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={geos.hexRing}
        raycast={NOOP_RAYCAST}
      >
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <sprite ref={clashFlashRef} visible={false} raycast={NOOP_RAYCAST}>
        <spriteMaterial
          map={glowTex}
          color="#fef08a"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>

      {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => (
        <sprite
          key={`gspark_${idx}`}
          ref={(el) => {
            sparkRefs.current[idx] = el;
          }}
          visible={false}
          raycast={NOOP_RAYCAST}
        >
          <spriteMaterial
            map={glowTex}
            color={idx % 2 === 0 ? "#7dd3fc" : "#fde047"}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/**
 * 5. GÓI VFX TIÊN TRI PHÓNG TIA PHA LÊ THẤU THỊ (`seer_divine_cast`)
 */
function SeerDivinationBeamVfx({ actorSeat, targetSeat, choreoTiming, geos, glowTex }) {
  const rootRef = useRef(null);
  const beamGroupRef = useRef(null);
  const beamOuterMatRef = useRef(null);
  const beamCoreMatRef = useRef(null);
  const targetHaloRef = useRef(null);
  const pulseOrbRefs = useRef([]);

  useFrame((state) => {
    const u = resolveChoreoProgress(choreoTiming);
    if (!rootRef.current) return;
    if (u < 0.2 || u > 0.88 || !actorSeat || !targetSeat) {
      rootRef.current.visible = false;
      return;
    }
    rootRef.current.visible = true;

    const k = clamp01((u - 0.2) / 0.68);
    const env = Math.sin(k * Math.PI);
    const yaw = Math.atan2(targetSeat.x - actorSeat.x, targetSeat.z - actorSeat.z);

    TMP_VEC_A.set(
      actorSeat.x + Math.sin(yaw) * 0.56,
      1.28,
      actorSeat.z + Math.cos(yaw) * 0.56
    );
    TMP_VEC_B.set(targetSeat.x, 1.02, targetSeat.z);
    TMP_DIR.subVectors(TMP_VEC_B, TMP_VEC_A);
    const len = Math.max(0.2, TMP_DIR.length());
    TMP_DIR.normalize();
    TMP_QUAT.setFromUnitVectors(UP_Y, TMP_DIR);

    if (beamGroupRef.current && beamOuterMatRef.current && beamCoreMatRef.current) {
      beamGroupRef.current.position.copy(TMP_VEC_A).addScaledVector(TMP_DIR, len * 0.5);
      beamGroupRef.current.quaternion.copy(TMP_QUAT);
      beamGroupRef.current.scale.set(1, len, 1);
      beamOuterMatRef.current.opacity = env * 0.45;
      beamCoreMatRef.current.opacity = env * 0.88;
    }

    if (targetHaloRef.current) {
      targetHaloRef.current.position.set(targetSeat.x, 0.04, targetSeat.z);
      targetHaloRef.current.rotation.z = -state.clock.elapsedTime * 2.1;
      const rs = 0.82 + Math.sin(state.clock.elapsedTime * 6) * 0.08;
      targetHaloRef.current.scale.set(rs, rs, 1);
      targetHaloRef.current.material.opacity = env * 0.85;
    }

    for (let i = 0; i < 3; i += 1) {
      const sp = pulseOrbRefs.current[i];
      if (!sp) continue;
      const travel = (k * 2.2 + i / 3) % 1.0;
      sp.position.copy(TMP_VEC_A).addScaledVector(TMP_DIR, len * travel);
      const s = 0.36 + Math.sin(travel * Math.PI) * 0.26;
      sp.scale.set(s, s, 1);
      sp.material.opacity = env * 0.9;
    }
  });

  return (
    <group ref={rootRef} visible={false}>
      <group ref={beamGroupRef}>
        <mesh geometry={geos.beamCyl} raycast={NOOP_RAYCAST}>
          <meshBasicMaterial
            ref={beamOuterMatRef}
            color="#818cf8"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh geometry={geos.beamCore} raycast={NOOP_RAYCAST}>
          <meshBasicMaterial
            ref={beamCoreMatRef}
            color="#e0e7ff"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      <mesh
        ref={targetHaloRef}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={geos.hexRing}
        raycast={NOOP_RAYCAST}
      >
        <meshBasicMaterial
          color="#a5b4fc"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {[0, 1, 2].map((idx) => (
        <sprite
          key={`spulse_${idx}`}
          ref={(el) => {
            pulseOrbRefs.current[idx] = el;
          }}
          raycast={NOOP_RAYCAST}
        >
          <spriteMaterial
            map={glowTex}
            color={idx === 1 ? "#38bdf8" : "#c084fc"}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/**
 * 6. GÓI VFX KẺ BỊ NGUYỀN HÓA SÓI (`cursed_blood_metamorph`) & KẺ CỨNG CỎI GỒNG LỬA (`tough_iron_roar`)
 */
function SelfAuraBurstVfx({ mode, actorSeat, choreoTiming, geos, glowTex }) {
  const rootRef = useRef(null);
  const pillarRef = useRef(null);
  const ringARef = useRef(null);
  const ringBRef = useRef(null);
  const emberRefs = useRef([]);

  const isCursed = mode === "cursed_blood_metamorph";

  useFrame((state) => {
    const u = resolveChoreoProgress(choreoTiming);
    if (!rootRef.current) return;
    if (u < 0.08 || u > 0.94 || !actorSeat) {
      rootRef.current.visible = false;
      return;
    }
    rootRef.current.visible = true;

    const fwd = isCursed ? 0.35 : 0.36;
    const cx = actorSeat.x + Math.sin(actorSeat.facingYaw) * fwd;
    const cz = actorSeat.z + Math.cos(actorSeat.facingYaw) * fwd;

    if (isCursed) {
      // u = 0.08..0.42: Vòng xoáy tím nguyền rủa thu hẹp; u >= 0.42: Bùng nổ Cột Huyết Nguyệt đỏ thẫm hóa Sói!
      const preMorph = u < 0.42;
      const kp = preMorph ? (u - 0.08) / 0.34 : (u - 0.42) / 0.52;
      const env = Math.sin(clamp01(kp) * Math.PI);

      if (pillarRef.current) {
        pillarRef.current.visible = !preMorph;
        if (!preMorph) {
          pillarRef.current.position.set(cx, 1.22, cz);
          const rs = 0.68 + easeOutCubic(kp) * 0.55;
          pillarRef.current.scale.set(rs, 0.8 + env * 0.45, rs);
          pillarRef.current.material.opacity = env * 0.52;
        }
      }

      if (ringARef.current) {
        ringARef.current.visible = true;
        ringARef.current.position.set(cx, preMorph ? 0.25 + kp * 0.75 : 0.04, cz);
        const rs = preMorph ? 1.25 - kp * 0.65 : 0.55 + easeOutCubic(kp) * 1.55;
        ringARef.current.scale.set(rs, rs, 1);
        ringARef.current.material.color.set(preMorph ? "#a855f7" : "#ef4444");
        ringARef.current.material.opacity = env * 0.88;
      }

      if (ringBRef.current) {
        ringBRef.current.visible = !preMorph;
        if (!preMorph) {
          ringBRef.current.position.set(cx, 0.05, cz);
          ringBRef.current.rotation.z = state.clock.elapsedTime * 2.5;
          ringBRef.current.scale.set(1.15, 1.15, 1);
          ringBRef.current.material.opacity = env * 0.75;
        }
      }

      for (let i = 0; i < 8; i += 1) {
        const em = emberRefs.current[i];
        if (!em) continue;
        em.visible = true;
        const ang = (i / 8) * Math.PI * 2 + u * 8.0;
        const r = preMorph ? 0.78 * (1 - kp * 0.5) : 0.35 + kp * 0.75;
        const y = preMorph ? 0.35 + (i % 4) * 0.28 : 0.25 + ((kp * 1.6 + i * 0.14) % 1.0) * 1.9;
        em.position.set(cx + Math.cos(ang) * r, y, cz + Math.sin(ang) * r);
        em.scale.set(0.28, 0.28, 1);
        em.material.opacity = 0.82 * env;
      }
    } else {
      // Kẻ Cứng Cỏi gồng lửa cam Ý Chí Thép: u = 0.24..0.90
      const active = u >= 0.24;
      const kt = active ? clamp01((u - 0.24) / 0.66) : 0;
      const env = Math.sin(kt * Math.PI);

      if (pillarRef.current) {
        pillarRef.current.visible = active;
        if (active) {
          pillarRef.current.position.set(cx, 1.08, cz);
          pillarRef.current.scale.set(0.82, 0.72 + env * 0.35, 0.82);
          pillarRef.current.material.opacity = env * 0.38;
        }
      }
      if (ringARef.current) {
        ringARef.current.visible = active;
        if (active) {
          ringARef.current.position.set(cx, 0.04, cz);
          const rs = 0.55 + easeOutCubic(kt) * 1.45;
          ringARef.current.scale.set(rs, rs, 1);
          ringARef.current.material.opacity = (1 - kt) * 0.88;
        }
      }
      if (ringBRef.current) {
        ringBRef.current.visible = active;
        if (active) {
          ringBRef.current.position.set(cx, 0.045, cz);
          ringBRef.current.rotation.z = -state.clock.elapsedTime * 2.0;
          ringBRef.current.scale.set(1.05, 1.05, 1);
          ringBRef.current.material.opacity = env * 0.8;
        }
      }
      for (let i = 0; i < 8; i += 1) {
        const em = emberRefs.current[i];
        if (!em) continue;
        em.visible = active;
        if (active) {
          const ang = (i / 8) * Math.PI * 2 + kt * 4.2;
          const r = 0.48 + (i % 2) * 0.22;
          const y = 0.16 + ((kt * 1.5 + i * 0.12) % 1.0) * 1.85;
          em.position.set(cx + Math.cos(ang) * r, y, cz + Math.sin(ang) * r);
          em.scale.set(0.3, 0.3, 1);
          em.material.opacity = env * 0.92;
        }
      }
    }
  });

  const mainHex = isCursed ? "#dc2626" : "#f97316";
  const subHex = isCursed ? "#c084fc" : "#fde047";

  return (
    <group ref={rootRef} visible={false}>
      <mesh ref={pillarRef} visible={false} geometry={geos.pillarCyl} raycast={NOOP_RAYCAST}>
        <meshBasicMaterial
          color={mainHex}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh
        ref={ringARef}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={geos.ringWide}
        raycast={NOOP_RAYCAST}
      >
        <meshBasicMaterial
          color={mainHex}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh
        ref={ringBRef}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={geos.hexRing}
        raycast={NOOP_RAYCAST}
      >
        <meshBasicMaterial
          color={subHex}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => (
        <sprite
          key={`aember_${idx}`}
          ref={(el) => {
            emberRefs.current[idx] = el;
          }}
          visible={false}
          raycast={NOOP_RAYCAST}
        >
          <spriteMaterial
            map={glowTex}
            color={idx % 2 === 0 ? mainHex : subHex}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}

export default function ActionChoreoVfx3D({ actorChoreoMap, choreoTiming, seatMap }) {
  const geos = useMemo(() => getSharedVfxGeos(), []);
  const glowTex = useMemo(() => getSoftGlowHaloTexture(), []);
  const mistTex = useMemo(() => getDriftingMistTexture(), []);

  const activeEffects = useMemo(() => {
    if (!actorChoreoMap || !seatMap) return [];
    const list = [];
    Object.entries(actorChoreoMap).forEach(([actorId, spec]) => {
      if (!spec?.actionType) return;
      const actorSeat = seatMap[actorId];
      if (!actorSeat) return;
      const targetSeat = spec.targetId ? seatMap[spec.targetId] : actorSeat;

      if (
        spec.actionType === "witch_poison_throw" ||
        spec.actionType === "witch_elixir_cast" ||
        spec.actionType === "wolf_pounce" ||
        spec.actionType === "guard_intercept" ||
        spec.actionType === "guard_patrol_cast" ||
        spec.actionType === "seer_divine_cast" ||
        spec.actionType === "cursed_blood_metamorph" ||
        spec.actionType === "tough_iron_roar"
      ) {
        list.push({
          key: `${actorId}_${spec.actionType}_${spec.targetId || "self"}_${spec.slotIndex ?? 0}`,
          actionType: spec.actionType,
          actorSeat,
          targetSeat,
          slotIndex: spec.slotIndex ?? 0,
          totalSlots: spec.totalSlots ?? 1,
        });
      }
    });
    return list;
  }, [actorChoreoMap, seatMap]);

  if (activeEffects.length === 0 || !choreoTiming) return null;

  return (
    <group name="ActionChoreoVfx3DLayer">
      {activeEffects.map((fx) => {
        switch (fx.actionType) {
          case "witch_poison_throw":
            return (
              <WitchPoisonThrowVfx
                key={fx.key}
                actorSeat={fx.actorSeat}
                targetSeat={fx.targetSeat}
                choreoTiming={choreoTiming}
                geos={geos}
                glowTex={glowTex}
                mistTex={mistTex}
              />
            );
          case "witch_elixir_cast":
            return (
              <WitchElixirCastVfx
                key={fx.key}
                actorSeat={fx.actorSeat}
                targetSeat={fx.targetSeat}
                choreoTiming={choreoTiming}
                geos={geos}
                glowTex={glowTex}
              />
            );
          case "wolf_pounce":
            return (
              <WolfPounceSlashVfx
                key={fx.key}
                actorSeat={fx.actorSeat}
                targetSeat={fx.targetSeat}
                slotIndex={fx.slotIndex}
                totalSlots={fx.totalSlots}
                choreoTiming={choreoTiming}
                geos={geos}
                glowTex={glowTex}
              />
            );
          case "guard_intercept":
          case "guard_patrol_cast":
            return (
              <GuardShieldBarrierVfx
                key={fx.key}
                mode={fx.actionType}
                actorSeat={fx.actorSeat}
                targetSeat={fx.targetSeat}
                choreoTiming={choreoTiming}
                geos={geos}
                glowTex={glowTex}
              />
            );
          case "seer_divine_cast":
            return (
              <SeerDivinationBeamVfx
                key={fx.key}
                actorSeat={fx.actorSeat}
                targetSeat={fx.targetSeat}
                choreoTiming={choreoTiming}
                geos={geos}
                glowTex={glowTex}
              />
            );
          case "cursed_blood_metamorph":
          case "tough_iron_roar":
            return (
              <SelfAuraBurstVfx
                key={fx.key}
                mode={fx.actionType}
                actorSeat={fx.actorSeat}
                choreoTiming={choreoTiming}
                geos={geos}
                glowTex={glowTex}
              />
            );
          default:
            return null;
        }
      })}
    </group>
  );
}
