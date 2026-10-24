import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  CHARACTER_SLOTS,
  ensureCharacterManifestLoaded,
  getCharacterGlbUrl,
  subscribeCharacterManifest,
} from "../config/characterManifest.js";
import { SEAT_TOP_Y } from "../utils/seatLayout.js";

let sharedCharLoader = null;
function getCharacterGltfLoader() {
  if (!sharedCharLoader) {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
    loader.setDRACOLoader(draco);
    sharedCharLoader = loader;
  }
  return sharedCharLoader;
}

const characterAssetCache = new Map();

// Bộ từ điển nhận diện xương tự động tương thích Tripo Auto-Rig / Mixamo / Blender Rigify / GLTF Humanoid
const BONE_PATTERNS = {
  hips: /^(mixamorig:?hips|hips|pelvis|bip001_?pelvis|root_?hip|def[-_]spine)$/i,
  spine: /^(mixamorig:?spine1?|spine0?1?|chest|torso|upper_?body|def[-_]spine\.?00[12])$/i,
  neck: /^(mixamorig:?neck|neck|neck_?01|def[-_]spine\.?004)$/i,
  head: /^(mixamorig:?head|head|head_?01|def[-_]spine\.?00[56])$/i,
  leftUpLeg: /^(mixamorig:?leftupleg|leftupleg|thigh[_.]?l|l[_.]?thigh|upleg[_.]?l|left_?thigh|def[-_]thigh\.l)$/i,
  rightUpLeg: /^(mixamorig:?rightupleg|rightupleg|thigh[_.]?r|r[_.]?thigh|upleg[_.]?r|right_?thigh|def[-_]thigh\.r)$/i,
  leftLeg: /^(mixamorig:?leftleg|leftleg|calf[_.]?l|shin[_.]?l|l[_.]?calf|lowerleg[_.]?l|left_?shin|def[-_]shin\.l)$/i,
  rightLeg: /^(mixamorig:?rightleg|rightleg|calf[_.]?r|shin[_.]?r|r[_.]?calf|lowerleg[_.]?r|right_?shin|def[-_]shin\.r)$/i,
  leftArm: /^(mixamorig:?leftarm|leftarm|upperarm[_.]?l|l[_.]?upperarm|arm[_.]?l|left_?upper_?arm|def[-_]upper_arm\.l)$/i,
  rightArm: /^(mixamorig:?rightarm|rightarm|upperarm[_.]?r|r[_.]?upperarm|arm[_.]?r|right_?upper_?arm|def[-_]upper_arm\.r)$/i,
  leftForeArm: /^(mixamorig:?leftforearm|leftforearm|lowerarm[_.]?l|forearm[_.]?l|l[_.]?forearm|def[-_]forearm\.l)$/i,
  rightForeArm: /^(mixamorig:?rightforearm|rightforearm|lowerarm[_.]?r|forearm[_.]?r|r[_.]?forearm|def[-_]forearm\.r)$/i,
};

const BONE_SUBSTRING_FALLBACKS = {
  hips: ["hips", "pelvis"],
  spine: ["spine1", "spine", "chest"],
  neck: ["neck"],
  head: ["head"],
  leftUpLeg: ["leftupleg", "thigh_l", "thigh.l", "l_thigh", "upleg_l"],
  rightUpLeg: ["rightupleg", "thigh_r", "thigh.r", "r_thigh", "upleg_r"],
  leftLeg: ["leftleg", "calf_l", "calf.l", "shin_l", "shin.l", "l_calf"],
  rightLeg: ["rightleg", "calf_r", "calf.r", "shin_r", "shin.r", "r_calf"],
  leftArm: ["leftarm", "upperarm_l", "upperarm.l", "l_upperarm"],
  rightArm: ["rightarm", "upperarm_r", "upperarm.r", "r_upperarm"],
  leftForeArm: ["leftforearm", "forearm_l", "forearm.l", "lowerarm_l", "l_forearm"],
  rightForeArm: ["rightforearm", "forearm_r", "forearm.r", "lowerarm_r", "r_forearm"],
};

function mapHumanoidBones(root) {
  const bones = {};
  const allBones = [];

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

  // Fallback tìm theo chuỗi con nếu rig đặt tiền tố lạ từ Tripo AI
  Object.entries(BONE_SUBSTRING_FALLBACKS).forEach(([slot, tokens]) => {
    if (bones[slot]) return;
    for (const token of tokens) {
      const found = allBones.find((b) => (b.name || "").toLowerCase().includes(token));
      if (found) {
        bones[slot] = found;
        break;
      }
    }
  });

  const restQuats = {};
  const restPos = {};
  Object.entries(bones).forEach(([slot, bone]) => {
    if (bone) {
      restQuats[slot] = bone.quaternion.clone();
      restPos[slot] = bone.position.clone();
    }
  });

  return { bones, restQuats, restPos, hasRig: Boolean(bones.hips || bones.spine || bones.head) };
}

export function useOptionalCharacterGlb(slotKey) {
  const [, setManifestTick] = useState(0);
  const [templateEntry, setTemplateEntry] = useState(null);

  useEffect(() => {
    ensureCharacterManifestLoaded();
    return subscribeCharacterManifest(() => setManifestTick((n) => n + 1));
  }, []);

  const glbUrl = getCharacterGlbUrl(slotKey);

  useEffect(() => {
    if (!glbUrl || !slotKey) {
      setTemplateEntry(null);
      return undefined;
    }
    if (characterAssetCache.has(glbUrl)) {
      setTemplateEntry(characterAssetCache.get(glbUrl));
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
        const box = new THREE.Box3().setFromObject(rawScene);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const rawHeight = Math.max(size.y, 0.01);
        const normScale = (slotMeta.standingHeight || 1.68) / rawHeight;

        const entry = {
          scene: rawScene,
          normScale,
          minY: box.min.y,
          centerX: center.x,
          centerZ: center.z,
          standingHeight: slotMeta.standingHeight || 1.68,
        };
        characterAssetCache.set(glbUrl, entry);
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
 * Hiển thị Nhân Vật 3D Có Xương Auto-Rig (.GLB Tripo AI):
 * - Nhân bản độc lập từng ghế bằng `SkeletonUtils.clone` (không chung xương giữa 18 ghế).
 * - Tự động bẻ khớp Đùi (~82°) & Đầu gối (~86°) ngồi khít mặt ghế sồi `SEAT_TOP_Y = 0.48m`.
 * - Lái mượt xương Sống, Đầu (LookAt) và 2 Cánh Tay ở 60 FPS!
 */
export default function SkinnedCharacterGLB({
  slotKey,
  templateEntry,
  tunicColor = "#7f2936",
  effectiveIsDead = false,
  isWolfVictim = false,
  recapPose = null,
  isSleeping = false,
  isDefendant = false,
  isSpeaking = false,
  hasPointTarget = false,
  phase = "",
  hasWinner = false,
  lookTargetWorld = null,
  seatTransform,
  seed = 0,
}) {
  const slotMeta = CHARACTER_SLOTS[slotKey] || CHARACTER_SLOTS.villager_cloak;
  const wrapperRef = useRef(null);

  const clonedBundle = useMemo(() => {
    if (!templateEntry?.scene) return null;
    const clonedRoot = cloneSkeleton(templateEntry.scene);
    const rigInfo = mapHumanoidBones(clonedRoot);

    clonedRoot.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = !effectiveIsDead;
        obj.receiveShadow = true;
        obj.frustumCulled = false; // SkinnedMesh gập xương ngồi không bị cắt nhầm bounding box
        if (obj.material) {
          const mat = obj.material.clone();
          if (slotMeta.tintableCloak && tunicColor && !effectiveIsDead) {
            const tint = new THREE.Color(tunicColor);
            mat.color.lerp(tint, 0.42);
          }
          if (effectiveIsDead) {
            mat.transparent = true;
            mat.opacity = 0.26;
            mat.color.set("#38bdf8");
          }
          obj.material = mat;
        }
      }
    });

    // Áp tư thế ngồi chuẩn mặt ghế sồi SEAT_TOP_Y = 0.48m lên khớp Đùi & Đầu Gối
    const { bones, restQuats } = rigInfo;
    const thighBend = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.42);
    const kneeBend = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.48);

    if (bones.leftUpLeg && restQuats.leftUpLeg) {
      bones.leftUpLeg.quaternion.copy(restQuats.leftUpLeg).multiply(thighBend);
    }
    if (bones.rightUpLeg && restQuats.rightUpLeg) {
      bones.rightUpLeg.quaternion.copy(restQuats.rightUpLeg).multiply(thighBend);
    }
    if (bones.leftLeg && restQuats.leftLeg) {
      bones.leftLeg.quaternion.copy(restQuats.leftLeg).multiply(kneeBend);
    }
    if (bones.rightLeg && restQuats.rightLeg) {
      bones.rightLeg.quaternion.copy(restQuats.rightLeg).multiply(kneeBend);
    }

    return { clonedRoot, rigInfo };
  }, [templateEntry, slotMeta.tintableCloak, tunicColor, effectiveIsDead]);

  const animStateRef = useRef({
    spineX: 0,
    headY: 0,
    headX: 0,
    armRX: 0,
    armLX: 0,
  });

  const qTempX = useMemo(() => new THREE.Quaternion(), []);
  const qTempY = useMemo(() => new THREE.Quaternion(), []);
  const axisX = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const axisY = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame((state, delta) => {
    if (!clonedBundle) return;
    const { rigInfo } = clonedBundle;
    const { bones, restQuats } = rigInfo;
    const t = state.clock.elapsedTime;
    const breath = t * 2.1 + seed;
    const st = animStateRef.current;

    // 1. Thân trên (Spine)
    let goalSpineX = Math.sin(breath) * 0.03;
    if (effectiveIsDead) goalSpineX = 0.34;
    else if (recapPose === "castLunge") goalSpineX = 0.28 + Math.sin(t * 7.5) * 0.06;
    else if (recapPose === "hitRecoil") goalSpineX = -0.26 + Math.sin(t * 18) * 0.05;
    else if (recapPose === "cheer") goalSpineX = -0.08 + Math.sin(t * 6.5) * 0.05;
    else if (isSleeping) goalSpineX = 0.2;
    else if (isDefendant || recapPose === "defend") goalSpineX = -0.07;

    st.spineX = THREE.MathUtils.lerp(st.spineX, goalSpineX, delta * 6.5);
    if (bones.spine && restQuats.spine) {
      qTempX.setFromAxisAngle(axisX, st.spineX);
      bones.spine.quaternion.copy(restQuats.spine).multiply(qTempX);
    }

    // 2. Xương Đầu (Head LookAt)
    let goalHeadY = Math.sin(t * 0.75 + seed) * 0.14;
    let goalHeadX = Math.cos(t * 1.1 + seed) * 0.04;

    if (effectiveIsDead) {
      goalHeadX = 0.4;
      goalHeadY = 0;
    } else if (recapPose === "hitRecoil") {
      goalHeadX = -0.22;
      goalHeadY = Math.sin(t * 22) * 0.18;
    } else if (recapPose === "cheer") {
      goalHeadX = -0.14 + Math.sin(t * 6) * 0.08;
      goalHeadY = Math.sin(t * 3.5 + seed) * 0.22;
    } else if (isSleeping) {
      goalHeadX = 0.34;
      goalHeadY = Math.sin(t * 0.6 + seed) * 0.05;
    } else if (isSpeaking) {
      goalHeadX = Math.sin(t * 11) * 0.09;
      goalHeadY = Math.cos(t * 6.5) * 0.12;
    } else if (lookTargetWorld && seatTransform) {
      const dx = lookTargetWorld.x - seatTransform.x;
      const dz = lookTargetWorld.z - seatTransform.z;
      if (Math.hypot(dx, dz) > 0.2) {
        const worldAngle = Math.atan2(dx, dz);
        let relYaw = worldAngle - seatTransform.facingYaw;
        while (relYaw > Math.PI) relYaw -= Math.PI * 2;
        while (relYaw < -Math.PI) relYaw += Math.PI * 2;
        goalHeadY = THREE.MathUtils.clamp(relYaw * 0.75, -0.85, 0.85);
      }
    }

    st.headY = THREE.MathUtils.lerp(st.headY, goalHeadY, delta * 5.8);
    st.headX = THREE.MathUtils.lerp(st.headX, goalHeadX, delta * 5.8);
    const headBone = bones.head || bones.neck;
    const headRest = bones.head ? restQuats.head : restQuats.neck;
    if (headBone && headRest) {
      qTempY.setFromAxisAngle(axisY, st.headY);
      qTempX.setFromAxisAngle(axisX, st.headX);
      headBone.quaternion.copy(headRest).multiply(qTempY).multiply(qTempX);
    }

    // 3. Xương Cánh Tay (Arm Gesture)
    let goalArmR = -0.22;
    let goalArmL = -0.22;
    if (recapPose === "cheer") {
      goalArmR = -1.9 + Math.sin(t * 7 + seed) * 0.2;
      goalArmL = -1.9 + Math.cos(t * 7 + seed) * 0.2;
    } else if (recapPose === "castLunge") {
      goalArmR = -1.25 + Math.sin(t * 10) * 0.22;
      goalArmL = -1.05 + Math.cos(t * 10) * 0.18;
    } else if (recapPose === "hitRecoil") {
      goalArmR = -0.85;
      goalArmL = -0.85;
    } else if (hasPointTarget && (phase === "day_nominate" || phase === "day_defense")) {
      goalArmR = -1.18;
      goalArmL = -0.2;
    } else if (isSpeaking || recapPose === "defend") {
      goalArmR = -0.58 + Math.sin(t * 8.5 + seed) * 0.28;
      goalArmL = -0.58 + Math.cos(t * 7.8 + seed) * 0.28;
    } else if (slotKey === "wolf" && (phase === "night_wolf" || hasWinner)) {
      goalArmR = -0.68 + Math.sin(t * 3.8 + seed) * 0.12;
      goalArmL = -0.68 + Math.cos(t * 3.8 + seed) * 0.12;
    }

    st.armRX = THREE.MathUtils.lerp(st.armRX, goalArmR, delta * 7);
    st.armLX = THREE.MathUtils.lerp(st.armLX, goalArmL, delta * 7);
    if (bones.rightArm && restQuats.rightArm) {
      qTempX.setFromAxisAngle(axisX, st.armRX);
      bones.rightArm.quaternion.copy(restQuats.rightArm).multiply(qTempX);
    }
    if (bones.leftArm && restQuats.leftArm) {
      qTempX.setFromAxisAngle(axisX, st.armLX);
      bones.leftArm.quaternion.copy(restQuats.leftArm).multiply(qTempX);
    }

    // Nhấp nhô nhẹ khi hò reo hoặc thở trên ghế
    if (wrapperRef.current) {
      const bounceY =
        recapPose === "cheer"
          ? Math.abs(Math.sin(t * 5.2 + seed)) * 0.05
          : Math.sin(breath) * 0.006;
      const hitFlash = recapPose === "hitRecoil" || isWolfVictim;
      wrapperRef.current.position.y =
        (rigInfo.hasRig ? SEAT_TOP_Y - templateEntry.standingHeight * 0.46 + (slotMeta.seatHipOffsetY || 0.04) : SEAT_TOP_Y) +
        bounceY;
      wrapperRef.current.position.z =
        (slotMeta.seatForwardOffsetZ || 0.05) + (recapPose === "castLunge" ? 0.12 : hitFlash ? -0.05 : 0);
    }
  });

  if (!clonedBundle || !templateEntry) return null;

  const { normScale, minY, centerX, centerZ, standingHeight } = templateEntry;
  const baseSeatY = clonedBundle.rigInfo.hasRig
    ? SEAT_TOP_Y - standingHeight * 0.46 + (slotMeta.seatHipOffsetY || 0.04)
    : SEAT_TOP_Y;

  return (
    <group ref={wrapperRef} position={[0, baseSeatY, slotMeta.seatForwardOffsetZ || 0.05]}>
      <primitive
        object={clonedBundle.clonedRoot}
        scale={[normScale, normScale, normScale]}
        position={[-centerX * normScale, -minY * normScale, -centerZ * normScale]}
      />
    </group>
  );
}
