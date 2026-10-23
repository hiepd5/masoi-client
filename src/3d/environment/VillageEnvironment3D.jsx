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
import {
  CINEMATIC_SHARED_UNIFORMS,
  createMoonlitSkyDomeMaterial,
  createVolumetricFireMaterial,
  getDriftingMistTexture,
  getSoftGlowHaloTexture,
} from "../shaders/villageCinematicShaders.js";

// Bảng màu Khí Quyển 4 Buổi chuẩn Concept Bắc Âu Điện Ảnh (Dù Ban Ngày vẫn giữ chất Chạng Vạng Sương Rừng ấm-lạnh mướt mắt!)
const ATMOSPHERE_PALETTES = {
  night: {
    bg: "#040915",
    skyZenith: "#030712",
    skyMid: "#0a1930",
    skyHorizon: "#162d4c",
    cloudTint: "#5b83b3",
    fog: "#0c1b31",
    fogNear: 12.5,
    fogFar: 46,
    hemiSky: "#60a5fa",
    hemiGround: "#2e1c10",
    hemiIntensity: 0.54,
    dirColor: "#bae6fd",
    dirIntensity: 1.08,
    dirPos: [-7, 17, -18],
    rimColor: "#38bdf8",
    rimIntensity: 0.48,
    envIntensity: 0.62,
    groundTint: "#6e8580",
    plazaTint: "#94a3b8",
    starOpacity: 0.92,
    mistOpacity: 0.34,
    warmGlow: 1.55,
  },
  dawn: {
    bg: "#120f24",
    skyZenith: "#0b0a1a",
    skyMid: "#221a3a",
    skyHorizon: "#442c4a",
    cloudTint: "#b084ab",
    fog: "#251c36",
    fogNear: 14.5,
    fogFar: 52,
    hemiSky: "#f9a8d4",
    hemiGround: "#3b2316",
    hemiIntensity: 0.66,
    dirColor: "#fdba74",
    dirIntensity: 1.24,
    dirPos: [10, 13, -15],
    rimColor: "#f472b6",
    rimIntensity: 0.4,
    envIntensity: 0.72,
    groundTint: "#8f8a88",
    plazaTint: "#b8c4d4",
    starOpacity: 0.34,
    mistOpacity: 0.28,
    warmGlow: 1.28,
  },
  day: {
    // Chạng Vạng Sương Rừng Bắc Âu (Xóa nền phẳng #1b3344 xám xịt; giữ ánh trăng mây bạc + đèn cửa sổ ấm nhẹ đúng Concept!)
    bg: "#0b1728",
    skyZenith: "#081221",
    skyMid: "#142842",
    skyHorizon: "#25415e",
    cloudTint: "#7fa3c7",
    fog: "#16293f",
    fogNear: 15.5,
    fogFar: 54,
    hemiSky: "#bfdbfe",
    hemiGround: "#3c2918",
    hemiIntensity: 0.74,
    dirColor: "#e0f2fe",
    dirIntensity: 1.28,
    dirPos: [-6, 18, -16],
    rimColor: "#93c5fd",
    rimIntensity: 0.38,
    envIntensity: 0.78,
    groundTint: "#859990",
    plazaTint: "#aebdcb",
    starOpacity: 0.38,
    mistOpacity: 0.26,
    warmGlow: 1.18,
  },
  dusk_trial: {
    bg: "#170811",
    skyZenith: "#0e040a",
    skyMid: "#290e1c",
    skyHorizon: "#4c1b29",
    cloudTint: "#bd6b7d",
    fog: "#29101b",
    fogNear: 13,
    fogFar: 47,
    hemiSky: "#fda4af",
    hemiGround: "#2e1518",
    hemiIntensity: 0.58,
    dirColor: "#fb7185",
    dirIntensity: 1.25,
    dirPos: [-8, 14, -17],
    rimColor: "#f97316",
    rimIntensity: 0.52,
    envIntensity: 0.65,
    groundTint: "#8c7780",
    plazaTint: "#b6adb8",
    starOpacity: 0.48,
    mistOpacity: 0.32,
    warmGlow: 1.48,
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
 * Vành Đai Núi Sương Mờ & Rừng Thông Xa Chân Trời (2 draw calls siêu nhẹ ở R = 48m..56m, lấp kín 100% khe hở chân trời đúng Concept!)
 */
function DistantMountainAndPineHorizonRing() {
  const { mountainGeo, distantPineGeo } = useMemo(() => {
    const buildRidgeCylinder = (radius, segs, baseH, peakFn) => {
      const geo = new THREE.CylinderGeometry(radius, radius, 1, segs, 1, true);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        if (y > 0) {
          const ang = Math.atan2(x, z);
          pos.setY(i, peakFn(ang));
        } else {
          pos.setY(i, baseH);
        }
      }
      geo.computeVertexNormals();
      return geo;
    };

    // Lớp 1 (Xa R=56m): Dãy núi đá Bắc Âu cao trập trùng ẩn trong mây sương
    const mGeo = buildRidgeCylinder(56, 96, -1.5, (a) => {
      const ridge =
        11.5 +
        Math.sin(a * 3.0 + 0.4) * 3.8 +
        Math.cos(a * 7.0 - 0.8) * 2.1 +
        Math.sin(a * 13.0 + 1.2) * 1.1;
      return Math.max(6.5, ridge);
    });

    // Lớp 2 (Trung gian R=46m): Đường viền ngọn rừng thông răng cưa dày đặc bao quanh thung lũng
    const pGeo = buildRidgeCylinder(46, 160, -1.2, (a) => {
      const spire = Math.pow(0.5 + 0.5 * Math.sin(a * 42.0), 1.6) * 3.4;
      const cluster = 6.2 + Math.sin(a * 5.0 + 1.1) * 1.8 + Math.cos(a * 11.0) * 1.1;
      return cluster + spire;
    });

    return { mountainGeo: mGeo, distantPineGeo: pGeo };
  }, []);

  return (
    <group>
      <mesh raycast={NOOP_RAYCAST} geometry={mountainGeo}>
        <meshBasicMaterial
          color="#0d1b2e"
          side={THREE.BackSide}
          transparent
          opacity={0.78}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      <mesh raycast={NOOP_RAYCAST} geometry={distantPineGeo}>
        <meshBasicMaterial
          color="#07111f"
          side={THREE.BackSide}
          transparent
          opacity={0.88}
          depthWrite={false}
          fog={false}
        />
      </mesh>
    </group>
  );
}

/**
 * 1. HỆ THỐNG BẦU TRỜI MÂY TRĂNG BẮC ÂU & CHIẾU SÁNG PBR ĐIỆN ẢNH SIÊU NHẸ
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
  const skyDomeMat = useMemo(() => createMoonlitSkyDomeMaterial(), []);
  const moonHaloTex = useMemo(() => getSoftGlowHaloTexture(), []);

  const targetBgColor = useMemo(() => new THREE.Color(), []);
  const targetFogColor = useMemo(() => new THREE.Color(), []);
  const targetHemiSky = useMemo(() => new THREE.Color(), []);
  const targetHemiGround = useMemo(() => new THREE.Color(), []);
  const targetDirColor = useMemo(() => new THREE.Color(), []);
  const targetDirPos = useMemo(() => new THREE.Vector3(), []);
  const targetRimColor = useMemo(() => new THREE.Color(), []);
  const targetZenith = useMemo(() => new THREE.Color(), []);
  const targetMidSky = useMemo(() => new THREE.Color(), []);
  const targetHorizon = useMemo(() => new THREE.Color(), []);
  const targetCloud = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const envTex = getOrCreateDarkFantasyEnvMap(gl);
    if (envTex) {
      scene.environment = envTex;
      if ("environmentIntensity" in scene) {
        scene.environmentIntensity = 0.65;
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
    const count = 260;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.42 + 0.04;
      const r = 60 + Math.random() * 4;
      arr[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      arr[i * 3 + 1] = Math.cos(phi) * r;
      arr[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    const pal = ATMOSPHERE_PALETTES[moodKey] || ATMOSPHERE_PALETTES.day;
    const speed = Math.min(1, delta * 2.8);

    // Khi bật D5 Architect Mode, đẩy sương mù xa ra 96m & tăng sáng nhẹ để Kiến trúc sư thấy rõ cả khu rừng!
    const fogNearGoal = architectMode ? 40 : pal.fogNear;
    const fogFarGoal = architectMode ? 98 : pal.fogFar;
    const hemiGoal = architectMode ? Math.max(pal.hemiIntensity, 0.88) : pal.hemiIntensity;

    targetBgColor.set(pal.bg);
    targetFogColor.set(pal.fog);
    targetHemiSky.set(pal.hemiSky);
    targetHemiGround.set(pal.hemiGround);
    targetDirColor.set(pal.dirColor);
    targetDirPos.set(pal.dirPos[0], pal.dirPos[1], pal.dirPos[2]);
    targetRimColor.set(pal.rimColor);
    targetZenith.set(pal.skyZenith || pal.bg);
    targetMidSky.set(pal.skyMid || pal.fog);
    targetHorizon.set(pal.skyHorizon || pal.fog);
    targetCloud.set(pal.cloudTint || "#6488b4");

    skyDomeMat.uniforms.uZenithColor.value.lerp(targetZenith, speed);
    skyDomeMat.uniforms.uMidSkyColor.value.lerp(targetMidSky, speed);
    skyDomeMat.uniforms.uHorizonColor.value.lerp(targetHorizon, speed);
    skyDomeMat.uniforms.uCloudTint.value.lerp(targetCloud, speed);

    if (!scene.background || !(scene.background instanceof THREE.Color)) {
      scene.background = new THREE.Color(pal.bg);
    } else {
      scene.background.lerp(targetBgColor, speed);
    }

    if ("environmentIntensity" in scene) {
      scene.environmentIntensity = THREE.MathUtils.lerp(
        scene.environmentIntensity ?? 0.65,
        architectMode ? Math.max(pal.envIntensity, 0.82) : pal.envIntensity,
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
  const moonColor = moodKey === "dusk_trial" ? "#fda4af" : "#f0f9ff";
  const moonGlowColor = moodKey === "dusk_trial" ? "#fb7185" : "#7dd3fc";

  return (
    <group>
      <fog attach="fog" args={["#0c1b31", 13, 48]} />
      <hemisphereLight ref={hemiRef} args={["#60a5fa", "#2e1c10", 0.56]} />

      <directionalLight
        ref={dirLightRef}
        position={[-7, 17, -18]}
        intensity={1.08}
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

      <directionalLight ref={rimLightRef} position={[14, 11, 14]} intensity={0.45} color="#38bdf8" />

      {/* Vòm Trời Mây Trôi Bắc Âu Shader (hoặc Panorama nếu có) */}
      {activePanorama ? (
        <mesh raycast={NOOP_RAYCAST} scale={[-1, 1, 1]}>
          <sphereGeometry args={[72, 36, 24]} />
          <meshBasicMaterial map={activePanorama} side={THREE.BackSide} fog={false} />
        </mesh>
      ) : (
        <mesh raycast={NOOP_RAYCAST} material={skyDomeMat}>
          <sphereGeometry args={[72, 36, 24]} />
        </mesh>
      )}

      {/* Vành đai Núi Mờ & Rừng Thông Xa 360° ôm trọn chân trời */}
      <DistantMountainAndPineHorizonRing />

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
          size={0.26}
          sizeAttenuation
          transparent
          opacity={0.75}
          fog={false}
        />
      </points>

      {/* Vầng Trăng Sáng & Quầng Tán Xạ Sương Bạc nằm ngay góc nhìn Bắc (cạnh Tháp Chuông & Đài Treo Cổ y hệt Ảnh Concept!) */}
      <group position={[-5.4, 17.6, -42]}>
        <mesh raycast={NOOP_RAYCAST}>
          <sphereGeometry args={[2.15, 24, 24]} />
          <meshBasicMaterial color={moonColor} fog={false} />
        </mesh>
        <sprite raycast={NOOP_RAYCAST} scale={[16.5, 16.5, 1]}>
          <spriteMaterial
            map={moonHaloTex}
            color={moonGlowColor}
            transparent
            opacity={isNightActive ? 0.58 : 0.36}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            fog={false}
          />
        </sprite>
        <sprite raycast={NOOP_RAYCAST} scale={[32, 24, 1]}>
          <spriteMaterial
            map={moonHaloTex}
            color="#38bdf8"
            transparent
            opacity={isNightActive ? 0.22 : 0.12}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            fog={false}
          />
        </sprite>
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
      if (Math.abs(a - Math.PI) < 0.16) return null;
      const r = plazaRadius - 0.08 + (i % 2) * 0.06;
      return {
        id: i,
        x: Math.sin(a) * r,
        z: Math.cos(a) * r,
        yaw: a + (i % 3) * 0.2,
        sx: 0.44 + (i % 3) * 0.09,
        sy: 0.09 + (i % 2) * 0.03,
        sz: 0.32 + (i % 2) * 0.06,
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
  const heroFlameRef = useRef(null);
  const emberBedMatRef = useRef(null);
  const fireLightRef = useRef(null);
  const embersMeshRef = useRef(null);

  const fireMatA = useMemo(() => createVolumetricFireMaterial({ phaseOffset: 0.0, opacityScale: 0.95 }), []);
  const fireMatB = useMemo(() => createVolumetricFireMaterial({ phaseOffset: 2.1, opacityScale: 0.85 }), []);
  const fireMatC = useMemo(() => createVolumetricFireMaterial({ phaseOffset: 4.3, opacityScale: 0.8 }), []);
  const fireHaloTex = useMemo(() => getSoftGlowHaloTexture(), []);

  const emberSeeds = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        angle: (i / 24) * Math.PI * 2 + Math.random() * 0.4,
        radius: 0.06 + Math.random() * 0.3,
        speed: 0.42 + Math.random() * 0.58,
        offset: Math.random(),
      })),
    []
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // Lưỡi lửa chính luôn xoay mặt trục Y hướng về Camera để góc nhìn nào cũng dày dặn 3D!
    if (heroFlameRef.current) {
      const cam = state.camera.position;
      heroFlameRef.current.rotation.y = Math.atan2(cam.x, cam.z);
    }

    if (emberBedMatRef.current) {
      emberBedMatRef.current.emissiveIntensity = 1.85 + Math.sin(t * 7.2) * 0.35;
    }

    if (fireLightRef.current) {
      const baseInt = isNightActive ? 4.8 : 3.35;
      fireLightRef.current.intensity =
        baseInt + Math.sin(t * 9.6) * 0.36 + Math.cos(t * 15.2) * 0.18;
    }

    if (embersMeshRef.current) {
      emberSeeds.forEach((eb, i) => {
        const life = (t * eb.speed + eb.offset) % 1;
        const y = 0.24 + life * 2.35;
        const swayR = eb.radius + Math.sin(t * 2.8 + i) * 0.09 + life * 0.22;
        const a = eb.angle + life * 1.9;
        const s = (1 - life) * 0.028 + 0.005;
        dummy.position.set(Math.cos(a) * swayR + life * 0.14, y, Math.sin(a) * swayR + life * 0.08);
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
      <ContactShadowDisc radius={1.32 * fireScale} opacity={0.74} position={[0, 0.006, fireZOffset]} />

      {/* Quầng hắt sáng ấm mềm dưới chân bếp đá (thay thế vòng ring cứng cũ) */}
      <mesh raycast={NOOP_RAYCAST} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, fireZOffset]}>
        <planeGeometry args={[4.4 * fireScale, 4.4 * fireScale]} />
        <meshBasicMaterial
          map={fireHaloTex}
          color="#fb923c"
          transparent
          opacity={isNightActive ? 0.42 : 0.28}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <SmartPropGLB
        propKey="prop_campfire"
        calib={calib}
        reloadToken={reloadToken}
        fallback={<ProceduralCampfirePit />}
      />

      {/* Lõi Than Hồng & Ngọn Lửa Volumetric FBM Shader Đa Lớp (Xóa sạch khối nón ConeGeometry thô!) */}
      <group position={[0, fireYOffset, fireZOffset]} scale={fireScale}>
        {/* Nền than củi đỏ rực nằm lọt trong lòng giếng đá */}
        <mesh raycast={NOOP_RAYCAST} position={[0, 0.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.42, 20]} />
          <meshStandardMaterial
            ref={emberBedMatRef}
            color="#2b0904"
            emissive="#ea580c"
            emissiveIntensity={1.9}
            roughness={0.85}
          />
        </mesh>

        {/* 3 mặt phẳng lửa đan chéo + 1 lưỡi lửa trung tâm hướng Camera */}
        <mesh raycast={NOOP_RAYCAST} ref={heroFlameRef} position={[0, 0.66, 0]} material={fireMatA}>
          <planeGeometry args={[0.96, 1.18, 1, 10]} />
        </mesh>
        <mesh raycast={NOOP_RAYCAST} position={[0, 0.62, 0]} rotation={[0, Math.PI / 3, 0]} material={fireMatB}>
          <planeGeometry args={[0.88, 1.06, 1, 8]} />
        </mesh>
        <mesh raycast={NOOP_RAYCAST} position={[0, 0.6, 0]} rotation={[0, (Math.PI * 2) / 3, 0]} material={fireMatC}>
          <planeGeometry args={[0.84, 1.02, 1, 8]} />
        </mesh>

        {/* Quầng Halo lửa mềm bao quanh ngọn lửa */}
        <sprite raycast={NOOP_RAYCAST} position={[0, 0.56, 0]} scale={[2.15, 2.15, 1]}>
          <spriteMaterial
            map={fireHaloTex}
            color="#f97316"
            transparent
            opacity={isNightActive ? 0.44 : 0.32}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>

        {/* Tàn lửa bay theo gió rừng */}
        <instancedMesh raycast={NOOP_RAYCAST} ref={embersMeshRef} args={[null, null, emberSeeds.length]}>
          <octahedronGeometry args={[1, 0]} />
          <meshBasicMaterial color="#fde047" />
        </instancedMesh>

        <pointLight
          ref={fireLightRef}
          position={[0, 1.05, 0]}
          color="#fb923c"
          intensity={isNightActive ? 4.8 : 3.35}
          distance={19}
          decay={1.45}
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
            <>
              <pointLight
                position={[0, 5.2, 2.2]}
                color="#fbbf24"
                intensity={isNightActive ? 3.1 : 2.1}
                distance={18}
                decay={1.5}
              />
              <sprite raycast={NOOP_RAYCAST} position={[0, 2.6, 1.35]} scale={[2.4, 2.4, 1]}>
                <spriteMaterial
                  map={getSoftGlowHaloTexture()}
                  color="#fb923c"
                  transparent
                  opacity={isNightActive ? 0.34 : 0.22}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </sprite>
            </>
          )}
        </group>
      )}

      {(node.type === "house_cottage_a" || node.type === "house_cottage_b") && (
        <group>
          <ContactShadowDisc radius={3.1} scaleXZ={[1.1, 0.95]} opacity={0.72} />
          <SmartPropGLB
            propKey={node.type}
            calib={propCalib?.[node.type]}
            reloadToken={reloadToken}
          />
          {windowGlow && (
            <mesh raycast={NOOP_RAYCAST} position={[0, 0.022, 2.1]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[4.2, 3.2]} />
              <meshBasicMaterial
                map={getSoftGlowHaloTexture()}
                color="#f59e0b"
                transparent
                opacity={isNightActive ? 0.32 : 0.2}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>
      )}

      {node.type === "prop_lantern" && (
        <group>
          <ContactShadowDisc radius={0.55} opacity={0.58} />
          <SmartPropGLB
            propKey="prop_lantern"
            calib={propCalib?.prop_lantern}
            reloadToken={reloadToken}
            fallback={<StylizedIronLanternFallback windowGlow={windowGlow} />}
          />
          {windowGlow && (
            <>
              {/* Quầng sáng sương ấm tỏa ra từ bầu đèn lồng sắt y hệt Ảnh Concept (0 tải GPU Shadow!) */}
              <sprite raycast={NOOP_RAYCAST} position={[0, 2.12, 0.14]} scale={[1.55, 1.55, 1]}>
                <spriteMaterial
                  map={getSoftGlowHaloTexture()}
                  color="#fbbf24"
                  transparent
                  opacity={isNightActive ? 0.62 : 0.44}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </sprite>
              <mesh raycast={NOOP_RAYCAST} position={[0, 0.018, 0.18]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[2.5, 2.5]} />
                <meshBasicMaterial
                  map={getSoftGlowHaloTexture()}
                  color="#f59e0b"
                  transparent
                  opacity={isNightActive ? 0.28 : 0.18}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            </>
          )}
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
  // Chuẩn Concept Điện Ảnh Mọi Lúc: Cửa sổ nhà gỗ & đèn lồng luôn ấm áp cả Chạng Vạng Ban Ngày lẫn Đêm Trăng Sâu!
  const windowGlow = true;

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
 * 6. DẢI SƯƠNG MÙ BẠC BAY LÀ LÀ MẶT ĐẤT GIỮA HÀNG RÀO, CHÂN NHÀ & RỪNG THÔNG (Đúng 100% Ảnh Concept!)
 */
function DriftingGroundMistLayers({
  circleRadius,
  moodKey,
  architectMode = false,
  isLowPowerDevice = false,
}) {
  const mistGroupRef = useRef(null);
  const mistTex = useMemo(() => getDriftingMistTexture(), []);

  const mistWisps = useMemo(() => {
    const count = isLowPowerDevice ? 12 : 26;
    return Array.from({ length: count }, (_, i) => {
      const ring = i % 2; // Lớp 0: quanh hàng rào & chân nhà (11.5..16.5m) | Lớp 1: bìa rừng thông (18..25.5m)
      const baseAngle = (i / count) * Math.PI * 2 + (ring ? 0.19 : 0);
      const radius =
        ring === 0
          ? Math.max(10.8, circleRadius + 6.4) + (i % 4) * 1.35
          : Math.max(17.8, circleRadius + 13.2) + (i % 5) * 1.65;
      return {
        baseAngle,
        radius,
        y: ring === 0 ? 0.85 + (i % 3) * 0.28 : 1.55 + (i % 4) * 0.42,
        scaleX: ring === 0 ? 7.8 + (i % 3) * 1.8 : 12.2 + (i % 4) * 2.4,
        scaleY: ring === 0 ? 2.1 + (i % 2) * 0.55 : 3.4 + (i % 3) * 0.75,
        driftSpeed: (0.018 + (i % 4) * 0.006) * (i % 2 === 0 ? 1 : -1),
        bobSpeed: 0.45 + (i % 5) * 0.12,
        phase: i * 1.13,
      };
    });
  }, [circleRadius, isLowPowerDevice]);

  useFrame((state) => {
    if (!mistGroupRef.current) return;
    const t = state.clock.elapsedTime;
    const pal = ATMOSPHERE_PALETTES[moodKey] || ATMOSPHERE_PALETTES.day;
    const baseOpacity = architectMode ? 0.06 : pal.mistOpacity ?? 0.28;
    const children = mistGroupRef.current.children;

    for (let i = 0; i < children.length; i++) {
      const sp = children[i];
      const w = mistWisps[i];
      if (!sp || !w) continue;
      const a = w.baseAngle + t * w.driftSpeed;
      const r = w.radius + Math.sin(t * 0.28 + w.phase) * 0.75;
      sp.position.set(
        Math.sin(a) * r,
        w.y + Math.sin(t * w.bobSpeed + w.phase) * 0.16,
        Math.cos(a) * r
      );
      if (sp.material) {
        const waveAlpha = 0.72 + 0.28 * Math.sin(t * 0.55 + w.phase);
        sp.material.opacity = baseOpacity * waveAlpha;
      }
    }
  });

  const mistColor =
    moodKey === "dusk_trial" ? "#fda4af" : moodKey === "dawn" ? "#d8b4fe" : "#93c5fd";

  return (
    <group ref={mistGroupRef}>
      {mistWisps.map((w, idx) => (
        <sprite
          key={`mist-wisp-${idx}`}
          raycast={NOOP_RAYCAST}
          position={[Math.sin(w.baseAngle) * w.radius, w.y, Math.cos(w.baseAngle) * w.radius]}
          scale={[w.scaleX, w.scaleY, 1]}
        >
          <spriteMaterial
            map={mistTex}
            color={mistColor}
            transparent
            opacity={0.26}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/**
 * 7. HẠT ĐOM ĐÓM ĐÊM & BỤI SƯƠNG RỪNG BAY THEO GIÓ
 */
function NightFirefliesSwarm({ circleRadius, isNightActive }) {
  const firefliesRef = useRef(null);
  const flyDummy = useMemo(() => new THREE.Object3D(), []);

  const fireflySeeds = useMemo(() => {
    return Array.from({ length: 36 }, (_, i) => ({
      angle: (i / 36) * Math.PI * 2,
      radius: circleRadius + 1.8 + (i % 6) * 1.55,
      yBase: 0.65 + (i % 5) * 0.45,
      speed: 0.32 + (i % 4) * 0.14,
      phase: i * 0.77,
    }));
  }, [circleRadius]);

  useFrame((state) => {
    if (!firefliesRef.current) return;
    const t = state.clock.elapsedTime;
    fireflySeeds.forEach((f, i) => {
      // Ban đêm hiện đủ 36 đom đóm; Chạng vạng ban ngày hiện 14 hạt bụi phấn vàng lơ lửng trong sương
      if (!isNightActive && i >= 14) {
        flyDummy.position.set(0, -10, 0);
        flyDummy.scale.setScalar(0.001);
      } else {
        const a = f.angle + Math.sin(t * f.speed + f.phase) * 0.24 + t * 0.025;
        const r = f.radius + Math.cos(t * 0.7 + f.phase) * 0.6;
        const y = f.yBase + Math.sin(t * 1.5 + f.phase) * 0.34;
        const pulse =
          (isNightActive ? 0.024 : 0.016) +
          (0.5 + 0.5 * Math.sin(t * 3.6 + f.phase)) * (isNightActive ? 0.026 : 0.014);
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
      <meshBasicMaterial color={isNightActive ? "#bef264" : "#fde68a"} />
    </instancedMesh>
  );
}

/**
 * TỔNG HỢP KHÔNG GIAN LÀNG MA SÓI 3D (CHUẨN D5 SCENE GRAPH + GPU WIND SWAY + LAYERED MIST + 8-SECTOR CULLING)
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

  const primaryCampfire = useMemo(
    () => activeNodes.find((n) => n.type === "prop_campfire") || null,
    [activeNodes]
  );

  // ĐIỂM CẬP NHẬT DUY NHẤT (~0.002ms CPU/frame) điều khiển đồng bộ Gió Rừng 2 Chiều, Cửa Sổ Ấm & Sân Đá Ẩm!
  useFrame((state, delta) => {
    CINEMATIC_SHARED_UNIFORMS.uTime.value = state.clock.elapsedTime;
    const isTrial = phase === "day_defense" || phase === "day_final_vote";
    const windGoal = architectMode ? 0.22 : isNightActive ? 1.18 : isTrial ? 1.32 : 0.95;
    CINEMATIC_SHARED_UNIFORMS.uWindStrength.value = THREE.MathUtils.lerp(
      CINEMATIC_SHARED_UNIFORMS.uWindStrength.value,
      windGoal,
      Math.min(1, delta * 2.5)
    );
    CINEMATIC_SHARED_UNIFORMS.uWarmGlowIntensity.value = THREE.MathUtils.lerp(
      CINEMATIC_SHARED_UNIFORMS.uWarmGlowIntensity.value,
      pal.warmGlow ?? 1.25,
      Math.min(1, delta * 2.5)
    );
    CINEMATIC_SHARED_UNIFORMS.uNightFactor.value = THREE.MathUtils.lerp(
      CINEMATIC_SHARED_UNIFORMS.uNightFactor.value,
      isNightActive ? 1.0 : 0.58,
      Math.min(1, delta * 2.5)
    );
    if (primaryCampfire?.position) {
      CINEMATIC_SHARED_UNIFORMS.uFireWorldPos.value.set(
        primaryCampfire.position[0] || 0,
        0.48,
        primaryCampfire.position[2] || 0
      );
    }
  });

  return (
    <group>
      {/* 1. Bầu trời Mây Trăng Bắc Âu, Núi Thông Chân Trời, PMREM IBL & Moon Rim Light */}
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

      {/* 5. Dải Sương Mù Bạc Là Là Chân Nhà, Hàng Rào & Rừng Thông */}
      <DriftingGroundMistLayers
        circleRadius={circleRadius}
        moodKey={moodKey}
        architectMode={architectMode}
        isLowPowerDevice={isLowPowerDevice}
      />

      {/* 6. Đom Đóm Đêm & Hạt Sương Vàng */}
      <NightFirefliesSwarm circleRadius={circleRadius} isNightActive={isNightActive} />
    </group>
  );
}
