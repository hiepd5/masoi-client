import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import {
  ASSET_SYNC_VERSION,
  PRELOAD_TIERS,
  PROP_MANIFEST,
} from "../config/propManifest.js";
import { enhancePropMaterialsForCinema } from "../shaders/villageCinematicShaders.js";

let sharedGltfLoader = null;
function getSharedGltfLoader() {
  if (!sharedGltfLoader) {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
    loader.setDRACOLoader(draco);
    sharedGltfLoader = loader;
  }
  return sharedGltfLoader;
}

const propCacheMap = new Map();
const propStatusMap = {}; // propKey -> 'checking' | 'loaded' | 'fallback'
const propDiagnosticsMap = {};
const syncStateCacheMap = new Map();
const statusListeners = new Set();

function notifyStatusChange() {
  const snapshot = {
    statuses: { ...propStatusMap },
    diagnostics: { ...propDiagnosticsMap },
  };
  statusListeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {
      // ignore
    }
  });
}

export function subscribePropStatuses(listener) {
  statusListeners.add(listener);
  listener({
    statuses: { ...propStatusMap },
    diagnostics: { ...propDiagnosticsMap },
  });
  return () => statusListeners.delete(listener);
}

function fetchPropsSyncState(reloadToken = 0) {
  const tokenKey = `${ASSET_SYNC_VERSION}_${reloadToken}`;
  if (syncStateCacheMap.has(tokenKey)) {
    return syncStateCacheMap.get(tokenKey);
  }
  const p = fetch(`/models/props/props_sync_state.json?v=${tokenKey}`, {
    cache: "no-cache",
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const ctype = (res.headers.get("content-type") || "").toLowerCase();
      if (ctype.includes("text/html")) return null;
      return await res.json();
    })
    .catch(() => null);
  syncStateCacheMap.set(tokenKey, p);
  return p;
}

function analyzeChairGeometry(root, rawBox, rawSize, rawCenter, manifest) {
  const upperMinY = rawBox.min.y + rawSize.y * 0.68;
  let sumX = 0;
  let sumZ = 0;
  let upperCount = 0;
  const tempV = new THREE.Vector3();

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
    const pos = obj.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 1600));
    for (let i = 0; i < pos.count; i += step) {
      tempV.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      if (tempV.y >= upperMinY) {
        sumX += tempV.x - rawCenter.x;
        sumZ += tempV.z - rawCenter.z;
        upperCount += 1;
      }
    }
  });

  let autoYawRad = 0;
  if (upperCount >= 6) {
    const bx = sumX / upperCount;
    const bz = sumZ / upperCount;
    if (Math.hypot(bx, bz) > Math.min(rawSize.x, rawSize.z) * 0.04) {
      autoYawRad = Math.PI - Math.atan2(bx, bz);
    }
  }

  const tempYawGroup = new THREE.Group();
  const tempInner = new THREE.Group();
  tempInner.position.set(-rawCenter.x, -rawBox.min.y, -rawCenter.z);
  tempInner.add(root);
  tempYawGroup.rotation.y = autoYawRad;
  tempYawGroup.add(tempInner);
  tempYawGroup.updateMatrixWorld(true);

  const alignedBox = new THREE.Box3().setFromObject(tempYawGroup);
  const alignedSize = new THREE.Vector3();
  alignedBox.getSize(alignedSize);

  const raycaster = new THREE.Raycaster();
  const downDir = new THREE.Vector3(0, -1, 0);
  const rayOrigin = new THREE.Vector3();
  const rayStartY = rawSize.y * 0.65;

  const sampleXs = [-0.11 * alignedSize.x, 0, 0.11 * alignedSize.x];
  const sampleZs = [-0.03 * alignedSize.z, 0.06 * alignedSize.z, 0.15 * alignedSize.z];
  const validSeatHits = [];

  for (const sx of sampleXs) {
    for (const sz of sampleZs) {
      rayOrigin.set(sx, rayStartY, sz);
      raycaster.set(rayOrigin, downDir);
      const hits = raycaster.intersectObject(tempYawGroup, true);
      if (hits.length > 0) {
        const hitY = hits[0].point.y;
        if (hitY >= rawSize.y * 0.28 && hitY <= rawSize.y * 0.63) {
          validSeatHits.push(hitY);
        }
      }
    }
  }

  tempInner.remove(root);
  root.updateMatrixWorld(true);

  let effectiveTargetHeight = manifest.targetHeight;
  let seatMatched = false;

  if (validSeatHits.length > 0) {
    validSeatHits.sort((a, b) => a - b);
    const medianSeatY = validSeatHits[Math.floor(validSeatHits.length / 2)];
    const seatRatio = medianSeatY / Math.max(0.01, rawSize.y);
    const desiredSeatY = manifest.targetSeatTopY || 0.48;
    const minH = manifest.minTotalHeight || 0.82;
    const maxH = manifest.maxTotalHeight || 1.18;
    effectiveTargetHeight = THREE.MathUtils.clamp(desiredSeatY / seatRatio, minH, maxH);
    seatMatched = true;
  }

  const normalizedDeg = ((THREE.MathUtils.radToDeg(autoYawRad) % 360) + 360) % 360;
  return {
    autoYawRad,
    autoYawDeg: Math.round(normalizedDeg),
    effectiveTargetHeight: Number(effectiveTargetHeight.toFixed(3)),
    seatMatched,
  };
}

async function probeAndParseProp(propKey, reloadToken = 0) {
  const manifest = PROP_MANIFEST[propKey];
  if (!manifest) return { status: "fallback", scene: null, bounds: null };

  // Trên Web Production: Bỏ hoàn toàn bước chặn RTT props_sync_state.json để dùng thẳng CDN Cache 1 năm (immutable)!
  const shouldCheckDevSync = Boolean(import.meta.env?.DEV || reloadToken > 0);
  const syncState =
    shouldCheckDevSync && manifest.batch !== 3 ? await fetchPropsSyncState(reloadToken) : null;
  const syncItem = syncState?.items?.[propKey] || null;
  const mtimeTag = syncItem?.mtimeMs || manifest.mtimeMs || 0;

  const versionTag = shouldCheckDevSync
    ? `${ASSET_SYNC_VERSION}_${mtimeTag}_${reloadToken}`
    : `${ASSET_SYNC_VERSION}`;
  const cacheKey = `${propKey}::${versionTag}`;
  if (propCacheMap.has(cacheKey)) {
    return propCacheMap.get(cacheKey);
  }

  propStatusMap[propKey] = "checking";
  notifyStatusChange();

  const fetchUrl = `${manifest.url}?v=${versionTag}`;
  const fetchCacheMode = reloadToken > 0 ? "no-cache" : shouldCheckDevSync ? "default" : "force-cache";

  const task = fetch(fetchUrl, { cache: fetchCacheMode })
    .then(async (res) => {
      if (!res.ok) {
        propStatusMap[propKey] = "fallback";
        notifyStatusChange();
        return { status: "fallback", scene: null, bounds: null };
      }

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("text/html")) {
        propStatusMap[propKey] = "fallback";
        notifyStatusChange();
        return { status: "fallback", scene: null, bounds: null };
      }

      const buffer = await res.arrayBuffer();
      if (!buffer || buffer.byteLength < 20) {
        propStatusMap[propKey] = "fallback";
        notifyStatusChange();
        return { status: "fallback", scene: null, bounds: null };
      }

      const header = new Uint8Array(buffer, 0, 4);
      const isBinaryGltf =
        header[0] === 0x67 &&
        header[1] === 0x6c &&
        header[2] === 0x54 &&
        header[3] === 0x46;

      if (!isBinaryGltf) {
        propStatusMap[propKey] = "fallback";
        notifyStatusChange();
        return { status: "fallback", scene: null, bounds: null };
      }

      const loader = getSharedGltfLoader();
      const gltf = await loader.parseAsync(buffer, "/models/props/");
      const root = gltf.scene;

      // Tối ưu GPU WebGL: Chỉ bật bóng động (castShadow) cho đạo cụ tâm sân (Ghế, Lửa trại, Đài treo cổ).
      // Toàn bộ Nhà & Rừng cây dùng bóng mềm ContactShadowDisc giúp giảm ~80% tải GPU Shadow Map trên Web & Mobile!
      const shouldCastShadow = Boolean(manifest.castDynamicShadow) && !manifest.flushTopSurface;
      const maxAniso = manifest.flushTopSurface ? 4 : 2;
      const texSlots = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"];
      root.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = shouldCastShadow;
          obj.receiveShadow = true;
          const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
          mats.forEach((mat) => {
            texSlots.forEach((slot) => {
              const tex = mat?.[slot];
              if (tex && tex.isTexture) {
                tex.anisotropy = Math.min(maxAniso, tex.anisotropy || maxAniso);
              }
            });
          });
        }
      });

      root.updateMatrixWorld(true);
      let box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);

      // Chống lỗi đĩa sân đá tròn bị xuất dựng đứng theo mặt phẳng XY/YZ thay vì nằm phẳng trên mặt đất XZ
      if (manifest.flushTopSurface && size.y > Math.min(size.x, size.z) * 1.8) {
        if (size.z <= size.x) {
          root.rotation.x = -Math.PI / 2;
        } else {
          root.rotation.z = Math.PI / 2;
        }
        root.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(root);
        box.getSize(size);
      }

      box.getCenter(center);

      // Tiêm GPU Shader Điện Ảnh (Gió Rừng 2 Chiều Y×XZ + Cửa Sổ/Đèn Lồng Tự Phát Sáng + Sân Đá Ẩm Ánh Lửa) 1 lần duy nhất!
      enhancePropMaterialsForCinema(root, propKey, box, size, center, manifest.shaderProfile || null);

      let autoYawRad = 0;
      let effectiveTargetHeight = manifest.targetHeight;
      const sizeMB =
        syncItem?.sizeMB ??
        (manifest.sizeMB > 0
          ? manifest.sizeMB
          : Number((buffer.byteLength / (1024 * 1024)).toFixed(2)));
      const sourceName = syncItem?.sourceName || manifest.sourceName || manifest.fileName;
      const normFactor = (manifest.targetHeight || 1) / Math.max(0.01, size.y);
      const resolvedSize = [
        Number((Math.max(0.01, size.x) * normFactor).toFixed(2)),
        Number((Math.max(0.01, size.y) * normFactor).toFixed(2)),
        Number((Math.max(0.01, size.z) * normFactor).toFixed(2)),
      ];

      if (manifest.autoAlignChair) {
        const chairCal = analyzeChairGeometry(root, box, size, center, manifest);
        autoYawRad = chairCal.autoYawRad;
        effectiveTargetHeight = chairCal.effectiveTargetHeight;
        propDiagnosticsMap[propKey] = {
          autoYawDeg: chairCal.autoYawDeg,
          resolvedHeight: chairCal.effectiveTargetHeight,
          resolvedSize,
          seatMatched: chairCal.seatMatched,
          sourceName,
          sizeMB,
        };
      } else {
        propDiagnosticsMap[propKey] = {
          autoYawDeg: 0,
          resolvedHeight: manifest.targetHeight,
          resolvedSize,
          seatMatched: false,
          sourceName,
          sizeMB,
        };
      }

      const bounds = {
        sizeX: Math.max(0.01, size.x),
        sizeY: Math.max(0.01, size.y),
        sizeZ: Math.max(0.01, size.z),
        centerX: center.x,
        minY: Number.isFinite(box.min.y) ? box.min.y : 0,
        maxY: Number.isFinite(box.max.y) ? box.max.y : size.y,
        centerZ: center.z,
        autoYawRad,
        effectiveTargetHeight,
      };

      propStatusMap[propKey] = "loaded";
      notifyStatusChange();
      return { status: "loaded", scene: root, bounds };
    })
    .catch(() => {
      propStatusMap[propKey] = "fallback";
      notifyStatusChange();
      return { status: "fallback", scene: null, bounds: null };
    });

  propCacheMap.set(cacheKey, task);
  return task;
}

const idlePreloadQueue = [];
let activeIdlePreloadRunning = false;

function scheduleIdlePreloadKeys(keys = []) {
  if (typeof window === "undefined") return;
  keys.forEach((k) => {
    if (k && PROP_MANIFEST[k] && !propStatusMap[k] && !idlePreloadQueue.includes(k)) {
      idlePreloadQueue.push(k);
    }
  });
  if (idlePreloadQueue.length === 0 || activeIdlePreloadRunning) return;

  activeIdlePreloadRunning = true;
  const runIdle =
    window.requestIdleCallback ||
    ((cb) => window.setTimeout(() => cb({ timeRemaining: () => 12 }), 90));

  const stepNext = () => {
    if (idlePreloadQueue.length === 0) {
      activeIdlePreloadRunning = false;
      return;
    }
    const nextKey = idlePreloadQueue.shift();
    if (!nextKey || propStatusMap[nextKey]) {
      stepNext();
      return;
    }
    runIdle(() => {
      probeAndParseProp(nextKey, 0).finally(() => {
        window.setTimeout(stepNext, 95);
      });
    });
  };

  stepNext();
}

/**
 * Nạp ngầm cuốn chiếu theo đúng Bối Cảnh Đang Mở (Zero-Waste On-Demand Preload):
 * - Người chơi trên Web/Mobile CHỈ tải đúng những file .GLB thực sự xuất hiện trong nodes[] của bối cảnh đó!
 * - Các model nằm trong kho "MODEL CONCEPT THEM" nhưng không đặt ra sân tốn 0 KB băng thông người chơi!
 */
export function preloadActiveLayoutProps(activePropKeys = [], { includeChair = true } = {}) {
  const ordered = [];
  if (includeChair) ordered.push("prop_chair");
  (activePropKeys || []).forEach((k) => {
    if (k && !ordered.includes(k)) ordered.push(k);
  });
  scheduleIdlePreloadKeys(ordered);
}

export function preloadVillagePropsInIdle({ includeOuterTiers = false } = {}) {
  const keys = includeOuterTiers
    ? [
        ...PRELOAD_TIERS.TIER_1_CORE,
        ...PRELOAD_TIERS.TIER_2_VILLAGE,
        ...PRELOAD_TIERS.TIER_3_FOREST,
      ]
    : [...PRELOAD_TIERS.TIER_1_CORE];
  scheduleIdlePreloadKeys(keys);
}

const NOOP_RAYCAST = () => {};

export default function SmartPropGLB({
  propKey,
  calib = null,
  reloadToken = 0,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scaleMultiplier = 1,
  targetDiameterOverride = null,
  disableRaycast = false,
  fallback = null,
}) {
  const manifest = PROP_MANIFEST[propKey];
  const [entry, setEntry] = useState({ status: "checking", scene: null, bounds: null });

  useEffect(() => {
    let alive = true;
    probeAndParseProp(propKey, reloadToken).then((res) => {
      if (alive) setEntry(res);
    });
    return () => {
      alive = false;
    };
  }, [propKey, reloadToken]);

  const clonedScene = useMemo(() => {
    if (entry.status !== "loaded" || !entry.scene) return null;
    return entry.scene.clone(true);
  }, [entry]);

  useEffect(() => {
    if (!clonedScene) return;
    clonedScene.traverse((obj) => {
      if (obj.isMesh) {
        obj.raycast = disableRaycast ? NOOP_RAYCAST : THREE.Mesh.prototype.raycast;
      }
    });
  }, [clonedScene, disableRaycast]);

  if (!manifest || entry.status !== "loaded" || !clonedScene || !entry.bounds) {
    return (
      <group position={position} rotation={rotation} scale={scaleMultiplier}>
        {fallback}
      </group>
    );
  }

  const userYawDeg = Number(calib?.yawDeg ?? 0);
  const userScale = Number(calib?.scale ?? manifest.defaultScale ?? 1);
  const userYOffset = Number(calib?.yOffset ?? manifest.defaultYOffset ?? 0);
  const userZOffset = Number(calib?.zOffset ?? manifest.defaultZOffset ?? 0);

  const totalYawRad =
    (entry.bounds.autoYawRad || 0) +
    THREE.MathUtils.degToRad((manifest.defaultYawDeg || 0) + userYawDeg);

  // Chế độ tấm phẳng chuyên biệt cho đĩa sân đá (plaza_cobblestone.glb):
  // - Ép mặt trên cùng nằm khít y = 0.01m (ngay dưới chân ghế & bếp lửa)
  // - Giới hạn độ dày tấm đá tối đa 14cm để Tripo có tạo bệ dày bên dưới cũng bị giấu sạch dưới lòng đất!
  if (manifest.flushTopSurface) {
    const desiredDiam = (targetDiameterOverride || manifest.defaultDiameter || 11.2) * userScale * scaleMultiplier;
    const rawSpanXZ = Math.max(0.1, Math.max(entry.bounds.sizeX, entry.bounds.sizeZ));
    const scaleXZ = desiredDiam / rawSpanXZ;
    const desiredThickness = Math.min(manifest.maxSlabThickness || 0.14, rawSpanXZ * scaleXZ * 0.02);
    const scaleY = Math.min(scaleXZ, desiredThickness / Math.max(0.01, entry.bounds.sizeY));

    return (
      <group position={position} rotation={rotation}>
        <group
          position={[0, 0.01 + userYOffset, userZOffset]}
          rotation={[0, totalYawRad, 0]}
          scale={[scaleXZ, scaleY, scaleXZ]}
        >
          <primitive
            object={clonedScene}
            position={[-entry.bounds.centerX, -entry.bounds.maxY, -entry.bounds.centerZ]}
          />
        </group>
      </group>
    );
  }

  const baseTargetH = entry.bounds.effectiveTargetHeight || manifest.targetHeight;
  const normalizedScale =
    (baseTargetH / Math.max(0.01, entry.bounds.sizeY)) *
    userScale *
    scaleMultiplier;

  return (
    <group position={position} rotation={rotation}>
      <group
        position={[0, userYOffset, userZOffset]}
        rotation={[0, totalYawRad, 0]}
        scale={normalizedScale}
      >
        <primitive
          object={clonedScene}
          position={[-entry.bounds.centerX, -entry.bounds.minY, -entry.bounds.centerZ]}
        />
      </group>
    </group>
  );
}
