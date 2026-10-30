import { ASSET_SYNC_VERSION } from "../3d/config/propManifest.js";
import { getApiBaseUrl } from "./runtimeEnv.js";

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

/**
 * 6 Nhân vật Không gian 💼 Công Sở & 6 Nhân vật Không gian 🎒 Học Đường (V4.6.2 Mobile Onboarding 1:1):
 * Đồng bộ trực tiếp từ màn Chọn Avatar Bước 3 -> Khung Chat -> Danh sách phòng -> Nhân vật Anime 3D ngồi ghế!
 */
export const OFFICE_UNIVERSE_AVATARS = [
  {
    id: "office_suit_m",
    slotKey: "office_suit_m",
    universeId: "office",
    label: "Trưởng Phòng Vest",
    shortLabel: "Trưởng Phòng",
    desc: "Vest xanh hải quân lịch lãm, điềm tĩnh phân tích KPI",
    status: "ready",
    source: "office_anime_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/universe/office_suit_m.svg",
    portraitCard: "/portraits/universe/office_suit_m.svg",
  },
  {
    id: "office_blazer_f",
    slotKey: "office_blazer_f",
    universeId: "office",
    label: "Chuyên Viên Blazer",
    shortLabel: "Chuyên Viên",
    desc: "Blazer tím than thanh lịch, sắc sảo đọc vị đồng nghiệp",
    status: "ready",
    source: "office_anime_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/universe/office_blazer_f.svg",
    portraitCard: "/portraits/universe/office_blazer_f.svg",
  },
  {
    id: "office_it_tech",
    slotKey: "office_it_tech",
    universeId: "office",
    label: "Kỹ Sư IT",
    shortLabel: "Kỹ Sư IT",
    desc: "Chuyên gia hệ thống đeo kính, soi log chuẩn từng giây",
    status: "ready",
    source: "office_anime_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/universe/office_it_tech.svg",
    portraitCard: "/portraits/universe/office_it_tech.svg",
  },
  {
    id: "office_hr_lead",
    slotKey: "office_blazer_f",
    universeId: "office",
    label: "Quản Lý Nhân Sự",
    shortLabel: "Nhân Sự",
    desc: "Tóc đuôi ngựa năng động, nắm giữ quy chế thưởng phạt",
    status: "ready",
    source: "office_anime_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/universe/office_hr_lead.svg",
    portraitCard: "/portraits/universe/office_hr_lead.svg",
  },
  {
    id: "office_intern_m",
    slotKey: "office_suit_m",
    universeId: "office",
    label: "Thực Tập Sinh",
    shortLabel: "Thực Tập",
    desc: "Trẻ trung nhiệt huyết, bất ngờ lật kèo phút chót",
    status: "ready",
    source: "office_anime_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/universe/office_intern_m.svg",
    portraitCard: "/portraits/universe/office_intern_m.svg",
  },
  {
    id: "office_finance_f",
    slotKey: "office_blazer_f",
    universeId: "office",
    label: "Cố Vấn Tài Chính",
    shortLabel: "Tài Chính",
    desc: "Chuẩn xác từng con số trên bảng lương tháng 13",
    status: "ready",
    source: "office_anime_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/universe/office_finance_f.svg",
    portraitCard: "/portraits/universe/office_finance_f.svg",
  },
];

export const SCHOOL_UNIVERSE_AVATARS = [
  {
    id: "school_boy_blazer",
    slotKey: "school_boy_blazer",
    universeId: "school",
    label: "Nam Sinh Thanh Lịch",
    shortLabel: "Nam Sinh",
    desc: "Sơ mi trắng cà-vạt đỏ chuẩn soái ca học đường",
    status: "ready",
    source: "school_anime_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/universe/school_boy_blazer.svg",
    portraitCard: "/portraits/universe/school_boy_blazer.svg",
  },
  {
    id: "school_girl_sailor",
    slotKey: "school_girl_sailor",
    universeId: "school",
    label: "Nữ Sinh Năng Động",
    shortLabel: "Nữ Sinh",
    desc: "Đồng phục nơ xanh đuôi ngựa rạng rỡ nắng chiều",
    status: "ready",
    source: "school_anime_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/universe/school_girl_sailor.svg",
    portraitCard: "/portraits/universe/school_girl_sailor.svg",
  },
  {
    id: "school_class_rep",
    slotKey: "school_girl_sailor",
    universeId: "school",
    label: "Lớp Trưởng Gương Mẫu",
    shortLabel: "Lớp Trưởng",
    desc: "Đeo kính thông thái, bảo vệ cờ thi đua cả lớp",
    status: "ready",
    source: "school_anime_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/universe/school_class_rep.svg",
    portraitCard: "/portraits/universe/school_class_rep.svg",
  },
  {
    id: "school_monitor_m",
    slotKey: "school_boy_blazer",
    universeId: "school",
    label: "Sao Đỏ Nội Quy",
    shortLabel: "Sao Đỏ",
    desc: "Băng đỏ trên vai, ánh mắt soi thấu mọi bàn cuối",
    status: "ready",
    source: "school_anime_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/universe/school_monitor_m.svg",
    portraitCard: "/portraits/universe/school_monitor_m.svg",
  },
  {
    id: "school_club_pres",
    slotKey: "school_boy_blazer",
    universeId: "school",
    label: "Hội Trưởng CLB",
    shortLabel: "Hội Trưởng",
    desc: "Hoạt ngôn tự tin, dẫn dắt thảo luận cả tổ",
    status: "ready",
    source: "school_anime_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/universe/school_club_pres.svg",
    portraitCard: "/portraits/universe/school_club_pres.svg",
  },
  {
    id: "school_scholar_f",
    slotKey: "school_girl_sailor",
    universeId: "school",
    label: "Thủ Khoa Bàn Đầu",
    shortLabel: "Thủ Khoa",
    desc: "Suy luận logic sắc bén như giải đề Toán học kỳ",
    status: "ready",
    source: "school_anime_3d",
    botAllowed: false,
    glbUrl: null,
    portraitBadge: "/portraits/universe/school_scholar_f.svg",
    portraitCard: "/portraits/universe/school_scholar_f.svg",
  },
];

export const UNIVERSE_ANIME_AVATARS = [
  ...OFFICE_UNIVERSE_AVATARS,
  ...SCHOOL_UNIVERSE_AVATARS,
];

export const ANIME_AVATAR_3D_LOOKS = Object.freeze({
  office_suit_m: { hairStyle: 2, hairColor: "#1e293b", eyeColor: "#0284c7", suitColor: "#1e3a5f", tieColor: "#0284c7" },
  office_blazer_f: { hairStyle: 1, hairColor: "#5c3317", eyeColor: "#d97706", suitColor: "#3b2f4a", tieColor: "#f59e0b" },
  office_it_tech: { hairStyle: 0, hairColor: "#231815", eyeColor: "#059669", suitColor: "#1f4e5f", tieColor: "#10b981" },
  office_hr_lead: { hairStyle: 3, hairColor: "#6b2138", eyeColor: "#db2777", suitColor: "#334155", tieColor: "#f43f5e" },
  office_intern_m: { hairStyle: 0, hairColor: "#854d0e", eyeColor: "#0284c7", suitColor: "#475569", tieColor: "#38bdf8" },
  office_finance_f: { hairStyle: 1, hairColor: "#3f2e26", eyeColor: "#7c3aed", suitColor: "#2c3e50", tieColor: "#a855f7" },
  school_boy_blazer: { hairStyle: 0, hairColor: "#231815", eyeColor: "#0284c7", suitColor: "#f8fafc", tieColor: "#e11d48" },
  school_girl_sailor: { hairStyle: 3, hairColor: "#5c3317", eyeColor: "#d97706", suitColor: "#eff6ff", tieColor: "#2563eb" },
  school_class_rep: { hairStyle: 1, hairColor: "#1e293b", eyeColor: "#7c3aed", suitColor: "#f8fafc", tieColor: "#e11d48" },
  school_monitor_m: { hairStyle: 2, hairColor: "#3f2e26", eyeColor: "#059669", suitColor: "#eff6ff", tieColor: "#dc2626" },
  school_club_pres: { hairStyle: 0, hairColor: "#854d0e", eyeColor: "#d97706", suitColor: "#f8fafc", tieColor: "#2563eb" },
  school_scholar_f: { hairStyle: 3, hairColor: "#6b2138", eyeColor: "#db2777", suitColor: "#eff6ff", tieColor: "#e11d48" },
});

export function getUniverseOnboardingAvatars(universeId = "classic") {
  if (universeId === "office") return OFFICE_UNIVERSE_AVATARS;
  if (universeId === "school") return SCHOOL_UNIVERSE_AVATARS;
  return [
    ...BUILTIN_VILLAGER_AVATARS,
    TEEN_ACADEMY_AVATAR_SLOTS[0],
    TEEN_ACADEMY_AVATAR_SLOTS[1],
  ];
}

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
        const devCharRes = await fetch(`${getApiBaseUrl()}/api/character-models`, {
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

  const universeAnime = UNIVERSE_ANIME_AVATARS.find((item) => item.id === citizenModelId);
  if (universeAnime) return universeAnime;

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
  if (UNIVERSE_ANIME_AVATARS.some((item) => item.id === citizenModelId)) return true;
  if ((cachedCatalog.teenAcademyAvatars || TEEN_ACADEMY_AVATAR_SLOTS).some((item) => item.id === citizenModelId)) {
    return true;
  }
  return cachedCatalog.customHumanAvatars.some(
    (item) => item.id === citizenModelId && item.status === "ready" && Boolean(item.glbUrl)
  );
}

export function resolveAlignedCitizenModelForUniverse(universeId = "classic", currentId = null) {
  const meta = getCitizenAvatarMeta(currentId);
  if (meta?.source === "custom_3d_human") return meta.id;
  if (universeId === "office") {
    if (OFFICE_UNIVERSE_AVATARS.some((item) => item.id === currentId)) return currentId;
    return OFFICE_UNIVERSE_AVATARS[0].id;
  }
  if (universeId === "school") {
    if (SCHOOL_UNIVERSE_AVATARS.some((item) => item.id === currentId)) return currentId;
    return SCHOOL_UNIVERSE_AVATARS[0].id;
  }
  if (
    BUILTIN_VILLAGER_AVATARS.some((item) => item.id === currentId) ||
    TEEN_ACADEMY_AVATAR_SLOTS.some((item) => item.id === currentId)
  ) {
    return currentId;
  }
  return BUILTIN_VILLAGER_AVATARS[0].id;
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
