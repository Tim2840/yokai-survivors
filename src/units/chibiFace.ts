import * as THREE from 'three';
import { palette } from '../art/palette';
import { soft } from '../art/materials';
import { ball, mesh } from '../art/shapes';

/**
 * 玩家角色的日系 Q 版臉（D72）：大眼睛（白眼＋深色瞳孔＋白色高光）、腮紅、小嘴。
 * 所有可玩角色共用（新角色也用這個，不要各自刻一份）；顏色可換（例：河童的瞳孔偏綠）。
 * 眼睛貼在頭的前面（+z），位置由頭的半徑算出來。
 */
export interface FaceOptions {
  headY: number;
  headR: number;
  /** 瞳孔顏色 */
  iris?: string;
  /** 兩眼間距（頭半徑的比例） */
  spread?: number;
  /** 眼睛高度（相對頭中心，頭半徑的比例） */
  eyeY?: number;
  mouth?: boolean;
}

export function addChibiFace(parent: THREE.Object3D, o: FaceOptions, track: { g<T extends THREE.BufferGeometry>(x: T): T; m<T extends THREE.Material>(x: T): T }): void {
  const C = palette.chibi;
  const r = o.headR;
  const spread = (o.spread ?? 0.36) * r;
  const ey = o.headY + (o.eyeY ?? 0) * r;
  const white = track.m(soft(C.eyeHi, { roughness: 0.5 }));
  const iris = track.m(soft(o.iris ?? C.eye, { roughness: 0.4 }));
  const hi = track.m(soft(C.eyeHi, { emissive: C.eyeHi, emissiveIntensity: 0.6 }));
  const blush = track.m(soft(C.blush));
  const whiteG = track.g(ball(r * 0.2, 14, 10));
  const irisG = track.g(ball(r * 0.15, 12, 10));
  const hiG = track.g(ball(r * 0.05, 8, 6));
  const blushG = track.g(ball(r * 0.13, 10, 6));
  // 頭表面在 (x, y) 處的 z：球面 sqrt(r² - x² - y²)
  const zAt = (x: number, y: number) => Math.sqrt(Math.max(0, r * r - x * x - (y - o.headY) * (y - o.headY)));
  for (const sx of [-1, 1]) {
    const x = sx * spread;
    const w = mesh(whiteG, white, false, false);
    w.scale.set(0.8, 1.15, 0.45);
    w.position.set(x, ey, zAt(x, ey) - r * 0.02);
    const i = mesh(irisG, iris, false, false);
    i.scale.set(0.8, 1.15, 0.45);
    i.position.set(x + sx * r * 0.01, ey - r * 0.03, zAt(x, ey) + r * 0.03);
    const h = mesh(hiG, hi, false, false);
    h.position.set(x + r * 0.05, ey + r * 0.06, zAt(x, ey) + r * 0.07);
    const b = mesh(blushG, blush, false, false);
    b.scale.set(1.2, 0.6, 0.35);
    const bx = sx * r * 0.6;
    const by = o.headY - r * 0.28;
    b.position.set(bx, by, zAt(bx, by) - r * 0.02);
    parent.add(w, i, h, b);
  }
  if (o.mouth !== false) {
    const mouth = mesh(track.g(new THREE.TorusGeometry(r * 0.08, r * 0.022, 6, 10, Math.PI)), iris, false, false);
    mouth.rotation.z = Math.PI;
    const my = o.headY - r * 0.32;
    mouth.position.set(0, my, zAt(0, my) + r * 0.01);
    parent.add(mouth);
  }
}
