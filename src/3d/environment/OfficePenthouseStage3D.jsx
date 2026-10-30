import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getSoftGlowHaloTexture } from "../shaders/villageCinematicShaders.js";

const NOOP_RAYCAST = () => null;
const skyTexCache = new Map();

function useOptionalSkyboxTexture(url) {
  const [tex, setTex] = useState(() => (url && skyTexCache.has(url) ? skyTexCache.get(url) : null));

  useEffect(() => {
    if (!url) {
      setTex(null);
      return undefined;
    }
    if (skyTexCache.has(url)) {
      setTex(skyTexCache.get(url));
      return undefined;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (loaded) => {
        if (cancelled) return;
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.wrapS = THREE.MirroredRepeatWrapping;
        loaded.wrapT = THREE.ClampToEdgeWrapping;
        loaded.repeat.set(2, 1);
        loaded.needsUpdate = true;
        skyTexCache.set(url, loaded);
        setTex(loaded);
      },
      undefined,
      () => {
        if (!cancelled) setTex(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  return tex;
}

/**
 * =============================================================================
 * 1. SÂN KHẤU 3D VŨ TRỤ CÔNG SỞ — PENTHOUSE TẬP ĐOÀN (`preset_office_penthouse_3d`)
 * - Chuẩn Zero-Clipping 100%: Bàn kính Hologram KPI trung tâm R = 1.25m (< 1.45m < CAMPFIRE_SAFE_RADIUS 1.92m).
 * - Khi Sếp/Nhân viên bật nhảy Bezier trao Quyết Định Trừ Lương / Đỡ KPI: 0% xuyên bàn ghế!
 * =============================================================================
 */
export function OfficePenthouseStage3D({
  circleRadius = 5.0,
  phase = "day_discuss",
  isNight = false,
  isLowPowerDevice = false,
}) {
  const { scene } = useThree();
  const skyTex = useOptionalSkyboxTexture("/backgrounds/concept_space_office_anime.jpg");
  const glowTex = useMemo(() => getSoftGlowHaloTexture(), []);

  const holoGroupRef = useRef(null);
  const holoRingRef = useRef(null);
  const barRefs = useRef([]);

  const isAuditAlert = phase === "day_final_vote" || phase === "night_wolf";

  const palette = useMemo(() => {
    if (isNight) {
      return {
        bg: "#070e1c",
        fog: "#0b162c",
        hemiSky: "#60a5fa",
        hemiGround: "#1e293b",
        hemiInt: 0.78,
        dirCol: isAuditAlert ? "#fda4af" : "#bae6fd",
        dirInt: 1.15,
        rimCol: isAuditAlert ? "#ef4444" : "#38bdf8",
        floorCol: "#0f172a",
        rugCol: "#162238",
        accentHex: isAuditAlert ? "#ef4444" : "#38bdf8",
        secondaryHex: isAuditAlert ? "#f59e0b" : "#10b981",
        skyTint: "#64748b",
      };
    }
    if (phase === "day_final_vote") {
      return {
        bg: "#1e162b",
        fog: "#271c36",
        hemiSky: "#fda4af",
        hemiGround: "#332232",
        hemiInt: 0.92,
        dirCol: "#fed7aa",
        dirInt: 1.38,
        rimCol: "#fb7185",
        floorCol: "#1c2233",
        rugCol: "#27233a",
        accentHex: "#f43f5e",
        secondaryHex: "#fbbf24",
        skyTint: "#cbd5e1",
      };
    }
    return {
      bg: "#102038",
      fog: "#172d4c",
      hemiSky: "#e0f2fe",
      hemiGround: "#334155",
      hemiInt: 1.08,
      dirCol: "#fffbeb",
      dirInt: 1.55,
      rimCol: "#38bdf8",
      floorCol: "#1e293b",
      rugCol: "#26354d",
      accentHex: "#0ea5e9",
      secondaryHex: "#10b981",
      skyTint: "#f1f5f9",
    };
  }, [isNight, isAuditAlert, phase]);

  useEffect(() => {
    const prevBg = scene.background;
    const prevFog = scene.fog;
    scene.background = new THREE.Color(palette.bg);
    scene.fog = new THREE.Fog(palette.fog, 18, 62);
    return () => {
      scene.background = prevBg;
      scene.fog = prevFog;
    };
  }, [scene, palette.bg, palette.fog]);

  // 20 tòa cao ốc Skyline ngoài vách kính Penthouse (R = 24..34m — ngoài vùng ghế 100%)
  const skylineBuildings = useMemo(() => {
    const count = isLowPowerDevice ? 12 : 20;
    return Array.from({ length: count }, (_, idx) => {
      const ang = (idx / count) * Math.PI * 2 + 0.14;
      const dist = 25 + (idx % 3) * 3.4;
      const h = 11 + ((idx * 7) % 15);
      const w = 2.6 + (idx % 3) * 0.9;
      const d = 2.4 + ((idx + 1) % 3) * 0.8;
      return {
        key: `sky_${idx}`,
        x: Math.cos(ang) * dist,
        z: Math.sin(ang) * dist,
        y: h * 0.5 - 3.5,
        w,
        h,
        d,
        yaw: -ang,
        neonHex: idx % 3 === 0 ? "#38bdf8" : idx % 3 === 1 ? "#fbbf24" : "#818cf8",
      };
    });
  }, [isLowPowerDevice]);

  // 16 cột khung vách kính Penthouse cao sát trần (R = circleRadius + 4.8m)
  const mullionPillars = useMemo(() => {
    const r = Math.max(9.6, circleRadius + 4.8);
    return Array.from({ length: 16 }, (_, idx) => {
      const ang = (idx / 16) * Math.PI * 2;
      return {
        key: `mul_${idx}`,
        x: Math.cos(ang) * r,
        z: Math.sin(ang) * r,
        yaw: -ang,
        r,
      };
    });
  }, [circleRadius]);

  // 6 chậu cây Monstera văn phòng sang trọng đặt ngoài vòng ghế (R = circleRadius + 2.55m)
  const officePlants = useMemo(() => {
    const r = Math.max(7.4, circleRadius + 2.55);
    return Array.from({ length: 6 }, (_, idx) => {
      const ang = (idx / 6) * Math.PI * 2 + Math.PI / 6;
      return {
        key: `plant_${idx}`,
        x: Math.cos(ang) * r,
        z: Math.sin(ang) * r,
        yaw: ang,
      };
    });
  }, [circleRadius]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (holoGroupRef.current) {
      holoGroupRef.current.rotation.y = t * 0.42;
      holoGroupRef.current.position.y = 0.72 + Math.sin(t * 2.1) * 0.035;
    }
    if (holoRingRef.current) {
      holoRingRef.current.rotation.z = -t * 0.85;
    }
    for (let i = 0; i < barRefs.current.length; i += 1) {
      const bar = barRefs.current[i];
      if (!bar) continue;
      const sY = 0.55 + Math.sin(t * 2.8 + i * 1.1) * 0.28 + 0.35;
      bar.scale.y = sY;
      bar.position.y = 0.16 * sY;
    }
  });

  const glassWallRadius = Math.max(9.6, circleRadius + 4.8);

  return (
    <group name="OfficePenthouseStage3D">
      {/* 1. HỆ ÁNH SÁNG STUDIO ANIME PENTHOUSE */}
      <hemisphereLight args={[palette.hemiSky, palette.hemiGround, palette.hemiInt]} />
      <directionalLight
        position={[9, 16, 11]}
        intensity={palette.dirInt}
        color={palette.dirCol}
        castShadow={!isLowPowerDevice}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={2}
        shadow-camera-far={38}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <directionalLight position={[-10, 9, -12]} intensity={0.62} color={palette.rimCol} />
      <pointLight
        position={[0, 1.35, 0]}
        intensity={isNight ? 1.85 : 1.15}
        distance={11}
        color={palette.accentHex}
      />

      {/* 2. VÒM SKYBOX TOÀN CẢNH THÀNH PHỐ ANIME 360° */}
      <mesh raycast={NOOP_RAYCAST} scale={[-1, 1, 1]}>
        <sphereGeometry args={[58, 32, 20]} />
        {skyTex ? (
          <meshBasicMaterial map={skyTex} color={palette.skyTint} side={THREE.BackSide} fog={false} />
        ) : (
          <meshBasicMaterial color={palette.bg} side={THREE.BackSide} fog={false} />
        )}
      </mesh>

      {/* 3. MẶT SÀN GỖ ÓC CHÓ & THẢM HỘI NGHỊ TRÒN MỞ THOÁNG (Y = 0.00m) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow raycast={NOOP_RAYCAST}>
        <circleGeometry args={[34, 48]} />
        <meshStandardMaterial color={palette.floorCol} roughness={0.38} metalness={0.18} />
      </mesh>

      {/* Thảm nhung hội nghị tròn dưới vòng ghế */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow raycast={NOOP_RAYCAST}>
        <circleGeometry args={[circleRadius + 1.15, 48]} />
        <meshStandardMaterial color={palette.rugCol} roughness={0.78} metalness={0.05} />
      </mesh>

      {/* Dải đèn LED âm sàn chạy đúng vòng ghế nhân vật + viền vàng kim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} raycast={NOOP_RAYCAST}>
        <ringGeometry args={[circleRadius - 0.08, circleRadius + 0.08, 64]} />
        <meshBasicMaterial color={palette.accentHex} transparent opacity={0.58} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} raycast={NOOP_RAYCAST}>
        <ringGeometry args={[1.32, 1.38, 48]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.48} />
      </mesh>

      {/* 4. BÀN KÍNH TRÒN HOLOGRAM KPI TRUNG TÂM (R = 1.25m <= 1.45m — ZERO CLIPPING!) */}
      <group position={[0, 0, 0]}>
        {/* Đế trụ kim loại vát côn sang trọng */}
        <mesh position={[0, 0.04, 0]} raycast={NOOP_RAYCAST}>
          <cylinderGeometry args={[0.58, 0.68, 0.08, 32]} />
          <meshStandardMaterial color="#0f172a" metalness={0.78} roughness={0.26} />
        </mesh>
        <mesh position={[0, 0.3, 0]} castShadow raycast={NOOP_RAYCAST}>
          <cylinderGeometry args={[0.24, 0.36, 0.5, 28]} />
          <meshStandardMaterial color="#1e293b" metalness={0.82} roughness={0.24} />
        </mesh>
        {/* Vòng LED phát sáng cổ trụ bàn */}
        <mesh position={[0, 0.52, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={NOOP_RAYCAST}>
          <torusGeometry args={[0.28, 0.016, 10, 32]} />
          <meshBasicMaterial color={palette.accentHex} />
        </mesh>

        {/* Mặt bàn kính cường lực khói tròn R = 1.24m tại cao độ Y = 0.58m */}
        <mesh position={[0, 0.58, 0]} receiveShadow castShadow raycast={NOOP_RAYCAST}>
          <cylinderGeometry args={[1.24, 1.2, 0.045, 40]} />
          <meshStandardMaterial
            color="#0f172a"
            metalness={0.65}
            roughness={0.14}
            transparent
            opacity={0.88}
          />
        </mesh>
        {/* Viền đồng / LED mảnh bọc mép bàn kính */}
        <mesh position={[0, 0.585, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={NOOP_RAYCAST}>
          <torusGeometry args={[1.24, 0.018, 12, 48]} />
          <meshStandardMaterial
            color="#38bdf8"
            emissive={palette.accentHex}
            emissiveIntensity={0.85}
            metalness={0.85}
            roughness={0.2}
          />
        </mesh>

        {/* 4 Ly Cà Phê Sữa Đá / Espresso & Hồ Sơ nhỏ đặt gọn trên vành mặt bàn (r = 0.88m) */}
        {[0, 1, 2, 3].map((idx) => {
          const a = (idx / 4) * Math.PI * 2 + 0.4;
          const cx = Math.cos(a) * 0.88;
          const cz = Math.sin(a) * 0.88;
          return (
            <group key={`desk_item_${idx}`} position={[cx, 0.605, cz]} rotation={[0, -a, 0]}>
              {/* Tập tài liệu mỏng */}
              <mesh position={[0, 0.008, 0]} raycast={NOOP_RAYCAST}>
                <boxGeometry args={[0.22, 0.014, 0.16]} />
                <meshStandardMaterial color={idx % 2 === 0 ? "#e2e8f0" : "#bae6fd"} roughness={0.6} />
              </mesh>
              {/* Ly sứ cà phê nhỏ */}
              <mesh position={[0.14, 0.036, 0.03]} raycast={NOOP_RAYCAST}>
                <cylinderGeometry args={[0.032, 0.026, 0.068, 14]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.25} />
              </mesh>
            </group>
          );
        })}

        {/* Cụm Biểu Đồ Hologram KPI 3D xoay lơ lửng giữa bàn (r <= 0.55m) */}
        <group ref={holoGroupRef} position={[0, 0.72, 0]}>
          <mesh ref={holoRingRef} rotation={[Math.PI / 2, 0, 0]} raycast={NOOP_RAYCAST}>
            <ringGeometry args={[0.42, 0.52, 36]} />
            <meshBasicMaterial
              color={palette.accentHex}
              transparent
              opacity={0.55}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* 5 cột biểu đồ KPI 3D nhấp nhô sống động */}
          {[-0.22, -0.11, 0, 0.11, 0.22].map((bx, idx) => {
            const barColor =
              isAuditAlert && idx === 4
                ? "#ef4444"
                : idx % 2 === 0
                  ? palette.accentHex
                  : palette.secondaryHex;
            return (
              <mesh
                key={`kpi_bar_${idx}`}
                ref={(el) => {
                  barRefs.current[idx] = el;
                }}
                position={[bx, 0.16, (idx % 2 === 0 ? 1 : -1) * 0.06]}
                raycast={NOOP_RAYCAST}
              >
                <boxGeometry args={[0.065, 0.32, 0.065]} />
                <meshStandardMaterial
                  color={barColor}
                  emissive={barColor}
                  emissiveIntensity={1.15}
                  transparent
                  opacity={0.86}
                  roughness={0.18}
                />
              </mesh>
            );
          })}

          <sprite position={[0, 0.22, 0]} scale={[1.15, 1.15, 1]} raycast={NOOP_RAYCAST}>
            <spriteMaterial
              map={glowTex}
              color={palette.accentHex}
              transparent
              opacity={0.42}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        </group>
      </group>

      {/* 5. CÂY XANH MONSTERA VĂN PHÒNG NGOÀI VÒNG GHẾ (R = circleRadius + 2.55m) */}
      {officePlants.map((pl) => (
        <group key={pl.key} position={[pl.x, 0, pl.z]} rotation={[0, pl.yaw, 0]}>
          <mesh position={[0, 0.24, 0]} castShadow raycast={NOOP_RAYCAST}>
            <cylinderGeometry args={[0.24, 0.18, 0.48, 16]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.42} metalness={0.15} />
          </mesh>
          <mesh position={[0, 0.47, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={NOOP_RAYCAST}>
            <torusGeometry args={[0.235, 0.015, 8, 20]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.8} roughness={0.25} />
          </mesh>
          {[0, 1, 2, 3, 4].map((li) => {
            const la = (li / 5) * Math.PI * 2;
            return (
              <mesh
                key={li}
                position={[Math.cos(la) * 0.16, 0.68 + (li % 2) * 0.12, Math.sin(la) * 0.16]}
                rotation={[0.38, -la, 0.2]}
                scale={[1, 0.22, 1.45]}
                raycast={NOOP_RAYCAST}
              >
                <sphereGeometry args={[0.16, 12, 10]} />
                <meshStandardMaterial color="#15803d" roughness={0.55} />
              </mesh>
            );
          })}
        </group>
      ))}

      {/* 6. HỆ KHUNG KÍNH PENTHOUSE PANORAMA 360° (NGOÀI R >= 9.6m) */}
      <group>
        {mullionPillars.map((m) => (
          <mesh key={m.key} position={[m.x, 2.8, m.z]} rotation={[0, m.yaw, 0]} raycast={NOOP_RAYCAST}>
            <boxGeometry args={[0.12, 5.6, 0.18]} />
            <meshStandardMaterial color="#0f172a" metalness={0.75} roughness={0.3} />
          </mesh>
        ))}
        {/* Vòng dầm trần đèn hắt sang trọng */}
        <mesh position={[0, 5.55, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={NOOP_RAYCAST}>
          <torusGeometry args={[glassWallRadius, 0.16, 10, 64]} />
          <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh position={[0, 5.4, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={NOOP_RAYCAST}>
          <torusGeometry args={[glassWallRadius - 0.12, 0.035, 8, 64]} />
          <meshBasicMaterial color="#fde68a" />
        </mesh>
      </group>

      {/* 7. QUẦN THỂ TÒA THÁP SKYLINE NGOÀI CỬA KÍNH (R = 25..32m) */}
      <group>
        {skylineBuildings.map((b) => (
          <group key={b.key} position={[b.x, b.y, b.z]} rotation={[0, b.yaw, 0]}>
            <mesh raycast={NOOP_RAYCAST}>
              <boxGeometry args={[b.w, b.h, b.d]} />
              <meshStandardMaterial color="#0b1324" roughness={0.45} metalness={0.55} />
            </mesh>
            {/* Dải đèn Neon đỉnh tháp */}
            <mesh position={[0, b.h * 0.5 - 0.25, b.d * 0.5 + 0.02]} raycast={NOOP_RAYCAST}>
              <boxGeometry args={[b.w * 0.86, 0.16, 0.04]} />
              <meshBasicMaterial color={b.neonHex} />
            </mesh>
            <mesh position={[0, b.h * 0.2, b.d * 0.5 + 0.02]} raycast={NOOP_RAYCAST}>
              <boxGeometry args={[b.w * 0.72, 0.1, 0.04]} />
              <meshBasicMaterial color="#fef08a" transparent opacity={0.65} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/**
 * =============================================================================
 * 2. SÂN KHẤU 3D VŨ TRỤ HỌC ĐƯỜNG — LỚP HỌC HOÀNG HÔN (`preset_school_sunset_3d`)
 * - Chuẩn Zero-Clipping 100%: Bục Cúp Thi Đua & Sổ Đầu Bài trung tâm R = 1.20m (< 1.45m < 1.92m).
 * - Bảng Phấn Xanh + Bục Giảng đặt ở R = circleRadius + 3.3m ngoài vòng ghế, nắng hoàng hôn rọi xuyên cửa sổ!
 * =============================================================================
 */
export function SchoolSunsetStage3D({
  circleRadius = 5.0,
  phase = "day_discuss",
  isNight = false,
  isLowPowerDevice = false,
}) {
  const { scene } = useThree();
  const skyTex = useOptionalSkyboxTexture("/backgrounds/concept_space_school_anime.jpg");
  const glowTex = useMemo(() => getSoftGlowHaloTexture(), []);

  const trophyRef = useRef(null);
  const petalRefs = useRef([]);

  const isProctorAlert = phase === "day_final_vote" || phase === "night_wolf";

  const palette = useMemo(() => {
    if (isNight) {
      return {
        bg: "#13132b",
        fog: "#1a1936",
        hemiSky: "#a5b4fc",
        hemiGround: "#2e1f27",
        hemiInt: 0.82,
        dirCol: isProctorAlert ? "#fda4af" : "#c7d2fe",
        dirInt: 1.18,
        rimCol: "#f472b6",
        floorCol: "#2b2129",
        innerFloorCol: "#382933",
        ringHex: isProctorAlert ? "#ef4444" : "#818cf8",
        skyTint: "#818cf8",
        sunbeamOpacity: 0.08,
      };
    }
    if (phase === "day_final_vote") {
      return {
        bg: "#2d1826",
        fog: "#3d2030",
        hemiSky: "#fdba74",
        hemiGround: "#3b2119",
        hemiInt: 0.96,
        dirCol: "#fb923c",
        dirInt: 1.45,
        rimCol: "#f43f5e",
        floorCol: "#4a2c23",
        innerFloorCol: "#5c362a",
        ringHex: "#f43f5e",
        skyTint: "#fed7aa",
        sunbeamOpacity: 0.16,
      };
    }
    return {
      bg: "#332238",
      fog: "#4a2e43",
      hemiSky: "#fde68a",
      hemiGround: "#5c3a24",
      hemiInt: 1.12,
      dirCol: "#ffedd5",
      dirInt: 1.62,
      rimCol: "#fb923c",
      floorCol: "#5c3d28",
      innerFloorCol: "#6e4a32",
      ringHex: "#f59e0b",
      skyTint: "#ffffff",
      sunbeamOpacity: 0.22,
    };
  }, [isNight, isProctorAlert, phase]);

  useEffect(() => {
    const prevBg = scene.background;
    const prevFog = scene.fog;
    scene.background = new THREE.Color(palette.bg);
    scene.fog = new THREE.Fog(palette.fog, 18, 60);
    return () => {
      scene.background = prevBg;
      scene.fog = prevFog;
    };
  }, [scene, palette.bg, palette.fog]);

  // 20 Cánh hoa Phượng / Anh Đào bay lơ lửng ngoài rìa sân học đường
  const petalSeeds = useMemo(() => {
    const count = isLowPowerDevice ? 10 : 20;
    return Array.from({ length: count }, (_, idx) => ({
      ang: (idx / count) * Math.PI * 2,
      rad: circleRadius + 1.2 + (idx % 4) * 1.1,
      baseY: 1.1 + (idx % 5) * 0.65,
      speed: 0.22 + (idx % 3) * 0.08,
      color: idx % 3 === 0 ? "#fda4af" : idx % 3 === 1 ? "#fbcfe8" : "#fed7aa",
    }));
  }, [circleRadius, isLowPowerDevice]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (trophyRef.current) {
      trophyRef.current.rotation.y = t * 0.75;
      trophyRef.current.position.y = 0.88 + Math.sin(t * 2.4) * 0.04;
    }
    for (let i = 0; i < petalSeeds.length; i += 1) {
      const m = petalRefs.current[i];
      if (!m) continue;
      const s = petalSeeds[i];
      const a = s.ang + t * s.speed;
      m.position.set(
        Math.cos(a) * s.rad,
        s.baseY + Math.sin(t * 1.6 + i) * 0.35,
        Math.sin(a) * s.rad
      );
      m.rotation.set(t * 1.2 + i, t * 0.9, i * 0.5);
    }
  });

  const northZ = -Math.max(8.2, circleRadius + 3.2);
  const sideWallX = Math.max(8.8, circleRadius + 3.9);

  return (
    <group name="SchoolSunsetStage3D">
      {/* 1. ÁNH SÁNG NẮNG CHIỀU HỌC ĐƯỜNG ANIME */}
      <hemisphereLight args={[palette.hemiSky, palette.hemiGround, palette.hemiInt]} />
      <directionalLight
        position={[-12, 13, 6]}
        intensity={palette.dirInt}
        color={palette.dirCol}
        castShadow={!isLowPowerDevice}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={2}
        shadow-camera-far={38}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <directionalLight position={[10, 9, -10]} intensity={0.55} color={palette.rimCol} />
      <pointLight
        position={[0, 1.45, 0]}
        intensity={isNight ? 1.55 : 1.05}
        distance={10.5}
        color={palette.ringHex}
      />

      {/* 2. VÒM BẦU TRỜI HOÀNG HÔN SÂN TRƯỜNG ANIME 360° */}
      <mesh raycast={NOOP_RAYCAST} scale={[-1, 1, 1]}>
        <sphereGeometry args={[56, 32, 20]} />
        {skyTex ? (
          <meshBasicMaterial map={skyTex} color={palette.skyTint} side={THREE.BackSide} fog={false} />
        ) : (
          <meshBasicMaterial color={palette.bg} side={THREE.BackSide} fog={false} />
        )}
      </mesh>

      {/* 3. MẶT SÀN GỖ LỚP HỌC ẤM ÁP & VÒNG PHẤN SAO THI ĐUA */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow raycast={NOOP_RAYCAST}>
        <circleGeometry args={[34, 48]} />
        <meshStandardMaterial color={palette.floorCol} roughness={0.62} metalness={0.06} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow raycast={NOOP_RAYCAST}>
        <circleGeometry args={[circleRadius + 1.15, 48]} />
        <meshStandardMaterial color={palette.innerFloorCol} roughness={0.58} metalness={0.05} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} raycast={NOOP_RAYCAST}>
        <ringGeometry args={[circleRadius - 0.07, circleRadius + 0.07, 64]} />
        <meshBasicMaterial color={palette.ringHex} transparent opacity={0.55} />
      </mesh>

      {/* 4. BỤC GỖ TRÒN CÚP THI ĐUA & SỔ ĐẦU BÀI TRUNG TÂM (R = 1.20m <= 1.45m — ZERO CLIPPING!) */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.04, 0]} raycast={NOOP_RAYCAST}>
          <cylinderGeometry args={[0.62, 0.72, 0.08, 32]} />
          <meshStandardMaterial color="#78350f" roughness={0.68} />
        </mesh>
        <mesh position={[0, 0.29, 0]} castShadow raycast={NOOP_RAYCAST}>
          <cylinderGeometry args={[0.3, 0.4, 0.46, 28]} />
          <meshStandardMaterial color="#92400e" roughness={0.65} />
        </mesh>
        {/* Mặt bàn gỗ sáng học đường R = 1.18m tại Y = 0.56m */}
        <mesh position={[0, 0.56, 0]} receiveShadow castShadow raycast={NOOP_RAYCAST}>
          <cylinderGeometry args={[1.18, 1.14, 0.055, 36]} />
          <meshStandardMaterial color="#d97706" roughness={0.52} />
        </mesh>
        <mesh position={[0, 0.57, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={NOOP_RAYCAST}>
          <torusGeometry args={[1.18, 0.02, 10, 48]} />
          <meshStandardMaterial color="#fde047" metalness={0.65} roughness={0.28} />
        </mesh>

        {/* Quyển Sổ Đầu Bài Bìa Đỏ Sao Vàng & Chồng Sách Giáo Khoa trên mặt bàn */}
        <group position={[0, 0.61, 0.48]} rotation={[0, 0.25, 0]}>
          <mesh raycast={NOOP_RAYCAST}>
            <boxGeometry args={[0.34, 0.045, 0.25]} />
            <meshStandardMaterial
              color="#b91c1c"
              emissive={isProctorAlert ? "#ef4444" : "#000000"}
              emissiveIntensity={isProctorAlert ? 0.55 : 0}
              roughness={0.45}
            />
          </mesh>
          <mesh position={[0, 0.025, 0]} raycast={NOOP_RAYCAST}>
            <octahedronGeometry args={[0.045, 0]} />
            <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={0.8} />
          </mesh>
        </group>

        {/* 2 chồng sách giáo khoa xanh/hồng nhỏ xinh */}
        {[
          [-0.52, -0.28, "#38bdf8"],
          [0.52, -0.28, "#34d399"],
        ].map(([bx, bz, col], idx) => (
          <group key={`book_${idx}`} position={[bx, 0.615, bz]} rotation={[0, idx * 0.8, 0]}>
            <mesh raycast={NOOP_RAYCAST}>
              <boxGeometry args={[0.26, 0.05, 0.2]} />
              <meshStandardMaterial color={col} roughness={0.55} />
            </mesh>
            <mesh position={[0.01, 0.045, 0]} rotation={[0, 0.18, 0]} raycast={NOOP_RAYCAST}>
              <boxGeometry args={[0.24, 0.04, 0.18]} />
              <meshStandardMaterial color="#fef08a" roughness={0.6} />
            </mesh>
          </group>
        ))}

        {/* Cúp Ngôi Sao Cờ Đỏ Thi Đua xoay lơ lửng giữa bàn */}
        <group ref={trophyRef} position={[0, 0.88, 0]}>
          <mesh raycast={NOOP_RAYCAST}>
            <octahedronGeometry args={[0.2, 0]} />
            <meshStandardMaterial
              color="#fde047"
              emissive="#f59e0b"
              emissiveIntensity={1.1}
              metalness={0.82}
              roughness={0.18}
            />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} raycast={NOOP_RAYCAST}>
            <torusGeometry args={[0.32, 0.014, 10, 32]} />
            <meshBasicMaterial color="#fef08a" />
          </mesh>
          <sprite scale={[0.95, 0.95, 1]} raycast={NOOP_RAYCAST}>
            <spriteMaterial
              map={glowTex}
              color="#fbbf24"
              transparent
              opacity={0.55}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        </group>
      </group>

      {/* 5. BẢNG PHẤN XANH LỚP HỌC & BỤC GIẢNG PHÍA BẮC (NGOÀI VÒNG GHẾ R >= 8.2m) */}
      <group position={[0, 0, northZ]}>
        {/* Bục giảng gỗ */}
        <mesh position={[0, 0.52, 0.85]} castShadow raycast={NOOP_RAYCAST}>
          <boxGeometry args={[1.15, 1.04, 0.68]} />
          <meshStandardMaterial color="#78350f" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.07, 0.85]} rotation={[0.18, 0, 0]} raycast={NOOP_RAYCAST}>
          <boxGeometry args={[1.24, 0.06, 0.76]} />
          <meshStandardMaterial color="#92400e" roughness={0.6} />
        </mesh>

        {/* Bảng phấn xanh lá đậm viền gỗ sồi */}
        <mesh position={[0, 2.25, 0]} raycast={NOOP_RAYCAST}>
          <boxGeometry args={[5.2, 2.15, 0.12]} />
          <meshStandardMaterial color="#78350f" roughness={0.72} />
        </mesh>
        <mesh position={[0, 2.25, 0.065]} raycast={NOOP_RAYCAST}>
          <boxGeometry args={[4.92, 1.88, 0.03]} />
          <meshStandardMaterial color="#14532d" roughness={0.82} />
        </mesh>
        {/* Máng đựng phấn + Khăn lau bảng */}
        <mesh position={[0, 1.24, 0.14]} raycast={NOOP_RAYCAST}>
          <boxGeometry args={[4.95, 0.06, 0.14]} />
          <meshStandardMaterial color="#92400e" roughness={0.68} />
        </mesh>
        {/* Đồng hồ treo tường tròn phía trên bảng */}
        <mesh position={[0, 3.68, 0.06]} rotation={[Math.PI / 2, 0, 0]} raycast={NOOP_RAYCAST}>
          <cylinderGeometry args={[0.28, 0.28, 0.06, 24]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.35} />
        </mesh>
      </group>

      {/* 6. KHUNG CỬA SỔ LỚP HỌC & TIA NẮNG HOÀNG HÔN RỌI XIÊN BÊN TRÁI */}
      {[-3.2, 0, 3.2].map((wz, idx) => (
        <group key={`win_${idx}`} position={[-sideWallX, 0, wz]}>
          {/* Khung cửa sổ gỗ cao thoáng */}
          <mesh position={[0, 2.4, 0]} raycast={NOOP_RAYCAST}>
            <boxGeometry args={[0.14, 3.4, 2.3]} />
            <meshStandardMaterial color="#78350f" roughness={0.68} />
          </mesh>
          <mesh position={[0.04, 2.4, 0]} raycast={NOOP_RAYCAST}>
            <boxGeometry args={[0.04, 3.1, 2.05]} />
            <meshBasicMaterial color="#fde68a" transparent opacity={isNight ? 0.14 : 0.32} />
          </mesh>
          {/* Luồng nắng hoàng hôn rọi chéo xuống nền lớp */}
          {palette.sunbeamOpacity > 0.05 && (
            <mesh
              position={[1.85, 1.35, 0]}
              rotation={[0, 0, -0.58]}
              raycast={NOOP_RAYCAST}
            >
              <planeGeometry args={[3.6, 1.9]} />
              <meshBasicMaterial
                color={isNight ? "#818cf8" : "#fed7aa"}
                transparent
                opacity={palette.sunbeamOpacity}
                side={THREE.DoubleSide}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>
      ))}

      {/* 7. TỦ LOCKER & KỆ SÁCH BÊN PHẢI LỚP HỌC */}
      {[-2.4, 0, 2.4].map((lz, idx) => (
        <group key={`locker_${idx}`} position={[sideWallX, 1.15, lz]}>
          <mesh castShadow raycast={NOOP_RAYCAST}>
            <boxGeometry args={[0.58, 2.3, 1.85]} />
            <meshStandardMaterial color={idx === 1 ? "#92400e" : "#cbd5e1"} roughness={0.55} />
          </mesh>
        </group>
      ))}

      {/* 8. HOA PHƯỢNG / HOA ANH ĐÀO BAY TRONG GIÓ CHIỀU */}
      {petalSeeds.map((s, idx) => (
        <mesh
          key={`petal_${idx}`}
          ref={(el) => {
            petalRefs.current[idx] = el;
          }}
          scale={[1, 0.25, 1.6]}
          raycast={NOOP_RAYCAST}
        >
          <sphereGeometry args={[0.036, 8, 6]} />
          <meshBasicMaterial color={s.color} transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  );
}
