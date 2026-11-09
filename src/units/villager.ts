import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { palette } from '../art/palette';
import { ball, lathe } from '../art/shapes';

/**
 * 村人（火把）的低面數造型（docs/04 第 3.1 節、docs/08 第 1 節）：單一幾何、頂點色，給 InstancedMesh 用。
 * 差異靠顏色與頭飾：土褐的衣服、頭巾、手持火把（火焰用大於 1 的頂點色，Bloom 會讓它發光）。
 * 約定：腳底 y = 0、臉朝 +z、高約 1.3 公尺。
 */
export function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, boost = 1): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r * boost;
    arr[i * 3 + 1] = c.g * boost;
    arr[i * 3 + 2] = c.b * boost;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  // 合併要求屬性一致：都要有 uv
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

export const VILLAGER = { height: 1.3 } as const;

export function buildVillagerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // 身體：胖胖的衣服
  const body = ball(0.3, 10, 7).scale(1, 1.15, 0.95).translate(0, 0.42, 0);
  parts.push(paint(body, palette.human.earth, 1.5));
  // 頭
  parts.push(paint(ball(0.21, 10, 7).translate(0, 1.0, 0), '#f3d3b0', 1.15));
  // 頭巾（一圈帶子）
  parts.push(paint(new THREE.TorusGeometry(0.2, 0.045, 4, 10).rotateX(Math.PI / 2).translate(0, 1.1, 0), palette.human.robeAccent, 1.3));
  // 腳
  parts.push(paint(ball(0.09, 6, 4).scale(1, 0.7, 1.3).translate(-0.12, 0.07, 0.03), '#3a3029'));
  parts.push(paint(ball(0.09, 6, 4).scale(1, 0.7, 1.3).translate(0.12, 0.07, 0.03), '#3a3029'));
  // 火把：左手一根棒＋火焰
  const from = new THREE.Vector3(-0.22, 0.55, 0.05);
  const to = new THREE.Vector3(-0.42, 0.9, 0.15);
  const dir = new THREE.Vector3().subVectors(to, from);
  const stick = new THREE.CylinderGeometry(0.035, 0.035, dir.length(), 5, 1)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()))
    .translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  parts.push(paint(stick, '#6a4b2e'));
  const flame = lathe([[0, 0], [0.09, 0.02], [0.06, 0.16], [0, 0.26]], { radius: 0.03, segments: 6, steps: 2 }).translate(-0.42, 0.92, 0.15);
  parts.push(paint(flame, palette.fire.torch, 3.2));
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
  parts.forEach((p) => p.dispose());
  merged.computeBoundingSphere();
  return merged;
}
