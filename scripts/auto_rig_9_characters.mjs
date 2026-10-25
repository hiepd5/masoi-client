import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_ROOT = path.resolve(__dirname, "..");
const GAME_ROOT = path.resolve(CLIENT_ROOT, "..");

const cliCustomDir = process.argv.slice(2).find((a) => !a.startsWith("--"));
const CANDIDATE_READY_DIRS = [
  cliCustomDir ? path.resolve(cliCustomDir) : null,
  path.resolve(GAME_ROOT, "masoi_banana_models", "events", "noel", "glb_ready"),
  path.resolve(GAME_ROOT, "..", "masoi_banana_models", "events", "noel", "glb_ready"),
  "C:\\CLAUDE CODE\\HIEPD5 Prompt\\masoi_banana_models\\events\\noel\\glb_ready",
].filter(Boolean);

const READY_DIR = CANDIDATE_READY_DIRS.find((p) => fs.existsSync(p));
if (!READY_DIR) {
  console.error("[LOI] Khong tim thay thu muc glb_ready!");
  process.exit(1);
}

const STATIC_BACKUP_DIR = path.resolve(READY_DIR, "..", "glb_static_backup");
fs.mkdirSync(STATIC_BACKUP_DIR, { recursive: true });

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });

/**
 * Cấu hình Giải Phẫu Thể Tích cho 9 Nhân Vật gốc (10 khe hiển thị):
 * - headCrownRatio: Tỷ lệ đỉnh hộp sọ thật so với tổng chiều cao (trừ mũ nhọn Phù Thủy / tai Sói cao)
 *   để khớp Cổ/Vai/Hông/Gối luôn đặt đúng vị trí giải phẫu 1:1 và mũ/sừng gắn cứng 100% vào xương Head!
 * - isWolf: Bổ sung thêm xương `Jaw` (hàm răng nanh đớp mồi) và `Tail` (đuôi sói giữ thăng bằng).
 * - garmentSkirt: Mức độ pha mượt tà váy/áo choàng (`0.0` quần gọn -> `0.55` váy dài Phù Thủy/Tiên Tri).
 */
const CHARACTER_RIG_PROFILES = [
  {
    id: "wolf",
    fileName: "char_wolf_noel.glb",
    headCrownRatio: 0.91,
    isWolf: true,
    garmentSkirt: 0.14,
    backCapeShield: false,
  },
  {
    id: "wolf_alt",
    fileName: "char_wolf_alt_noel.glb",
    headCrownRatio: 0.91,
    isWolf: true,
    garmentSkirt: 0.24,
    backCapeShield: true, // Bảo vệ áo choàng lệch vai dài phía sau (-Z)
  },
  {
    id: "seer",
    fileName: "char_seer_noel.glb",
    headCrownRatio: 0.94,
    isWolf: false,
    garmentSkirt: 0.48,
    backCapeShield: true,
  },
  {
    id: "witch",
    fileName: "char_witch_noel.glb",
    headCrownRatio: 0.83, // Trừ chóp nón nhọn Phù Thủy (0.83..1.00 gắn 100% vào Head)
    isWolf: false,
    garmentSkirt: 0.52,
    backCapeShield: true,
  },
  {
    id: "guard",
    fileName: "char_guard_noel.glb",
    headCrownRatio: 0.94,
    isWolf: false,
    garmentSkirt: 0.28,
    backCapeShield: true,
  },
  {
    id: "villager",
    fileName: "char_villager_noel.glb",
    headCrownRatio: 0.95,
    isWolf: false,
    garmentSkirt: 0.34,
    backCapeShield: true,
  },
  {
    id: "tough_guy",
    fileName: "char_tough_guy_noel.glb",
    headCrownRatio: 0.96,
    isWolf: false,
    garmentSkirt: 0.18,
    backCapeShield: false,
  },
  {
    id: "cursed",
    fileName: "char_cursed_noel.glb",
    headCrownRatio: 0.94,
    isWolf: false,
    garmentSkirt: 0.36,
    backCapeShield: true,
  },
  {
    id: "tanner",
    fileName: "char_tanner_noel.glb",
    headCrownRatio: 0.95,
    isWolf: false,
    garmentSkirt: 0.24,
    backCapeShield: false,
  },
];

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0, edge1, x) {
  if (Math.abs(edge1 - edge0) < 1e-6) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Nhân hai ma trận 4x4 dạng cột (column-major chuẩn GLTF/OpenGL)
function mulMat4(a, b) {
  const out = new Float64Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function composeNodeLocalMat4(node) {
  const rawMat = node.getMatrix();
  if (rawMat && rawMat.length === 16) {
    // Kiểm tra có phải ma trận khác đơn vị hay không; trong gltf-transform getMatrix() tính từ T/R/S
    return Float64Array.from(rawMat);
  }
  const t = node.getTranslation() || [0, 0, 0];
  const q = node.getRotation() || [0, 0, 0, 1];
  const s = node.getScale() || [1, 1, 1];
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;

  const out = new Float64Array(16);
  out[0] = (1 - (yy + zz)) * s[0];
  out[1] = (xy + wz) * s[0];
  out[2] = (xz - wy) * s[0];
  out[3] = 0;

  out[4] = (xy - wz) * s[1];
  out[5] = (1 - (xx + zz)) * s[1];
  out[6] = (yz + wx) * s[1];
  out[7] = 0;

  out[8] = (xz + wy) * s[2];
  out[9] = (yz - wx) * s[2];
  out[10] = (1 - (xx + yy)) * s[2];
  out[11] = 0;

  out[12] = t[0];
  out[13] = t[1];
  out[14] = t[2];
  out[15] = 1;
  return out;
}

function transformPointMat4(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function transformDirMat4(m, nx, ny, nz) {
  // Với scale đồng nhất/gần đồng nhất của model đã chuẩn hóa, nhân ma trận 3x3 rồi chuẩn hóa độ dài
  const rx = m[0] * nx + m[4] * ny + m[8] * nz;
  const ry = m[1] * nx + m[5] * ny + m[9] * nz;
  const rz = m[2] * nx + m[6] * ny + m[10] * nz;
  const len = Math.hypot(rx, ry, rz) || 1;
  return [rx / len, ry / len, rz / len];
}

// Khoảng cách từ điểm P đến đoạn thẳng AB và tham số chiếu t thuộc [0, 1]
function pointToSegmentInfo(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  if (abLenSq < 1e-8) {
    return { dist: Math.hypot(px - ax, py - ay, pz - az), t: 0 };
  }
  const t = clamp(((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / abLenSq, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const cz = az + abz * t;
  return { dist: Math.hypot(px - cx, py - cy, pz - cz), t };
}

/**
 * Nướng (Bake) toàn bộ ma trận nút tĩnh vào đỉnh POSITION / NORMAL và căn chuẩn:
 * minY = 0.0000m, centerX = 0.0000m, centerZ = 0.0000m
 */
function bakeSceneToCleanRootMesh(srcDoc) {
  const outDoc = new Document();
  const buffer = outDoc.createBuffer("MasoiRigBuffer");
  const scene = outDoc.createScene("Scene");

  const srcScene = srcDoc.getRoot().getDefaultScene() || srcDoc.getRoot().listScenes()[0];
  if (!srcScene) throw new Error("GLB khong co Scene!");

  // Sao chép Texture & Material sang Document mới để giữ 100% chất lượng PBR gốc
  const texMap = new Map();
  function cloneTex(srcTex) {
    if (!srcTex) return null;
    if (texMap.has(srcTex)) return texMap.get(srcTex);
    const dstTex = outDoc.createTexture(srcTex.getName() || "Tex");
    const img = srcTex.getImage();
    if (img) dstTex.setImage(img);
    const mime = srcTex.getMimeType();
    if (mime) dstTex.setMimeType(mime);
    texMap.set(srcTex, dstTex);
    return dstTex;
  }

  const matMap = new Map();
  function cloneMat(srcMat) {
    if (!srcMat) return null;
    if (matMap.has(srcMat)) return matMap.get(srcMat);
    const dst = outDoc.createMaterial(srcMat.getName() || "Mat");
    dst.setBaseColorFactor(srcMat.getBaseColorFactor());
    dst.setMetallicFactor(srcMat.getMetallicFactor());
    dst.setRoughnessFactor(srcMat.getRoughnessFactor());
    dst.setEmissiveFactor(srcMat.getEmissiveFactor());
    dst.setAlphaMode(srcMat.getAlphaMode());
    dst.setAlphaCutoff(srcMat.getAlphaCutoff());
    dst.setDoubleSided(srcMat.getDoubleSided());

    const baseTex = cloneTex(srcMat.getBaseColorTexture());
    if (baseTex) dst.setBaseColorTexture(baseTex);
    const mrTex = cloneTex(srcMat.getMetallicRoughnessTexture());
    if (mrTex) dst.setMetallicRoughnessTexture(mrTex);
    const normTex = cloneTex(srcMat.getNormalTexture());
    if (normTex) {
      dst.setNormalTexture(normTex);
      dst.setNormalScale(srcMat.getNormalScale());
    }
    const occTex = cloneTex(srcMat.getOcclusionTexture());
    if (occTex) {
      dst.setOcclusionTexture(occTex);
      dst.setOcclusionStrength(srcMat.getOcclusionStrength());
    }
    const emiTex = cloneTex(srcMat.getEmissiveTexture());
    if (emiTex) dst.setEmissiveTexture(emiTex);

    matMap.set(srcMat, dst);
    return dst;
  }

  const bakedPrims = [];
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  function traverseNode(node, parentMat) {
    const localMat = composeNodeLocalMat4(node);
    const worldMat = mulMat4(parentMat, localMat);
    const mesh = node.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const posAcc = prim.getAttribute("POSITION");
        if (!posAcc) continue;
        const count = posAcc.getCount();
        const positions = new Float32Array(count * 3);
        const tmp = [0, 0, 0];

        for (let i = 0; i < count; i++) {
          posAcc.getElement(i, tmp);
          const [wx, wy, wz] = transformPointMat4(worldMat, tmp[0], tmp[1], tmp[2]);
          positions[i * 3 + 0] = wx;
          positions[i * 3 + 1] = wy;
          positions[i * 3 + 2] = wz;
          if (wx < minX) minX = wx;
          if (wy < minY) minY = wy;
          if (wz < minZ) minZ = wz;
          if (wx > maxX) maxX = wx;
          if (wy > maxY) maxY = wy;
          if (wz > maxZ) maxZ = wz;
        }

        let normals = null;
        const normAcc = prim.getAttribute("NORMAL");
        if (normAcc) {
          normals = new Float32Array(count * 3);
          for (let i = 0; i < count; i++) {
            normAcc.getElement(i, tmp);
            const [nx, ny, nz] = transformDirMat4(worldMat, tmp[0], tmp[1], tmp[2]);
            normals[i * 3 + 0] = nx;
            normals[i * 3 + 1] = ny;
            normals[i * 3 + 2] = nz;
          }
        }

        let uvs = null;
        const uvAcc = prim.getAttribute("TEXCOORD_0");
        if (uvAcc) {
          uvs = new Float32Array(count * 2);
          const uvTmp = [0, 0];
          for (let i = 0; i < count; i++) {
            uvAcc.getElement(i, uvTmp);
            uvs[i * 2 + 0] = uvTmp[0];
            uvs[i * 2 + 1] = uvTmp[1];
          }
        }

        let colors = null;
        let colorItemSize = 0;
        const colAcc = prim.getAttribute("COLOR_0");
        if (colAcc) {
          colorItemSize = colAcc.getElementSize();
          colors = new Float32Array(count * colorItemSize);
          const colTmp = new Array(colorItemSize).fill(1);
          for (let i = 0; i < count; i++) {
            colAcc.getElement(i, colTmp);
            for (let k = 0; k < colorItemSize; k++) {
              colors[i * colorItemSize + k] = colTmp[k];
            }
          }
        }

        let indices = null;
        const idxAcc = prim.getIndices();
        if (idxAcc) {
          const idxCount = idxAcc.getCount();
          indices = count > 65535 ? new Uint32Array(idxCount) : new Uint16Array(idxCount);
          for (let i = 0; i < idxCount; i++) {
            indices[i] = idxAcc.getScalar(i);
          }
        }

        bakedPrims.push({
          positions,
          normals,
          uvs,
          colors,
          colorItemSize,
          indices,
          mode: prim.getMode(),
          material: cloneMat(prim.getMaterial()),
        });
      }
    }

    for (const child of node.listChildren()) {
      traverseNode(child, worldMat);
    }
  }

  const identity = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  for (const rootNode of srcScene.listChildren()) {
    traverseNode(rootNode, identity);
  }

  // Dịch tâm XZ về (0, 0) và đáy chân minY về đúng 0.0000m
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const shiftY = -minY;

  for (const bp of bakedPrims) {
    const pos = bp.positions;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 0] -= cx;
      pos[i + 1] += shiftY;
      pos[i + 2] -= cz;
    }
  }

  const bounds = {
    minX: minX - cx,
    maxX: maxX - cx,
    minY: 0,
    maxY: maxY - minY,
    minZ: minZ - cz,
    maxZ: maxZ - cz,
    sizeX: maxX - minX,
    sizeY: maxY - minY,
    sizeZ: maxZ - minZ,
  };

  return { outDoc, buffer, scene, bakedPrims, bounds };
}

/**
 * Dò mốc giải phẫu 3D thực tế trên đám mây điểm của từng nhân vật (Vai - Khuỷu - Cổ tay, Hông - Gối - Cổ chân, Hàm & Đuôi Sói)
 */
function detectAnatomicalSkeleton(bakedPrims, bounds, profile) {
  const totalH = bounds.sizeY;
  const bodyH = totalH * (profile.headCrownRatio || 0.94);
  const halfSpanX = Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX));

  // Dò tâm bàn tay trái/phải và khuỷu tay trái/phải trực tiếp từ dải sải tay A-Pose
  function centroidInXBand(minRatio, maxRatio, sign) {
    let sx = 0, sy = 0, sz = 0, n = 0;
    const lo = halfSpanX * minRatio;
    const hi = halfSpanX * maxRatio;
    for (const bp of bakedPrims) {
      const p = bp.positions;
      for (let i = 0; i < p.length; i += 3) {
        const vx = p[i];
        const vy = p[i + 1];
        const vz = p[i + 2];
        if (vy < bodyH * 0.34 || vy > bodyH * 0.96) continue;
        const sideX = vx * sign;
        if (sideX >= lo && sideX <= hi) {
          sx += vx;
          sy += vy;
          sz += vz;
          n++;
        }
      }
    }
    if (n < 8) return null;
    return [sx / n, sy / n, sz / n];
  }

  const shoulderX = clamp(bodyH * 0.115, 0.15, 0.235);
  const defaultShoulderY = bodyH * 0.775;

  const detectedHandL = centroidInXBand(0.76, 0.96, +1);
  const detectedHandR = centroidInXBand(0.76, 0.96, -1);
  const detectedElbowL = centroidInXBand(0.45, 0.63, +1);
  const detectedElbowR = centroidInXBand(0.45, 0.63, -1);

  const handL = detectedHandL || [halfSpanX * 0.84, bodyH * 0.52, 0.02];
  const handR = detectedHandR || [-halfSpanX * 0.84, bodyH * 0.52, 0.02];

  // Nội suy mượt chiều cao vai từ độ dốc cẳng tay thật
  const estShoulderYL = detectedElbowL
    ? clamp(detectedElbowL[1] + (detectedElbowL[1] - handL[1]) * 0.72, bodyH * 0.71, bodyH * 0.83)
    : defaultShoulderY;
  const estShoulderYR = detectedElbowR
    ? clamp(detectedElbowR[1] + (detectedElbowR[1] - handR[1]) * 0.72, bodyH * 0.71, bodyH * 0.83)
    : defaultShoulderY;
  const shoulderY = (estShoulderYL + estShoulderYR) * 0.5;

  const armLPos = [shoulderX, shoulderY, 0.0];
  const armRPos = [-shoulderX, shoulderY, 0.0];

  const foreArmLPos = detectedElbowL || [
    (armLPos[0] + handL[0]) * 0.5,
    (armLPos[1] + handL[1]) * 0.5,
    (armLPos[2] + handL[2]) * 0.5,
  ];
  const foreArmRPos = detectedElbowR || [
    (armRPos[0] + handR[0]) * 0.5,
    (armRPos[1] + handR[1]) * 0.5,
    (armRPos[2] + handR[2]) * 0.5,
  ];

  // Dò tâm bàn chân trái / phải ở lớp đáy y < 0.12m
  let footLX = 0, footLZ = 0, nFootL = 0;
  let footRX = 0, footRZ = 0, nFootR = 0;
  for (const bp of bakedPrims) {
    const p = bp.positions;
    for (let i = 0; i < p.length; i += 3) {
      const vx = p[i];
      const vy = p[i + 1];
      const vz = p[i + 2];
      if (vy <= 0.11 && Math.abs(vx) > 0.025 && Math.abs(vx) < 0.38) {
        if (vx > 0) {
          footLX += vx;
          footLZ += vz;
          nFootL++;
        } else {
          footRX += vx;
          footRZ += vz;
          nFootR++;
        }
      }
    }
  }

  const ankleLX = nFootL > 10 ? clamp(footLX / nFootL, 0.075, 0.22) : 0.115;
  const ankleRX = nFootR > 10 ? clamp(footRX / nFootR, -0.22, -0.075) : -0.115;
  const ankleZ = nFootL + nFootR > 20 ? clamp((footLZ + footRZ) / (nFootL + nFootR), -0.05, 0.08) : 0.01;

  const hipX = clamp((Math.abs(ankleLX) + Math.abs(ankleRX)) * 0.44, 0.085, 0.135);
  const hipY = clamp(bodyH * 0.465, 0.72, 0.88);
  const spineY = bodyH * 0.585;
  const chestY = bodyH * 0.715;
  const neckY = bodyH * 0.825;
  const headY = bodyH * 0.885;
  const upLegY = hipY - 0.015;
  const kneeY = clamp(upLegY * 0.535, 0.38, 0.465); // Đảm bảo L2 <= 0.465m để ngồi ghế 0.48m chân chạm phẳng đá Y>=0!
  const ankleY = 0.075;

  const joints = [
    { name: "Root", parent: -1, pos: [0, 0, 0] },                            // 0 (Gốc mặt đất Y=0)
    { name: "Hips", parent: 0, pos: [0, hipY, 0] },                          // 1
    { name: "Spine", parent: 1, pos: [0, spineY, 0] },                       // 2
    { name: "Chest", parent: 2, pos: [0, chestY, 0] },                       // 3
    { name: "Neck", parent: 3, pos: [0, neckY, 0] },                         // 4
    { name: "Head", parent: 4, pos: [0, headY, 0.01] },                      // 5
    { name: "LeftArm", parent: 3, pos: armLPos },                            // 6
    { name: "LeftForeArm", parent: 6, pos: foreArmLPos },                    // 7
    { name: "LeftHand", parent: 7, pos: handL },                             // 8
    { name: "RightArm", parent: 3, pos: armRPos },                           // 9
    { name: "RightForeArm", parent: 9, pos: foreArmRPos },                   // 10
    { name: "RightHand", parent: 10, pos: handR },                           // 11
    { name: "LeftUpLeg", parent: 1, pos: [hipX, upLegY, 0] },                // 12
    { name: "LeftLeg", parent: 12, pos: [(hipX + ankleLX) * 0.5, kneeY, 0.015] }, // 13
    { name: "LeftFoot", parent: 13, pos: [ankleLX, ankleY, ankleZ] },        // 14
    { name: "RightUpLeg", parent: 1, pos: [-hipX, upLegY, 0] },              // 15
    { name: "RightLeg", parent: 15, pos: [(-hipX + ankleRX) * 0.5, kneeY, 0.015] }, // 16
    { name: "RightFoot", parent: 16, pos: [ankleRX, ankleY, ankleZ] },       // 17
  ];

  if (profile.isWolf) {
    joints.push(
      { name: "Jaw", parent: 5, pos: [0, headY - 0.025, 0.085] },            // 18 (Hàm Sói)
      { name: "Tail", parent: 1, pos: [0, hipY - 0.04, -0.145] }             // 19 (Đuôi Sói)
    );
  }

  return {
    joints,
    bodyH,
    hipY,
    spineY,
    chestY,
    neckY,
    headY,
    shoulderX,
    shoulderY,
    upLegY,
    kneeY,
    ankleY,
    armLPos,
    foreArmLPos,
    handL,
    armRPos,
    foreArmRPos,
    handR,
  };
}

/**
 * Tính 4 trọng số xương mượt chuẩn hóa (sum = 1.0000) cho 1 đỉnh (vx, vy, vz),
 * kèm Khiên Bảo Vệ Tà Váy & Áo Choàng (`Garment & Cloak Smooth Weight Shield`)
 */
function computeVertexSkinWeights(vx, vy, vz, skel, profile) {
  const accum = new Map();
  const addW = (idx, w) => {
    if (w <= 1e-5) return;
    accum.set(idx, (accum.get(idx) || 0) + w);
  };

  const {
    hipY,
    spineY,
    chestY,
    neckY,
    headY,
    shoulderX,
    upLegY,
    kneeY,
    ankleY,
    armLPos,
    foreArmLPos,
    handL,
    armRPos,
    foreArmRPos,
    handR,
  } = skel;

  // 1. KIỂM TRA VÙNG ĐẦU / NÓN / SỪNG / HÀM SÓI (y phía trên cổ và nằm gần trục đầu)
  const headRadialXZ = Math.hypot(vx, vz * 0.75);
  const headGate = smoothstep(neckY - 0.045, neckY + 0.055, vy) * (1 - smoothstep(0.28, 0.42, Math.abs(vx)));

  // 2. KIỂM TRA VÙNG CÁNH TAY TRÁI (+X) & PHẢI (-X) DỰA TRÊN ĐƯỜNG GẤP KHÚC XƯƠNG TAY THẬT
  let armWeightTotal = 0;
  if (vy > hipY - 0.08 && vy < headY + 0.06 && Math.abs(vx) > shoulderX * 0.68) {
    const isLeft = vx >= 0;
    const sPos = isLeft ? armLPos : armRPos;
    const ePos = isLeft ? foreArmLPos : foreArmRPos;
    const wPos = isLeft ? handL : handR;
    // Kéo dài thêm đoạn đầu ngón tay / móng vuốt 14cm từ cổ tay
    const dirHX = wPos[0] - ePos[0];
    const dirHY = wPos[1] - ePos[1];
    const dirHZ = wPos[2] - ePos[2];
    const hLen = Math.hypot(dirHX, dirHY, dirHZ) || 0.2;
    const tipPos = [
      wPos[0] + (dirHX / hLen) * 0.16,
      wPos[1] + (dirHY / hLen) * 0.16,
      wPos[2] + (dirHZ / hLen) * 0.16,
    ];

    const segUpper = pointToSegmentInfo(vx, vy, vz, sPos[0], sPos[1], sPos[2], ePos[0], ePos[1], ePos[2]);
    const segFore = pointToSegmentInfo(vx, vy, vz, ePos[0], ePos[1], ePos[2], wPos[0], wPos[1], wPos[2]);
    const segHand = pointToSegmentInfo(vx, vy, vz, wPos[0], wPos[1], wPos[2], tipPos[0], tipPos[1], tipPos[2]);
    const minArmDist = Math.min(segUpper.dist, segFore.dist, segHand.dist);

    // Chắn vùng áo choàng sau lưng (-Z sâu) khỏi bị cuốn theo cánh tay
    const capeBackFade = profile.backCapeShield ? 1 - smoothstep(-0.14, -0.28, vz) * 0.65 : 1;
    const lateralGate = smoothstep(shoulderX * 0.72, shoulderX * 1.38, Math.abs(vx));
    const tubeGate = 1 - smoothstep(0.16, 0.31, minArmDist);
    armWeightTotal = clamp(lateralGate * tubeGate * capeBackFade * (1 - headGate), 0, 1);

    if (armWeightTotal > 0.001) {
      const idxUpper = isLeft ? 6 : 9;
      const idxFore = isLeft ? 7 : 10;
      const idxHand = isLeft ? 8 : 11;

      // Tính vị trí dọc theo sải tay s thuộc [0..3]
      const totalSpan = Math.max(0.22, Math.abs(wPos[0] - sPos[0]));
      const armProgress = clamp((Math.abs(vx) - Math.abs(sPos[0])) / totalSpan, 0, 1.25);

      const wHand = smoothstep(0.76, 0.96, armProgress);
      const wFore = smoothstep(0.36, 0.56, armProgress) * (1 - wHand);
      const wUpper = Math.max(0, 1 - wFore - wHand);

      addW(idxUpper, armWeightTotal * wUpper);
      addW(idxFore, armWeightTotal * wFore);
      addW(idxHand, armWeightTotal * wHand);
    }
  }

  const remaining = Math.max(0, 1 - armWeightTotal);
  if (remaining > 0.001) {
    if (headGate > 0.001) {
      const headShare = remaining * headGate;
      const neckToHead = smoothstep(neckY - 0.01, headY + 0.02, vy);
      let wHead = neckToHead;
      const wNeck = 1 - neckToHead;

      // Nếu là Ma Sói: phân tách hàm dưới (Jaw = joint 18) ở vùng mõm trước (+Z > 0.075m)
      if (profile.isWolf && vz > 0.068 && vy > neckY - 0.015 && vy < headY + 0.055 && Math.abs(vx) < 0.145) {
        const jawFactor =
          smoothstep(0.068, 0.135, vz) *
          (1 - smoothstep(headY + 0.015, headY + 0.055, vy)) *
          0.84;
        const wJaw = wHead * jawFactor;
        wHead -= wJaw;
        addW(18, headShare * wJaw);
      }

      addW(4, headShare * wNeck);
      addW(5, headShare * wHead);
    }

    const bodyAndLegsShare = remaining * (1 - headGate);
    if (bodyAndLegsShare > 0.001) {
      // Kiểm tra Đuôi Sói (Tail = joint 19) phía sau lưng dưới (-Z < -0.14m)
      let tailFactor = 0;
      if (profile.isWolf && vz < -0.135 && vy > 0.18 && vy < hipY + 0.18 && Math.abs(vx) < 0.24) {
        tailFactor = smoothstep(-0.135, -0.25, vz) * (1 - smoothstep(0.16, 0.25, Math.abs(vx))) * 0.9;
        addW(19, bodyAndLegsShare * tailFactor);
      }

      const coreShare = bodyAndLegsShare * (1 - tailFactor);
      if (coreShare > 0.001) {
        // Phân tách Thân Trên (Hips/Spine/Chest) và Thân Dưới (Đùi/Gối/Bàn chân + Khiên bảo vệ tà váy)
        const legBlendRaw = 1 - smoothstep(upLegY - 0.08, hipY + 0.055, vy);

        // Bảo vệ áo choàng lưng (-Z sâu) để không chọc xuyên tựa lưng ghế 0.48m khi gập đùi ngồi!
        const backCapeHold =
          profile.backCapeShield && vy > 0.22
            ? smoothstep(-0.12, -0.26, vz) * 0.72
            : 0;

        // Cushion tà váy ngoài: giữ 1 phần Hips ở vùng váy hông để vải uốn vòm êm ái
        const radialSkirt = Math.hypot(vx, vz);
        const skirtHipCushion =
          (profile.garmentSkirt || 0) *
          smoothstep(0.16, 0.34, radialSkirt) *
          smoothstep(0.16, upLegY, vy) *
          0.42;

        const effectiveLegShare = clamp(legBlendRaw * (1 - backCapeHold) * (1 - skirtHipCushion), 0, 1);
        const torsoShare = coreShare * (1 - effectiveLegShare);
        const legsShare = coreShare * effectiveLegShare;

        if (torsoShare > 0.001) {
          if (vy <= spineY) {
            const t = smoothstep(hipY - 0.04, spineY, vy);
            addW(1, torsoShare * (1 - t));
            addW(2, torsoShare * t);
          } else if (vy <= chestY) {
            const t = smoothstep(spineY, chestY, vy);
            addW(2, torsoShare * (1 - t));
            addW(3, torsoShare * t);
          } else {
            const t = smoothstep(chestY, neckY + 0.02, vy);
            addW(3, torsoShare * (1 - t * 0.35));
            addW(4, torsoShare * (t * 0.35));
          }
          void headRadialXZ;
        }

        if (legsShare > 0.001) {
          // Dải chuyển tiếp Trái <-> Phải mượt mà qua X=0 (rộng hơn ở vùng váy để 0% rách háng khi ngồi & bước!)
          const seamHalfWidth = vy < ankleY + 0.05 ? 0.02 : 0.035 + (profile.garmentSkirt || 0) * 0.13;
          const leftRatio = smoothstep(-seamHalfWidth, +seamHalfWidth, vx);
          const rightRatio = 1 - leftRatio;

          // Tỷ lệ dọc ống chân: UpLeg (12/15) -> Leg (13/16) -> Foot (14/17)
          const footT = 1 - smoothstep(ankleY - 0.015, ankleY + 0.055, vy);
          const shinT = (1 - smoothstep(kneeY - 0.065, kneeY + 0.065, vy)) * (1 - footT);
          const thighT = Math.max(0, 1 - shinT - footT);

          if (leftRatio > 0.001) {
            const lS = legsShare * leftRatio;
            addW(12, lS * thighT);
            addW(13, lS * shinT);
            addW(14, lS * footT);
          }
          if (rightRatio > 0.001) {
            const rS = legsShare * rightRatio;
            addW(15, rS * thighT);
            addW(16, rS * shinT);
            addW(17, rS * footT);
          }
        }
      }
    }
  }

  // Chọn tối đa 4 xương có trọng số lớn nhất & chuẩn hóa tổng đúng bằng 1.0000
  const sorted = [...accum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  while (sorted.length < 4) sorted.push([1, 0]);
  const sum = sorted.reduce((acc, item) => acc + item[1], 0) || 1;

  return {
    joints: [sorted[0][0], sorted[1][0], sorted[2][0], sorted[3][0]],
    weights: [
      sorted[0][1] / sum,
      sorted[1][1] / sum,
      sorted[2][1] / sum,
      sorted[3][1] / sum,
    ],
  };
}

console.log("===============================================================================");
console.log("  MA SOI 3D - DONG CO AUTO-SKINNING 9 NHAN VAT (18-20 BONES + SKIRT SHIELD)");
console.log("===============================================================================");
console.log(`  [+] Thu muc glb_ready:        ${READY_DIR}`);
console.log(`  [+] Backup Smart Mesh tinh:   ${STATIC_BACKUP_DIR}`);

let riggedCount = 0;
let nativeTripoPreserved = 0;

for (const profile of CHARACTER_RIG_PROFILES) {
  const readyPath = path.join(READY_DIR, profile.fileName);
  if (!fs.existsSync(readyPath)) {
    console.warn(`  [BO QUA] Chua co file ${profile.fileName}`);
    continue;
  }

  const backupPath = path.join(STATIC_BACKUP_DIR, profile.fileName);
  const currentDoc = await io.read(readyPath);
  const existingSkins = currentDoc.getRoot().listSkins();

  // Nếu người dùng đã thả file Auto-Rig gốc từ Tripo Studio Web (không phải MasoiAutoRigArmature): bảo toàn 100%!
  if (
    existingSkins.length > 0 &&
    existingSkins.every((sk) => sk.getName() !== "MasoiAutoRigArmature")
  ) {
    const boneCount = existingSkins[0].listJoints().length;
    console.log(
      `  [GIU NGUYEN TRIPO RIG] ${profile.fileName.padEnd(26)} | Da co san Skin ngoai (${boneCount} bones)`
    );
    nativeTripoPreserved++;
    continue;
  }

  // Đảm bảo luôn lưu giữ bản gốc tĩnh sạch 100% vào glb_static_backup/ trước khi ghi rig
  if (!fs.existsSync(backupPath) && existingSkins.length === 0) {
    fs.copyFileSync(readyPath, backupPath);
  }

  const cleanSourcePath = fs.existsSync(backupPath) ? backupPath : readyPath;
  const staticDoc = await io.read(cleanSourcePath);

  const { outDoc, buffer, scene, bakedPrims, bounds } = bakeSceneToCleanRootMesh(staticDoc);
  const skel = detectAnatomicalSkeleton(bakedPrims, bounds, profile);

  // Khởi tạo cây Node Xương chuẩn GLTF (Mọi xương có Rotation = Identity trong Bind Pose!)
  const armatureRoot = outDoc
    .createNode("MasoiAutoRigArmature")
    .setTranslation([0, 0, 0])
    .setRotation([0, 0, 0, 1])
    .setScale([1, 1, 1]);
  scene.addChild(armatureRoot);

  const jointNodes = [];
  const ibmArray = new Float32Array(skel.joints.length * 16);

  for (let j = 0; j < skel.joints.length; j++) {
    const jDef = skel.joints[j];
    const parentWorldPos = jDef.parent >= 0 ? skel.joints[jDef.parent].pos : [0, 0, 0];
    const localPos = [
      jDef.pos[0] - parentWorldPos[0],
      jDef.pos[1] - parentWorldPos[1],
      jDef.pos[2] - parentWorldPos[2],
    ];

    const jNode = outDoc
      .createNode(jDef.name)
      .setTranslation(localPos)
      .setRotation([0, 0, 0, 1])
      .setScale([1, 1, 1]);

    if (jDef.parent >= 0) {
      jointNodes[jDef.parent].addChild(jNode);
    } else {
      armatureRoot.addChild(jNode);
    }
    jointNodes.push(jNode);

    // Inverse Bind Matrix chuẩn 4x4 Column-Major = Translate(-worldX, -worldY, -worldZ)
    const base = j * 16;
    ibmArray[base + 0] = 1;
    ibmArray[base + 5] = 1;
    ibmArray[base + 10] = 1;
    ibmArray[base + 12] = -jDef.pos[0];
    ibmArray[base + 13] = -jDef.pos[1];
    ibmArray[base + 14] = -jDef.pos[2];
    ibmArray[base + 15] = 1;
  }

  const ibmAcc = outDoc
    .createAccessor("InverseBindMatrices")
    .setBuffer(buffer)
    .setType("MAT4")
    .setArray(ibmArray);

  const skin = outDoc
    .createSkin("MasoiAutoRigArmature")
    .setSkeleton(jointNodes[0])
    .setInverseBindMatrices(ibmAcc);

  for (const jNode of jointNodes) {
    skin.addJoint(jNode);
  }

  const outMesh = outDoc.createMesh(`${profile.id}_SkinnedMesh`);
  let totalVertices = 0;

  for (let pIdx = 0; pIdx < bakedPrims.length; pIdx++) {
    const bp = bakedPrims[pIdx];
    const vCount = bp.positions.length / 3;
    totalVertices += vCount;

    const jointsArr = new Uint16Array(vCount * 4);
    const weightsArr = new Float32Array(vCount * 4);

    for (let v = 0; v < vCount; v++) {
      const vx = bp.positions[v * 3 + 0];
      const vy = bp.positions[v * 3 + 1];
      const vz = bp.positions[v * 3 + 2];
      const sw = computeVertexSkinWeights(vx, vy, vz, skel, profile);

      jointsArr[v * 4 + 0] = sw.joints[0];
      jointsArr[v * 4 + 1] = sw.joints[1];
      jointsArr[v * 4 + 2] = sw.joints[2];
      jointsArr[v * 4 + 3] = sw.joints[3];

      weightsArr[v * 4 + 0] = sw.weights[0];
      weightsArr[v * 4 + 1] = sw.weights[1];
      weightsArr[v * 4 + 2] = sw.weights[2];
      weightsArr[v * 4 + 3] = sw.weights[3];
    }

    const prim = outDoc.createPrimitive().setMode(bp.mode);
    if (bp.material) prim.setMaterial(bp.material);

    prim.setAttribute(
      "POSITION",
      outDoc.createAccessor(`pos_${pIdx}`).setBuffer(buffer).setType("VEC3").setArray(bp.positions)
    );
    if (bp.normals) {
      prim.setAttribute(
        "NORMAL",
        outDoc.createAccessor(`norm_${pIdx}`).setBuffer(buffer).setType("VEC3").setArray(bp.normals)
      );
    }
    if (bp.uvs) {
      prim.setAttribute(
        "TEXCOORD_0",
        outDoc.createAccessor(`uv_${pIdx}`).setBuffer(buffer).setType("VEC2").setArray(bp.uvs)
      );
    }
    if (bp.colors && bp.colorItemSize >= 3) {
      prim.setAttribute(
        "COLOR_0",
        outDoc
          .createAccessor(`col_${pIdx}`)
          .setBuffer(buffer)
          .setType(bp.colorItemSize === 4 ? "VEC4" : "VEC3")
          .setArray(bp.colors)
      );
    }
    prim.setAttribute(
      "JOINTS_0",
      outDoc.createAccessor(`joints_${pIdx}`).setBuffer(buffer).setType("VEC4").setArray(jointsArr)
    );
    prim.setAttribute(
      "WEIGHTS_0",
      outDoc.createAccessor(`weights_${pIdx}`).setBuffer(buffer).setType("VEC4").setArray(weightsArr)
    );

    if (bp.indices) {
      prim.setIndices(
        outDoc.createAccessor(`idx_${pIdx}`).setBuffer(buffer).setType("SCALAR").setArray(bp.indices)
      );
    }

    outMesh.addPrimitive(prim);
  }

  const skinnedMeshNode = outDoc
    .createNode(`${profile.id}_MeshNode`)
    .setMesh(outMesh)
    .setSkin(skin);
  scene.addChild(skinnedMeshNode);

  await io.write(readyPath, outDoc);
  const outKB = (fs.statSync(readyPath).size / 1024).toFixed(1);

  console.log(
    `  [RIGGED] ${profile.fileName.padEnd(25)} | H=${bounds.sizeY.toFixed(2)}m | ` +
      `${skel.joints.length} bones | ${totalVertices} verts | ${outKB} KB`
  );
  riggedCount++;
}

console.log("-------------------------------------------------------------------------------");
console.log(
  `  HOAN TAT AUTO-SKINNING: ${riggedCount} model da gan xuong | ${nativeTripoPreserved} Tripo Rig goc bao toan!`
);
console.log("===============================================================================");
