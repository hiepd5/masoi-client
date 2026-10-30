// =============================================================================
// CẤU HÌNH MÔI TRƯỜNG ĐA NỀN TẢNG (WEB + PWA + CAPACITOR ANDROID/IOS — V4.1)
// - Tự động trỏ API & Socket về Cloud Render khi đóng gói App CapacitorJS Native
// - Quản lý cấu hình Đồ Họa 3D (Mobile 60FPS Shield: Cao / Cân bằng / Siêu Mượt)
// =============================================================================

export const CLOUD_SERVER_URL = "https://masoi-server-2eca.onrender.com";
export const LOCAL_DEV_SERVER_URL = "http://localhost:3001";

export function resolveLocalDevServerUrl() {
  if (typeof window !== "undefined") {
    try {
      const host = String(window.location?.hostname || "").trim();
      if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        /^192\.168\.\d+\.\d+$/.test(host) ||
        /^10\.\d+\.\d+\.\d+$/.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)
      ) {
        return `http://${host}:3001`;
      }
    } catch {
      // ignore
    }
  }
  return LOCAL_DEV_SERVER_URL;
}

export function isNativeCapacitor() {
  if (typeof window === "undefined") return false;
  try {
    if (window.Capacitor?.isNativePlatform?.()) return true;
    const proto = String(window.location?.protocol || "").toLowerCase();
    const host = String(window.location?.hostname || "").toLowerCase();
    if (proto === "capacitor:" || proto === "ionic:") return true;
    // Capacitor Android mặc định chạy https://localhost (không có port Vite 5173)
    if (proto === "https:" && host === "localhost" && !window.location?.port) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function isLocalDevClient() {
  return !import.meta.env.PROD && !isNativeCapacitor();
}

export function getApiBaseUrl() {
  try {
    const customUrl = typeof localStorage !== "undefined" && localStorage.getItem("ws_server_override");
    const allowOverrideInDev =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location?.search || "").get("ws_override") === "1";
    if (customUrl && /^https?:\/\//i.test(customUrl) && (!isLocalDevClient() || allowOverrideInDev)) {
      return customUrl.replace(/\/+$/, "");
    }
  } catch {
    // ignore
  }
  if (import.meta.env.PROD || isNativeCapacitor()) {
    return CLOUD_SERVER_URL;
  }
  return resolveLocalDevServerUrl();
}

export function getSocketServerUrl() {
  return getApiBaseUrl();
}

export const GRAPHICS_PRESETS = {
  high: {
    id: "high",
    label: "✨ Cao",
    dpr: [1, 1.5],
    shadows: true,
    antialias: true,
    outerForest: true,
    maxPointLights: 4,
  },
  balanced: {
    id: "balanced",
    label: "⚡ Cân bằng",
    dpr: [1, 1.25],
    shadows: false,
    antialias: true,
    outerForest: true,
    maxPointLights: 2,
  },
  low: {
    id: "low",
    label: "🚀 Siêu Mượt",
    dpr: [0.85, 1.0],
    shadows: false,
    antialias: false,
    outerForest: false,
    maxPointLights: 1,
  },
};

const GFX_STORAGE_KEY = "ws_gfx_quality";
const gfxListeners = new Set();

export function detectDefaultGraphicsPresetId() {
  if (typeof window === "undefined") return "high";
  const isSmallScreen = window.innerWidth <= 820;
  const cores = Number(navigator?.hardwareConcurrency || 8);
  const mem = Number(navigator?.deviceMemory || 8);
  if (cores <= 4 || mem <= 3) return "low";
  if (isSmallScreen) return "balanced";
  return "high";
}

export function getGraphicsQualityPresetId() {
  try {
    const saved = localStorage.getItem(GFX_STORAGE_KEY);
    if (saved && GRAPHICS_PRESETS[saved]) return saved;
  } catch {
    // ignore
  }
  return detectDefaultGraphicsPresetId();
}

export function getGraphicsQualityPreset() {
  return GRAPHICS_PRESETS[getGraphicsQualityPresetId()] || GRAPHICS_PRESETS.balanced;
}

export function saveGraphicsQualityPresetId(nextId) {
  const validId = GRAPHICS_PRESETS[nextId] ? nextId : "balanced";
  try {
    localStorage.setItem(GFX_STORAGE_KEY, validId);
  } catch {
    // ignore
  }
  gfxListeners.forEach((fn) => {
    try {
      fn(validId);
    } catch {
      // ignore
    }
  });
  return GRAPHICS_PRESETS[validId];
}

export function subscribeGraphicsQuality(listener) {
  gfxListeners.add(listener);
  return () => gfxListeners.delete(listener);
}
