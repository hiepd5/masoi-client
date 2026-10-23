// =============================================================================
// HỆ THỐNG DỮ LIỆU SCENE GRAPH NGOẠI CẢNH (D5 ARCHITECT SCENE LAYOUT)
// - Quản lý toàn bộ cảnh quan ngoài (Nhà, Tháp chuông, Đài treo cổ, Sân đá,
//   Lửa trại, Đèn lồng, Hàng rào, Đá rêu & 84 Cây rừng 3 loài).
// - TUYỆT ĐỐI KHÔNG ĐỤNG TỚI GHẾ NGỒI (prop_chair) & NGƯỜI CHƠI!
// =============================================================================

export const LAYOUT_SCHEMA_VERSION = 1;
export const LAYOUT_REF_CIRCLE_RADIUS = 4.2;
// Bán kính vùng cấm đặt công trình/cây đè lên ghế người chơi (bao trọn phòng tối đa 12 ghế = 5.4m + đệm 0.8m)
export const NO_BUILD_SEAT_RADIUS = 6.2;

export const LOCAL_DRAFT_STORAGE_KEY = "ws_d5_village_layout_draft_v1";
export const PUBLIC_LAYOUT_URL = "/config/village_layout.json";

function getDevServerOrigin() {
  if (import.meta.env?.PROD) return "";
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:3001`;
  }
  return "http://localhost:3001";
}

export function isDevArchitectAllowed() {
  if (import.meta.env?.DEV) return true;
  if (typeof window !== "undefined") {
    try {
      const host = (window.location.hostname || "").toLowerCase();
      if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host.startsWith("192.168.") ||
        host.startsWith("10.") ||
        host.endsWith(".local")
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }
  // Khóa cứng 100% trên Web Production (không mở qua query param để bảo vệ giao diện người chơi)
  return false;
}

export const EXTERIOR_CATEGORIES = [
  { id: "all", label: "Tất cả" },
  { id: "architecture", label: "🏰 Kiến trúc" },
  { id: "props", label: "🏮 Tiểu cảnh" },
  { id: "forest", label: "🌲 Rừng cây" },
  { id: "centerpiece", label: "🔥 Tâm sân" },
];

export const EXTERIOR_ASSET_CATALOG = {
  house_cottage_a: {
    type: "house_cottage_a",
    propKey: "house_cottage_a",
    label: "🏠 Nhà Gỗ Đá Kiểu A",
    shortLabel: "Nhà Gỗ Đá A",
    category: "architecture",
    centerHeight: 2.55,
    hitBoxSize: [4.3, 5.6, 4.3],
    aoRadius: 3.1,
    aoScaleXZ: [1.1, 0.95],
    aoOpacity: 0.7,
    defaultSpawnRadius: 14.8,
    allowCenterZone: false,
    deletable: true,
  },
  house_cottage_b: {
    type: "house_cottage_b",
    propKey: "house_cottage_b",
    label: "🏡 Nhà Mái Rơm Kiểu B",
    shortLabel: "Nhà Mái Rơm B",
    category: "architecture",
    centerHeight: 2.45,
    hitBoxSize: [4.3, 5.3, 4.3],
    aoRadius: 3.1,
    aoScaleXZ: [1.1, 0.95],
    aoOpacity: 0.7,
    defaultSpawnRadius: 14.8,
    allowCenterZone: false,
    deletable: true,
  },
  landmark_belltower: {
    type: "landmark_belltower",
    propKey: "landmark_belltower",
    label: "🔔 Tháp Chuông Đá Gothic",
    shortLabel: "Tháp Chuông",
    category: "architecture",
    centerHeight: 4.35,
    hitBoxSize: [3.1, 9.5, 3.1],
    aoRadius: 2.6,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.72,
    defaultSpawnRadius: 16.6,
    allowCenterZone: false,
    deletable: true,
  },
  prop_gallows: {
    type: "prop_gallows",
    propKey: "prop_gallows",
    label: "⚖️ Đài Treo Cổ Gỗ",
    shortLabel: "Đài Treo Cổ",
    category: "architecture",
    centerHeight: 1.95,
    hitBoxSize: [3.2, 4.2, 3.0],
    aoRadius: 2.2,
    aoScaleXZ: [1.15, 0.9],
    aoOpacity: 0.68,
    defaultSpawnRadius: 9.6,
    allowCenterZone: false,
    deletable: true,
  },
  prop_lantern: {
    type: "prop_lantern",
    propKey: "prop_lantern",
    label: "🏮 Cột Đèn Lồng Sắt Rèn",
    shortLabel: "Cột Đèn Lồng",
    category: "props",
    centerHeight: 1.38,
    hitBoxSize: [1.05, 2.85, 1.05],
    aoRadius: 0.55,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.55,
    defaultSpawnRadius: 8.65,
    allowCenterZone: false,
    deletable: true,
  },
  prop_fence_rock: {
    type: "prop_fence_rock",
    propKey: "prop_fence_rock",
    label: "🪵 Hàng Rào Gỗ & Đá Rêu",
    shortLabel: "Hàng Rào Đá",
    category: "props",
    centerHeight: 0.56,
    hitBoxSize: [2.35, 1.25, 1.05],
    aoRadius: 1.35,
    aoScaleXZ: [1.15, 0.5],
    aoOpacity: 0.52,
    defaultSpawnRadius: 13.35,
    allowCenterZone: false,
    deletable: true,
  },
  procedural_rock: {
    type: "procedural_rock",
    propKey: null,
    label: "🪨 Tảng Đá Rêu Rừng",
    shortLabel: "Tảng Đá Rêu",
    category: "props",
    centerHeight: 0.36,
    hitBoxSize: [1.45, 0.85, 1.35],
    aoRadius: 0.75,
    aoScaleXZ: [1.15, 0.95],
    aoOpacity: 0.5,
    defaultSpawnRadius: 11.2,
    allowCenterZone: false,
    deletable: true,
  },
  tree_pine_tall: {
    type: "tree_pine_tall",
    propKey: "tree_pine_tall",
    label: "🌲 Cây Thông Tùng Cao",
    shortLabel: "Thông Cao",
    category: "forest",
    variant: "tall",
    centerHeight: 3.65,
    hitRadius: 1.65,
    hitHeight: 8.6,
    aoRadius: 1.45,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.62,
    defaultSpawnRadius: 19.5,
    allowCenterZone: false,
    deletable: true,
  },
  tree_pine_wide: {
    type: "tree_pine_wide",
    propKey: "tree_pine_wide",
    label: "🌳 Cây Thông Già Tán Rộng",
    shortLabel: "Thông Tán Rộng",
    category: "forest",
    variant: "wide",
    centerHeight: 3.15,
    hitRadius: 2.05,
    hitHeight: 7.2,
    aoRadius: 1.55,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.62,
    defaultSpawnRadius: 20.5,
    allowCenterZone: false,
    deletable: true,
  },
  tree_dead_gnarled: {
    type: "tree_dead_gnarled",
    propKey: "tree_dead_gnarled",
    label: "🍂 Cây Khô Vặn Xoắn Ma Mị",
    shortLabel: "Cây Khô Ma Mị",
    category: "forest",
    variant: "dead",
    centerHeight: 2.85,
    hitRadius: 1.75,
    hitHeight: 6.5,
    aoRadius: 1.35,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.58,
    defaultSpawnRadius: 18.8,
    allowCenterZone: false,
    deletable: true,
  },
  prop_campfire: {
    type: "prop_campfire",
    propKey: "prop_campfire",
    label: "🔥 Bếp Đá Lửa Trại Tâm Sân",
    shortLabel: "Bếp Lửa Trại",
    category: "centerpiece",
    centerHeight: 0.34,
    hitRadius: 0.95,
    hitHeight: 0.85,
    aoRadius: 1.25,
    aoScaleXZ: [1, 1],
    aoOpacity: 0.68,
    defaultSpawnRadius: 0,
    allowCenterZone: true,
    deletable: false,
  },
  plaza_cobblestone: {
    type: "plaza_cobblestone",
    propKey: "plaza_cobblestone",
    label: "🪨 Đĩa Sân Đá Cổ Ngữ",
    shortLabel: "Đĩa Sân Đá",
    category: "centerpiece",
    centerHeight: 0.12,
    clickableIn3D: false, // Tránh click nhầm mặt sàn rộng R=5.7m; chỉnh qua tab '📑 Lớp' bên phải
    aoRadius: 0,
    aoScaleXZ: [1, 1],
    aoOpacity: 0,
    defaultSpawnRadius: 0,
    allowCenterZone: true,
    deletable: false,
  },
};

export const SPAWNABLE_ASSET_TYPES = [
  "house_cottage_a",
  "house_cottage_b",
  "landmark_belltower",
  "prop_gallows",
  "prop_lantern",
  "prop_fence_rock",
  "procedural_rock",
  "tree_pine_tall",
  "tree_pine_wide",
  "tree_dead_gnarled",
];

export function round3(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

export function clampScale(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return round3(Math.max(0.15, Math.min(6.0, n)));
}

export function normalizeLayoutNode(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const meta = EXTERIOR_ASSET_CATALOG[raw.type];
  if (!meta) return null;

  const pos = Array.isArray(raw.position) ? raw.position : [0, 0, 0];
  const rot = Array.isArray(raw.rotation) ? raw.rotation : [0, 0, 0];
  const scl = Array.isArray(raw.scale)
    ? raw.scale
    : typeof raw.scale === "number"
      ? [raw.scale, raw.scale, raw.scale]
      : [1, 1, 1];

  return {
    id: String(raw.id || `${raw.type}-${index}`),
    type: meta.type,
    label: String(raw.label || `${meta.shortLabel} #${index + 1}`),
    category: meta.category,
    position: [round3(pos[0]), round3(pos[1]), round3(pos[2])],
    rotation: [round3(rot[0]), round3(rot[1]), round3(rot[2])],
    scale: [clampScale(scl[0]), clampScale(scl[1]), clampScale(scl[2])],
    seed: round3(raw.seed ?? index * 0.73),
    allowCenterZone: Boolean(raw.allowCenterZone ?? meta.allowCenterZone),
    deletable: raw.deletable !== undefined ? Boolean(raw.deletable) : Boolean(meta.deletable),
  };
}

export function isNodeViolatingSeatZone(node) {
  if (!node || node.allowCenterZone) return false;
  const dist = Math.hypot(node.position[0] || 0, node.position[2] || 0);
  return dist < NO_BUILD_SEAT_RADIUS;
}

export function pushNodeOutsideSeatZone(node) {
  if (!node || node.allowCenterZone) return node;
  const x = Number(node.position[0] || 0);
  const z = Number(node.position[2] || 0);
  const dist = Math.hypot(x, z);
  const safeR = NO_BUILD_SEAT_RADIUS + 0.45;
  if (dist >= NO_BUILD_SEAT_RADIUS) return node;

  const ux = dist > 0.01 ? x / dist : 0;
  const uz = dist > 0.01 ? z / dist : -1;
  return {
    ...node,
    position: [round3(ux * safeR), round3(node.position[1] || 0), round3(uz * safeR)],
  };
}

/**
 * Khởi tạo 122 thực thể cảnh quan mặc định chuẩn tỷ lệ Kiến trúc Dark-Fantasy
 */
export function buildDefaultVillageNodes(baseRadius = LAYOUT_REF_CIRCLE_RADIUS) {
  const nodes = [];

  // 1. Đĩa Sân Đá Cổ Ngữ & Bếp Đá Lửa Trại Tâm Sân
  nodes.push(
    normalizeLayoutNode({
      id: "plaza-main",
      type: "plaza_cobblestone",
      label: "Đĩa Sân Đá Cổ Ngữ",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      allowCenterZone: true,
      deletable: false,
    }),
    normalizeLayoutNode({
      id: "campfire-main",
      type: "prop_campfire",
      label: "Bếp Lửa Trại Trung Tâm",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      allowCenterZone: true,
      deletable: false,
    })
  );

  // 2. Đài Treo Cổ hướng 12h Bắc & Tháp Chuông Đá Gothic
  nodes.push(
    normalizeLayoutNode({
      id: "gallows-north",
      type: "prop_gallows",
      label: "Đài Treo Cổ Hướng Bắc",
      position: [0, 0, -(baseRadius + 5.4)],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    }),
    normalizeLayoutNode({
      id: "belltower-north",
      type: "landmark_belltower",
      label: "Tháp Chuông Đá Gothic",
      position: [0, 0, -(baseRadius + 12.4)],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    })
  );

  // 3. 7 Căn Nhà Cổ Bao Quanh Làng
  [-142, -98, -48, 0, 48, 98, 142].forEach((deg, idx) => {
    const rad = (deg * Math.PI) / 180;
    const dist = baseRadius + 10.6 + (idx % 2 === 0 ? 0.5 : -0.3);
    const x = Math.sin(rad) * dist;
    const z = Math.cos(rad) * dist;
    const yaw = Math.atan2(-x, -z) + (idx % 2 === 0 ? 0.06 : -0.06);
    const type = idx % 2 === 0 ? "house_cottage_a" : "house_cottage_b";
    nodes.push(
      normalizeLayoutNode({
        id: `cottage-${idx + 1}`,
        type,
        label: `${idx % 2 === 0 ? "Nhà Gỗ Đá A" : "Nhà Mái Rơm B"} #${idx + 1}`,
        position: [x, 0, z],
        rotation: [0, yaw, 0],
        scale: [1, 1, 1],
      })
    );
  });

  // 4. 6 Cột Đèn Lồng Sắt Rèn
  [-155, -105, -45, 45, 105, 155].forEach((deg, idx) => {
    const rad = (deg * Math.PI) / 180;
    const dist = baseRadius + 4.45;
    const x = Math.sin(rad) * dist;
    const z = Math.cos(rad) * dist;
    nodes.push(
      normalizeLayoutNode({
        id: `lantern-${idx + 1}`,
        type: "prop_lantern",
        label: `Cột Đèn Lồng #${idx + 1}`,
        position: [x, 0, z],
        rotation: [0, Math.atan2(-x, -z), 0],
        scale: [1, 1, 1],
      })
    );
  });

  // 5. 6 Cụm Hàng Rào Gỗ & Đá Rêu
  [-122, -74, -24, 24, 74, 122].forEach((deg, idx) => {
    const rad = (deg * Math.PI) / 180;
    const dist = baseRadius + 9.15;
    const x = Math.sin(rad) * dist;
    const z = Math.cos(rad) * dist;
    nodes.push(
      normalizeLayoutNode({
        id: `fence-${idx + 1}`,
        type: "prop_fence_rock",
        label: `Hàng Rào Đá #${idx + 1}`,
        position: [x, 0, z],
        rotation: [0, Math.atan2(-x, -z), 0],
        scale: [1, 1, 1],
      })
    );
  });

  // 6. Tảng Đá Rêu Bìa Cỏ
  const goldenAngle = 2.39996323;
  let rockIdx = 1;
  for (let i = 0; i < 20; i++) {
    const a = i * goldenAngle * 1.7;
    const normA = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(Math.abs(normA) - Math.PI) < 0.24) continue;
    const r = baseRadius + 7.0 + (i % 5) * 1.95;
    const x = Math.sin(normA) * r;
    const z = Math.cos(normA) * r;
    const s = 0.36 + (i % 4) * 0.18;
    nodes.push(
      normalizeLayoutNode({
        id: `rock-${rockIdx}`,
        type: "procedural_rock",
        label: `Tảng Đá Rêu #${rockIdx}`,
        position: [x, 0, z],
        rotation: [0, i * 1.1, 0],
        scale: [s * 1.25, s * 0.72, s],
        seed: i * 0.91,
      })
    );
    rockIdx += 1;
  }

  // 7. 84 Cây Rừng Phân Tán Theo Góc Vàng (3 Chủng Loại)
  for (let i = 0; i < 84; i++) {
    const h1 = Math.sin(i * 12.9898 + 4.14) * 43758.5453;
    const rand1 = h1 - Math.floor(h1);
    const h2 = Math.sin(i * 78.233 + 1.97) * 43758.5453;
    const rand2 = h2 - Math.floor(h2);
    const h3 = Math.sin(i * 39.425 + 9.13) * 43758.5453;
    const rand3 = h3 - Math.floor(h3);

    const angle = (i * goldenAngle + (rand1 - 0.5) * 0.28) % (Math.PI * 2);
    const depthBand = Math.pow(rand2, 0.85);
    const r = baseRadius + 14.4 + depthBand * 16.0 + Math.sin(angle * 3) * 1.1;

    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;

    let type = "tree_pine_tall";
    let prefix = "Thông Cao";
    if (rand3 > 0.82) {
      type = "tree_dead_gnarled";
      prefix = "Cây Khô";
    } else if (rand3 > 0.44) {
      type = "tree_pine_wide";
      prefix = "Thông Rộng";
    }

    const s = 0.72 + rand1 * 0.64;
    const tiltX = (rand2 - 0.5) * 0.065;
    const tiltZ = (rand3 - 0.5) * 0.065;
    const rotY = rand1 * Math.PI * 2;

    nodes.push(
      normalizeLayoutNode({
        id: `tree-${i + 1}`,
        type,
        label: `${prefix} #${i + 1}`,
        position: [x, 0, z],
        rotation: [tiltX, rotY, tiltZ],
        scale: [s, s, s],
        seed: i * 0.73,
      })
    );
  }

  return nodes.filter(Boolean);
}

export async function loadInitialVillageLayout() {
  const devAllowed = isDevArchitectAllowed();
  let publicDoc = null;
  try {
    const layoutUrl = devAllowed
      ? `${PUBLIC_LAYOUT_URL}?t=${Date.now()}`
      : `${PUBLIC_LAYOUT_URL}?v=${LAYOUT_SCHEMA_VERSION}_6`;
    const res = await fetch(layoutUrl, { cache: devAllowed ? "no-store" : "default" });
    if (res.ok) {
      const ctype = (res.headers.get("content-type") || "").toLowerCase();
      if (ctype.includes("json")) {
        const parsed = await res.json();
        if (Array.isArray(parsed?.nodes) && parsed.nodes.length > 0) {
          publicDoc = parsed;
        }
      }
    }
  } catch {
    // fallback below
  }

  // Nếu đang ở chế độ Dev Architect trên Localhost, kiểm tra bản nháp mới hơn trên trình duyệt chưa lưu cố định
  if (devAllowed && typeof window !== "undefined") {
    try {
      const rawDraft = localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY);
      if (rawDraft) {
        const draft = JSON.parse(rawDraft);
        const publicTime = Number(publicDoc?.updatedAtMs || 0);
        const draftTime = Number(draft?.updatedAtMs || 0);
        if (Array.isArray(draft?.nodes) && draft.nodes.length > 0 && draftTime > publicTime) {
          return {
            nodes: draft.nodes.map((n, i) => normalizeLayoutNode(n, i)).filter(Boolean),
            source: "draft",
            hasUnsavedDraft: true,
          };
        }
      }
    } catch {
      // ignore invalid draft
    }
  }

  if (publicDoc) {
    return {
      nodes: publicDoc.nodes.map((n, i) => normalizeLayoutNode(n, i)).filter(Boolean),
      source: "file",
      hasUnsavedDraft: false,
    };
  }

  return {
    nodes: buildDefaultVillageNodes(),
    source: "default",
    hasUnsavedDraft: false,
  };
}

export function saveVillageDraftLocal(nodes) {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      updatedAtMs: Date.now(),
      updatedAtIso: new Date().toISOString(),
      nodes,
    };
    localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

export function clearVillageDraftLocal() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LOCAL_DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function saveVillageLayoutToProjectFile(nodes) {
  const payload = {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    updatedAtMs: Date.now(),
    updatedAtIso: new Date().toISOString(),
    note: "Bố cục không gian Làng Ma Sói 3D được dàn dựng bằng D5 Architect Studio (Không tác động ghế ngồi người chơi)",
    nodes: nodes.map((n, idx) => normalizeLayoutNode(n, idx)).filter(Boolean),
  };

  const endpoint = `${getDevServerOrigin()}/api/dev/village-layout`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Lỗi lưu file HTTP ${res.status}`);
  }
  clearVillageDraftLocal();
  return data;
}
