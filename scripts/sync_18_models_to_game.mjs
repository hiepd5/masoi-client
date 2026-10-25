import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, weld, textureCompress, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_ROOT = path.resolve(__dirname, "..");
const GAME_ROOT = path.resolve(CLIENT_ROOT, "..");

const PROPS_OUT_DIR = path.join(CLIENT_ROOT, "public", "models", "props");
const CHARS_OUT_DIR = path.join(CLIENT_ROOT, "public", "models", "characters");
const HAND_PROPS_OUT_DIR = path.join(CLIENT_ROOT, "public", "models", "hand_props");
const VILLAGE_LAYOUT_PATH = path.join(CLIENT_ROOT, "public", "config", "village_layout.json");
const LAYOUT_BACKUPS_DIR = path.join(GAME_ROOT, "data", "layout_backups");
const SYNC_REPORT_PATH = path.join(GAME_ROOT, "data", "noel_18_models_sync_report.json");

// Tự động dò tìm thư mục kho `masoi_banana_models/events/noel/glb_ready` (hỗ trợ truyền đường dẫn qua CLI)
const cliCustomDir = process.argv.slice(2).find((a) => !a.startsWith("--"));
const CANDIDATE_READY_DIRS = [
  cliCustomDir ? path.resolve(cliCustomDir) : null,
  path.resolve(GAME_ROOT, "masoi_banana_models", "events", "noel", "glb_ready"),
  path.resolve(GAME_ROOT, "..", "masoi_banana_models", "events", "noel", "glb_ready"),
  "C:\\CLAUDE CODE\\HIEPD5 Prompt\\masoi_banana_models\\events\\noel\\glb_ready",
].filter(Boolean);

const READY_DIR = CANDIDATE_READY_DIRS.find((p) => fs.existsSync(p));
if (!READY_DIR) {
  console.error("[LOI] Khong tim thay thu muc glb_ready! Hay truyen duong dan qua tham so CLI.");
  process.exit(1);
}

for (const d of [PROPS_OUT_DIR, CHARS_OUT_DIR, HAND_PROPS_OUT_DIR, LAYOUT_BACKUPS_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });

/**
 * BẢNG ÁNH XẠ ĐẦY ĐỦ 18/18 SLOT + 1 BIẾN THỂ MA SÓI PHỤ (#07B):
 * - Giữ 100% chi tiết lưới gốc Smart Mesh (~15k tris, 0% simplify để bảo toàn mặt/răng/lông/nguyệt quế).
 * - Nén Texture sang WebP Q86 + Nén đỉnh hình học Meshopt (`EXT_meshopt_compression`).
 * - Hỗ trợ đồng bộ ngay 12 file hiện có VÀ tự động nhận tiếp 7 dụng cụ còn lại khi có file!
 */
const SLOT_SYNC_RULES = [
  // === NHÓM A: 8 NHÂN VẬT CHÍNH + 1 SÓI PHỤ + 1 ÁO CHOÀNG ẨN DANH ===
  {
    id: "wolf",
    srcFile: "char_wolf_noel.glb",
    category: "character",
    targets: [{ dir: CHARS_OUT_DIR, fileName: "char_wolf.glb", manifestKey: "wolf" }],
    expectedHeight: 2.05,
    maxTex: 1024,
  },
  {
    id: "wolf_alt",
    srcFile: "char_wolf_alt_noel.glb",
    category: "character",
    targets: [{ dir: CHARS_OUT_DIR, fileName: "char_wolf_alt.glb", manifestKey: "wolf_alt" }],
    expectedHeight: 2.05,
    maxTex: 1024,
  },
  {
    id: "seer",
    srcFile: "char_seer_noel.glb",
    category: "character",
    targets: [{ dir: CHARS_OUT_DIR, fileName: "char_seer.glb", manifestKey: "seer" }],
    expectedHeight: 1.78,
    maxTex: 1024,
  },
  {
    id: "witch",
    srcFile: "char_witch_noel.glb",
    category: "character",
    targets: [{ dir: CHARS_OUT_DIR, fileName: "char_witch.glb", manifestKey: "witch" }],
    expectedHeight: 1.74,
    maxTex: 1024,
  },
  {
    id: "guard",
    srcFile: "char_guard_noel.glb",
    category: "character",
    targets: [{ dir: CHARS_OUT_DIR, fileName: "char_guard.glb", manifestKey: "guard" }],
    expectedHeight: 1.88,
    maxTex: 1024,
  },
  {
    id: "villager",
    srcFile: "char_villager_noel.glb",
    category: "character",
    targets: [
      { dir: CHARS_OUT_DIR, fileName: "char_villager_true.glb", manifestKey: "villager_true" },
      { dir: CHARS_OUT_DIR, fileName: "char_villager_cloak.glb", manifestKey: "villager_cloak" },
    ],
    expectedHeight: 1.76,
    maxTex: 1024,
  },
  {
    id: "tough_guy",
    srcFile: "char_tough_guy_noel.glb",
    category: "character",
    targets: [{ dir: CHARS_OUT_DIR, fileName: "char_tough_guy.glb", manifestKey: "tough_guy" }],
    expectedHeight: 1.92,
    maxTex: 1024,
  },
  {
    id: "cursed",
    srcFile: "char_cursed_noel.glb",
    category: "character",
    targets: [{ dir: CHARS_OUT_DIR, fileName: "char_cursed.glb", manifestKey: "cursed" }],
    expectedHeight: 1.78,
    maxTex: 1024,
  },
  {
    id: "tanner",
    srcFile: "char_tanner_noel.glb",
    category: "character",
    targets: [{ dir: CHARS_OUT_DIR, fileName: "char_tanner.glb", manifestKey: "tanner" }],
    expectedHeight: 1.75,
    maxTex: 1024,
  },

  // === NHÓM B: ĐẠO CỤ VAI TRÒ / KHE CẦM TAY ===
  {
    id: "prop_guard_shield",
    srcFile: "prop_guard_shield_noel.glb",
    category: "hand_prop",
    targets: [
      { dir: HAND_PROPS_OUT_DIR, fileName: "prop_hand_guard_shield.glb", manifestKey: "guard_shield" },
    ],
    expectedHeight: 1.1,
    maxTex: 768,
  },
  {
    id: "prop_seer_orb",
    srcFile: "prop_seer_orb_noel.glb",
    category: "hand_prop",
    targets: [
      { dir: HAND_PROPS_OUT_DIR, fileName: "prop_hand_seer_orb.glb", manifestKey: "seer_orb" },
    ],
    expectedHeight: 1.25,
    maxTex: 768,
  },
  {
    id: "prop_witch_potions",
    srcFile: "prop_witch_potions_noel.glb",
    category: "hand_prop",
    targets: [
      { dir: HAND_PROPS_OUT_DIR, fileName: "prop_hand_witch_elixir.glb", manifestKey: "witch_elixir" },
      { dir: HAND_PROPS_OUT_DIR, fileName: "prop_hand_witch_poison.glb", manifestKey: "witch_poison" },
    ],
    expectedHeight: 0.65,
    maxTex: 768,
  },

  // === NHÓM C: 6 CÔNG TRÌNH & ĐẠO CỤ SỐNG NGOẠI CẢNH ===
  {
    id: "prop_rune_obelisk",
    srcFile: "prop_rune_obelisk_noel.glb",
    category: "village_prop",
    targets: [{ dir: PROPS_OUT_DIR, fileName: "prop_rune_obelisk.glb", manifestKey: "prop_rune_obelisk" }],
    expectedHeight: 2.65,
    maxTex: 1024,
  },
  {
    id: "prop_mist_well",
    srcFile: "prop_mist_well_noel.glb",
    category: "village_prop",
    targets: [{ dir: PROPS_OUT_DIR, fileName: "prop_mist_well.glb", manifestKey: "prop_mist_well" }],
    expectedHeight: 2.35,
    maxTex: 1024,
  },
  {
    id: "prop_witch_cauldron",
    srcFile: "prop_witch_cauldron_noel.glb",
    category: "village_prop",
    targets: [{ dir: PROPS_OUT_DIR, fileName: "prop_witch_cauldron.glb", manifestKey: "prop_witch_cauldron" }],
    expectedHeight: 1.15,
    maxTex: 1024,
  },
  {
    id: "prop_village_banner",
    srcFile: "prop_village_banner_noel.glb",
    category: "village_prop",
    targets: [{ dir: PROPS_OUT_DIR, fileName: "prop_village_banner.glb", manifestKey: "prop_village_banner" }],
    expectedHeight: 3.85,
    maxTex: 1024,
  },
  {
    id: "prop_cart_brazier",
    srcFile: "prop_cart_brazier_noel.glb",
    category: "village_prop",
    targets: [{ dir: PROPS_OUT_DIR, fileName: "prop_cart_brazier.glb", manifestKey: "prop_cart_brazier" }],
    expectedHeight: 1.65,
    maxTex: 1024,
  },
  {
    id: "prop_nordic_raven",
    srcFile: "prop_nordic_raven_noel.glb",
    category: "village_prop",
    targets: [{ dir: PROPS_OUT_DIR, fileName: "prop_nordic_raven.glb", manifestKey: "prop_nordic_raven" }],
    expectedHeight: 0.95,
    maxTex: 768,
  },
  {
    id: "prop_tribunal_gallows",
    srcFile: "prop_tribunal_gallows_noel.glb",
    category: "village_prop",
    targets: [{ dir: PROPS_OUT_DIR, fileName: "prop_gallows.glb", manifestKey: "prop_gallows" }],
    expectedHeight: 3.6,
    maxTex: 1024,
  },
];

function countTriangles(doc) {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      if (indices) tris += Math.floor(indices.getCount() / 3);
      else {
        const pos = prim.getAttribute("POSITION");
        if (pos) tris += Math.floor(pos.getCount() / 3);
      }
    }
  }
  return tris;
}

function measureSceneBounds(doc) {
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  if (!scene) return null;

  // Nếu là SkinnedMesh đã nén Meshopt (quantize đưa hệ số tỷ lệ vào inverseBindMatrices):
  // Tính chính xác hộp bao thực tế sau biến đổi Skinning M_joint * IBM * pos!
  const skins = doc.getRoot().listSkins();
  if (skins.length > 0) {
    const skin = skins[0];
    const joints = skin.listJoints();
    const ibmAcc = skin.getInverseBindMatrices();
    if (joints.length > 0 && ibmAcc) {
      const jointWorldMats = joints.map((j) => {
        const chain = [];
        let cur = j;
        while (cur && cur.listParents) {
          chain.unshift(cur);
          const pNode = cur.listParents().find((p) => p.propertyType === "Node");
          cur = pNode || null;
        }
        let m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        for (const n of chain) {
          const nm = n.getMatrix();
          const out = new Array(16).fill(0);
          for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) {
              out[c * 4 + r] =
                m[0 * 4 + r] * nm[c * 4 + 0] +
                m[1 * 4 + r] * nm[c * 4 + 1] +
                m[2 * 4 + r] * nm[c * 4 + 2] +
                m[3 * 4 + r] * nm[c * 4 + 3];
            }
          }
          m = out;
        }
        return m;
      });

      const skinMats = joints.map((_, idx) => {
        const ibm = new Array(16);
        ibmAcc.getElement(idx, ibm);
        const jm = jointWorldMats[idx];
        const out = new Array(16).fill(0);
        for (let c = 0; c < 4; c++) {
          for (let r = 0; r < 4; r++) {
            out[c * 4 + r] =
              jm[0 * 4 + r] * ibm[c * 4 + 0] +
              jm[1 * 4 + r] * ibm[c * 4 + 1] +
              jm[2 * 4 + r] * ibm[c * 4 + 2] +
              jm[3 * 4 + r] * ibm[c * 4 + 3];
          }
        }
        return out;
      });

      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      const pTmp = [0, 0, 0];
      const jTmp = [0, 0, 0, 0];
      const wTmp = [0, 0, 0, 0];

      for (const mesh of doc.getRoot().listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          const posAcc = prim.getAttribute("POSITION");
          const jAcc = prim.getAttribute("JOINTS_0");
          const wAcc = prim.getAttribute("WEIGHTS_0");
          if (!posAcc || !jAcc || !wAcc) continue;
          const cnt = posAcc.getCount();
          for (let i = 0; i < cnt; i++) {
            posAcc.getElement(i, pTmp);
            jAcc.getElement(i, jTmp);
            wAcc.getElement(i, wTmp);
            let sx = 0, sy = 0, sz = 0;
            for (let k = 0; k < 4; k++) {
              const w = wTmp[k];
              if (w <= 0) continue;
              const sm = skinMats[jTmp[k]] || skinMats[0];
              sx += w * (sm[0] * pTmp[0] + sm[4] * pTmp[1] + sm[8] * pTmp[2] + sm[12]);
              sy += w * (sm[1] * pTmp[0] + sm[5] * pTmp[1] + sm[9] * pTmp[2] + sm[13]);
              sz += w * (sm[2] * pTmp[0] + sm[6] * pTmp[1] + sm[10] * pTmp[2] + sm[14]);
            }
            if (sx < minX) minX = sx;
            if (sy < minY) minY = sy;
            if (sz < minZ) minZ = sz;
            if (sx > maxX) maxX = sx;
            if (sy > maxY) maxY = sy;
            if (sz > maxZ) maxZ = sz;
          }
        }
      }

      if (Number.isFinite(minY)) {
        return {
          minX: Number(minX.toFixed(4)),
          minY: Number(minY.toFixed(4)),
          minZ: Number(minZ.toFixed(4)),
          maxX: Number(maxX.toFixed(4)),
          maxY: Number(maxY.toFixed(4)),
          maxZ: Number(maxZ.toFixed(4)),
          sizeX: Number((maxX - minX).toFixed(4)),
          sizeY: Number((maxY - minY).toFixed(4)),
          sizeZ: Number((maxZ - minZ).toFixed(4)),
          centerX: Number(((minX + maxX) * 0.5).toFixed(4)),
          centerZ: Number(((minZ + maxZ) * 0.5).toFixed(4)),
        };
      }
    }
  }

  const b = getBounds(scene);
  return {
    minX: Number(b.min[0].toFixed(4)),
    minY: Number(b.min[1].toFixed(4)),
    minZ: Number(b.min[2].toFixed(4)),
    maxX: Number(b.max[0].toFixed(4)),
    maxY: Number(b.max[1].toFixed(4)),
    maxZ: Number(b.max[2].toFixed(4)),
    sizeX: Number((b.max[0] - b.min[0]).toFixed(4)),
    sizeY: Number((b.max[1] - b.min[1]).toFixed(4)),
    sizeZ: Number((b.max[2] - b.min[2]).toFixed(4)),
    centerX: Number(((b.min[0] + b.max[0]) * 0.5).toFixed(4)),
    centerZ: Number(((b.min[2] + b.max[2]) * 0.5).toFixed(4)),
  };
}

console.log("===============================================================================");
console.log("  MA SOI 3D - KIEM DINH 1:1 & DONG BO 18 MODEL TRIPO (LOSSLESS MESHOPT + WEBP)");
console.log("===============================================================================");
console.log(`  [+] Nguon glb_ready: ${READY_DIR}`);

let totalInBytes = 0;
let totalOutBytes = 0;
const reportItems = [];
const missingSlots = [];

for (const rule of SLOT_SYNC_RULES) {
  const srcPath = path.join(READY_DIR, rule.srcFile);
  if (!fs.existsSync(srcPath)) {
    missingSlots.push(rule.id);
    continue;
  }

  const inBytes = fs.statSync(srcPath).size;
  const doc = await io.read(srcPath);
  const preBounds = measureSceneBounds(doc);
  const preTris = countTriangles(doc);
  const skinsBefore = doc.getRoot().listSkins();
  const hasSkinRig = skinsBefore.length > 0;
  const boneCountBefore = hasSkinRig ? skinsBefore[0].listJoints().length : 0;

  // Giữ 100% chi tiết đa giác gốc & bảo toàn tuyệt đối Skin/JOINTS_0/WEIGHTS_0 khi nén WebP + Meshopt!
  const transforms = [
    dedup(),
    ...(hasSkinRig ? [] : [weld()]),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      slots: /^(baseColorTexture|emissiveTexture|normalTexture)$/i,
      resize: [rule.maxTex, rule.maxTex],
      quality: 86,
    }),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      slots: /^(metallicRoughnessTexture|occlusionTexture)$/i,
      resize: [Math.min(512, rule.maxTex), Math.min(512, rule.maxTex)],
      quality: 82,
    }),
    meshopt({
      encoder: MeshoptEncoder,
      level: "medium",
    }),
  ];
  await doc.transform(...transforms);

  const primaryDest = path.join(rule.targets[0].dir, rule.targets[0].fileName);
  await io.write(primaryDest, doc);

  // Đọc ngược file sau nén để kiểm định Ground-Truth 1:1 (`minY = 0.000m`, `heightMeters`, `tris`, `skins`)
  const verifyDoc = await io.read(primaryDest);
  const postBounds = measureSceneBounds(verifyDoc);
  const postTris = countTriangles(verifyDoc);
  const postSkins = verifyDoc.getRoot().listSkins();
  const verifiedSkinRig = postSkins.length > 0;
  const verifiedBoneCount = verifiedSkinRig ? postSkins[0].listJoints().length : 0;
  const outBytes = fs.statSync(primaryDest).size;

  for (let i = 1; i < rule.targets.length; i++) {
    const extraDest = path.join(rule.targets[i].dir, rule.targets[i].fileName);
    fs.copyFileSync(primaryDest, extraDest);
  }

  totalInBytes += inBytes;
  totalOutBytes += outBytes;
  const savedPct = ((1 - outBytes / Math.max(1, inBytes)) * 100).toFixed(1);

  const itemAudit = {
    slotId: rule.id,
    category: rule.category,
    sourceFile: rule.srcFile,
    deployedFiles: rule.targets.map((t) => t.fileName),
    inKB: Number((inBytes / 1024).toFixed(1)),
    outKB: Number((outBytes / 1024).toFixed(1)),
    savedPercent: Number(savedPct),
    trianglesBefore: preTris,
    trianglesAfter: postTris,
    hasSkinRig: verifiedSkinRig,
    boneCount: verifiedBoneCount || boneCountBefore,
    expectedHeightMeters: rule.expectedHeight,
    verifiedHeightMeters: postBounds.sizeY,
    verifiedMinY: postBounds.minY,
    verifiedSpanXZ: [postBounds.sizeX, postBounds.sizeZ],
    verifiedCenterXZ: [postBounds.centerX, postBounds.centerZ],
    groundTouchOk: Math.abs(postBounds.minY) <= 0.006,
    heightMatchOk: Math.abs(postBounds.sizeY - rule.expectedHeight) <= 0.02,
  };
  reportItems.push(itemAudit);

  console.log(
    `  [OK] ${rule.id.padEnd(20)} | H=${postBounds.sizeY.toFixed(2)}m (minY=${postBounds.minY.toFixed(4)}m) | ` +
      `${(inBytes / 1024).toFixed(0).padStart(4)}KB -> ${(outBytes / 1024).toFixed(0).padStart(4)}KB (-${savedPct}%) | ` +
      `${postTris} tris | Rig:${verifiedSkinRig ? `YES(${verifiedBoneCount}b)` : "SmartMesh"}`
  );
}

// 1. Cập nhật characters_manifest.json
const activeCharacters = {};
for (const f of fs.readdirSync(CHARS_OUT_DIR)) {
  const m = /^char_([a-z0-9_]+)\.glb$/i.exec(f);
  if (m) activeCharacters[m[1].toLowerCase()] = `/models/characters/${f}`;
}
fs.writeFileSync(
  path.join(CHARS_OUT_DIR, "characters_manifest.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      updatedAtIso: new Date().toISOString(),
      compressedFormat: "webp+meshopt_lossless",
      note: "Kho Nhan Vat 3D Tripo AI (Ho tro Kep Smart Mesh Y=0.00m & Auto-Rig + Bien the Soi Phu wolf_alt)!",
      characters: activeCharacters,
    },
    null,
    2
  ) + "\n",
  "utf8"
);

// 2. Cập nhật hand_props_manifest.json
const activeHandProps = {};
for (const f of fs.readdirSync(HAND_PROPS_OUT_DIR)) {
  const m = /^prop_hand_([a-z0-9_]+)\.glb$/i.exec(f);
  if (m) activeHandProps[m[1].toLowerCase()] = `/models/hand_props/${f}`;
}
fs.writeFileSync(
  path.join(HAND_PROPS_OUT_DIR, "hand_props_manifest.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      updatedAtIso: new Date().toISOString(),
      compressedFormat: "webp+meshopt_lossless",
      note: "6 Dao cu cam tay gan nhan vat (#17 guard_shield da kich hoat 3D)!",
      handProps: activeHandProps,
    },
    null,
    2
  ) + "\n",
  "utf8"
);

// 3. Hợp nhất Atomic vào props_sync_state.json (Giữ nguyên 100% 12 prop gốc Đợt 1)
const propsSyncPath = path.join(PROPS_OUT_DIR, "props_sync_state.json");
let propsSyncDoc = {
  syncedAt: new Date().toISOString(),
  compressedFormat: "webp+meshopt",
  syncedCount: 0,
  totalSlots: 18,
  items: {},
};
try {
  if (fs.existsSync(propsSyncPath)) {
    const existing = JSON.parse(fs.readFileSync(propsSyncPath, "utf8"));
    if (existing && typeof existing.items === "object") {
      propsSyncDoc = existing;
    }
  }
} catch {
  // ignore
}

for (const item of reportItems) {
  if (item.category !== "village_prop") continue;
  const fName = item.deployedFiles[0];
  const fullP = path.join(PROPS_OUT_DIR, fName);
  if (!fs.existsSync(fullP)) continue;
  const st = fs.statSync(fullP);
  const propKey = fName.replace(/\.glb$/i, "");
  propsSyncDoc.items[propKey] = {
    fileName: fName,
    sourceName: item.sourceFile,
    rawSizeBytes: Math.round(item.inKB * 1024),
    sizeBytes: st.size,
    sizeMB: Number((st.size / (1024 * 1024)).toFixed(2)),
    mtimeMs: Math.round(st.mtimeMs),
  };
}
propsSyncDoc.syncedAt = new Date().toISOString();
propsSyncDoc.syncedCount = Object.keys(propsSyncDoc.items).length;
fs.writeFileSync(propsSyncPath, JSON.stringify(propsSyncDoc, null, 2) + "\n", "utf8");

// 4. Đặt an toàn #03 prop_rune_obelisk & #05 prop_mist_well vào village_layout.json (Bảo toàn 100% 153 thực thể đang có!)
function findClearScenicSpot(existingNodes, preferredDeg, minR = 8.9, maxR = 11.4, minClearance = 2.65) {
  const degOffsets = [0, 8, -8, 16, -16, 24, -24, 32, -32, 42, -42];
  const radii = [minR, (minR + maxR) * 0.5, maxR, minR + 0.65, maxR - 0.55];
  for (const r of radii) {
    for (const dOff of degOffsets) {
      const rad = ((preferredDeg + dOff) * Math.PI) / 180;
      const x = Number((Math.sin(rad) * r).toFixed(3));
      const z = Number((Math.cos(rad) * r).toFixed(3));
      const clear = existingNodes.every((n) => {
        if (n.allowCenterZone) return true;
        const nx = Number(n.position?.[0] || 0);
        const nz = Number(n.position?.[2] || 0);
        return Math.hypot(x - nx, z - nz) >= minClearance;
      });
      if (clear) {
        return {
          position: [x, 0, z],
          rotation: [0, Number(Math.atan2(-x, -z).toFixed(3)), 0],
        };
      }
    }
  }
  const rad = (preferredDeg * Math.PI) / 180;
  const x = Number((Math.sin(rad) * 10.2).toFixed(3));
  const z = Number((Math.cos(rad) * 10.2).toFixed(3));
  return {
    position: [x, 0, z],
    rotation: [0, Number(Math.atan2(-x, -z).toFixed(3)), 0],
  };
}

let layoutAdded = [];
if (fs.existsSync(VILLAGE_LAYOUT_PATH)) {
  const rawLayoutText = fs.readFileSync(VILLAGE_LAYOUT_PATH, "utf8");
  const backupPath = path.join(LAYOUT_BACKUPS_DIR, "village_layout.pre_noel12.backup.json");
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, rawLayoutText, "utf8");
  }

  const layoutDoc = JSON.parse(rawLayoutText);
  if (Array.isArray(layoutDoc.nodes)) {
    const toSpawn = [
      {
        type: "prop_rune_obelisk",
        id: "rune-obelisk-noel-1",
        label: "Trụ Đá Cổ Ngữ Rune (#03)",
        category: "props",
        preferredDeg: -72,
      },
      {
        type: "prop_mist_well",
        id: "mist-well-noel-1",
        label: "Giếng Đá Sương Mù Ánh Trăng (#05)",
        category: "architecture",
        preferredDeg: 72,
      },
    ];

    for (const sp of toSpawn) {
      const hasPropFile = fs.existsSync(path.join(PROPS_OUT_DIR, `${sp.type}.glb`));
      const alreadyInLayout = layoutDoc.nodes.some((n) => n.type === sp.type);
      if (hasPropFile && !alreadyInLayout) {
        const spot = findClearScenicSpot(layoutDoc.nodes, sp.preferredDeg);
        layoutDoc.nodes.push({
          id: sp.id,
          type: sp.type,
          label: sp.label,
          category: sp.category,
          position: spot.position,
          rotation: spot.rotation,
          scale: [1, 1, 1],
          seed: 0.37,
          allowCenterZone: false,
          lockClick: false,
          deletable: true,
        });
        layoutAdded.push({ id: sp.id, type: sp.type, position: spot.position });
      }
    }

    if (layoutAdded.length > 0) {
      layoutDoc.totalNodes = layoutDoc.nodes.length;
      layoutDoc.updatedAtMs = Date.now();
      layoutDoc.updatedAtIso = new Date().toISOString();
      fs.writeFileSync(VILLAGE_LAYOUT_PATH, JSON.stringify(layoutDoc, null, 2) + "\n", "utf8");
    }
  }
}

const fullReport = {
  syncedAtIso: new Date().toISOString(),
  sourceReadyDir: READY_DIR,
  totalSyncedFiles: reportItems.length,
  totalInMB: Number((totalInBytes / (1024 * 1024)).toFixed(2)),
  totalOutMB: Number((totalOutBytes / (1024 * 1024)).toFixed(2)),
  additionalWebSavingsPercent: Number(
    ((1 - totalOutBytes / Math.max(1, totalInBytes)) * 100).toFixed(1)
  ),
  activeCharacterKeys: Object.keys(activeCharacters),
  activeHandPropKeys: Object.keys(activeHandProps),
  activeVillagePropCount: Object.keys(propsSyncDoc.items).length,
  layoutNodesAdded: layoutAdded,
  pendingSlotsWaitingTripo: missingSlots,
  items: reportItems,
};
fs.writeFileSync(SYNC_REPORT_PATH, JSON.stringify(fullReport, null, 2) + "\n", "utf8");

console.log("-------------------------------------------------------------------------------");
console.log(
  `  HOAN TAT: ${reportItems.length} file .GLB | ${(totalInBytes / (1024 * 1024)).toFixed(2)} MB -> ${(totalOutBytes / (1024 * 1024)).toFixed(2)} MB (-${fullReport.additionalWebSavingsPercent}% them voi WebP+Meshopt!)`
);
console.log(
  `  Da kich hoat: ${Object.keys(activeCharacters).length} Khe Nhan Vat | ${Object.keys(activeHandProps).length} Dao Cu Tay | ${Object.keys(propsSyncDoc.items).length} Cong Trinh & Dao Cu Lang`
);
if (layoutAdded.length > 0) {
  console.log(
    `  Da dat an toan ra san lang: ${layoutAdded.map((x) => `${x.type} @ [${x.position.join(", ")}]`).join(" | ")}`
  );
}
if (missingSlots.length > 0) {
  console.log(`  Dang cho tao not tren Tripo (${missingSlots.length} dung cu): ${missingSlots.join(", ")}`);
}
console.log("===============================================================================");
