import * as THREE from 'three';

/** 給合併幾何用的上色工具（頂點色；boost > 1 會被 Bloom 抓到發光）。村人造型在 humans.ts（D72 日系 Q 版） */
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
