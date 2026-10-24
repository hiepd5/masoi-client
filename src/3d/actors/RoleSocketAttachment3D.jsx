import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import {
  ROLE_COSTUME_MANIFEST,
  ensureRoleGlbManifestLoaded,
  getAvailableRoleGlbs,
  subscribeRoleGlbs,
} from "../config/roleCostumeManifest.js";
import { getSoftGlowHaloTexture } from "../shaders/villageCinematicShaders.js";

let sharedRoleLoader = null;
function getRoleGltfLoader() {
  if (!sharedRoleLoader) {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
    loader.setDRACOLoader(draco);
    sharedRoleLoader = loader;
  }
  return sharedRoleLoader;
}

const loadedRoleSceneCache = new Map();

// Các hình học điêu khắc mượt (Lathe / Bezier Tube) tạo 1 lần dùng chung cho cả 18 ghế (0% hình hộp!)
let sharedSculptGeos = null;
function getSharedSculptGeometries() {
  if (sharedSculptGeos) return sharedSculptGeos;

  // 1. Nón Phù Thủy uốn cong mềm mại (Curved Bent Witch Hat)
  const hatPts = [
    new THREE.Vector2(0.28, 0.0),
    new THREE.Vector2(0.18, 0.015),
    new THREE.Vector2(0.135, 0.045),
    new THREE.Vector2(0.105, 0.14),
    new THREE.Vector2(0.062, 0.25),
    new THREE.Vector2(0.018, 0.34),
    new THREE.Vector2(0.002, 0.38),
  ];
  const witchHatGeo = new THREE.LatheGeometry(hatPts, 24);

  // 2. Mũ Rơm Điền Trang Bắc Âu vòm mềm
  const strawPts = [
    new THREE.Vector2(0.255, 0.0),
    new THREE.Vector2(0.16, 0.014),
    new THREE.Vector2(0.125, 0.045),
    new THREE.Vector2(0.105, 0.095),
    new THREE.Vector2(0.055, 0.125),
    new THREE.Vector2(0.0, 0.132),
  ];
  const strawHatGeo = new THREE.LatheGeometry(strawPts, 24);

  // 3. Bình thủy tinh giả kim cổ thon (Smooth Alchemist Flask)
  const flaskPts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.036, 0.008),
    new THREE.Vector2(0.046, 0.038),
    new THREE.Vector2(0.038, 0.072),
    new THREE.Vector2(0.016, 0.095),
    new THREE.Vector2(0.021, 0.112),
    new THREE.Vector2(0.014, 0.118),
  ];
  const flaskGeo = new THREE.LatheGeometry(flaskPts, 18);

  // 4. Sừng uốn cong cho Kẻ Bị Nguyền
  const hornCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.025, 0.055, -0.01),
    new THREE.Vector3(0.048, 0.115, -0.035),
    new THREE.Vector3(0.032, 0.165, -0.055),
  ]);
  const curvedHornGeo = new THREE.TubeGeometry(hornCurve, 14, 0.016, 8, false);

  // 5. Gậy gỗ xoắn Phù Thủy (Gnarled Wand)
  const wandCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.012, 0.08, 0.008),
    new THREE.Vector3(-0.01, 0.17, -0.006),
    new THREE.Vector3(0.006, 0.25, 0.012),
  ]);
  const wandGeo = new THREE.TubeGeometry(wandCurve, 16, 0.013, 8, false);

  sharedSculptGeos = {
    witchHatGeo,
    strawHatGeo,
    flaskGeo,
    curvedHornGeo,
    wandGeo,
  };
  return sharedSculptGeos;
}

function useOptionalRoleGlb(roleKey) {
  const [glbMap, setGlbMap] = useState(() => getAvailableRoleGlbs());
  const [sceneTemplate, setSceneTemplate] = useState(null);

  useEffect(() => {
    ensureRoleGlbManifestLoaded();
    return subscribeRoleGlbs((next) => setGlbMap({ ...next }));
  }, []);

  const glbUrl = roleKey ? glbMap?.[roleKey] : null;

  useEffect(() => {
    if (!glbUrl || !roleKey) {
      setSceneTemplate(null);
      return undefined;
    }
    if (loadedRoleSceneCache.has(glbUrl)) {
      setSceneTemplate(loadedRoleSceneCache.get(glbUrl));
      return undefined;
    }

    let cancelled = false;
    const meta = ROLE_COSTUME_MANIFEST[roleKey] || {};
    const targetSize = meta.headTargetSize || 0.36;

    getRoleGltfLoader().load(
      glbUrl,
      (gltf) => {
        if (cancelled || !gltf?.scene) return;
        const root = gltf.scene.clone(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const scale = targetSize / maxDim;
        const wrapper = new THREE.Group();
        root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
        root.scale.setScalar(scale);
        wrapper.add(root);

        loadedRoleSceneCache.set(glbUrl, wrapper);
        setSceneTemplate(wrapper);
      },
      undefined,
      () => {
        if (!cancelled) setSceneTemplate(null);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [glbUrl, roleKey]);

  return useMemo(() => {
    if (!sceneTemplate) return null;
    return sceneTemplate.clone(true);
  }, [sceneTemplate]);
}

/**
 * SOCKET 1: ĐẠO CỤ / TẠO HÌNH ĐẦU MƯỢT MÀ 8 VAI (0% HÌNH HỘP THÔ)
 */
export function RoleHeadSocket3D({ roleKey, isGhost = false, opacity = 1 }) {
  const glbClone = useOptionalRoleGlb(roleKey);
  const bellRef = useRef(null);
  const geos = useMemo(() => getSharedSculptGeometries(), []);
  const glowTex = useMemo(() => getSoftGlowHaloTexture(), []);

  useFrame((state) => {
    if (bellRef.current) {
      const t = state.clock.elapsedTime;
      bellRef.current.rotation.z = Math.sin(t * 3.8) * 0.1;
    }
  });

  if (!roleKey) return null;

  if (glbClone) {
    const meta = ROLE_COSTUME_MANIFEST[roleKey] || {};
    return <primitive object={glbClone} position={[0, meta.headYOffset ?? 0.16, 0.01]} />;
  }

  switch (roleKey) {
    case "wolf":
      return (
        <group>
          {/* Bờm lông cổ & gáy Sói Bắc Âu mượt mà (không flatShading góc cạnh) */}
          <mesh position={[0, 0.165, -0.035]} scale={[1.22, 1.14, 1.26]}>
            <sphereGeometry args={[0.138, 22, 18]} />
            <meshStandardMaterial
              color={isGhost ? "#38bdf8" : "#1c1518"}
              roughness={0.92}
              transparent={isGhost}
              opacity={opacity}
            />
          </mesh>
          {/* Đôi tai sói thon mượt */}
          {[-1, 1].map((dir) => (
            <group
              key={dir}
              position={[dir * 0.092, 0.305, -0.015]}
              rotation={[-0.1, 0, dir * -0.24]}
            >
              <mesh>
                <coneGeometry args={[0.044, 0.165, 14]} />
                <meshStandardMaterial
                  color={isGhost ? "#0284c7" : "#26191e"}
                  roughness={0.88}
                  transparent={isGhost}
                  opacity={opacity}
                />
              </mesh>
              <mesh position={[0, -0.01, 0.016]} scale={[0.55, 0.72, 0.4]}>
                <coneGeometry args={[0.04, 0.14, 12]} />
                <meshStandardMaterial color="#59222a" roughness={0.85} />
              </mesh>
            </group>
          ))}
          {/* Mõm sói thon tròn + Sống mũi + Răng nanh ngà cong */}
          <mesh position={[0, 0.116, 0.145]} rotation={[Math.PI / 2 - 0.14, 0, 0]} scale={[1, 1, 0.86]}>
            <capsuleGeometry args={[0.048, 0.085, 10, 16]} />
            <meshStandardMaterial
              color={isGhost ? "#0369a1" : "#271d22"}
              roughness={0.82}
              transparent={isGhost}
              opacity={opacity}
            />
          </mesh>
          <mesh position={[0, 0.132, 0.222]}>
            <sphereGeometry args={[0.02, 12, 12]} />
            <meshStandardMaterial color="#09090b" roughness={0.3} />
          </mesh>
          {[-0.026, 0.026].map((fx, fi) => (
            <mesh key={fi} position={[fx, 0.078, 0.188]} rotation={[Math.PI - 0.15, 0, 0]}>
              <coneGeometry args={[0.0085, 0.036, 10]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.25} />
            </mesh>
          ))}
        </group>
      );

    case "guard":
      return (
        <group position={[0, 0.145, 0]}>
          {/* Mũ Sắt Chiến Binh Bắc Âu Vòm Tròn (Nordic Spangenhelm — 0% khối hộp!) */}
          <mesh position={[0, 0.04, 0]} scale={[1.04, 1.08, 1.08]}>
            <sphereGeometry args={[0.142, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            <meshStandardMaterial
              color={isGhost ? "#7dd3fc" : "#64748b"}
              metalness={0.82}
              roughness={0.32}
              transparent={isGhost}
              opacity={opacity}
            />
          </mesh>
          {/* Vòng đai đồng chạm nổi quanh mũ */}
          <mesh position={[0, 0.018, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.141, 0.015, 10, 26]} />
            <meshStandardMaterial color="#d97706" metalness={0.85} roughness={0.28} />
          </mesh>
          {/* Sống mũ đồng chạy dọc đỉnh đầu xuống sống mũi */}
          <mesh position={[0, 0.055, 0.01]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.138, 0.012, 8, 22, Math.PI * 0.92]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.86} roughness={0.26} />
          </mesh>
          {/* Tấm che gò má uốn cong 2 bên */}
          {[-0.128, 0.128].map((cx, ci) => (
            <mesh key={ci} position={[cx, -0.035, 0.035]} rotation={[0.15, ci === 0 ? 0.35 : -0.35, 0]} scale={[0.25, 1, 0.68]}>
              <capsuleGeometry args={[0.048, 0.06, 8, 12]} />
              <meshStandardMaterial color="#475569" metalness={0.78} roughness={0.35} />
            </mesh>
          ))}
        </group>
      );

    case "witch":
      return (
        <group position={[0, 0.22, -0.01]} rotation={[-0.1, 0, 0.04]}>
          <mesh geometry={geos.witchHatGeo}>
            <meshStandardMaterial
              color="#231530"
              roughness={0.86}
              side={THREE.DoubleSide}
              transparent={isGhost}
              opacity={opacity}
            />
          </mesh>
          {/* Dải lụa tím quấn chân nón + Ngọc lục bảo đính trán */}
          <mesh position={[0, 0.032, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.138, 0.018, 10, 24]} />
            <meshStandardMaterial color="#6b21a8" emissive="#7e22ce" emissiveIntensity={0.35} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.036, 0.148]} scale={[0.85, 1.15, 0.55]}>
            <sphereGeometry args={[0.022, 14, 14]} />
            <meshStandardMaterial color="#34d399" emissive="#10b981" emissiveIntensity={1.1} roughness={0.18} />
          </mesh>
        </group>
      );

    case "seer":
      return (
        <group position={[0, 0.155, 0]}>
          {/* Khăn lụa huyền bí bịt ngang mắt thêu ánh sao */}
          <mesh position={[0, 0.002, 0.012]} rotation={[Math.PI / 2, 0, 0]} scale={[1.02, 1.06, 1]}>
            <torusGeometry args={[0.126, 0.026, 10, 26]} />
            <meshStandardMaterial color="#311042" emissive="#581c87" emissiveIntensity={0.45} roughness={0.65} />
          </mesh>
          {/* Vương miện mảnh trăng khuyết vàng + Con mắt thần phát quầng sáng mềm */}
          <mesh position={[0, 0.058, 0]} rotation={[Math.PI / 2 - 0.12, 0, 0]}>
            <torusGeometry args={[0.13, 0.01, 10, 28]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.068, 0.134]} scale={[0.75, 1.15, 0.5]}>
            <sphereGeometry args={[0.024, 16, 16]} />
            <meshStandardMaterial color="#e9d5ff" emissive="#c084fc" emissiveIntensity={1.5} roughness={0.1} />
          </mesh>
          {!isGhost && (
            <sprite position={[0, 0.068, 0.15]} scale={[0.18, 0.18, 1]}>
              <spriteMaterial
                map={glowTex}
                color="#c084fc"
                transparent
                opacity={0.75}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          )}
        </group>
      );

    case "tough_guy":
      return (
        <group position={[0, 0.195, 0]}>
          {/* Đai Trán Da Thuộc Bọc Thép Rèn */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.13, 0.022, 10, 26]} />
            <meshStandardMaterial color="#44403c" metalness={0.72} roughness={0.42} />
          </mesh>
          {[-0.075, 0, 0.075].map((sx, i) => (
            <mesh key={i} position={[sx, 0, 0.138]}>
              <sphereGeometry args={[0.014, 10, 10]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.85} roughness={0.25} />
            </mesh>
          ))}
        </group>
      );

    case "cursed":
      return (
        <group position={[0, 0.15, 0]}>
          {/* Mặt nạ xương cổ đại uốn ôm gương mặt + Đôi sừng cong huyền thuật */}
          <mesh position={[0, 0.005, 0.055]} scale={[0.96, 1.08, 0.72]}>
            <sphereGeometry args={[0.125, 20, 16, 0, Math.PI, 0.2, Math.PI * 0.65]} />
            <meshStandardMaterial
              color="#1f192e"
              roughness={0.78}
              side={THREE.DoubleSide}
              transparent={isGhost}
              opacity={opacity}
            />
          </mesh>
          <mesh geometry={geos.curvedHornGeo} position={[0.055, 0.075, 0.02]} rotation={[0, 0, -0.15]}>
            <meshStandardMaterial color="#3b0764" emissive="#7e22ce" emissiveIntensity={0.6} roughness={0.4} />
          </mesh>
          <mesh
            geometry={geos.curvedHornGeo}
            position={[-0.055, 0.075, 0.02]}
            scale={[-1, 1, 1]}
            rotation={[0, 0, 0.15]}
          >
            <meshStandardMaterial color="#3b0764" emissive="#7e22ce" emissiveIntensity={0.6} roughness={0.4} />
          </mesh>
        </group>
      );

    case "tanner":
      return (
        <group ref={bellRef} position={[0, 0.22, 0]}>
          {/* Mũ vải chắp vá uốn rủ 2 bên kèm lục lạc đồng */}
          {[-1, 1].map((dir) => (
            <group key={dir} position={[dir * 0.08, 0.055, -0.01]} rotation={[-0.15, 0, dir * -0.62]}>
              <mesh>
                <capsuleGeometry args={[0.036, 0.12, 8, 14]} />
                <meshStandardMaterial
                  color={dir < 0 ? "#6b1d2f" : "#334155"}
                  roughness={0.88}
                  transparent={isGhost}
                  opacity={opacity}
                />
              </mesh>
              <mesh position={[0, 0.095, 0]}>
                <sphereGeometry args={[0.022, 12, 12]} />
                <meshStandardMaterial color="#eab308" metalness={0.85} roughness={0.26} />
              </mesh>
            </group>
          ))}
        </group>
      );

    case "villager":
      return (
        <group position={[0, 0.215, 0]}>
          <mesh geometry={geos.strawHatGeo}>
            <meshStandardMaterial
              color="#c89b54"
              roughness={0.92}
              side={THREE.DoubleSide}
              transparent={isGhost}
              opacity={opacity}
            />
          </mesh>
          <mesh position={[0, 0.026, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.132, 0.012, 8, 24]} />
            <meshStandardMaterial color="#7c2d12" roughness={0.88} />
          </mesh>
        </group>
      );

    default:
      return null;
  }
}

/**
 * SOCKET 2: ĐẠO CỤ THÂN / VAI / THẮT LƯNG MƯỢT MÀ 8 VAI
 */
export function RoleTorsoSocket3D({
  roleKey,
  isGhost = false,
  opacity = 1,
  enduringFire = false,
  seed = 0,
}) {
  const orbRef = useRef(null);
  const geos = useMemo(() => getSharedSculptGeometries(), []);
  const glowTex = useMemo(() => getSoftGlowHaloTexture(), []);

  useFrame((state) => {
    if (orbRef.current) {
      const t = state.clock.elapsedTime;
      orbRef.current.position.y = 0.41 + Math.sin(t * 2.6 + seed) * 0.032;
      orbRef.current.rotation.y = t * 1.4;
    }
  });

  if (!roleKey) return null;

  return (
    <group>
      {/* TIÊN TRI: Quả Cầu Pha Lê Huyền Ảnh + Quầng Sáng Mềm */}
      {roleKey === "seer" && (
        <group ref={orbRef} position={[0, 0.41, 0.27]}>
          <mesh>
            <sphereGeometry args={[0.066, 20, 20]} />
            <meshStandardMaterial
              color="#e9d5ff"
              emissive="#9333ea"
              emissiveIntensity={1.25}
              transparent
              opacity={isGhost ? 0.45 : 0.88}
              roughness={0.08}
            />
          </mesh>
          <mesh rotation={[Math.PI / 3, 0.4, 0]}>
            <torusGeometry args={[0.095, 0.007, 8, 28]} />
            <meshStandardMaterial color="#fde047" metalness={0.88} roughness={0.2} />
          </mesh>
          {!isGhost && (
            <sprite scale={[0.32, 0.32, 1]}>
              <spriteMaterial
                map={glowTex}
                color="#c084fc"
                transparent
                opacity={0.65}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          )}
        </group>
      )}

      {/* PHÙ THỦY: 2 Bình Thủy Tinh Giả Kim Đeo Hông (Xanh Cứu & Tím Độc) */}
      {roleKey === "witch" && !isGhost && (
        <group position={[0, 0.175, 0.175]}>
          <group position={[-0.088, 0, 0]} rotation={[0, 0, 0.18]}>
            <mesh geometry={geos.flaskGeo}>
              <meshStandardMaterial
                color="#34d399"
                emissive="#10b981"
                emissiveIntensity={1.15}
                roughness={0.14}
                transparent
                opacity={0.92}
              />
            </mesh>
            <sprite position={[0, 0.045, 0.02]} scale={[0.16, 0.16, 1]}>
              <spriteMaterial
                map={glowTex}
                color="#34d399"
                transparent
                opacity={0.55}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          </group>
          <group position={[0.088, 0, 0]} rotation={[0, 0, -0.18]}>
            <mesh geometry={geos.flaskGeo}>
              <meshStandardMaterial
                color="#c084fc"
                emissive="#9333ea"
                emissiveIntensity={1.15}
                roughness={0.14}
                transparent
                opacity={0.92}
              />
            </mesh>
            <sprite position={[0, 0.045, 0.02]} scale={[0.16, 0.16, 1]}>
              <spriteMaterial
                map={glowTex}
                color="#c084fc"
                transparent
                opacity={0.55}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          </group>
        </group>
      )}

      {/* TRÁNG SĨ CỨNG CỎI: Giáp Vai Thép Uốn Vòm + Quầng Lửa Chịu Đòn */}
      {roleKey === "tough_guy" && (
        <group>
          {[-0.215, 0.215].map((px, pi) => (
            <group key={pi} position={[px, 0.49, 0]}>
              <mesh rotation={[0, 0, pi === 0 ? 0.38 : -0.38]} scale={[1.1, 0.85, 1.08]}>
                <sphereGeometry args={[0.098, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
                <meshStandardMaterial
                  color="#57534e"
                  metalness={0.82}
                  roughness={0.32}
                  emissive={enduringFire ? "#ea580c" : "#000000"}
                  emissiveIntensity={enduringFire ? 0.9 : 0}
                  transparent={isGhost}
                  opacity={opacity}
                />
              </mesh>
            </group>
          ))}
          {enduringFire && (
            <sprite position={[0, 0.36, 0.08]} scale={[0.72, 0.72, 1]}>
              <spriteMaterial
                map={glowTex}
                color="#fb923c"
                transparent
                opacity={0.68}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          )}
        </group>
      )}

      {/* KẺ BỊ NGUYỀN: Vòng Xích Cổ Ngữ Tím Quanh Vai */}
      {roleKey === "cursed" && (
        <mesh position={[0, 0.47, 0]} rotation={[Math.PI / 2 + 0.14, 0, 0]}>
          <torusGeometry args={[0.245, 0.012, 10, 28]} />
          <meshStandardMaterial color="#a855f7" emissive="#7e22ce" emissiveIntensity={0.95} roughness={0.3} />
        </mesh>
      )}

      {/* KẺ CHÁN ĐỜI: Vòng Dây Thừng Bện Quấn Quanh Vai Cổ */}
      {roleKey === "tanner" && (
        <group position={[0, 0.55, 0.01]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.148, 0.021, 10, 24]} />
            <meshStandardMaterial color="#92400e" roughness={0.95} transparent={isGhost} opacity={opacity} />
          </mesh>
          <mesh position={[0.045, -0.075, 0.142]} rotation={[0.15, 0, -0.1]}>
            <capsuleGeometry args={[0.015, 0.095, 6, 10]} />
            <meshStandardMaterial color="#78350f" roughness={0.95} />
          </mesh>
        </group>
      )}

      {/* DÂN LÀNG: Đèn Bão Lửa Ấm Đeo Hông */}
      {roleKey === "villager" && !isGhost && (
        <group position={[-0.165, 0.185, 0.125]}>
          <mesh>
            <capsuleGeometry args={[0.028, 0.036, 8, 14]} />
            <meshStandardMaterial color="#fde68a" emissive="#f59e0b" emissiveIntensity={1.35} roughness={0.2} />
          </mesh>
          <sprite scale={[0.22, 0.22, 1]}>
            <spriteMaterial
              map={glowTex}
              color="#fbbf24"
              transparent
              opacity={0.62}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        </group>
      )}
    </group>
  );
}

/**
 * SOCKET 3: ĐẠO CỤ CẦM TAY ĐIÊU KHẮC MƯỢT
 */
export function RoleHandSocket3D({ roleKey, side = "left", isGhost = false, opacity = 1 }) {
  const geos = useMemo(() => getSharedSculptGeometries(), []);
  const glowTex = useMemo(() => getSoftGlowHaloTexture(), []);

  if (!roleKey) return null;

  if (roleKey === "wolf") {
    return (
      <group position={[0, -0.38, 0.03]}>
        {[-0.024, 0, 0.024].map((cx, ci) => (
          <mesh key={ci} position={[cx, -0.038, 0.03]} rotation={[2.32, 0, 0]}>
            <coneGeometry args={[0.0085, 0.082, 10]} />
            <meshStandardMaterial
              color={isGhost ? "#7dd3fc" : "#f1f5f9"}
              emissive={isGhost ? "#0ea5e9" : "#dc2626"}
              emissiveIntensity={0.45}
              metalness={0.7}
              roughness={0.22}
            />
          </mesh>
        ))}
      </group>
    );
  }

  // BẢO VỆ: Khiên Tròn Bắc Âu Vòm Nổi Bọc Viền Thép (Viking Round Targe)
  if (roleKey === "guard" && side === "left") {
    return (
      <group position={[0.085, -0.25, 0.065]} rotation={[0.22, 0.38, 0]}>
        <mesh rotation={[0, 0, -Math.PI / 2]} scale={[1, 0.22, 1]}>
          <sphereGeometry args={[0.205, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
          <meshStandardMaterial
            color="#1e3a5f"
            roughness={0.68}
            metalness={0.28}
            side={THREE.DoubleSide}
            transparent={isGhost}
            opacity={opacity}
          />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.2, 0.016, 10, 28]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.26} />
        </mesh>
        <mesh position={[0.032, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <sphereGeometry args={[0.052, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.88} roughness={0.22} />
        </mesh>
      </group>
    );
  }

  // PHÙ THỦY: Trượng Gỗ Xoắn Đính Tinh Cầu Lục Bảo
  if (roleKey === "witch" && side === "right" && !isGhost) {
    return (
      <group position={[0, -0.37, 0.045]} rotation={[1.22, 0, 0]}>
        <mesh geometry={geos.wandGeo}>
          <meshStandardMaterial color="#3b2314" roughness={0.88} />
        </mesh>
        <mesh position={[0.006, 0.265, 0.012]}>
          <sphereGeometry args={[0.028, 16, 16]} />
          <meshStandardMaterial color="#6ee7b7" emissive="#10b981" emissiveIntensity={1.4} roughness={0.12} />
        </mesh>
        <sprite position={[0.006, 0.265, 0.012]} scale={[0.18, 0.18, 1]}>
          <spriteMaterial
            map={glowTex}
            color="#34d399"
            transparent
            opacity={0.7}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      </group>
    );
  }

  return null;
}

/**
 * Đom Đóm Sương Ngủ Đêm Mềm Mại (Soft Glowing Sprites — 0% hạt đa giác cứng!)
 */
export function SleepingMotes3D({ seed = 0 }) {
  const groupRef = useRef(null);
  const glowTex = useMemo(() => getSoftGlowHaloTexture(), []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, idx) => {
      const phase = (t * 0.52 + idx * 0.33 + seed) % 1;
      child.position.y = 0.3 + phase * 0.36;
      child.position.x = Math.sin(phase * Math.PI * 2 + seed) * 0.075;
      const s = Math.sin(phase * Math.PI) * (0.08 + idx * 0.028);
      child.scale.set(Math.max(0.01, s), Math.max(0.01, s), 1);
    });
  });

  return (
    <group ref={groupRef} position={[0.08, 0.12, 0.08]}>
      {[0, 1, 2].map((i) => (
        <sprite key={i}>
          <spriteMaterial
            map={glowTex}
            color="#93c5fd"
            transparent
            opacity={0.75}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}
