/**
 * MA SÓI ONLINE 3D — BỘ ĐỊNH TUYẾN SỰ KIỆN LỄ HỘI & CHẾ ĐỘ HIỂN THỊ MODEL 3D TRIPO
 * ---------------------------------------------------------------------------------
 * - Đồng bộ chuẩn 1:1 với `masoi_asset_manifest.json` (18/18 Concept & 12 File .GLB Đợt 1).
 * - Mặc định kích hoạt ngay bộ Model 3D Tripo (`"tripo_3d"`) cho toàn bộ khe đã có `.glb`
 *   (9 Nhân vật tính cả `wolf_alt` + Khiên Bảo Vệ `#17` + Trụ Đá Rune `#03` + Giếng Sương `#05`),
 *   các khe đang chờ tạo nốt (7 dụng cụ còn lại) tự động Safe Partial Fallback 0% lỗi 404!
 * - Hỗ trợ nút chuyển nóng 1-Click `🎄 Model 3D Tripo` <-> `🎭 Procedural Cổ Điển` trên Dev/Studio.
 */

export const SEASONAL_EVENTS_CALENDAR = [
  {
    eventId: "noel",
    label: "Giáng Sinh Bắc Âu Huyền Bí (Dark Nordic Yuletide)",
    badgeEmoji: "🎄",
    themeAccent: "#dc2626",
    secondaryAccent: "#eab308",
    atmospherePreset: "yuletide_frost_aurora",
    activeRange: { startMMDD: "12-01", endMMDD: "01-05" },
    eventGoal: {
      id: "goal_noel_yule_bell",
      title: "Chuông Thánh Đêm Đông",
      description:
        "Thu thập Ấn Tuyết Cổ Ngữ qua các ván thắng Phe Dân / Phe Sói để mở khóa Danh hiệu & Khung Avatar Giáng Sinh Bắc Âu.",
      targetPoints: 100,
    },
    status: "READY",
    assetRoot: "events/noel",
  },
  {
    eventId: "tet_nguyen_dan",
    label: "Tết Nguyên Đán Cổ Truyền (Lunar New Year)",
    badgeEmoji: "🧧",
    themeAccent: "#ef4444",
    secondaryAccent: "#f59e0b",
    atmospherePreset: "crimson_lantern_spring_mist",
    activeRange: { startMMDD: "01-20", endMMDD: "02-20" },
    eventGoal: {
      id: "goal_tet_red_seal",
      title: "Lộc Xuân Đầu Làng",
      description: "Thắp sáng Đèn Lồng Đỏ và bảo vệ Làng qua đêm Giao Thừa để nhận Ấn Khai Xuân.",
      targetPoints: 120,
    },
    status: "PLANNED_SLOT_READY",
    assetRoot: "events/tet_nguyen_dan",
  },
  {
    eventId: "trung_thu",
    label: "Đêm Hội Trăng Rằm (Blood & Harvest Moon)",
    badgeEmoji: "🌕",
    themeAccent: "#f59e0b",
    secondaryAccent: "#8b5cf6",
    atmospherePreset: "full_harvest_moon_glow",
    activeRange: { startMMDD: "09-05", endMMDD: "09-25" },
    eventGoal: {
      id: "goal_midautumn_moonstone",
      title: "Ánh Trăng Thức Tỉnh",
      description: "Hoàn thành chuỗi suy luận dưới trăng tròn để thu thập Đá Ánh Trăng.",
      targetPoints: 90,
    },
    status: "PLANNED_SLOT_READY",
    assetRoot: "events/trung_thu",
  },
  {
    eventId: "halloween",
    label: "Đêm Hóa Trang Hắc Ám (Samhain Blood Night)",
    badgeEmoji: "🎃",
    themeAccent: "#f97316",
    secondaryAccent: "#7c3aed",
    atmospherePreset: "samhain_pumpkin_fog",
    activeRange: { startMMDD: "10-15", endMMDD: "11-02" },
    eventGoal: {
      id: "goal_halloween_soul_lantern",
      title: "Lồng Đèn Linh Hồn",
      description: "Vạch trần bầy Sói trong sương mù Samhain để tích lũy Lửa Ma Trơi.",
      targetPoints: 100,
    },
    status: "PLANNED_SLOT_READY",
    assetRoot: "events/halloween",
  },
];

export const DEFAULT_BASE_THEME = {
  eventId: "default_nordic",
  label: "Làng Bắc Âu Nguyên Bản (Base Dark Nordic)",
  badgeEmoji: "🐺",
  themeAccent: "#eab308",
  secondaryAccent: "#6366f1",
  atmospherePreset: "nordic_midnight_mist",
  eventGoal: null,
  status: "BASE_LIVE",
  assetRoot: "events/default_nordic",
};

export function isDateInSeasonalRange(mmdd, startMMDD, endMMDD) {
  if (startMMDD <= endMMDD) {
    return mmdd >= startMMDD && mmdd <= endMMDD;
  }
  return mmdd >= startMMDD || mmdd <= endMMDD;
}

export function resolveActiveSeasonalEvent(dateObj = new Date(), forceEventId = "noel") {
  if (forceEventId) {
    if (forceEventId === "default_nordic") return DEFAULT_BASE_THEME;
    const forced = SEASONAL_EVENTS_CALENDAR.find((ev) => ev.eventId === forceEventId);
    if (forced) return forced;
  }

  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  const mmdd = `${month}-${day}`;

  const matched = SEASONAL_EVENTS_CALENDAR.find(
    (ev) =>
      ev.status === "READY" &&
      isDateInSeasonalRange(mmdd, ev.activeRange.startMMDD, ev.activeRange.endMMDD)
  );

  return matched || SEASONAL_EVENTS_CALENDAR[0] || DEFAULT_BASE_THEME;
}

const RENDER_MODE_STORAGE_KEY = "ws_masoi_3d_render_mode_v1";
const modeListeners = new Set();

function detectInitialRenderMode() {
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("models") === "classic") return "procedural_classic";
      if (params.get("models") === "tripo" || params.get("event") === "noel") return "tripo_3d";
      const saved = window.sessionStorage?.getItem(RENDER_MODE_STORAGE_KEY);
      if (saved === "procedural_classic" || saved === "tripo_3d") return saved;
    } catch {
      // ignore storage access issues
    }
  }
  // Mặc định kích hoạt NGAY bộ 12 Model 3D Tripo đã kiểm định
  return "tripo_3d";
}

let currentRenderMode = detectInitialRenderMode();

export function get3DModelRenderMode() {
  return currentRenderMode;
}

export function set3DModelRenderMode(nextMode) {
  const normalized = nextMode === "procedural_classic" ? "procedural_classic" : "tripo_3d";
  if (normalized === currentRenderMode) return currentRenderMode;
  currentRenderMode = normalized;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage?.setItem(RENDER_MODE_STORAGE_KEY, normalized);
    } catch {
      // ignore
    }
  }
  modeListeners.forEach((fn) => {
    try {
      fn(currentRenderMode);
    } catch {
      // ignore
    }
  });
  return currentRenderMode;
}

export function toggle3DModelRenderMode() {
  return set3DModelRenderMode(
    currentRenderMode === "tripo_3d" ? "procedural_classic" : "tripo_3d"
  );
}

export function subscribe3DModelRenderMode(listener) {
  modeListeners.add(listener);
  return () => modeListeners.delete(listener);
}
