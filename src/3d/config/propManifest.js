/**
 * Danh mục chuẩn hóa 12 Đạo Cụ Ngoại Cảnh (.GLB xuất thẳng từ Tripo Pro):
 * - Đợt 1 (6 món chính — Đã hoàn tất 6/6): Ghế, Bếp đá, Đài treo cổ, Nhà mẫu A, Nhà mẫu B, Tháp chuông.
 * - Đợt 2 (6 món mở rộng): Sân đá cổ ngữ, Thông cao, Thông tán rộng, Cây khô vặn xoắn, Cột đèn lồng, Hàng rào đá rêu.
 */

export const ASSET_SYNC_VERSION = 15;
export const SKY_ENABLED = true;

export const PROP_MANIFEST = {
  // ==================== ĐỢT 1: 6 ĐẠO CỤ KIẾN TRÚC CHỦ LỰC ====================
  prop_chair: {
    id: "prop_chair",
    batch: 1,
    label: "🪑 Ghế Gỗ Sồi (Vòng Tròn)",
    fileName: "prop_chair.glb",
    url: "/models/props/prop_chair.glb",
    targetHeight: 0.94,
    autoAlignChair: true,
    castDynamicShadow: true,
    targetSeatTopY: 0.48,
    minTotalHeight: 0.82,
    maxTotalHeight: 1.18,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  prop_campfire: {
    id: "prop_campfire",
    batch: 1,
    label: "🔥 Bếp Đá Cổ Ngữ (Tâm Làng)",
    fileName: "prop_campfire.glb",
    url: "/models/props/prop_campfire.glb",
    targetHeight: 0.42,
    castDynamicShadow: true,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  prop_gallows: {
    id: "prop_gallows",
    batch: 1,
    label: "⚖️ Đài Treo Cổ (Hướng 12h Bắc)",
    fileName: "prop_gallows.glb",
    url: "/models/props/prop_gallows.glb",
    targetHeight: 4.2,
    castDynamicShadow: true,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  house_cottage_a: {
    id: "house_cottage_a",
    batch: 1,
    label: "🏠 Nhà Gỗ Mái Ngói (Mẫu A)",
    fileName: "house_cottage_a.glb",
    url: "/models/props/house_cottage_a.glb",
    targetHeight: 5.8,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  house_cottage_b: {
    id: "house_cottage_b",
    batch: 1,
    label: "🏡 Nhà Gỗ Mái Tranh (Mẫu B)",
    fileName: "house_cottage_b.glb",
    url: "/models/props/house_cottage_b.glb",
    targetHeight: 5.5,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  landmark_belltower: {
    id: "landmark_belltower",
    batch: 1,
    label: "🔔 Tháp Chuông Đá (Sau Đài Treo Cổ)",
    fileName: "landmark_belltower.glb",
    url: "/models/props/landmark_belltower.glb",
    targetHeight: 9.6,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },

  // ==================== ĐỢT 2: 6 MODEL SÂN ĐÁ, CÂY RỪNG & TIỂU CẢNH ====================
  plaza_cobblestone: {
    id: "plaza_cobblestone",
    batch: 2,
    label: "🪨 Đĩa Sân Đá Cổ Ngữ (Tâm Vòng Ghế)",
    fileName: "plaza_cobblestone.glb",
    url: "/models/props/plaza_cobblestone.glb",
    targetHeight: 0.12,
    flushTopSurface: true,
    defaultDiameter: 11.2,
    maxSlabThickness: 0.14,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  tree_pine_tall: {
    id: "tree_pine_tall",
    batch: 2,
    label: "🌲 Cây Thông Cổ Thụ Cao (Rừng)",
    fileName: "tree_pine_tall.glb",
    url: "/models/props/tree_pine_tall.glb",
    targetHeight: 8.8,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  tree_pine_wide: {
    id: "tree_pine_wide",
    batch: 2,
    label: "🌳 Cây Thông Tán Xòe Rậm (Rừng)",
    fileName: "tree_pine_wide.glb",
    url: "/models/props/tree_pine_wide.glb",
    targetHeight: 7.2,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  tree_dead_gnarled: {
    id: "tree_dead_gnarled",
    batch: 2,
    label: "🍂 Cây Khô Vặn Xoắn Ma Mị (Rừng)",
    fileName: "tree_dead_gnarled.glb",
    url: "/models/props/tree_dead_gnarled.glb",
    targetHeight: 6.6,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  prop_lantern: {
    id: "prop_lantern",
    batch: 2,
    label: "🏮 Cột Đèn Lồng Sắt Rèn (Đường Làng)",
    fileName: "prop_lantern.glb",
    url: "/models/props/prop_lantern.glb",
    targetHeight: 2.85,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  prop_fence_rock: {
    id: "prop_fence_rock",
    batch: 2,
    label: "🪨 Hàng Rào Gỗ & Đá Rêu (Bìa Rừng)",
    fileName: "prop_fence_rock.glb",
    url: "/models/props/prop_fence_rock.glb",
    targetHeight: 1.15,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },

  // ==================== ĐỢT 2.5: 6 LIVING HERO PROPS HOẠT CẢNH (KẾT NỐI SẴN 0 LỖI 404) ====================
  prop_witch_cauldron: {
    id: "prop_witch_cauldron",
    batch: 2,
    optionalHeroProp: true,
    shaderProfile: "cauldron_brew",
    label: "🧪 Vạc Gang Phù Thủy Sôi Thuốc",
    fileName: "prop_witch_cauldron.glb",
    url: "/models/props/prop_witch_cauldron.glb",
    targetHeight: 1.15,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  prop_village_banner: {
    id: "prop_village_banner",
    batch: 2,
    optionalHeroProp: true,
    shaderProfile: "cloth_banner",
    label: "🚩 Cờ Hiệu Làng Bắc Âu Bay Gió",
    fileName: "prop_village_banner.glb",
    url: "/models/props/prop_village_banner.glb",
    targetHeight: 3.85,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  prop_rune_obelisk: {
    id: "prop_rune_obelisk",
    batch: 2,
    optionalHeroProp: true,
    shaderProfile: "rune_pulse",
    label: "🗿 Trụ Đá Cổ Ngữ Bắc Âu Phát Sáng",
    fileName: "prop_rune_obelisk.glb",
    url: "/models/props/prop_rune_obelisk.glb",
    targetHeight: 2.65,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  prop_cart_brazier: {
    id: "prop_cart_brazier",
    batch: 2,
    optionalHeroProp: true,
    shaderProfile: "campfire",
    label: "🔥 Chảo Lửa Ba Chân Sắt Rèn",
    fileName: "prop_cart_brazier.glb",
    url: "/models/props/prop_cart_brazier.glb",
    targetHeight: 1.65,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  prop_mist_well: {
    id: "prop_mist_well",
    batch: 2,
    optionalHeroProp: true,
    label: "⛲ Giếng Đá Cổ Bốc Sương Lạnh",
    fileName: "prop_mist_well.glb",
    url: "/models/props/prop_mist_well.glb",
    targetHeight: 2.35,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  prop_nordic_raven: {
    id: "prop_nordic_raven",
    batch: 2,
    optionalHeroProp: true,
    label: "🐦‍⬛ Quạ Đen Bắc Âu Đậu Cọc Gỗ",
    fileName: "prop_nordic_raven.glb",
    url: "/models/props/prop_nordic_raven.glb",
    targetHeight: 0.95,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },

  // ==================== ĐỢT 4 (V4.5): 8 SOCKET BOX-BLOCKOUT HỌC VIỆN ĐÊM (0 LỖI 404 • HOT-SWAP .GLB 1:1) ====================
  acad_clocktower: {
    id: "acad_clocktower",
    batch: 2,
    optionalHeroProp: true,
    label: "🕰️ Tháp Đồng Hồ Huyết Nguyệt (Box→GLB)",
    fileName: "acad_clocktower.glb",
    url: "/models/props/acad_clocktower.glb",
    targetHeight: 11.5,
    castDynamicShadow: true,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  acad_cloister_wing: {
    id: "acad_cloister_wing",
    batch: 2,
    optionalHeroProp: true,
    label: "🏛️ Hành Lang Vòm Kính Màu (Box→GLB)",
    fileName: "acad_cloister_wing.glb",
    url: "/models/props/acad_cloister_wing.glb",
    targetHeight: 5.8,
    castDynamicShadow: true,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  acad_iron_gate: {
    id: "acad_iron_gate",
    batch: 2,
    optionalHeroProp: true,
    label: "⛩️ Cổng Sắt Rèn Học Viện (Box→GLB)",
    fileName: "acad_iron_gate.glb",
    url: "/models/props/acad_iron_gate.glb",
    targetHeight: 5.2,
    castDynamicShadow: true,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  acad_owl_statue: {
    id: "acad_owl_statue",
    batch: 2,
    optionalHeroProp: true,
    label: "🦉 Tượng Đá Cú Đêm Hộ Vệ (Box→GLB)",
    fileName: "acad_owl_statue.glb",
    url: "/models/props/acad_owl_statue.glb",
    targetHeight: 3.4,
    castDynamicShadow: true,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  acad_floating_candles: {
    id: "acad_floating_candles",
    batch: 2,
    optionalHeroProp: true,
    label: "🕯️ Chùm Nến Phép Thuật Lơ Lửng (Box→GLB)",
    fileName: "acad_floating_candles.glb",
    url: "/models/props/acad_floating_candles.glb",
    targetHeight: 3.6,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  acad_alchemy_brazier: {
    id: "acad_alchemy_brazier",
    batch: 2,
    optionalHeroProp: true,
    shaderProfile: "campfire",
    label: "🔮 Đỉnh Lửa Giả Kim Tím Lam (Box→GLB)",
    fileName: "acad_alchemy_brazier.glb",
    url: "/models/props/acad_alchemy_brazier.glb",
    targetHeight: 1.8,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  acad_stone_bench: {
    id: "acad_stone_bench",
    batch: 2,
    optionalHeroProp: true,
    label: "📚 Ghế Đá Sân Học Viện & Sách Cổ (Box→GLB)",
    fileName: "acad_stone_bench.glb",
    url: "/models/props/acad_stone_bench.glb",
    targetHeight: 0.95,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
  acad_cypress_tree: {
    id: "acad_cypress_tree",
    batch: 2,
    optionalHeroProp: true,
    label: "🌲 Cây Bách Tùng Cắt Tỉa Đêm (Box→GLB)",
    fileName: "acad_cypress_tree.glb",
    url: "/models/props/acad_cypress_tree.glb",
    targetHeight: 7.8,
    defaultYawDeg: 0,
    defaultScale: 1.0,
    defaultYOffset: 0.0,
    defaultZOffset: 0.0,
  },
};

export const PROP_KEYS = Object.keys(PROP_MANIFEST);

let conceptsManifestPromise = null;
const conceptRegistryListeners = new Set();

export function subscribeConceptManifestChanges(listener) {
  conceptRegistryListeners.add(listener);
  return () => conceptRegistryListeners.delete(listener);
}

/**
 * Hợp nhất động toàn bộ file .GLB từ thư mục "MODEL CONCEPT THEM" (concepts_manifest.json)
 * vào PROP_MANIFEST (Đợt 3 — batch: 3) mà không chạm tới 12 model gốc Đợt 1 & Đợt 2!
 */
export function registerDynamicConceptProps(conceptsDoc) {
  const items = Array.isArray(conceptsDoc?.items) ? conceptsDoc.items : [];
  const activeConceptKeys = new Set();

  items.forEach((it) => {
    if (!it?.propKey || !it?.url) return;
    const key = String(it.propKey);
    // Bảo vệ 100% 12 khe gốc Đợt 1 & Đợt 2
    if (PROP_MANIFEST[key] && PROP_MANIFEST[key].batch !== 3) return;

    activeConceptKeys.add(key);
    PROP_MANIFEST[key] = {
      id: key,
      batch: 3,
      isConcept: true,
      label: it.label || `🧩 ${key}`,
      shortLabel: it.shortLabel || key,
      fileName: it.fileName || `${key}.glb`,
      sourceName: it.sourceName || it.fileName || `${key}.glb`,
      url: it.url,
      category: it.category || "props",
      shaderProfile: it.shaderProfile || "standard",
      targetHeight: Number(it.targetHeight) > 0 ? Number(it.targetHeight) : 2.0,
      rawSize: Array.isArray(it.rawSize) ? it.rawSize : [1, 1, 1],
      hitBoxSize: Array.isArray(it.hitBoxSize) ? it.hitBoxSize : [2, 2, 2],
      centerHeight: Number(it.centerHeight) > 0 ? Number(it.centerHeight) : 1.0,
      aoRadius: Number.isFinite(Number(it.aoRadius)) ? Number(it.aoRadius) : 1.0,
      aoOpacity: Number.isFinite(Number(it.aoOpacity)) ? Number(it.aoOpacity) : 0.6,
      allowCenterZone: Boolean(it.allowCenterZone),
      isSurfaceCandidate: Boolean(it.isSurfaceCandidate),
      defaultSpawnRadius: Number.isFinite(Number(it.defaultSpawnRadius)) ? Number(it.defaultSpawnRadius) : 11.5,
      defaultSpawnY: Number.isFinite(Number(it.defaultSpawnY)) ? Number(it.defaultSpawnY) : 0,
      sizeMB: Number(it.sizeMB || 0),
      mtimeMs: Number(it.mtimeMs || 0),
      defaultYawDeg: 0,
      defaultScale: 1.0,
      defaultYOffset: 0.0,
      defaultZOffset: 0.0,
    };
    if (!PROP_KEYS.includes(key)) {
      PROP_KEYS.push(key);
    }
  });

  // Dọn các key batch=3 cũ nếu người dùng đã xóa file khỏi "MODEL CONCEPT THEM"
  for (let i = PROP_KEYS.length - 1; i >= 0; i--) {
    const k = PROP_KEYS[i];
    if (PROP_MANIFEST[k]?.batch === 3 && !activeConceptKeys.has(k)) {
      delete PROP_MANIFEST[k];
      PROP_KEYS.splice(i, 1);
    }
  }

  conceptRegistryListeners.forEach((fn) => {
    try {
      fn(items);
    } catch {
      // ignore
    }
  });

  return items;
}

export async function fetchAndRegisterConceptProps({ bustCache = false } = {}) {
  if (!bustCache && conceptsManifestPromise) {
    return conceptsManifestPromise;
  }
  const query = bustCache ? `?t=${Date.now()}` : `?v=${ASSET_SYNC_VERSION}`;
  const req = fetch(`/models/props/concepts_manifest.json${query}`, {
    cache: bustCache ? "no-store" : "default",
  })
    .then(async (res) => {
      if (!res.ok) return [];
      const ctype = (res.headers.get("content-type") || "").toLowerCase();
      if (!ctype.includes("json")) return [];
      const doc = await res.json();
      return registerDynamicConceptProps(doc);
    })
    .catch(() => []);

  if (!bustCache) {
    conceptsManifestPromise = req;
  } else {
    conceptsManifestPromise = req;
  }
  return req;
}

// Phân luồng 3 đợt nạp ngầm cuốn chiếu (Idle Staggered Preload) giúp vào phòng mượt 60 FPS không khựng GPU
export const PRELOAD_TIERS = {
  TIER_1_CORE: ["prop_chair", "prop_campfire", "plaza_cobblestone", "prop_gallows"],
  TIER_2_VILLAGE: [
    "house_cottage_a",
    "house_cottage_b",
    "landmark_belltower",
    "prop_lantern",
    "prop_fence_rock",
  ],
  TIER_3_FOREST: ["tree_pine_tall", "tree_pine_wide", "tree_dead_gnarled"],
};

export const SKY_CANDIDATES = {
  night: [
    "/models/sky/sky_night.webp",
    "/models/sky/sky_night.jpg",
    "/models/sky/sky_night.png",
  ],
  day: [
    "/models/sky/sky_day.webp",
    "/models/sky/sky_day.jpg",
    "/models/sky/sky_day.png",
  ],
};

const CALIB_STORAGE_KEY = "werewolf_prop_calib_v1";

export function loadPropCalibration() {
  try {
    const raw = localStorage.getItem(CALIB_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function savePropCalibration(calibMap) {
  try {
    localStorage.setItem(CALIB_STORAGE_KEY, JSON.stringify(calibMap || {}));
  } catch {
    // ignore
  }
}

export function resetPropCalibration() {
  try {
    localStorage.removeItem(CALIB_STORAGE_KEY);
  } catch {
    // ignore
  }
}
