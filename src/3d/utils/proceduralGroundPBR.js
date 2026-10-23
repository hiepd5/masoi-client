import * as THREE from "three";

let cachedGroundAssets = null;
let cachedEnvMap = null;

function hash2D(ix, iy, seed = 1) {
  const n = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

/**
 * Sinh bộ Texture PBR Đá Cuội Cổ (Cobblestone) & Đất Rêu Rừng (Forest Moss/Earth) lặp liền mạch 100% (Wrapped Voronoi)
 * cùng Đĩa Bóng Tiếp Xúc Mềm (Contact AO) ngay trên bộ nhớ trình duyệt (< 35ms, 0 KB tải mạng!).
 */
export function getProceduralGroundAssets() {
  if (cachedGroundAssets) return cachedGroundAssets;

  // 1. VÂN SÂN ĐÁ CUỘI CỔ KÍNH + BẢN ĐỒ LỒI LÕM BUMP (512x512 lặp liền mạch 100%)
  const cobSize = 512;
  const cobColorCanvas = document.createElement("canvas");
  cobColorCanvas.width = cobSize;
  cobColorCanvas.height = cobSize;
  const cCtx = cobColorCanvas.getContext("2d");

  const cobBumpCanvas = document.createElement("canvas");
  cobBumpCanvas.width = cobSize;
  cobBumpCanvas.height = cobSize;
  const bCtx = cobBumpCanvas.getContext("2d");

  const cImg = cCtx.createImageData(cobSize, cobSize);
  const bImg = bCtx.createImageData(cobSize, cobSize);

  const gridN = 10; // 10x10 viên đá cổ mỗi ô lặp (lặp tuần hoàn 2 chiều không vết nối)
  const cellPts = [];
  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      cellPts.push({
        x: (gx + 0.18 + hash2D(gx, gy, 1) * 0.64) / gridN,
        y: (gy + 0.18 + hash2D(gx, gy, 2) * 0.64) / gridN,
        tone: hash2D(gx, gy, 3),
        warm: hash2D(gx, gy, 4),
      });
    }
  }

  for (let py = 0; py < cobSize; py++) {
    const uy = py / cobSize;
    const baseGy = Math.floor(uy * gridN);
    for (let px = 0; px < cobSize; px++) {
      const ux = px / cobSize;
      const baseGx = Math.floor(ux * gridN);

      let d1 = 999;
      let d2 = 999;
      let bestCell = cellPts[0];

      for (let oy = -1; oy <= 1; oy++) {
        const ny = (baseGy + oy + gridN) % gridN;
        for (let ox = -1; ox <= 1; ox++) {
          const nx = (baseGx + ox + gridN) % gridN;
          const pt = cellPts[ny * gridN + nx];
          let dx = ux - pt.x;
          let dy = uy - pt.y;
          dx -= Math.round(dx);
          dy -= Math.round(dy);
          const dist = Math.hypot(dx, dy) * gridN;
          if (dist < d1) {
            d2 = d1;
            d1 = dist;
            bestCell = pt;
          } else if (dist < d2) {
            d2 = dist;
          }
        }
      }

      // Độ rộng khe mạch vữa rêu giữa các viên đá
      const edge = Math.max(0, Math.min(1, (d2 - d1) / 0.16));
      const grain = (hash2D(px, py, 9) - 0.5) * 16;
      const bumpVal = Math.floor((0.18 + 0.82 * Math.pow(edge, 0.55)) * 235 + grain * 0.4);

      // Màu đá slate xám nâu cổ kính pha rêu khe đá ăn nhập 100% với nhà Tudor & bếp đá Tripo
      const stoneBase = 58 + bestCell.tone * 28 + grain * 0.65;
      const warmShift = (bestCell.warm - 0.45) * 14;
      const mortarMoss = 1 - edge;

      const r = Math.max(18, Math.min(255, stoneBase * edge + 24 * mortarMoss + warmShift));
      const g = Math.max(22, Math.min(255, (stoneBase + 2) * edge + 34 * mortarMoss + warmShift * 0.4));
      const b = Math.max(20, Math.min(255, (stoneBase + 5) * edge + 24 * mortarMoss - warmShift * 0.5));

      const idx = (py * cobSize + px) * 4;
      cImg.data[idx] = r;
      cImg.data[idx + 1] = g;
      cImg.data[idx + 2] = b;
      cImg.data[idx + 3] = 255;

      const bv = Math.max(0, Math.min(255, bumpVal));
      bImg.data[idx] = bv;
      bImg.data[idx + 1] = bv;
      bImg.data[idx + 2] = bv;
      bImg.data[idx + 3] = 255;
    }
  }
  cCtx.putImageData(cImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  const cobbleColorMap = new THREE.CanvasTexture(cobColorCanvas);
  cobbleColorMap.wrapS = THREE.RepeatWrapping;
  cobbleColorMap.wrapT = THREE.RepeatWrapping;
  cobbleColorMap.repeat.set(5, 5);
  cobbleColorMap.colorSpace = THREE.SRGBColorSpace;
  cobbleColorMap.anisotropy = 4;

  const cobbleBumpMap = new THREE.CanvasTexture(cobBumpCanvas);
  cobbleBumpMap.wrapS = THREE.RepeatWrapping;
  cobbleBumpMap.wrapT = THREE.RepeatWrapping;
  cobbleBumpMap.repeat.set(5, 5);

  // 2. VÂN ĐẤT RỪNG RÊU SẪM & LÁ THÔNG MỤC LIỀN MẠCH (256x256 lặp 18x18 cho nền 60m)
  const forSize = 256;
  const forCanvas = document.createElement("canvas");
  forCanvas.width = forSize;
  forCanvas.height = forSize;
  const fCtx = forCanvas.getContext("2d");

  const forBumpCanvas = document.createElement("canvas");
  forBumpCanvas.width = forSize;
  forBumpCanvas.height = forSize;
  const fbCtx = forBumpCanvas.getContext("2d");

  const fImg = fCtx.createImageData(forSize, forSize);
  const fbImg = fbCtx.createImageData(forSize, forSize);

  for (let y = 0; y < forSize; y++) {
    const ay = (y / forSize) * Math.PI * 2;
    for (let x = 0; x < forSize; x++) {
      const ax = (x / forSize) * Math.PI * 2;
      // Sóng tuần hoàn 2 chiều liền mạch giữa thảm rêu rừng & mảng đất nâu ẩm
      const patch =
        0.5 +
        0.26 * Math.sin(ax * 2 + Math.cos(ay * 2)) +
        0.16 * Math.cos(ay * 3 - Math.sin(ax * 3)) +
        0.08 * Math.sin((ax + ay) * 5);
      const fine = (hash2D(x, y, 17) - 0.5) * 18;

      const mossWeight = Math.max(0, Math.min(1, patch));
      // Đất nâu sẫm (#241a13) hòa quyện rêu thông sẫm (#172a1e)
      const r = 36 * (1 - mossWeight) + 21 * mossWeight + fine * 0.55;
      const g = 27 * (1 - mossWeight) + 41 * mossWeight + fine * 0.65;
      const b = 19 * (1 - mossWeight) + 27 * mossWeight + fine * 0.4;

      const idx = (y * forSize + x) * 4;
      fImg.data[idx] = Math.max(8, Math.min(255, r));
      fImg.data[idx + 1] = Math.max(10, Math.min(255, g));
      fImg.data[idx + 2] = Math.max(8, Math.min(255, b));
      fImg.data[idx + 3] = 255;

      const bv = Math.max(0, Math.min(255, 120 + patch * 85 + fine * 2.1));
      fbImg.data[idx] = bv;
      fbImg.data[idx + 1] = bv;
      fbImg.data[idx + 2] = bv;
      fbImg.data[idx + 3] = 255;
    }
  }
  fCtx.putImageData(fImg, 0, 0);
  fbCtx.putImageData(fbImg, 0, 0);

  const forestColorMap = new THREE.CanvasTexture(forCanvas);
  forestColorMap.wrapS = THREE.RepeatWrapping;
  forestColorMap.wrapT = THREE.RepeatWrapping;
  forestColorMap.repeat.set(18, 18);
  forestColorMap.colorSpace = THREE.SRGBColorSpace;
  forestColorMap.anisotropy = 4;

  const forestBumpMap = new THREE.CanvasTexture(forBumpCanvas);
  forestBumpMap.wrapS = THREE.RepeatWrapping;
  forestBumpMap.wrapT = THREE.RepeatWrapping;
  forestBumpMap.repeat.set(18, 18);

  // 3. ĐĨA BÓNG TIẾP XÚC MỀM DƯỚI CHÂN VẬT THỂ (CONTACT AO — Siêu nhẹ, xóa cảm giác trôi nổi)
  const aoCanvas = document.createElement("canvas");
  aoCanvas.width = 128;
  aoCanvas.height = 128;
  const aoCtx = aoCanvas.getContext("2d");
  const grad = aoCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, "rgba(2, 6, 14, 0.72)");
  grad.addColorStop(0.52, "rgba(2, 6, 14, 0.36)");
  grad.addColorStop(1, "rgba(2, 6, 14, 0.0)");
  aoCtx.fillStyle = grad;
  aoCtx.fillRect(0, 0, 128, 128);

  const contactAOMap = new THREE.CanvasTexture(aoCanvas);

  cachedGroundAssets = {
    cobbleColorMap,
    cobbleBumpMap,
    forestColorMap,
    forestBumpMap,
    contactAOMap,
  };
  return cachedGroundAssets;
}

/**
 * Tạo Bản Đồ Phản Xạ Môi Trường (Procedural PMREM IBL) 1 lần duy nhất trên GPU:
 * Giúp ngói đá, sắt rèn và gỗ sồi PBR của Tripo Pro bắt ánh trăng & ánh lửa chân thật mà tốn 0 KB tải mạng!
 */
export function getOrCreateDarkFantasyEnvMap(gl) {
  if (cachedEnvMap || !gl) return cachedEnvMap;
  try {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color("#142238");

    // Vòm trời trên xanh trăng bạc
    const skyHem = new THREE.Mesh(
      new THREE.SphereGeometry(20, 16, 12),
      new THREE.MeshBasicMaterial({ color: "#284166", side: THREE.BackSide })
    );
    envScene.add(skyHem);

    // Mặt sàn phản xạ đất nâu hổ phách ấm
    const groundReflector = new THREE.Mesh(
      new THREE.CircleGeometry(19, 16),
      new THREE.MeshBasicMaterial({ color: "#3d2616", side: THREE.DoubleSide })
    );
    groundReflector.rotation.x = -Math.PI / 2;
    groundReflector.position.y = -2;
    envScene.add(groundReflector);

    // Điểm phản xạ ánh trăng & ánh lửa cam tạo Specular Highlight trên kim loại/đá ẩm
    const moonDisc = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 12, 12),
      new THREE.MeshBasicMaterial({ color: "#bae6fd" })
    );
    moonDisc.position.set(-10, 12, -10);
    envScene.add(moonDisc);

    const warmGlowDisc = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 12, 12),
      new THREE.MeshBasicMaterial({ color: "#fb923c" })
    );
    warmGlowDisc.position.set(6, 1.5, 6);
    envScene.add(warmGlowDisc);

    const rt = pmrem.fromScene(envScene, 0.04);
    cachedEnvMap = rt.texture;
    pmrem.dispose();
    return cachedEnvMap;
  } catch {
    return null;
  }
}
