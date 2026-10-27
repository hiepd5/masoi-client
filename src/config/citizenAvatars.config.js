import { ASSET_SYNC_VERSION } from "../3d/config/propManifest.js";

/**
 * 4 Nhân Vật Dân Làng 3D Mặc Định hiển thị siêu gọn trên thẻ "👤 Hồ Sơ Của Bạn" ở Trang chủ.
 * Đồng bộ 1:1 giữa Model 3D ngồi ghế 0.48m, bản ⚡ 2D Lite và ảnh đại diện khung Chat (0% api.dicebear.com).
 */
export const BUILTIN_VILLAGER_AVATARS = [
  {
    id: "villager_cloak",
    slotKey: "villager_cloak",
    label: "Áo Choàng Bí Ẩn",
    shortLabel: "Áo Choàng",
    desc: "Lữ khách khoác áo choàng Bắc Âu cổ điển",
    status: "ready",
    source: "builtin_villager",
    botAllowed: true,
    glbUrl: "/models/characters/char_villager_cloak.glb",
    portraitBadge: "/portraits/badges/villager_cloak.webp",
    portraitCard: "/portraits/cards/villager_cloak.webp",
  },
  {
    id: "villager_true",
    slotKey: "villager_true",
    label: "Nông Dân Bắc Âu",
    shortLabel: "Nông Dân",
    desc: "Thanh niên dân làng chất phác, nhanh nhẹn",
    status: "ready",
    source: "builtin_villager",
    botAllowed: true,
    glbUrl: "/models/characters/char_villager_true.glb",
    portraitBadge: "/portraits/badges/villager.webp",
    portraitCard: "/portraits/cards/villager.webp",
  },
  {
    id: "villager_female",
    slotKey: "villager_female",
    label: "Thôn Nữ Khăn Choàng",
    shortLabel: "Thôn Nữ",
    desc: "Thôn nữ quàng khăn len ấm giữa sương đêm",
    status: "ready",
    source: "builtin_villager",
    botAllowed: true,
    glbUrl: "/models/characters/char_villager_female.glb",
    portraitBadge: "/portraits/badges/villager_female.webp",
    portraitCard: "/portraits/cards/villager_female.webp",
  },
  {
    id: "villager_elder",
    slotKey: "villager_elder",
    label: "Bô Lão Thông Thái",
    shortLabel: "Bô Lão",
    desc: "Bậc trưởng thượng điềm tĩnh bên bếp lửa làng",
    status: "ready",
    source: "builtin_villager",
    botAllowed: true,
    glbUrl: "/models/characters/char_villager_elder.glb",
    portraitBadge: "/portraits/badges/villager_elder.webp",
    portraitCard: "/portraits/cards/villager_elder.webp",
  },
];

export const DEFAULT_RESERVED_SLOTS_COUNT = 12;

export function buildDefaultReservedHumanSlots(count = DEFAULT_RESERVED_SLOTS_COUNT) {
  return Array.from({ length: count }, (_, idx) => {
    const slotNum = idx + 1;
    const pad = String(slotNum).padStart(2, "0");
    return {
      id: `avatar_real_${pad}`,
      slotNumber: slotNum,
      label: `Người Thật 3D #${pad}`,
      shortLabel: `Ô Chờ #${pad}`,
      desc: "Ô chờ nạp Model 3D Người Thật • Chuẩn bị đồng bộ Database User",
      status: "reserved",
      source: "custom_3d_human",
      botAllowed: false,
      glbUrl: null,
      portraitBadge: null,
      portraitCard: null,
    };
  });
}

let cachedCatalog = {
  builtinVillagers: BUILTIN_VILLAGER_AVATARS,
  customHumanAvatars: buildDefaultReservedHumanSlots(),
};
let loadedCatalogOnce = false;
let inflightCatalogPromise = null;
const catalogListeners = new Set();

function notifyCatalogListeners() {
  catalogListeners.forEach((fn) => {
    try {
      fn(cachedCatalog);
    } catch {
      // ignore listener error
    }
  });
}

export function subscribeCitizenAvatarCatalog(fn) {
  catalogListeners.add(fn);
  return () => catalogListeners.delete(fn);
}

export function getCitizenAvatarCatalogSnapshot() {
  return cachedCatalog;
}

export async function loadCitizenAvatarCatalog({ force = false } = {}) {
  if (loadedCatalogOnce && !force) return cachedCatalog;
  if (inflightCatalogPromise && !force) return inflightCatalogPromise;

  inflightCatalogPromise = (async () => {
    try {
      const res = await fetch(`/models/avatars/avatars_manifest.json?v=${ASSET_SYNC_VERSION}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const doc = await res.json();
        const customList = Array.isArray(doc?.customHumanAvatars) && doc.customHumanAvatars.length > 0
          ? doc.customHumanAvatars
          : buildDefaultReservedHumanSlots();
        cachedCatalog = {
          builtinVillagers: BUILTIN_VILLAGER_AVATARS,
          customHumanAvatars: customList,
        };
      }
    } catch {
      // Giữ danh mục mặc định nếu offline
    }
    loadedCatalogOnce = true;
    notifyCatalogListeners();
    return cachedCatalog;
  })();

  try {
    return await inflightCatalogPromise;
  } finally {
    inflightCatalogPromise = null;
  }
}

export function getCitizenAvatarMeta(citizenModelId) {
  if (!citizenModelId) return BUILTIN_VILLAGER_AVATARS[0];
  const builtin = BUILTIN_VILLAGER_AVATARS.find((item) => item.id === citizenModelId);
  if (builtin) return builtin;

  const customReady = cachedCatalog.customHumanAvatars.find(
    (item) => item.id === citizenModelId && item.status === "ready" && item.glbUrl
  );
  if (customReady) return customReady;

  return BUILTIN_VILLAGER_AVATARS[0];
}

export function isReadyCitizenModelId(citizenModelId) {
  if (!citizenModelId) return false;
  if (BUILTIN_VILLAGER_AVATARS.some((item) => item.id === citizenModelId)) return true;
  return cachedCatalog.customHumanAvatars.some(
    (item) => item.id === citizenModelId && item.status === "ready" && Boolean(item.glbUrl)
  );
}

const CITIZEN_STORAGE_KEY = "ws_citizen_model_id";

export function getStoredCitizenModelId() {
  if (typeof window === "undefined") return "villager_cloak";
  try {
    const raw = localStorage.getItem(CITIZEN_STORAGE_KEY) || sessionStorage.getItem(CITIZEN_STORAGE_KEY);
    if (raw && isReadyCitizenModelId(raw)) return raw;
  } catch {
    // ignore storage errors
  }
  return "villager_cloak";
}

export function saveStoredCitizenModelId(citizenModelId) {
  const meta = getCitizenAvatarMeta(citizenModelId);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(CITIZEN_STORAGE_KEY, meta.id);
      sessionStorage.setItem(CITIZEN_STORAGE_KEY, meta.id);
      sessionStorage.setItem("ws_avatar_url", meta.portraitBadge || "/portraits/badges/villager_cloak.webp");
    } catch {
      // ignore storage errors
    }
  }
  return meta;
}
