import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import SmartPropGLB from "../props/SmartPropGLB.jsx";
import { SKY_CANDIDATES, SKY_ENABLED } from "../config/propManifest.js";
import {
  getOrCreateDarkFantasyEnvMap,
  getProceduralGroundAssets,
} from "../utils/proceduralGroundPBR.js";
import {
  EXTERIOR_ASSET_CATALOG,
  buildDefaultVillageNodes,
} from "../editor/defaultVillageLayout.js";

// Bảng màu Khí Quyển 4 Buổi chuẩn PBR Điện Ảnh (kết hợp Hemisphere + PMREM IBL + Moon Rim)
const ATMOSPHERE_PALETTES = {
  night: {
    bg: "#050a18",
    fog: "#081126",
    fogNear: 17,
    fogFar: 55,
    hemiSky: "#60a5fa",
    hemiGround: "#2b1c12",
    hemiIntensity: 0.56,
    dirColor: "#bae6fd",
    dirIntensity: 1.05,
    dirPos: [-10, 16, -11],
    rimColor: "#38bdf8",
    rimIntensity: 0.42,
    envIntensity: 0.52,
    groundTint: "#8fa89b",
    plazaTint: "#94a3b8",
    starOpacity: 0.92,
  },
  dawn: {
    bg: "#1f1932",
    fog: "#2b1f38",
    fogNear: 19,
    fogFar: 60,
    hemiSky: "#f9a8d4",
    hemiGround: "#3b2316",
    hemiIntensity: 0.72,
    dirColor: "#fdba74",
    dirIntensity: 1.38,
    dirPos: [12, 11, -9],
    rimColor: "#f472b6",
    rimIntensity: 0.35,
    envIntensity: 0.68,
    groundTint: "#b8b0a4",
    plazaTint: "#cbd5e1",
    starOpacity: 0.22,
  },
  day: {
    bg: "#1b3344",
    fog: "#1d352d",
    fogNear: 24,
    fogFar: 68,
    hemiSky: "#e0f2fe",
    hemiGround: "#3f2e1e",
    hemiIntensity: 0.92,
    dirColor: "#fff7ed",
    dirIntensity: 1.62,
    dirPos: [11, 17, 9],
    rimColor: "#93c5fd",
    rimIntensity: 0.28,
    envIntensity: 0.82,
    groundTint: "#cbd5c0",
    plazaTint: "#e2e8f0",
    starOpacity: 0.0,
  },
  dusk_trial: {
    bg: "#210d16",
    fog: "#2b111b",
    fogNear: 17,
    fogFar: 54,
    hemiSky: "#fda4af",
    hemiGround: "#2e1518",
    hemiIntensity: 0.62,
    dirColor: "#fb7185",
    dirIntensity: 1.32,
    dirPos: [-9, 12, -13],
    rimColor: "#f97316",
    rimIntensity: 0.48,
    envIntensity: 0.6,
    groundTint: "#b59ca4",
    plazaTint: "#cbd5e1",
    starOpacity: 0.36,
  },
};

function resolveMoodKey(isNight, phase, hasWinner) {
  if (isNight && !hasWinner) return "night";
  if (phase === "day_reveal") return "dawn";
  if (phase === "day_defense" || phase === "day_final_vote") return "dusk_trial";
  return "day";
}

function getOctantSectorIndex(x, z) {
  const theta = Math.atan2(x, z); // [-PI, PI]
  const norm = (theta + Math.PI) / (Math.PI * 2); // [0, 1]
  return Math.min(7, Math.max(0, Math.floor(norm * 8)));
}

const NOOP_RAYCAST = () => {};

/**
 * Đĩa Bóng Tiếp Xúc Mềm (Soft Radial Contact AO) đặt dưới chân mọi vật thể để bám chặt xuống mặt đá/đất.
 */
export function ContactShadowDisc({
  radius = 1.2,
  opacity = 0.58,
  position = [0, 0.009, 0],
  scaleXZ = [1, 1],
}) {
  const { contactAOMap } = useMemo(() => getProceduralGroundAssets(), []);
  return (
    <mesh
      name="__contact_ao_disc__"
      raycast={NOOP_RAYCAST}
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[scaleXZ[0], scaleXZ[1], 1]}
    >
      <circleGeometry args={[radius, 20]} />
      <meshBasicMaterial
        map={contactAOMap}
        transparent
        opacity={opacity}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  );
}

async function probeSkyTexture(candidates, reloadToken) {
  for (const baseUrl of candidates) {
    try {
      const url = reloadToken > 0 ? `${baseUrl}?v=${reloadToken}` : baseUrl;
      const res = await fetch(url, { method: "HEAD", cache: reloadToken > 0 ? "no-cache" : "default" });
      if (!res.ok) continue;
      const ctype = (res.headers.get("content-type") || "").toLowerCase();
      if (!ctype.startsWith("image/")) continue;

      const tex = await new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(url, resolve, undefined, reject);
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      return tex;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * 1. HỆ THỐNG BẦU TRỜI & CHIẾU SÁNG PBR ĐIỆN ẢNH SIÊU NHẸ (PMREM IBL + Hemisphere + Moon Rim + Fog)
 */
function AtmosphereAndSky3D({
  moodKey,
  isNightActive,
  reloadToken,
  architectMode,
  isLowPowerDevice = false,
}) {
  const { scene, gl } = useThree();
  const hemiRef = useRef(null);
  const dirLightRef = useRef(null);
  const rimLightRef = useRef(null);
  const starsMatRef = useRef(null);

  const [skyTextures, setSkyTextures] = useState({ night: null, day: null });

  const targetBgColor = useMemo(() => new THREE.Color(), []);
  const targetFogColor = useMemo(() => new THREE.Color(), []);
  const targetHemiSky = useMemo(() => new THREE.Color(), []);
  const targetHemiGround = useMemo(() => new THREE.Color(), []);
  const targetDirColor = useMemo(() => new THREE.Color(), []);
  const targetDirPos = useMemo(() => new THREE.Vector3(), []);
  const targetRimColor = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const envTex = getOrCreateDarkFantasyEnvMap(gl);
    if (envTex) {
      scene.environment = envTex;
      if ("environmentIntensity" in scene) {
        scene.environmentIntensity = 0.58;
      }
    }
  }, [gl, scene]);

  useEffect(() => {
    if (!SKY_ENABLED) return undefined;
    let mounted = true;
    Promise.all([
      probeSkyTexture(SKY_CANDIDATES.night, reloadToken),
      probeSkyTexture(SKY_CANDIDATES.day, reloadToken),
    ]).then(([nightTex, dayTex]) => {
      if (mounted) setSkyTextures({ night: nightTex, day: dayTex });
    });
    return () => {
      mounted = false;
    };
  }, [reloadToken]);

  const starPositions = useMemo(() => {
    const count = 280;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.44 + 0.04;
      const r = 49 + Math.random() * 4;
      arr[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      arr[i * 3 + 1] = Math.cos(phi) * r;
      arr[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    const pal = ATMOSPHERE_PALETTES[moodKey] || ATMOSPHERE_PALETTES.day;
    const speed = Math.min(1, delta * 2.8);

    // Khi bật D5 Architect Mode ở ban đêm, đẩy sương mù xa ra 95m & tăng nhẹ sáng môi trường để Kiến trúc sư thấy rõ cả khu rừng!
    const fogNearGoal = architectMode ? 38 : pal.fogNear;
    const fogFarGoal = architectMode ? 96 : pal.fogFar;
    const hemiGoal = architectMode ? Math.max(pal.hemiIntensity, 0.85) : pal.hemiIntensity;

    targetBgColor.set(pal.bg);
    targetFogColor.set(pal.fog);
    targetHemiSky.set(pal.hemiSky);
    targetHemiGround.set(pal.hemiGround);
    targetDirColor.set(pal.dirColor);
    targetDirPos.set(pal.dirPos[0], pal.dirPos[1], pal.dirPos[2]);
    targetRimColor.set(pal.rimColor);

    if (!scene.background || !(scene.background instanceof THREE.Color)) {
      scene.background = new THREE.Color(pal.bg);
    } else {
      scene.background.lerp(targetBgColor, speed);
    }

    if ("environmentIntensity" in scene) {
      scene.environmentIntensity = THREE.MathUtils.lerp(
        scene.environmentIntensity ?? 0.58,
        architectMode ? Math.max(pal.envIntensity, 0.78) : pal.envIntensity,
        speed
      );
    }

    if (scene.fog) {
      scene.fog.color.lerp(targetFogColor, speed);
      scene.fog.near = THREE.MathUtils.lerp(scene.fog.near, fogNearGoal, speed);
      scene.fog.far = THREE.MathUtils.lerp(scene.fog.far, fogFarGoal, speed);
    }

    if (hemiRef.current) {
      hemiRef.current.color.lerp(targetHemiSky, speed);
      hemiRef.current.groundColor.lerp(targetHemiGround, speed);
      hemiRef.current.intensity = THREE.MathUtils.lerp(hemiRef.current.intensity, hemiGoal, speed);
    }

    if (dirLightRef.current) {
      dirLightRef.current.color.lerp(targetDirColor, speed);
      dirLightRef.current.intensity = THREE.MathUtils.lerp(
        dirLightRef.current.intensity,
        pal.dirIntensity,
        speed
      );
      dirLightRef.current.position.lerp(targetDirPos, speed);
    }

    if (rimLightRef.current) {
      rimLightRef.current.color.lerp(targetRimColor, speed);
      rimLightRef.current.intensity = THREE.MathUtils.lerp(
        rimLightRef.current.intensity,
        pal.rimIntensity,
        speed
      );
    }

    if (starsMatRef.current) {
      starsMatRef.current.opacity = THREE.MathUtils.lerp(
        starsMatRef.current.opacity,
        pal.starOpacity,
        speed
      );
    }
  });

  const activePanorama = isNightActive ? skyTextures.night : skyTextures.day;

  return (
    <group>
      <fog attach="fog" args={["#081126", 17, 55]} />
      <hemisphereLight ref={hemiRef} args={["#60a5fa", "#2b1c12", 0.56]} />

      <directionalLight
        ref={dirLightRef}
        position={[-10, 16, -11]}
        intensity={1.05}
        color="#bae6fd"
        castShadow
        shadow-mapSize-width={isLowPowerDevice ? 512 : 1024}
        shadow-mapSize-height={isLowPowerDevice ? 512 : 1024}
        shadow-bias={-0.0004}
        shadow-camera-near={1}
        shadow-camera-far={46}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />

      <directionalLight ref={rimLightRef} position={[14, 11, 14]} intensity={0.42} color="#38bdf8" />

      {activePanorama && (
        <mesh raycast={NOOP_RAYCAST} scale={[-1, 1, 1]}>
          <sphereGeometry args={[64, 36, 24]} />
          <meshBasicMaterial map={activePanorama} side={THREE.BackSide} fog={false} />
        </mesh>
      )}

      <points raycast={NOOP_RAYCAST}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={starPositions.length / 3}
            array={starPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={starsMatRef}
          color="#e2e8f0"
          size={0.28}
          sizeAttenuation
          transparent
          opacity={0.85}
          fog={false}
        />
      </points>

      <group position={isNightActive ? [-14, 21, -29] : moodKey === "dusk_trial" ? [-12, 13, -30] : [16, 23, -27]}>
        <mesh raycast={NOOP_RAYCAST}>
          <sphereGeometry args={[isNightActive ? 2.3 : 2.0, 24, 24]} />
          <meshBasicMaterial
            color={isNightActive ? "#e0f2fe" : moodKey === "dusk_trial" ? "#fb7185" : "#fef08a"}
            fog={false}
          />
        </mesh>
        <mesh raycast={NOOP_RAYCAST}>
          <sphereGeometry args={[isNightActive ? 4.2 : 3.4, 20, 20]} />
          <meshBasicMaterial
            color={isNightActive ? "#60a5fa" : moodKey === "dusk_trial" ? "#f43f5e" : "#fde047"}
            transparent
            opacity={0.16}
            fog={false}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}

/**
 * 2. NỀN ĐẤT RÊU RỪNG PBR RỘNG 72m + LỐI LÁT ĐÁ TỰ ĐỘNG NỐI TỚI ĐÀI TREO CỔ
 */
function ForestBaseTerrainPBR({
  circleRadius,
  pal,
  gallowsPosition,
  architectMode,
  isGizmoDragging,
  lastGizmoDragEndMsRef,
  onClearSelection,
}) {
  const groundDownRef = useRef(null);
  const { cobbleColorMap, cobbleBumpMap, forestColorMap, forestBumpMap } = useMemo(
    () => getProceduralGroundAssets(),
    []
  );

  // Tự động xoay & co giãn đường lát đá nối từ rìa sân tròn tới vị trí hiện tại của Đài Treo Cổ!
  const pathTransform = useMemo(() => {
    if (!gallowsPosition) return null;
    const gx = Number(gallowsPosition[0] || 0);
    const gz = Number(gallowsPosition[2] || 0);
    const dist = Math.hypot(gx, gz);
    const plazaEdge = circleRadius + 1.3;
    if (dist <= plazaEdge + 0.6 || dist > 26) return null;

    const length = dist - plazaEdge + 0.5;
    const midDist = plazaEdge + length * 0.5 - 0.25;
    const ux = gx / dist;
    const uz = gz / dist;
    const yaw = Math.atan2(ux, uz);
    return {
      x: ux * midDist,
      z: uz * midDist,
      yaw,
      length,
    };
  }, [circleRadius, gallowsPosition?.[0], gallowsPosition?.[2]]);

  return (
    <group>
      {/* Nền đất Rừng Rêu & Lá Mục PBR Bump rộng 72m */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.022, 0]}
        receiveShadow
        onPointerDown={
          architectMode
            ? (e) => {
                if (e.button !== 0) return;
                groundDownRef.current = { x: e.clientX, y: e.clientY };
              }
            : undefined
        }
        onPointerUp={
          architectMode
            ? (e) => {
                if (e.button !== 0) return;
                const down = groundDownRef.current;
                groundDownRef.current = null;
                if (!down || isGizmoDragging) return;
                if (performance.now() - (lastGizmoDragEndMsRef?.current || 0) <= 260) return;
                if (Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 6) {
                  onClearSelection?.();
                }
              }
            : undefined
        }
      >
        <circleGeometry args={[72, 64]} />
        <meshStandardMaterial
          map={forestColorMap}
          bumpMap={forestBumpMap}
          bumpScale={0.14}
          color={pal.groundTint}
          roughness={0.95}
          metalness={0.03}
        />
      </mesh>

      {/* Lối lát đá cổ tự động bám theo vị trí Đài Treo Cổ */}
      {pathTransform && (
        <group position={[pathTransform.x, -0.002, pathTransform.z]} rotation={[0, pathTransform.yaw, 0]}>
          <mesh raycast={NOOP_RAYCAST} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[1.95, pathTransform.length]} />
            <meshStandardMaterial
              map={cobbleColorMap}
              bumpMap={cobbleBumpMap}
              bumpScale={0.045}
              color={pal.plazaTint}
              roughness={0.88}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

/**
 * 3. CÁC BỘ MESH CHI TIẾT CHO TỪNG LOẠI ĐẠO CỤ TRONG SCENE GRAPH
 */
function CourtyardPlazaContent({
  circleRadius,
  pal,
  plazaCalib,
  plazaLoaded,
  reloadToken,
  architectMode = false,
}) {
  const { cobbleColorMap, cobbleBumpMap } = useMemo(() => getProceduralGroundAssets(), []);
  const plazaRadius = circleRadius + 1.48;

  const borderStones = useMemo(() => {
    const count = 28;
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2;
      if (Math.abs(a - Math.PI) < 0.14) return null;
      const r = plazaRadius - 0.05 + (i % 2) * 0.06;
      return {
        id: i,
        x: Math.sin(a) * r,
        z: Math.cos(a) * r,
        yaw: a + (i % 3) * 0.2,
        sx: 0.42 + (i % 3) * 0.09,
        sy: 0.075 + (i % 2) * 0.025,
        sz: 0.28 + (i % 2) * 0.06,
      };
    }).filter(Boolean);
  }, [plazaRadius]);

  return (
    <group>
      <SmartPropGLB
        propKey="plaza_cobblestone"
        calib={plazaCalib}
        reloadToken={reloadToken}
        targetDiameterOverride={plazaRadius * 2}
        disableRaycast={architectMode}
        fallback={
          <group>
            <mesh
              raycast={architectMode ? NOOP_RAYCAST : undefined}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, -0.004, 0]}
              receiveShadow
            >
              <circleGeometry args={[plazaRadius, 56]} />
              <meshStandardMaterial
                map={cobbleColorMap}
                bumpMap={cobbleBumpMap}
                bumpScale={0.055}
                color={pal.plazaTint}
                roughness={0.86}
                metalness={0.06}
              />
            </mesh>
            <mesh
              raycast={architectMode ? NOOP_RAYCAST : undefined}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.002, 0]}
              receiveShadow
            >
              <ringGeometry args={[circleRadius - 0.36, circleRadius + 0.36, 56]} />
              <meshStandardMaterial color="#1e293b" roughness={0.9} transparent opacity={0.42} />
            </mesh>
          </group>
        }
      />

      {!plazaLoaded &&
        borderStones.map((st) => (
          <mesh
            key={st.id}
            raycast={architectMode ? NOOP_RAYCAST : undefined}
            position={[st.x, st.sy * 0.42, st.z]}
            rotation={[0, st.yaw, 0]}
            scale={[st.sx, st.sy, st.sz]}
            receiveShadow
            castShadow
          >
            <dodecahedronGeometry args={[0.55, 0]} />
            <meshStandardMaterial color="#3b4454" roughness={0.92} />
          </mesh>
        ))}
    </group>
  );
}

function ProceduralCampfirePit() {
  return (
    <group>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[0.58, 0.68, 0.06, 14]} />
        <meshStandardMaterial color="#29150e" emissive="#9a3412" emissiveIntensity={0.55} roughness={0.95} />
      </mesh>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const r = 0.66;
        return (
          <mesh
            key={i}
            position={[Math.sin(a) * r, 0.11, Math.cos(a) * r]}
            rotation={[0.08 * (i % 2), a, 0.06]}
            castShadow
            receiveShadow
          >
            <dodecahedronGeometry args={[0.16, 0]} />
            <meshStandardMaterial color={i % 2 === 0 ? "#475569" : "#334155"} roughness={0.92} />
          </mesh>
        );
      })}
    </group>
  );
}

function CampfireNodeContent({ isNightActive, calib, reloadToken }) {
  const flameOuterRef = useRef(null);
  const flameMidRef = useRef(null);
  const flameCoreRef = useRef(null);
  const fireLightRef = useRef(null);
  const embersMeshRef = useRef(null);

  const emberSeeds = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        angle: (i / 18) * Math.PI * 2 + Math.random() * 0.4,
        radius: 0.08 + Math.random() * 0.28,
        speed: 0.45 + Math.random() * 0.55,
        offset: Math.random(),
      })),
    []
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pulse = 1 + Math.sin(t * 7.8) * 0.09 + Math.cos(t * 13.5) * 0.04;

    if (flameOuterRef.current) {
      flameOuterRef.current.scale.set(pulse, 0.96 + Math.sin(t * 9.2) * 0.14, pulse);
      flameOuterRef.current.rotation.y = t * 0.9;
    }
    if (flameMidRef.current) {
      flameMidRef.current.scale.set(1.04 - (pulse - 1), 0.94 + Math.cos(t * 11.4) * 0.15, 1.04);
      flameMidRef.current.rotation.y = -t * 1.1;
    }
    if (flameCoreRef.current) {
      flameCoreRef.current.scale.set(1, 0.92 + Math.sin(t * 14) * 0.18, 1);
    }
    if (fireLightRef.current) {
      fireLightRef.current.intensity = (isNightActive ? 4.1 : 1.75) + Math.sin(t * 10.5) * 0.38;
    }

    if (embersMeshRef.current) {
      emberSeeds.forEach((eb, i) => {
        const life = (t * eb.speed + eb.offset) % 1;
        const y = 0.28 + life * 2.15;
        const swayR = eb.radius + Math.sin(t * 3 + i) * 0.08 + life * 0.16;
        const a = eb.angle + life * 1.8;
        const s = (1 - life) * 0.032 + 0.006;
        dummy.position.set(Math.cos(a) * swayR, y, Math.sin(a) * swayR);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        embersMeshRef.current.setMatrixAt(i, dummy.matrix);
      });
      embersMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  const fireScale = Number(calib?.scale ?? 1);
  const fireYOffset = Number(calib?.yOffset ?? 0);
  const fireZOffset = Number(calib?.zOffset ?? 0);

  return (
    <group>
      <ContactShadowDisc radius={1.25 * fireScale} opacity={0.68} position={[0, 0.006, fireZOffset]} />

      <mesh raycast={NOOP_RAYCAST} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, fireZOffset]}>
        <ringGeometry args={[0.92 * fireScale, 1.08 * fireScale, 36]} />
        <meshBasicMaterial color="#ea580c" transparent opacity={isNightActive ? 0.38 : 0.14} />
      </mesh>

      <SmartPropGLB
        propKey="prop_campfire"
        calib={calib}
        reloadToken={reloadToken}
        fallback={<ProceduralCampfirePit />}
      />

      <group position={[0, fireYOffset, fireZOffset]} scale={fireScale}>
        <mesh raycast={NOOP_RAYCAST} ref={flameOuterRef} position={[0, 0.48, 0]}>
          <coneGeometry args={[0.32, 0.68, 7]} />
          <meshBasicMaterial color="#ea580c" transparent opacity={0.82} depthWrite={false} />
        </mesh>
        <mesh raycast={NOOP_RAYCAST} ref={flameMidRef} position={[0, 0.42, 0]}>
          <coneGeometry args={[0.22, 0.5, 6]} />
          <meshBasicMaterial color="#fb923c" transparent opacity={0.88} depthWrite={false} />
        </mesh>
        <mesh raycast={NOOP_RAYCAST} ref={flameCoreRef} position={[0, 0.35, 0]}>
          <coneGeometry args={[0.12, 0.34, 6]} />
          <meshBasicMaterial color="#fef08a" depthWrite={false} />
        </mesh>

        <instancedMesh raycast={NOOP_RAYCAST} ref={embersMeshRef} args={[null, null, emberSeeds.length]}>
          <octahedronGeometry args={[1, 0]} />
          <meshBasicMaterial color="#fde047" />
        </instancedMesh>

        <pointLight
          ref={fireLightRef}
          position={[0, 0.98, 0]}
          color="#fb923c"
          intensity={isNightActive ? 4.1 : 1.75}
          distance={17}
          decay={1.5}
          castShadow
        />
      </group>
    </group>
  );
}

function ProceduralGallows() {
  return (
    <group>
      <mesh position={[0, 0.29, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.5, 0.58, 1.9]} />
        <meshStandardMaterial color="#422817" roughness={0.9} />
      </mesh>
      <mesh position={[-0.78, 2.35, -0.25]} castShadow>
        <boxGeometry args={[0.24, 3.55, 0.24]} />
        <meshStandardMaterial color="#3a2213" roughness={0.9} />
      </mesh>
      <mesh position={[-0.08, 4.05, -0.25]} castShadow>
        <boxGeometry args={[1.68, 0.22, 0.24]} />
        <meshStandardMaterial color="#3a2213" roughness={0.9} />
      </mesh>
    </group>
  );
}

function GallowsNodeContent({ phase, calib, gallowsLoaded, reloadToken }) {
  const ropeGroupRef = useRef(null);
  const isTrialPhase = phase === "day_defense" || phase === "day_final_vote";
  const showAuxRope = gallowsLoaded ? Boolean(calib?.showAuxRope) : true;

  useFrame((state) => {
    if (ropeGroupRef.current) {
      const t = state.clock.elapsedTime;
      ropeGroupRef.current.rotation.z = Math.sin(t * 1.45) * (isTrialPhase ? 0.085 : 0.035);
      ropeGroupRef.current.rotation.x = Math.cos(t * 1.1) * 0.025;
    }
  });

  return (
    <group>
      <ContactShadowDisc radius={2.2} scaleXZ={[1.15, 0.9]} opacity={0.68} />
      <SmartPropGLB
        propKey="prop_gallows"
        calib={calib}
        reloadToken={reloadToken}
        fallback={<ProceduralGallows />}
      />
      {showAuxRope && (
        <group ref={ropeGroupRef} position={[0.28, 3.95, -0.22]}>
          <mesh position={[0, -0.52, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 1.04, 8]} />
            <meshStandardMaterial color="#b48a56" roughness={0.92} />
          </mesh>
          <mesh position={[0, -1.16, 0]}>
            <torusGeometry args={[0.15, 0.026, 8, 18]} />
            <meshStandardMaterial color="#c29963" roughness={0.9} />
          </mesh>
        </group>
      )}
      <pointLight
        position={[0, 4.7, 1.2]}
        color={isTrialPhase ? "#fb7185" : "#f59e0b"}
        intensity={isTrialPhase ? 4.8 : 1.2}
        distance={11}
        decay={1.6}
      />
    </group>
  );
}

function StylizedOrganicPineFallback({ variant = "tall", seed = 0 }) {
  const isWide = variant === "wide";
  const leafColor1 = isWide ? "#122b1d" : "#0e2318";
  const leafColor2 = isWide ? "#183826" : "#153022";
  const leafColor3 = isWide ? "#1f422d" : "#1b3a29";

  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.42, 0.9, 7]} />
        <meshStandardMaterial color="#2d1b10" roughness={0.95} />
      </mesh>
      <mesh position={[0.05, 1.85, 0]} rotation={[0.03, seed, -0.03]} castShadow>
        <cylinderGeometry args={[0.14, 0.24, 2.4, 7]} />
        <meshStandardMaterial color="#382214" roughness={0.94} />
      </mesh>
      <mesh position={[-0.08, 2.7, 0.06]} rotation={[0.05, seed * 1.3, -0.04]} castShadow>
        <coneGeometry args={[isWide ? 2.15 : 1.68, 2.1, 6]} />
        <meshStandardMaterial color={leafColor1} roughness={0.92} flatShading />
      </mesh>
      <mesh position={[0.1, 4.0, -0.05]} rotation={[-0.04, seed * 2.1 + 0.6, 0.05]} castShadow>
        <coneGeometry args={[isWide ? 1.85 : 1.42, 2.15, 6]} />
        <meshStandardMaterial color={leafColor2} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-0.06, 5.25, 0.04]} rotation={[0.04, seed * 0.7 + 1.2, -0.03]} castShadow>
        <coneGeometry args={[isWide ? 1.42 : 1.12, 2.0, 5]} />
        <meshStandardMaterial color={leafColor3} roughness={0.88} flatShading />
      </mesh>
      {!isWide && (
        <mesh position={[0.04, 6.45, -0.03]} rotation={[0.03, seed + 2.0, 0.06]}>
          <coneGeometry args={[0.76, 1.75, 5]} />
          <meshStandardMaterial color={leafColor2} roughness={0.88} flatShading />
        </mesh>
      )}
    </group>
  );
}

function StylizedGnarledDeadTreeFallback({ seed = 0 }) {
  return (
    <group rotation={[0, seed, 0]}>
      <mesh position={[0, 0.55, 0]} rotation={[0.06, 0, -0.05]} castShadow>
        <cylinderGeometry args={[0.24, 0.46, 1.1, 6]} />
        <meshStandardMaterial color="#2a211b" roughness={0.96} flatShading />
      </mesh>
      <mesh position={[-0.08, 1.85, 0.05]} rotation={[0.08, 0.4, 0.12]} castShadow>
        <cylinderGeometry args={[0.15, 0.26, 1.8, 6]} />
        <meshStandardMaterial color="#332820" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[-0.55, 3.1, 0.15]} rotation={[0.22, 0.3, 0.58]} castShadow>
        <cylinderGeometry args={[0.05, 0.14, 1.65, 5]} />
        <meshStandardMaterial color="#382c24" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0.48, 3.35, -0.18]} rotation={[-0.25, -0.4, -0.52]} castShadow>
        <cylinderGeometry args={[0.045, 0.13, 1.8, 5]} />
        <meshStandardMaterial color="#382c24" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0.05, 3.85, 0.28]} rotation={[0.42, 0.2, -0.15]} castShadow>
        <cylinderGeometry args={[0.04, 0.1, 1.45, 5]} />
        <meshStandardMaterial color="#2e241d" roughness={0.95} flatShading />
      </mesh>
    </group>
  );
}

function StylizedIronLanternFallback({ windowGlow }) {
  return (
    <group>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.22, 0.44, 6]} />
        <meshStandardMaterial color="#334155" roughness={0.92} flatShading />
      </mesh>
      <mesh position={[0, 1.48, 0]} castShadow>
        <cylinderGeometry args={[0.042, 0.068, 2.2, 8]} />
        <meshStandardMaterial color="#18181b" metalness={0.68} roughness={0.42} />
      </mesh>
      <mesh position={[0, 2.58, 0.24]} rotation={[0.12, 0, 0]}>
        <boxGeometry args={[0.045, 0.045, 0.54]} />
        <meshStandardMaterial color="#18181b" metalness={0.68} roughness={0.42} />
      </mesh>
      <mesh position={[0, 2.38, 0.14]} rotation={[Math.PI / 4, 0, 0]}>
        <boxGeometry args={[0.032, 0.032, 0.36]} />
        <meshStandardMaterial color="#27272a" metalness={0.65} roughness={0.45} />
      </mesh>
      <mesh position={[0, 2.48, 0.46]}>
        <coneGeometry args={[0.16, 0.12, 6]} />
        <meshStandardMaterial color="#18181b" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 2.32, 0.46]}>
        <cylinderGeometry args={[0.12, 0.09, 0.24, 6]} />
        <meshStandardMaterial
          color={windowGlow ? "#fde047" : "#94a3b8"}
          emissive={windowGlow ? "#f59e0b" : "#000000"}
          emissiveIntensity={windowGlow ? 2.4 : 0}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

function StylizedFenceRockFallback() {
  return (
    <group>
      <mesh position={[-1.18, 0.28, 0.12]} rotation={[0.2, 0.5, 0.1]} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial color="#3b4754" roughness={0.94} flatShading />
      </mesh>
      <mesh position={[-0.86, 0.18, 0.24]} rotation={[0.4, 1.1, 0.2]} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.26, 0]} />
        <meshStandardMaterial color="#2d3b32" roughness={0.95} flatShading />
      </mesh>
      {[-0.95, 0, 0.98].map((px, i) => (
        <mesh
          key={i}
          position={[px, 0.48, 0]}
          rotation={[0.03 * (i - 1), i * 0.4, (i % 2 === 0 ? 1 : -1) * 0.04]}
          castShadow
        >
          <cylinderGeometry args={[0.055, 0.07, 0.98, 6]} />
          <meshStandardMaterial color="#422815" roughness={0.92} />
        </mesh>
      ))}
      {[0.32, 0.72].map((py, i) => (
        <mesh key={i} position={[0.02, py, 0]} rotation={[0, 0, i === 0 ? 0.02 : -0.025]} castShadow>
          <boxGeometry args={[2.25, 0.085, 0.055]} />
          <meshStandardMaterial color="#54341d" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function ProceduralBoulderContent() {
  // Đặt đáy tại y = 0 để khi Scale trục Y trong D5 Studio, tảng đá mọc từ mặt đất lên!
  return (
    <group>
      <ContactShadowDisc radius={0.76} scaleXZ={[1.1, 0.95]} opacity={0.52} />
      <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.68, 0]} />
        <meshStandardMaterial color="#36414d" roughness={0.94} flatShading />
      </mesh>
    </group>
  );
}

/**
 * Render bất kỳ Thực Thể Ngoại Cảnh nào theo đúng gốc tọa độ chân đế (y=0)
 * và kết nối thẳng vào nodeGroupRefs cho Gizmo 3 trục D5!
 */
function EditableExteriorNode({
  node,
  circleRadius,
  pal,
  phase,
  isNightActive,
  windowGlow,
  propCalib,
  propStatuses,
  reloadToken,
  architectMode,
  isGizmoDragging,
  lastGizmoDragEndMsRef,
  registerNodeRef,
  onSelectNode,
}) {
  const pointerDownRef = useRef(null);
  const meta = EXTERIOR_ASSET_CATALOG[node.type];
  if (!meta) return null;

  const canClickIn3D = Boolean(architectMode && meta.clickableIn3D !== false);

  return (
    <group
      ref={(el) => registerNodeRef?.(node.id, el)}
      position={node.position}
      rotation={node.rotation}
      scale={node.scale}
      onPointerDown={
        canClickIn3D
          ? (e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              pointerDownRef.current = { x: e.clientX, y: e.clientY };
            }
          : undefined
      }
      onPointerUp={
        canClickIn3D
          ? (e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              const down = pointerDownRef.current;
              pointerDownRef.current = null;
              if (!down || isGizmoDragging) return;
              if (performance.now() - (lastGizmoDragEndMsRef?.current || 0) <= 240) return;
              if (Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 9) {
                onSelectNode?.(node.id);
              }
            }
          : undefined
      }
      onPointerOver={
        canClickIn3D
          ? (e) => {
              e.stopPropagation();
              document.body.style.cursor = "pointer";
            }
          : undefined
      }
      onPointerOut={
        canClickIn3D
          ? () => {
              document.body.style.cursor = "auto";
            }
          : undefined
      }
    >
      {/* Khối Hitbox Bao Chiều Cao Vô Hình giúp Click trúng 100% xuyên qua kẽ cành thông / thanh hàng rào thưa */}
      {canClickIn3D && Array.isArray(meta.hitBoxSize) && (
        <mesh name="__d5_hitbox__" position={[0, meta.hitBoxSize[1] * 0.5, 0]}>
          <boxGeometry args={meta.hitBoxSize} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {canClickIn3D && !Array.isArray(meta.hitBoxSize) && meta.hitRadius && meta.hitHeight && (
        <mesh name="__d5_hitbox__" position={[0, meta.hitHeight * 0.5, 0]}>
          <cylinderGeometry args={[meta.hitRadius * 0.85, meta.hitRadius, meta.hitHeight, 10]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {node.type === "plaza_cobblestone" && (
        <CourtyardPlazaContent
          circleRadius={circleRadius}
          pal={pal}
          plazaCalib={propCalib?.plaza_cobblestone}
          plazaLoaded={propStatuses?.plaza_cobblestone === "loaded"}
          reloadToken={reloadToken}
          architectMode={architectMode}
        />
      )}

      {node.type === "prop_campfire" && (
        <CampfireNodeContent
          isNightActive={isNightActive}
          calib={propCalib?.prop_campfire}
          reloadToken={reloadToken}
        />
      )}

      {node.type === "prop_gallows" && (
        <GallowsNodeContent
          phase={phase}
          calib={propCalib?.prop_gallows}
          gallowsLoaded={propStatuses?.prop_gallows === "loaded"}
          reloadToken={reloadToken}
        />
      )}

      {node.type === "landmark_belltower" && (
        <group>
          <ContactShadowDisc radius={2.6} opacity={0.72} />
          <SmartPropGLB
            propKey="landmark_belltower"
            calib={propCalib?.landmark_belltower}
            reloadToken={reloadToken}
          />
          {windowGlow && (
            <pointLight
              position={[0, 5.6, 2.3]}
              color="#fbbf24"
              intensity={2.7}
              distance={17}
              decay={1.5}
            />
          )}
        </group>
      )}

      {(node.type === "house_cottage_a" || node.type === "house_cottage_b") && (
        <group>
          <ContactShadowDisc radius={3.1} scaleXZ={[1.1, 0.95]} opacity={0.7} />
          <SmartPropGLB
            propKey={node.type}
            calib={propCalib?.[node.type]}
            reloadToken={reloadToken}
          />
          {windowGlow && (
            <mesh raycast={NOOP_RAYCAST} position={[0, 0.02, 2.15]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[1.45, 16]} />
              <meshBasicMaterial color="#f59e0b" transparent opacity={0.2} depthWrite={false} />
            </mesh>
          )}
        </group>
      )}

      {node.type === "prop_lantern" && (
        <group>
          <ContactShadowDisc radius={0.55} opacity={0.55} />
          <SmartPropGLB
            propKey="prop_lantern"
            calib={propCalib?.prop_lantern}
            reloadToken={reloadToken}
            fallback={<StylizedIronLanternFallback windowGlow={windowGlow} />}
          />
        </group>
      )}

      {node.type === "prop_fence_rock" && (
        <group>
          <ContactShadowDisc radius={1.35} scaleXZ={[1.15, 0.5]} opacity={0.52} />
          <SmartPropGLB
            propKey="prop_fence_rock"
            calib={propCalib?.prop_fence_rock}
            reloadToken={reloadToken}
            fallback={<StylizedFenceRockFallback />}
          />
        </group>
      )}

      {node.type === "procedural_rock" && <ProceduralBoulderContent />}

      {(node.type === "tree_pine_tall" ||
        node.type === "tree_pine_wide" ||
        node.type === "tree_dead_gnarled") && (
        <group>
          <ContactShadowDisc radius={meta.aoRadius || 1.45} opacity={0.62} />
          <SmartPropGLB
            propKey={node.type}
            calib={propCalib?.[node.type]}
            reloadToken={reloadToken}
            fallback={
              node.type === "tree_dead_gnarled" ? (
                <StylizedGnarledDeadTreeFallback seed={node.seed || 0} />
              ) : (
                <StylizedOrganicPineFallback
                  variant={node.type === "tree_pine_wide" ? "wide" : "tall"}
                  seed={node.seed || 0}
                />
              )
            }
          />
        </group>
      )}
    </group>
  );
}

/**
 * 4. VÒNG NẾN LINH HỒN TRƯỚC MỖI GHẾ (KHÓA CỨNG KHÔNG CHO EDIT ĐỂ BẢO VỆ LOGIC NGƯỜI CHƠI)
 */
function SoulCandlesRing({ orderedPlayers, seatMap }) {
  return (
    <group>
      {orderedPlayers.map((p) => {
        const seat = seatMap[p.id];
        if (!seat) return null;
        const candleR = Math.max(1.8, seat.radius - 0.62);
        const cx = Math.sin(seat.angle) * candleR;
        const cz = Math.cos(seat.angle) * candleR;
        const alive = Boolean(p.alive);

        return (
          <group key={`candle-${p.id}`} position={[cx, 0, cz]}>
            <ContactShadowDisc radius={0.22} opacity={0.48} position={[0, 0.006, 0]} />
            <mesh raycast={NOOP_RAYCAST} position={[0, 0.03, 0]} receiveShadow>
              <cylinderGeometry args={[0.09, 0.12, 0.06, 8]} />
              <meshStandardMaterial color="#334155" roughness={0.9} />
            </mesh>
            <mesh raycast={NOOP_RAYCAST} position={[0, 0.11, 0]} castShadow>
              <cylinderGeometry args={[0.038, 0.042, 0.12, 8]} />
              <meshStandardMaterial color={alive ? "#fef3c7" : "#64748b"} roughness={0.75} />
            </mesh>
            {alive ? (
              <mesh raycast={NOOP_RAYCAST} position={[0, 0.2, 0]}>
                <coneGeometry args={[0.028, 0.075, 6]} />
                <meshBasicMaterial color="#fbbf24" />
              </mesh>
            ) : (
              <mesh raycast={NOOP_RAYCAST} position={[0, 0.24, 0]}>
                <coneGeometry args={[0.035, 0.16, 6]} />
                <meshBasicMaterial color="#38bdf8" transparent opacity={0.42} depthWrite={false} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

/**
 * 5. ENGINE 8 PHÂN KHU GÓC CAMERA ĐỘNG ("XOAY ĐÂU HIỆN ĐẾN ĐÓ" — TỰ ĐỒNG BỘ KHI DI CHUYỂN TRONG D5 STUDIO!)
 */
function DynamicOctantCulledSceneGraph({
  circleRadius,
  pal,
  phase,
  isNightActive,
  moodKey,
  propCalib,
  propStatuses,
  reloadToken,
  layoutNodes,
  frustumCullingEnabled = true,
  architectMode = false,
  isLowPowerDevice = false,
  isGizmoDragging = false,
  lastGizmoDragEndMsRef,
  registerNodeRef,
  onSelectNode,
  onVisibleSectorsChange,
}) {
  const sectorRefs = useRef([]);
  const lastReportedCountRef = useRef(8);
  const frameTickRef = useRef(0);

  const frustum = useMemo(() => new THREE.Frustum(), []);
  const projScreenMatrix = useMemo(() => new THREE.Matrix4(), []);
  const windowGlow = isNightActive || moodKey === "dusk_trial" || moodKey === "dawn";

  // Tự động phân loại Thực thể trung tâm (luôn vẽ) vs Thực thể 8 Múi góc ngoại vi + Tính lại Cầu Bao Frustum động!
  const { centerNodes, sectorBuckets, sectorSpheres } = useMemo(() => {
    const center = [];
    const buckets = Array.from({ length: 8 }, () => []);

    (layoutNodes || []).forEach((node) => {
      if (node.type === "plaza_cobblestone" || node.type === "prop_campfire") {
        center.push(node);
      } else {
        const sIdx = getOctantSectorIndex(node.position[0] || 0, node.position[2] || 0);
        buckets[sIdx].push(node);
      }
    });

    const spheres = buckets.map((bucket, s) => {
      const midAngle = -Math.PI + (s + 0.5) * (Math.PI / 4);
      if (bucket.length === 0) {
        const fallbackR = circleRadius + 16.5;
        return new THREE.Sphere(
          new THREE.Vector3(Math.sin(midAngle) * fallbackR, 3.8, Math.cos(midAngle) * fallbackR),
          18.2
        );
      }

      // Tính tâm & bán kính cầu bao thực tế bao trùm toàn bộ công trình/cây bạn đã kéo vào phân khu này!
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      let maxScale = 1;
      bucket.forEach((n) => {
        const x = n.position[0] || 0;
        const z = n.position[2] || 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
        const sm = Math.max(n.scale?.[0] || 1, n.scale?.[1] || 1, n.scale?.[2] || 1);
        if (sm > maxScale) maxScale = sm;
      });

      const cx = (minX + maxX) * 0.5;
      const cz = (minZ + maxZ) * 0.5;
      let maxDist = 0;
      bucket.forEach((n) => {
        const d = Math.hypot((n.position[0] || 0) - cx, (n.position[2] || 0) - cz);
        if (d > maxDist) maxDist = d;
      });

      const guardPadding = 7.5 + maxScale * 3.5;
      return new THREE.Sphere(new THREE.Vector3(cx, 4.2, cz), Math.max(15.5, maxDist + guardPadding));
    });

    return { centerNodes: center, sectorBuckets: buckets, sectorSpheres: spheres };
  }, [layoutNodes, circleRadius]);

  // Trong lúc Kiến trúc sư bật D5 Mode, hiển thị đủ 8/8 khu để click chọn tự do mọi góc; khi tắt D5 hoặc ở phía Người chơi -> Cắt Frustum 0ms!
  const effectiveCulling = frustumCullingEnabled && !architectMode;

  useFrame(({ camera }) => {
    let visibleCount = 0;

    if (!effectiveCulling) {
      for (let s = 0; s < 8; s++) {
        if (sectorRefs.current[s]) sectorRefs.current[s].visible = true;
      }
      visibleCount = 8;
    } else {
      projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreenMatrix);

      for (let s = 0; s < 8; s++) {
        const grp = sectorRefs.current[s];
        if (!grp) continue;
        const inView = frustum.intersectsSphere(sectorSpheres[s]);
        grp.visible = inView;
        if (inView) visibleCount += 1;
      }
    }

    frameTickRef.current += 1;
    if (frameTickRef.current % 12 === 0 && visibleCount !== lastReportedCountRef.current) {
      lastReportedCountRef.current = visibleCount;
      onVisibleSectorsChange?.(visibleCount);
    }
  });

  return (
    <group>
      {/* 3 Nguồn sáng vàng ấm tầm rộng 18m phủ đều vành đai nhà cổ (tự ẩn trên điện thoại yếu để ưu tiên 60 FPS) */}
      {windowGlow &&
        !isLowPowerDevice &&
        [-115, 0, 115].map((deg, idx) => {
          const rad = THREE.MathUtils.degToRad(deg);
          const lightDist = circleRadius + 8.4;
          return (
            <pointLight
              key={`village-warm-light-${idx}`}
              position={[Math.sin(rad) * lightDist, 3.1, Math.cos(rad) * lightDist]}
              color="#f59e0b"
              intensity={2.45}
              distance={18.5}
              decay={1.5}
            />
          );
        })}

      {/* Cụm Tâm Sân (Đĩa Sân Đá & Bếp Lửa Trại luôn hiển thị giữ bóng đổ trung tâm) */}
      {centerNodes.map((node) => (
        <EditableExteriorNode
          key={node.id}
          node={node}
          circleRadius={circleRadius}
          pal={pal}
          phase={phase}
          isNightActive={isNightActive}
          windowGlow={windowGlow}
          propCalib={propCalib}
          propStatuses={propStatuses}
          reloadToken={reloadToken}
          architectMode={architectMode}
          isGizmoDragging={isGizmoDragging}
          lastGizmoDragEndMsRef={lastGizmoDragEndMsRef}
          registerNodeRef={registerNodeRef}
          onSelectNode={onSelectNode}
        />
      ))}

      {/* 8 Phân Khu Góc Ngoại Vi (Nhà cổ, Tháp chuông, Đài treo cổ, Đèn, Rào, Đá, Rừng cây) */}
      {sectorBuckets.map((bucket, sIdx) => (
        <group
          key={`octant-sector-${sIdx}`}
          ref={(el) => {
            sectorRefs.current[sIdx] = el;
          }}
        >
          {bucket.map((node) => (
            <EditableExteriorNode
              key={node.id}
              node={node}
              circleRadius={circleRadius}
              pal={pal}
              phase={phase}
              isNightActive={isNightActive}
              windowGlow={windowGlow}
              propCalib={propCalib}
              propStatuses={propStatuses}
              reloadToken={reloadToken}
              architectMode={architectMode}
              isGizmoDragging={isGizmoDragging}
              lastGizmoDragEndMsRef={lastGizmoDragEndMsRef}
              registerNodeRef={registerNodeRef}
              onSelectNode={onSelectNode}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

/**
 * 6. HẠT ĐOM ĐÓM ĐÊM BAY QUANH SÂN LÀNG
 */
function NightFirefliesSwarm({ circleRadius, isNightActive }) {
  const firefliesRef = useRef(null);
  const flyDummy = useMemo(() => new THREE.Object3D(), []);

  const fireflySeeds = useMemo(() => {
    return Array.from({ length: 34 }, (_, i) => ({
      angle: (i / 34) * Math.PI * 2,
      radius: circleRadius + 1.8 + (i % 6) * 1.45,
      yBase: 0.65 + (i % 5) * 0.42,
      speed: 0.35 + (i % 4) * 0.14,
      phase: i * 0.77,
    }));
  }, [circleRadius]);

  useFrame((state) => {
    if (!firefliesRef.current) return;
    const t = state.clock.elapsedTime;
    fireflySeeds.forEach((f, i) => {
      if (!isNightActive) {
        flyDummy.position.set(0, -10, 0);
        flyDummy.scale.setScalar(0.001);
      } else {
        const a = f.angle + Math.sin(t * f.speed + f.phase) * 0.22;
        const r = f.radius + Math.cos(t * 0.7 + f.phase) * 0.55;
        const y = f.yBase + Math.sin(t * 1.6 + f.phase) * 0.32;
        const pulse = 0.024 + (0.5 + 0.5 * Math.sin(t * 3.8 + f.phase)) * 0.026;
        flyDummy.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
        flyDummy.scale.setScalar(pulse);
      }
      flyDummy.updateMatrix();
      firefliesRef.current.setMatrixAt(i, flyDummy.matrix);
    });
    firefliesRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh raycast={NOOP_RAYCAST} ref={firefliesRef} args={[null, null, fireflySeeds.length]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#bef264" />
    </instancedMesh>
  );
}

/**
 * TỔNG HỢP KHÔNG GIAN LÀNG MA SÓI 3D (CHUẨN D5 SCENE GRAPH + PBR TERRAIN + 8-SECTOR FRUSTUM CULLING)
 */
export default function VillageEnvironment3D({
  circleRadius = 4.2,
  orderedPlayers = [],
  seatMap = {},
  phase = "day_discuss",
  isNight = false,
  hasWinner = false,
  propCalib = {},
  propStatuses = {},
  reloadToken = 0,
  layoutNodes = null,
  frustumCullingEnabled = true,
  architectMode = false,
  isLowPowerDevice = false,
  isGizmoDragging = false,
  lastGizmoDragEndMsRef = null,
  registerNodeRef,
  onSelectNode,
  onClearSelection,
  onVisibleSectorsChange,
}) {
  const isNightActive = Boolean(isNight && !hasWinner);
  const moodKey = resolveMoodKey(isNight, phase, hasWinner);
  const pal = ATMOSPHERE_PALETTES[moodKey] || ATMOSPHERE_PALETTES.day;

  const fallbackDefaultNodes = useMemo(() => buildDefaultVillageNodes(), []);
  const activeNodes = layoutNodes && layoutNodes.length > 0 ? layoutNodes : fallbackDefaultNodes;

  const primaryGallows = useMemo(
    () => activeNodes.find((n) => n.type === "prop_gallows") || null,
    [activeNodes]
  );

  return (
    <group>
      {/* 1. Bầu trời, PMREM IBL, HemisphereLight & Moon Rim Light */}
      <AtmosphereAndSky3D
        moodKey={moodKey}
        isNightActive={isNightActive}
        reloadToken={reloadToken}
        architectMode={architectMode}
        isLowPowerDevice={isLowPowerDevice}
      />

      {/* 2. Mặt đất Rêu Rừng PBR 72m + Lối đá tự nối tới Đài Treo Cổ */}
      <ForestBaseTerrainPBR
        circleRadius={circleRadius}
        pal={pal}
        gallowsPosition={primaryGallows?.position}
        architectMode={architectMode}
        isGizmoDragging={isGizmoDragging}
        lastGizmoDragEndMsRef={lastGizmoDragEndMsRef}
        onClearSelection={onClearSelection}
      />

      {/* 3. Vòng Nến Linh Hồn Sinh Tử (Thuộc vùng người chơi, khóa cứng an toàn) */}
      <SoulCandlesRing orderedPlayers={orderedPlayers} seatMap={seatMap} />

      {/* 4. Toàn bộ Scene Graph Ngoại Cảnh (Tự động chia 8 Múi Camera & gắn Gizmo 3 trục D5) */}
      <DynamicOctantCulledSceneGraph
        circleRadius={circleRadius}
        pal={pal}
        phase={phase}
        isNightActive={isNightActive}
        moodKey={moodKey}
        propCalib={propCalib}
        propStatuses={propStatuses}
        reloadToken={reloadToken}
        layoutNodes={activeNodes}
        frustumCullingEnabled={frustumCullingEnabled}
        architectMode={architectMode}
        isLowPowerDevice={isLowPowerDevice}
        isGizmoDragging={isGizmoDragging}
        lastGizmoDragEndMsRef={lastGizmoDragEndMsRef}
        registerNodeRef={registerNodeRef}
        onSelectNode={onSelectNode}
        onVisibleSectorsChange={onVisibleSectorsChange}
      />

      {/* 5. Đom Đóm Đêm */}
      <NightFirefliesSwarm circleRadius={circleRadius} isNightActive={isNightActive} />
    </group>
  );
}
