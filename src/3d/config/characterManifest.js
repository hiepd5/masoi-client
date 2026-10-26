import {
  get3DModelRenderMode,
  subscribe3DModelRenderMode,
} from "./seasonalEventRegistry.js";
import { ASSET_SYNC_VERSION } from "./propManifest.js";

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
        const apiRes = await fetch("http://localhost:3001/api/character-models", {
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
          availableCharacterModels = doc.characters;
        }
      }
    } catch {
      availableCharacterModels = {};
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
 * - Trong ván đấu (`!hasWinner`): Mặc định xoay vòng 3 tạo hình Dân Làng Ẩn Danh (`seatIndex % 3`) khi đã cắm file `.GLB`,
 *   nếu chưa có file `.GLB` mới thì dùng `villager_cloak` ẩn danh tuyệt đối (Zero-Leak 100%).
 * - Với Ma Sói (`wolf`): Tự động xen kẽ `wolf` (#07) & `wolf_alt` (#07B) theo `seatIndex % 2`.
 * - Khi chiếu băng Replay cuối ván (`hasWinner === true`) hoặc Studio Hoạt Cảnh: Mở khóa toàn bộ các Vai Thật & Cổng V3.3!
 */
export function resolveActiveCharacterSlot({
  hasWinner,
  visibleCostumeRole,
  seatIndex = 0,
  preferAltWolf = false,
}) {
  const safeSeatMod3 = Math.abs(Number(seatIndex) || 0) % 3;
  if (!visibleCostumeRole) {
    if (safeSeatMod3 === 1 && availableCharacterModels.villager_female) {
      return "villager_female";
    }
    if (safeSeatMod3 === 2 && availableCharacterModels.villager_elder) {
      return "villager_elder";
    }
    return "villager_cloak";
  }
  if (visibleCostumeRole === "villager") {
    if (!hasWinner) {
      if (safeSeatMod3 === 1 && availableCharacterModels.villager_female) return "villager_female";
      if (safeSeatMod3 === 2 && availableCharacterModels.villager_elder) return "villager_elder";
      return "villager_cloak";
    }
    if (safeSeatMod3 === 1 && availableCharacterModels.villager_female) return "villager_female";
    if (safeSeatMod3 === 2 && availableCharacterModels.villager_elder) return "villager_elder";
    return "villager_true";
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
  return "villager_cloak";
}
