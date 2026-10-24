/**
 * Cấu hình Tạo hình Modular 8 Vai Trò & Khe Cắm Nóng .GLB từ Tripo AI (Phương án 1A):
 * - Mặc định chạy ngay lập tức bằng Bộ Đạo Cụ 3D Procedural Trung Cổ (0 KB tải thêm, 60 FPS).
 * - Khi thả file /models/roles/role_<key>.glb vào client/public/models/roles/, hệ thống tự nhận diện
 *   qua /api/role-models (Localhost) hoặc /models/roles/roles_manifest.json (Production) với 0 lỗi 404!
 */

const SERVER_API_BASE = import.meta.env.PROD
  ? ""
  : "http://localhost:3001";

export const ROLE_COSTUME_MANIFEST = {
  wolf: {
    key: "wolf",
    label: "Ma Sói",
    emoji: "🐺",
    tunicColor: "#691414",
    trimColor: "#290909",
    accentColor: "#ef4444",
    emissiveColor: "#dc2626",
    glbPath: "/models/roles/role_wolf.glb",
    headTargetSize: 0.38,
    headYOffset: 0.16,
  },
  guard: {
    key: "guard",
    label: "Bảo Vệ",
    emoji: "🛡️",
    tunicColor: "#1d3b6e",
    trimColor: "#0f2347",
    accentColor: "#3b82f6",
    emissiveColor: "#60a5fa",
    glbPath: "/models/roles/role_guard.glb",
    headTargetSize: 0.35,
    headYOffset: 0.17,
  },
  witch: {
    key: "witch",
    label: "Phù Thủy",
    emoji: "🧪",
    tunicColor: "#3b1d5e",
    trimColor: "#1f0e36",
    accentColor: "#a855f7",
    emissiveColor: "#22c55e",
    glbPath: "/models/roles/role_witch.glb",
    headTargetSize: 0.44,
    headYOffset: 0.22,
  },
  seer: {
    key: "seer",
    label: "Tiên Tri",
    emoji: "🔮",
    tunicColor: "#31256e",
    trimColor: "#1b1442",
    accentColor: "#818cf8",
    emissiveColor: "#c084fc",
    glbPath: "/models/roles/role_seer.glb",
    headTargetSize: 0.36,
    headYOffset: 0.18,
  },
  tough_guy: {
    key: "tough_guy",
    label: "Người Cứng Cỏi",
    emoji: "💪",
    tunicColor: "#7c3412",
    trimColor: "#431a07",
    accentColor: "#f97316",
    emissiveColor: "#fb923c",
    glbPath: "/models/roles/role_tough_guy.glb",
    headTargetSize: 0.36,
    headYOffset: 0.17,
  },
  cursed: {
    key: "cursed",
    label: "Kẻ Bị Nguyền",
    emoji: "🌑",
    tunicColor: "#2e293d",
    trimColor: "#171421",
    accentColor: "#94a3b8",
    emissiveColor: "#9333ea",
    glbPath: "/models/roles/role_cursed.glb",
    headTargetSize: 0.34,
    headYOffset: 0.15,
  },
  tanner: {
    key: "tanner",
    label: "Chán Đời",
    emoji: "💀",
    tunicColor: "#523a28",
    trimColor: "#2b1e15",
    accentColor: "#cbd5e1",
    emissiveColor: "#f43f5e",
    glbPath: "/models/roles/role_tanner.glb",
    headTargetSize: 0.4,
    headYOffset: 0.2,
  },
  villager: {
    key: "villager",
    label: "Dân Làng",
    emoji: "👨‍🌾",
    tunicColor: "#5c4827",
    trimColor: "#362915",
    accentColor: "#eab308",
    emissiveColor: "#fbbf24",
    glbPath: "/models/roles/role_villager.glb",
    headTargetSize: 0.38,
    headYOffset: 0.2,
  },
};

let cachedRoleGlbs = null;
let inflightPromise = null;
const listeners = new Set();

export function getAvailableRoleGlbs() {
  return cachedRoleGlbs || {};
}

export function subscribeRoleGlbs(cb) {
  listeners.add(cb);
  if (cachedRoleGlbs) {
    cb(cachedRoleGlbs);
  }
  return () => listeners.delete(cb);
}

export async function ensureRoleGlbManifestLoaded(force = false) {
  if (cachedRoleGlbs && !force) return cachedRoleGlbs;
  if (inflightPromise && !force) return inflightPromise;

  inflightPromise = (async () => {
    try {
      // Ưu tiên API quét trực tiếp trên Localhost, fallback sang manifest tĩnh trên Cloud
      const apiUrl = SERVER_API_BASE
        ? `${SERVER_API_BASE}/api/role-models`
        : "/models/roles/roles_manifest.json";
      const res = await fetch(apiUrl, { cache: "no-cache" });
      if (res.ok) {
        const data = await res.json();
        cachedRoleGlbs = data?.roles && typeof data.roles === "object" ? data.roles : {};
        listeners.forEach((fn) => fn(cachedRoleGlbs));
        return cachedRoleGlbs;
      }
    } catch {
      // Fallback sang file tĩnh nếu server chưa phản hồi
    }

    try {
      const staticRes = await fetch("/models/roles/roles_manifest.json", { cache: "no-cache" });
      if (staticRes.ok) {
        const data = await staticRes.json();
        cachedRoleGlbs = data?.roles && typeof data.roles === "object" ? data.roles : {};
        listeners.forEach((fn) => fn(cachedRoleGlbs));
        return cachedRoleGlbs;
      }
    } catch {
      // ignore
    }

    cachedRoleGlbs = {};
    listeners.forEach((fn) => fn(cachedRoleGlbs));
    return cachedRoleGlbs;
  })();

  return inflightPromise;
}
