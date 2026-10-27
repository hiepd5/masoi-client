import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, textureCompress, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import { buildSkinnedDocumentFromStatic } from "./auto_rig_9_characters.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_ROOT = path.resolve(__dirname, "..");
const GAME_ROOT = path.resolve(CLIENT_ROOT, "..");

const cliRawDir = process.argv.slice(2).find((a) => !a.startsWith("--"));
const CANDIDATE_RAW_DIRS = [
  cliRawDir ? path.resolve(cliRawDir) : null,
  path.resolve(GAME_ROOT, "masoi_banana_models", "avatars_3d_raw"),
  path.resolve(GAME_ROOT, "..", "masoi_banana_models", "avatars_3d_raw"),
  "C:\\CLAUDE CODE\\HIEPD5 Prompt\\masoi_banana_models\\avatars_3d_raw",
].filter(Boolean);

const RAW_DIR =
  CANDIDATE_RAW_DIRS.find((d) => fs.existsSync(d)) || CANDIDATE_RAW_DIRS[CANDIDATE_RAW_DIRS.length - 1];
fs.mkdirSync(RAW_DIR, { recursive: true });

const AVATARS_GLB_OUT_DIR = path.join(CLIENT_ROOT, "public", "models", "avatars");
const BADGES_OUT_DIR = path.join(CLIENT_ROOT, "public", "portraits", "avatars", "badges");
const CARDS_OUT_DIR = path.join(CLIENT_ROOT, "public", "portraits", "avatars", "cards");
const CLIENT_MANIFEST_PATH = path.join(AVATARS_GLB_OUT_DIR, "avatars_manifest.json");
const SERVER_REGISTRY_PATH = path.join(GAME_ROOT, "server", "avatars_registry.json");

for (const dir of [AVATARS_GLB_OUT_DIR, BADGES_OUT_DIR, CARDS_OUT_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });

const BUILTIN_VILLAGERS_MANIFEST = [
  {
    id: "villager_cloak",
    slotKey: "villager_cloak",
    label: "Áo Choàng Bí Ẩn",
    shortLabel: "Áo Choàng",
    desc: "Lữ khách khoác áo choàng Bắc Âu cổ điển",
    status: "ready",
    source: "builtin_villager",
    botAllowed: true,
    tintableCloak: true,
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
    tintableCloak: true,
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
    tintableCloak: true,
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
    tintableCloak: true,
    glbUrl: "/models/characters/char_villager_elder.glb",
    portraitBadge: "/portraits/badges/villager_elder.webp",
    portraitCard: "/portraits/cards/villager_elder.webp",
  },
];

function prettifyHumanLabel(baseName, slotNum) {
  const pad = String(slotNum).padStart(2, "0");
  const cleaned = baseName
    .replace(/^avatar_real_\d+_?/i, "")
    .replace(/^\d+[_-]?/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!cleaned) return `Người Thật 3D #${pad}`;
  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Software Z-Buffer 3D Rasterizer siêu tốc (Tầng 1 Node.js ~0.12s):
 * Chụp chân dung 1:1 (cận mặt/ngực) và 2:3 (toàn thân) trực tiếp từ đỉnh + UV Texture của .GLB
 * nếu người dùng không thả kèm ảnh .png/.jpg bên cạnh file .glb.
 */
async function renderPortraitsFromDocOrPhoto({ doc, rawDir, baseName, badgeOutPath, cardOutPath }) {
  for (const ext of [".png", ".webp", ".jpg", ".jpeg"]) {
    const sidecarImg = path.join(rawDir, `${baseName}${ext}`);
    if (fs.existsSync(sidecarImg)) {
      await sharp(sidecarImg)
        .resize(384, 384, { fit: "cover", position: "attention" })
        .webp({ quality: 88 })
        .toFile(badgeOutPath);
      await sharp(sidecarImg)
        .resize(480, 720, { fit: "cover", position: "north" })
        .webp({ quality: 88 })
        .toFile(cardOutPath);
      return "sidecar_photo";
    }
  }

  // Trích xuất Texture BaseColor đầu tiên trong GLB (nếu có) để tô màu UV chính xác 1:1
  let texPixels = null;
  let texW = 0;
  let texH = 0;
  const textures = doc.getRoot().listTextures();
  if (textures.length > 0 && textures[0].getImage()) {
    try {
      const decoded = await sharp(Buffer.from(textures[0].getImage()))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      texPixels = decoded.data;
      texW = decoded.info.width;
      texH = decoded.info.height;
    } catch {
      texPixels = null;
    }
  }

  const meshes = doc.getRoot().listMeshes();
  const tris = [];
  let minY = Infinity;
  let maxY = -Infinity;

  for (const m of meshes) {
    for (const prim of m.listPrimitives()) {
      const posAcc = prim.getAttribute("POSITION");
      if (!posAcc) continue;
      const pos = posAcc.getArray();
      const norm = prim.getAttribute("NORMAL")?.getArray() || null;
      const uv = prim.getAttribute("TEXCOORD_0")?.getArray() || null;
      const idx = prim.getIndices()?.getArray() || null;
      const count = idx ? idx.length : pos.length / 3;

      for (let i = 0; i + 2 < count; i += 3) {
        const i0 = idx ? idx[i] : i;
        const i1 = idx ? idx[i + 1] : i + 1;
        const i2 = idx ? idx[i + 2] : i + 2;
        const y0 = pos[i0 * 3 + 1];
        const y1 = pos[i1 * 3 + 1];
        const y2 = pos[i2 * 3 + 1];
        minY = Math.min(minY, y0, y1, y2);
        maxY = Math.max(maxY, y0, y1, y2);
        tris.push({ pos, norm, uv, i0, i1, i2 });
      }
    }
  }

  const modelH = Math.max(0.5, maxY - minY);

  const rasterizeView = async (width, height, yLowRatio, yHighRatio, outPath) => {
    const rgba = Buffer.alloc(width * height * 4);
    const zbuf = new Float32Array(width * height).fill(-Infinity);

    // Phông nền Dark Nordic Obsidian có quầng sáng vàng đồng nhẹ phía sau đầu
    const cx = width * 0.5;
    const cy = height * 0.36;
    const maxR = Math.hypot(width, height) * 0.55;
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const d = Math.min(1, Math.hypot(px - cx, py - cy) / maxR);
        const glow = Math.pow(1 - d, 2.2);
        const off = (py * width + px) * 4;
        rgba[off + 0] = Math.round(9 + glow * 58);
        rgba[off + 1] = Math.round(13 + glow * 44);
        rgba[off + 2] = Math.round(26 + glow * 22);
        rgba[off + 3] = 255;
      }
    }

    const viewYMin = minY + modelH * yLowRatio;
    const viewYMax = minY + modelH * yHighRatio;
    const spanY = Math.max(0.2, viewYMax - viewYMin);
    const scale = (height * 0.86) / spanY;
    const padTop = height * 0.07;

    for (const tri of tris) {
      const { pos, norm, uv, i0, i1, i2 } = tri;
      const x0 = cx + pos[i0 * 3 + 0] * scale;
      const y0 = padTop + (viewYMax - pos[i0 * 3 + 1]) * scale;
      const z0 = pos[i0 * 3 + 2];

      const x1 = cx + pos[i1 * 3 + 0] * scale;
      const y1 = padTop + (viewYMax - pos[i1 * 3 + 1]) * scale;
      const z1 = pos[i1 * 3 + 2];

      const x2 = cx + pos[i2 * 3 + 0] * scale;
      const y2 = padTop + (viewYMax - pos[i2 * 3 + 1]) * scale;
      const z2 = pos[i2 * 3 + 2];

      const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(denom) < 1e-4) continue;

      const minPx = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxPx = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minPy = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxPy = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)));
      if (minPx > maxPx || minPy > maxPy) continue;

      let shade = 0.92;
      if (norm) {
        const nx = (norm[i0 * 3] + norm[i1 * 3] + norm[i2 * 3]) / 3;
        const ny = (norm[i0 * 3 + 1] + norm[i1 * 3 + 1] + norm[i2 * 3 + 1]) / 3;
        const nz = (norm[i0 * 3 + 2] + norm[i1 * 3 + 2] + norm[i2 * 3 + 2]) / 3;
        const keyLight = Math.max(0, nx * 0.32 + ny * 0.38 + nz * 0.86);
        shade = 0.42 + keyLight * 0.68;
      }

      for (let py = minPy; py <= maxPy; py++) {
        for (let px = minPx; px <= maxPx; px++) {
          const w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denom;
          const w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denom;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;

          const z = w0 * z0 + w1 * z1 + w2 * z2;
          const idxBuf = py * width + px;
          if (z <= zbuf[idxBuf]) continue;
          zbuf[idxBuf] = z;

          let r = 218;
          let g = 192;
          let b = 165;
          if (texPixels && uv) {
            const uRaw = w0 * uv[i0 * 2] + w1 * uv[i1 * 2] + w2 * uv[i2 * 2];
            const vRaw = w0 * uv[i0 * 2 + 1] + w1 * uv[i1 * 2 + 1] + w2 * uv[i2 * 2 + 1];
            const u = ((uRaw % 1) + 1) % 1;
            const v = ((vRaw % 1) + 1) % 1;
            const tx = Math.min(texW - 1, Math.floor(u * texW));
            const ty = Math.min(texH - 1, Math.floor(v * texH));
            const tOff = (ty * texW + tx) * 4;
            r = texPixels[tOff + 0];
            g = texPixels[tOff + 1];
            b = texPixels[tOff + 2];
          }

          const pOff = idxBuf * 4;
          rgba[pOff + 0] = Math.min(255, Math.round(r * shade));
          rgba[pOff + 1] = Math.min(255, Math.round(g * shade));
          rgba[pOff + 2] = Math.min(255, Math.round(b * shade));
          rgba[pOff + 3] = 255;
        }
      }
    }

    await sharp(rgba, { raw: { width, height, channels: 4 } })
      .webp({ quality: 88 })
      .toFile(outPath);
  };

  await rasterizeView(384, 384, 0.56, 1.03, badgeOutPath);
  await rasterizeView(480, 720, 0.0, 1.04, cardOutPath);
  return "glb_raster";
}

console.log("===============================================================================");
console.log("  MA SOI 3D V4.1 - 1-CLICK AVATAR 3D NGUOI THAT CA NHAN HOA + DB MANIFEST");
console.log("===============================================================================");
console.log(`  [+] Kho nguon Raw (.glb):     ${RAW_DIR}`);
console.log(`  [+] Thu muc xuat GLB Web:     ${AVATARS_GLB_OUT_DIR}`);

let metaOverrides = {};
const metaJsonPath = path.join(RAW_DIR, "avatars_meta.json");
if (fs.existsSync(metaJsonPath)) {
  try {
    metaOverrides = JSON.parse(fs.readFileSync(metaJsonPath, "utf8"));
  } catch {
    metaOverrides = {};
  }
}

const rawGlbFiles = fs
  .readdirSync(RAW_DIR)
  .filter((f) => f.toLowerCase().endsWith(".glb"))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

const slotMap = new Map();
let autoSlotCursor = 1;

for (const fileName of rawGlbFiles) {
  const baseName = path.basename(fileName, path.extname(fileName));
  const explicitMatch = baseName.match(/(?:avatar_real_|^)(\d{1,3})(?:$|[_-])/i);
  let slotNum = explicitMatch ? parseInt(explicitMatch[1], 10) : 0;
  if (!slotNum || slotNum < 1 || slotMap.has(slotNum)) {
    while (slotMap.has(autoSlotCursor)) autoSlotCursor++;
    slotNum = autoSlotCursor;
  }
  slotMap.set(slotNum, { fileName, baseName, slotNum });
}

const highestSlot = slotMap.size > 0 ? Math.max(...slotMap.keys()) : 0;
const totalSlots = Math.max(12, highestSlot);
const customHumanAvatars = [];
let builtCount = 0;

for (let slotNum = 1; slotNum <= totalSlots; slotNum++) {
  const pad = String(slotNum).padStart(2, "0");
  const slotId = `avatar_real_${pad}`;
  const entry = slotMap.get(slotNum);

  if (!entry) {
    customHumanAvatars.push({
      id: slotId,
      slotNumber: slotNum,
      label: `Người Thật 3D #${pad}`,
      shortLabel: `Ô Chờ #${pad}`,
      desc: "Ô chờ nạp Model 3D Người Thật • Chuẩn bị đồng bộ Database User",
      status: "reserved",
      source: "custom_3d_human",
      botAllowed: false,
      tintableCloak: false,
      glbUrl: null,
      portraitBadge: null,
      portraitCard: null,
    });
    continue;
  }

  const srcGlbPath = path.join(RAW_DIR, entry.fileName);
  const srcDoc = await io.read(srcGlbPath);
  const existingSkins = srcDoc.getRoot().listSkins();

  let workingDoc = srcDoc;
  let boneCount = 0;
  if (
    existingSkins.length > 0 &&
    existingSkins.every((sk) => sk.getName() !== "MasoiAutoRigArmature")
  ) {
    boneCount = existingSkins[0].listJoints().length;
  } else {
    const rigged = buildSkinnedDocumentFromStatic(srcDoc, {
      id: slotId,
      expectedHeight: 1.75,
      headCrownRatio: 0.95,
      isWolf: false,
      garmentSkirt: 0.16,
      backCapeShield: false,
    });
    workingDoc = rigged.outDoc;
    boneCount = rigged.skel.joints.length;
  }

  const badgeOutPath = path.join(BADGES_OUT_DIR, `${slotId}.webp`);
  const cardOutPath = path.join(CARDS_OUT_DIR, `${slotId}.webp`);
  const portraitMode = await renderPortraitsFromDocOrPhoto({
    doc: workingDoc,
    rawDir: RAW_DIR,
    baseName: entry.baseName,
    badgeOutPath,
    cardOutPath,
  });

  await workingDoc.transform(
    dedup(),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      resize: [1024, 1024],
      quality: 86,
    }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" })
  );

  const outGlbPath = path.join(AVATARS_GLB_OUT_DIR, `${slotId}.glb`);
  await io.write(outGlbPath, workingDoc);
  const outKB = (fs.statSync(outGlbPath).size / 1024).toFixed(1);

  const override = metaOverrides[slotId] || metaOverrides[entry.baseName] || {};
  const label = override.label || prettifyHumanLabel(entry.baseName, slotNum);
  const shortLabel = override.shortLabel || label.slice(0, 14);
  const desc =
    override.desc || "Avatar 3D Người Thật cá nhân hóa • Ngồi ghế 0.48m màu gốc 100%";

  customHumanAvatars.push({
    id: slotId,
    slotNumber: slotNum,
    label,
    shortLabel,
    desc,
    status: "ready",
    source: "custom_3d_human",
    botAllowed: false,
    tintableCloak: false,
    glbUrl: `/models/avatars/${slotId}.glb`,
    portraitBadge: `/portraits/avatars/badges/${slotId}.webp`,
    portraitCard: `/portraits/avatars/cards/${slotId}.webp`,
  });

  builtCount++;
  console.log(
    `  [READY] ${slotId} <= ${entry.fileName} | ${boneCount} bones | ${outKB} KB | Portrait=${portraitMode}`
  );
}

const manifestPayload = {
  schemaVersion: "1.0.0",
  updatedAt: new Date().toISOString().slice(0, 10),
  dbReadySchema: {
    futureTable: "users",
    column: "citizen_model_id",
    notes:
      "4 nhân vật Dân Làng 3D sẵn sàng + Kho Ô Chờ Avatar 3D Người Thật mở rộng không giới hạn qua UPDATE_AVATARS_3D.bat hoặc upload từ Tài khoản User trong tương lai.",
  },
  builtinVillagers: BUILTIN_VILLAGERS_MANIFEST,
  customHumanAvatars,
};

fs.writeFileSync(CLIENT_MANIFEST_PATH, JSON.stringify(manifestPayload, null, 2) + "\n", "utf8");

const serverRegistryPayload = {
  schemaVersion: "1.0.0",
  updatedAt: manifestPayload.updatedAt,
  builtinVillagerIds: BUILTIN_VILLAGERS_MANIFEST.map((v) => v.id),
  customHumanAvatars: customHumanAvatars.map((item) => ({
    id: item.id,
    status: item.status,
    botAllowed: false,
    portraitBadge: item.portraitBadge,
  })),
};

fs.writeFileSync(SERVER_REGISTRY_PATH, JSON.stringify(serverRegistryPayload, null, 2) + "\n", "utf8");

console.log("-------------------------------------------------------------------------------");
console.log(
  `  [HOAN TAT] Da dong bo ${builtCount} Avatar 3D Nguoi That + ${totalSlots - builtCount} O Cho Reserved!`
);
console.log(`  [+] Client Manifest: ${CLIENT_MANIFEST_PATH}`);
console.log(`  [+] Server Registry: ${SERVER_REGISTRY_PATH}`);
console.log("===============================================================================");
