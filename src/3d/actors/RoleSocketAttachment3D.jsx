import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
  ROLE_COSTUME_MANIFEST,
  ensureRoleGlbManifestLoaded,
  getAvailableRoleGlbs,
  subscribeRoleGlbs,
} from "../config/roleCostumeManifest.js";
import {
  get3DModelRenderMode,
  subscribe3DModelRenderMode,
} from "../config/seasonalEventRegistry.js";
import { ASSET_SYNC_VERSION } from "../config/propManifest.js";
import { getSoftGlowHaloTexture } from "../shaders/villageCinematicShaders.js";

function withAssetVersion(url) {
  if (!url) return null;
  return url.includes("?") ? url : `${url}?v=${ASSET_SYNC_VERSION}`;
}

let sharedRoleLoader = null;
function getRoleGltfLoader() {
  if (!sharedRoleLoader) {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);
    sharedRoleLoader = loader;
  }
  return sharedRoleLoader;
}

const loadedRoleSceneCache = new Map();
const loadedHandPropSceneCache = new Map();

const HAND_PROP_TARGET_SIZES = {
  guard_shield: 0.44,
  witch_elixir: 0.16,
  witch_poison: 0.16,
  seer_orb: 0.2,
  trial_torch: 0.48,
  tanner_noose: 0.28,
  // === 3 CỔNG VŨ KHÍ CẦM TAY MỚI V3.3 (#25 -> #27 — HOT-PLUG READY) ===
  hunter_crossbow: 0.44,
  cupid_bow: 0.56,
  mayor_scepter: 0.62,
};

let availableHandGlbs = {};
let handManifestPromise = null;
const handGlbListeners = new Set();

function notifyHandGlbListeners() {
  handGlbListeners.forEach((fn) => {
    try {
      fn(availableHandGlbs);
    } catch {
      // ignore
    }
  });
}

export function getAvailableHandPropKeys() {
  return Object.keys(availableHandGlbs);
}

export function subscribeHandPropManifest(fn) {
  handGlbListeners.add(fn);
  return () => handGlbListeners.delete(fn);
}

export function ensureHandPropManifestLoaded({ force = false } = {}) {
  if (handManifestPromise && !force) return handManifestPromise;
  if (force) {
    loadedHandPropSceneCache.clear();
  }
  const parseDoc = async (res) => {
    if (!res?.ok) return null;
    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    if (!ctype.includes("json")) return null;
    return await res.json();
  };

  const manifestUrl = `/models/hand_props/hand_props_manifest.json?v=${ASSET_SYNC_VERSION}`;
  const fetchTask = import.meta.env?.DEV
    ? fetch(`http://${window.location.hostname || "localhost"}:3001/api/hand-prop-models`, {
        cache: "no-store",
      })
        .then(parseDoc)
        .catch(() => null)
        .then(
          (doc) =>
            doc ||
            fetch(manifestUrl, { cache: "no-store" })
              .then(parseDoc)
              .catch(() => null)
        )
    : fetch(manifestUrl).then(parseDoc).catch(() => null);

  handManifestPromise = fetchTask.then((doc) => {
    if (doc?.handProps && typeof doc.handProps === "object") {
      availableHandGlbs = doc.handProps;
      notifyHandGlbListeners();
    }
    return availableHandGlbs;
  });
  return handManifestPromise;
}

function useOptionalHandPropGlb(handKey) {
  const [glbMap, setGlbMap] = useState(() => availableHandGlbs);
  const [renderMode, setRenderMode] = useState(() => get3DModelRenderMode());
  const [sceneTemplate, setSceneTemplate] = useState(null);

  useEffect(() => {
    ensureHandPropManifestLoaded();
    const cb = (next) => setGlbMap({ ...next });
    handGlbListeners.add(cb);
    const unsubMode = subscribe3DModelRenderMode((m) => setRenderMode(m));
    return () => {
      handGlbListeners.delete(cb);
      unsubMode();
    };
  }, []);

  const glbUrl = withAssetVersion(
    handKey && renderMode !== "procedural_classic" ? glbMap?.[handKey] : null
  );

  useEffect(() => {
    if (!glbUrl || !handKey) {
      setSceneTemplate(null);
      return undefined;
    }
    if (loadedHandPropSceneCache.has(glbUrl)) {
      setSceneTemplate(loadedHandPropSceneCache.get(glbUrl));
      return undefined;
    }

    let cancelled = false;
    const targetSize = HAND_PROP_TARGET_SIZES[handKey] || 0.28;

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
        // Căn tâm 3 trục về đúng điểm cầm nắm (Grip Pivot 0,0,0) theo chuẩn Art Bible
        root.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        root.scale.setScalar(scale);
        wrapper.add(root);

        loadedHandPropSceneCache.set(glbUrl, wrapper);
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
  }, [glbUrl, handKey]);

  return useMemo(() => {
    if (!sceneTemplate) return null;
    return sceneTemplate.clone(true);
  }, [sceneTemplate]);
}

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

  // 6. Cánh Nỏ Bạc Thợ Săn uốn cong thép rèn (#25 Proxy Sculpt — 0% khối hộp!)
  const crossbowLimbCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.17, 0.0, -0.05),
    new THREE.Vector3(-0.09, 0.0, 0.015),
    new THREE.Vector3(0.0, 0.0, 0.03),
    new THREE.Vector3(0.09, 0.0, 0.015),
    new THREE.Vector3(0.17, 0.0, -0.05),
  ]);
  const crossbowProdGeo = new THREE.TubeGeometry(crossbowLimbCurve, 20, 0.012, 8, false);

  // 7. Thân Cung Pha Lê Tơ Hồng Cupid uốn lượn cánh thiên nga (#26 Proxy Sculpt)
  const cupidBowCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, -0.24, -0.045),
    new THREE.Vector3(0.0, -0.14, 0.055),
    new THREE.Vector3(0.0, 0.0, 0.085),
    new THREE.Vector3(0.0, 0.14, 0.055),
    new THREE.Vector3(0.0, 0.24, -0.045),
  ]);
  const cupidBowGeo = new THREE.TubeGeometry(cupidBowCurve, 24, 0.013, 10, false);

  // 8. Sừng Thép Huyết Nguyệt cho Vương Miện Sói Đầu Đàn (#21 Proxy Sculpt)
  const alphaAntlerCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, 0.0, 0.0),
    new THREE.Vector3(0.035, 0.075, -0.01),
    new THREE.Vector3(0.072, 0.155, -0.025),
    new THREE.Vector3(0.045, 0.23, -0.01),
  ]);
  const alphaAntlerGeo = new THREE.TubeGeometry(alphaAntlerCurve, 16, 0.015, 8, false);

  // 9. Thân Quyền Trượng Hoàng Kim Trưởng Làng tiện tròn (#27 Proxy Sculpt)
  const scepterPts = [
    new THREE.Vector2(0.008, 0.0),
    new THREE.Vector2(0.016, 0.04),
    new THREE.Vector2(0.013, 0.22),
    new THREE.Vector2(0.018, 0.38),
    new THREE.Vector2(0.028, 0.44),
    new THREE.Vector2(0.012, 0.46),
  ];
  const scepterShaftGeo = new THREE.LatheGeometry(scepterPts, 18);

  sharedSculptGeos = {
    witchHatGeo,
    strawHatGeo,
    flaskGeo,
    curvedHornGeo,
    wandGeo,
    crossbowProdGeo,
    cupidBowGeo,
    alphaAntlerGeo,
    scepterShaftGeo,
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

  const glbUrl = withAssetVersion(roleKey ? glbMap?.[roleKey] : null);

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
 * SOCKET 1: ĐẠO CỤ / TẠO HÌNH ĐẦU MƯỢT MÀ 12 VAI × 3 VŨ TRỤ (CLASSIC | OFFICE | SCHOOL)
 */
export function RoleHeadSocket3D({
  roleKey,
  isGhost = false,
  opacity = 1,
  universeId = "classic",
}) {
  const glbClone = useOptionalRoleGlb(universeId === "classic" ? roleKey : null);
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

  // ==================== ĐẠO CỤ ĐẦU 3D VŨ TRỤ CÔNG SỞ (OFFICE) ====================
  if (universeId === "office") {
    switch (roleKey) {
      case "wolf":
      case "alpha_wolf":
        return (
          <group position={[0, 0.15, 0.135]}>
            {/* Kính Râm Đen Sếp Tổng Vi Hành / Vương Miện Chủ Tịch */}
            {[-0.044, 0.044].map((gx, gi) => (
              <mesh key={gi} position={[gx, 0, 0]}>
                <boxGeometry args={[0.056, 0.03, 0.014]} />
                <meshStandardMaterial color="#09090b" metalness={0.9} roughness={0.12} transparent={isGhost} opacity={opacity} />
              </mesh>
            ))}
            <mesh position={[0, 0.006, 0]}>
              <boxGeometry args={[0.036, 0.006, 0.012]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.92} roughness={0.18} />
            </mesh>
            {roleKey === "alpha_wolf" && (
              <mesh position={[0, 0.135, -0.12]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.11, 0.014, 10, 24]} />
                <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.85} metalness={0.92} roughness={0.16} />
              </mesh>
            )}
          </group>
        );
      case "seer":
        return (
          <group position={[0, 0.165, 0.01]}>
            {/* Tai nghe chụp đầu Cyan Chuyên Viên IT + Kính chống ánh sáng xanh */}
            <mesh rotation={[0, 0, 0]} scale={[1.04, 1.06, 0.9]}>
              <torusGeometry args={[0.136, 0.012, 8, 24, Math.PI]} />
              <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.3} />
            </mesh>
            {[-0.136, 0.136].map((hx, hi) => (
              <mesh key={hi} position={[hx, -0.025, 0.01]} rotation={[0, Math.PI / 2, 0]}>
                <cylinderGeometry args={[0.036, 0.036, 0.028, 14]} />
                <meshStandardMaterial color="#0284c7" emissive="#38bdf8" emissiveIntensity={1.1} roughness={0.2} />
              </mesh>
            ))}
          </group>
        );
      case "witch":
        return (
          <group position={[0, 0.152, 0.134]}>
            {/* Gọng Kính Mắt Mèo Vàng Kim Chị Kế Toán Trưởng */}
            {[-0.044, 0.044].map((gx, gi) => (
              <mesh key={gi} position={[gx, 0, 0]}>
                <torusGeometry args={[0.024, 0.004, 8, 18]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.2} />
              </mesh>
            ))}
          </group>
        );
      case "mayor":
        return (
          <group position={[0, 0.285, 0.02]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.11, 0.012, 10, 26]} />
              <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={1.1} metalness={0.9} roughness={0.18} />
            </mesh>
          </group>
        );
      case "cursed":
        return (
          <group position={[0.03, 0.295, 0.02]}>
            {/* Mầm cây Thực Tập Sinh Cơ Hội trên đỉnh đầu */}
            <mesh position={[0, 0.025, 0]}>
              <cylinderGeometry args={[0.005, 0.005, 0.05, 6]} />
              <meshStandardMaterial color="#16a34a" />
            </mesh>
            {[-0.022, 0.022].map((lx, li) => (
              <mesh key={li} position={[lx, 0.052, 0]} rotation={[0, 0, li === 0 ? 0.55 : -0.55]} scale={[1.3, 0.45, 0.7]}>
                <sphereGeometry args={[0.02, 10, 8]} />
                <meshStandardMaterial color="#4ade80" emissive="#22c55e" emissiveIntensity={0.45} />
              </mesh>
            ))}
          </group>
        );
      case "cupid":
        return (
          <group position={[0, 0.28, 0.03]}>
            <mesh scale={[1.1, 1.1, 0.55]}>
              <octahedronGeometry args={[0.028, 0]} />
              <meshStandardMaterial color="#f9a8d4" emissive="#ec4899" emissiveIntensity={1.4} />
            </mesh>
          </group>
        );
      case "tanner":
        return (
          <group position={[0, 0.235, 0.08]} rotation={[-0.35, 0, 0]}>
            {/* Kính Mát Du Lịch Biển Cài Trán của Thánh Săn Đền Bù */}
            {[-0.042, 0.042].map((gx, gi) => (
              <mesh key={gi} position={[gx, 0, 0]}>
                <sphereGeometry args={[0.024, 12, 10]} />
                <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={0.5} metalness={0.7} roughness={0.2} />
              </mesh>
            ))}
          </group>
        );
      default:
        return null;
    }
  }

  // ==================== ĐẠO CỤ ĐẦU 3D VŨ TRỤ HỌC ĐƯỜNG (SCHOOL) ====================
  if (universeId === "school") {
    switch (roleKey) {
      case "wolf":
      case "alpha_wolf":
        return (
          <group position={[0, 0.152, 0.135]}>
            {/* Kính Gọng Sừng Nghiêm Khắc Cô Chủ Nhiệm / Kính Đen Thầy Giám Thị */}
            {[-0.044, 0.044].map((gx, gi) => (
              <mesh key={gi} position={[gx, 0, 0]}>
                {roleKey === "alpha_wolf" ? (
                  <boxGeometry args={[0.056, 0.032, 0.014]} />
                ) : (
                  <torusGeometry args={[0.025, 0.0045, 8, 18]} />
                )}
                <meshStandardMaterial
                  color={roleKey === "alpha_wolf" ? "#0f172a" : "#7f1d1d"}
                  metalness={0.85}
                  roughness={0.18}
                />
              </mesh>
            ))}
          </group>
        );
      case "seer":
        return (
          <group position={[0, 0.255, 0.01]} rotation={[-0.08, 0, 0.1]}>
            {/* Mũ Ca-lô Sao Đỏ Trực Tuần Đính Sao Vàng */}
            <mesh scale={[0.92, 0.48, 1.18]}>
              <sphereGeometry args={[0.125, 18, 12]} />
              <meshStandardMaterial color="#dc2626" roughness={0.62} />
            </mesh>
            <mesh position={[0, 0.01, 0.135]}>
              <octahedronGeometry args={[0.02, 0]} />
              <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={1.1} />
            </mesh>
          </group>
        );
      case "mayor":
        return (
          <group position={[0, 0.295, 0.03]}>
            {/* Ngôi Sao Vàng Lớp Trưởng Gương Mẫu Lơ Lửng */}
            <mesh>
              <octahedronGeometry args={[0.034, 0]} />
              <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={1.35} metalness={0.85} roughness={0.15} />
            </mesh>
          </group>
        );
      case "tough_guy":
        return (
          <group position={[0, 0.285, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.115, 0.012, 8, 24]} />
              <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.95} />
            </mesh>
          </group>
        );
      case "cupid":
        return (
          <group position={[0, 0.28, 0.03]}>
            <mesh scale={[1.1, 1.1, 0.55]}>
              <octahedronGeometry args={[0.028, 0]} />
              <meshStandardMaterial color="#f9a8d4" emissive="#ec4899" emissiveIntensity={1.4} />
            </mesh>
          </group>
        );
      default:
        return null;
    }
  }

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

    case "hunter":
      return (
        <group position={[0, 0.195, 0]} rotation={[-0.06, 0, 0]}>
          {/* Mũ Da Ba Góc Thợ Săn Bạc Bắc Âu + Lông chim xanh ngọc + Huy hiệu mũi tên bạc */}
          <mesh scale={[1.08, 0.42, 1.18]}>
            <cylinderGeometry args={[0.11, 0.22, 0.12, 3]} />
            <meshStandardMaterial
              color={isGhost ? "#38bdf8" : "#1f2922"}
              roughness={0.78}
              transparent={isGhost}
              opacity={opacity}
            />
          </mesh>
          <mesh position={[0, 0.045, 0]}>
            <sphereGeometry args={[0.112, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
            <meshStandardMaterial color="#143326" roughness={0.82} />
          </mesh>
          <mesh position={[0.105, 0.085, -0.035]} rotation={[-0.45, 0, -0.35]} scale={[0.35, 1.25, 0.65]}>
            <coneGeometry args={[0.034, 0.16, 10]} />
            <meshStandardMaterial color="#10b981" emissive="#059669" emissiveIntensity={0.45} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.028, 0.155]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.02, 0.045, 8]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.92} roughness={0.18} />
          </mesh>
        </group>
      );

    case "cupid":
      return (
        <group position={[0, 0.225, 0]}>
          {/* Vòng Nguyệt Quế Vàng Hồng Lơ Lửng + Tinh Thể Trái Tim Pha Lê */}
          <mesh rotation={[Math.PI / 2 - 0.18, 0, 0]}>
            <torusGeometry args={[0.135, 0.012, 10, 28]} />
            <meshStandardMaterial
              color="#fbcfe8"
              emissive="#ec4899"
              emissiveIntensity={0.95}
              metalness={0.85}
              roughness={0.18}
            />
          </mesh>
          <mesh position={[0, 0.035, 0.128]} scale={[1.1, 1.1, 0.6]}>
            <octahedronGeometry args={[0.028, 0]} />
            <meshStandardMaterial color="#f9a8d4" emissive="#ec4899" emissiveIntensity={1.6} roughness={0.1} />
          </mesh>
          {!isGhost && (
            <sprite position={[0, 0.035, 0.135]} scale={[0.24, 0.24, 1]}>
              <spriteMaterial
                map={glowTex}
                color="#f472b6"
                transparent
                opacity={0.78}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          )}
        </group>
      );

    case "alpha_wolf":
      return (
        <group position={[0, 0.21, 0]}>
          {/* Vương Miện Thép Đen Sừng Huyết Nguyệt Của Sói Đầu Đàn (#21) */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.138, 0.018, 10, 24]} />
            <meshStandardMaterial color="#18181b" metalness={0.88} roughness={0.32} />
          </mesh>
          <mesh geometry={geos.alphaAntlerGeo} position={[0.068, 0.01, -0.01]} rotation={[0, 0, -0.18]}>
            <meshStandardMaterial color="#27272a" emissive="#991b1b" emissiveIntensity={0.55} metalness={0.75} roughness={0.35} />
          </mesh>
          <mesh
            geometry={geos.alphaAntlerGeo}
            position={[-0.068, 0.01, -0.01]}
            scale={[-1, 1, 1]}
            rotation={[0, 0, 0.18]}
          >
            <meshStandardMaterial color="#27272a" emissive="#991b1b" emissiveIntensity={0.55} metalness={0.75} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.038, 0.145]} scale={[0.8, 1.3, 0.6]}>
            <octahedronGeometry args={[0.028, 0]} />
            <meshStandardMaterial color="#fca5a5" emissive="#dc2626" emissiveIntensity={1.85} roughness={0.12} />
          </mesh>
        </group>
      );

    case "mayor":
      return (
        <group position={[0, 0.19, 0]}>
          {/* Mũ Lông Gấu Đai Vàng Chạm Nổi Bậc Trưởng Làng (#22) */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.134, 0.028, 12, 26]} />
            <meshStandardMaterial color="#3f271d" roughness={0.92} />
          </mesh>
          <mesh position={[0, 0.042, 0]}>
            <sphereGeometry args={[0.122, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
            <meshStandardMaterial color="#7f1d1d" roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.022, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.142, 0.01, 8, 26]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.92} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.032, 0.148]}>
            <sphereGeometry args={[0.024, 14, 14]} />
            <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={1.2} metalness={0.85} roughness={0.18} />
          </mesh>
        </group>
      );

    case "villager_female":
      return (
        <group position={[0, 0.165, 0]}>
          {/* Khăn Choàng Len Đỏ Mận Bắc Âu + 2 Bím Tóc Tết Thôn Nữ (#23) */}
          <mesh position={[0, 0.02, -0.012]} scale={[1.06, 1.08, 1.12]}>
            <sphereGeometry args={[0.136, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.65]} />
            <meshStandardMaterial color="#881337" roughness={0.88} side={THREE.DoubleSide} />
          </mesh>
          {[-0.11, 0.11].map((bx, bi) => (
            <mesh key={bi} position={[bx, -0.085, 0.035]} rotation={[0.18, 0, bi === 0 ? 0.15 : -0.15]}>
              <capsuleGeometry args={[0.022, 0.11, 8, 12]} />
              <meshStandardMaterial color="#92400e" roughness={0.85} />
            </mesh>
          ))}
        </group>
      );

    case "villager_elder":
      return (
        <group position={[0, 0.165, 0]}>
          {/* Mũ Dạ Xám & Chòm Râu Bạc Tết Đai Đồng Của Bô Lão (#24) */}
          <mesh position={[0, 0.038, 0]}>
            <sphereGeometry args={[0.132, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
            <meshStandardMaterial color="#475569" roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.115, 0.11]} rotation={[0.25, 0, 0]}>
            <coneGeometry args={[0.058, 0.15, 12]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.86} />
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
  universeId = "classic",
  choreoActionType = null,
}) {
  const orbRef = useRef(null);
  const geos = useMemo(() => getSharedSculptGeometries(), []);
  const glowTex = useMemo(() => getSoftGlowHaloTexture(), []);
  const isClassic = universeId === "classic";
  const seerOrbGlb = useOptionalHandPropGlb(isClassic && roleKey === "seer" ? "seer_orb" : null);
  const witchElixirGlb = useOptionalHandPropGlb(isClassic && roleKey === "witch" && !isGhost ? "witch_elixir" : null);
  const witchPoisonGlb = useOptionalHandPropGlb(isClassic && roleKey === "witch" && !isGhost ? "witch_poison" : null);
  const tannerNooseGlb = useOptionalHandPropGlb(isClassic && roleKey === "tanner" ? "tanner_noose" : null);

  useFrame((state) => {
    if (orbRef.current) {
      const t = state.clock.elapsedTime;
      orbRef.current.position.y = 0.41 + Math.sin(t * 2.6 + seed) * 0.032;
      orbRef.current.rotation.y = isClassic ? t * 1.4 : Math.sin(t * 1.5) * 0.25;
    }
  });

  if (!roleKey && !(universeId === "office" && choreoActionType === "gallows_walk_hang")) return null;

  if (!isClassic) {
    const isOffice = universeId === "office";
    return (
      <group>
        {/* Thùng Carton Bàn Giao Đồ Cá Nhân 3D khi Nhân Viên bị biểu quyết điều chuyển công tác (`gallows_walk_hang`) */}
        {isOffice && choreoActionType === "gallows_walk_hang" && !isGhost && (
          <group position={[0, 0.28, 0.25]}>
            {/* Thân thùng Carton giấy Kraft */}
            <mesh castShadow>
              <boxGeometry args={[0.32, 0.22, 0.24]} />
              <meshStandardMaterial color="#d97706" roughness={0.82} />
            </mesh>
            {/* Băng keo dán ngang thùng */}
            <mesh position={[0, -0.02, 0.122]}>
              <boxGeometry args={[0.325, 0.036, 0.006]} />
              <meshStandardMaterial color="#fef3c7" roughness={0.65} />
            </mesh>
            {/* Chậu sen đá nhỏ + Cốc cà phê thò lên miệng thùng */}
            <mesh position={[-0.075, 0.135, 0]}>
              <cylinderGeometry args={[0.042, 0.032, 0.065, 10]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.35} />
            </mesh>
            <mesh position={[0.075, 0.145, 0.01]}>
              <sphereGeometry args={[0.052, 12, 10]} />
              <meshStandardMaterial color="#22c55e" roughness={0.6} />
            </mesh>
          </group>
        )}

        {/* Thẻ Nhân Viên / Còi Giám Thị / Băng Đỏ Sao Đỏ đeo ngực/tay */}
        {(roleKey === "wolf" || roleKey === "alpha_wolf" || roleKey === "villager") && !isGhost && (
          <group position={[0.075, 0.34, 0.155]}>
            <mesh>
              <boxGeometry args={[0.052, 0.072, 0.01]} />
              <meshStandardMaterial
                color={roleKey === "villager" ? "#38bdf8" : "#ef4444"}
                emissive={roleKey === "villager" ? "#0284c7" : "#dc2626"}
                emissiveIntensity={0.65}
              />
            </mesh>
          </group>
        )}

        {/* IT Laptop Hologram / Kính Lúp Sao Đỏ lơ lửng trước ngực */}
        {roleKey === "seer" && (
          <group ref={orbRef} position={[0, 0.41, 0.28]}>
            {isOffice ? (
              <group rotation={[-0.28, 0, 0]}>
                <mesh>
                  <boxGeometry args={[0.2, 0.13, 0.012]} />
                  <meshStandardMaterial color="#0ea5e9" emissive="#38bdf8" emissiveIntensity={1.25} roughness={0.15} />
                </mesh>
                <mesh position={[0, -0.07, 0.055]} rotation={[1.25, 0, 0]}>
                  <boxGeometry args={[0.2, 0.12, 0.01]} />
                  <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.28} />
                </mesh>
              </group>
            ) : (
              <group>
                <mesh>
                  <torusGeometry args={[0.068, 0.011, 10, 24]} />
                  <meshStandardMaterial color="#fbbf24" metalness={0.88} roughness={0.2} />
                </mesh>
                <mesh>
                  <circleGeometry args={[0.064, 20]} />
                  <meshBasicMaterial color="#bae6fd" transparent opacity={0.62} side={THREE.DoubleSide} />
                </mesh>
                <mesh position={[0, -0.1, 0]}>
                  <cylinderGeometry args={[0.01, 0.012, 0.09, 10]} />
                  <meshStandardMaterial color="#78350f" roughness={0.7} />
                </mesh>
              </group>
            )}
          </group>
        )}

        {/* Kế Toán Trưởng / Thư Ký Sổ Đầu Bài: 2 Thẻ +Thưởng (Xanh) & -Phạt (Đỏ) bên hông */}
        {roleKey === "witch" && !isGhost && (
          <group position={[0, 0.21, 0.18]}>
            <mesh position={[-0.095, 0, 0]} rotation={[0, 0, 0.15]}>
              <boxGeometry args={[0.065, 0.09, 0.018]} />
              <meshStandardMaterial color="#10b981" emissive="#059669" emissiveIntensity={1.1} />
            </mesh>
            <mesh position={[0.095, 0, 0]} rotation={[0, 0, -0.15]}>
              <boxGeometry args={[0.065, 0.09, 0.018]} />
              <meshStandardMaterial color="#f43f5e" emissive="#e11d48" emissiveIntensity={1.1} />
            </mesh>
          </group>
        )}

        {/* Quầng Lửa Chịu Đòn của Chiến Thần Quỹ Đen / Học Bá Điểm 10 */}
        {roleKey === "tough_guy" && enduringFire && (
          <sprite position={[0, 0.36, 0.1]} scale={[0.72, 0.72, 1]}>
            <spriteMaterial
              map={glowTex}
              color="#38bdf8"
              transparent
              opacity={0.7}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        )}
      </group>
    );
  }

  return (
    <group>
      {/* TIÊN TRI: Quả Cầu Pha Lê Huyền Ảnh + Quầng Sáng Mềm (Ưu tiên prop_hand_seer_orb.glb) */}
      {roleKey === "seer" && (
        <group ref={orbRef} position={[0, 0.41, 0.27]}>
          {seerOrbGlb ? (
            <primitive object={seerOrbGlb} />
          ) : (
            <>
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
            </>
          )}
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

      {/* PHÙ THỦY: 2 Bình Thủy Tinh Giả Kim Đeo Hông (Ưu tiên prop_hand_witch_elixir.glb & prop_hand_witch_poison.glb) */}
      {roleKey === "witch" && !isGhost && (
        <group position={[0, 0.175, 0.175]}>
          <group position={[-0.088, 0, 0]} rotation={[0, 0, 0.18]}>
            {witchElixirGlb ? (
              <primitive object={witchElixirGlb} position={[0, 0.05, 0]} />
            ) : (
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
            )}
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
            {witchPoisonGlb ? (
              <primitive object={witchPoisonGlb} position={[0, 0.05, 0]} />
            ) : (
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
            )}
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

      {/* KẺ CHÁN ĐỜI: Vòng Dây Thừng Bện Quấn Quanh Vai Cổ (Ưu tiên prop_hand_tanner_noose.glb) */}
      {roleKey === "tanner" && (
        <group position={[0, 0.55, 0.01]}>
          {tannerNooseGlb ? (
            <primitive object={tannerNooseGlb} position={[0.12, -0.32, 0.14]} />
          ) : (
            <>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.148, 0.021, 10, 24]} />
                <meshStandardMaterial color="#92400e" roughness={0.95} transparent={isGhost} opacity={opacity} />
              </mesh>
              <mesh position={[0.045, -0.075, 0.142]} rotation={[0.15, 0, -0.1]}>
                <capsuleGeometry args={[0.015, 0.095, 6, 10]} />
                <meshStandardMaterial color="#78350f" roughness={0.95} />
              </mesh>
            </>
          )}
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
 * SOCKET 3: ĐẠO CỤ CẦM TAY ĐIÊU KHẮC MƯỢT & KHE CẮM NÓNG .GLB TRIPO AI
 */
export function RoleHandSocket3D({
  roleKey,
  side = "left",
  isGhost = false,
  opacity = 1,
  showTrialTorch = false,
  boneAttached = false,
  universeId = "classic",
}) {
  const geos = useMemo(() => getSharedSculptGeometries(), []);
  const glowTex = useMemo(() => getSoftGlowHaloTexture(), []);
  const isClassic = universeId === "classic";
  const guardShieldGlb = useOptionalHandPropGlb(
    isClassic && roleKey === "guard" && side === "left" ? "guard_shield" : null
  );
  const trialTorchGlb = useOptionalHandPropGlb(
    isClassic && showTrialTorch && side === "right" && !isGhost ? "trial_torch" : null
  );
  const witchElixirGlb = useOptionalHandPropGlb(
    isClassic && roleKey === "witch" && side === "left" && boneAttached && !isGhost ? "witch_elixir" : null
  );
  const witchPoisonGlb = useOptionalHandPropGlb(
    isClassic && roleKey === "witch" && side === "right" && boneAttached && !isGhost ? "witch_poison" : null
  );
  const seerOrbGlb = useOptionalHandPropGlb(
    isClassic && roleKey === "seer" && side === "center" && !isGhost ? "seer_orb" : null
  );
  // === 3 CỔNG VŨ KHÍ CẦM TAY MỚI V3.3 (#25 -> #27) ===
  const hunterCrossbowGlb = useOptionalHandPropGlb(
    isClassic && roleKey === "hunter" && side === "right" && !isGhost ? "hunter_crossbow" : null
  );
  const cupidBowGlb = useOptionalHandPropGlb(
    isClassic && roleKey === "cupid" && side === "left" && !isGhost ? "cupid_bow" : null
  );
  const mayorScepterGlb = useOptionalHandPropGlb(
    isClassic && roleKey === "mayor" && side === "right" && !isGhost ? "mayor_scepter" : null
  );

  // ==================== ĐẠO CỤ CẦM TAY 3D VŨ TRỤ CÔNG SỞ & HỌC ĐƯỜNG ====================
  if (!isClassic) {
    const isOffice = universeId === "office";

    // Giơ Thẻ Đỏ HR (Office) / Bảng Cầm Tay Biểu Quyết Sao Đỏ (School) thay cho Đuốc Lửa Trung Cổ!
    if (showTrialTorch && side === "right" && !isGhost) {
      const pos = boneAttached ? [0, -0.02, 0.05] : [0, -0.36, 0.06];
      const rot = boneAttached ? [0.4, 0, 0] : [1.0, 0, 0];
      return (
        <group position={pos} rotation={rot}>
          {isOffice ? (
            <>
              <mesh position={[0, 0.16, 0]}>
                <boxGeometry args={[0.15, 0.22, 0.02]} />
                <meshStandardMaterial color="#dc2626" emissive="#ef4444" emissiveIntensity={0.95} roughness={0.28} />
              </mesh>
              <mesh position={[0, 0.26, 0.012]}>
                <boxGeometry args={[0.068, 0.024, 0.02]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.88} roughness={0.18} />
              </mesh>
            </>
          ) : (
            <>
              {/* Cán gỗ cầm tay + Bảng tròn/vuông Sao Đỏ Học Đường */}
              <mesh position={[0, 0.08, 0]}>
                <cylinderGeometry args={[0.012, 0.012, 0.18, 10]} />
                <meshStandardMaterial color="#b45309" roughness={0.65} />
              </mesh>
              <mesh position={[0, 0.22, 0]}>
                <boxGeometry args={[0.18, 0.15, 0.022]} />
                <meshStandardMaterial color="#e11d48" emissive="#f43f5e" emissiveIntensity={0.85} roughness={0.32} />
              </mesh>
              <mesh position={[0, 0.22, 0.014]}>
                <octahedronGeometry args={[0.036, 0]} />
                <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={1.1} />
              </mesh>
            </>
          )}
        </group>
      );
    }

    if (!roleKey || isGhost) return null;

    // Sếp / Giáo Viên: Bìa Kỷ Luật Đỏ / Thước Kẻ Gỗ cầm tay phải
    if ((roleKey === "wolf" || roleKey === "alpha_wolf") && side === "right") {
      const pos = boneAttached ? [0, -0.02, 0.05] : [0, -0.38, 0.05];
      return (
        <group position={pos} rotation={[0.85, 0, 0]}>
          {isOffice ? (
            <mesh position={[0, 0.1, 0]}>
              <boxGeometry args={[0.14, 0.19, 0.022]} />
              <meshStandardMaterial color="#991b1b" emissive="#dc2626" emissiveIntensity={0.55} roughness={0.4} />
            </mesh>
          ) : (
            <mesh position={[0, 0.16, 0]}>
              <boxGeometry args={[0.032, 0.34, 0.01]} />
              <meshStandardMaterial color="#d97706" roughness={0.55} />
            </mesh>
          )}
        </group>
      );
    }

    // Team Lead / Lớp Phó: Bìa Hồ Sơ Khiên KPI / Sách Giáo Khoa Dày Đỡ Lời bên tay trái
    if (roleKey === "guard" && side === "left") {
      const pos = boneAttached ? [0.06, 0.04, 0.08] : [0.085, -0.25, 0.065];
      return (
        <group position={pos} rotation={[0.2, 0.35, 0]}>
          <mesh>
            <boxGeometry args={[0.035, 0.3, 0.24]} />
            <meshStandardMaterial
              color={isOffice ? "#0284c7" : "#1d4ed8"}
              emissive="#38bdf8"
              emissiveIntensity={0.45}
              roughness={0.35}
            />
          </mesh>
        </group>
      );
    }

    // Kế Toán / Thư Ký Sổ Đầu Bài: Máy Tính Cầm Tay / Bút Đỏ Chấm Điểm bên tay phải
    if (roleKey === "witch" && side === "right") {
      const pos = boneAttached ? [-0.02, -0.02, 0.05] : [0, -0.37, 0.05];
      return (
        <group position={pos} rotation={[1.1, 0, 0]}>
          {isOffice ? (
            <mesh position={[0, 0.08, 0]}>
              <boxGeometry args={[0.11, 0.15, 0.022]} />
              <meshStandardMaterial color="#10b981" emissive="#059669" emissiveIntensity={0.75} roughness={0.3} />
            </mesh>
          ) : (
            <mesh position={[0, 0.12, 0]}>
              <cylinderGeometry args={[0.014, 0.01, 0.24, 10]} />
              <meshStandardMaterial color="#e11d48" emissive="#f43f5e" emissiveIntensity={0.7} />
            </mesh>
          )}
        </group>
      );
    }

    // Senior Giữ Pass Server (USB Đỏ) / Chiến Thần Thưa Cô (Loa Cầm Tay Megaphone)
    if (roleKey === "hunter" && side === "right") {
      const pos = boneAttached ? [-0.02, -0.02, 0.07] : [0, -0.36, 0.08];
      return (
        <group position={pos} rotation={[0.95, 0, 0]}>
          {isOffice ? (
            <mesh position={[0, 0.08, 0]}>
              <boxGeometry args={[0.05, 0.13, 0.028]} />
              <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={1.1} metalness={0.6} />
            </mesh>
          ) : (
            <mesh position={[0, 0.12, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.085, 0.2, 14]} />
              <meshStandardMaterial color="#ef4444" roughness={0.35} />
            </mesh>
          )}
        </group>
      );
    }

    // Bà Tám Trà Nước (Ly Trà Sữa Trân Châu) / Bà Mối Bàn Cuối (Thư Tình Hồng) bên tay trái
    if (roleKey === "cupid" && side === "left") {
      const pos = boneAttached ? [0.03, 0, 0.06] : [0.04, -0.35, 0.07];
      return (
        <group position={pos} rotation={[0.5, 0, 0]}>
          {isOffice ? (
            <group>
              <mesh position={[0, 0.06, 0]}>
                <cylinderGeometry args={[0.042, 0.032, 0.12, 14]} />
                <meshStandardMaterial color="#fed7aa" roughness={0.25} />
              </mesh>
              <mesh position={[0.01, 0.14, 0]} rotation={[0, 0, -0.15]}>
                <cylinderGeometry args={[0.006, 0.006, 0.08, 8]} />
                <meshStandardMaterial color="#ec4899" />
              </mesh>
            </group>
          ) : (
            <mesh position={[0, 0.06, 0]}>
              <boxGeometry args={[0.14, 0.1, 0.016]} />
              <meshStandardMaterial color="#fbcfe8" emissive="#ec4899" emissiveIntensity={0.65} />
            </mesh>
          )}
        </group>
      );
    }

    // Chủ Tịch Công Đoàn (Cúp/Micro Vàng) / Lớp Trưởng (Huy Hiệu Cờ Thi Đua) bên tay phải
    if (roleKey === "mayor" && side === "right") {
      const pos = boneAttached ? [-0.02, -0.04, 0.05] : [0, -0.37, 0.06];
      return (
        <group position={pos} rotation={[0.9, 0, 0]}>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.014, 0.012, 0.22, 10]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <octahedronGeometry args={[0.045, 0]} />
            <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={1.25} />
          </mesh>
        </group>
      );
    }

    return null;
  }

  // ĐUỐC PHÁN QUYẾT SẮT RÈN (Ưu tiên prop_hand_trial_torch.glb khi người chơi giơ đuốc bỏ phiếu Treo Cổ)
  if (showTrialTorch && side === "right" && !isGhost) {
    const pos = boneAttached ? [0, -0.02, 0.04] : [0, -0.36, 0.06];
    const rot = boneAttached ? [0.45, 0, 0] : [1.05, 0, 0];
    return (
      <group position={pos} rotation={rot}>
        {trialTorchGlb ? (
          <primitive object={trialTorchGlb} position={[0, 0.14, 0]} />
        ) : (
          <>
            <mesh position={[0, 0.14, 0]}>
              <cylinderGeometry args={[0.028, 0.016, 0.34, 10]} />
              <meshStandardMaterial color="#3f2716" roughness={0.88} />
            </mesh>
            <mesh position={[0, 0.28, 0]}>
              <cylinderGeometry args={[0.044, 0.026, 0.075, 8]} />
              <meshStandardMaterial color="#23272e" metalness={0.78} roughness={0.42} />
            </mesh>
          </>
        )}
        <mesh position={[0, 0.36, 0]}>
          <coneGeometry args={[0.042, 0.13, 10]} />
          <meshStandardMaterial color="#fef08a" emissive="#f97316" emissiveIntensity={2.2} roughness={0.2} />
        </mesh>
        <sprite position={[0, 0.38, 0]} scale={[0.36, 0.36, 1]}>
          <spriteMaterial
            map={glowTex}
            color="#fb923c"
            transparent
            opacity={0.82}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      </group>
    );
  }

  if (!roleKey) return null;

  // TIÊN TRI: Quả Cầu Pha Lê Huyền Ảnh nâng giữa hai lòng bàn tay (boneAttached center)
  if (roleKey === "seer" && side === "center" && !isGhost) {
    return (
      <group>
        {seerOrbGlb ? (
          <primitive object={seerOrbGlb} />
        ) : (
          <>
            <mesh>
              <sphereGeometry args={[0.078, 22, 22]} />
              <meshStandardMaterial
                color="#f3e8ff"
                emissive="#9333ea"
                emissiveIntensity={1.45}
                transparent
                opacity={0.9}
                roughness={0.08}
              />
            </mesh>
            <mesh rotation={[Math.PI / 3, 0.4, 0]}>
              <torusGeometry args={[0.11, 0.008, 8, 28]} />
              <meshStandardMaterial color="#fde047" metalness={0.9} roughness={0.18} />
            </mesh>
          </>
        )}
        <sprite scale={[0.38, 0.38, 1]}>
          <spriteMaterial
            map={glowTex}
            color="#c084fc"
            transparent
            opacity={0.75}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      </group>
    );
  }

  if ((roleKey === "wolf" || roleKey === "alpha_wolf") && !boneAttached) {
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

  // BẢO VỆ: Khiên Tròn Bắc Âu Vòm Nổi Bọc Viền Thép (Ưu tiên prop_hand_guard_shield.glb)
  if (roleKey === "guard" && side === "left") {
    const pos = boneAttached ? [0.06, 0.04, 0.08] : [0.085, -0.25, 0.065];
    const rot = boneAttached ? [0.12, 0.25, 0] : [0.22, 0.38, 0];
    return (
      <group position={pos} rotation={rot}>
        {guardShieldGlb ? (
          <primitive object={guardShieldGlb} />
        ) : (
          <>
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
          </>
        )}
      </group>
    );
  }

  // PHÙ THỦY TRÊN XƯƠNG BÀN TAY THẬT: Tay Trái cầm Bình Tiên Dược Xanh, Tay Phải cầm Bình Độc Tím!
  if (roleKey === "witch" && boneAttached && !isGhost) {
    if (side === "left") {
      return (
        <group position={[0.02, -0.02, 0.05]}>
          {witchElixirGlb ? (
            <primitive object={witchElixirGlb} />
          ) : (
            <mesh geometry={geos.flaskGeo} scale={[1.22, 1.22, 1.22]}>
              <meshStandardMaterial
                color="#34d399"
                emissive="#10b981"
                emissiveIntensity={1.45}
                roughness={0.12}
                transparent
                opacity={0.94}
              />
            </mesh>
          )}
          <sprite position={[0, 0.055, 0.02]} scale={[0.22, 0.22, 1]}>
            <spriteMaterial
              map={glowTex}
              color="#34d399"
              transparent
              opacity={0.68}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        </group>
      );
    }
    if (side === "right") {
      return (
        <group position={[-0.02, -0.02, 0.05]}>
          {witchPoisonGlb ? (
            <primitive object={witchPoisonGlb} />
          ) : (
            <mesh geometry={geos.flaskGeo} scale={[1.25, 1.25, 1.25]}>
              <meshStandardMaterial
                color="#d8b4fe"
                emissive="#9333ea"
                emissiveIntensity={1.55}
                roughness={0.12}
                transparent
                opacity={0.95}
              />
            </mesh>
          )}
          <sprite position={[0, 0.055, 0.02]} scale={[0.24, 0.24, 1]}>
            <spriteMaterial
              map={glowTex}
              color="#c084fc"
              transparent
              opacity={0.72}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        </group>
      );
    }
  }

  // PHÙ THỦY (Fallback Procedural cũ): Trượng Gỗ Xoắn Đính Tinh Cầu Lục Bảo
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

  // THỢ SĂN (#25): Nỏ Bạc Hạng Nặng gắn Tay Phải (Ưu tiên prop_hand_hunter_crossbow.glb, fallback Điêu Khắc 3D)
  if (roleKey === "hunter" && side === "right" && !isGhost) {
    const pos = boneAttached ? [-0.02, -0.02, 0.08] : [0, -0.36, 0.09];
    const rot = boneAttached ? [0.18, 0, 0] : [1.1, 0, 0];
    return (
      <group position={pos} rotation={rot}>
        {hunterCrossbowGlb ? (
          <primitive object={hunterCrossbowGlb} />
        ) : (
          <group>
            {/* Báng gỗ sồi đen thon dài dọc trục bắn +Z */}
            <mesh position={[0, 0, 0.11]} rotation={[Math.PI / 2, 0, 0]}>
              <capsuleGeometry args={[0.02, 0.28, 8, 12]} />
              <meshStandardMaterial color="#3b2314" roughness={0.82} />
            </mesh>
            {/* Cánh nỏ thép rèn uốn cong ngang đầu nỏ */}
            <mesh geometry={geos.crossbowProdGeo} position={[0, 0.012, 0.22]}>
              <meshStandardMaterial color="#cbd5e1" metalness={0.88} roughness={0.22} />
            </mesh>
            {/* Dây cung bạc & Mũi tên bạc phát sáng nạp sẵn trên rãnh */}
            <mesh position={[0, 0.024, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.005, 0.005, 0.26, 8]} />
              <meshStandardMaterial color="#f8fafc" emissive="#e2e8f0" emissiveIntensity={1.25} metalness={0.92} roughness={0.15} />
            </mesh>
            <mesh position={[0, 0.024, 0.295]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.016, 0.055, 8]} />
              <meshStandardMaterial color="#ffffff" emissive="#bae6fd" emissiveIntensity={1.65} metalness={0.95} roughness={0.12} />
            </mesh>
            <sprite position={[0, 0.024, 0.295]} scale={[0.22, 0.22, 1]}>
              <spriteMaterial
                map={glowTex}
                color="#e0f2fe"
                transparent
                opacity={0.72}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          </group>
        )}
      </group>
    );
  }

  // THẦN TÌNH YÊU CUPID (#26): Cung Pha Lê Vàng Hồng gắn Tay Trái (Ưu tiên prop_hand_cupid_bow.glb)
  if (roleKey === "cupid" && side === "left" && !isGhost) {
    const pos = boneAttached ? [0.03, 0.0, 0.06] : [0.04, -0.35, 0.08];
    const rot = boneAttached ? [0.1, 0, 0] : [0.85, 0, 0];
    return (
      <group position={pos} rotation={rot}>
        {cupidBowGlb ? (
          <primitive object={cupidBowGlb} />
        ) : (
          <group>
            <mesh geometry={geos.cupidBowGeo}>
              <meshStandardMaterial
                color="#fbcfe8"
                emissive="#db2777"
                emissiveIntensity={0.75}
                metalness={0.86}
                roughness={0.18}
              />
            </mesh>
            {/* Dây tơ hồng phát sáng nối 2 đầu cánh cung */}
            <mesh position={[0, 0, -0.042]}>
              <cylinderGeometry args={[0.003, 0.003, 0.47, 6]} />
              <meshBasicMaterial color="#fdf2f8" transparent opacity={0.9} />
            </mesh>
            {/* Viên pha lê hồng tâm báng cung */}
            <mesh position={[0, 0, 0.088]}>
              <octahedronGeometry args={[0.024, 0]} />
              <meshStandardMaterial color="#f9a8d4" emissive="#ec4899" emissiveIntensity={1.8} roughness={0.1} />
            </mesh>
            <sprite position={[0, 0, 0.09]} scale={[0.26, 0.26, 1]}>
              <spriteMaterial
                map={glowTex}
                color="#f472b6"
                transparent
                opacity={0.76}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          </group>
        )}
      </group>
    );
  }

  // TRƯỞNG LÀNG (#27): Quyền Trượng Hoàng Kim Đại Bàng gắn Tay Phải (Ưu tiên prop_hand_mayor_scepter.glb)
  if (roleKey === "mayor" && side === "right" && !isGhost) {
    const pos = boneAttached ? [-0.02, -0.08, 0.04] : [0, -0.38, 0.06];
    const rot = boneAttached ? [0.22, 0, 0] : [0.95, 0, 0];
    return (
      <group position={pos} rotation={rot}>
        {mayorScepterGlb ? (
          <primitive object={mayorScepterGlb} />
        ) : (
          <group>
            <mesh geometry={geos.scepterShaftGeo} position={[0, -0.1, 0]}>
              <meshStandardMaterial color="#92400e" metalness={0.55} roughness={0.38} />
            </mesh>
            <mesh position={[0, 0.34, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.042, 0.009, 8, 22]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.94} roughness={0.16} />
            </mesh>
            <mesh position={[0, 0.365, 0]}>
              <sphereGeometry args={[0.034, 18, 18]} />
              <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={1.55} metalness={0.82} roughness={0.14} />
            </mesh>
            <sprite position={[0, 0.365, 0]} scale={[0.3, 0.3, 1]}>
              <spriteMaterial
                map={glowTex}
                color="#fbbf24"
                transparent
                opacity={0.8}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          </group>
        )}
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
