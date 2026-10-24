import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  CINEMATIC_SHARED_UNIFORMS,
  getSoftGlowHaloTexture,
} from "../shaders/villageCinematicShaders.js";

// Mặt sàn đá 4K Mosaic cao ~0.12m -> nâng mọi vòng sóng năng lượng lên >= 0.23m để nổi bật rực rỡ 100%!
const PLAZA_WAVE_Y = 0.23;

function createEnergySlashMaterial(hexColor = "#ef4444", coreHex = "#fef2f2") {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: CINEMATIC_SHARED_UNIFORMS.uTime,
      uColor: { value: new THREE.Color(hexColor) },
      uCoreColor: { value: new THREE.Color(coreHex) },
      uProgress: { value: 0.5 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uCoreColor;
      uniform float uProgress;
      varying vec2 vUv;
      void main() {
        float head = uProgress * 1.35 - 0.15;
        float distAlong = abs(vUv.x - head);
        float swipeMask = smoothstep(0.52, 0.0, distAlong) * smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
        float edgeSoft = sin(vUv.y * 3.14159265);
        edgeSoft = pow(max(0.0, edgeSoft), 1.45);
        float core = pow(edgeSoft, 3.2);
        float flicker = 0.85 + 0.15 * sin(uTime * 28.0 + vUv.x * 14.0);
        vec3 col = mix(uColor, uCoreColor, core * 0.85);
        float alpha = swipeMask * edgeSoft * flicker;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(col * 1.4, alpha);
      }
    `,
  });
}

function createFresnelShieldMaterial(hexColor = "#38bdf8") {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: CINEMATIC_SHARED_UNIFORMS.uTime,
      uColor: { value: new THREE.Color(hexColor) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        float fresnel = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir))), 2.1);
        float hexWave = 0.5 + 0.5 * sin(vUv.y * 38.0 - uTime * 6.5) * cos(vUv.x * 38.0);
        float bottomFade = smoothstep(0.02, 0.25, vUv.y);
        float alpha = (fresnel * 0.82 + hexWave * 0.16) * bottomFade;
        vec3 col = mix(uColor, vec3(0.92, 0.98, 1.0), fresnel * 0.55);
        gl_FragColor = vec4(col * 1.25, clamp(alpha, 0.0, 0.88));
      }
    `,
  });
}

function createFlowingStreamMaterial(hexColor = "#c084fc", speed = 3.6) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: CINEMATIC_SHARED_UNIFORMS.uTime,
      uColor: { value: new THREE.Color(hexColor) },
      uSpeed: { value: speed },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSpeed;
      varying vec2 vUv;
      void main() {
        float pulse1 = fract(vUv.x * 2.2 - uTime * uSpeed * 0.45);
        float packet = smoothstep(0.0, 0.25, pulse1) * smoothstep(0.85, 0.25, pulse1);
        float endFade = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float radial = sin(vUv.y * 3.14159265);
        float alpha = (0.28 + packet * 0.72) * endFade * radial;
        vec3 col = mix(uColor, vec3(1.0), packet * 0.55);
        gl_FragColor = vec4(col * 1.3, alpha * 0.88);
      }
    `,
  });
}

function createGroundAuroraRingMaterial(hexColor = "#fbbf24") {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: CINEMATIC_SHARED_UNIFORMS.uTime,
      uColor: { value: new THREE.Color(hexColor) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec2 c = vUv - 0.5;
        float r = length(c) * 2.0;
        float ring = smoothstep(0.56, 0.78, r) * smoothstep(1.0, 0.82, r);
        float angle = atan(c.y, c.x);
        float swirl = 0.72 + 0.28 * sin(angle * 6.0 - uTime * 3.5);
        float alpha = ring * swirl;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor * 1.35, alpha * 0.82);
      }
    `,
  });
}

/**
 * Dải Hồ Quang Năng Lượng Uốn Cong Parabol Nối 2 Ghế (0% khối hộp hay ống trụ cứng!)
 */
function CurvedArcBeam({ fromSeat, toSeat, color = "#c084fc", apexY = 1.95, radius = 0.036, speed = 3.8 }) {
  const geo = useMemo(() => {
    if (!toSeat) return null;
    const sx = fromSeat ? fromSeat.x : 0;
    const sz = fromSeat ? fromSeat.z : 0;
    const start = new THREE.Vector3(sx, fromSeat ? 1.12 : 0.72, sz);
    const end = new THREE.Vector3(toSeat.x, 1.1, toSeat.z);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    mid.y = apexY;
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    return new THREE.TubeGeometry(curve, 32, radius, 10, false);
  }, [fromSeat?.x, fromSeat?.z, toSeat?.x, toSeat?.z, apexY, radius]);

  const mat = useMemo(() => createFlowingStreamMaterial(color, speed), [color, speed]);

  if (!geo) return null;
  return <mesh geometry={geo} material={mat} />;
}

/**
 * TẦNG HIỆU ỨNG SHADER & HẠT PHÁT SÁNG MỀM CHO BĂNG GHI HÌNH KHÔNG GIAN THẬT (0% HÌNH HỘP):
 * - Toàn bộ sóng năng lượng dưới đất được nâng lên `y = 0.23m` (cao hơn mặt sân đá 4K Mosaic `0.12m`).
 * - Vệt cào Sói, Vòm Khiên Bảo Vệ, Sao Băng Bình Thuốc Phù Thủy, Tia Tiên Tri & Tòa Án đều dùng Custom GLSL Shader + Additive Glow Sprite!
 */
export default function StoryVfxLayer3D({
  activeCue = null,
  seatMap = {},
  circleRadius = 3.8,
}) {
  const pulseGroupRef = useRef(null);
  const projectileRef = useRef(null);
  const slashGroupRef = useRef(null);
  const sparksRef = useRef(null);
  const startClockRef = useRef({ cueId: null, t0: 0 });

  const startPos = useMemo(() => new THREE.Vector3(), []);
  const endPos = useMemo(() => new THREE.Vector3(), []);
  const midPos = useMemo(() => new THREE.Vector3(), []);
  const tmpPos = useMemo(() => new THREE.Vector3(), []);
  const glowTex = useMemo(() => getSoftGlowHaloTexture(), []);

  const cueType = activeCue?.vfxType || null;
  const sourceSeat = activeCue?.sourceId ? seatMap[activeCue.sourceId] : null;
  const targetSeat = activeCue?.targetId ? seatMap[activeCue.targetId] : null;
  const prevTargetSeat = activeCue?.prevTargetId ? seatMap[activeCue.prevTargetId] : null;

  // 3 Lưỡi Vuốt Năng Lượng Uốn Cong Hình Trăng Khuyết (Curved Crescent Slash Ribbons — 0% boxGeometry!)
  const slashArcGeometries = useMemo(() => {
    return [-0.16, 0, 0.16].map((offsetX, i) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(offsetX - 0.22, 0.34, 0.18),
        new THREE.Vector3(offsetX - 0.04, 0.08, 0.34 + (i === 1 ? 0.05 : 0)),
        new THREE.Vector3(offsetX + 0.18, -0.26, 0.22),
      ]);
      return new THREE.TubeGeometry(curve, 22, i === 1 ? 0.028 : 0.021, 8, false);
    });
  }, []);

  const wolfSlashMat = useMemo(() => createEnergySlashMaterial("#ef4444", "#fff1f2"), []);
  const shieldDomeMat = useMemo(() => createFresnelShieldMaterial("#38bdf8"), []);

  const sparkSeeds = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        angle: (i / 22) * Math.PI * 2,
        radius: 0.22 + (i % 5) * 0.15,
        speed: 0.68 + (i % 4) * 0.26,
        offset: i * 0.17,
      })),
    []
  );

  useFrame((state) => {
    if (!activeCue || !cueType) return;
    const now = state.clock.elapsedTime;
    if (startClockRef.current.cueId !== activeCue.cueId) {
      startClockRef.current = { cueId: activeCue.cueId, t0: now };
    }
    const elapsed = Math.max(0, now - startClockRef.current.t0);

    // 1. Quả cầu sao băng bay parabol mềm mại
    if (projectileRef.current && targetSeat) {
      const sx = sourceSeat ? sourceSeat.x : 0;
      const sz = sourceSeat ? sourceSeat.z : 0;
      startPos.set(sx, sourceSeat ? 1.12 : 0.72, sz);
      endPos.set(targetSeat.x, 1.08, targetSeat.z);
      midPos.addVectors(startPos, endPos).multiplyScalar(0.5);
      midPos.y = cueType === "wolf_attack" ? 1.68 : 2.38;

      const cycle = (elapsed * 1.15) % 1.38;
      const u = THREE.MathUtils.clamp(cycle / 0.82, 0, 1);
      const oneMinusU = 1 - u;

      tmpPos.set(
        oneMinusU * oneMinusU * startPos.x + 2 * oneMinusU * u * midPos.x + u * u * endPos.x,
        oneMinusU * oneMinusU * startPos.y + 2 * oneMinusU * u * midPos.y + u * u * endPos.y,
        oneMinusU * oneMinusU * startPos.z + 2 * oneMinusU * u * midPos.z + u * u * endPos.z
      );
      projectileRef.current.position.copy(tmpPos);
      projectileRef.current.visible = cycle <= 0.88;

      if (slashGroupRef.current) {
        const slashPhase = THREE.MathUtils.clamp((cycle - 0.66) / 0.58, 0, 1);
        slashGroupRef.current.visible = slashPhase > 0.01 && slashPhase < 0.99;
        wolfSlashMat.uniforms.uProgress.value = slashPhase;
        slashGroupRef.current.scale.setScalar(0.88 + Math.sin(slashPhase * Math.PI) * 0.28);
      }
    }

    // 2. Xoay êm vòng năng lượng & vòm khiên
    if (pulseGroupRef.current) {
      pulseGroupRef.current.rotation.y = now * 1.35;
      const s = 1 + Math.sin(now * 4.2) * 0.05;
      pulseGroupRef.current.scale.set(s, 1, s);
    }

    // 3. Đom đóm sáng bay xoắn ốc lên cao (Additive Glow Sprites mềm 100%, không hạt khối!)
    if (sparksRef.current) {
      sparksRef.current.children.forEach((child, idx) => {
        const meta = sparkSeeds[idx];
        if (!meta) return;
        const p = (now * meta.speed + meta.offset) % 1;
        child.position.set(
          Math.cos(meta.angle + now * 0.85) * meta.radius * (1 + p * 0.45),
          PLAZA_WAVE_Y + p * 2.55,
          Math.sin(meta.angle + now * 0.85) * meta.radius * (1 + p * 0.45)
        );
        const s = Math.max(0.02, Math.sin(p * Math.PI) * 0.34);
        child.scale.set(s, s, 1);
      });
    }
  });

  const goldRingMat = useMemo(() => createGroundAuroraRingMaterial("#fbbf24"), []);
  const crimsonRingMat = useMemo(() => createGroundAuroraRingMaterial("#ef4444"), []);
  const cyanRingMat = useMemo(() => createGroundAuroraRingMaterial("#38bdf8"), []);
  const emeraldRingMat = useMemo(() => createGroundAuroraRingMaterial("#34d399"), []);
  const violetRingMat = useMemo(() => createGroundAuroraRingMaterial("#c084fc"), []);

  if (!activeCue || !cueType) return null;

  // ==================== 1. ĐẠI LỄ MỞ BĂNG GHI HÌNH 8 NHÂN VẬT THẬT ====================
  if (cueType === "reveal_wave") {
    return (
      <group>
        <group ref={pulseGroupRef} position={[0, PLAZA_WAVE_Y, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} material={goldRingMat}>
            <planeGeometry args={[(circleRadius + 0.9) * 2, (circleRadius + 0.9) * 2]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} material={violetRingMat}>
            <planeGeometry args={[3.6, 3.6]} />
          </mesh>
        </group>
        {/* Hạt tinh tú bay lên quanh toàn bộ các ghế khi tháo áo choàng ẩn danh */}
        <group ref={sparksRef} position={[0, 0, 0]}>
          {sparkSeeds.map((_, i) => (
            <sprite key={i}>
              <spriteMaterial
                map={glowTex}
                color={i % 2 === 0 ? "#fde047" : "#c084fc"}
                transparent
                opacity={0.85}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          ))}
        </group>
      </group>
    );
  }

  // ==================== 2A. SÓI RÌNH MỒI / ĐỔI Ý CHỈ MỤC TIÊU / MẬT ĐÀM BẦY SÓI ====================
  if ((cueType === "wolf_aim" || cueType === "wolf_whisper") && (targetSeat || sourceSeat)) {
    return (
      <group>
        {sourceSeat && (
          <mesh
            position={[sourceSeat.x, PLAZA_WAVE_Y, sourceSeat.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={crimsonRingMat}
          >
            <planeGeometry args={[1.65, 1.65]} />
          </mesh>
        )}
        {/* Dấu vết mục tiêu cũ mờ đi khi Sói vừa đổi ý sang con mồi mới! */}
        {prevTargetSeat && targetSeat && prevTargetSeat !== targetSeat && (
          <CurvedArcBeam
            fromSeat={sourceSeat}
            toSeat={prevTargetSeat}
            color="#94a3b8"
            apexY={1.55}
            radius={0.016}
            speed={1.2}
          />
        )}
        {targetSeat && (
          <>
            <CurvedArcBeam
              fromSeat={sourceSeat}
              toSeat={targetSeat}
              color="#f87171"
              apexY={1.72}
              radius={0.026}
              speed={3.2}
            />
            <mesh
              position={[targetSeat.x, PLAZA_WAVE_Y, targetSeat.z]}
              rotation={[-Math.PI / 2, 0, 0]}
              material={crimsonRingMat}
            >
              <planeGeometry args={[1.75, 1.75]} />
            </mesh>
          </>
        )}
      </group>
    );
  }

  // ==================== 2B. ĐÒN SÓI LAO VỒ & 3 LƯỠI VUỐT NĂNG LƯỢNG CONG ====================
  if (cueType === "wolf_attack" && targetSeat) {
    return (
      <group>
        {sourceSeat && (
          <mesh
            position={[sourceSeat.x, PLAZA_WAVE_Y, sourceSeat.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={crimsonRingMat}
          >
            <planeGeometry args={[1.75, 1.75]} />
          </mesh>
        )}

        <CurvedArcBeam
          fromSeat={sourceSeat}
          toSeat={targetSeat}
          color="#ef4444"
          apexY={1.68}
          radius={0.032}
          speed={5.2}
        />

        {/* Đốm lửa sát khí mềm lao vút theo đường cong */}
        <group ref={projectileRef}>
          <sprite scale={[0.92, 0.92, 1]}>
            <spriteMaterial
              map={glowTex}
              color="#ef4444"
              transparent
              opacity={0.95}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
          <sprite scale={[0.42, 0.42, 1]}>
            <spriteMaterial
              map={glowTex}
              color="#ffffff"
              transparent
              opacity={0.95}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        </group>

        {/* 3 Lưỡi Vuốt Năng Lượng Cong Cào Ngang Ngực Nạn Nhân */}
        <group
          ref={slashGroupRef}
          position={[targetSeat.x, 1.08, targetSeat.z]}
          rotation={[0, targetSeat.facingYaw || 0, -0.52]}
        >
          {slashArcGeometries.map((geo, idx) => (
            <mesh key={idx} geometry={geo} material={wolfSlashMat} />
          ))}
          <sprite position={[0, 0.04, 0.28]} scale={[1.25, 1.25, 1]}>
            <spriteMaterial
              map={glowTex}
              color="#f87171"
              transparent
              opacity={0.68}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        </group>

        <mesh
          position={[targetSeat.x, PLAZA_WAVE_Y, targetSeat.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={crimsonRingMat}
        >
          <planeGeometry args={[1.9, 1.9]} />
        </mesh>
      </group>
    );
  }

  // ==================== 3. VÒM KHIÊN NĂNG LƯỢNG FRESNEL BẢO VỆ ====================
  if ((cueType === "guard_block" || cueType === "guard_aim") && targetSeat) {
    return (
      <group>
        {sourceSeat && (
          <CurvedArcBeam
            fromSeat={sourceSeat}
            toSeat={targetSeat}
            color="#38bdf8"
            apexY={2.05}
            radius={0.028}
            speed={3.4}
          />
        )}
        <group ref={pulseGroupRef} position={[targetSeat.x, 0.22, targetSeat.z]}>
          <mesh position={[0, 0.66, 0]} material={shieldDomeMat}>
            <sphereGeometry args={[0.78, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.65]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={cyanRingMat}>
            <planeGeometry args={[1.95, 1.95]} />
          </mesh>
        </group>
        {cueType === "guard_block" && (
          <group ref={sparksRef} position={[targetSeat.x, 0, targetSeat.z]}>
            {sparkSeeds.map((_, i) => (
              <sprite key={i}>
                <spriteMaterial
                  map={glowTex}
                  color={i % 2 === 0 ? "#7dd3fc" : "#fde047"}
                  transparent
                  opacity={0.9}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </sprite>
            ))}
          </group>
        )}
      </group>
    );
  }

  // ==================== 4. SAO BĂNG BÌNH DƯỢC CỨU / ĐỘC DƯỢC PHÙ THỦY ====================
  if ((cueType === "witch_save" || cueType === "witch_poison") && targetSeat) {
    const isSave = cueType === "witch_save";
    const mainColor = isSave ? "#34d399" : "#c084fc";
    const ringMat = isSave ? emeraldRingMat : violetRingMat;

    return (
      <group>
        <CurvedArcBeam
          fromSeat={sourceSeat}
          toSeat={targetSeat}
          color={mainColor}
          apexY={2.42}
          radius={0.03}
          speed={4.2}
        />

        <group ref={projectileRef}>
          <sprite scale={[0.85, 0.85, 1]}>
            <spriteMaterial
              map={glowTex}
              color={mainColor}
              transparent
              opacity={0.95}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        </group>

        <group position={[targetSeat.x, 0, targetSeat.z]}>
          <mesh position={[0, PLAZA_WAVE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={ringMat}>
            <planeGeometry args={[1.95, 1.95]} />
          </mesh>
          <group ref={sparksRef}>
            {sparkSeeds.map((_, i) => (
              <sprite key={i}>
                <spriteMaterial
                  map={glowTex}
                  color={mainColor}
                  transparent
                  opacity={0.88}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </sprite>
            ))}
          </group>
        </group>
      </group>
    );
  }

  // ==================== 5. HỒ QUANG MẮT THẦN TIÊN TRI SOI VAI ====================
  if (cueType === "seer_scan" && targetSeat) {
    const isWolf = Boolean(activeCue.isWolfResult);
    const resultColor = isWolf ? "#ef4444" : "#38bdf8";
    const ringMat = isWolf ? crimsonRingMat : cyanRingMat;

    return (
      <group>
        <CurvedArcBeam
          fromSeat={sourceSeat}
          toSeat={targetSeat}
          color="#c084fc"
          apexY={1.85}
          radius={0.034}
          speed={4.5}
        />

        <group ref={pulseGroupRef} position={[targetSeat.x, 1.78, targetSeat.z]}>
          <sprite scale={[1.15, 1.15, 1]}>
            <spriteMaterial
              map={glowTex}
              color={resultColor}
              transparent
              opacity={0.82}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.36, 0.018, 12, 36]} />
            <meshBasicMaterial color={resultColor} />
          </mesh>
        </group>

        <mesh
          position={[targetSeat.x, PLAZA_WAVE_Y, targetSeat.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={ringMat}
        >
          <planeGeometry args={[1.85, 1.85]} />
        </mesh>
      </group>
    );
  }

  // ==================== 6. HUYẾT NGUYỀN HÓA SÓI / TRÁNG SĨ CỨNG CỎI GỒNG CHỊU ĐÒN ====================
  if ((cueType === "cursed_transform" || cueType === "tough_guy_endure") && targetSeat) {
    const isCursed = cueType === "cursed_transform";
    const subColor = isCursed ? "#ef4444" : "#fb923c";
    const ringMat = isCursed ? violetRingMat : goldRingMat;

    return (
      <group position={[targetSeat.x, 0, targetSeat.z]}>
        <mesh position={[0, PLAZA_WAVE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={ringMat}>
          <planeGeometry args={[2.1, 2.1]} />
        </mesh>
        <sprite position={[0, 1.18, 0]} scale={[1.65, 2.1, 1]}>
          <spriteMaterial
            map={glowTex}
            color={subColor}
            transparent
            opacity={0.62}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
        <group ref={sparksRef}>
          {sparkSeeds.map((_, i) => (
            <sprite key={i}>
              <spriteMaterial
                map={glowTex}
                color={subColor}
                transparent
                opacity={0.9}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          ))}
        </group>
      </group>
    );
  }

  // ==================== 7A. BAN NGÀY: CHỈ TAY ĐỀ CỬ / ĐỔI MŨI DÙI NGHI NGỜ ====================
  if (cueType === "day_point" && targetSeat) {
    const votes = activeCue.votesDetail || {};
    return (
      <group>
        {prevTargetSeat && prevTargetSeat !== targetSeat && (
          <CurvedArcBeam
            fromSeat={sourceSeat}
            toSeat={prevTargetSeat}
            color="#64748b"
            apexY={1.52}
            radius={0.015}
            speed={1.2}
          />
        )}
        {Object.entries(votes).map(([voterId, tid]) => {
          const vSeat = seatMap[voterId];
          const tSeat = seatMap[tid];
          if (!vSeat || !tSeat) return null;
          const isCurrentActor = voterId === activeCue.sourceId;
          return (
            <CurvedArcBeam
              key={voterId}
              fromSeat={vSeat}
              toSeat={tSeat}
              color={isCurrentActor ? "#fbbf24" : "#f97316"}
              apexY={isCurrentActor ? 1.88 : 1.56}
              radius={isCurrentActor ? 0.03 : 0.016}
              speed={isCurrentActor ? 4.4 : 2.2}
            />
          );
        })}
        <mesh
          position={[targetSeat.x, PLAZA_WAVE_Y, targetSeat.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={goldRingMat}
        >
          <planeGeometry args={[1.8, 1.8]} />
        </mesh>
      </group>
    );
  }

  // ==================== 7B. TÒA ÁN PHÁN QUYẾT TREO CỔ / THA BỔNG ====================
  if (cueType === "day_tribunal" && targetSeat) {
    const votes = activeCue.votesDetail || {};
    const isHanged = Boolean(activeCue.isHanged);

    return (
      <group>
        {Object.entries(votes).map(([voterId, decision]) => {
          const vSeat = seatMap[voterId];
          if (!vSeat || voterId === activeCue.targetId) return null;
          return (
            <CurvedArcBeam
              key={voterId}
              fromSeat={vSeat}
              toSeat={targetSeat}
              color={decision === "hang" ? "#ef4444" : "#34d399"}
              apexY={1.76}
              radius={0.022}
              speed={3.8}
            />
          );
        })}

        <mesh
          position={[targetSeat.x, PLAZA_WAVE_Y, targetSeat.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={isHanged ? crimsonRingMat : emeraldRingMat}
        >
          <planeGeometry args={[2.05, 2.05]} />
        </mesh>

        <sprite position={[targetSeat.x, 1.45, targetSeat.z]} scale={[1.5, 2.4, 1]}>
          <spriteMaterial
            map={glowTex}
            color={isHanged ? "#ef4444" : "#34d399"}
            transparent
            opacity={0.55}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      </group>
    );
  }

  // ==================== 8. ĐĂNG QUANG MVP & VINH DANH CUỐI PHIM ====================
  if (cueType === "mvp_crown" && targetSeat) {
    return (
      <group position={[targetSeat.x, 0, targetSeat.z]}>
        <mesh position={[0, PLAZA_WAVE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={goldRingMat}>
          <planeGeometry args={[2.15, 2.15]} />
        </mesh>
        <sprite position={[0, 1.65, 0]} scale={[1.7, 2.9, 1]}>
          <spriteMaterial
            map={glowTex}
            color="#fde047"
            transparent
            opacity={0.58}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
        <group ref={sparksRef}>
          {sparkSeeds.map((_, i) => (
            <sprite key={i}>
              <spriteMaterial
                map={glowTex}
                color="#fde047"
                transparent
                opacity={0.92}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          ))}
        </group>
      </group>
    );
  }

  return null;
}
