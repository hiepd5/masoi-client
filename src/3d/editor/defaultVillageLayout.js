// =============================================================================
// HỆ THỐNG DỮ LIỆU SCENE GRAPH NGOẠI CẢNH (D5 ARCHITECT SCENE LAYOUT)
// - Quản lý toàn bộ cảnh quan ngoài (Nhà, Tháp chuông, Đài treo cổ, Sân đá,
//   Lửa trại, Đèn lồng, Hàng rào, Đá rêu & 84 Cây rừng 3 loài).
// - TUYỆT ĐỐI KHÔNG ĐỤNG TỚI GHẾ NGỒI (prop_chair) & NGƯỜI CHƠI!
// =============================================================================

import {
  ASSET_SYNC_VERSION,
  PROP_MANIFEST,
  fetchAndRegisterConceptProps,
  subscribeConceptManifestChanges,
} from "../config/propManifest.js";

export const LAYOUT_SCHEMA_VERSION = 1;
export const LAYOUT_REF_CIRCLE_RADIUS = 4.2;
// Bán kính vùng cấm đặt công trình/cây đè lên ghế người chơi (bao trọn phòng tối đa 12 ghế = 5.4m + đệm 0.8m)
export const NO_BUILD_SEAT_RADIUS = 6.2;

export const DEFAULT_SCENE_PRESET_ID = "nordic_village_v3";
export const LOCAL_DRAFT_STORAGE_KEY = "ws_d5_village_layout_draft_v1";
export const PUBLIC_LAYOUT_URL = "/config/village_layout.json";
export const SCENE_PRESETS_INDEX_URL = "/config/scene_presets_index.json";

function getDraftStorageKey(presetId = DEFAULT_SCENE_PRESET_ID) {
  const safeId = String(presetId || DEFAULT_SCENE_PRESET_ID).trim() || DEFAULT_SCENE_PRESET_ID;
  if (safeId === DEFAULT_SCENE_PRESET_ID) return LOCAL_DRAFT_STORAGE_KEY;
  return `ws_d5_preset_draft_v1_${safeId}`;
}

function getDevServerOrigin() {
  if (import.meta.env?.PROD) return "";
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:3001`;
  }
  return "http://localhost:3001";
}

export function isDevArchitectAllowed() {
  // SEC-06: Khóa cứng 100% trên bản Build Production & bên trong App CapacitorJS (nơi hostname cũng là "localhost"!)
  if (import.meta.env?.PROD) return false;
  if (typeof window !== "undefined") {
    try {
      if (window.Capacitor?.isNativePlatform?.()) return false;
      const proto = String(window.location?.protocol || "").toLowerCase();
      if (proto === "capacitor:" || proto === "ionic:") return false;
    } catch {
      return false;
    }
  }
  return Boolean(import.meta.env?.DEV);
}

export const EXTERIOR_CATEGORIES = [
  { id: "all", label: "Tất cả" },
  { id: "concepts", label: "🌟 Concept Mới" },
  { id: "architecture", label: "🏰 Kiến trúc" },
  { id: "props", label: "🏮 Tiểu cảnh" },
  { id: "forest", label: "🌲 Rừng cây" },
  { id: "centerpiece", label: "🔥 Tâm sân" },
];

export const EXTERIOR_ASSET_CATALOG = {
  house_cottage_a: {
    type: "house_cottage_a",
    propKey: "house_cottage_a",
    label: "🏠 Nhà Gỗ Đá Kiểu A",
    shortLabel: "Nhà Gỗ Đá A",
    category: "architecture",
    centerHeight: 2.55,
    hitBoxSize: [4.3, 5.6, 4.3],
    aoRadius: 3.1,
    aoScaleXZ: [1.1, 0.95],
    aoOpacity: 0.7,
    defaultSpawnRadius: 14.8,
    allowCenterZone: false,
    deletable: true,
  },
  house_cottage_b: {
    type: "house_cottage_b",
    propKey: "house_cottage_b",
    label: "🏡 Nhà Mái Rơm Kiểu B",
    shortLabel: "Nhà Mái Rơm B",
    category: "architecture",
    centerHeight: 2.45,
    hitBoxSize: [4.3, 5.3, 4.3],
    aoRadius: 3.1,
    aoScaleXZ: [1.1, 0.95],
    aoOpacity: 0.7,
    defaultSpawnRadius: 14.8,
    allowCenterZone: false,
    deletable: true,
  },
  landmark_belltower: {
    type: "landmark_belltower",
    propKey: "landmark_belltower",
    label: "🔔 Tháp Chuông Đá Gothic",
    shortLabel: "Tháp Chuông",
    category: "architecture",
    centerHeight: 4.35,
    hitBoxSize: [3.1, 9.5, 3.1],
    aoRadius: 2.6,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.72,
    defaultSpawnRadius: 16.6,
    allowCenterZone: false,
    deletable: true,
  },
  prop_gallows: {
    type: "prop_gallows",
    propKey: "prop_gallows",
    label: "⚖️ Đài Treo Cổ Gỗ",
    shortLabel: "Đài Treo Cổ",
    category: "architecture",
    centerHeight: 1.95,
    hitBoxSize: [3.2, 4.2, 3.0],
    aoRadius: 2.2,
    aoScaleXZ: [1.15, 0.9],
    aoOpacity: 0.68,
    defaultSpawnRadius: 9.6,
    allowCenterZone: false,
    deletable: true,
  },
  prop_lantern: {
    type: "prop_lantern",
    propKey: "prop_lantern",
    label: "🏮 Cột Đèn Lồng Sắt Rèn",
    shortLabel: "Cột Đèn Lồng",
    category: "props",
    centerHeight: 1.38,
    hitBoxSize: [1.05, 2.85, 1.05],
    aoRadius: 0.55,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.55,
    defaultSpawnRadius: 8.65,
    allowCenterZone: false,
    deletable: true,
  },
  prop_fence_rock: {
    type: "prop_fence_rock",
    propKey: "prop_fence_rock",
    label: "🪵 Hàng Rào Gỗ & Đá Rêu",
    shortLabel: "Hàng Rào Đá",
    category: "props",
    centerHeight: 0.56,
    hitBoxSize: [2.35, 1.25, 1.05],
    aoRadius: 1.35,
    aoScaleXZ: [1.15, 0.5],
    aoOpacity: 0.52,
    defaultSpawnRadius: 13.35,
    allowCenterZone: false,
    deletable: true,
  },
  procedural_rock: {
    type: "procedural_rock",
    propKey: null,
    label: "🪨 Tảng Đá Rêu Rừng",
    shortLabel: "Tảng Đá Rêu",
    category: "props",
    centerHeight: 0.36,
    hitBoxSize: [1.45, 0.85, 1.35],
    aoRadius: 0.75,
    aoScaleXZ: [1.15, 0.95],
    aoOpacity: 0.5,
    defaultSpawnRadius: 11.2,
    allowCenterZone: false,
    deletable: true,
  },
  prop_witch_cauldron: {
    type: "prop_witch_cauldron",
    propKey: "prop_witch_cauldron",
    label: "🧪 Vạc Gang Phù Thủy Sôi Thuốc",
    shortLabel: "Vạc Phù Thủy",
    category: "props",
    centerHeight: 0.62,
    hitBoxSize: [1.25, 1.35, 1.25],
    aoRadius: 0.85,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.62,
    defaultSpawnRadius: 9.2,
    allowCenterZone: false,
    deletable: true,
  },
  prop_village_banner: {
    type: "prop_village_banner",
    propKey: "prop_village_banner",
    label: "🚩 Cờ Hiệu Làng Bắc Âu Bay Gió",
    shortLabel: "Cờ Hiệu Làng",
    category: "props",
    centerHeight: 1.9,
    hitBoxSize: [1.2, 3.9, 0.9],
    aoRadius: 0.68,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.55,
    defaultSpawnRadius: 10.4,
    allowCenterZone: false,
    deletable: true,
  },
  prop_rune_obelisk: {
    type: "prop_rune_obelisk",
    propKey: "prop_rune_obelisk",
    label: "🗿 Trụ Đá Cổ Ngữ Bắc Âu",
    shortLabel: "Trụ Đá Rune",
    category: "props",
    centerHeight: 1.35,
    hitBoxSize: [1.15, 2.75, 1.15],
    aoRadius: 0.92,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.64,
    defaultSpawnRadius: 11.4,
    allowCenterZone: false,
    deletable: true,
  },
  prop_cart_brazier: {
    type: "prop_cart_brazier",
    propKey: "prop_cart_brazier",
    label: "🔥 Chảo Lửa Ba Chân Sắt Rèn",
    shortLabel: "Chảo Lửa Rèn",
    category: "props",
    centerHeight: 0.85,
    hitBoxSize: [1.1, 1.75, 1.1],
    aoRadius: 0.82,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.6,
    defaultSpawnRadius: 8.9,
    allowCenterZone: false,
    deletable: true,
  },
  prop_mist_well: {
    type: "prop_mist_well",
    propKey: "prop_mist_well",
    label: "⛲ Giếng Đá Cổ Bốc Sương",
    shortLabel: "Giếng Sương Cổ",
    category: "architecture",
    centerHeight: 1.2,
    hitBoxSize: [1.95, 2.45, 1.95],
    aoRadius: 1.35,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.68,
    defaultSpawnRadius: 11.8,
    allowCenterZone: false,
    deletable: true,
  },
  prop_nordic_raven: {
    type: "prop_nordic_raven",
    propKey: "prop_nordic_raven",
    label: "🐦‍⬛ Quạ Đen Bắc Âu Đậu Cọc",
    shortLabel: "Quạ Đen Cọc",
    category: "props",
    centerHeight: 0.5,
    hitBoxSize: [0.85, 1.1, 0.85],
    aoRadius: 0.45,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.48,
    defaultSpawnRadius: 9.4,
    allowCenterZone: false,
    deletable: true,
  },
  tree_pine_tall: {
    type: "tree_pine_tall",
    propKey: "tree_pine_tall",
    label: "🌲 Cây Thông Tùng Cao",
    shortLabel: "Thông Cao",
    category: "forest",
    variant: "tall",
    centerHeight: 3.65,
    hitRadius: 1.65,
    hitHeight: 8.6,
    aoRadius: 1.45,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.62,
    defaultSpawnRadius: 19.5,
    allowCenterZone: false,
    deletable: true,
  },
  tree_pine_wide: {
    type: "tree_pine_wide",
    propKey: "tree_pine_wide",
    label: "🌳 Cây Thông Già Tán Rộng",
    shortLabel: "Thông Tán Rộng",
    category: "forest",
    variant: "wide",
    centerHeight: 3.15,
    hitRadius: 2.05,
    hitHeight: 7.2,
    aoRadius: 1.55,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.62,
    defaultSpawnRadius: 20.5,
    allowCenterZone: false,
    deletable: true,
  },
  tree_dead_gnarled: {
    type: "tree_dead_gnarled",
    propKey: "tree_dead_gnarled",
    label: "🍂 Cây Khô Vặn Xoắn Ma Mị",
    shortLabel: "Cây Khô Ma Mị",
    category: "forest",
    variant: "dead",
    centerHeight: 2.85,
    hitRadius: 1.75,
    hitHeight: 6.5,
    aoRadius: 1.35,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.58,
    defaultSpawnRadius: 18.8,
    allowCenterZone: false,
    deletable: true,
  },
  prop_campfire: {
    type: "prop_campfire",
    propKey: "prop_campfire",
    label: "🔥 Bếp Đá Lửa Trại Tâm Sân",
    shortLabel: "Bếp Lửa Trại",
    category: "centerpiece",
    centerHeight: 0.34,
    hitRadius: 0.95,
    hitHeight: 0.85,
    aoRadius: 1.25,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.68,
    defaultSpawnRadius: 0,
    allowCenterZone: true,
    deletable: false,
  },
  plaza_cobblestone: {
    type: "plaza_cobblestone",
    propKey: "plaza_cobblestone",
    label: "🪨 Đĩa Sân Đá Cổ Ngữ",
    shortLabel: "Đĩa Sân Đá",
    category: "centerpiece",
    centerHeight: 0.12,
    clickableIn3D: false,
    aoRadius: 0,
    aoScaleXZ: [1, 1],
    aoOpacity: 0,
    defaultSpawnRadius: 0,
    allowCenterZone: true,
    deletable: false,
  },
  // ==================== 8 KHỐI KIẾN TRÚC BOX-BLOCKOUT HỌC VIỆN ĐÊM (V4.5 HOT-SWAP .GLB) ====================
  acad_clocktower: {
    type: "acad_clocktower",
    propKey: "acad_clocktower",
    label: "🕰️ Tháp Đồng Hồ Huyết Nguyệt",
    shortLabel: "Tháp Đồng Hồ",
    category: "architecture",
    centerHeight: 5.5,
    hitBoxSize: [3.8, 11.5, 3.8],
    aoRadius: 2.9,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.74,
    defaultSpawnRadius: 16.8,
    allowCenterZone: false,
    deletable: true,
  },
  acad_cloister_wing: {
    type: "acad_cloister_wing",
    propKey: "acad_cloister_wing",
    label: "🏛️ Hành Lang Vòm Kính Màu",
    shortLabel: "Hành Lang Vòm",
    category: "architecture",
    centerHeight: 2.85,
    hitBoxSize: [6.4, 5.8, 2.8],
    aoRadius: 3.6,
    aoScaleXZ: [1.35, 0.72],
    aoOpacity: 0.7,
    defaultSpawnRadius: 15.2,
    allowCenterZone: false,
    deletable: true,
  },
  acad_iron_gate: {
    type: "acad_iron_gate",
    propKey: "acad_iron_gate",
    label: "⛩️ Cổng Sắt Rèn Học Viện",
    shortLabel: "Cổng Sắt Rèn",
    category: "architecture",
    centerHeight: 2.55,
    hitBoxSize: [4.8, 5.2, 1.3],
    aoRadius: 2.7,
    aoScaleXZ: [1.25, 0.55],
    aoOpacity: 0.68,
    defaultSpawnRadius: 15.6,
    allowCenterZone: false,
    deletable: true,
  },
  acad_owl_statue: {
    type: "acad_owl_statue",
    propKey: "acad_owl_statue",
    label: "🦉 Tượng Đá Cú Đêm Hộ Vệ",
    shortLabel: "Tượng Cú Đêm",
    category: "props",
    centerHeight: 1.7,
    hitBoxSize: [1.6, 3.4, 1.6],
    aoRadius: 1.15,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.65,
    defaultSpawnRadius: 10.2,
    allowCenterZone: false,
    deletable: true,
  },
  acad_floating_candles: {
    type: "acad_floating_candles",
    propKey: "acad_floating_candles",
    label: "🕯️ Chùm Nến Phép Thuật Lơ Lửng",
    shortLabel: "Nến Lơ Lửng",
    category: "props",
    centerHeight: 2.4,
    hitBoxSize: [2.1, 3.6, 2.1],
    aoRadius: 0.55,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.42,
    defaultSpawnRadius: 7.8,
    allowCenterZone: false,
    deletable: true,
  },
  acad_alchemy_brazier: {
    type: "acad_alchemy_brazier",
    propKey: "acad_alchemy_brazier",
    label: "🔮 Đỉnh Lửa Giả Kim Tím",
    shortLabel: "Đỉnh Lửa Tím",
    category: "props",
    centerHeight: 0.9,
    hitBoxSize: [1.3, 1.85, 1.3],
    aoRadius: 0.85,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.62,
    defaultSpawnRadius: 8.4,
    allowCenterZone: false,
    deletable: true,
  },
  acad_stone_bench: {
    type: "acad_stone_bench",
    propKey: "acad_stone_bench",
    label: "📚 Ghế Đá Học Viện & Sách Cổ",
    shortLabel: "Ghế Đá Sách",
    category: "props",
    centerHeight: 0.48,
    hitBoxSize: [2.4, 1.0, 0.9],
    aoRadius: 1.35,
    aoScaleXZ: [1.18, 0.52],
    aoOpacity: 0.56,
    defaultSpawnRadius: 9.2,
    allowCenterZone: false,
    deletable: true,
  },
  acad_cypress_tree: {
    type: "acad_cypress_tree",
    propKey: "acad_cypress_tree",
    label: "🌲 Cây Bách Tùng Cắt Tỉa",
    shortLabel: "Bách Tùng Teen",
    category: "forest",
    centerHeight: 3.8,
    hitRadius: 1.35,
    hitHeight: 7.8,
    aoRadius: 1.35,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.62,
    defaultSpawnRadius: 18.4,
    allowCenterZone: false,
    deletable: true,
  },
};

export const SPAWNABLE_ASSET_TYPES = [
  "acad_clocktower",
  "acad_cloister_wing",
  "acad_iron_gate",
  "acad_owl_statue",
  "acad_floating_candles",
  "acad_alchemy_brazier",
  "acad_stone_bench",
  "acad_cypress_tree",
  "house_cottage_a",
  "house_cottage_b",
  "landmark_belltower",
  "prop_gallows",
  "prop_mist_well",
  "prop_witch_cauldron",
  "prop_village_banner",
  "prop_rune_obelisk",
  "prop_cart_brazier",
  "prop_nordic_raven",
  "prop_lantern",
  "prop_fence_rock",
  "procedural_rock",
  "tree_pine_tall",
  "tree_pine_wide",
  "tree_dead_gnarled",
];

/**
 * Tự động đăng ký toàn bộ file .GLB từ thư mục "MODEL CONCEPT THEM" vào Catalog D5 Studio
 */
export function registerDynamicCatalogFromConcepts(items = []) {
  const activeConceptTypes = new Set();

  (items || []).forEach((it) => {
    if (!it?.propKey) return;
    const key = String(it.propKey);
    if (EXTERIOR_ASSET_CATALOG[key] && !EXTERIOR_ASSET_CATALOG[key].isConcept) return;

    activeConceptTypes.add(key);
    EXTERIOR_ASSET_CATALOG[key] = {
      type: key,
      propKey: key,
      isConcept: true,
      batch: 3,
      label: it.label || `🧩 ${key}`,
      shortLabel: it.shortLabel || key,
      sourceName: it.sourceName || `${key}.glb`,
      sizeMB: Number(it.sizeMB || 0),
      category: it.category || "props",
      shaderProfile: it.shaderProfile || "standard",
      centerHeight: Number(it.centerHeight) > 0 ? Number(it.centerHeight) : 1.1,
      hitBoxSize: Array.isArray(it.hitBoxSize) ? it.hitBoxSize : [2.0, 2.2, 2.0],
      aoRadius: Number.isFinite(Number(it.aoRadius)) ? Number(it.aoRadius) : 1.0,
      aoScaleXZ: [1, 1],
      aoOpacity: Number.isFinite(Number(it.aoOpacity)) ? Number(it.aoOpacity) : 0.6,
      defaultSpawnRadius: Number.isFinite(Number(it.defaultSpawnRadius)) ? Number(it.defaultSpawnRadius) : 11.2,
      defaultSpawnY: Number.isFinite(Number(it.defaultSpawnY)) ? Number(it.defaultSpawnY) : 0,
      allowCenterZone: Boolean(it.allowCenterZone),
      isSurfaceCandidate: Boolean(it.isSurfaceCandidate),
      deletable: true,
    };

    if (!SPAWNABLE_ASSET_TYPES.includes(key)) {
      // Đưa các model Concept mới lên đầu danh sách hoặc cuối tùy lọc, giữ dễ thấy ngay!
      SPAWNABLE_ASSET_TYPES.unshift(key);
    }
  });

  // Dọn các concept cũ đã xóa khỏi thư mục nguồn
  for (let i = SPAWNABLE_ASSET_TYPES.length - 1; i >= 0; i--) {
    const t = SPAWNABLE_ASSET_TYPES[i];
    if (EXTERIOR_ASSET_CATALOG[t]?.isConcept && !activeConceptTypes.has(t)) {
      delete EXTERIOR_ASSET_CATALOG[t];
      SPAWNABLE_ASSET_TYPES.splice(i, 1);
    }
  }
}

subscribeConceptManifestChanges((items) => {
  registerDynamicCatalogFromConcepts(items);
});

export async function ensureDynamicConceptCatalogLoaded({ bustCache = false } = {}) {
  const items = await fetchAndRegisterConceptProps({ bustCache });
  registerDynamicCatalogFromConcepts(items);
  return items;
}

export function round3(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

export function clampScale(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return round3(Math.max(0.1, Math.min(12.0, n)));
}

export function normalizeLayoutNode(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  let meta = EXTERIOR_ASSET_CATALOG[raw.type];

  // Chống mất dữ liệu nếu file JSON chứa model concept_* được nạp trước khi manifest kịp phản hồi
  if (!meta && typeof raw.type === "string" && raw.type.startsWith("concept_")) {
    const manifestEntry = PROP_MANIFEST[raw.type];
    meta = {
      type: raw.type,
      propKey: raw.type,
      isConcept: true,
      batch: 3,
      label: manifestEntry?.label || raw.label || `🧩 ${raw.type}`,
      shortLabel: manifestEntry?.shortLabel || raw.label || raw.type,
      category: manifestEntry?.category || raw.category || "props",
      shaderProfile: manifestEntry?.shaderProfile || "standard",
      centerHeight: manifestEntry?.centerHeight || 1.2,
      hitBoxSize: manifestEntry?.hitBoxSize || [2.2, 2.4, 2.2],
      aoRadius: manifestEntry?.aoRadius ?? 1.0,
      aoScaleXZ: [1, 1],
      aoOpacity: manifestEntry?.aoOpacity ?? 0.6,
      allowCenterZone: Boolean(manifestEntry?.allowCenterZone ?? raw.allowCenterZone),
      isSurfaceCandidate: Boolean(manifestEntry?.isSurfaceCandidate),
      deletable: true,
    };
    EXTERIOR_ASSET_CATALOG[raw.type] = meta;
    if (!SPAWNABLE_ASSET_TYPES.includes(raw.type)) {
      SPAWNABLE_ASSET_TYPES.unshift(raw.type);
    }
  }

  if (!meta) return null;

  const pos = Array.isArray(raw.position) ? raw.position : [0, 0, 0];
  const rot = Array.isArray(raw.rotation) ? raw.rotation : [0, 0, 0];
  const scl = Array.isArray(raw.scale)
    ? raw.scale
    : typeof raw.scale === "number"
      ? [raw.scale, raw.scale, raw.scale]
      : [1, 1, 1];

  return {
    id: String(raw.id || `${raw.type}-${index}`),
    type: meta.type,
    label: String(raw.label || `${meta.shortLabel} #${index + 1}`),
    category: meta.category,
    position: [round3(pos[0]), round3(pos[1]), round3(pos[2])],
    rotation: [round3(rot[0]), round3(rot[1]), round3(rot[2])],
    scale: [clampScale(scl[0]), clampScale(scl[1]), clampScale(scl[2])],
    seed: round3(raw.seed ?? index * 0.73),
    allowCenterZone: Boolean(raw.allowCenterZone ?? meta.allowCenterZone),
    lockClick: Boolean(raw.lockClick ?? false),
    deletable: raw.deletable !== undefined ? Boolean(raw.deletable) : Boolean(meta.deletable),
  };
}

export function isNodeViolatingSeatZone(node) {
  if (!node || node.allowCenterZone) return false;
  const dist = Math.hypot(node.position[0] || 0, node.position[2] || 0);
  return dist < NO_BUILD_SEAT_RADIUS;
}

export function pushNodeOutsideSeatZone(node) {
  if (!node || node.allowCenterZone) return node;
  const x = Number(node.position[0] || 0);
  const z = Number(node.position[2] || 0);
  const dist = Math.hypot(x, z);
  const safeR = NO_BUILD_SEAT_RADIUS + 0.45;
  if (dist >= NO_BUILD_SEAT_RADIUS) return node;

  const ux = dist > 0.01 ? x / dist : 0;
  const uz = dist > 0.01 ? z / dist : -1;
  return {
    ...node,
    position: [round3(ux * safeR), round3(node.position[1] || 0), round3(uz * safeR)],
  };
}

/**
 * Khởi tạo 122 thực thể cảnh quan mặc định chuẩn tỷ lệ Kiến trúc Dark-Fantasy
 */
export function buildDefaultVillageNodes(baseRadius = LAYOUT_REF_CIRCLE_RADIUS) {
  const nodes = [];

  // 1. Đĩa Sân Đá Cổ Ngữ & Bếp Đá Lửa Trại Tâm Sân
  nodes.push(
    normalizeLayoutNode({
      id: "plaza-main",
      type: "plaza_cobblestone",
      label: "Đĩa Sân Đá Cổ Ngữ",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      allowCenterZone: true,
      deletable: false,
    }),
    normalizeLayoutNode({
      id: "campfire-main",
      type: "prop_campfire",
      label: "Bếp Lửa Trại Trung Tâm",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      allowCenterZone: true,
      deletable: false,
    })
  );

  // 2. Đài Treo Cổ hướng 12h Bắc & Tháp Chuông Đá Gothic
  nodes.push(
    normalizeLayoutNode({
      id: "gallows-north",
      type: "prop_gallows",
      label: "Đài Treo Cổ Hướng Bắc",
      position: [0, 0, -(baseRadius + 5.4)],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    }),
    normalizeLayoutNode({
      id: "belltower-north",
      type: "landmark_belltower",
      label: "Tháp Chuông Đá Gothic",
      position: [0, 0, -(baseRadius + 12.4)],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    })
  );

  // 3. 7 Căn Nhà Cổ Bao Quanh Làng
  [-142, -98, -48, 0, 48, 98, 142].forEach((deg, idx) => {
    const rad = (deg * Math.PI) / 180;
    const dist = baseRadius + 10.6 + (idx % 2 === 0 ? 0.5 : -0.3);
    const x = Math.sin(rad) * dist;
    const z = Math.cos(rad) * dist;
    const yaw = Math.atan2(-x, -z) + (idx % 2 === 0 ? 0.06 : -0.06);
    const type = idx % 2 === 0 ? "house_cottage_a" : "house_cottage_b";
    nodes.push(
      normalizeLayoutNode({
        id: `cottage-${idx + 1}`,
        type,
        label: `${idx % 2 === 0 ? "Nhà Gỗ Đá A" : "Nhà Mái Rơm B"} #${idx + 1}`,
        position: [x, 0, z],
        rotation: [0, yaw, 0],
        scale: [1, 1, 1],
      })
    );
  });

  // 4. 6 Cột Đèn Lồng Sắt Rèn
  [-155, -105, -45, 45, 105, 155].forEach((deg, idx) => {
    const rad = (deg * Math.PI) / 180;
    const dist = baseRadius + 4.45;
    const x = Math.sin(rad) * dist;
    const z = Math.cos(rad) * dist;
    nodes.push(
      normalizeLayoutNode({
        id: `lantern-${idx + 1}`,
        type: "prop_lantern",
        label: `Cột Đèn Lồng #${idx + 1}`,
        position: [x, 0, z],
        rotation: [0, Math.atan2(-x, -z), 0],
        scale: [1, 1, 1],
      })
    );
  });

  // 5. 6 Cụm Hàng Rào Gỗ & Đá Rêu
  [-122, -74, -24, 24, 74, 122].forEach((deg, idx) => {
    const rad = (deg * Math.PI) / 180;
    const dist = baseRadius + 9.15;
    const x = Math.sin(rad) * dist;
    const z = Math.cos(rad) * dist;
    nodes.push(
      normalizeLayoutNode({
        id: `fence-${idx + 1}`,
        type: "prop_fence_rock",
        label: `Hàng Rào Đá #${idx + 1}`,
        position: [x, 0, z],
        rotation: [0, Math.atan2(-x, -z), 0],
        scale: [1, 1, 1],
      })
    );
  });

  // 6. Tảng Đá Rêu Bìa Cỏ
  const goldenAngle = 2.39996323;
  let rockIdx = 1;
  for (let i = 0; i < 20; i++) {
    const a = i * goldenAngle * 1.7;
    const normA = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(Math.abs(normA) - Math.PI) < 0.24) continue;
    const r = baseRadius + 7.0 + (i % 5) * 1.95;
    const x = Math.sin(normA) * r;
    const z = Math.cos(normA) * r;
    const s = 0.36 + (i % 4) * 0.18;
    nodes.push(
      normalizeLayoutNode({
        id: `rock-${rockIdx}`,
        type: "procedural_rock",
        label: `Tảng Đá Rêu #${rockIdx}`,
        position: [x, 0, z],
        rotation: [0, i * 1.1, 0],
        scale: [s * 1.25, s * 0.72, s],
        seed: i * 0.91,
      })
    );
    rockIdx += 1;
  }

  // 6B. Bộ Công Trình Sống Huyền Bí Bắc Âu (#03 Trụ Đá Cổ Ngữ Rune & #05 Giếng Đá Sương Mù)
  const heroLandmarks = [
    {
      id: "rune-obelisk-noel-1",
      type: "prop_rune_obelisk",
      label: "Trụ Đá Cổ Ngữ Rune (#03)",
      deg: -72,
      dist: baseRadius + 6.35,
    },
    {
      id: "mist-well-noel-1",
      type: "prop_mist_well",
      label: "Giếng Đá Sương Mù Ánh Trăng (#05)",
      deg: 72,
      dist: baseRadius + 6.65,
    },
  ];
  heroLandmarks.forEach((hl) => {
    const rad = (hl.deg * Math.PI) / 180;
    const x = Math.sin(rad) * hl.dist;
    const z = Math.cos(rad) * hl.dist;
    nodes.push(
      normalizeLayoutNode({
        id: hl.id,
        type: hl.type,
        label: hl.label,
        position: [x, 0, z],
        rotation: [0, Math.atan2(-x, -z), 0],
        scale: [1, 1, 1],
      })
    );
  });

  // 7. 84 Cây Rừng Phân Tán Theo Góc Vàng (3 Chủng Loại)
  for (let i = 0; i < 84; i++) {
    const h1 = Math.sin(i * 12.9898 + 4.14) * 43758.5453;
    const rand1 = h1 - Math.floor(h1);
    const h2 = Math.sin(i * 78.233 + 1.97) * 43758.5453;
    const rand2 = h2 - Math.floor(h2);
    const h3 = Math.sin(i * 39.425 + 9.13) * 43758.5453;
    const rand3 = h3 - Math.floor(h3);

    const angle = (i * goldenAngle + (rand1 - 0.5) * 0.28) % (Math.PI * 2);
    const depthBand = Math.pow(rand2, 0.85);
    const r = baseRadius + 14.4 + depthBand * 16.0 + Math.sin(angle * 3) * 1.1;

    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;

    let type = "tree_pine_tall";
    let prefix = "Thông Cao";
    if (rand3 > 0.82) {
      type = "tree_dead_gnarled";
      prefix = "Cây Khô";
    } else if (rand3 > 0.44) {
      type = "tree_pine_wide";
      prefix = "Thông Rộng";
    }

    const s = 0.72 + rand1 * 0.64;
    const tiltX = (rand2 - 0.5) * 0.065;
    const tiltZ = (rand3 - 0.5) * 0.065;
    const rotY = rand1 * Math.PI * 2;

    nodes.push(
      normalizeLayoutNode({
        id: `tree-${i + 1}`,
        type,
        label: `${prefix} #${i + 1}`,
        position: [x, 0, z],
        rotation: [tiltX, rotY, tiltZ],
        scale: [s, s, s],
        seed: i * 0.73,
      })
    );
  }

  return nodes.filter(Boolean);
}

/**
 * Khởi tạo Bối Cảnh Sân Trống Chuẩn (Clean Courtyard Starter):
 * - Chỉ giữ Đĩa Sân Đá 1.52MB (plaza_cobblestone) + Bếp Lửa Trại ở tâm [0,0,0]
 * - Sạch 100% cây/nhà ngoại cảnh để Kiến trúc sư tự do bài trí Bối Cảnh Mới từ kho MODEL CONCEPT THEM!
 */
export function buildCleanCourtyardStarterNodes() {
  return [
    normalizeLayoutNode({
      id: "plaza-main",
      type: "plaza_cobblestone",
      label: "Đĩa Sân Đá Cổ Ngữ",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      allowCenterZone: true,
      deletable: true,
    }),
    normalizeLayoutNode({
      id: "campfire-main",
      type: "prop_campfire",
      label: "Bếp Lửa Trại Trung Tâm",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      allowCenterZone: true,
      deletable: false,
    }),
  ].filter(Boolean);
}

const FALLBACK_PRESETS_INDEX = {
  schemaVersion: 1,
  defaultPresetId: DEFAULT_SCENE_PRESET_ID,
  presets: [
    {
      id: DEFAULT_SCENE_PRESET_ID,
      name: "🌲 Làng Bắc Âu V3 (Chuẩn 141 thực thể)",
      description: "Bối cảnh rừng thông Bắc Âu sương mù, nhà gỗ & lửa trại mặc định (Bản Lề V3)",
      url: PUBLIC_LAYOUT_URL,
      builtIn: true,
      nodeCount: 141,
      moodHint: "auto",
    },
  ],
};

export async function loadScenePresetsIndex({ bustCache = false } = {}) {
  const devAllowed = isDevArchitectAllowed();
  const useNoStore = Boolean(bustCache || devAllowed);
  const query = useNoStore
    ? `?t=${Date.now()}`
    : `?v=${LAYOUT_SCHEMA_VERSION}_${ASSET_SYNC_VERSION}`;

  try {
    const res = await fetch(`${SCENE_PRESETS_INDEX_URL}${query}`, {
      cache: useNoStore ? "no-store" : "default",
    });
    if (res.ok) {
      const ctype = (res.headers.get("content-type") || "").toLowerCase();
      if (ctype.includes("json")) {
        const parsed = await res.json();
        if (Array.isArray(parsed?.presets) && parsed.presets.length > 0) {
          return {
            defaultPresetId: parsed.defaultPresetId || DEFAULT_SCENE_PRESET_ID,
            presets: parsed.presets,
          };
        }
      }
    }
  } catch {
    // fallback below
  }
  return FALLBACK_PRESETS_INDEX;
}

export async function loadInitialVillageLayout(requestedPresetId = null) {
  await ensureDynamicConceptCatalogLoaded();

  const devAllowed = isDevArchitectAllowed();
  const presetsIndex = await loadScenePresetsIndex();
  const activePresetId =
    requestedPresetId || presetsIndex.defaultPresetId || DEFAULT_SCENE_PRESET_ID;
  const presetMeta =
    presetsIndex.presets.find((p) => p.id === activePresetId) ||
    presetsIndex.presets[0] ||
    FALLBACK_PRESETS_INDEX.presets[0];

  const targetUrl = presetMeta?.url || PUBLIC_LAYOUT_URL;
  let publicDoc = null;

  try {
    const layoutUrl = devAllowed
      ? `${targetUrl}?t=${Date.now()}`
      : `${targetUrl}?v=${LAYOUT_SCHEMA_VERSION}_${ASSET_SYNC_VERSION}`;
    const res = await fetch(layoutUrl, { cache: devAllowed ? "no-store" : "default" });
    if (res.ok) {
      const ctype = (res.headers.get("content-type") || "").toLowerCase();
      if (ctype.includes("json")) {
        const parsed = await res.json();
        if (Array.isArray(parsed?.nodes) && parsed.nodes.length > 0) {
          publicDoc = parsed;
        }
      }
    }
  } catch {
    // fallback below
  }

  // Nếu đang ở chế độ Dev Architect trên Localhost, kiểm tra bản nháp mới hơn của đúng Preset này
  const draftKey = getDraftStorageKey(presetMeta.id);
  if (devAllowed && typeof window !== "undefined") {
    try {
      const rawDraft = localStorage.getItem(draftKey);
      if (rawDraft) {
        const draft = JSON.parse(rawDraft);
        const publicTime = Number(publicDoc?.updatedAtMs || 0);
        const draftTime = Number(draft?.updatedAtMs || 0);
        if (Array.isArray(draft?.nodes) && draft.nodes.length > 0 && draftTime > publicTime) {
          return {
            presetId: presetMeta.id,
            presetMeta,
            presetsIndex,
            nodes: draft.nodes.map((n, i) => normalizeLayoutNode(n, i)).filter(Boolean),
            source: "draft",
            hasUnsavedDraft: true,
          };
        }
      }
    } catch {
      // ignore invalid draft
    }
  }

  if (publicDoc) {
    return {
      presetId: presetMeta.id,
      presetMeta,
      presetsIndex,
      nodes: publicDoc.nodes.map((n, i) => normalizeLayoutNode(n, i)).filter(Boolean),
      source: "file",
      hasUnsavedDraft: false,
    };
  }

  return {
    presetId: presetMeta.id,
    presetMeta,
    presetsIndex,
    nodes: buildDefaultVillageNodes(),
    source: "default",
    hasUnsavedDraft: false,
  };
}

export function saveVillageDraftLocal(nodes, presetId = DEFAULT_SCENE_PRESET_ID) {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      presetId,
      updatedAtMs: Date.now(),
      updatedAtIso: new Date().toISOString(),
      nodes,
    };
    localStorage.setItem(getDraftStorageKey(presetId), JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

export function clearVillageDraftLocal(presetId = DEFAULT_SCENE_PRESET_ID) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(getDraftStorageKey(presetId));
  } catch {
    // ignore
  }
}

export async function saveScenePresetToServer({
  presetId = DEFAULT_SCENE_PRESET_ID,
  name = null,
  description = null,
  moodHint = "auto",
  setAsDefault = false,
  nodes = [],
}) {
  const cleanedNodes = nodes.map((n, idx) => normalizeLayoutNode(n, idx)).filter(Boolean);
  const payload = {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    presetId,
    name,
    description,
    moodHint,
    setAsDefault: Boolean(setAsDefault),
    updatedAtMs: Date.now(),
    updatedAtIso: new Date().toISOString(),
    nodes: cleanedNodes,
  };

  const endpoint = `${getDevServerOrigin()}/api/dev/scene-presets`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Lỗi lưu bối cảnh HTTP ${res.status}`);
  }
  clearVillageDraftLocal(data.preset?.id || presetId);
  return data;
}

export async function deleteScenePresetOnServer(presetId) {
  const endpoint = `${getDevServerOrigin()}/api/dev/scene-presets/${encodeURIComponent(presetId)}`;
  const res = await fetch(endpoint, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Lỗi xóa bối cảnh HTTP ${res.status}`);
  }
  clearVillageDraftLocal(presetId);
  return data;
}

export async function triggerSyncTripoConceptsOnServer() {
  const endpoint = `${getDevServerOrigin()}/api/dev/sync-tripo-concepts`;
  const res = await fetch(endpoint, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Lỗi quét kho Tripo HTTP ${res.status}`);
  }
  const items = await ensureDynamicConceptCatalogLoaded({ bustCache: true });
  return { ...data, items };
}

export async function saveVillageLayoutToProjectFile(nodes, presetId = DEFAULT_SCENE_PRESET_ID) {
  if (presetId && presetId !== DEFAULT_SCENE_PRESET_ID) {
    return saveScenePresetToServer({ presetId, nodes });
  }
  const payload = {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    updatedAtMs: Date.now(),
    updatedAtIso: new Date().toISOString(),
    note: "Bố cục không gian Làng Ma Sói 3D được dàn dựng bằng D5 Architect Studio (Không tác động ghế ngồi người chơi)",
    nodes: nodes.map((n, idx) => normalizeLayoutNode(n, idx)).filter(Boolean),
  };

  const endpoint = `${getDevServerOrigin()}/api/dev/village-layout`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Lỗi lưu file HTTP ${res.status}`);
  }
  clearVillageDraftLocal(DEFAULT_SCENE_PRESET_ID);
  return data;
}
