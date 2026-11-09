import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { palette } from '../art/palette';
import { ball, lathe } from '../art/shapes';
import { paint } from './villager';

/**
 * 人類的低面數造型（E-1，docs/04 第 3.1 節）：和村人一樣是單一幾何＋頂點色，給 InstancedMesh 用。
 * 約定：腳底 y = 0、臉朝 +z。剪影要一眼分得出來（手機上敵人只有約 30 px 高）：
 * 足輕 = 戴斗笠、胸前一面大圓盾（盾在 +z，就是盾面）；弓手 = 身旁一把大弓、背後一筒箭、斗笠比較小。
 */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
  parts.forEach((p) => p.dispose());
  merged.computeBoundingSphere();
  return merged;
}

export const ASHIGARU = { height: 1.5 } as const;
export const YUMI = { height: 1.4 } as const;

export function buildAshigaruGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(ball(0.34, 10, 7).scale(1, 1.15, 0.95).translate(0, 0.46, 0), palette.human.slate, 1.25));
  parts.push(paint(ball(0.21, 10, 7).translate(0, 1.04, 0), '#f3d3b0', 1.15));
  // 斗笠（陣笠）：圓錐形的帽子，邊緣圓潤
  parts.push(paint(lathe([[0, 0.22], [0.08, 0.16], [0.22, 0.05], [0.3, 0], [0.3, -0.02], [0, -0.02]], { radius: 0.02, segments: 12, steps: 2 }).translate(0, 1.16, 0), '#c9a86a', 1.15));
  // 腳
  parts.push(paint(ball(0.1, 6, 4).scale(1, 0.7, 1.3).translate(-0.13, 0.07, 0.03), '#3a3029'));
  parts.push(paint(ball(0.1, 6, 4).scale(1, 0.7, 1.3).translate(0.13, 0.07, 0.03), '#3a3029'));
  // 盾：胸前的大圓盾（面朝 +z）＋深色的盾緣＋中央的突起
  parts.push(paint(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 14).rotateX(Math.PI / 2).translate(0, 0.6, 0.38), palette.human.robeAccent, 1.2));
  parts.push(paint(new THREE.TorusGeometry(0.4, 0.045, 5, 16).translate(0, 0.6, 0.42), '#3a3029'));
  parts.push(paint(ball(0.09, 6, 5).translate(0, 0.6, 0.47), '#d9c27a', 1.3));
  return merge(parts);
}

export function buildYumiGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const robe = '#5f8a74';
  parts.push(paint(ball(0.27, 10, 7).scale(1, 1.25, 0.95).translate(0, 0.45, 0), robe, 1.3));
  parts.push(paint(ball(0.2, 10, 7).translate(0, 1.0, 0), '#f3d3b0', 1.15));
  // 小斗笠
  parts.push(paint(lathe([[0, 0.18], [0.12, 0.1], [0.27, 0.02], [0.27, 0], [0, 0]], { radius: 0.02, segments: 10, steps: 2 }).translate(0, 1.1, 0), palette.human.earth, 1.2));
  parts.push(paint(ball(0.085, 6, 4).scale(1, 0.7, 1.3).translate(-0.1, 0.07, 0.03), '#3a3029'));
  parts.push(paint(ball(0.085, 6, 4).scale(1, 0.7, 1.3).translate(0.1, 0.07, 0.03), '#3a3029'));
  // 弓：左手邊一把豎著的弧形弓（半圓環）＋弦
  const bow = new THREE.TorusGeometry(0.46, 0.035, 5, 14, Math.PI).rotateZ(Math.PI / 2).translate(-0.3, 0.62, 0.12);
  parts.push(paint(bow, '#6a4b2e'));
  parts.push(paint(new THREE.CylinderGeometry(0.012, 0.012, 0.92, 4).translate(-0.3, 0.62, 0.12), '#e8e2d0', 1.2));
  // 背後的箭筒＋箭羽
  parts.push(paint(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8).rotateZ(0.35).translate(0.14, 0.7, -0.26), '#7a5a38'));
  parts.push(paint(ball(0.05, 5, 4).translate(0.24, 0.98, -0.26), '#f3efe4', 1.3));
  return merge(parts);
}
