/**
 * Danh mục chuẩn hóa 12 Đạo Cụ Ngoại Cảnh (.GLB xuất thẳng từ Tripo Pro):
 * - Đợt 1 (6 món chính — Đã hoàn tất 6/6): Ghế, Bếp đá, Đài treo cổ, Nhà mẫu A, Nhà mẫu B, Tháp chuông.
 * - Đợt 2 (6 món mở rộng): Sân đá cổ ngữ, Thông cao, Thông tán rộng, Cây khô vặn xoắn, Cột đèn lồng, Hàng rào đá rêu.
 */

export const ASSET_SYNC_VERSION = 8;
export const SKY_ENABLED = false;

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
};

export const PROP_KEYS = Object.keys(PROP_MANIFEST);

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
