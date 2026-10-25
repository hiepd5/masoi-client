import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { PROP_MANIFEST } from "../config/propManifest.js";
import { EXTERIOR_ASSET_CATALOG } from "../editor/defaultVillageLayout.js";
import { getProceduralGroundAssets } from "../utils/proceduralGroundPBR.js";
import { useLoadedPropEntry } from "./SmartPropGLB.jsx";

export const INSTANCED_EXTERIOR_TYPES = [
  "tree_pine_tall",
  "tree_pine_wide",
  "tree_dead_gnarled",
  "prop_fence_rock",
];

const NOOP_RAYCAST = () => {};

function extractTemplateParts(rootScene) {
  if (!rootScene) return [];
  rootScene.updateMatrixWorld(true);
  const parts = [];
  rootScene.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry || !obj.material) return;
    if (Array.isArray(obj.material)) return;
    parts.push({
      geometry: obj.geometry,
      material: obj.material,
      meshToRootMatrix: obj.matrixWorld.clone(),
      castShadow: Boolean(obj.castShadow),
      receiveShadow: obj.receiveShadow !== false,
    });
  });
  return parts;
}

function SinglePropInstancedGroup({ propKey, nodes, calib, reloadToken }) {
  const manifest = PROP_MANIFEST[propKey];
  const entry = useLoadedPropEntry(propKey, reloadToken);
  const meshRefs = useRef([]);

  const parts = useMemo(() => {
    if (entry.status !== "loaded" || !entry.scene) return [];
    return extractTemplateParts(entry.scene);
  }, [entry]);

  useEffect(() => {
    if (!manifest || !entry.bounds || parts.length === 0 || nodes.length === 0) return;

    const userYawDeg = Number(calib?.yawDeg ?? 0);
    const userScale = Number(calib?.scale ?? manifest.defaultScale ?? 1);
    const userYOffset = Number(calib?.yOffset ?? manifest.defaultYOffset ?? 0);
    const userZOffset = Number(calib?.zOffset ?? manifest.defaultZOffset ?? 0);

    const totalYawRad =
      (entry.bounds.autoYawRad || 0) +
      THREE.MathUtils.degToRad((manifest.defaultYawDeg || 0) + userYawDeg);

    const baseTargetH = entry.bounds.effectiveTargetHeight || manifest.targetHeight || 1;
    const normalizedScale = (baseTargetH / Math.max(0.01, entry.bounds.sizeY)) * userScale;

    const matCalib = new THREE.Matrix4().compose(
      new THREE.Vector3(0, userYOffset, userZOffset),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, totalYawRad, 0, "XYZ")),
      new THREE.Vector3(normalizedScale, normalizedScale, normalizedScale)
    );

    const matCenterOffset = new THREE.Matrix4().makeTranslation(
      -entry.bounds.centerX,
      -entry.bounds.minY,
      -entry.bounds.centerZ
    );

    const matCalibOffset = new THREE.Matrix4().multiplyMatrices(matCalib, matCenterOffset);
    const matNode = new THREE.Matrix4();
    const matBase = new THREE.Matrix4();
    const matFinal = new THREE.Matrix4();
    const posV = new THREE.Vector3();
    const rotE = new THREE.Euler(0, 0, 0, "XYZ");
    const rotQ = new THREE.Quaternion();
    const sclV = new THREE.Vector3(1, 1, 1);

    parts.forEach((part, pIdx) => {
      const instMesh = meshRefs.current[pIdx];
      if (!instMesh) return;

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const p = n.position || [0, 0, 0];
        const r = n.rotation || [0, 0, 0];
        const s = Array.isArray(n.scale)
          ? n.scale
          : typeof n.scale === "number"
            ? [n.scale, n.scale, n.scale]
            : [1, 1, 1];

        posV.set(p[0] || 0, p[1] || 0, p[2] || 0);
        rotE.set(r[0] || 0, r[1] || 0, r[2] || 0, "XYZ");
        rotQ.setFromEuler(rotE);
        sclV.set(s[0] ?? 1, s[1] ?? 1, s[2] ?? 1);

        matNode.compose(posV, rotQ, sclV);
        matBase.multiplyMatrices(matNode, matCalibOffset);
        matFinal.multiplyMatrices(matBase, part.meshToRootMatrix);
        instMesh.setMatrixAt(i, matFinal);
      }

      instMesh.count = nodes.length;
      instMesh.instanceMatrix.needsUpdate = true;
    });
  }, [manifest, entry, parts, nodes, calib]);

  if (!manifest || entry.status !== "loaded" || parts.length === 0 || nodes.length === 0) {
    return null;
  }

  return (
    <group name={`__instanced_batch_${propKey}__`}>
      {parts.map((part, pIdx) => (
        <instancedMesh
          key={`${propKey}-part-${pIdx}-${nodes.length}`}
          ref={(el) => {
            meshRefs.current[pIdx] = el;
          }}
          args={[part.geometry, part.material, nodes.length]}
          castShadow={part.castShadow}
          receiveShadow={part.receiveShadow}
          frustumCulled={false}
          raycast={NOOP_RAYCAST}
        />
      ))}
    </group>
  );
}

function InstancedContactShadowBatch({ nodes }) {
  const aoMeshRef = useRef(null);
  const { contactAOMap } = useMemo(() => getProceduralGroundAssets(), []);

  useEffect(() => {
    const instMesh = aoMeshRef.current;
    if (!instMesh || nodes.length === 0) return;

    const matNode = new THREE.Matrix4();
    const matLocalDisc = new THREE.Matrix4();
    const matFinal = new THREE.Matrix4();
    const posV = new THREE.Vector3();
    const rotE = new THREE.Euler(0, 0, 0, "XYZ");
    const rotQ = new THREE.Quaternion();
    const sclV = new THREE.Vector3(1, 1, 1);
    const discQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0, "XYZ"));
    const discPos = new THREE.Vector3(0, 0.009, 0);
    const discScl = new THREE.Vector3(1, 1, 1);

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const meta = EXTERIOR_ASSET_CATALOG[n.type] || {};
      const radius = meta.aoRadius || 1.35;
      const scaleXZ = meta.aoScaleXZ || [1, 1];
      const p = n.position || [0, 0, 0];
      const r = n.rotation || [0, 0, 0];
      const s = Array.isArray(n.scale)
        ? n.scale
        : typeof n.scale === "number"
          ? [n.scale, n.scale, n.scale]
          : [1, 1, 1];

      posV.set(p[0] || 0, p[1] || 0, p[2] || 0);
      rotE.set(r[0] || 0, r[1] || 0, r[2] || 0, "XYZ");
      rotQ.setFromEuler(rotE);
      sclV.set(s[0] ?? 1, s[1] ?? 1, s[2] ?? 1);
      matNode.compose(posV, rotQ, sclV);

      discScl.set(radius * (scaleXZ[0] || 1), radius * (scaleXZ[1] || 1), 1);
      matLocalDisc.compose(discPos, discQuat, discScl);

      matFinal.multiplyMatrices(matNode, matLocalDisc);
      instMesh.setMatrixAt(i, matFinal);
    }

    instMesh.count = nodes.length;
    instMesh.instanceMatrix.needsUpdate = true;
  }, [nodes]);

  if (nodes.length === 0) return null;

  return (
    <instancedMesh
      key={`instanced-ao-discs-${nodes.length}`}
      ref={aoMeshRef}
      args={[null, null, nodes.length]}
      frustumCulled={false}
      raycast={NOOP_RAYCAST}
    >
      <circleGeometry args={[1, 20]} />
      <meshBasicMaterial
        map={contactAOMap}
        transparent
        opacity={0.58}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </instancedMesh>
  );
}

/**
 * Gộp tự động toàn bộ Rừng Thông & Hàng Rào Đá thành THREE.InstancedMesh (< 40 Draw Calls)
 * khi ở chế độ Người Chơi (!architectMode). Khi mở "🏗️ Dựng Cảnh D5", tự động tắt để trả lại
 * từng thực thể riêng lẻ cho Gizmo 3 trục!
 */
export default function InstancedExteriorBatch3D({
  layoutNodes = [],
  propStatuses = {},
  propCalib = {},
  reloadToken = 0,
  architectMode = false,
}) {
  const { groupedByType, allLoadedInstancedNodes } = useMemo(() => {
    if (architectMode) {
      return { groupedByType: {}, allLoadedInstancedNodes: [] };
    }
    const groups = {};
    const flatNodes = [];
    INSTANCED_EXTERIOR_TYPES.forEach((t) => {
      groups[t] = [];
    });

    (layoutNodes || []).forEach((node) => {
      if (!node || !groups[node.type]) return;
      if (propStatuses?.[node.type] !== "loaded") return;
      groups[node.type].push(node);
      flatNodes.push(node);
    });

    return { groupedByType: groups, allLoadedInstancedNodes: flatNodes };
  }, [layoutNodes, propStatuses, architectMode]);

  if (architectMode || allLoadedInstancedNodes.length === 0) {
    return null;
  }

  return (
    <group name="__auto_instanced_exterior_layer__">
      <InstancedContactShadowBatch nodes={allLoadedInstancedNodes} />
      {INSTANCED_EXTERIOR_TYPES.map((propKey) => {
        const list = groupedByType[propKey] || [];
        if (list.length === 0) return null;
        return (
          <SinglePropInstancedGroup
            key={propKey}
            propKey={propKey}
            nodes={list}
            calib={propCalib?.[propKey]}
            reloadToken={reloadToken}
          />
        );
      })}
    </group>
  );
}
