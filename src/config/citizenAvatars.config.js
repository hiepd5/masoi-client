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

/**
 * 6 Cổng Chờ Nhân Vật Teen Học Viện Đêm (V4.5 — Hot-Swap Tripo -> Blender -> Web .GLB):
 * - Có thể chọn thử ngay lập tức (dùng Proxy 3D có xương sẵn, 0 lỗi 404).
 * - Ngay khi thả file `char_teen_*.glb` đã tối ưu từ Blender vào `client/public/models/characters/`,
 *   cổng tự động nhận diện `status: "ready"` và thay thế 1:1 lên ghế 3D!
 */
export const TEEN_ACADEMY_AVATAR_SLOTS = [
  {
    id: "teen_detective",
    slotKey: "teen_detective",
    emblem: "🕵️",
    label: "Thám Tử Học Viện",
    shortLabel: "Thám Tử",
    desc: "Áo măng-tô học viện tối màu, chuyên soi manh mối đêm sương",
    expectedGlb: "char_teen_detective.glb",
    specNote: "Cao 1.78m • Y=0.00m • <=7.5k tris",
    status: "slot_waiting",
    source: "teen_academy_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/badges/villager_cloak.webp",
    portraitCard: "/portraits/cards/villager_cloak.webp",
  },
  {
    id: "teen_occult",
    slotKey: "teen_occult",
    emblem: "🔮",
    label: "Nữ Sinh Huyền Bí",
    shortLabel: "Huyền Bí",
    desc: "Đồng phục Gothic tím than & sổ tay chiêm tinh cổ ngữ",
    expectedGlb: "char_teen_occult.glb",
    specNote: "Cao 1.72m • Y=0.00m • <=7.5k tris",
    status: "slot_waiting",
    source: "teen_academy_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/badges/villager_female.webp",
    portraitCard: "/portraits/cards/villager_female.webp",
  },
  {
    id: "teen_idol",
    slotKey: "teen_idol",
    emblem: "🎧",
    label: "Idol Ký Túc Xá",
    shortLabel: "Idol Teen",
    desc: "Áo blazer học viện cách điệu & tai nghe ánh bạc cá tính",
    expectedGlb: "char_teen_idol.glb",
    specNote: "Cao 1.74m • Y=0.00m • <=7.5k tris",
    status: "slot_waiting",
    source: "teen_academy_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/badges/villager_female.webp",
    portraitCard: "/portraits/cards/villager_female.webp",
  },
  {
    id: "teen_hacker",
    slotKey: "teen_hacker",
    emblem: "💻",
    label: "Thiên Tài Giải Mã",
    shortLabel: "Giải Mã",
    desc: "Hoodie khoác ngoài sơ mi học viện, điềm tĩnh bắt bài Sói",
    expectedGlb: "char_teen_hacker.glb",
    specNote: "Cao 1.76m • Y=0.00m • <=7.5k tris",
    status: "slot_waiting",
    source: "teen_academy_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/badges/villager.webp",
    portraitCard: "/portraits/cards/villager.webp",
  },
  {
    id: "teen_varsity",
    slotKey: "teen_varsity",
    emblem: "🏀",
    label: "Đội Trưởng Áo Khoác",
    shortLabel: "Đội Trưởng",
    desc: "Áo khoác Varsity huy hiệu Học Viện Đêm năng động, vững chãi",
    expectedGlb: "char_teen_varsity.glb",
    specNote: "Cao 1.82m • Y=0.00m • <=7.5k tris",
    status: "slot_waiting",
    source: "teen_academy_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/badges/villager.webp",
    portraitCard: "/portraits/cards/villager.webp",
  },
  {
    id: "teen_rebel",
    slotKey: "teen_rebel",
    emblem: "🎸",
    label: "Nghệ Sĩ Đêm Trăng",
    shortLabel: "Nghệ Sĩ",
    desc: "Áo khoác da tối màu & khăn choàng đỏ thẫm lãng tử dưới trăng",
    expectedGlb: "char_teen_rebel.glb",
    specNote: "Cao 1.77m • Y=0.00m • <=7.5k tris",
    status: "slot_waiting",
    source: "teen_academy_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/badges/villager_cloak.webp",
    portraitCard: "/portraits/cards/villager_cloak.webp",
  },
];

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
  teenAcademyAvatars: TEEN_ACADEMY_AVATAR_SLOTS,
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
    let customList = buildDefaultReservedHumanSlots();
    let detectedCharacterMap = {};

    try {
      const charRes = await fetch(`/models/characters/characters_manifest.json?v=${ASSET_SYNC_VERSION}`, {
        cache: "no-store",
      });
      if (charRes.ok) {
        const charDoc = await charRes.json();
        if (charDoc && typeof charDoc.characters === "object") {
          detectedCharacterMap = { ...charDoc.characters };
        }
      }
    } catch {
      // ignore offline manifest
    }

    if (!import.meta.env.PROD) {
      try {
        const devCharRes = await fetch("http://localhost:3001/api/character-models", {
          cache: "no-store",
        });
        if (devCharRes.ok) {
          const devData = await devCharRes.json();
          if (devData && typeof devData.characters === "object") {
            detectedCharacterMap = { ...detectedCharacterMap, ...devData.characters };
          }
        }
      } catch {
        // ignore when local API not started yet
      }
    }

    let manifestTeenOverrides = [];
    try {
      const res = await fetch(`/models/avatars/avatars_manifest.json?v=${ASSET_SYNC_VERSION}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const doc = await res.json();
        if (Array.isArray(doc?.customHumanAvatars) && doc.customHumanAvatars.length > 0) {
          customList = doc.customHumanAvatars;
        }
        if (Array.isArray(doc?.teenAcademyAvatars)) {
          manifestTeenOverrides = doc.teenAcademyAvatars;
        }
      }
    } catch {
      // Giữ danh mục mặc định nếu offline
    }

    const mergedTeenList = TEEN_ACADEMY_AVATAR_SLOTS.map((slot) => {
      const override = manifestTeenOverrides.find((x) => x?.id === slot.id);
      const liveGlbUrl =
        detectedCharacterMap[slot.id] ||
        (override?.status === "ready" && override?.glbUrl ? override.glbUrl : null);
      if (liveGlbUrl) {
        return {
          ...slot,
          ...(override || {}),
          status: "ready",
          glbUrl: liveGlbUrl,
        };
      }
      return {
        ...slot,
        ...(override || {}),
      };
    });

    cachedCatalog = {
      builtinVillagers: BUILTIN_VILLAGER_AVATARS,
      teenAcademyAvatars: mergedTeenList,
      customHumanAvatars: customList,
    };
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

  const teenItem = (cachedCatalog.teenAcademyAvatars || TEEN_ACADEMY_AVATAR_SLOTS).find(
    (item) => item.id === citizenModelId
  );
  if (teenItem) return teenItem;

  const customReady = cachedCatalog.customHumanAvatars.find(
    (item) => item.id === citizenModelId && item.status === "ready" && item.glbUrl
  );
  if (customReady) return customReady;

  return BUILTIN_VILLAGER_AVATARS[0];
}

export function isReadyCitizenModelId(citizenModelId) {
  if (!citizenModelId) return false;
  if (BUILTIN_VILLAGER_AVATARS.some((item) => item.id === citizenModelId)) return true;
  if ((cachedCatalog.teenAcademyAvatars || TEEN_ACADEMY_AVATAR_SLOTS).some((item) => item.id === citizenModelId)) {
    return true;
  }
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
