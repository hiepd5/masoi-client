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
    boltShaft: new THREE.CylinderGeometry(0.016, 0.028, 0.78, 8),
    boltTip: new THREE.ConeGeometry(0.045, 0.16, 8),
    tetherCord: new THREE.CylinderGeometry(0.016, 0.016, 1.0, 8, 1, true),
    coinDisc: new THREE.CylinderGeometry(0.145, 0.145, 0.036, 22),
    ledgerBook: new THREE.BoxGeometry(0.24, 0.048, 0.18),
    stampBlock: new THREE.CylinderGeometry(0.24, 0.28, 0.16, 22),
    stampHandle: new THREE.CylinderGeometry(0.075, 0.105, 0.24, 14),
    stampRect: new THREE.PlaneGeometry(0.72, 0.44),
    rulerBar: new THREE.BoxGeometry(0.085, 0.76, 0.026),
    firewallPanel: new THREE.PlaneGeometry(1.22, 1.08),
    chalkboardPanel: new THREE.BoxGeometry(1.18, 0.88, 0.046),
    paperPlaneWing: new THREE.ConeGeometry(0.24, 0.58, 3),
    bonusCard: new THREE.BoxGeometry(0.26, 0.16, 0.022),
    vipBadge: new THREE.BoxGeometry(0.26, 0.36, 0.028),
  };
  return sharedVfxGeos;
}

/**
 * 1. GÓI VFX PHÙ THỦY NÉM BÌNH ĐỘC / KẾ TOÁN KHẤU TRỪ LƯƠNG / THƯ KÝ GHI SỔ ĐẦU BÀI (`witch_poison_throw`)
 */
function WitchPoisonThrowVfx({
  actorSeat,
  targetSeat,
  choreoTiming,
  geos,
  glowTex,
  mistTex,
  universeId = "classic",
}) {
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

  const isOffice = universeId === "office";
  const isSchool = universeId === "school";
  const mainFxColor = isOffice ? "#f59e0b" : isSchool ? "#e11d48" : "#a855f7";
  const subFxColor = isOffice ? "#fde047" : isSchool ? "#fbbf24" : "#d8b4fe";

  return (
    <group ref={rootRef} visible={false}>
      {/* Đạo cụ 3D đang bay Parabol: Đồng Vàng Lương (Office) / Sổ Đầu Bài Đỏ (School) / Bình Độc Tím (Classic) */}
      <group ref={flaskGroupRef} visible={false}>
        {isOffice ? (
          <mesh geometry={geos.coinDisc} rotation={[Math.PI / 2, 0, 0]} raycast={NOOP_RAYCAST}>
            <meshStandardMaterial
              color="#fbbf24"
              emissive="#f59e0b"
              emissiveIntensity={1.35}
              metalness={0.88}
              roughness={0.16}
            />
          </mesh>
        ) : isSchool ? (
          <mesh geometry={geos.ledgerBook} raycast={NOOP_RAYCAST}>
            <meshStandardMaterial
              color="#dc2626"
              emissive="#e11d48"
              emissiveIntensity={1.15}
              roughness={0.35}
            />
          </mesh>
        ) : (
          <>
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
          </>
        )}
        <sprite scale={[0.58, 0.58, 1]} raycast={NOOP_RAYCAST}>
          <spriteMaterial
            map={glowTex}
            color={subFxColor}
            transparent
            opacity={0.9}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      </group>

      {/* Đuôi sao bay */}
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
            color={idx % 2 === 0 ? mainFxColor : subFxColor}
            transparent
            opacity={0.75}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}

      {/* Vòng chấn động dưới chân ghế mục tiêu */}
      <mesh
        ref={ringRef}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={geos.ringWide}
        raycast={NOOP_RAYCAST}
      >
        <meshBasicMaterial
          ref={ringMatRef}
          color={mainFxColor}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Chớp nổ */}
      <sprite ref={flashSpriteRef} visible={false} raycast={NOOP_RAYCAST}>
        <spriteMaterial
          map={glowTex}
          color={subFxColor}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>

      {/* 8 mảnh vàng lương / sao / thủy tinh văng tứ phía */}
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
            color={idx % 2 === 0 ? subFxColor : mainFxColor}
            blending={THREE.AdditiveBlending}
            transparent
            opacity={0.92}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* 5 đám sương bốc lên theo màu vũ trụ */}
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
            color={idx % 2 === 0 ? mainFxColor : subFxColor}
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
 * 2. GÓI VFX PHÙ THỦY TUNG TIÊN DƯỢC / KẾ TOÁN THƯỞNG CHUYÊN CẦN / THƯ KÝ HOA ĐIỂM 10 (`witch_elixir_cast`)
 */
function WitchElixirCastVfx({
  actorSeat,
  targetSeat,
  choreoTiming,
  geos,
  glowTex,
  universeId = "classic",
}) {
  const rootRef = useRef(null);
  const orbRef = useRef(null);
  const cardPropRef = useRef(null);
  const pillarRef = useRef(null);
  const pillarMatRef = useRef(null);
  const ringARef = useRef(null);
  const ringBRef = useRef(null);
  const sparkRefs = useRef([]);

  const isOffice = universeId === "office";
  const isSchool = universeId === "school";
  const healMain = isSchool ? "#ec4899" : "#10b981";
  const healSub = isOffice ? "#fbbf24" : isSchool ? "#fde047" : "#6ee7b7";

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
        if (cardPropRef.current) {
          cardPropRef.current.visible = true;
          cardPropRef.current.position.set(px, py, pz);
          cardPropRef.current.rotation.set(0.3, k * Math.PI * 4, 0.25);
        }
      } else if (cardPropRef.current) {
        cardPropRef.current.visible = false;
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
          color={healMain}
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>

      {(isOffice || isSchool) && (
        <mesh
          ref={cardPropRef}
          visible={false}
          geometry={isOffice ? geos.bonusCard : geos.shard}
          scale={isSchool ? [2.8, 2.8, 1.2] : [1, 1, 1]}
          raycast={NOOP_RAYCAST}
        >
          <meshStandardMaterial
            color={isOffice ? "#10b981" : "#f472b6"}
            emissive={isOffice ? "#fbbf24" : "#ec4899"}
            emissiveIntensity={1.25}
            metalness={0.65}
            roughness={0.2}
          />
        </mesh>
      )}

      <mesh ref={pillarRef} visible={false} geometry={geos.pillarCyl} raycast={NOOP_RAYCAST}>
        <meshBasicMaterial
          ref={pillarMatRef}
          color={healMain}
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
          color={healSub}
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
            color={idx % 2 === 0 ? healSub : "#fde047"}
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
 * 3. GÓI VFX MA SÓI BỔ TRẢO CHÉO X (CLASSIC) | MỘC ĐỎ CẮT KPI (OFFICE) | THƯỚC GỖ & SAO SỔ ĐẦU BÀI (SCHOOL)
 */
function WolfPounceSlashVfx({
  actorSeat,
  targetSeat,
  slotIndex = 0,
  totalSlots = 1,
  choreoTiming,
  geos,
  glowTex,
  universeId = "classic",
}) {
  const rootRef = useRef(null);
  const leapTrailRefs = useRef([]);
  const landRingRef = useRef(null);
  const slashGroupARef = useRef(null);
  const slashGroupBRef = useRef(null);
  const modernPropRef = useRef(null);
  const modernSealRef = useRef(null);
  const sparkRefs = useRef([]);

  const isOffice = universeId === "office";
  const isSchool = universeId === "school";
  const isClassic = !isOffice && !isSchool;
  const outerColA = isOffice ? "#f59e0b" : isSchool ? "#e11d48" : "#ef4444";
  const innerColA = isOffice ? "#fef08a" : isSchool ? "#fecdd3" : "#fecaca";
  const outerColB = isOffice ? "#d97706" : isSchool ? "#be123c" : "#dc2626";

  const slashMats = useMemo(
    () => ({
      outerA: new THREE.MeshBasicMaterial({
        color: outerColA,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      innerA: new THREE.MeshBasicMaterial({
        color: innerColA,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      outerB: new THREE.MeshBasicMaterial({
        color: outerColB,
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
    [outerColA, innerColA, outerColB]
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

    // Vệt sáng di chuyển: Classic nhảy cao 2m; Office/School bước bộ sát mặt sàn (y = 0.85m)
    for (let i = 0; i < 4; i += 1) {
      const spr = leapTrailRefs.current[i];
      if (!spr) continue;
      const lagU = u - i * 0.025;
      const showLeap = lagU >= 0.15 && lagU <= 0.44;
      spr.visible = showLeap;
      if (showLeap) {
        const k = clamp01((lagU - 0.14) / 0.29);
        const sample = sampleQuadraticBezierXZ(curve, easeOutCubic(k));
        const y = isClassic ? 0.85 + Math.sin(k * Math.PI) * 1.18 : 0.82;
        spr.position.set(sample.x, y, sample.z);
        const s = (1 - i * 0.18) * (isClassic ? 0.72 : 0.48);
        spr.scale.set(s, s, 1);
        spr.material.opacity = (1 - i * 0.22) * (isClassic ? 0.62 : 0.42);
      }
    }

    // Vòng chấn động trước bàn/ghế mục tiêu: u = 0.42..0.72
    const showLand = u >= 0.42 && u <= 0.72;
    if (landRingRef.current) {
      landRingRef.current.visible = showLand;
      if (showLand) {
        const kl = (u - 0.42) / 0.3;
        landRingRef.current.position.set(isClassic ? land.x : targetSeat.x, 0.036, isClassic ? land.z : targetSeat.z);
        const rs = 0.42 + easeOutCubic(kl) * 1.35;
        landRingRef.current.scale.set(rs, rs, 1);
        landRingRef.current.material.opacity = (1 - kl) * 0.82;
      }
    }

    const slashX = THREE.MathUtils.lerp(land.x, targetSeat.x, 0.62);
    const slashZ = THREE.MathUtils.lerp(land.z, targetSeat.z, 0.62);
    const faceYaw = land.faceTargetYaw;

    if (isClassic) {
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
    } else {
      if (slashGroupARef.current) slashGroupARef.current.visible = false;
      if (slashGroupBRef.current) slashGroupBRef.current.visible = false;

      // Mộc Đỏ CẮT KPI giáng thẳng xuống (Office) hoặc Thước Gỗ gõ & Sao Đỏ Sổ Đầu Bài (School) (0% vết cào móng vuốt!)
      const activeStrike = u >= 0.42 && u <= 0.72;
      if (modernPropRef.current) {
        modernPropRef.current.visible = activeStrike;
        if (activeStrike) {
          const ks = clamp01((u - 0.42) / 0.3);
          if (isOffice) {
            // Con dấu KPI khổng lồ giáng từ y=1.82 xuống y=0.92 rồi nẩy nhẹ
            const slamDrop = ks < 0.32 ? easeOutCubic(ks / 0.32) : 1 - clamp01((ks - 0.65) / 0.35) * 0.45;
            const py = THREE.MathUtils.lerp(1.85, 0.92, slamDrop);
            modernPropRef.current.position.set(slashX, py, slashZ);
            modernPropRef.current.rotation.set(0, faceYaw, 0);
            modernPropRef.current.scale.setScalar(1.08);
          } else {
            // Thước gỗ Cô Chủ Nhiệm gõ nhịp dứt khoát
            const tap = Math.sin(ks * Math.PI * 3);
            modernPropRef.current.position.set(slashX, 1.18, slashZ);
            modernPropRef.current.rotation.set(0.35 + tap * 0.55, faceYaw, -0.35);
            modernPropRef.current.scale.setScalar(1.05);
          }
        }
      }
      if (modernSealRef.current) {
        const showSeal = u >= 0.48 && u <= 0.74;
        modernSealRef.current.visible = showSeal;
        if (showSeal) {
          const kSeal = clamp01((u - 0.48) / 0.26);
          modernSealRef.current.position.set(targetSeat.x, 0.88, targetSeat.z);
          modernSealRef.current.rotation.set(-0.25, faceYaw, isOffice ? -0.18 : kSeal * 1.2);
          const sc = 0.72 + easeOutCubic(kSeal) * 0.52;
          modernSealRef.current.scale.setScalar(sc);
          modernSealRef.current.material.opacity = (1 - kSeal * 0.82) * 0.95;
        }
      }
    }

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
            color={outerColA}
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
          color={outerColA}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Bộ 3 móng vuốt chéo chữ X (CHỈ DÀNH CHO CLASSIC MA SÓI) */}
      <group ref={slashGroupARef} visible={false}>
        {clawOffsets.map((off, idx) => (
          <group key={`ca_${idx}`} position={[off, 0, idx === 1 ? 0.04 : 0]}>
            <mesh geometry={geos.clawArc} material={slashMats.outerA} raycast={NOOP_RAYCAST} />
            <mesh geometry={geos.clawArcInner} material={slashMats.innerA} raycast={NOOP_RAYCAST} />
          </group>
        ))}
      </group>

      <group ref={slashGroupBRef} visible={false}>
        {clawOffsets.map((off, idx) => (
          <group key={`cb_${idx}`} position={[off, 0, idx === 1 ? 0.04 : 0]}>
            <mesh geometry={geos.clawArc} material={slashMats.outerB} raycast={NOOP_RAYCAST} />
            <mesh geometry={geos.clawArcInner} material={slashMats.innerB} raycast={NOOP_RAYCAST} />
          </group>
        ))}
      </group>

      {/* Đạo cụ đòn đánh 3D Độc Lập cho Công Sở (Mộc Đỏ Cắt KPI) & Học Đường (Thước Gỗ + Ấn Sổ Đầu Bài) */}
      {!isClassic && (
        <>
          <group ref={modernPropRef} visible={false}>
            {isOffice ? (
              <>
                <mesh geometry={geos.stampBlock} raycast={NOOP_RAYCAST}>
                  <meshStandardMaterial color="#dc2626" emissive="#ef4444" emissiveIntensity={1.1} metalness={0.5} roughness={0.28} />
                </mesh>
                <mesh geometry={geos.stampHandle} position={[0, 0.18, 0]} raycast={NOOP_RAYCAST}>
                  <meshStandardMaterial color="#fbbf24" metalness={0.88} roughness={0.18} />
                </mesh>
              </>
            ) : (
              <mesh geometry={geos.rulerBar} raycast={NOOP_RAYCAST}>
                <meshStandardMaterial color="#d97706" emissive="#f59e0b" emissiveIntensity={0.65} roughness={0.42} />
              </mesh>
            )}
          </group>
          <mesh
            ref={modernSealRef}
            visible={false}
            geometry={isOffice ? geos.stampRect : geos.hexRing}
            raycast={NOOP_RAYCAST}
          >
            <meshBasicMaterial
              color={isOffice ? "#ef4444" : "#f43f5e"}
              transparent
              opacity={0}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </>
      )}

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
            color={idx % 2 === 0 ? innerColA : outerColA}
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
  universeId = "classic",
}) {
  const rootRef = useRef(null);
  const domeGroupRef = useRef(null);
  const domeSolidMatRef = useRef(null);
  const domeWireMatRef = useRef(null);
  const floorHexRef = useRef(null);
  const clashFlashRef = useRef(null);
  const sparkRefs = useRef([]);

  const isOffice = universeId === "office";
  const isSchool = universeId === "school";
  const isClassic = !isOffice && !isSchool;
  const shieldCol = isSchool ? "#10b981" : isOffice ? "#06b6d4" : "#38bdf8";
  const wireCol = isSchool ? "#a7f3d0" : isOffice ? "#67e8f9" : "#bae6fd";

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
        const fwd = isClash ? (isClassic ? 0.34 : 0.42) : 0.38;
        domeGroupRef.current.position.set(
          shieldSpot.x + Math.sin(faceOutwardYaw) * fwd,
          isClassic ? (isClash ? 0.96 : 0.45) : 1.02,
          shieldSpot.z + Math.cos(faceOutwardYaw) * fwd
        );
        if (isClassic) {
          domeGroupRef.current.rotation.set(isClash ? Math.PI * 0.5 : 0, faceOutwardYaw, 0);
        } else {
          // Màn hình Tường Lửa KPI (Office) / Bảng Phấn Xanh Đỡ Lời (School) dựng thẳng trước mặt!
          domeGroupRef.current.rotation.set(0, faceOutwardYaw, 0);
        }
        const sc = isClash ? 0.92 + env * 0.18 : 1.02;
        domeGroupRef.current.scale.setScalar(sc);
        domeSolidMatRef.current.opacity = isSchool ? env * 0.88 : env * (isClash ? 0.38 : 0.26);
        domeWireMatRef.current.opacity = env * 0.78;
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
        {isSchool ? (
          <>
            {/* Bảng Phấn Xanh Lớp Học viền gỗ bảo vệ bạn học! */}
            <mesh geometry={geos.chalkboardPanel} raycast={NOOP_RAYCAST}>
              <meshStandardMaterial
                ref={domeSolidMatRef}
                color="#065f46"
                emissive="#047857"
                emissiveIntensity={0.55}
                roughness={0.55}
                transparent
                opacity={0}
              />
            </mesh>
            <mesh geometry={geos.chalkboardPanel} scale={[1.05, 1.07, 0.7]} raycast={NOOP_RAYCAST}>
              <meshBasicMaterial
                ref={domeWireMatRef}
                color="#fbbf24"
                wireframe
                transparent
                opacity={0}
              />
            </mesh>
          </>
        ) : (
          <>
            <mesh geometry={isOffice ? geos.firewallPanel : geos.shieldDome} raycast={NOOP_RAYCAST}>
              <meshBasicMaterial
                ref={domeSolidMatRef}
                color={shieldCol}
                transparent
                opacity={0}
                side={THREE.DoubleSide}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            <mesh
              geometry={isOffice ? geos.firewallPanel : geos.shieldDome}
              scale={[1.03, 1.03, 1.03]}
              raycast={NOOP_RAYCAST}
            >
              <meshBasicMaterial
                ref={domeWireMatRef}
                color={wireCol}
                wireframe
                transparent
                opacity={0}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          </>
        )}
      </group>

      <mesh
        ref={floorHexRef}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={geos.hexRing}
        raycast={NOOP_RAYCAST}
      >
        <meshBasicMaterial
          color={shieldCol}
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
            color={idx % 2 === 0 ? wireCol : "#fde047"}
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
 * 5. GÓI VFX TIÊN TRI SOI PHA LÊ (CLASSIC) | LASER MATRIX IP (OFFICE) | ĐÈN PIN SAO ĐỎ (SCHOOL)
 */
function SeerDivinationBeamVfx({
  actorSeat,
  targetSeat,
  choreoTiming,
  geos,
  glowTex,
  universeId = "classic",
}) {
  const rootRef = useRef(null);
  const beamGroupRef = useRef(null);
  const beamOuterMatRef = useRef(null);
  const beamCoreMatRef = useRef(null);
  const targetHaloRef = useRef(null);
  const pulseOrbRefs = useRef([]);

  const isOffice = universeId === "office";
  const isSchool = universeId === "school";
  const beamOuterCol = isOffice ? "#10b981" : isSchool ? "#f59e0b" : "#818cf8";
  const beamCoreCol = isOffice ? "#a7f3d0" : isSchool ? "#fef9c3" : "#e0e7ff";
  const haloCol = isOffice ? "#34d399" : isSchool ? "#fbbf24" : "#a5b4fc";

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
      beamGroupRef.current.scale.set(isSchool ? 1.45 : 1, len, isSchool ? 1.45 : 1);
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
            color={beamOuterCol}
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
            color={beamCoreCol}
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
          color={haloCol}
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
            color={idx === 1 ? beamCoreCol : haloCol}
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
 * 6. GÓI VFX CẤT NHẮC / HÓA SÓI (`cursed_blood_metamorph`) & TRỤ VỮNG (`tough_iron_roar`)
 */
function SelfAuraBurstVfx({
  mode,
  actorSeat,
  choreoTiming,
  geos,
  glowTex,
  universeId = "classic",
}) {
  const rootRef = useRef(null);
  const pillarRef = useRef(null);
  const ringARef = useRef(null);
  const ringBRef = useRef(null);
  const emberRefs = useRef([]);

  const isCursed = mode === "cursed_blood_metamorph";
  const isOffice = universeId === "office";
  const isSchool = universeId === "school";
  const preHex = isOffice ? "#fbbf24" : isSchool ? "#fb7185" : "#a855f7";
  const mainHex = isCursed
    ? isOffice
      ? "#f59e0b"
      : isSchool
        ? "#e11d48"
        : "#dc2626"
    : isSchool
      ? "#eab308"
      : "#f97316";
  const subHex = isCursed ? (isOffice ? "#fef08a" : isSchool ? "#fda4af" : "#c084fc") : "#fde047";

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
        ringARef.current.material.color.set(preMorph ? preHex : mainHex);
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

/**
 * =============================================================================
 * NGUỒN SÁNG ĐỘNG DÙNG CHUNG 0MS GIẬT SHADER (POOLED DYNAMIC ACTION POINTLIGHT)
 * - Luôn tồn tại cố định 1 đèn duy nhất trong Scene Graph (intensity = 0 khi nghỉ)
 *   để Three.js KHÔNG BAO GIỜ biên dịch lại Fragment Shader lúc tung chiêu!
 * - Chiếu sáng thật PBR lên mặt sân đá, ghế gỗ sồi và gương mặt nhân vật theo đúng màu chiêu thức.
 * =============================================================================
 */
function PooledActionPointLight({ activeEffects, choreoTiming }) {
  const lightRef = useRef(null);
  const poolDiscRef = useRef(null);
  const poolMatRef = useRef(null);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const light = lightRef.current;
    if (!light) return;
    const u = resolveChoreoProgress(choreoTiming);
    const fx = activeEffects && activeEffects.length > 0 ? activeEffects[0] : null;
    if (!fx || u < 0.04 || u > 0.96 || !fx.actorSeat) {
      light.intensity = 0;
      if (poolDiscRef.current) poolDiscRef.current.visible = false;
      return;
    }

    const aSeat = fx.actorSeat;
    const tSeat = fx.targetSeat || aSeat;
    const sSeat = fx.secondaryTargetSeat || tSeat;
    let lx = aSeat.x;
    let ly = 1.25;
    let lz = aSeat.z;
    let hex = "#ffffff";
    let intensity = 0;
    let dist = 7.2;

    switch (fx.actionType) {
      case "hunter_last_shot": {
        hex = "#e0f2fe";
        dist = 8.2;
        if (u < 0.44) {
          lx = aSeat.x + Math.sin(aSeat.facingYaw) * 0.55;
          lz = aSeat.z + Math.cos(aSeat.facingYaw) * 0.55;
          ly = 0.95;
          intensity = clamp01((u - 0.16) / 0.26) * 1.4;
        } else if (u < 0.58) {
          const k = clamp01((u - 0.44) / 0.14);
          lx = THREE.MathUtils.lerp(aSeat.x, tSeat.x, k);
          lz = THREE.MathUtils.lerp(aSeat.z, tSeat.z, k);
          ly = 1.05;
          intensity = 4.6;
        } else {
          const fade = 1 - clamp01((u - 0.58) / 0.28);
          lx = tSeat.x;
          lz = tSeat.z;
          ly = 1.1;
          intensity = 3.8 * fade;
        }
        break;
      }
      case "cupid_love_arrow": {
        hex = "#f472b6";
        dist = 8.5;
        if (u < 0.46) {
          lx = aSeat.x + Math.sin(aSeat.facingYaw) * 0.45;
          lz = aSeat.z + Math.cos(aSeat.facingYaw) * 0.45;
          ly = 1.38;
          intensity = clamp01((u - 0.12) / 0.3) * 2.8;
        } else {
          const k = clamp01((u - 0.46) / 0.22);
          const midX = (tSeat.x + sSeat.x) * 0.5;
          const midZ = (tSeat.z + sSeat.z) * 0.5;
          lx = THREE.MathUtils.lerp(aSeat.x, midX, k);
          lz = THREE.MathUtils.lerp(aSeat.z, midZ, k);
          ly = 1.25;
          intensity = 3.5 * (1 - clamp01((u - 0.78) / 0.18));
        }
        break;
      }
      case "lovers_heartbreak_cascade": {
        hex = "#f43f5e";
        dist = 7.8;
        lx = (aSeat.x + tSeat.x) * 0.5;
        lz = (aSeat.z + tSeat.z) * 0.5;
        ly = 1.1;
        const burst = u < 0.44 ? clamp01(u / 0.44) * 1.6 : 4.2 * (1 - clamp01((u - 0.44) / 0.38));
        intensity = burst;
        break;
      }
      case "alpha_blood_convert": {
        hex = "#dc2626";
        dist = 8.8;
        const k = clamp01((u - 0.12) / 0.24);
        lx = THREE.MathUtils.lerp(aSeat.x, tSeat.x, k);
        lz = THREE.MathUtils.lerp(aSeat.z, tSeat.z, k);
        ly = u > 0.56 ? 1.65 : 1.15;
        intensity = u < 0.34 ? k * 2.4 : 4.5 * (1 - clamp01((u - 0.78) / 0.18));
        break;
      }
      case "mayor_decree_slam": {
        hex = "#fbbf24";
        dist = 9.0;
        lx = aSeat.x + Math.sin(aSeat.facingYaw) * 0.5;
        lz = aSeat.z + Math.cos(aSeat.facingYaw) * 0.5;
        ly = u < 0.42 ? 1.85 : 0.75;
        intensity = u < 0.42 ? clamp01(u / 0.38) * 2.4 : 4.6 * (1 - clamp01((u - 0.52) / 0.38));
        break;
      }
      case "wolf_pounce": {
        hex = "#ef4444";
        lx = tSeat.x;
        lz = tSeat.z;
        ly = 1.15;
        intensity = u > 0.3 && u < 0.76 ? Math.sin(((u - 0.3) / 0.46) * Math.PI) * 3.2 : 0;
        break;
      }
      case "guard_intercept":
      case "guard_patrol_cast": {
        hex = "#38bdf8";
        lx = tSeat.x;
        lz = tSeat.z;
        ly = 1.2;
        intensity = u > 0.26 && u < 0.8 ? Math.sin(((u - 0.26) / 0.54) * Math.PI) * 3.2 : 0;
        break;
      }
      case "witch_poison_throw": {
        hex = "#a855f7";
        lx = tSeat.x;
        lz = tSeat.z;
        ly = 0.95;
        intensity = u > 0.5 && u < 0.9 ? Math.sin(((u - 0.5) / 0.4) * Math.PI) * 3.1 : 0;
        break;
      }
      case "witch_elixir_cast": {
        hex = "#10b981";
        lx = tSeat.x;
        lz = tSeat.z;
        ly = 1.15;
        intensity = u > 0.38 && u < 0.88 ? Math.sin(((u - 0.38) / 0.5) * Math.PI) * 3.0 : 0;
        break;
      }
      case "seer_divine_cast": {
        hex = "#c084fc";
        lx = tSeat.x;
        lz = tSeat.z;
        ly = 1.3;
        intensity = u > 0.28 && u < 0.86 ? Math.sin(((u - 0.28) / 0.58) * Math.PI) * 2.8 : 0;
        break;
      }
      default: {
        hex = fx.actionType === "tough_iron_roar" ? "#f97316" : "#9333ea";
        lx = aSeat.x;
        lz = aSeat.z;
        ly = 1.2;
        intensity = u > 0.2 && u < 0.85 ? Math.sin(((u - 0.2) / 0.65) * Math.PI) * 3.0 : 0;
        break;
      }
    }

    tmpColor.set(hex);
    light.color.copy(tmpColor);
    light.position.set(lx, ly, lz);
    light.distance = dist;
    light.intensity = intensity;

    if (poolDiscRef.current && poolMatRef.current) {
      if (intensity > 0.15) {
        poolDiscRef.current.visible = true;
        poolDiscRef.current.position.set(lx, 0.022, lz);
        const s = 1.3 + intensity * 0.45;
        poolDiscRef.current.scale.set(s, s, 1);
        poolMatRef.current.color.copy(tmpColor);
        poolMatRef.current.opacity = Math.min(0.42, intensity * 0.085);
      } else {
        poolDiscRef.current.visible = false;
      }
    }
  });

  return (
    <group>
      <pointLight ref={lightRef} intensity={0} distance={7.5} decay={2} castShadow={false} />
      <mesh
        ref={poolDiscRef}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={NOOP_RAYCAST}
      >
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial
          ref={poolMatRef}
          color="#ffffff"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * 7. GÓI VFX THỢ SĂN BẮN ĐẠN BẠC TRẢ THÙ (`hunter_last_shot`)
 */
function HunterSilverBoltVfx({
  actorSeat,
  targetSeat,
  choreoTiming,
  geos,
  glowTex,
  universeId = "classic",
}) {
  const rootRef = useRef(null);
  const muzzleRef = useRef(null);
  const boltGroupRef = useRef(null);
  const soundRingRefs = useRef([]);
  const streakRef = useRef(null);
  const streakMatRef = useRef(null);
  const impactRingRef = useRef(null);
  const impactRingMatRef = useRef(null);
  const sparkRefs = useRef([]);

  const isOffice = universeId === "office";
  const isSchool = universeId === "school";
  const isClassic = !isOffice && !isSchool;
  const fxCol = isSchool ? "#fb7185" : isOffice ? "#38bdf8" : "#e0f2fe";

  useFrame(() => {
    const u = resolveChoreoProgress(choreoTiming);
    if (!rootRef.current) return;
    if (u < 0.22 || u > 0.94 || !actorSeat || !targetSeat) {
      rootRef.current.visible = false;
      return;
    }
    rootRef.current.visible = true;

    const sx = actorSeat.x + Math.sin(actorSeat.facingYaw) * 0.58;
    const sy = isClassic ? 0.88 : 1.32;
    const sz = actorSeat.z + Math.cos(actorSeat.facingYaw) * 0.58;
    const tx = targetSeat.x;
    const ty = 0.98;
    const tz = targetSeat.z;

    if (muzzleRef.current) {
      muzzleRef.current.position.set(sx, sy, sz);
      if (u < 0.44) {
        const charge = clamp01((u - 0.22) / 0.22);
        const s = 0.28 + charge * 0.45;
        muzzleRef.current.scale.set(s, s, 1);
        muzzleRef.current.material.opacity = charge * 0.72;
        muzzleRef.current.visible = true;
      } else if (u < 0.58) {
        const flash = 1 - clamp01((u - 0.44) / 0.14);
        const s = 0.5 + flash * 1.45;
        muzzleRef.current.scale.set(s, s, 1);
        muzzleRef.current.material.opacity = flash * 0.95;
        muzzleRef.current.visible = true;
      } else {
        muzzleRef.current.visible = false;
      }
    }

    // Tàu Bay Giấy EMAIL CC ALL (Office) hoặc Mũi Tên Bạc (Classic)
    const inFlight = !isSchool && u >= 0.44 && u <= (isOffice ? 0.62 : 0.57);
    if (boltGroupRef.current) {
      boltGroupRef.current.visible = inFlight;
      if (inFlight) {
        const k = easeOutCubic((u - 0.44) / (isOffice ? 0.18 : 0.12));
        const arcLift = isOffice ? Math.sin(k * Math.PI) * 0.35 : 0;
        TMP_VEC_A.set(
          THREE.MathUtils.lerp(sx, tx, k),
          THREE.MathUtils.lerp(sy, ty, k) + arcLift,
          THREE.MathUtils.lerp(sz, tz, k)
        );
        TMP_DIR.set(tx - sx, ty - sy, tz - sz).normalize();
        TMP_QUAT.setFromUnitVectors(UP_Y, TMP_DIR);
        boltGroupRef.current.position.copy(TMP_VEC_A);
        boltGroupRef.current.quaternion.copy(TMP_QUAT);
      }
    }

    // Sóng Âm Loa Phóng Thanh "EM THƯA CÔ!" (School)
    if (isSchool) {
      TMP_DIR.set(tx - sx, ty - sy, tz - sz).normalize();
      TMP_QUAT.setFromUnitVectors(UP_Y, TMP_DIR);
      for (let r = 0; r < 3; r += 1) {
        const sr = soundRingRefs.current[r];
        if (!sr) continue;
        const startU = 0.44 + r * 0.05;
        const activeWave = u >= startU && u <= startU + 0.24;
        sr.visible = activeWave;
        if (activeWave) {
          const kw = (u - startU) / 0.24;
          sr.position.set(
            THREE.MathUtils.lerp(sx, tx, kw),
            THREE.MathUtils.lerp(sy, ty, kw),
            THREE.MathUtils.lerp(sz, tz, kw)
          );
          sr.quaternion.copy(TMP_QUAT);
          const ws = 0.22 + kw * 0.95;
          sr.scale.set(ws, ws, ws);
          sr.material.opacity = (1 - kw) * 0.92;
        }
      }
    }

    if (streakRef.current && streakMatRef.current) {
      if (u >= 0.44 && u <= 0.72) {
        streakRef.current.visible = true;
        const dist = Math.max(0.2, Math.hypot(tx - sx, ty - sy, tz - sz));
        TMP_DIR.set(tx - sx, ty - sy, tz - sz).normalize();
        TMP_QUAT.setFromUnitVectors(UP_Y, TMP_DIR);
        streakRef.current.position.set((sx + tx) * 0.5, (sy + ty) * 0.5, (sz + tz) * 0.5);
        streakRef.current.quaternion.copy(TMP_QUAT);
        const fade = 1 - clamp01((u - 0.48) / 0.24);
        streakRef.current.scale.set(0.55 + fade * 0.75, dist, 0.55 + fade * 0.75);
        streakMatRef.current.opacity = fade * (isSchool ? 0.45 : 0.85);
      } else {
        streakRef.current.visible = false;
      }
    }

    const hitActive = u >= 0.54 && u <= 0.9;
    if (impactRingRef.current && impactRingMatRef.current) {
      impactRingRef.current.visible = hitActive;
      if (hitActive) {
        const hk = clamp01((u - 0.54) / 0.34);
        impactRingRef.current.position.set(tx, 0.05, tz);
        const rs = 0.45 + easeOutCubic(hk) * 1.85;
        impactRingRef.current.scale.set(rs, rs, 1);
        impactRingMatRef.current.opacity = (1 - hk) * 0.88;
      }
    }

    for (let i = 0; i < 6; i++) {
      const sp = sparkRefs.current[i];
      if (!sp) continue;
      if (!hitActive) {
        sp.visible = false;
        continue;
      }
      sp.visible = true;
      const hk = clamp01((u - 0.54) / 0.34);
      const ang = (i / 6) * Math.PI * 2 + 0.3;
      const rad = easeOutCubic(hk) * 1.15;
      sp.position.set(
        tx + Math.cos(ang) * rad,
        ty + Math.sin(hk * Math.PI) * (0.45 + (i % 2) * 0.25) - hk * 0.35,
        tz + Math.sin(ang) * rad
      );
      const sc = Math.max(0.02, (1 - hk) * 0.34);
      sp.scale.set(sc, sc, 1);
      sp.material.opacity = (1 - hk) * 0.9;
    }
  });

  return (
    <group ref={rootRef} visible={false}>
      <sprite ref={muzzleRef} visible={false} raycast={NOOP_RAYCAST}>
        <spriteMaterial
          map={glowTex}
          color={fxCol}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      <group ref={boltGroupRef} visible={false}>
        {isOffice ? (
          /* Tàu Bay Giấy Trắng-Vàng EMAIL CC ALL */
          <mesh geometry={geos.paperPlaneWing} scale={[1.25, 1.0, 0.22]} raycast={NOOP_RAYCAST}>
            <meshStandardMaterial color="#f8fafc" emissive="#38bdf8" emissiveIntensity={0.85} roughness={0.25} />
          </mesh>
        ) : (
          <>
            <mesh geometry={geos.boltShaft} raycast={NOOP_RAYCAST}>
              <meshBasicMaterial color="#f8fafc" />
            </mesh>
            <mesh geometry={geos.boltTip} position={[0, 0.45, 0]} raycast={NOOP_RAYCAST}>
              <meshBasicMaterial color="#bae6fd" />
            </mesh>
          </>
        )}
      </group>
      {isSchool &&
        [0, 1, 2].map((ri) => (
          <mesh
            key={`sring_${ri}`}
            ref={(el) => {
              soundRingRefs.current[ri] = el;
            }}
            geometry={geos.ringThin}
            rotation={[Math.PI / 2, 0, 0]}
            visible={false}
            raycast={NOOP_RAYCAST}
          >
            <meshBasicMaterial
              color={ri % 2 === 0 ? "#f43f5e" : "#fde047"}
              transparent
              opacity={0}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ))}
      <mesh ref={streakRef} geometry={geos.beamCore} visible={false} raycast={NOOP_RAYCAST}>
        <meshBasicMaterial
          ref={streakMatRef}
          color={fxCol}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={impactRingRef}
        geometry={geos.ringThin}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
        raycast={NOOP_RAYCAST}
      >
        <meshBasicMaterial
          ref={impactRingMatRef}
          color={fxCol}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <sprite
          key={`hspark_${i}`}
          ref={(el) => {
            sparkRefs.current[i] = el;
          }}
          visible={false}
          raycast={NOOP_RAYCAST}
        >
          <spriteMaterial
            map={glowTex}
            color={i % 2 === 0 ? "#ffffff" : fxCol}
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
 * 8. GÓI VFX CUPID BẮN ĐÔI MŨI TÊN & SỢI TƠ HỒNG KẾT DUYÊN (`cupid_love_arrow`)
 */
function CupidTwinArrowTetherVfx({
  actorSeat,
  targetSeat,
  secondaryTargetSeat,
  choreoTiming,
  geos,
  glowTex,
}) {
  const rootRef = useRef(null);
  const arrowARef = useRef(null);
  const arrowBRef = useRef(null);
  const tetherRef = useRef(null);
  const tetherMatRef = useRef(null);
  const ringARef = useRef(null);
  const ringBRef = useRef(null);
  const moteRefs = useRef([]);

  useFrame((state) => {
    const u = resolveChoreoProgress(choreoTiming);
    if (!rootRef.current) return;
    const seatB = secondaryTargetSeat || targetSeat;
    if (u < 0.3 || u > 0.98 || !actorSeat || !targetSeat || !seatB) {
      rootRef.current.visible = false;
      return;
    }
    rootRef.current.visible = true;
    const t = state.clock.elapsedTime;

    const sx = actorSeat.x + Math.sin(actorSeat.facingYaw) * 0.45;
    const sy = 1.32;
    const sz = actorSeat.z + Math.cos(actorSeat.facingYaw) * 0.45;

    const updateArrow = (ref, destSeat, startU, endU) => {
      if (!ref.current) return;
      if (u < startU || u > endU) {
        ref.current.visible = false;
        return;
      }
      ref.current.visible = true;
      const k = clamp01((u - startU) / (endU - startU));
      const px = THREE.MathUtils.lerp(sx, destSeat.x, k);
      const pz = THREE.MathUtils.lerp(sz, destSeat.z, k);
      const py = THREE.MathUtils.lerp(sy, 0.88, k) + Math.sin(k * Math.PI) * 0.72;
      const kNext = Math.min(1, k + 0.04);
      const nx = THREE.MathUtils.lerp(sx, destSeat.x, kNext);
      const nz = THREE.MathUtils.lerp(sz, destSeat.z, kNext);
      const ny = THREE.MathUtils.lerp(sy, 0.88, kNext) + Math.sin(kNext * Math.PI) * 0.72;
      TMP_DIR.set(nx - px, ny - py, nz - pz).normalize();
      TMP_QUAT.setFromUnitVectors(UP_Y, TMP_DIR);
      ref.current.position.set(px, py, pz);
      ref.current.quaternion.copy(TMP_QUAT);
    };

    updateArrow(arrowARef, targetSeat, 0.45, 0.64);
    updateArrow(arrowBRef, seatB, 0.5, 0.69);

    // Sợi Dây Tơ Hồng phát sáng nối liền 2 ghế Tình Nhân (u >= 0.62)
    const tetherOn = u >= 0.62;
    if (tetherRef.current && tetherMatRef.current) {
      tetherRef.current.visible = tetherOn;
      if (tetherOn) {
        const tk = clamp01((u - 0.62) / 0.16);
        const fade = 1 - clamp01((u - 0.86) / 0.12);
        const dx = seatB.x - targetSeat.x;
        const dz = seatB.z - targetSeat.z;
        const dist = Math.max(0.2, Math.hypot(dx, dz) * tk);
        TMP_DIR.set(dx, 0, dz).normalize();
        TMP_QUAT.setFromUnitVectors(UP_Y, TMP_DIR);
        tetherRef.current.position.set(
          targetSeat.x + dx * 0.5 * tk,
          0.84 + Math.sin(t * 5) * 0.03,
          targetSeat.z + dz * 0.5 * tk
        );
        tetherRef.current.quaternion.copy(TMP_QUAT);
        tetherRef.current.scale.set(1, dist, 1);
        tetherMatRef.current.opacity = 0.86 * fade;
      }
    }

    const updateHaloRing = (rRef, seat, startU) => {
      if (!rRef.current) return;
      if (u < startU) {
        rRef.current.visible = false;
        return;
      }
      rRef.current.visible = true;
      const rk = clamp01((u - startU) / 0.3);
      const fade = 1 - clamp01((u - 0.84) / 0.14);
      rRef.current.position.set(seat.x, 0.05, seat.z);
      const sc = 0.65 + rk * 0.55;
      rRef.current.scale.set(sc, sc, 1);
      rRef.current.material.opacity = 0.78 * fade;
    };
    updateHaloRing(ringARef, targetSeat, 0.62);
    updateHaloRing(ringBRef, seatB, 0.67);

    for (let i = 0; i < 6; i++) {
      const m = moteRefs.current[i];
      if (!m) continue;
      if (!tetherOn) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      const frac = ((i / 6) + t * 0.35) % 1;
      m.position.set(
        THREE.MathUtils.lerp(targetSeat.x, seatB.x, frac),
        0.84 + Math.sin(frac * Math.PI) * 0.22,
        THREE.MathUtils.lerp(targetSeat.z, seatB.z, frac)
      );
      const sc = 0.22 + Math.sin(t * 6 + i) * 0.05;
      m.scale.set(sc, sc, 1);
      m.material.opacity = 0.82 * (1 - clamp01((u - 0.86) / 0.12));
    }
  });

  return (
    <group ref={rootRef} visible={false}>
      {[arrowARef, arrowBRef].map((aRef, idx) => (
        <group key={`carrow_${idx}`} ref={aRef} visible={false}>
          <mesh geometry={geos.boltShaft} raycast={NOOP_RAYCAST}>
            <meshBasicMaterial color="#fbcfe8" />
          </mesh>
          <mesh geometry={geos.shard} position={[0, 0.42, 0]} scale={[1.4, 1.8, 1.4]} raycast={NOOP_RAYCAST}>
            <meshBasicMaterial color="#ec4899" />
          </mesh>
        </group>
      ))}
      <mesh ref={tetherRef} geometry={geos.tetherCord} visible={false} raycast={NOOP_RAYCAST}>
        <meshBasicMaterial
          ref={tetherMatRef}
          color="#f472b6"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {[ringARef, ringBRef].map((rRef, idx) => (
        <mesh
          key={`cring_${idx}`}
          ref={rRef}
          geometry={geos.ringThin}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
          raycast={NOOP_RAYCAST}
        >
          <meshBasicMaterial
            color="#f472b6"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <sprite
          key={`cmote_${i}`}
          ref={(el) => {
            moteRefs.current[i] = el;
          }}
          visible={false}
          raycast={NOOP_RAYCAST}
        >
          <spriteMaterial
            map={glowTex}
            color={i % 2 === 0 ? "#fbcfe8" : "#ec4899"}
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
 * 9. GÓI VFX ĐÔI TÌNH NHÂN ĐỨT DÂY TƠ HỒNG TAN VỠ (`lovers_heartbreak_cascade`)
 */
function LoversHeartbreakShatterVfx({ actorSeat, targetSeat, choreoTiming, geos, glowTex }) {
  const rootRef = useRef(null);
  const tetherRef = useRef(null);
  const shardRefs = useRef([]);
  const flashRef = useRef(null);

  useFrame((state) => {
    const u = resolveChoreoProgress(choreoTiming);
    if (!rootRef.current) return;
    if (u < 0.08 || u > 0.95 || !actorSeat || !targetSeat) {
      rootRef.current.visible = false;
      return;
    }
    rootRef.current.visible = true;
    const t = state.clock.elapsedTime;
    const midX = (actorSeat.x + targetSeat.x) * 0.5;
    const midZ = (actorSeat.z + targetSeat.z) * 0.5;

    // Trước u = 0.44: Sợi tơ hồng rung bần bật căng đứt giữa 2 ghế
    if (tetherRef.current) {
      if (u < 0.44) {
        tetherRef.current.visible = true;
        const dx = targetSeat.x - actorSeat.x;
        const dz = targetSeat.z - actorSeat.z;
        const dist = Math.max(0.2, Math.hypot(dx, dz));
        TMP_DIR.set(dx, 0, dz).normalize();
        TMP_QUAT.setFromUnitVectors(UP_Y, TMP_DIR);
        const jitter = Math.sin(t * 42) * 0.035 * (u / 0.44);
        tetherRef.current.position.set(midX + jitter, 0.88, midZ - jitter);
        tetherRef.current.quaternion.copy(TMP_QUAT);
        tetherRef.current.scale.set(1.2, dist, 1.2);
        tetherRef.current.material.opacity = 0.9;
      } else {
        tetherRef.current.visible = false;
      }
    }

    // Từ u = 0.44: Nổ vỡ thành 8 mảnh tinh thể pha lê hồng rơi lả tả xuống đá!
    const shattered = u >= 0.44;
    if (flashRef.current) {
      flashRef.current.visible = shattered && u < 0.64;
      if (flashRef.current.visible) {
        const fk = 1 - clamp01((u - 0.44) / 0.2);
        flashRef.current.position.set(midX, 0.92, midZ);
        const fs = 0.6 + fk * 1.65;
        flashRef.current.scale.set(fs, fs, 1);
        flashRef.current.material.opacity = fk * 0.92;
      }
    }

    for (let i = 0; i < 8; i++) {
      const sh = shardRefs.current[i];
      if (!sh) continue;
      if (!shattered) {
        sh.visible = false;
        continue;
      }
      sh.visible = true;
      const sk = clamp01((u - 0.44) / 0.48);
      const frac = (i + 0.5) / 8;
      const baseX = THREE.MathUtils.lerp(actorSeat.x, targetSeat.x, frac);
      const baseZ = THREE.MathUtils.lerp(actorSeat.z, targetSeat.z, frac);
      const spreadAng = i * 1.9;
      sh.position.set(
        baseX + Math.cos(spreadAng) * sk * 0.55,
        Math.max(0.05, 0.88 + Math.sin(sk * Math.PI) * 0.28 - sk * sk * 1.15),
        baseZ + Math.sin(spreadAng) * sk * 0.55
      );
      sh.rotation.set(sk * 8 + i, sk * 6, sk * 5);
      sh.material.opacity = (1 - sk) * 0.95;
    }
  });

  return (
    <group ref={rootRef} visible={false}>
      <mesh ref={tetherRef} geometry={geos.tetherCord} visible={false} raycast={NOOP_RAYCAST}>
        <meshBasicMaterial
          color="#fb7185"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <sprite ref={flashRef} visible={false} raycast={NOOP_RAYCAST}>
        <spriteMaterial
          map={glowTex}
          color="#fda4af"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <mesh
          key={`lshard_${i}`}
          ref={(el) => {
            shardRefs.current[i] = el;
          }}
          geometry={geos.shard}
          scale={[1.35, 1.35, 1.35]}
          visible={false}
          raycast={NOOP_RAYCAST}
        >
          <meshBasicMaterial color={i % 2 === 0 ? "#fda4af" : "#e11d48"} transparent opacity={0} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 10. GÓI VFX SÓI ĐẦU ĐÀN KHẮC ẤN HUYẾT NGUYỆT / TRAO THẺ VIP / BĂNG ĐỎ (`alpha_blood_convert`)
 */
function AlphaBloodCrestVfx({
  actorSeat,
  targetSeat,
  choreoTiming,
  geos,
  glowTex,
  universeId = "classic",
}) {
  const isOffice = universeId === "office";
  const isSchool = universeId === "school";
  const isClassic = !isOffice && !isSchool;

  const rootRef = useRef(null);
  const pillarRef = useRef(null);
  const hexSealRef = useRef(null);
  const clawARef = useRef(null);
  const clawBRef = useRef(null);
  const vipBadgeRef = useRef(null);
  const howlWaveRef = useRef(null);

  const badgeCol = isOffice ? "#f59e0b" : isSchool ? "#e11d48" : "#ef4444";
  const pillarCol = isOffice ? "#d97706" : isSchool ? "#f43f5e" : "#b91c1c";

  useFrame((state) => {
    const u = resolveChoreoProgress(choreoTiming);
    if (!rootRef.current) return;
    if (u < 0.3 || u > 0.92 || !actorSeat || !targetSeat) {
      rootRef.current.visible = false;
      return;
    }
    rootRef.current.visible = true;
    const t = state.clock.elapsedTime;
    const tx = targetSeat.x;
    const tz = targetSeat.z;

    // Nhát vuốt Huyết Ấn chữ X đỏ thẫm (CHỈ DÀNH CHO CLASSIC: u = 0.34 -> 0.58)
    const slashOn = isClassic && u >= 0.34 && u <= 0.6;
    [clawARef, clawBRef].forEach((cRef, idx) => {
      if (!cRef.current) return;
      cRef.current.visible = slashOn;
      if (slashOn) {
        const sk = clamp01((u - 0.34) / 0.24);
        cRef.current.position.set(tx, 1.02, tz);
        cRef.current.rotation.set(0.3, targetSeat.facingYaw || 0, idx === 0 ? 0.78 : -0.78);
        const sc = 0.8 + easeOutCubic(sk) * 0.65;
        cRef.current.scale.set(sc, sc, sc);
        cRef.current.material.opacity = (1 - sk) * 0.95;
      }
    });

    // Thẻ VIP Cất Nhắc (Office) / Phù Hiệu Sao Đỏ - Giám Thị (School) xoay lơ lửng (u = 0.34 -> 0.88)
    if (vipBadgeRef.current) {
      const badgeOn = !isClassic && u >= 0.34 && u <= 0.88;
      vipBadgeRef.current.visible = badgeOn;
      if (badgeOn) {
        const bk = clamp01((u - 0.34) / 0.22);
        const fade = 1 - clamp01((u - 0.76) / 0.12);
        vipBadgeRef.current.position.set(
          tx,
          THREE.MathUtils.lerp(1.92, 1.38, easeOutCubic(bk)) + Math.sin(t * 5) * 0.04,
          tz
        );
        vipBadgeRef.current.rotation.set(0.12, t * 2.8, isSchool ? Math.PI * 0.5 : 0);
        const sc = (0.72 + easeOutCubic(bk) * 0.52) * Math.max(0.2, fade);
        vipBadgeRef.current.scale.set(sc, sc, sc);
      }
    }

    // Vòng lục giác phát sáng dưới chân mục tiêu (u >= 0.36)
    if (hexSealRef.current) {
      hexSealRef.current.visible = u >= 0.36;
      if (hexSealRef.current.visible) {
        const hk = clamp01((u - 0.36) / 0.22);
        const fade = 1 - clamp01((u - 0.76) / 0.16);
        hexSealRef.current.position.set(tx, 0.045, tz);
        hexSealRef.current.rotation.z = t * 1.8;
        const sc = 0.6 + easeOutCubic(hk) * 0.95;
        hexSealRef.current.scale.set(sc, sc, 1);
        hexSealRef.current.material.opacity = 0.88 * fade;
      }
    }

    // Cột Hào Quang & Vòng Năng Lượng Thăng Cấp (u = 0.54 -> 0.86)
    const howlOn = u >= 0.54 && u <= 0.88;
    if (pillarRef.current) {
      pillarRef.current.visible = howlOn;
      if (howlOn) {
        const pk = Math.sin(((u - 0.54) / 0.34) * Math.PI);
        pillarRef.current.position.set(tx, 1.2, tz);
        pillarRef.current.scale.set(0.95 + pk * 0.35, 1.25, 0.95 + pk * 0.35);
        pillarRef.current.material.opacity = pk * 0.52;
      }
    }
    if (howlWaveRef.current) {
      howlWaveRef.current.visible = howlOn;
      if (howlOn) {
        const wk = clamp01((u - 0.56) / 0.28);
        howlWaveRef.current.position.set(tx, 1.55 + wk * 0.65, tz);
        const ws = 0.5 + easeOutCubic(wk) * 2.2;
        howlWaveRef.current.scale.set(ws, ws, 1);
        howlWaveRef.current.material.opacity = (1 - wk) * 0.8;
      }
    }
  });

  return (
    <group ref={rootRef} visible={false}>
      {[clawARef, clawBRef].map((cRef, i) => (
        <mesh key={`aclaw_${i}`} ref={cRef} geometry={geos.clawArc} visible={false} raycast={NOOP_RAYCAST}>
          <meshBasicMaterial
            color="#ef4444"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
      {!isClassic && (
        <group ref={vipBadgeRef} visible={false}>
          <mesh geometry={geos.vipBadge} raycast={NOOP_RAYCAST}>
            <meshStandardMaterial
              color={badgeCol}
              emissive={badgeCol}
              emissiveIntensity={0.85}
              metalness={0.55}
              roughness={0.25}
            />
          </mesh>
          <mesh geometry={geos.bonusCard} position={[0, 0, 0.018]} scale={[0.65, 0.55, 0.8]} raycast={NOOP_RAYCAST}>
            <meshBasicMaterial color="#fef08a" />
          </mesh>
        </group>
      )}
      <mesh
        ref={hexSealRef}
        geometry={geos.hexRing}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
        raycast={NOOP_RAYCAST}
      >
        <meshBasicMaterial
          color={badgeCol}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={pillarRef} geometry={geos.pillarCyl} visible={false} raycast={NOOP_RAYCAST}>
        <meshBasicMaterial
          color={pillarCol}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <sprite ref={howlWaveRef} visible={false} raycast={NOOP_RAYCAST}>
        <spriteMaterial
          map={glowTex}
          color={isOffice ? "#fde047" : "#fda4af"}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}

/**
 * 11. GÓI VFX TRƯỞNG LÀNG DẬM QUYỀN TRƯỢNG SẮC LỆNH HOÀNG KIM X2 (`mayor_decree_slam`)
 */
function MayorGoldenDecreeVfx({ actorSeat, choreoTiming, geos, glowTex }) {
  const rootRef = useRef(null);
  const sunCrownRef = useRef(null);
  const waveInnerRef = useRef(null);
  const waveOuterRef = useRef(null);
  const pillarRef = useRef(null);

  useFrame((state) => {
    const u = resolveChoreoProgress(choreoTiming);
    if (!rootRef.current) return;
    if (u < 0.14 || u > 0.94 || !actorSeat) {
      rootRef.current.visible = false;
      return;
    }
    rootRef.current.visible = true;
    const t = state.clock.elapsedTime;
    const slamX = actorSeat.x + Math.sin(actorSeat.facingYaw) * 0.58;
    const slamZ = actorSeat.z + Math.cos(actorSeat.facingYaw) * 0.58;

    // Quầng Mặt Trời Hoàng Kim tụ trên đỉnh Quyền Trượng khi giơ cao (u < 0.42)
    if (sunCrownRef.current) {
      const pre = u < 0.44;
      sunCrownRef.current.visible = pre || u < 0.78;
      if (pre) {
        const rk = clamp01((u - 0.14) / 0.26);
        sunCrownRef.current.position.set(slamX, 1.95, slamZ);
        const sc = 0.35 + rk * 0.75;
        sunCrownRef.current.scale.set(sc, sc, 1);
        sunCrownRef.current.material.opacity = rk * 0.9;
      } else {
        const fk = 1 - clamp01((u - 0.44) / 0.34);
        sunCrownRef.current.position.set(slamX, 1.82 + Math.sin(t * 6) * 0.04, slamZ);
        sunCrownRef.current.scale.set(0.85, 0.85, 1);
        sunCrownRef.current.material.opacity = fk * 0.72;
      }
    }

    // Sóng chấn động Hoàng Kim đôi lan rộng trên mặt sân đá lúc dậm trượng (u >= 0.42)
    const slammed = u >= 0.42;
    if (waveInnerRef.current) {
      waveInnerRef.current.visible = slammed;
      if (slammed) {
        const wk = clamp01((u - 0.42) / 0.42);
        waveInnerRef.current.position.set(slamX, 0.045, slamZ);
        waveInnerRef.current.rotation.z = -t * 1.5;
        const sc = 0.5 + easeOutCubic(wk) * 2.35;
        waveInnerRef.current.scale.set(sc, sc, 1);
        waveInnerRef.current.material.opacity = (1 - wk) * 0.92;
      }
    }
    if (waveOuterRef.current) {
      waveOuterRef.current.visible = u >= 0.48;
      if (waveOuterRef.current.visible) {
        const wk = clamp01((u - 0.48) / 0.42);
        waveOuterRef.current.position.set(slamX, 0.048, slamZ);
        const sc = 0.4 + easeOutCubic(wk) * 1.75;
        waveOuterRef.current.scale.set(sc, sc, 1);
        waveOuterRef.current.material.opacity = (1 - wk) * 0.82;
      }
    }
    if (pillarRef.current) {
      pillarRef.current.visible = slammed && u < 0.82;
      if (pillarRef.current.visible) {
        const pk = Math.sin(((u - 0.42) / 0.4) * Math.PI);
        pillarRef.current.position.set(slamX, 1.18, slamZ);
        pillarRef.current.scale.set(0.85, 1.15, 0.85);
        pillarRef.current.material.opacity = pk * 0.46;
      }
    }
  });

  return (
    <group ref={rootRef} visible={false}>
      <sprite ref={sunCrownRef} visible={false} raycast={NOOP_RAYCAST}>
        <spriteMaterial
          map={glowTex}
          color="#fef08a"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      <mesh
        ref={waveInnerRef}
        geometry={geos.hexRing}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
        raycast={NOOP_RAYCAST}
      >
        <meshBasicMaterial
          color="#f59e0b"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={waveOuterRef}
        geometry={geos.ringThin}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
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
      <mesh ref={pillarRef} geometry={geos.pillarCyl} visible={false} raycast={NOOP_RAYCAST}>
        <meshBasicMaterial
          color="#fbbf24"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export default function ActionChoreoVfx3D({
  actorChoreoMap,
  choreoTiming,
  seatMap,
  universeId = "classic",
}) {
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
      const secondaryTargetSeat = spec.secondaryTargetId ? seatMap[spec.secondaryTargetId] : null;

      if (
        spec.actionType === "witch_poison_throw" ||
        spec.actionType === "witch_elixir_cast" ||
        spec.actionType === "wolf_pounce" ||
        spec.actionType === "guard_intercept" ||
        spec.actionType === "guard_patrol_cast" ||
        spec.actionType === "seer_divine_cast" ||
        spec.actionType === "cursed_blood_metamorph" ||
        spec.actionType === "tough_iron_roar" ||
        spec.actionType === "hunter_last_shot" ||
        spec.actionType === "cupid_love_arrow" ||
        spec.actionType === "lovers_heartbreak_cascade" ||
        spec.actionType === "alpha_blood_convert" ||
        spec.actionType === "mayor_decree_slam"
      ) {
        list.push({
          key: `${actorId}_${spec.actionType}_${spec.targetId || "self"}_${spec.slotIndex ?? 0}`,
          actionType: spec.actionType,
          actorSeat,
          targetSeat,
          secondaryTargetSeat,
          slotIndex: spec.slotIndex ?? 0,
          totalSlots: spec.totalSlots ?? 1,
        });
      }
    });
    return list;
  }, [actorChoreoMap, seatMap]);

  return (
    <group name="ActionChoreoVfx3DLayer">
      {/* Đèn Flash Động Dùng Chung (0ms giật biên dịch lại WebGL Shader!) */}
      <PooledActionPointLight activeEffects={activeEffects} choreoTiming={choreoTiming} />

      {choreoTiming &&
        activeEffects.map((fx) => {
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
                  universeId={universeId}
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
                  universeId={universeId}
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
                  universeId={universeId}
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
                  universeId={universeId}
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
                  universeId={universeId}
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
                  universeId={universeId}
                />
              );
            case "hunter_last_shot":
              return (
                <HunterSilverBoltVfx
                  key={fx.key}
                  actorSeat={fx.actorSeat}
                  targetSeat={fx.targetSeat}
                  choreoTiming={choreoTiming}
                  geos={geos}
                  glowTex={glowTex}
                  universeId={universeId}
                />
              );
            case "cupid_love_arrow":
              return (
                <CupidTwinArrowTetherVfx
                  key={fx.key}
                  actorSeat={fx.actorSeat}
                  targetSeat={fx.targetSeat}
                  secondaryTargetSeat={fx.secondaryTargetSeat}
                  choreoTiming={choreoTiming}
                  geos={geos}
                  glowTex={glowTex}
                />
              );
            case "lovers_heartbreak_cascade":
              return (
                <LoversHeartbreakShatterVfx
                  key={fx.key}
                  actorSeat={fx.actorSeat}
                  targetSeat={fx.targetSeat}
                  choreoTiming={choreoTiming}
                  geos={geos}
                  glowTex={glowTex}
                />
              );
            case "alpha_blood_convert":
              return (
                <AlphaBloodCrestVfx
                  key={fx.key}
                  actorSeat={fx.actorSeat}
                  targetSeat={fx.targetSeat}
                  choreoTiming={choreoTiming}
                  geos={geos}
                  glowTex={glowTex}
                  universeId={universeId}
                />
              );
            case "mayor_decree_slam":
              return (
                <MayorGoldenDecreeVfx
                  key={fx.key}
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
