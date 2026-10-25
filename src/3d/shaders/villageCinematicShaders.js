import * as THREE from "three";

/**
 * Bộ Uniform Toàn Cục Duy Nhất (1 lần gán ~0.002ms CPU mỗi frame cho toàn bộ Rừng Cây, Đèn Lồng, Cửa Sổ & Sân Đá!)
 */
export const CINEMATIC_SHARED_UNIFORMS = {
  uTime: { value: 0 },
  uWindStrength: { value: 1.0 },
  uWarmGlowIntensity: { value: 1.35 },
  uNightFactor: { value: 0.72 }, // 1.0 = Đêm Trăng Sâu, 0.55 = Chạng Vạng Sương Rừng Ban Ngày
  uFireWorldPos: { value: new THREE.Vector3(0, 0.48, 0) },
  uPhaseAccentColor: { value: new THREE.Color("#fb923c") },
};

let cachedGlowSpriteTex = null;
let cachedMistRibbonTex = null;

/**
 * Tạo Texture Quầng Sáng Mềm (Additive Light Halo) cho Đèn Lồng, Ánh Trăng & Cửa Sổ (0 KB tải mạng)
 */
export function getSoftGlowHaloTexture() {
  if (cachedGlowSpriteTex) return cachedGlowSpriteTex;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0.0, "rgba(255, 244, 214, 1.0)");
  grad.addColorStop(0.18, "rgba(255, 196, 102, 0.72)");
  grad.addColorStop(0.48, "rgba(245, 130, 32, 0.24)");
  grad.addColorStop(0.78, "rgba(217, 90, 18, 0.06)");
  grad.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedGlowSpriteTex = tex;
  return tex;
}

/**
 * Tạo Texture Dải Sương Mù Rừng Bắc Âu Mềm Mại (0 KB tải mạng, không viền vuông)
 */
export function getDriftingMistTexture() {
  if (cachedMistRibbonTex) return cachedMistRibbonTex;
  const w = 256;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, w, h);

  // Vẽ nhiều đám mây sương chồng lớp elip mềm để tạo dải sương tự nhiên không lộ khung chữ nhật
  const puffs = [
    { x: 0.24, y: 0.56, rx: 0.22, ry: 0.34, a: 0.34 },
    { x: 0.42, y: 0.48, rx: 0.28, ry: 0.38, a: 0.42 },
    { x: 0.61, y: 0.54, rx: 0.26, ry: 0.36, a: 0.38 },
    { x: 0.77, y: 0.58, rx: 0.2, ry: 0.3, a: 0.28 },
    { x: 0.5, y: 0.64, rx: 0.35, ry: 0.26, a: 0.3 },
  ];

  puffs.forEach((p) => {
    ctx.save();
    ctx.translate(p.x * w, p.y * h);
    ctx.scale(p.rx * w, p.ry * h);
    const g = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 1.0);
    g.addColorStop(0.0, `rgba(216, 232, 250, ${p.a})`);
    g.addColorStop(0.45, `rgba(182, 208, 238, ${p.a * 0.55})`);
    g.addColorStop(0.8, `rgba(148, 178, 216, ${p.a * 0.16})`);
    g.addColorStop(1.0, "rgba(148, 178, 216, 0.0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedMistRibbonTex = tex;
  return tex;
}

/**
 * 1. VÒM TRỜI ĐÊM TRĂNG MÂY TRÔI BẮC ÂU (Procedural Moonlit Cloud Sky Dome Shader)
 */
export function createMoonlitSkyDomeMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: CINEMATIC_SHARED_UNIFORMS.uTime,
      uNightFactor: CINEMATIC_SHARED_UNIFORMS.uNightFactor,
      uZenithColor: { value: new THREE.Color("#040915") },
      uMidSkyColor: { value: new THREE.Color("#0d1d35") },
      uHorizonColor: { value: new THREE.Color("#1b314c") },
      uCloudTint: { value: new THREE.Color("#6488b4") },
      uMoonDir: { value: new THREE.Vector3(-0.14, 0.38, -0.91).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uNightFactor;
      uniform vec3 uZenithColor;
      uniform vec3 uMidSkyColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uCloudTint;
      uniform vec3 uMoonDir;
      varying vec3 vWorldDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float fbmClouds(vec2 uv) {
        float v = 0.0;
        float amp = 0.52;
        for (int i = 0; i < 4; i++) {
          v += noise2D(uv) * amp;
          uv = uv * 2.07 + vec2(1.7, -1.3);
          amp *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float elev = clamp(dir.y, 0.0, 1.0);

        // Chuyển sắc bầu trời 3 tầng sâu thẳm (Chân trời sương bạc -> Lưng trời xanh chàm -> Đỉnh trời đêm thẳm)
        vec3 col = mix(uHorizonColor, uMidSkyColor, smoothstep(0.0, 0.28, elev));
        col = mix(col, uZenithColor, smoothstep(0.22, 0.82, elev));

        // Lớp mây đêm trôi chậm ngang qua vầng trăng
        vec2 skyUv = dir.xz / (elev + 0.24);
        float drift = uTime * 0.012;
        float c1 = fbmClouds(skyUv * 1.45 + vec2(drift, drift * 0.45));
        float c2 = fbmClouds(skyUv * 2.8 - vec2(drift * 0.7, -drift * 0.3));
        float cloudMask = smoothstep(0.42, 0.86, c1 * 0.68 + c2 * 0.32) * smoothstep(0.01, 0.22, elev);

        // Quầng tán xạ ánh trăng xuyên qua mây (Silver-Blue Moonlit Cloud Scattering)
        float moonAlign = max(0.0, dot(dir, normalize(uMoonDir)));
        float moonHaloWide = pow(moonAlign, 6.0) * 0.36;
        float moonHaloTight = pow(moonAlign, 42.0) * 0.58;

        vec3 litCloudColor = uCloudTint * (0.42 + moonHaloWide * 1.9);
        col = mix(col, litCloudColor, cloudMask * 0.56);
        col += vec3(0.56, 0.76, 0.98) * (moonHaloWide * 0.42 + moonHaloTight * (1.0 - cloudMask * 0.45));

        // Dải sương mù chân trời hòa liền mạch xuống mặt rừng
        float horizonMist = 1.0 - smoothstep(0.0, 0.14, elev);
        col = mix(col, uHorizonColor * 1.15, horizonMist * 0.65);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/**
 * 2. NGỌN LỬA TRẠI VOLUMETRIC SHADER ĐA LỚP (Thay thế hoàn toàn khối chóp ConeGeometry thô!)
 */
export function createVolumetricFireMaterial({ phaseOffset = 0, opacityScale = 1.0 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: CINEMATIC_SHARED_UNIFORMS.uTime,
      uPhase: { value: phaseOffset },
      uOpacity: { value: opacityScale },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPhase;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec3 pos = position;
        float h = clamp(uv.y, 0.0, 1.0);
        // Ngọn lửa uốn lượn mềm mại theo gió ở phần đỉnh
        float sway = sin(uTime * 5.2 + uPhase + h * 4.2) * 0.075 * h * h;
        float swayZ = cos(uTime * 4.3 + uPhase * 1.7 + h * 3.6) * 0.045 * h * h;
        pos.x += sway;
        pos.z += swayZ;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uPhase;
      uniform float uOpacity;
      varying vec2 vUv;

      float hash21(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbmFire(vec2 p) {
        float f = 0.0;
        f += 0.50 * vnoise(p); p *= 2.03;
        f += 0.28 * vnoise(p); p *= 2.05;
        f += 0.14 * vnoise(p);
        return f;
      }

      void main() {
        vec2 uv = vUv;
        float xCentered = (uv.x - 0.5) * 2.0; // [-1, 1]
        float y = clamp(uv.y, 0.0, 1.0);

        // Chiều rộng lưỡi lửa thuôn nhọn dần lên đỉnh
        float taper = mix(0.82, 0.08, pow(y, 0.86));
        float distX = abs(xCentered) / max(0.06, taper);

        // Nhiễu lửa bốc ngược lên trời tốc độ cao
        float t = uTime * 3.35 + uPhase;
        float n1 = fbmFire(vec2(uv.x * 3.8 + sin(y * 3.0 + t * 0.6) * 0.25, y * 3.2 - t));
        float n2 = fbmFire(vec2(uv.x * 7.2 - 1.4, y * 5.8 - t * 1.45));
        float turb = n1 * 0.72 + n2 * 0.28;

        // Mặt nạ hình dáng lưỡi lửa hữu cơ
        float shape = 1.0 - distX + (turb - 0.48) * (0.55 + y * 0.75);
        float verticalFade = smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.55, 0.99, y));
        float alpha = smoothstep(0.18, 0.72, shape) * verticalFade;

        if (alpha <= 0.004) discard;

        // Lõi trắng vàng cực nóng -> Giữa cam hổ phách -> Viền đỏ thẫm
        float heat = clamp(shape * (1.12 - y * 0.58), 0.0, 1.0);
        vec3 outerRed = vec3(0.88, 0.16, 0.02);
        vec3 midAmber = vec3(1.0, 0.48, 0.06);
        vec3 hotCore = vec3(1.0, 0.94, 0.68);

        vec3 fireCol = mix(outerRed, midAmber, smoothstep(0.15, 0.55, heat));
        fireCol = mix(fireCol, hotCore, smoothstep(0.58, 0.92, heat));

        gl_FragColor = vec4(fireCol * alpha * uOpacity * 1.32, alpha * uOpacity);
      }
    `,
  });
}

/**
 * 3. TIÊM SHADER GIÓ RỪNG 2 CHIỀU (Y × XZ) + CỬA SỔ/ĐÈN LỒNG TỰ PHÁT SÁNG + SÂN ĐÁ ẨM ÁNH LỬA VÀO .GLB TRIPO!
 * - Chạy 1 lần duy nhất lúc parse .GLB -> Chia sẻ chung Program/Material cho hàng chục cây/nhà -> 0ms CPU overhead!
 */
export function enhancePropMaterialsForCinema(
  root,
  propKey,
  rawBox,
  rawSize,
  rawCenter,
  shaderProfile = null
) {
  const isPineTree =
    propKey === "tree_pine_tall" ||
    propKey === "tree_pine_wide" ||
    shaderProfile === "pine_wind";
  const isDeadTree =
    propKey === "tree_dead_gnarled" || shaderProfile === "dead_wind";
  const isTree = isPineTree || isDeadTree;
  const isLantern =
    propKey === "prop_lantern" || shaderProfile === "lantern_glow";
  const isWarmBuilding =
    propKey === "house_cottage_a" ||
    propKey === "house_cottage_b" ||
    propKey === "landmark_belltower" ||
    shaderProfile === "warm_building";
  const isCampfire =
    propKey === "prop_campfire" ||
    propKey === "prop_cart_brazier" ||
    shaderProfile === "campfire";
  const isCobblestonePlaza =
    propKey === "plaza_cobblestone" || shaderProfile === "cobble_plaza";
  const isClothBanner =
    propKey === "prop_village_banner" || shaderProfile === "cloth_banner";
  const isCauldronBrew =
    propKey === "prop_witch_cauldron" || shaderProfile === "cauldron_brew";
  const isRunePulse =
    propKey === "prop_rune_obelisk" || shaderProfile === "rune_pulse";

  if (
    !isTree &&
    !isLantern &&
    !isWarmBuilding &&
    !isCampfire &&
    !isCobblestonePlaza &&
    !isClothBanner &&
    !isCauldronBrew &&
    !isRunePulse
  ) {
    return;
  }

  root.updateMatrixWorld(true);
  const rootMinY = Number.isFinite(rawBox.min.y) ? rawBox.min.y : 0;
  const rootInvH = 1.0 / Math.max(0.05, rawSize.y);
  const rootCenterXZ = new THREE.Vector2(rawCenter.x, rawCenter.z);
  const rootMaxRadius = Math.max(0.2, 0.5 * Math.max(rawSize.x, rawSize.z));

  const processedMaterials = new Map();

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;

    const meshNameLower = (obj.name || "").toLowerCase();
    const isExplicitLeafMesh = /leaf|leaves|foliage|needle|branch|canopy/.test(meshNameLower);
    const meshToRootMatrix = obj.matrixWorld.clone();

    const remapMaterial = (origMat) => {
      if (!origMat || !origMat.isMeshStandardMaterial) return origMat;
      const cacheId = `${origMat.uuid}::${isExplicitLeafMesh ? "leaf" : "solid"}`;
      if (processedMaterials.has(cacheId)) {
        return processedMaterials.get(cacheId);
      }

      const mat = origMat.clone();
      const hasAlphaCutout = Boolean(mat.alphaTest > 0 || mat.transparent);

      // Cải thiện độ mịn vật liệu PBR mặc định của Tripo để bắt sáng trăng & lửa mướt hơn
      if (isCobblestonePlaza) {
        mat.roughness = Math.min(mat.roughness ?? 0.85, 0.76);
        mat.metalness = Math.max(mat.metalness ?? 0.05, 0.08);
        mat.envMapIntensity = 1.25;
      } else if (isWarmBuilding || isLantern) {
        mat.envMapIntensity = 1.12;
      } else if (isTree) {
        mat.roughness = Math.max(mat.roughness ?? 0.85, 0.86);
      }

      const localUniforms = {
        uMeshToRoot: { value: meshToRootMatrix },
        uRootMinY: { value: rootMinY },
        uRootInvH: { value: rootInvH },
        uRootCenterXZ: { value: rootCenterXZ },
        uRootMaxRadius: { value: rootMaxRadius },
        uSwayAmp: {
          value: isPineTree
            ? 0.24
            : isDeadTree
              ? 0.12
              : isClothBanner
                ? 0.14
                : isLantern
                  ? 0.022
                  : 0.0,
        },
        uFlutterAmp: {
          value: isPineTree
            ? isExplicitLeafMesh || hasAlphaCutout
              ? 0.075
              : 0.048
            : isDeadTree
              ? 0.016
              : isClothBanner
                ? 0.055
                : 0.0,
        },
      };

      mat.customProgramCacheKey = () =>
        `masoi_cinema_v3_${propKey}_${shaderProfile || "auto"}_${isExplicitLeafMesh ? 1 : 0}`;

      mat.onBeforeCompile = (shader) => {
        // Nối trực tiếp vào biến toàn cục (1 lần update mỗi frame cho cả ngôi làng!)
        shader.uniforms.uTime = CINEMATIC_SHARED_UNIFORMS.uTime;
        shader.uniforms.uWindStrength = CINEMATIC_SHARED_UNIFORMS.uWindStrength;
        shader.uniforms.uWarmGlowIntensity = CINEMATIC_SHARED_UNIFORMS.uWarmGlowIntensity;
        shader.uniforms.uNightFactor = CINEMATIC_SHARED_UNIFORMS.uNightFactor;
        shader.uniforms.uFireWorldPos = CINEMATIC_SHARED_UNIFORMS.uFireWorldPos;
        shader.uniforms.uPhaseAccentColor = CINEMATIC_SHARED_UNIFORMS.uPhaseAccentColor;

        shader.uniforms.uMeshToRoot = localUniforms.uMeshToRoot;
        shader.uniforms.uRootMinY = localUniforms.uRootMinY;
        shader.uniforms.uRootInvH = localUniforms.uRootInvH;
        shader.uniforms.uRootCenterXZ = localUniforms.uRootCenterXZ;
        shader.uniforms.uRootMaxRadius = localUniforms.uRootMaxRadius;
        shader.uniforms.uSwayAmp = localUniforms.uSwayAmp;
        shader.uniforms.uFlutterAmp = localUniforms.uFlutterAmp;

        // ==================== VERTEX SHADER: GIÓ RỪNG 2 CHIỀU (Y × XZ) + XUẤT TỌA ĐỘ CHO FRAGMENT ====================
        shader.vertexShader = shader.vertexShader.replace(
          "#include <common>",
          /* glsl */ `
          #include <common>
          uniform float uTime;
          uniform float uWindStrength;
          uniform mat4 uMeshToRoot;
          uniform float uRootMinY;
          uniform float uRootInvH;
          uniform vec2 uRootCenterXZ;
          uniform float uRootMaxRadius;
          uniform float uSwayAmp;
          uniform float uFlutterAmp;

          varying vec3 vCinemaWorldPos;
          varying vec3 vCinemaWorldNormal;
          varying float vCinemaNormH;
          varying float vCinemaRadial;
          `
        );

        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          /* glsl */ `
          #include <begin_vertex>

          vec4 cinemaRootPos = uMeshToRoot * vec4(transformed, 1.0);
          float cinemaH = clamp((cinemaRootPos.y - uRootMinY) * uRootInvH, 0.0, 1.0);
          float cinemaRad = clamp(length(cinemaRootPos.xz - uRootCenterXZ) / uRootMaxRadius, 0.0, 1.0);
          vCinemaNormH = cinemaH;
          vCinemaRadial = cinemaRad;

          // Hỗ trợ song song cả Mesh đơn lẻ (D5 Architect Mode) lẫn THREE.InstancedMesh (< 40 Draw Calls)
          #ifdef USE_INSTANCING
            mat4 cinemaWorldMat = modelMatrix * instanceMatrix;
          #else
            mat4 cinemaWorldMat = modelMatrix;
          #endif

          // Pha lệch tự nhiên giữa từng gốc cây/cột cờ theo tọa độ thế giới
          vec3 instanceOriginW = cinemaWorldMat[3].xyz;
          float treePhase = instanceOriginW.x * 0.33 + instanceOriginW.z * 0.27;

          if (uSwayAmp > 0.0001) {
            ${
              isLantern
                ? /* glsl */ `
                // Đèn lồng sắt: Trụ đứng yên tuyệt đối, chỉ lắc rất nhẹ phần lồng đèn treo ở trên cao
                float lanternFactor = smoothstep(0.60, 0.98, cinemaH);
                float wTime = uTime * 2.15 + treePhase * 1.9;
                vec3 worldWind = vec3(
                  sin(wTime) * uSwayAmp * lanternFactor,
                  0.0,
                  cos(wTime * 0.84) * uSwayAmp * 0.7 * lanternFactor
                ) * uWindStrength;
                `
                : isClothBanner
                  ? /* glsl */ `
                  // Cờ Hiệu Làng Bắc Âu: Cột gỗ chân đế & xà ngang đỉnh giữ cứng, phần dải vải (0.16..0.88) lượn sóng gió 2 chiều
                  float clothMask = smoothstep(0.14, 0.34, cinemaH) * (1.0 - smoothstep(0.84, 0.96, cinemaH));
                  float clothWave = sin(uTime * 3.8 + treePhase * 2.1 - cinemaH * 5.6 + cinemaRootPos.x * 4.2);
                  float clothRip = cos(uTime * 6.4 + treePhase * 1.5 - cinemaH * 9.0);
                  vec3 worldWind = vec3(
                    (clothWave * 0.86 + clothRip * 0.24) * uSwayAmp * clothMask,
                    clothRip * uFlutterAmp * 0.25 * clothMask,
                    (clothWave * 0.50 - clothRip * 0.22) * uSwayAmp * clothMask
                  ) * uWindStrength;
                  `
                  : /* glsl */ `
                  // Cây Rừng 2 Chiều (Chiều cao Y × Bán kính tán XZ):
                  // 1) Gốc & thân dưới (cinemaH < 0.18) khóa cứng 100% vào mặt đất (không trượt gốc, không dẻo cao su!)
                  float trunkBend = pow(max(0.0, cinemaH - 0.08) / 0.92, 2.15);

                  // Sóng gió rừng chính lướt qua toàn cảnh theo hướng gió Bắc Âu (0.86, 0.50)
                  float gustTime = uTime * 1.18 - (instanceOriginW.x * 0.14 + instanceOriginW.z * 0.09);
                  float primaryWave = sin(gustTime + treePhase) * 0.68 + sin(gustTime * 2.13 + treePhase * 1.7) * 0.32;
                  float crossWave = cos(gustTime * 0.89 + treePhase * 2.3) * 0.36;

                  vec3 worldWind = vec3(
                    (primaryWave * 0.86 - crossWave * 0.50) * uSwayAmp * trunkBend,
                    -abs(primaryWave) * uSwayAmp * 0.09 * trunkBend,
                    (primaryWave * 0.50 + crossWave * 0.86) * uSwayAmp * trunkBend
                  );

                  // 2) Sóng gợn đầu mút tán thông (Branch-Tip Ripple): Chỉ tác động phần rìa tán xa trục thân (cinemaRad > 0.28)
                  float branchTipMask = smoothstep(0.24, 0.88, cinemaRad) * smoothstep(0.16, 0.55, cinemaH);
                  float flutter1 = sin(uTime * 2.95 + treePhase * 3.1 + cinemaRootPos.x * 3.4 + cinemaRootPos.y * 2.6);
                  float flutter2 = cos(uTime * 2.45 + treePhase * 2.4 + cinemaRootPos.z * 3.4 - cinemaRootPos.y * 2.1);

                  worldWind.x += flutter1 * uFlutterAmp * branchTipMask;
                  worldWind.y += (flutter1 * flutter2) * uFlutterAmp * 0.45 * branchTipMask;
                  worldWind.z += flutter2 * uFlutterAmp * branchTipMask;
                  worldWind *= uWindStrength;
                  `
            }

            // Đổi vector gió từ Mét Thế Giới (World Space) về Không Gian Cục Bộ (Local Space) chính xác cho mọi góc xoay & tỷ lệ Scale!
            vec3 mCol0 = cinemaWorldMat[0].xyz;
            vec3 mCol1 = cinemaWorldMat[1].xyz;
            vec3 mCol2 = cinemaWorldMat[2].xyz;
            transformed += vec3(
              dot(mCol0, worldWind) / max(1e-5, dot(mCol0, mCol0)),
              dot(mCol1, worldWind) / max(1e-5, dot(mCol1, mCol1)),
              dot(mCol2, worldWind) / max(1e-5, dot(mCol2, mCol2))
            );
          }

          vec4 cinemaWp = cinemaWorldMat * vec4(transformed, 1.0);
          vCinemaWorldPos = cinemaWp.xyz;
          vCinemaWorldNormal = normalize(mat3(cinemaWorldMat) * objectNormal + vec3(0.0, 1e-5, 0.0));
          `
        );

        // ==================== FRAGMENT SHADER: CỬA SỔ SÁNG ẤM / ĐÈN LỒNG / THAN HỒNG / SÂN ĐÁ ẨM ====================
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <common>",
          /* glsl */ `
          #include <common>
          uniform float uTime;
          uniform float uWarmGlowIntensity;
          uniform float uNightFactor;
          uniform vec3 uFireWorldPos;
          uniform vec3 uPhaseAccentColor;

          varying vec3 vCinemaWorldPos;
          varying vec3 vCinemaWorldNormal;
          varying float vCinemaNormH;
          varying float vCinemaRadial;
          `
        );

        if (isCobblestonePlaza) {
          // Mặt sân đá cổ ẩm sương đêm: Bắt ánh lửa cam lấp lánh ở vùng gần lửa + tối sâu dần ra viền ngoài sân!
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <roughnessmap_fragment>",
            /* glsl */ `
            #include <roughnessmap_fragment>
            float dampWave = sin(vCinemaWorldPos.x * 1.9 + cos(vCinemaWorldPos.z * 2.1)) * 0.5 + 0.5;
            float dampMicro = sin(vCinemaWorldPos.x * 5.7 - vCinemaWorldPos.z * 5.3) * 0.5 + 0.5;
            float wetness = smoothstep(0.32, 0.78, dampWave * 0.72 + dampMicro * 0.28);

            // Đá cuội ẩm có độ bóng Specular mướt mắt để phản chiếu ánh lửa cam bập bùng như Concept!
            roughnessFactor = mix(roughnessFactor * 0.88, 0.24, wetness * 0.72);

            float distFromFire = length(vCinemaWorldPos.xz - uFireWorldPos.xz);
            float radialVignette = mix(1.06, 0.52, smoothstep(1.8, 6.4, distFromFire));
            diffuseColor.rgb *= radialVignette * mix(1.0, 0.84, wetness * 0.5);
            `
          );

          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            /* glsl */ `
            #include <emissivemap_fragment>
            float fireDist = length(vCinemaWorldPos.xz - uFireWorldPos.xz);
            float fireFlicker = 0.9 + 0.1 * sin(uTime * 8.7 + fireDist * 2.0);
            float warmGroundBounce = exp(-fireDist * 0.46) * 0.34 * fireFlicker;
            totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.44, 0.12) * warmGroundBounce * uWarmGlowIntensity;
            `
          );
        }

        if (isWarmBuilding || isLantern || isCampfire) {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            /* glsl */ `
            #include <emissivemap_fragment>
            {
              vec3 bc = diffuseColor.rgb;
              float maxC = max(bc.r, max(bc.g, bc.b));
              float warmChroma = (bc.r - bc.b) / max(maxC, 0.001);
              float amberRatio = bc.g / max(bc.b, 0.002);
              float houseSeed = vCinemaWorldPos.x * 0.7 + vCinemaWorldPos.z * 0.5;
              float candleFlicker = 0.91 + 0.09 * sin(uTime * 5.8 + houseSeed * 3.0) * cos(uTime * 3.3 + houseSeed);

              ${
                isWarmBuilding
                  ? /* glsl */ `
                  // Lọc chính xác Ô Cửa Sổ Kính Đứng (loại trừ 100% mái rơm hướng lên trời worldNormal.y > 0.30 & vách vữa trắng ngà!)
                  float verticalPaneMask = 1.0 - smoothstep(0.18, 0.34, abs(vCinemaWorldNormal.y));
                  float windowHeightMask = smoothstep(0.10, 0.17, vCinemaNormH) * (1.0 - smoothstep(0.76, 0.88, vCinemaNormH));
                  float warmTexMask =
                    smoothstep(0.56, 0.78, warmChroma) *
                    smoothstep(1.55, 2.35, amberRatio) *
                    smoothstep(0.055, 0.16, bc.r);

                  float finalWindowGlow = verticalPaneMask * windowHeightMask * warmTexMask;
                  totalEmissiveRadiance += vec3(1.0, 0.55, 0.16) * finalWindowGlow * 2.85 * uWarmGlowIntensity * candleFlicker;
                  `
                  : isLantern
                    ? /* glsl */ `
                    // Bầu kính đèn lồng ở phần đỉnh cột đèn phát sáng vàng hổ phách rực rỡ
                    float lanternHeadMask = smoothstep(0.56, 0.70, vCinemaNormH);
                    float glassWarmMask = smoothstep(0.36, 0.65, warmChroma) * smoothstep(0.04, 0.14, bc.r);
                    totalEmissiveRadiance += vec3(1.0, 0.66, 0.22) * lanternHeadMask * glassWarmMask * 3.8 * uWarmGlowIntensity * candleFlicker;
                    `
                    : /* glsl */ `
                    // Khe than hồng rực đỏ nằm giữa lòng bếp đá cổ ngữ + Mạch Rune rìa đá đổi sắc theo Pha Đêm
                    float innerPitMask = 1.0 - smoothstep(0.42, 0.78, vCinemaRadial);
                    float emberMask = smoothstep(0.48, 0.76, warmChroma) * smoothstep(0.03, 0.14, bc.r);
                    float coalPulse = 0.84 + 0.16 * sin(uTime * 6.5 + vCinemaWorldPos.x * 8.0);
                    totalEmissiveRadiance += vec3(1.0, 0.30, 0.04) * innerPitMask * emberMask * 3.4 * coalPulse * uWarmGlowIntensity;

                    float outerStoneMask = smoothstep(0.54, 0.82, vCinemaRadial) * (1.0 - smoothstep(0.12, 0.62, vCinemaNormH));
                    float runeWave = 0.55 + 0.45 * sin(uTime * 2.9 + atan(vCinemaWorldPos.z - uFireWorldPos.z, vCinemaWorldPos.x - uFireWorldPos.x) * 4.0);
                    float runeCarveMask = smoothstep(0.08, 0.34, bc.b + bc.g * 0.5) * (1.0 - smoothstep(0.52, 0.85, maxC));
                    totalEmissiveRadiance += uPhaseAccentColor * outerStoneMask * runeCarveMask * runeWave * 0.85 * uNightFactor;
                    `
              }
            }
            `
          );
        }

        if (isCauldronBrew || isRunePulse) {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            /* glsl */ `
            #include <emissivemap_fragment>
            {
              vec3 bc = diffuseColor.rgb;
              ${
                isCauldronBrew
                  ? /* glsl */ `
                  // Nước thuốc giả kim sôi xoáy trên miệng vạc gang (0.60..0.88 chiều cao)
                  float brewHeightMask = smoothstep(0.58, 0.76, vCinemaNormH) * (1.0 - smoothstep(0.90, 0.99, vCinemaNormH));
                  float brewInnerMask = 1.0 - smoothstep(0.46, 0.82, vCinemaRadial);
                  float greenPurpleMask = smoothstep(0.06, 0.24, max(bc.g, bc.b));
                  float swirl = 0.5 + 0.5 * sin(uTime * 3.4 + vCinemaWorldPos.x * 9.0 + cos(uTime * 2.6 + vCinemaWorldPos.z * 9.0));
                  vec3 brewCol = mix(vec3(0.06, 0.82, 0.52), vec3(0.68, 0.28, 0.96), swirl);
                  totalEmissiveRadiance += brewCol * brewHeightMask * brewInnerMask * greenPurpleMask * 2.6;
                  `
                  : /* glsl */ `
                  // Trụ đá Obelisk cổ ngữ thở nhịp ánh sáng theo Pha của ván chơi
                  float runeBandMask = smoothstep(0.14, 0.28, vCinemaNormH) * (1.0 - smoothstep(0.88, 0.98, vCinemaNormH));
                  float cyanMask = smoothstep(0.08, 0.28, max(bc.b, bc.g) - bc.r * 0.45);
                  float pulse = 0.55 + 0.45 * sin(uTime * 2.6 - vCinemaNormH * 6.2);
                  totalEmissiveRadiance += uPhaseAccentColor * runeBandMask * max(0.18, cyanMask) * pulse * (0.65 + 0.85 * uNightFactor);
                  `
              }
            }
            `
          );
        }
      };

      mat.needsUpdate = true;
      processedMaterials.set(cacheId, mat);
      return mat;
    };

    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map(remapMaterial);
    } else {
      obj.material = remapMaterial(obj.material);
    }
  });
}
