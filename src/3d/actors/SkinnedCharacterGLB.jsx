import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  CHARACTER_SLOTS,
  ensureCharacterManifestLoaded,
  getCharacterGlbUrl,
  isNativeCharacterSlotAvailable,
  subscribeCharacterManifest,
} from "../config/characterManifest.js";
import { SEAT_TOP_Y } from "../utils/seatLayout.js";
import { RoleHandSocket3D, RoleHeadSocket3D } from "./RoleSocketAttachment3D.jsx";
import { CINEMATIC_SHARED_UNIFORMS } from "../shaders/villageCinematicShaders.js";

function enhanceCharacterMaterialPBR(mat) {
  if (!mat) return;
  if (typeof mat.envMapIntensity === "number") {
    mat.envMapIntensity = Math.max(mat.envMapIntensity, 1.32);
  }
  if (typeof mat.roughness === "number") {
    mat.roughness = Math.min(Math.max(mat.roughness, 0.34), 0.84);
  }
  if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
    mat.customProgramCacheKey = () => "masoi_char_dual_rim_v44";
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCharTime = CINEMATIC_SHARED_UNIFORMS.uTime;
      shader.uniforms.uCharFirePos = CINEMATIC_SHARED_UNIFORMS.uFireWorldPos;
      shader.uniforms.uCharWarmInt = CINEMATIC_SHARED_UNIFORMS.uWarmGlowIntensity;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vCharWorldPos;"
        )
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nvCharWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;"
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec3 vCharWorldPos;
uniform float uCharTime;
uniform vec3 uCharFirePos;
uniform float uCharWarmInt;`
        )
        .replace(
          "#include <dithering_fragment>",
          `// Dual-Rim Cinematic PBR: Viền Trăng Bạc tách khối lưng + Lửa Trại hắt ấm tự nhiên
vec3 charViewDir = normalize(vViewPosition);
float rimFresnel = pow(1.0 - clamp(abs(dot(normalize(normal), charViewDir)), 0.0, 1.0), 2.55);
vec3 moonRimCol = vec3(0.56, 0.76, 0.98) * rimFresnel * 0.28;
vec3 toFire = uCharFirePos - vCharWorldPos;
float fireDist = max(length(toFire), 0.8);
float fireAtten = clamp(1.0 / (0.32 + 0.085 * fireDist * fireDist), 0.0, 1.25);
float fireFlicker = 0.92 + 0.08 * sin(uCharTime * 7.4 + vCharWorldPos.x * 2.1);
vec3 warmBounce = vec3(1.0, 0.56, 0.22) * fireAtten * fireFlicker * uCharWarmInt * 0.14;
gl_FragColor.rgb += moonRimCol + warmBounce;
#include <dithering_fragment>`
        );
    };
  }
}

let sharedCharLoader = null;
function getCharacterGltfLoader() {
  if (!sharedCharLoader) {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);
    sharedCharLoader = loader;
  }
  return sharedCharLoader;
}

const characterAssetCache = new Map();

export function clearCharacterAssetCache() {
  characterAssetCache.clear();
}

// Bộ từ điển 20 xương chuẩn hóa tương thích Kép: Auto-Rig Nội Bộ / Tripo Studio Auto-Rig / Mixamo / Blender Rigify
const BONE_PATTERNS = {
  hips: /^(mixamorig:?hips|hips|pelvis|bip001_?pelvis|root_?hip|def[-_]spine)$/i,
  spine: /^(mixamorig:?spine|spine|spine_?01|def[-_]spine\.?001)$/i,
  chest: /^(mixamorig:?spine[12]|chest|upper_?chest|torso|spine_?02|def[-_]spine\.?00[23])$/i,
  neck: /^(mixamorig:?neck|neck|neck_?01|def[-_]spine\.?004)$/i,
  head: /^(mixamorig:?head|head|head_?01|def[-_]spine\.?00[56])$/i,
  jaw: /^(mixamorig:?jaw|jaw|chin|mandible|wolf_?jaw|def[-_]jaw)$/i,
  tail: /^(mixamorig:?tail1?|tail|tail_?01|wolf_?tail|def[-_]tail\.?001?)$/i,
  leftUpLeg: /^(mixamorig:?leftupleg|leftupleg|thigh[_.]?l|l[_.]?thigh|upleg[_.]?l|left_?thigh|def[-_]thigh\.l)$/i,
  rightUpLeg: /^(mixamorig:?rightupleg|rightupleg|thigh[_.]?r|r[_.]?thigh|upleg[_.]?r|right_?thigh|def[-_]thigh\.r)$/i,
  leftLeg: /^(mixamorig:?leftleg|leftleg|calf[_.]?l|shin[_.]?l|l[_.]?calf|lowerleg[_.]?l|left_?shin|def[-_]shin\.l)$/i,
  rightLeg: /^(mixamorig:?rightleg|rightleg|calf[_.]?r|shin[_.]?r|r[_.]?calf|lowerleg[_.]?r|right_?shin|def[-_]shin\.r)$/i,
  leftFoot: /^(mixamorig:?leftfoot|leftfoot|foot[_.]?l|l[_.]?foot|ankle[_.]?l|def[-_]foot\.l)$/i,
  rightFoot: /^(mixamorig:?rightfoot|rightfoot|foot[_.]?r|r[_.]?foot|ankle[_.]?r|def[-_]foot\.r)$/i,
  leftArm: /^(mixamorig:?leftarm|leftarm|upperarm[_.]?l|l[_.]?upperarm|arm[_.]?l|left_?upper_?arm|def[-_]upper_arm\.l)$/i,
  rightArm: /^(mixamorig:?rightarm|rightarm|upperarm[_.]?r|r[_.]?upperarm|arm[_.]?r|right_?upper_?arm|def[-_]upper_arm\.r)$/i,
  leftForeArm: /^(mixamorig:?leftforearm|leftforearm|lowerarm[_.]?l|forearm[_.]?l|l[_.]?forearm|def[-_]forearm\.l)$/i,
  rightForeArm: /^(mixamorig:?rightforearm|rightforearm|lowerarm[_.]?r|forearm[_.]?r|r[_.]?forearm|def[-_]forearm\.r)$/i,
  leftHand: /^(mixamorig:?lefthand|lefthand|hand[_.]?l|l[_.]?hand|wrist[_.]?l|def[-_]hand\.l)$/i,
  rightHand: /^(mixamorig:?righthand|righthand|hand[_.]?r|r[_.]?hand|wrist[_.]?r|def[-_]hand\.r)$/i,
};

const BONE_SUBSTRING_FALLBACKS = {
  hips: ["hips", "pelvis"],
  spine: ["spine"],
  chest: ["chest", "spine2", "spine1", "torso"],
  neck: ["neck"],
  head: ["head"],
  jaw: ["jaw", "mandible", "chin"],
  tail: ["tail"],
  leftUpLeg: ["leftupleg", "thigh_l", "thigh.l", "l_thigh", "upleg_l"],
  rightUpLeg: ["rightupleg", "thigh_r", "thigh.r", "r_thigh", "upleg_r"],
  leftLeg: ["leftleg", "calf_l", "calf.l", "shin_l", "shin.l", "l_calf"],
  rightLeg: ["rightleg", "calf_r", "calf.r", "shin_r", "shin.r", "r_calf"],
  leftFoot: ["leftfoot", "foot_l", "foot.l", "l_foot", "ankle_l"],
  rightFoot: ["rightfoot", "foot_r", "foot.r", "r_foot", "ankle_r"],
  leftArm: ["leftarm", "upperarm_l", "upperarm.l", "l_upperarm"],
  rightArm: ["rightarm", "upperarm_r", "upperarm.r", "r_upperarm"],
  leftForeArm: ["leftforearm", "forearm_l", "forearm.l", "lowerarm_l", "l_forearm"],
  rightForeArm: ["rightforearm", "forearm_r", "forearm.r", "lowerarm_r", "r_forearm"],
  leftHand: ["lefthand", "hand_l", "hand.l", "l_hand", "wrist_l"],
  rightHand: ["righthand", "hand_r", "hand.r", "r_hand", "wrist_r"],
};

const WORLD_X = new THREE.Vector3(1, 0, 0);
const WORLD_Y = new THREE.Vector3(0, 1, 0);
const WORLD_Z = new THREE.Vector3(0, 0, 1);

/**
 * Nhận diện xương & quy đổi Trục Thế Giới Nhân Vật (+X/+Y/+Z) sang Trục Cục Bộ Từng Xương
 * (Chống xoạc/gãy khớp 100% dù file đến từ Auto-Rig Nội Bộ hay Tripo Studio / Mixamo / Blender)
 */
function mapHumanoidBones(root) {
  const bones = {};
  const allBones = [];

  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (obj.isBone) {
      allBones.push(obj);
      const cleanName = (obj.name || "").replace(/^.*:/, "");
      Object.entries(BONE_PATTERNS).forEach(([slot, regex]) => {
        if (!bones[slot] && (regex.test(obj.name) || regex.test(cleanName))) {
          bones[slot] = obj;
        }
      });
    }
  });

  Object.entries(BONE_SUBSTRING_FALLBACKS).forEach(([slot, tokens]) => {
    if (bones[slot]) return;
    for (const token of tokens) {
      const found = allBones.find((b) => {
        const nm = (b.name || "").toLowerCase();
        if (slot === "spine" && bones.chest === b) return false;
        if (slot === "chest" && bones.spine === b) return false;
        return nm.includes(token);
      });
      if (found) {
        bones[slot] = found;
        break;
      }
    }
  });

  const restQuats = {};
  const restWorldPos = {};
  const localAxes = {};
  const tmpWQuat = new THREE.Quaternion();
  const tmpWPos = new THREE.Vector3();

  Object.entries(bones).forEach(([slot, bone]) => {
    if (!bone) return;
    restQuats[slot] = bone.quaternion.clone();
    bone.getWorldPosition(tmpWPos);
    restWorldPos[slot] = tmpWPos.clone();

    bone.getWorldQuaternion(tmpWQuat);
    const invWorldQuat = tmpWQuat.clone().invert();
    localAxes[slot] = {
      x: WORLD_X.clone().applyQuaternion(invWorldQuat).normalize(),
      y: WORLD_Y.clone().applyQuaternion(invWorldQuat).normalize(),
      z: WORLD_Z.clone().applyQuaternion(invWorldQuat).normalize(),
    };
  });

  // Tự động đo góc dang nách A-Pose/T-Pose gốc để khép tay tự nhiên xuống hông/đùi khi ngồi ghế!
  let adductLZ = 0;
  let adductRZ = 0;
  if (restWorldPos.leftArm && (restWorldPos.leftHand || restWorldPos.leftForeArm)) {
    const s = restWorldPos.leftArm;
    const w = restWorldPos.leftHand || restWorldPos.leftForeArm;
    const alpha = Math.atan2(Math.max(0, w.x - s.x), Math.max(0.05, s.y - w.y));
    adductLZ = -Math.max(0, alpha - 0.24) * 0.82;
  }
  if (restWorldPos.rightArm && (restWorldPos.rightHand || restWorldPos.rightForeArm)) {
    const s = restWorldPos.rightArm;
    const w = restWorldPos.rightHand || restWorldPos.rightForeArm;
    const alpha = Math.atan2(Math.max(0, s.x - w.x), Math.max(0.05, s.y - w.y));
    adductRZ = Math.max(0, alpha - 0.24) * 0.82;
  }

  const upLegRawY = restWorldPos.leftUpLeg?.y ?? restWorldPos.hips?.y ?? null;

  return {
    bones,
    restQuats,
    restWorldPos,
    localAxes,
    adductLZ,
    adductRZ,
    upLegRawY,
    boneCount: allBones.length,
    hasRig: Boolean(bones.hips || bones.spine || bones.head),
  };
}

export function useOptionalCharacterGlb(slotKey) {
  const [manifestTick, setManifestTick] = useState(0);
  const [templateEntry, setTemplateEntry] = useState(null);

  useEffect(() => {
    ensureCharacterManifestLoaded();
    return subscribeCharacterManifest(() => setManifestTick((n) => n + 1));
  }, []);

  const glbUrl = useMemo(() => {
    void manifestTick;
    return getCharacterGlbUrl(slotKey);
  }, [slotKey, manifestTick]);

  useEffect(() => {
    if (!glbUrl || !slotKey) {
      setTemplateEntry(null);
      return undefined;
    }
    const cacheKey = `${slotKey}::${glbUrl}`;
    if (characterAssetCache.has(cacheKey)) {
      setTemplateEntry(characterAssetCache.get(cacheKey));
      return undefined;
    }

    let cancelled = false;
    const slotMeta = CHARACTER_SLOTS[slotKey] || CHARACTER_SLOTS.villager_cloak;

    getCharacterGltfLoader().load(
      glbUrl,
      (gltf) => {
        if (cancelled || !gltf?.scene) return;
        const rawScene = gltf.scene;
        rawScene.updateMatrixWorld(true);
        // Cập nhật ma trận Skeleton trước khi tính Box3 để Meshopt-quantized SkinnedMesh trả đúng kích thước mét 1:1!
        rawScene.traverse((obj) => {
          if (obj.isSkinnedMesh && obj.skeleton) {
            obj.skeleton.update();
          }
        });

        const box = new THREE.Box3().setFromObject(rawScene);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const rawHeight = Math.max(size.y, 0.01);
        const targetStandH = slotMeta.standingHeight || 1.76;
        const normScale = targetStandH / rawHeight;
        const probeRig = mapHumanoidBones(rawScene);
        const upLegHeightMeters =
          typeof probeRig.upLegRawY === "number"
            ? (probeRig.upLegRawY - box.min.y) * normScale
            : targetStandH * 0.455;

        const entry = {
          scene: rawScene,
          animations: Array.isArray(gltf.animations) ? gltf.animations : [],
          hasRig: Boolean(probeRig.hasRig),
          boneCount: probeRig.boneCount || 0,
          normScale,
          minY: box.min.y,
          centerX: center.x,
          centerZ: center.z,
          standingHeight: targetStandH,
          upLegHeightMeters,
        };
        characterAssetCache.set(cacheKey, entry);
        setTemplateEntry(entry);
      },
      undefined,
      () => {
        if (!cancelled) setTemplateEntry(null);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [glbUrl, slotKey]);

  return templateEntry;
}

/**
 * Hiển thị Nhân Vật 3D (.GLB) — Hỗ Trợ Kép 18–20 Xương SkinnedMesh & Smart Mesh Fallback:
 * - Tự động bẻ khớp Đùi (-81°), Đầu gối (+85°), Khuỷu tay (-33°) ngồi khít mặt ghế sồi `SEAT_TOP_Y = 0.48m` (bàn chân chạm phẳng đá Y=0).
 * - Tự động đồng bộ Ma Trận Xương Bàn Tay Thật (`LeftHand` / `RightHand`) cho Khiên `#17`, Bình Độc / Tiên Dược Phù Thủy, Cầu Pha Lê Tiên Tri & Đuốc Phán Quyết!
 */
export default function SkinnedCharacterGLB({
  slotKey,
  templateEntry,
  tunicColor = "#7f2936",
  effectiveIsDead = false,
  isWolfVictim = false,
  recapPose = null,
  choreoPoseRef = null,
  isSleeping = false,
  isDefendant = false,
  isSpeaking = false,
  hasPointTarget = false,
  phase = "",
  hasWinner = false,
  lookTargetWorld = null,
  seatTransform,
  visibleCostumeRole = null,
  showTrialTorchSocket = false,
  seed = 0,
}) {
  const slotMeta = CHARACTER_SLOTS[slotKey] || CHARACTER_SLOTS.villager_cloak;
  const isUsingProxyBody = Boolean(slotMeta.proxySlot && !isNativeCharacterSlotAvailable(slotKey));
  const wrapperRef = useRef(null);
  const leftHandSocketRef = useRef(null);
  const rightHandSocketRef = useRef(null);
  const centerOrbSocketRef = useRef(null);
  const headSocketRef = useRef(null);

  const clonedBundle = useMemo(() => {
    if (!templateEntry?.scene || effectiveIsDead) return null;
    const clonedRoot = cloneSkeleton(templateEntry.scene);
    const rigInfo = mapHumanoidBones(clonedRoot);
    const emissiveMats = [];

    clonedRoot.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.frustumCulled = false;
        if (obj.material) {
          const mat = obj.material.clone();
          if (slotMeta.tintableCloak && tunicColor) {
            const tint = new THREE.Color(tunicColor);
            mat.color.lerp(tint, slotMeta.tintStrength ?? 0.24);
          }
          if (mat.emissive) {
            emissiveMats.push(mat);
          }
          enhanceCharacterMaterialPBR(mat);
          obj.material = mat;
        }
      }
    });

    // Hỗ trợ Kép (Hybrid V4.5):
    // - Nếu file .GLB đã gắn sẵn clip ngồi từ Blender/Mixamo (`Sit*`, >= 6 bone tracks): chạy AnimationMixer weight 1.0 mượt tự nhiên!
    // - Nếu là file Tripo gốc chưa có clip ngồi riêng: trộn nhẹ clip có sẵn (0.35) + kích hoạt Organic Teen Idle V4.5 chống khô cứng.
    let mixer = null;
    let sitAction = null;
    let hasNativeSitClip = false;
    if (templateEntry.animations && templateEntry.animations.length > 0) {
      mixer = new THREE.AnimationMixer(clonedRoot);
      const nativeSitClip = templateEntry.animations.find(
        (c) => /sit/i.test(c.name || "") && (c.tracks?.length || 0) >= 6 && c.duration > 0.25
      );
      if (nativeSitClip) {
        hasNativeSitClip = true;
        sitAction = mixer.clipAction(nativeSitClip);
        sitAction.setEffectiveWeight(1.0);
        sitAction.time = (Math.abs(seed) * 1.37) % Math.max(0.3, nativeSitClip.duration);
        sitAction.play();
      } else {
        const idleClip =
          templateEntry.animations.find((c) => /idle|stand|breath/i.test(c.name || "")) ||
          templateEntry.animations[0];
        if (idleClip) {
          const action = mixer.clipAction(idleClip);
          action.setEffectiveWeight(0.35);
          action.play();
        }
      }
    }

    if (rigInfo.hasRig && !hasNativeSitClip) {
      const { bones, restQuats, localAxes } = rigInfo;
      const qThighL = new THREE.Quaternion().setFromAxisAngle(localAxes.leftUpLeg?.x || WORLD_X, -1.42);
      const qThighR = new THREE.Quaternion().setFromAxisAngle(localAxes.rightUpLeg?.x || WORLD_X, -1.42);
      const qKneeL = new THREE.Quaternion().setFromAxisAngle(localAxes.leftLeg?.x || WORLD_X, 1.48);
      const qKneeR = new THREE.Quaternion().setFromAxisAngle(localAxes.rightLeg?.x || WORLD_X, 1.48);

      if (bones.leftUpLeg && restQuats.leftUpLeg) {
        bones.leftUpLeg.quaternion.copy(restQuats.leftUpLeg).multiply(qThighL);
      }
      if (bones.rightUpLeg && restQuats.rightUpLeg) {
        bones.rightUpLeg.quaternion.copy(restQuats.rightUpLeg).multiply(qThighR);
      }
      if (bones.leftLeg && restQuats.leftLeg) {
        bones.leftLeg.quaternion.copy(restQuats.leftLeg).multiply(qKneeL);
      }
      if (bones.rightLeg && restQuats.rightLeg) {
        bones.rightLeg.quaternion.copy(restQuats.rightLeg).multiply(qKneeR);
      }
    }

    return { clonedRoot, rigInfo, emissiveMats, mixer, sitAction, hasNativeSitClip };
  }, [templateEntry, slotMeta.tintableCloak, slotMeta.tintStrength, tunicColor, effectiveIsDead, seed]);

  useEffect(() => {
    return () => {
      if (clonedBundle?.mixer) {
        clonedBundle.mixer.stopAllAction();
      }
    };
  }, [clonedBundle]);

  const animStateRef = useRef({
    sitFactor: 1,
    spineX: 0,
    spineY: 0,
    headY: 0,
    headX: 0,
    armRX: -0.36,
    armLX: -0.36,
    armRZ: 0,
    armLZ: 0,
    foreArmRX: -0.56,
    foreArmLX: -0.56,
    thighLX: -1.42,
    thighRX: -1.42,
    kneeLX: 1.48,
    kneeRX: 1.48,
    footLX: -0.05,
    footRX: -0.05,
    jawOpen: 0,
    tailPitch: 0,
    tailYaw: 0,
    bodyPitchX: 0,
    bodyYawY: 0,
    bodyRollZ: 0,
  });

  const qTempX = useMemo(() => new THREE.Quaternion(), []);
  const qTempY = useMemo(() => new THREE.Quaternion(), []);
  const qTempZ = useMemo(() => new THREE.Quaternion(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);
  const invWrapperMat = useMemo(() => new THREE.Matrix4(), []);
  const tempBoneMat = useMemo(() => new THREE.Matrix4(), []);
  const tempPosL = useMemo(() => new THREE.Vector3(), []);
  const tempPosR = useMemo(() => new THREE.Vector3(), []);
  const tempQuat = useMemo(() => new THREE.Quaternion(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    if (!clonedBundle || effectiveIsDead) return;
    const { rigInfo, emissiveMats, mixer, sitAction, hasNativeSitClip, clonedRoot } = clonedBundle;
    const { bones, restQuats, localAxes, adductLZ, adductRZ } = rigInfo;
    const t = state.clock.elapsedTime;
    const breath = t * 2.1 + seed;
    const st = animStateRef.current;
    const choreo = choreoPoseRef?.current || null;
    const damp = Math.min(1, delta * (choreo ? 14.5 : 7.2));
    const effectiveTorch = Boolean(showTrialTorchSocket || choreo?.showTrialTorchOverride);

    // Chế độ Hybrid V4.5: Nếu file .GLB từ Blender có sẵn clip ngồi `Sit*`, giữ nguyên 100% khung xương Blender khi ngồi bình thường!
    const useNativeSitNow = Boolean(
      hasNativeSitClip && !choreo && !recapPose && !effectiveTorch && !hasPointTarget && !isSleeping
    );
    if (sitAction) {
      const nextWeight = THREE.MathUtils.lerp(
        sitAction.getEffectiveWeight(),
        useNativeSitNow ? 1.0 : 0.0,
        damp
      );
      sitAction.setEffectiveWeight(nextWeight);
    }
    if (mixer) mixer.update(Math.min(0.05, delta));

    // Cá tính dáng ngồi riêng cho từng ghế (Organic Teen Idle V4.5 — xóa bỏ 100% bệnh 12 tượng ma-nơ-canh ngồi giống hệt nhau!)
    const seatStyle = Math.abs(Math.round(seed * 13.7)) % 4;
    const slowDrift = Math.sin(t * 0.62 + seed * 2.3);
    const armBreathWave = Math.sin(breath) * 0.036 + Math.cos(t * 0.88 + seed * 1.9) * 0.024;

    // 0. Nội suy Động Khớp Đùi - Đầu Gối - Cổ Chân (Ngồi ghế sồi 0.48m <-> Đứng thẳng / Bật nhảy Parabol / Đi bộ Pháp trường)
    const goalSit = choreo ? choreo.sitFactor : 1.0;
    st.sitFactor = THREE.MathUtils.lerp(st.sitFactor, goalSit, damp);

    if (rigInfo.hasRig && !useNativeSitNow) {
      const idleFootTap =
        !choreo && !isSleeping
          ? Math.sin(t * (seatStyle === 1 ? 2.15 : 1.55) + seed * 1.7) * (seatStyle === 1 ? 0.042 : 0.024)
          : 0;
      const kneeSpreadVar = seatStyle === 1 ? 0.105 : seatStyle === 0 ? 0.088 : 0.072;
      const goalThighL = st.sitFactor * -1.42 + (choreo ? choreo.leftThighAddX : 0);
      const goalThighR = st.sitFactor * -1.42 + (choreo ? choreo.rightThighAddX : 0);
      const goalKneeL = st.sitFactor * 1.48 + (choreo ? choreo.leftKneeAddX : idleFootTap);
      const goalKneeR = st.sitFactor * 1.48 + (choreo ? choreo.rightKneeAddX : -idleFootTap * 0.85);
      const goalFootL = st.sitFactor * -0.06 + (choreo?.leftFootPitch || 0);
      const goalFootR = st.sitFactor * -0.06 + (choreo?.rightFootPitch || 0);

      st.thighLX = THREE.MathUtils.lerp(st.thighLX, goalThighL, damp);
      st.thighRX = THREE.MathUtils.lerp(st.thighRX, goalThighR, damp);
      st.kneeLX = THREE.MathUtils.lerp(st.kneeLX, goalKneeL, damp);
      st.kneeRX = THREE.MathUtils.lerp(st.kneeRX, goalKneeR, damp);
      st.footLX = THREE.MathUtils.lerp(st.footLX, goalFootL, damp);
      st.footRX = THREE.MathUtils.lerp(st.footRX, goalFootR, damp);

      if (bones.leftUpLeg && restQuats.leftUpLeg) {
        qTempZ.setFromAxisAngle(localAxes.leftUpLeg?.z || WORLD_Z, st.sitFactor * kneeSpreadVar);
        qTempX.setFromAxisAngle(localAxes.leftUpLeg?.x || WORLD_X, st.thighLX);
        bones.leftUpLeg.quaternion.copy(restQuats.leftUpLeg).multiply(qTempZ).multiply(qTempX);
      }
      if (bones.rightUpLeg && restQuats.rightUpLeg) {
        qTempZ.setFromAxisAngle(localAxes.rightUpLeg?.z || WORLD_Z, -st.sitFactor * kneeSpreadVar);
        qTempX.setFromAxisAngle(localAxes.rightUpLeg?.x || WORLD_X, st.thighRX);
        bones.rightUpLeg.quaternion.copy(restQuats.rightUpLeg).multiply(qTempZ).multiply(qTempX);
      }
      if (bones.leftLeg && restQuats.leftLeg) {
        qTempX.setFromAxisAngle(localAxes.leftLeg?.x || WORLD_X, st.kneeLX);
        bones.leftLeg.quaternion.copy(restQuats.leftLeg).multiply(qTempX);
      }
      if (bones.rightLeg && restQuats.rightLeg) {
        qTempX.setFromAxisAngle(localAxes.rightLeg?.x || WORLD_X, st.kneeRX);
        bones.rightLeg.quaternion.copy(restQuats.rightLeg).multiply(qTempX);
      }
      if (bones.leftFoot && restQuats.leftFoot) {
        qTempX.setFromAxisAngle(localAxes.leftFoot?.x || WORLD_X, st.footLX);
        bones.leftFoot.quaternion.copy(restQuats.leftFoot).multiply(qTempX);
      }
      if (bones.rightFoot && restQuats.rightFoot) {
        qTempX.setFromAxisAngle(localAxes.rightFoot?.x || WORLD_X, st.footRX);
        bones.rightFoot.quaternion.copy(restQuats.rightFoot).multiply(qTempX);
      }
    }

    // 1. Xương Sống & Lồng Ngực (Spine + Chest chia đôi độ uốn tự nhiên + Dáng nghiêng cá tính từng ghế)
    const styleLeanOffset =
      seatStyle === 0 ? 0.068 : seatStyle === 1 ? -0.024 : seatStyle === 2 ? 0.042 : 0.025;
    const styleTwistOffset =
      (seatStyle === 1 ? 0.042 : seatStyle === 2 ? -0.036 : 0) + slowDrift * 0.028;
    let goalSpineX = Math.sin(breath) * 0.035 + st.sitFactor * styleLeanOffset;
    let goalSpineY = styleTwistOffset;
    if (choreo) {
      goalSpineX = choreo.spineLeanX;
      goalSpineY = choreo.spineTwistY || 0;
    } else if (recapPose === "castLunge") goalSpineX = 0.28 + Math.sin(t * 7.5) * 0.06;
    else if (recapPose === "hitRecoil") goalSpineX = -0.26 + Math.sin(t * 18) * 0.05;
    else if (recapPose === "cheer") goalSpineX = -0.08 + Math.sin(t * 6.5) * 0.05;
    else if (isSleeping) {
      goalSpineX = 0.17 + Math.sin(t * 1.1 + seed) * 0.02;
      goalSpineY = 0;
    } else if (isDefendant || recapPose === "defend") goalSpineX = -0.05;

    // 2. Xương Đầu (Head LookAt theo người đang bật Mic & Đảo mắt quan sát tự nhiên quanh lửa trại)
    const curiousGlance =
      Math.sin(t * 0.68 + seed * 1.9) * 0.16 + Math.sin(t * 1.45 + seed * 3.1) * 0.05;
    let goalHeadY = useNativeSitNow ? 0 : curiousGlance;
    let goalHeadX = useNativeSitNow ? 0 : Math.cos(t * 0.95 + seed) * 0.045;

    if (choreo) {
      goalHeadX = choreo.headPitchX || 0;
      goalHeadY = choreo.headYawY || 0;
    } else if (recapPose === "hitRecoil") {
      goalHeadX = -0.22;
      goalHeadY = Math.sin(t * 22) * 0.18;
    } else if (recapPose === "cheer") {
      goalHeadX = -0.14 + Math.sin(t * 6) * 0.08;
      goalHeadY = Math.sin(t * 3.5 + seed) * 0.22;
    } else if (isSleeping) {
      goalHeadX = 0.29 + Math.sin(t * 1.2 + seed) * 0.03;
      goalHeadY = Math.sin(t * 0.6 + seed) * 0.05;
    } else if (isSpeaking) {
      goalHeadX = Math.sin(t * 11) * 0.09;
      goalHeadY = Math.cos(t * 6.5) * 0.14;
    } else if (lookTargetWorld && seatTransform) {
      const dx = lookTargetWorld.x - seatTransform.x;
      const dz = lookTargetWorld.z - seatTransform.z;
      if (Math.hypot(dx, dz) > 0.2) {
        const worldAngle = Math.atan2(dx, dz);
        let relYaw = worldAngle - seatTransform.facingYaw;
        while (relYaw > Math.PI) relYaw -= Math.PI * 2;
        while (relYaw < -Math.PI) relYaw += Math.PI * 2;
        goalHeadY = THREE.MathUtils.clamp(relYaw * 0.68, -0.82, 0.82);
        if (!choreo) goalSpineY = THREE.MathUtils.clamp(relYaw * 0.22, -0.28, 0.28);
      }
    }

    st.spineX = THREE.MathUtils.lerp(st.spineX, goalSpineX, damp);
    st.spineY = THREE.MathUtils.lerp(st.spineY, goalSpineY, damp);
    st.headY = THREE.MathUtils.lerp(st.headY, goalHeadY, damp);
    st.headX = THREE.MathUtils.lerp(st.headX, goalHeadX, damp);

    if (rigInfo.hasRig) {
      if (!useNativeSitNow) {
        const hasBothSpineAndChest = Boolean(bones.spine && bones.chest && bones.spine !== bones.chest);
        const spineShare = hasBothSpineAndChest ? 0.52 : 1.0;

        if (bones.spine && restQuats.spine) {
          qTempY.setFromAxisAngle(localAxes.spine?.y || WORLD_Y, st.spineY * spineShare);
          qTempX.setFromAxisAngle(localAxes.spine?.x || WORLD_X, st.spineX * spineShare);
          bones.spine.quaternion.copy(restQuats.spine).multiply(qTempY).multiply(qTempX);
        }
        if (hasBothSpineAndChest && bones.chest && restQuats.chest) {
          const chestBreath = Math.sin(breath) * 0.024;
          qTempY.setFromAxisAngle(localAxes.chest?.y || WORLD_Y, st.spineY * 0.48);
          qTempX.setFromAxisAngle(localAxes.chest?.x || WORLD_X, st.spineX * 0.48 + chestBreath);
          bones.chest.quaternion.copy(restQuats.chest).multiply(qTempY).multiply(qTempX);
        }
      }

      const headBone = bones.head || bones.neck;
      const headSlot = bones.head ? "head" : "neck";
      if (headBone && restQuats[headSlot]) {
        qTempY.setFromAxisAngle(localAxes[headSlot]?.y || WORLD_Y, st.headY);
        qTempX.setFromAxisAngle(localAxes[headSlot]?.x || WORLD_X, st.headX);
        if (useNativeSitNow) {
          // Cộng dồn mượt góc quay đầu LookAt lên trên AnimationClip gốc của Blender!
          headBone.quaternion.multiply(qTempY).multiply(qTempX);
        } else {
          headBone.quaternion.copy(restQuats[headSlot]).multiply(qTempY).multiply(qTempX);
        }
      }
    }

    // 3. Cánh Tay Trên + Cẳng Tay + Cổ Tay Sống Động (Organic Teen Idle V4.5 — bất đối xứng tự nhiên + nhịp thở!)
    const idleArmRBase =
      seatStyle === 2 ? -0.52 : seatStyle === 0 ? -0.44 : seatStyle === 3 ? -0.4 : -0.35;
    const idleArmLBase =
      visibleCostumeRole === "guard"
        ? -0.62
        : seatStyle === 1
          ? -0.46
          : seatStyle === 0
            ? -0.42
            : -0.36;
    const idleForeRBase =
      seatStyle === 2 ? -0.88 : seatStyle === 0 ? -0.68 : seatStyle === 3 ? -0.64 : -0.56;
    const idleForeLBase =
      visibleCostumeRole === "guard"
        ? -0.88
        : seatStyle === 1
          ? -0.74
          : seatStyle === 3
            ? -0.64
            : -0.58;

    let goalArmR = idleArmRBase + armBreathWave;
    let goalArmL = idleArmLBase + armBreathWave * 0.92;
    let goalSpreadR = (seatStyle === 3 ? 0.065 : 0.03) + slowDrift * 0.018;
    let goalSpreadL = (seatStyle === 3 ? -0.065 : -0.03) - slowDrift * 0.018;
    let goalForeR = idleForeRBase + Math.sin(breath + 0.6) * 0.042;
    let goalForeL = idleForeLBase + Math.cos(breath + 0.4) * 0.042;

    if (choreo) {
      goalArmR = choreo.rightArmPitchX * 0.88;
      goalArmL = choreo.leftArmPitchX * 0.88;
      goalSpreadR = choreo.rightArmSpreadZ || 0;
      goalSpreadL = choreo.leftArmSpreadZ || 0;
      goalForeR = choreo.rightForeArmBend ?? -0.56;
      goalForeL = choreo.leftForeArmBend ?? -0.56;
    } else if (recapPose === "cheer") {
      goalArmR = -1.95 + Math.sin(t * 7 + seed) * 0.2;
      goalArmL = -1.95 + Math.cos(t * 7 + seed) * 0.2;
      goalSpreadR = -0.32;
      goalSpreadL = 0.32;
      goalForeR = -0.42;
      goalForeL = -0.42;
    } else if (recapPose === "castLunge") {
      goalArmR = -1.25 + Math.sin(t * 10) * 0.22;
      goalArmL = -1.05 + Math.cos(t * 10) * 0.18;
      goalForeR = -0.35;
      goalForeL = -0.65;
    } else if (recapPose === "hitRecoil") {
      goalArmR = -0.95;
      goalArmL = -0.95;
      goalForeR = -1.18;
      goalForeL = -1.18;
    } else if (effectiveTorch) {
      goalArmR = -1.55 + Math.sin(t * 4.2 + seed) * 0.08;
      goalForeR = -0.35;
    } else if (hasPointTarget && (phase === "day_nominate" || phase === "day_defense")) {
      goalArmR = -1.25;
      goalForeR = -0.14;
      goalArmL = -0.32;
      goalForeL = -0.58;
    } else if (isSpeaking || recapPose === "defend") {
      goalArmR = -0.64 + Math.sin(t * 8.5 + seed) * 0.26;
      goalArmL = -0.64 + Math.cos(t * 7.8 + seed) * 0.26;
      goalForeR = -0.78 + Math.cos(t * 8.5 + seed) * 0.2;
      goalForeL = -0.78 + Math.sin(t * 7.8 + seed) * 0.2;
    } else if (
      (slotKey === "wolf" || slotKey === "wolf_alt" || slotKey === "alpha_wolf") &&
      (phase === "night_wolf" || hasWinner)
    ) {
      goalArmR = -0.68 + Math.sin(t * 3.8 + seed) * 0.12;
      goalArmL = -0.68 + Math.cos(t * 3.8 + seed) * 0.12;
      goalForeR = -0.76;
      goalForeL = -0.76;
    } else if (visibleCostumeRole === "guard" && phase === "night_guard") {
      goalArmL = -1.08 + Math.sin(t * 3.2 + seed) * 0.08;
      goalForeL = -1.05;
    } else if (visibleCostumeRole === "seer" && phase === "night_seer") {
      goalArmL = -0.88;
      goalArmR = -0.88;
      goalForeL = -0.85;
      goalForeR = -0.85;
    } else if (visibleCostumeRole === "hunter") {
      goalArmR = -0.72 + armBreathWave;
      goalForeR = -0.62;
    } else if (visibleCostumeRole === "cupid") {
      goalArmL = -0.75 + armBreathWave;
      goalForeL = -0.58;
    } else if (visibleCostumeRole === "mayor") {
      goalArmR = -0.78 + armBreathWave;
      goalForeR = -0.52;
    }

    st.armRX = THREE.MathUtils.lerp(st.armRX, goalArmR, damp);
    st.armLX = THREE.MathUtils.lerp(st.armLX, goalArmL, damp);
    st.armRZ = THREE.MathUtils.lerp(st.armRZ, goalSpreadR, damp);
    st.armLZ = THREE.MathUtils.lerp(st.armLZ, goalSpreadL, damp);
    st.foreArmRX = THREE.MathUtils.lerp(st.foreArmRX, goalForeR, damp);
    st.foreArmLX = THREE.MathUtils.lerp(st.foreArmLX, goalForeL, damp);

    if (rigInfo.hasRig && !useNativeSitNow) {
      if (bones.rightArm && restQuats.rightArm) {
        qTempZ.setFromAxisAngle(localAxes.rightArm?.z || WORLD_Z, adductRZ + st.armRZ);
        qTempX.setFromAxisAngle(localAxes.rightArm?.x || WORLD_X, st.armRX);
        bones.rightArm.quaternion.copy(restQuats.rightArm).multiply(qTempZ).multiply(qTempX);
      }
      if (bones.leftArm && restQuats.leftArm) {
        qTempZ.setFromAxisAngle(localAxes.leftArm?.z || WORLD_Z, adductLZ + st.armLZ);
        qTempX.setFromAxisAngle(localAxes.leftArm?.x || WORLD_X, st.armLX);
        bones.leftArm.quaternion.copy(restQuats.leftArm).multiply(qTempZ).multiply(qTempX);
      }
      if (bones.rightForeArm && restQuats.rightForeArm) {
        qTempX.setFromAxisAngle(localAxes.rightForeArm?.x || WORLD_X, st.foreArmRX);
        bones.rightForeArm.quaternion.copy(restQuats.rightForeArm).multiply(qTempX);
      }
      if (bones.leftForeArm && restQuats.leftForeArm) {
        qTempX.setFromAxisAngle(localAxes.leftForeArm?.x || WORLD_X, st.foreArmLX);
        bones.leftForeArm.quaternion.copy(restQuats.leftForeArm).multiply(qTempX);
      }
      // Thả lỏng cổ tay nhẹ theo nhịp thở để bàn tay không cứng đờ như tượng gỗ
      const wristRelax = Math.sin(t * 1.35 + seed * 2.4) * 0.055;
      if (bones.rightHand && restQuats.rightHand && !effectiveTorch) {
        qTempX.setFromAxisAngle(localAxes.rightHand?.x || WORLD_X, 0.08 + wristRelax);
        bones.rightHand.quaternion.copy(restQuats.rightHand).multiply(qTempX);
      }
      if (bones.leftHand && restQuats.leftHand) {
        qTempX.setFromAxisAngle(localAxes.leftHand?.x || WORLD_X, 0.08 - wristRelax);
        bones.leftHand.quaternion.copy(restQuats.leftHand).multiply(qTempX);
      }

      // 3B. Xương Hàm Nanh & Đuôi Riêng Cho Ma Sói (#07 & #07B)
      const goalJaw =
        choreo?.jawOpen ??
        (isSpeaking ? Math.abs(Math.sin(t * 14)) * 0.24 : phase === "night_wolf" ? 0.14 : 0);
      const goalTailP = choreo?.tailPitch ?? Math.sin(t * 1.9 + seed) * 0.08;
      const goalTailY = choreo?.tailYaw ?? Math.sin(t * 2.5 + seed) * 0.16;

      st.jawOpen = THREE.MathUtils.lerp(st.jawOpen, goalJaw, damp);
      st.tailPitch = THREE.MathUtils.lerp(st.tailPitch, goalTailP, damp);
      st.tailYaw = THREE.MathUtils.lerp(st.tailYaw, goalTailY, damp);

      if (bones.jaw && restQuats.jaw) {
        qTempX.setFromAxisAngle(localAxes.jaw?.x || WORLD_X, st.jawOpen);
        bones.jaw.quaternion.copy(restQuats.jaw).multiply(qTempX);
      }
      if (bones.tail && restQuats.tail) {
        qTempY.setFromAxisAngle(localAxes.tail?.y || WORLD_Y, st.tailYaw);
        qTempX.setFromAxisAngle(localAxes.tail?.x || WORLD_X, st.tailPitch);
        bones.tail.quaternion.copy(restQuats.tail).multiply(qTempY).multiply(qTempX);
      }
    }

    // 4. Hiệu ứng phát sáng cơ thể theo nhịp Climax (Sói đỏ, Bảo Vệ lam, Cứng Cỏi cam, Chán Đời tím)
    if (emissiveMats.length > 0) {
      const hex = choreo?.bodyEmissiveHex || (recapPose === "hitRecoil" || isWolfVictim ? "#ef4444" : null);
      const intensity = choreo?.bodyEmissiveHex
        ? choreo.bodyEmissiveIntensity || 0
        : recapPose === "hitRecoil"
          ? 0.55
          : isWolfVictim
            ? 0.38
            : 0;
      if (hex && intensity > 0.01) {
        tempColor.set(hex);
        for (let i = 0; i < emissiveMats.length; i++) {
          emissiveMats[i].emissive.copy(tempColor);
          emissiveMats[i].emissiveIntensity = intensity;
        }
      } else {
        for (let i = 0; i < emissiveMats.length; i++) {
          emissiveMats[i].emissiveIntensity = 0;
        }
      }
    }

    // 5. Cao độ gốc & Đồng bộ Đạo Cụ Bám Theo Xương Bàn Tay Thật (`LeftHand` / `RightHand`)
    if (wrapperRef.current) {
      if (rigInfo.hasRig) {
        const upLegH = templateEntry.upLegHeightMeters || templateEntry.standingHeight * 0.455;
        const seatRestY = SEAT_TOP_Y - (upLegH - 0.055) + (slotMeta.seatHipOffsetY || 0.02);
        const standRestY = 0;
        const bounceY = choreo
          ? 0
          : recapPose === "cheer"
            ? Math.abs(Math.sin(t * 5.2 + seed)) * 0.05
            : Math.sin(breath) * 0.005;
        const hitFlash = !choreo && (recapPose === "hitRecoil" || isWolfVictim);
        wrapperRef.current.position.y = THREE.MathUtils.lerp(standRestY, seatRestY, st.sitFactor) + bounceY;
        wrapperRef.current.position.z =
          (slotMeta.seatForwardOffsetZ || 0.04) * st.sitFactor +
          (!choreo && recapPose === "castLunge" ? 0.12 : hitFlash ? -0.05 : 0);
        wrapperRef.current.rotation.set(0, 0, 0);

        // Đồng bộ chính xác Ma Trận Xương Bàn Tay Thực Tế (0 cấp phát bộ nhớ)
        wrapperRef.current.updateMatrixWorld(true);
        clonedRoot.updateMatrixWorld(true);
        invWrapperMat.copy(wrapperRef.current.matrixWorld).invert();

        const leftBone = bones.leftHand || bones.leftForeArm;
        const rightBone = bones.rightHand || bones.rightForeArm;

        if (leftHandSocketRef.current) {
          leftHandSocketRef.current.visible = !choreo?.hideLeftHandProp;
          if (leftBone) {
            tempBoneMat.multiplyMatrices(invWrapperMat, leftBone.matrixWorld);
            tempBoneMat.decompose(tempPosL, tempQuat, tempScale);
            leftHandSocketRef.current.position.copy(tempPosL);
            leftHandSocketRef.current.quaternion.copy(tempQuat);
          }
        }

        if (rightHandSocketRef.current) {
          rightHandSocketRef.current.visible = !choreo?.hideRightHandProp;
          if (rightBone) {
            tempBoneMat.multiplyMatrices(invWrapperMat, rightBone.matrixWorld);
            tempBoneMat.decompose(tempPosR, tempQuat, tempScale);
            rightHandSocketRef.current.position.copy(tempPosR);
            rightHandSocketRef.current.quaternion.copy(tempQuat);
          }
        }

        if (centerOrbSocketRef.current && leftBone && rightBone) {
          tempBoneMat.multiplyMatrices(invWrapperMat, leftBone.matrixWorld);
          tempBoneMat.decompose(tempPosL, tempQuat, tempScale);
          tempBoneMat.multiplyMatrices(invWrapperMat, rightBone.matrixWorld);
          tempBoneMat.decompose(tempPosR, tempQuat, tempScale);
          centerOrbSocketRef.current.position
            .addVectors(tempPosL, tempPosR)
            .multiplyScalar(0.5);
          centerOrbSocketRef.current.position.y += 0.1 + Math.sin(t * 2.8 + seed) * 0.025;
          centerOrbSocketRef.current.position.z += 0.12;
          centerOrbSocketRef.current.rotation.y = t * 1.4;
        }

        const headBone = bones.head || bones.neck;
        if (headSocketRef.current && headBone) {
          tempBoneMat.multiplyMatrices(invWrapperMat, headBone.matrixWorld);
          tempBoneMat.decompose(tempPosL, tempQuat, tempScale);
          headSocketRef.current.position.copy(tempPosL);
          headSocketRef.current.quaternion.copy(tempQuat);
        }
      } else {
        // Fallback cho Smart Mesh Tĩnh nếu có file chưa rig
        const isWalkingStride =
          Boolean(choreo) &&
          st.sitFactor < 0.3 &&
          Math.abs(choreo?.leftThighAddX || 0) > 0.06 &&
          (choreo?.localY || 0) < 0.08;
        const strideBobY = isWalkingStride ? Math.abs(Math.sin(t * 9.5 + seed)) * 0.042 : 0;
        const idleBreathY = choreo
          ? strideBobY
          : recapPose === "cheer"
            ? Math.abs(Math.sin(t * 5.4 + seed)) * 0.055
            : Math.max(0, Math.sin(breath)) * 0.01;
        const hitFlash = !choreo && (recapPose === "hitRecoil" || isWolfVictim);
        const baseStandZ = (slotMeta.staticStandZ ?? 0.12) * st.sitFactor;

        wrapperRef.current.position.y = idleBreathY;
        wrapperRef.current.position.z =
          baseStandZ + (!choreo && recapPose === "castLunge" ? 0.14 : hitFlash ? -0.07 : 0);

        const goalPitchX = choreo
          ? THREE.MathUtils.clamp(st.spineX * 0.45, -0.34, 0.42)
          : isSleeping
            ? 0.075
            : THREE.MathUtils.clamp(st.spineX * 0.42, -0.22, 0.24);
        const goalYawY = THREE.MathUtils.clamp(
          st.spineY * 0.62 + st.headY * (choreo ? 0.28 : 0.44),
          -0.52,
          0.52
        );
        const goalRollZ = isWalkingStride
          ? Math.sin(t * 9.5 + seed) * 0.032
          : isSpeaking
            ? Math.sin(t * 6.4 + seed) * 0.026
            : Math.sin(breath * 0.5) * 0.01;

        st.bodyPitchX = THREE.MathUtils.lerp(st.bodyPitchX, goalPitchX, damp);
        st.bodyYawY = THREE.MathUtils.lerp(st.bodyYawY, goalYawY, damp);
        st.bodyRollZ = THREE.MathUtils.lerp(st.bodyRollZ, goalRollZ, damp);
        wrapperRef.current.rotation.set(st.bodyPitchX, st.bodyYawY, st.bodyRollZ);

        if (leftHandSocketRef.current) {
          leftHandSocketRef.current.rotation.x = st.armLX * 0.65;
          leftHandSocketRef.current.rotation.z = st.armLZ * 0.5;
        }
        if (rightHandSocketRef.current) {
          rightHandSocketRef.current.rotation.x = st.armRX * 0.72;
          rightHandSocketRef.current.rotation.z = st.armRZ * 0.5;
        }
      }
    }
  });

  if (!clonedBundle || !templateEntry || effectiveIsDead) return null;

  const { normScale, minY, centerX, centerZ, standingHeight, upLegHeightMeters } = templateEntry;
  const hasRig = clonedBundle.rigInfo.hasRig;
  const upLegH = upLegHeightMeters || standingHeight * 0.455;
  const baseSeatY = hasRig
    ? SEAT_TOP_Y - (upLegH - 0.055) + (slotMeta.seatHipOffsetY || 0.02)
    : 0;
  const basePosZ = hasRig
    ? slotMeta.seatForwardOffsetZ || 0.04
    : slotMeta.staticStandZ ?? 0.12;
  const shoulderY = hasRig ? standingHeight * 0.42 : standingHeight * 0.68;

  const showGuardShield = visibleCostumeRole === "guard";
  const showWitchFlasks = visibleCostumeRole === "witch";
  const showSeerOrb = visibleCostumeRole === "seer";
  const showCupidBow = visibleCostumeRole === "cupid";
  const showHunterCrossbow = visibleCostumeRole === "hunter";
  const showMayorScepter = visibleCostumeRole === "mayor";
  const proxyHeadRoleKey = isUsingProxyBody ? visibleCostumeRole || slotKey : null;

  return (
    <group ref={wrapperRef} position={[0, baseSeatY, basePosZ]}>
      <primitive
        object={clonedBundle.clonedRoot}
        scale={[normScale, normScale, normScale]}
        position={[-centerX * normScale, -minY * normScale, -centerZ * normScale]}
      />

      {/* KHE ĐẦU THÔNG MINH (CHỈ BẬT KHI DÙNG PROXY MA-NƠ-CANH — TỰ ẨN 100% NGAY KHI LẮP .GLB THẬT!) */}
      {proxyHeadRoleKey && (
        <group ref={headSocketRef} position={[0, standingHeight * 0.72, 0.02]}>
          <group position={[0, -0.1, 0]}>
            <RoleHeadSocket3D roleKey={proxyHeadRoleKey} />
          </group>
        </group>
      )}

      {/* KHE BÀN TAY TRÁI THẬT: Khiên Bảo Vệ #17 (`guard`), Bình Tiên Dược (`witch`), Cung Pha Lê #26 (`cupid`) */}
      {(showGuardShield || showWitchFlasks || showCupidBow) && (
        <group ref={leftHandSocketRef} position={[0.26, shoulderY, 0.1]}>
          <RoleHandSocket3D
            roleKey={visibleCostumeRole}
            side="left"
            boneAttached={hasRig}
          />
        </group>
      )}

      {/* KHE BÀN TAY PHẢI THẬT: Đuốc, Bình Độc (`witch`), Nỏ Bạc #25 (`hunter`), Quyền Trượng #27 (`mayor`) */}
      {(showTrialTorchSocket || showWitchFlasks || showHunterCrossbow || showMayorScepter) && (
        <group ref={rightHandSocketRef} position={[-0.28, shoulderY, 0.08]}>
          <RoleHandSocket3D
            roleKey={visibleCostumeRole}
            side="right"
            showTrialTorch={showTrialTorchSocket}
            boneAttached={hasRig}
          />
        </group>
      )}

      {/* KHE QUẢ CẦU PHA LÊ GIỮA HAI BÀN TAY TIÊN TRI (`seer`) */}
      {showSeerOrb && (
        <group ref={centerOrbSocketRef} position={[0, shoulderY, 0.26]}>
          <RoleHandSocket3D roleKey="seer" side="center" boneAttached={hasRig} />
        </group>
      )}
    </group>
  );
}
