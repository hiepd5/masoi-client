import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  prune,
  weld,
  simplify,
  textureCompress,
  meshopt,
} from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_ROOT = path.resolve(__dirname, "..");
const GAME_ROOT = path.resolve(CLIENT_ROOT, "..");

const PROPS_OUT_DIR = path.join(CLIENT_ROOT, "public", "models", "props");
const CONCEPTS_OUT_DIR = path.join(PROPS_OUT_DIR, "concepts");
const CHARS_OUT_DIR = path.join(CLIENT_ROOT, "public", "models", "characters");
const HAND_PROPS_OUT_DIR = path.join(CLIENT_ROOT, "public", "models", "hand_props");

const RAW_BACKUPS_PROPS_DIR = path.join(GAME_ROOT, "data", "raw_glb_backups", "props");
const RAW_BACKUPS_CONCEPTS_DIR = path.join(GAME_ROOT, "data", "raw_glb_backups", "concepts");
const OPT_CACHE_PATH = path.join(GAME_ROOT, "data", "glb_web_opt_cache.json");

const relTripo = path.resolve(GAME_ROOT, "..", "MODEL-NHAN VAT", "output", "imagegen", "tripo");
const DEFAULT_TRIPO_DIR = fs.existsSync(relTripo)
  ? relTripo
  : "E:\\0.ANTIGRAVITY\\GAME\\MASOI\\MODEL-NHAN VAT\\output\\imagegen\\tripo";

for (const d of [
  PROPS_OUT_DIR,
  CONCEPTS_OUT_DIR,
  CHARS_OUT_DIR,
  HAND_PROPS_OUT_DIR,
  RAW_BACKUPS_PROPS_DIR,
  RAW_BACKUPS_CONCEPTS_DIR,
]) {
  fs.mkdirSync(d, { recursive: true });
}

await Promise.all([
  MeshoptEncoder.ready,
  MeshoptDecoder.ready,
  MeshoptSimplifier.ready,
]);

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });

const cliArgs = process.argv.slice(2);
const forceRebuild = cliArgs.includes("--force");
const extraPaths = cliArgs.filter((a) => !a.startsWith("--") && a.trim().length > 0);

let optCache = {};
try {
  if (!forceRebuild && fs.existsSync(OPT_CACHE_PATH)) {
    optCache = JSON.parse(fs.readFileSync(OPT_CACHE_PATH, "utf8")) || {};
  }
} catch {
  optCache = {};
}

function saveOptCache() {
  try {
    fs.mkdirSync(path.dirname(OPT_CACHE_PATH), { recursive: true });
    fs.writeFileSync(OPT_CACHE_PATH, JSON.stringify(optCache, null, 2) + "\n", "utf8");
  } catch {
    // ignore
  }
}

function toAsciiSlug(input) {
  if (!input) return "item";
  return (
    String(input)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .replace(/([+_\-\s]+)(3d)([+_\-\s]+)(model)s?$/i, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "item"
  );
}

function toReadableTitle(baseName) {
  const cleaned = String(baseName || "")
    .replace(/[+_]+/g, " ")
    .replace(/\b3d\s+models?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const raw = cleaned || baseName || "Concept Prop";
  return raw
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

function collectGlbFiles(targetPath, recursive = true) {
  const out = [];
  if (!targetPath || !fs.existsSync(targetPath)) return out;
  const st = fs.statSync(targetPath);
  if (st.isFile()) {
    if (targetPath.toLowerCase().endsWith(".glb") && st.size >= 8192) {
      out.push({
        name: path.basename(targetPath),
        baseName: path.basename(targetPath, path.extname(targetPath)),
        fullPath: targetPath,
        sizeBytes: st.size,
        mtimeMs: Math.round(st.mtimeMs),
      });
    }
    return out;
  }
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const full = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      if (recursive) out.push(...collectGlbFiles(full, true));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".glb")) {
      const fst = fs.statSync(full);
      if (fst.size >= 8192) {
        out.push({
          name: entry.name,
          baseName: path.basename(entry.name, path.extname(entry.name)),
          fullPath: full,
          sizeBytes: fst.size,
          mtimeMs: Math.round(fst.mtimeMs),
        });
      }
    }
  }
  return out;
}

const wb = "(^|[+_\\-\\s])";
const we = "($|[+_\\-\\s])";

// 1. 9 NHÂN VẬT CÓ XƯƠNG (Auto-Rig Humanoid)
const CHARACTER_RULES = [
  { key: "villager_cloak", fileName: "char_villager_cloak.glb", pattern: /^char_villager_cloak$|(villager.*cloak|hooded.*villager|cloak.*villager)/i },
  { key: "wolf", fileName: "char_wolf.glb", pattern: /^char_wolf$|(werewolf|bipedal.*wolf|wolf.*monster)/i },
  { key: "guard", fileName: "char_guard.glb", pattern: /^char_guard$|(village.*watchman|town.*guard|brigandine.*guard)/i },
  { key: "witch", fileName: "char_witch.glb", pattern: /^char_witch$|(forest.*witch|herbalist.*witch)/i },
  { key: "seer", fileName: "char_seer.glb", pattern: /^char_seer$|(rune.*seer|mystic.*seer)/i },
  { key: "tough_guy", fileName: "char_tough_guy.glb", pattern: /^char_tough_guy$|(blacksmith.*brawler|tough.*guy|bear.*pelt.*brawler)/i },
  { key: "cursed", fileName: "char_cursed.glb", pattern: /^char_cursed$|(cursed.*outcast|bone.*mask.*outcast)/i },
  { key: "tanner", fileName: "char_tanner.glb", pattern: /^char_tanner$|(gloom.*tanner|leather.*tanner)/i },
  { key: "villager_true", fileName: "char_villager_true.glb", pattern: /^char_villager_true$|(unmasked.*villager|townsfolk.*farmer)/i },
];

// 2. 6 ĐẠO CỤ CẦM TAY GẮN XƯƠNG (Hand Socket Props)
const HAND_PROP_RULES = [
  { key: "guard_shield", fileName: "prop_hand_guard_shield.glb", pattern: /^prop_hand_guard_shield$|(buckler.*shield|round.*oak.*shield|guard.*shield)/i },
  { key: "witch_elixir", fileName: "prop_hand_witch_elixir.glb", pattern: /^prop_hand_witch_elixir$|(healing.*potion|emerald.*potion|life.*elixir|witch.*elixir)/i },
  { key: "witch_poison", fileName: "prop_hand_witch_poison.glb", pattern: /^prop_hand_witch_poison$|(poison.*vial|toxic.*vial|violet.*poison|witch.*poison)/i },
  { key: "seer_orb", fileName: "prop_hand_seer_orb.glb", pattern: /^prop_hand_seer_orb$|(divination.*orb|seer.*orb|astrolabe.*orb)/i },
  { key: "trial_torch", fileName: "prop_hand_trial_torch.glb", pattern: /^prop_hand_trial_torch$|(handheld.*torch|cage.*torch|trial.*torch)/i },
  { key: "tanner_noose", fileName: "prop_hand_tanner_noose.glb", pattern: /^prop_hand_tanner_noose$|(rope.*talisman|tanner.*noose|coiled.*hemp.*rope)/i },
];

// 3. 12 CORE PROPS + 6 LIVING HERO PROPS NGOẠI CẢNH
const EXTERIOR_PROP_RULES = [
  // 6 Living Hero Props Mới (Ưu tiên khớp trước để không bị luật chung bắt nhầm)
  { key: "prop_nordic_raven", fileName: "prop_nordic_raven.glb", profile: "hero_prop", pattern: new RegExp(`^prop_nordic_raven$|${wb}(raven|crow)${we}`, "i") },
  { key: "prop_witch_cauldron", fileName: "prop_witch_cauldron.glb", profile: "hero_prop", pattern: new RegExp(`^prop_witch_cauldron$|${wb}(cauldron|kettle)${we}`, "i") },
  { key: "prop_village_banner", fileName: "prop_village_banner.glb", profile: "hero_prop", pattern: new RegExp(`^prop_village_banner$|${wb}(banner|pennant|flagpole|clan_flag)${we}`, "i") },
  { key: "prop_rune_obelisk", fileName: "prop_rune_obelisk.glb", profile: "hero_prop", pattern: new RegExp(`^prop_rune_obelisk$|${wb}(obelisk|menhir|standing_stone|runestone)${we}`, "i") },
  { key: "prop_cart_brazier", fileName: "prop_cart_brazier.glb", profile: "hero_prop", pattern: new RegExp(`^prop_cart_brazier$|${wb}(brazier|tripod_fire|fire_basket)${we}`, "i") },
  { key: "prop_mist_well", fileName: "prop_mist_well.glb", profile: "hero_prop", pattern: new RegExp(`^prop_mist_well$|${wb}(well|water_well|stone_well)${we}`, "i") },

  // 12 Đạo cụ gốc (Bản Lề V3)
  { key: "prop_chair", fileName: "prop_chair.glb", profile: "instanced_prop", pattern: new RegExp(`^prop_chair$|${wb}(chair|seat|stool|bench|armchair)${we}`, "i") },
  { key: "prop_campfire", fileName: "prop_campfire.glb", profile: "hero_prop", pattern: new RegExp(`^prop_campfire$|${wb}(campfire|firepit|bonfire|hearth|firewood|fire)${we}`, "i") },
  { key: "prop_gallows", fileName: "prop_gallows.glb", profile: "architecture", pattern: new RegExp(`^prop_gallows$|${wb}(gallows|scaffold|gibbet|execution|platform)${we}`, "i") },
  { key: "landmark_belltower", fileName: "landmark_belltower.glb", profile: "architecture", pattern: new RegExp(`^landmark_belltower$|${wb}(belltower|belfry|tower|spire|steeple|chapel|church|cathedral)${we}`, "i") },
  { key: "house_cottage_b", fileName: "house_cottage_b.glb", profile: "architecture", pattern: new RegExp(`^house_cottage_b$|${wb}(cottage_b|house_b|thatched|thatch|straw|hut|cabin|barn)${we}`, "i") },
  { key: "house_cottage_a", fileName: "house_cottage_a.glb", profile: "architecture", pattern: new RegExp(`^house_cottage_a$|${wb}(cottage_a|house_a|tudor|slate|timber|cottage|house|tavern|inn)${we}`, "i") },
  { key: "plaza_cobblestone", fileName: "plaza_cobblestone.glb", profile: "surface", exclude: /^4k|\b4k\b/i, pattern: new RegExp(`^plaza_cobblestone$|${wb}(plaza|cobble|cobblestone|courtyard|medallion|mosaic|pavement|flagstone)${we}`, "i") },
  { key: "prop_lantern", fileName: "prop_lantern.glb", profile: "instanced_prop", pattern: new RegExp(`^prop_lantern$|${wb}(lantern|lamp|streetlamp|lamppost)${we}`, "i") },
  { key: "prop_fence_rock", fileName: "prop_fence_rock.glb", profile: "instanced_prop", pattern: new RegExp(`^prop_fence_rock$|${wb}(fence|railing|barrier|boulder|barricade)${we}`, "i") },
  { key: "tree_dead_gnarled", fileName: "tree_dead_gnarled.glb", profile: "foliage", pattern: new RegExp(`^tree_dead_gnarled$|${wb}(dead|gnarled|spooky|leafless|withered|oak)${we}`, "i") },
  { key: "tree_pine_wide", fileName: "tree_pine_wide.glb", profile: "foliage", pattern: new RegExp(`^tree_pine_wide$|${wb}(spruce|bushy|evergreen|fir)${we}`, "i") },
  { key: "tree_pine_tall", fileName: "tree_pine_tall.glb", profile: "foliage", pattern: new RegExp(`^tree_pine_tall$|${wb}(pine|conifer|tree)${we}`, "i") },
];

const PROFILE_SETTINGS = {
  character: {
    maxColorTex: 1024,
    maxOrmTex: 512,
    webpQuality: 84,
    maxTriangles: 9500,
    simplifyError: 0.0025,
    preserveSkinRig: true,
  },
  hand_prop: {
    maxColorTex: 512,
    maxOrmTex: 256,
    webpQuality: 82,
    maxTriangles: 2200,
    simplifyError: 0.004,
    preserveSkinRig: false,
  },
  surface: {
    maxColorTex: 1024,
    maxOrmTex: 512,
    webpQuality: 85,
    maxTriangles: 9000,
    simplifyError: 0.002,
    preserveSkinRig: false,
  },
  architecture: {
    maxColorTex: 1024,
    maxOrmTex: 512,
    webpQuality: 82,
    maxTriangles: 7500,
    simplifyError: 0.003,
    preserveSkinRig: false,
  },
  hero_prop: {
    maxColorTex: 768,
    maxOrmTex: 512,
    webpQuality: 82,
    maxTriangles: 5500,
    simplifyError: 0.003,
    preserveSkinRig: false,
  },
  instanced_prop: {
    maxColorTex: 512,
    maxOrmTex: 256,
    webpQuality: 80,
    maxTriangles: 3800,
    simplifyError: 0.004,
    preserveSkinRig: false,
  },
  foliage: {
    maxColorTex: 512,
    maxOrmTex: 256,
    webpQuality: 80,
    maxTriangles: 3600,
    simplifyError: 0.0045,
    preserveSkinRig: false,
  },
};

function countDocumentTriangles(doc) {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      if (indices) {
        tris += Math.floor(indices.getCount() / 3);
      } else {
        const pos = prim.getAttribute("POSITION");
        if (pos) tris += Math.floor(pos.getCount() / 3);
      }
    }
  }
  return tris;
}

function measureSceneBoundsMeters(doc) {
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  if (!scene) return null;
  try {
    const b = getBounds(scene);
    if (!b || !Array.isArray(b.min) || !Array.isArray(b.max)) return null;
    const sizeX = Math.max(0.01, Number((b.max[0] - b.min[0]).toFixed(4)));
    const sizeY = Math.max(0.01, Number((b.max[1] - b.min[1]).toFixed(4)));
    const sizeZ = Math.max(0.01, Number((b.max[2] - b.min[2]).toFixed(4)));
    if (!Number.isFinite(sizeX) || !Number.isFinite(sizeY) || !Number.isFinite(sizeZ)) return null;
    return {
      sizeX,
      sizeY,
      sizeZ,
      minY: Number(b.min[1].toFixed(4)),
      maxY: Number(b.max[1].toFixed(4)),
    };
  } catch {
    return null;
  }
}

async function optimizeGlbFile(srcInfo, destPath, profileName) {
  const cfg = PROFILE_SETTINGS[profileName] || PROFILE_SETTINGS.hero_prop;
  const cacheKey = `${destPath}`;
  const sig = `${srcInfo.fullPath}::${srcInfo.sizeBytes}::${srcInfo.mtimeMs}::${profileName}::v1`;

  if (!forceRebuild && optCache[cacheKey]?.sig === sig && fs.existsSync(destPath)) {
    const outStat = fs.statSync(destPath);
    return {
      skipped: true,
      rawBytes: srcInfo.sizeBytes,
      outBytes: outStat.size,
      bounds: optCache[cacheKey].bounds || null,
      rawTris: optCache[cacheKey].rawTris || 0,
      outTris: optCache[cacheKey].outTris || 0,
    };
  }

  let bounds = null;
  let rawTris = 0;
  let outTris = 0;

  try {
    const doc = await io.read(srcInfo.fullPath);
    bounds = measureSceneBoundsMeters(doc);
    rawTris = countDocumentTriangles(doc);

    const hasSkins = doc.getRoot().listSkins().length > 0;
    const transforms = [
      dedup(),
      prune({
        keepLeaves: Boolean(cfg.preserveSkinRig || hasSkins),
        keepAttributes: false,
      }),
      weld(),
    ];

    if (rawTris > cfg.maxTriangles) {
      const targetRatio = Math.max(0.12, Math.min(0.92, cfg.maxTriangles / rawTris));
      transforms.push(
        simplify({
          simplifier: MeshoptSimplifier,
          ratio: targetRatio,
          error: cfg.simplifyError,
          lockBorder: true,
        })
      );
    }

    transforms.push(
      textureCompress({
        encoder: sharp,
        targetFormat: "webp",
        slots: /^(baseColorTexture|emissiveTexture|normalTexture)$/i,
        resize: [cfg.maxColorTex, cfg.maxColorTex],
        quality: cfg.webpQuality,
      }),
      textureCompress({
        encoder: sharp,
        targetFormat: "webp",
        slots: /^(metallicRoughnessTexture|occlusionTexture)$/i,
        resize: [cfg.maxOrmTex, cfg.maxOrmTex],
        quality: Math.max(74, cfg.webpQuality - 4),
      }),
      meshopt({
        encoder: MeshoptEncoder,
        level: "medium",
      })
    );

    await doc.transform(...transforms);
    outTris = countDocumentTriangles(doc);

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    await io.write(destPath, doc);

    const outStat = fs.statSync(destPath);
    optCache[cacheKey] = {
      sig,
      bounds,
      rawTris,
      outTris,
      outBytes: outStat.size,
      updatedAtIso: new Date().toISOString(),
    };

    return {
      skipped: false,
      rawBytes: srcInfo.sizeBytes,
      outBytes: outStat.size,
      bounds,
      rawTris,
      outTris,
    };
  } catch (err) {
    console.warn(`  [CANH BAO] Khong nen duoc ${srcInfo.name} (${err.message}) -> Copy an toan ban goc.`);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcInfo.fullPath, destPath);
    const outStat = fs.statSync(destPath);
    return {
      skipped: false,
      rawBytes: srcInfo.sizeBytes,
      outBytes: outStat.size,
      bounds,
      rawTris,
      outTris: rawTris,
    };
  }
}

console.log("==========================================================================");
console.log("  MA SOI 3D - LO NEN WEBGL 1-CLICK (MESHOPT + WEBP) & DAU NOI MANIFEST");
console.log("==========================================================================");

// Tap hop cac nguon quet: uu tien thu muc nguoi dung truyen vao -> thu muc Tripo -> kho backup goc
const charCandidates = [];
const handCandidates = [];
const exteriorCandidates = [];
const conceptCandidates = [];

if (fs.existsSync(DEFAULT_TRIPO_DIR)) {
  charCandidates.push(...collectGlbFiles(path.join(DEFAULT_TRIPO_DIR, "NHAN_VAT_9_VAI"), true));
  handCandidates.push(...collectGlbFiles(path.join(DEFAULT_TRIPO_DIR, "DAO_CU_CAM_TAY"), true));
  exteriorCandidates.push(...collectGlbFiles(path.join(DEFAULT_TRIPO_DIR, "DAO_CU_CANH_QUAN"), true));
  exteriorCandidates.push(...collectGlbFiles(DEFAULT_TRIPO_DIR, false));
  conceptCandidates.push(...collectGlbFiles(path.join(DEFAULT_TRIPO_DIR, "MODEL CONCEPT THEM"), true));
}

// Nguon du phong an toan tu ban goc da sao luu truoc khi nen (dat o CUOI danh sach, khong sort de len tren Tripo goc!)
const backupPropsList = collectGlbFiles(RAW_BACKUPS_PROPS_DIR, false);
const backupConceptsList = collectGlbFiles(RAW_BACKUPS_CONCEPTS_DIR, false);

// Neu nguoi dung keo-tha hoac truyen duong dan bat ky qua CLI -> Quet thong minh va dat uu tien cao nhat!
for (const customPath of extraPaths) {
  const resolved = path.resolve(customPath);
  if (!fs.existsSync(resolved)) {
    console.warn(`  [BO QUA] Duong dan khong ton tai: ${resolved}`);
    continue;
  }
  console.log(`  [+] Quet thu muc tuy chon: ${resolved}`);
  const found = collectGlbFiles(resolved, true);
  for (const f of found) {
    const parentLower = path.basename(path.dirname(f.fullPath)).toLowerCase();
    const baseLower = f.baseName.toLowerCase();
    if (
      parentLower.includes("nhan_vat") ||
      baseLower.startsWith("char_") ||
      CHARACTER_RULES.some((r) => r.pattern.test(f.baseName))
    ) {
      charCandidates.unshift(f);
    } else if (
      parentLower.includes("cam_tay") ||
      baseLower.startsWith("prop_hand_") ||
      HAND_PROP_RULES.some((r) => r.pattern.test(f.baseName))
    ) {
      handCandidates.unshift(f);
    } else if (parentLower.includes("concept")) {
      conceptCandidates.unshift(f);
    } else {
      exteriorCandidates.unshift(f);
    }
  }
}

function dedupeNewestFirst(list) {
  const seen = new Set();
  const sorted = [...list].sort((a, b) => b.mtimeMs - a.mtimeMs);
  return sorted.filter((f) => {
    const norm = path.resolve(f.fullPath).toLowerCase();
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
}

const uniqueChars = dedupeNewestFirst(charCandidates);
const uniqueHands = dedupeNewestFirst(handCandidates);
const uniqueExteriors = [...dedupeNewestFirst(exteriorCandidates), ...backupPropsList];
const uniqueConcepts = [...dedupeNewestFirst(conceptCandidates), ...backupConceptsList];
const ALL_KNOWN_EXTERIOR_KEYS = new Set(EXTERIOR_PROP_RULES.map((r) => r.key));

let totalRawBytes = 0;
let totalOutBytes = 0;

// -----------------------------------------------------------------------------
// BUOC 1: NEN & DAU NOI 9 NHAN VAT CO XUONG (char_*.glb)
// -----------------------------------------------------------------------------
const usedCharFiles = new Set();
for (const rule of CHARACTER_RULES) {
  const match = uniqueChars.find((f) => !usedCharFiles.has(f.fullPath) && rule.pattern.test(f.baseName));
  if (!match) continue;
  usedCharFiles.add(match.fullPath);
  const dest = path.join(CHARS_OUT_DIR, rule.fileName);
  const res = await optimizeGlbFile(match, dest, "character");
  totalRawBytes += res.rawBytes;
  totalOutBytes += res.outBytes;
  const pct = ((1 - res.outBytes / Math.max(1, res.rawBytes)) * 100).toFixed(1);
  console.log(
    `  [NHAN VAT] ${rule.key.padEnd(16)} : ${(res.rawBytes / 1024).toFixed(0)} KB -> ${(res.outBytes / 1024).toFixed(0)} KB (-${pct}%) [${res.rawTris}->${res.outTris} tris]`
  );
}

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
      note: "9 nhan vat co xuong Auto-Rig da nen chuan WebP + Meshopt cho WebGL 60 FPS!",
      characters: activeCharacters,
    },
    null,
    2
  ) + "\n",
  "utf8"
);

// -----------------------------------------------------------------------------
// BUOC 2: NEN & DAU NOI 6 DAO CU CAM TAY (prop_hand_*.glb)
// -----------------------------------------------------------------------------
const usedHandFiles = new Set();
for (const rule of HAND_PROP_RULES) {
  const match = uniqueHands.find((f) => !usedHandFiles.has(f.fullPath) && rule.pattern.test(f.baseName));
  if (!match) continue;
  usedHandFiles.add(match.fullPath);
  const dest = path.join(HAND_PROPS_OUT_DIR, rule.fileName);
  const res = await optimizeGlbFile(match, dest, "hand_prop");
  totalRawBytes += res.rawBytes;
  totalOutBytes += res.outBytes;
  const pct = ((1 - res.outBytes / Math.max(1, res.rawBytes)) * 100).toFixed(1);
  console.log(
    `  [CAM TAY ] ${rule.key.padEnd(16)} : ${(res.rawBytes / 1024).toFixed(0)} KB -> ${(res.outBytes / 1024).toFixed(0)} KB (-${pct}%)`
  );
}

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
      note: "6 Dao cu cam tay gan xuong nhan vat (Khiên, Bình Cứu, Bình Độc, Cầu Tiên Tri, Đuốc, Thừng)!",
      handProps: activeHandProps,
    },
    null,
    2
  ) + "\n",
  "utf8"
);

// -----------------------------------------------------------------------------
// BUOC 3: NEN & DAU NOI 12 DAO CU CORE + 6 LIVING HERO PROPS
// -----------------------------------------------------------------------------
const usedExtFiles = new Set();
const syncedPropsMap = {};

for (const rule of EXTERIOR_PROP_RULES) {
  const match = uniqueExteriors.find((f) => {
    if (usedExtFiles.has(f.fullPath)) return false;
    const lowerBase = f.baseName.toLowerCase();
    // Neu file da mang ten chuan cua 1 slot (vd house_cottage_b.glb) thi CHI duoc khop dung slot do!
    if (ALL_KNOWN_EXTERIOR_KEYS.has(lowerBase)) {
      return lowerBase === rule.key;
    }
    if (rule.exclude && rule.exclude.test(f.baseName)) return false;
    return rule.pattern.test(f.baseName);
  });
  if (!match) continue;
  usedExtFiles.add(match.fullPath);

  // Sao luu an toan ban goc chua nen vao raw_glb_backups neu chua co
  const backupTarget = path.join(RAW_BACKUPS_PROPS_DIR, rule.fileName);
  if (!fs.existsSync(backupTarget) && path.resolve(match.fullPath) !== path.resolve(backupTarget)) {
    fs.copyFileSync(match.fullPath, backupTarget);
  }

  const dest = path.join(PROPS_OUT_DIR, rule.fileName);
  const res = await optimizeGlbFile(match, dest, rule.profile);
  totalRawBytes += res.rawBytes;
  totalOutBytes += res.outBytes;
  const pct = ((1 - res.outBytes / Math.max(1, res.rawBytes)) * 100).toFixed(1);

  const outStat = fs.statSync(dest);
  syncedPropsMap[rule.key] = {
    fileName: rule.fileName,
    sourceName: match.name,
    rawSizeBytes: res.rawBytes,
    sizeBytes: outStat.size,
    sizeMB: Number((outStat.size / (1024 * 1024)).toFixed(2)),
    mtimeMs: Math.round(outStat.mtimeMs),
  };

  console.log(
    `  [CANH QUAN] ${rule.key.padEnd(20)} : ${(res.rawBytes / 1024).toFixed(0).padStart(5)} KB -> ${(res.outBytes / 1024).toFixed(0).padStart(4)} KB (-${pct}%) [${res.rawTris}->${res.outTris} tris]`
  );
}

// Quet cac file du thua con lai trong DAO_CU_CANH_QUAN hoac thư mục truyền vào chưa khớp rule cố định -> đưa sang Concept Đợt 3!
for (const leftover of uniqueExteriors) {
  if (usedExtFiles.has(leftover.fullPath)) continue;
  if (path.resolve(path.dirname(leftover.fullPath)) === path.resolve(RAW_BACKUPS_PROPS_DIR)) continue;
  if (path.resolve(path.dirname(leftover.fullPath)) === path.resolve(DEFAULT_TRIPO_DIR)) continue;
  uniqueConcepts.push(leftover);
}

fs.writeFileSync(
  path.join(PROPS_OUT_DIR, "props_sync_state.json"),
  JSON.stringify(
    {
      syncedAt: new Date().toISOString(),
      compressedFormat: "webp+meshopt",
      syncedCount: Object.keys(syncedPropsMap).length,
      totalSlots: EXTERIOR_PROP_RULES.length,
      items: syncedPropsMap,
    },
    null,
    2
  ) + "\n",
  "utf8"
);

// -----------------------------------------------------------------------------
// BUOC 4: NEN & DAU NOI KHO "MODEL CONCEPT THEM" (DOT 3 D5 STUDIO)
// -----------------------------------------------------------------------------
function inferConceptPreset(slug, rawBounds) {
  const s = slug.toLowerCase();
  const rx = rawBounds?.sizeX || 1;
  const ry = rawBounds?.sizeY || 1;
  const rz = rawBounds?.sizeZ || 1;
  const maxXZ = Math.max(rx, rz, 0.01);
  const flatness = ry / maxXZ;

  if (/(mosaic|plaza|courtyard|floor|ground|terrain|arena|platform_round|pavement|cobble|island|stage)/.test(s) || flatness < 0.24) {
    const desiredSpanXZ = 24.0;
    const scaleFactor = desiredSpanXZ / maxXZ;
    const computedTargetH = Number(Math.max(0.25, ry * scaleFactor).toFixed(2));
    return {
      icon: "🏛️",
      category: "architecture",
      shaderProfile: "cobble_plaza",
      targetHeight: computedTargetH,
      allowCenterZone: true,
      isSurfaceCandidate: true,
      defaultSpawnRadius: 0,
      defaultSpawnY: Number((-computedTargetH * 0.34).toFixed(2)),
      aoRadius: 0,
      aoOpacity: 0,
    };
  }
  if (/(house|cottage|cabin|hut|tavern|inn|hall|barn|windmill|mill|blacksmith|shop)/.test(s)) {
    return { icon: "🏰", category: "architecture", shaderProfile: "warm_building", targetHeight: 5.8, allowCenterZone: false, isSurfaceCandidate: false, defaultSpawnRadius: 15.2, defaultSpawnY: 0 };
  }
  if (/(tower|spire|church|chapel|cathedral|gate|arch|ruin|statue|monument|obelisk|altar)/.test(s)) {
    return { icon: "🗿", category: "architecture", shaderProfile: "warm_building", targetHeight: 7.4, allowCenterZone: false, isSurfaceCandidate: false, defaultSpawnRadius: 16.0, defaultSpawnY: 0 };
  }
  if (/(wall|fort|bastion|castle|bridge|pillar|column)/.test(s)) {
    return { icon: "🧱", category: "architecture", shaderProfile: "standard", targetHeight: 3.2, allowCenterZone: false, isSurfaceCandidate: false, defaultSpawnRadius: 14.5, defaultSpawnY: 0 };
  }
  if (/(tree|pine|spruce|oak|willow|birch|bush|shrub|fern|plant)/.test(s)) {
    return { icon: "🌲", category: "forest", shaderProfile: "pine_wind", targetHeight: 7.5, allowCenterZone: false, isSurfaceCandidate: false, defaultSpawnRadius: 17.5, defaultSpawnY: 0 };
  }
  if (/(lantern|lamp|torch|brazier|candle|crystal|light|fire)/.test(s)) {
    return { icon: "🏮", category: "props", shaderProfile: "lantern_glow", targetHeight: 2.7, allowCenterZone: false, isSurfaceCandidate: false, defaultSpawnRadius: 8.8, defaultSpawnY: 0 };
  }
  return { icon: "🧱", category: "props", shaderProfile: "standard", targetHeight: 2.35, allowCenterZone: false, isSurfaceCandidate: false, defaultSpawnRadius: 10.8, defaultSpawnY: 0 };
}

const conceptItems = [];
const usedConceptSlugs = new Set();

for (const cf of uniqueConcepts) {
  const isFromBackupDir =
    path.resolve(path.dirname(cf.fullPath)).toLowerCase() ===
    path.resolve(RAW_BACKUPS_CONCEPTS_DIR).toLowerCase();
  const baseSlug = cf.baseName.toLowerCase().startsWith("concept_")
    ? cf.baseName.toLowerCase().replace(/^concept_/, "")
    : toAsciiSlug(cf.baseName);

  // Neu ban goc trong MODEL CONCEPT THEM da duoc xu ly thi bo qua ban backup trung ten
  if (isFromBackupDir && usedConceptSlugs.has(baseSlug)) {
    continue;
  }

  let slug = baseSlug;
  let suffix = 2;
  while (usedConceptSlugs.has(slug)) {
    slug = `${baseSlug}_${suffix++}`;
  }
  usedConceptSlugs.add(slug);

  const propKey = `concept_${slug}`;
  const outFileName = `${propKey}.glb`;

  const backupConcept = path.join(RAW_BACKUPS_CONCEPTS_DIR, outFileName);
  if (!isFromBackupDir && !fs.existsSync(backupConcept) && path.resolve(cf.fullPath) !== path.resolve(backupConcept)) {
    fs.copyFileSync(cf.fullPath, backupConcept);
  }

  const dest = path.join(CONCEPTS_OUT_DIR, outFileName);
  const isSurfaceLike = /(mosaic|plaza|courtyard|floor|ground|cobble)/i.test(slug);
  const res = await optimizeGlbFile(cf, dest, isSurfaceLike ? "surface" : "architecture");
  totalRawBytes += res.rawBytes;
  totalOutBytes += res.outBytes;

  const bounds = res.bounds || { sizeX: 1, sizeY: 1, sizeZ: 1 };
  const preset = inferConceptPreset(slug, bounds);
  const normScale = preset.targetHeight / Math.max(0.05, bounds.sizeY);
  const spanX = Number(Math.max(0.65, bounds.sizeX * normScale).toFixed(2));
  const spanY = Number(Math.max(0.55, preset.targetHeight).toFixed(2));
  const spanZ = Number(Math.max(0.65, bounds.sizeZ * normScale).toFixed(2));
  const outStat = fs.statSync(dest);
  const pct = ((1 - res.outBytes / Math.max(1, res.rawBytes)) * 100).toFixed(1);

  conceptItems.push({
    propKey,
    fileName: outFileName,
    url: `/models/props/concepts/${outFileName}`,
    sourceName: cf.name,
    label: `${preset.icon} ${toReadableTitle(slug)}`,
    shortLabel: toReadableTitle(slug),
    category: preset.category,
    shaderProfile: preset.shaderProfile,
    targetHeight: preset.targetHeight,
    rawSize: [bounds.sizeX, bounds.sizeY, bounds.sizeZ],
    hitBoxSize: [spanX, spanY, spanZ],
    centerHeight: Number((spanY * 0.5).toFixed(2)),
    aoRadius:
      preset.aoRadius !== undefined
        ? preset.aoRadius
        : Number(Math.min(4.8, Math.max(0.55, Math.max(spanX, spanZ) * 0.48)).toFixed(2)),
    aoOpacity: preset.aoOpacity !== undefined ? preset.aoOpacity : 0.6,
    allowCenterZone: preset.allowCenterZone,
    isSurfaceCandidate: preset.isSurfaceCandidate,
    defaultSpawnRadius: preset.defaultSpawnRadius,
    defaultSpawnY: preset.defaultSpawnY,
    rawSizeBytes: res.rawBytes,
    sizeBytes: outStat.size,
    sizeMB: Number((outStat.size / (1024 * 1024)).toFixed(2)),
    mtimeMs: Math.round(outStat.mtimeMs),
  });

  console.log(
    `  [CONCEPT  ] ${propKey.padEnd(28)} : ${(res.rawBytes / 1024).toFixed(0).padStart(5)} KB -> ${(res.outBytes / 1024).toFixed(0).padStart(4)} KB (-${pct}%)`
  );
}

fs.writeFileSync(
  path.join(PROPS_OUT_DIR, "concepts_manifest.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      syncedAt: new Date().toISOString(),
      compressedFormat: "webp+meshopt",
      sourceFolder: "MODEL CONCEPT THEM",
      totalConcepts: conceptItems.length,
      items: conceptItems,
    },
    null,
    2
  ) + "\n",
  "utf8"
);

saveOptCache();

const savedPct = totalRawBytes > 0 ? ((1 - totalOutBytes / totalRawBytes) * 100).toFixed(1) : "0.0";
console.log("--------------------------------------------------------------------------");
console.log(
  `  TONG KET DUNG LUONG WEB: ${(totalRawBytes / (1024 * 1024)).toFixed(2)} MB -> ${(totalOutBytes / (1024 * 1024)).toFixed(2)} MB (Tiet kiem -${savedPct}%)`
);
console.log(
  `  Ket noi san sang: ${Object.keys(activeCharacters).length}/9 Nhan vat | ${Object.keys(activeHandProps).length}/6 Cam tay | ${Object.keys(syncedPropsMap).length}/18 Dao cu | ${conceptItems.length} Concept`
);
console.log("==========================================================================");
