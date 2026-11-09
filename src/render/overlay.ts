import * as THREE from 'three';

/**
 * 「不要像素化」的圖層（使用者 2026-11-09：光柱、指示範圍〔光圈〕不要有像素感）。
 * 這些東西（互動光圈、光柱、玩家身上的光圈、傳送門光柱、瞄準線）是「介面性質的指示」，要清楚銳利；
 * 像素化後製（PixelPass）只畫第 0 層（地圖、角色、技能特效），畫完放大之後，再用完整解析度另外畫第 1 層這些指示。
 * 它們不在低解析度的深度圖裡，所以每個材質在著色器裡自己拿低解析度的深度圖比較，被地形或物件擋住的部分不畫。
 */
export const OVERLAY_LAYER = 1;

/** 所有指示材質共用的 uniform（PixelPass 每幀更新）：on = 0 時（經典風格、沒有像素化）完全不做遮擋比較 */
export const overlayUniforms = {
  uOvOn: { value: 0 },
  uOvDepth: { value: null as THREE.Texture | null },
  uOvRes: { value: new THREE.Vector2(1, 1) },
  uOvNear: { value: 0.1 },
  uOvFar: { value: 100 },
};

const HEADER = /* glsl */ `
#include <packing>
uniform float uOvOn;
uniform sampler2D uOvDepth;
uniform vec2 uOvRes;
uniform float uOvNear;
uniform float uOvFar;
`;
const TEST = /* glsl */ `
  if (uOvOn > 0.5) {
    float sceneZ = -perspectiveDepthToViewZ(texture2D(uOvDepth, gl_FragCoord.xy / uOvRes).x, uOvNear, uOvFar);
    float myZ = -perspectiveDepthToViewZ(gl_FragCoord.z, uOvNear, uOvFar);
    // the scene depth is low-res, so allow a margin that grows with distance (ground rings lie just above the terrain)
    if (myZ > sceneZ + 0.35 + 0.02 * myZ) discard;
  }
`;

const patched = new WeakSet<THREE.Material>();

function patch(m: THREE.Material): void {
  if (patched.has(m)) return;
  patched.add(m);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    Object.assign(shader.uniforms, overlayUniforms);
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', `${HEADER}\nvoid main() {${TEST}`);
  };
  m.customProgramCacheKey = () => 'overlay';
  m.needsUpdate = true;
}

/** 把物件（和它的子物件）放到指示圖層，並讓它的材質會被像素化的場景遮擋 */
export function markOverlay(o: THREE.Object3D): void {
  o.traverse((c) => {
    c.layers.set(OVERLAY_LAYER);
    const mat = (c as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) patch(m);
  });
}
