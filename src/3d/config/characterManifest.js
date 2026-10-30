import {
  get3DModelRenderMode,
  subscribe3DModelRenderMode,
} from "./seasonalEventRegistry.js";
import { ASSET_SYNC_VERSION } from "./propManifest.js";
import { getPublicCitizenPersona } from "../../config/roles.config.js";
import { loadCitizenAvatarCatalog } from "../../config/citizenAvatars.config.js";
import { getApiBaseUrl } from "../../config/runtimeEnv.js";

function withAssetVersion(url) {
  if (!url) return null;
  return url.includes("?") ? url : `${url}?v=${ASSET_SYNC_VERSION}`;
}

/**
 * Danh mục Chuẩn 9+1 Nhân Vật .GLB từ Tripo AI (Hỗ trợ Kép: Smart Mesh Y=0.00m & Auto-Rig SkinnedMesh):
 * - Phong cách: Dark Nordic Medieval Stylized PBR (Chiều cao vật lý chuẩn 1:1: 1.74m -> 2.05m).
 * - 1 Nhân vật Ẩn Danh trong trận (`villager_cloak` — Zero-Leak 100%) + 8 Nhân vật Thật + 1 Biến thể Sói Phụ (`wolf_alt`).
 */
export const CHARACTER_SLOTS = {
  villager_cloak: {
    key: "villager_cloak",
    fileName: "char_villager_cloak.glb",
    label: "Dân Làng Áo Choàng Ẩn Danh",
    standingHeight: 1.76,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: true,
    tintStrength: 0.24,
  },
  wolf: {
    key: "wolf",
    fileName: "char_wolf.glb",
    label: "Ma Sói Bắc Âu Thủ Lĩnh (#07)",
    standingHeight: 2.05,
    seatHipOffsetY: 0.05,
    seatForwardOffsetZ: 0.06,
    staticStandZ: 0.14,
    tintableCloak: false,
  },
  wolf_alt: {
    key: "wolf_alt",
    fileName: "char_wolf_alt.glb",
    label: "Ma Sói Áo Choàng Lệch Vai (#07B)",
    standingHeight: 2.05,
    seatHipOffsetY: 0.05,
    seatForwardOffsetZ: 0.06,
    staticStandZ: 0.14,
    tintableCloak: false,
  },
  guard: {
    key: "guard",
    fileName: "char_guard.glb",
    label: "Bảo Vệ Canh Đêm Đông (#10)",
    standingHeight: 1.88,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
  },
  witch: {
    key: "witch",
    fileName: "char_witch.glb",
    label: "Phù Thủy Giáng Sinh (#09)",
    standingHeight: 1.74,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
  },
  seer: {
    key: "seer",
    fileName: "char_seer.glb",
    label: "Tiên Tri Đêm Đông (#08)",
    standingHeight: 1.78,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
  },
  tough_guy: {
    key: "tough_guy",
    fileName: "char_tough_guy.glb",
    label: "Tráng Sĩ Cứng Cỏi (#12)",
    standingHeight: 1.92,
    seatHipOffsetY: 0.05,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.13,
    tintableCloak: false,
  },
  cursed: {
    key: "cursed",
    fileName: "char_cursed.glb",
    label: "Kẻ Bị Nguyền Băng Giá (#13)",
    standingHeight: 1.78,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
  },
  tanner: {
    key: "tanner",
    fileName: "char_tanner.glb",
    label: "Kẻ Chán Đời Đêm Noel (#14)",
    standingHeight: 1.75,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
  },
  villager_true: {
    key: "villager_true",
    fileName: "char_villager_true.glb",
    label: "Dân Làng Lễ Noel (#11)",
    standingHeight: 1.76,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
  },
  // ================== 6 CỔNG MỞ RỘNG V3.3 (#19 -> #24 — HOT-PLUG READY) ==================
  hunter: {
    key: "hunter",
    portNumber: 19,
    fileName: "char_hunter.glb",
    label: "Thợ Săn Bạc Bắc Âu (#19)",
    standingHeight: 1.86,
    seatHipOffsetY: 0.045,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.13,
    tintableCloak: false,
    proxySlot: "tough_guy",
  },
  cupid: {
    key: "cupid",
    portNumber: 20,
    fileName: "char_cupid.glb",
    label: "Thần Tình Yêu Bắc Âu (#20)",
    standingHeight: 1.76,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
    proxySlot: "seer",
  },
  alpha_wolf: {
    key: "alpha_wolf",
    portNumber: 21,
    fileName: "char_alpha_wolf.glb",
    label: "Sói Đầu Đàn Huyết Nguyệt (#21)",
    standingHeight: 2.18,
    seatHipOffsetY: 0.055,
    seatForwardOffsetZ: 0.065,
    staticStandZ: 0.15,
    tintableCloak: false,
    proxySlot: "wolf_alt",
  },
  mayor: {
    key: "mayor",
    portNumber: 22,
    fileName: "char_mayor.glb",
    label: "Trưởng Làng Quyền Trượng (#22)",
    standingHeight: 1.84,
    seatHipOffsetY: 0.045,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.13,
    tintableCloak: false,
    proxySlot: "guard",
  },
  villager_female: {
    key: "villager_female",
    portNumber: 23,
    fileName: "char_villager_female.glb",
    label: "Thôn Nữ Khăn Choàng (#23)",
    standingHeight: 1.72,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: true,
    tintStrength: 0.22,
    proxySlot: "villager_cloak",
  },
  villager_elder: {
    key: "villager_elder",
    portNumber: 24,
    fileName: "char_villager_elder.glb",
    label: "Bô Lão Thông Thái (#24)",
    standingHeight: 1.74,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: true,
    tintStrength: 0.22,
    proxySlot: "villager_true",
  },
  // ================== 6 CỔNG CHỜ THẾ HỆ HỌC VIỆN TEEN 3D V4.5 (#25 -> #30 — TRIPO -> BLENDER -> WEB) ==================
  teen_detective: {
    key: "teen_detective",
    portNumber: 25,
    fileName: "char_teen_detective.glb",
    label: "Thám Tử Học Viện (#25)",
    standingHeight: 1.78,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
    preferNativeClip: true,
    proxySlot: "villager_cloak",
  },
  teen_occult: {
    key: "teen_occult",
    portNumber: 26,
    fileName: "char_teen_occult.glb",
    label: "Nữ Sinh Huyền Bí (#26)",
    standingHeight: 1.72,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
    preferNativeClip: true,
    proxySlot: "villager_female",
  },
  teen_idol: {
    key: "teen_idol",
    portNumber: 27,
    fileName: "char_teen_idol.glb",
    label: "Idol Ký Túc Xá (#27)",
    standingHeight: 1.74,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
    preferNativeClip: true,
    proxySlot: "villager_female",
  },
  teen_hacker: {
    key: "teen_hacker",
    portNumber: 28,
    fileName: "char_teen_hacker.glb",
    label: "Thiên Tài Giải Mã (#28)",
    standingHeight: 1.76,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
    preferNativeClip: true,
    proxySlot: "villager_true",
  },
  teen_varsity: {
    key: "teen_varsity",
    portNumber: 29,
    fileName: "char_teen_varsity.glb",
    label: "Đội Trưởng Áo Khoác (#29)",
    standingHeight: 1.82,
    seatHipOffsetY: 0.045,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
    preferNativeClip: true,
    proxySlot: "guard",
  },
  teen_rebel: {
    key: "teen_rebel",
    portNumber: 30,
    fileName: "char_teen_rebel.glb",
    label: "Nghệ Sĩ Đêm Trăng (#30)",
    standingHeight: 1.77,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
    preferNativeClip: true,
    proxySlot: "villager_cloak",
  },
  // ================== 8 CỔNG VROID / VRM ANIME 3D V4.6 (VŨ TRỤ CÔNG SỞ & HỌC ĐƯỜNG — ZERO-404 HOT-PLUG) ==================
  office_suit_m: {
    key: "office_suit_m",
    portNumber: 31,
    fileName: "char_office_suit_m.glb",
    label: "Nhân Viên Vest Nam Anime (#31)",
    standingHeight: 1.78,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
    preferNativeClip: true,
    proxySlot: null,
  },
  office_blazer_f: {
    key: "office_blazer_f",
    portNumber: 32,
    fileName: "char_office_blazer_f.glb",
    label: "Nhân Viên Blazer Nữ Anime (#32)",
    standingHeight: 1.7,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
    preferNativeClip: true,
    proxySlot: null,
  },
  office_exec_boss: {
    key: "office_exec_boss",
    portNumber: 33,
    fileName: "char_office_exec_boss.glb",
    label: "Sếp Tổng Vi Hành Anime (#33)",
    standingHeight: 1.84,
    seatHipOffsetY: 0.045,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
    preferNativeClip: true,
    proxySlot: null,
  },
  office_it_tech: {
    key: "office_it_tech",
    portNumber: 34,
    fileName: "char_office_it_tech.glb",
    label: "Chuyên Viên IT Anime (#34)",
    standingHeight: 1.76,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
    preferNativeClip: true,
    proxySlot: null,
  },
  school_boy_blazer: {
    key: "school_boy_blazer",
    portNumber: 35,
    fileName: "char_school_boy_blazer.glb",
    label: "Nam Sinh Đồng Phục Anime (#35)",
    standingHeight: 1.75,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
    preferNativeClip: true,
    proxySlot: null,
  },
  school_girl_sailor: {
    key: "school_girl_sailor",
    portNumber: 36,
    fileName: "char_school_girl_sailor.glb",
    label: "Nữ Sinh Đồng Phục Anime (#36)",
    standingHeight: 1.66,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
    preferNativeClip: true,
    proxySlot: null,
  },
  school_teacher_f: {
    key: "school_teacher_f",
    portNumber: 37,
    fileName: "char_school_teacher_f.glb",
    label: "Cô Chủ Nhiệm Vi Hành Anime (#37)",
    standingHeight: 1.72,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
    preferNativeClip: true,
    proxySlot: null,
  },
  school_proctor_m: {
    key: "school_proctor_m",
    portNumber: 38,
    fileName: "char_school_proctor_m.glb",
    label: "Thầy Giám Thị Anime (#38)",
    standingHeight: 1.82,
    seatHipOffsetY: 0.045,
    seatForwardOffsetZ: 0.05,
    staticStandZ: 0.12,
    tintableCloak: false,
    preferNativeClip: true,
    proxySlot: null,
  },
};

let availableCharacterModels = {};
let loadedOnce = false;
let inflightPromise = null;
const listeners = new Set();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn({ ...availableCharacterModels, renderMode: get3DModelRenderMode() });
    } catch {
      // ignore listener error
    }
  });
}

subscribe3DModelRenderMode(() => {
  notifyListeners();
});

export async function ensureCharacterManifestLoaded({ force = false } = {}) {
  if (loadedOnce && !force) return availableCharacterModels;
  if (inflightPromise && !force) return inflightPromise;

  inflightPromise = (async () => {
    if (!import.meta.env.PROD) {
      try {
        const apiRes = await fetch(`${getApiBaseUrl()}/api/character-models`, {
          cache: "no-store",
        });
        if (apiRes.ok) {
          const ctype = (apiRes.headers.get("content-type") || "").toLowerCase();
          if (ctype.includes("json")) {
            const data = await apiRes.json();
            if (data && typeof data.characters === "object" && Object.keys(data.characters).length > 0) {
              availableCharacterModels = data.characters;
              loadedOnce = true;
              notifyListeners();
              return availableCharacterModels;
            }
          }
        }
      } catch {
        // Fallback sang static manifest khi server local chưa bật
      }
    }

    try {
      const staticRes = await fetch(
        `/models/characters/characters_manifest.json?v=${ASSET_SYNC_VERSION}`,
        {
          cache: "no-store",
        }
      );
      if (staticRes.ok) {
        const doc = await staticRes.json();
        if (doc && typeof doc.characters === "object") {
          availableCharacterModels = { ...doc.characters };
        }
      }
    } catch {
      availableCharacterModels = {};
    }

    // Đồng bộ Kho Avatar 3D Người Thật (tintableCloak=false để giữ nguyên 100% màu da & trang phục ngoài đời!)
    try {
      const avatarCat = await loadCitizenAvatarCatalog({ force });
      if (Array.isArray(avatarCat?.teenAcademyAvatars)) {
        avatarCat.teenAcademyAvatars.forEach((item) => {
          if (item?.id && item.status === "ready" && item.glbUrl) {
            availableCharacterModels[item.id] = item.glbUrl;
          }
        });
      }
      if (Array.isArray(avatarCat?.customHumanAvatars)) {
        avatarCat.customHumanAvatars.forEach((item) => {
          if (item?.id && item.status === "ready" && item.glbUrl) {
            CHARACTER_SLOTS[item.id] = {
              key: item.id,
              fileName: item.glbUrl.split("/").pop() || `${item.id}.glb`,
              label: item.label || item.id,
              standingHeight: Number(item.standingHeight) || 1.75,
              seatHipOffsetY: 0.04,
              seatForwardOffsetZ: 0.05,
              staticStandZ: 0.12,
              tintableCloak: false,
            };
            availableCharacterModels[item.id] = item.glbUrl;
          }
        });
      }
    } catch {
      // ignore optional custom avatar catalog error
    }

    loadedOnce = true;
    notifyListeners();
    return availableCharacterModels;
  })();

  try {
    return await inflightPromise;
  } finally {
    inflightPromise = null;
  }
}

export function isNativeCharacterSlotAvailable(slotKey) {
  if (!slotKey) return false;
  return Boolean(availableCharacterModels[slotKey]);
}

export function getCharacterGlbUrl(slotKey) {
  if (!slotKey) return null;
  if (get3DModelRenderMode() === "procedural_classic") return null;
  if (availableCharacterModels[slotKey]) {
    return withAssetVersion(availableCharacterModels[slotKey]);
  }
  if (slotKey === "wolf_alt") {
    return withAssetVersion(availableCharacterModels.wolf_alt || availableCharacterModels.wolf || null);
  }
  // Cổng Ma-nơ-canh Khung Xương Thật Tạm Thời (Rigged Proxy Port):
  // Mượn tạm khung xương 18–20 bone có sẵn khi chưa thả file char_<key>.glb mới vào kho;
  // tự ngắt Proxy ngay giây phút phát hiện file .GLB gốc!
  const proxyKey = CHARACTER_SLOTS[slotKey]?.proxySlot;
  if (proxyKey) {
    if (proxyKey === "wolf_alt") {
      return withAssetVersion(availableCharacterModels.wolf_alt || availableCharacterModels.wolf || null);
    }
    return withAssetVersion(availableCharacterModels[proxyKey] || null);
  }
  return null;
}

export function getAvailableCharacterKeys() {
  return Object.keys(availableCharacterModels);
}

export function subscribeCharacterManifest(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Quyết định khe Nhân Vật 3D nào được hiển thị trên ghế:
 * - Trong ván đấu (`!hasWinner`): Khóa bất biến `publicPersonaSeed` theo `roomCode + seatIndex` (`Chốt #10`)
 *   xoay vòng 3 tạo hình Dân Làng Ẩn Danh (`villager_cloak`, `villager_female`, `villager_elder`) không bao giờ nhảy dáng khi bị đồng hóa.
 * - Với Ma Sói (`wolf`): Tự động xen kẽ `wolf` (#07) & `wolf_alt` (#07B) theo `seatIndex % 2`.
 * - Khi chiếu băng Replay cuối ván (`hasWinner === true`) hoặc Studio Hoạt Cảnh: Mở khóa toàn bộ các Vai Thật & Cổng V3.3!
 */
export function resolveActiveCharacterSlot({
  hasWinner,
  visibleCostumeRole,
  citizenModelId = null,
  seatIndex = 0,
  roomCode = "MASOI",
  preferAltWolf = false,
  universeId = "classic",
}) {
  if (universeId === "office") {
    if (visibleCostumeRole === "wolf" || visibleCostumeRole === "alpha_wolf") {
      return "office_exec_boss";
    }
    if (visibleCostumeRole === "seer" && availableCharacterModels.office_it_tech) {
      return "office_it_tech";
    }
    if (citizenModelId === "office_it_tech" && availableCharacterModels.office_it_tech) {
      return "office_it_tech";
    }
    if (
      citizenModelId === "office_blazer_f" ||
      citizenModelId === "office_hr_lead" ||
      citizenModelId === "office_finance_f"
    ) {
      return "office_blazer_f";
    }
    if (
      citizenModelId === "office_suit_m" ||
      citizenModelId === "office_intern_m" ||
      citizenModelId === "office_it_tech"
    ) {
      return "office_suit_m";
    }
    return Math.abs(Number(seatIndex) || 0) % 2 === 0 ? "office_suit_m" : "office_blazer_f";
  }

  if (universeId === "school") {
    if (visibleCostumeRole === "alpha_wolf") {
      return "school_proctor_m";
    }
    if (visibleCostumeRole === "wolf") {
      return "school_teacher_f";
    }
    if (
      citizenModelId === "school_girl_sailor" ||
      citizenModelId === "school_class_rep" ||
      citizenModelId === "school_scholar_f"
    ) {
      return "school_girl_sailor";
    }
    if (
      citizenModelId === "school_boy_blazer" ||
      citizenModelId === "school_monitor_m" ||
      citizenModelId === "school_club_pres"
    ) {
      return "school_boy_blazer";
    }
    return Math.abs(Number(seatIndex) || 0) % 2 === 0 ? "school_boy_blazer" : "school_girl_sailor";
  }

  const persona = getPublicCitizenPersona(roomCode, seatIndex);
  const resolveCitizenSlot = () => {
    if (citizenModelId) {
      if (availableCharacterModels[citizenModelId] || CHARACTER_SLOTS[citizenModelId]) {
        return citizenModelId;
      }
    }
    if (persona.slotKey === "villager_female" && CHARACTER_SLOTS.villager_female) {
      return "villager_female";
    }
    if (persona.slotKey === "villager_elder" && CHARACTER_SLOTS.villager_elder) {
      return "villager_elder";
    }
    return "villager_cloak";
  };

  if (!visibleCostumeRole) {
    return resolveCitizenSlot();
  }
  if (visibleCostumeRole === "villager") {
    return resolveCitizenSlot();
  }
  if (visibleCostumeRole === "wolf") {
    const useAlt = Boolean(preferAltWolf || Math.abs(Number(seatIndex) || 0) % 2 === 1);
    if (useAlt && availableCharacterModels.wolf_alt) {
      return "wolf_alt";
    }
    return "wolf";
  }
  if (CHARACTER_SLOTS[visibleCostumeRole]) {
    return visibleCostumeRole;
  }
  return resolveCitizenSlot();
}
