/**
 * Danh mục Chuẩn 9 Nhân Vật Có Xương Auto-Rig .GLB từ Tripo AI (Phương án Nhân Vật A):
 * - Phong cách: Dark Nordic Medieval Stylized PBR (Tỷ lệ 6.5 đầu, đồng bộ nhà gỗ & nền đá 4K).
 * - 1 Nhân vật Ẩn Danh trong trận (`villager_cloak`) + 8 Nhân vật Thật xuất hiện trong băng Replay cuối ván!
 */
export const CHARACTER_SLOTS = {
  villager_cloak: {
    key: "villager_cloak",
    fileName: "char_villager_cloak.glb",
    label: "Dân Làng Áo Choàng Ẩn Danh",
    standingHeight: 1.68,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    tintableCloak: true,
  },
  wolf: {
    key: "wolf",
    fileName: "char_wolf.glb",
    label: "Ma Sói Bắc Âu",
    standingHeight: 1.82,
    seatHipOffsetY: 0.05,
    seatForwardOffsetZ: 0.06,
    tintableCloak: false,
  },
  guard: {
    key: "guard",
    fileName: "char_guard.glb",
    label: "Hộ Vệ Giáp Da Đinh Tán",
    standingHeight: 1.74,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    tintableCloak: false,
  },
  witch: {
    key: "witch",
    fileName: "char_witch.glb",
    label: "Phù Thủy Rừng Sương",
    standingHeight: 1.66,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    tintableCloak: false,
  },
  seer: {
    key: "seer",
    fileName: "char_seer.glb",
    label: "Tiên Tri Cổ Ngữ",
    standingHeight: 1.68,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    tintableCloak: false,
  },
  tough_guy: {
    key: "tough_guy",
    fileName: "char_tough_guy.glb",
    label: "Tráng Sĩ Cứng Cỏi",
    standingHeight: 1.78,
    seatHipOffsetY: 0.05,
    seatForwardOffsetZ: 0.05,
    tintableCloak: false,
  },
  cursed: {
    key: "cursed",
    fileName: "char_cursed.glb",
    label: "Kẻ Bị Nguyền",
    standingHeight: 1.68,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    tintableCloak: false,
  },
  tanner: {
    key: "tanner",
    fileName: "char_tanner.glb",
    label: "Kẻ Chán Đời",
    standingHeight: 1.67,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    tintableCloak: false,
  },
  villager_true: {
    key: "villager_true",
    fileName: "char_villager_true.glb",
    label: "Dân Làng Chân Chất",
    standingHeight: 1.68,
    seatHipOffsetY: 0.04,
    seatForwardOffsetZ: 0.05,
    tintableCloak: true,
  },
};

let availableCharacterModels = {};
let loadedOnce = false;
let inflightPromise = null;
const listeners = new Set();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn({ ...availableCharacterModels });
    } catch {
      // ignore listener error
    }
  });
}

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
            if (data && typeof data.characters === "object") {
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
      const staticRes = await fetch("/models/characters/characters_manifest.json", {
        cache: "no-store",
      });
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

export function getCharacterGlbUrl(slotKey) {
  if (!slotKey) return null;
  return availableCharacterModels[slotKey] || null;
}

export function subscribeCharacterManifest(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Quyết định khe Nhân Vật 3D nào được hiển thị trên ghế:
 * - Trong ván đấu (`!hasWinner`): Mặc định là `villager_cloak` ẩn danh tuyệt đối (Zero-Leak 100%).
 *   Riêng bản thân hoặc đồng bọn Sói ban đêm có thể thấy tạo hình vai được phép.
 * - Khi chiếu băng Replay cuối ván (`hasWinner === true`): Mở khóa toàn bộ 8 Nhân Vật Thật!
 */
export function resolveActiveCharacterSlot({ hasWinner, visibleCostumeRole }) {
  if (!visibleCostumeRole) {
    return "villager_cloak";
  }
  if (visibleCostumeRole === "villager") {
    return hasWinner ? "villager_true" : "villager_cloak";
  }
  if (CHARACTER_SLOTS[visibleCostumeRole]) {
    return visibleCostumeRole;
  }
  return "villager_cloak";
}
