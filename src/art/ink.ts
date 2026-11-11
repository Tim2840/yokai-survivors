import * as THREE from 'three';
import { fbm, valueNoise } from '../lib/noise';

/**
 * 水墨特效的共用零件（D85，使用者 2026-11-10：「技法特效…更有日本水墨風格」；設計 docs/23 第 15 節）。
 * 全部用程式產生（不用外部圖檔）：三張墨跡貼圖＋一個墨的材質。
 * - 貼圖的 RGB = 墨的濃淡（1 = 淡、邊緣與筆觸重疊處較濃），乘上每個實例的顏色（角色主色）；
 * - 貼圖的 A = 「離邊緣多遠」加上雜訊：材質用每個實例的 aFade（0～1）當門檻，門檻越高、墨從邊緣開始一塊一塊乾掉消失。
 * 一般混合（不是加法發光），所以不會炫光。貼圖是固定種子，每次都一樣。
 */
const SIZE = 128;
const cache = new Map<string, THREE.DataTexture>();

function make(name: string, fn: (u: number, v: number) => [number, number]): THREE.DataTexture {
  const hit = cache.get(name);
  if (hit) return hit;
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      const [shade, alpha] = fn((i + 0.5) / SIZE, (j + 0.5) / SIZE);
      const k = (j * SIZE + i) * 4;
      const s = Math.round(Math.max(0, Math.min(1, shade)) * 255);
      data[k] = data[k + 1] = data[k + 2] = s;
      data[k + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  cache.set(name, t);
  return t;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 墨漬（燃燒地、水坑、爆開的墨）：不規則的圓、邊緣一圈濃墨、裡面淡，帶紙的顆粒 */
export function inkBlotTexture(): THREE.DataTexture {
  return make('blot', (u, v) => {
    const x = u * 2 - 1;
    const y = v * 2 - 1;
    const ang = Math.atan2(y, x);
    const r = Math.hypot(x, y);
    // 邊緣的半徑隨角度起伏（墨暈開的不規則邊）
    const edge = 0.78 + 0.14 * (fbm(Math.cos(ang) * 1.6 + 5, Math.sin(ang) * 1.6 + 9, 7, 3) - 0.5) * 2;
    const d = 1 - r / edge; // > 0 在墨漬內，越靠中心越大
    const grain = fbm(u * 9, v * 9, 3, 3);
    const rim = 1 - smooth(0.0, 0.22, d); // 邊緣一圈濃
    const shade = 0.95 - 0.55 * rim - 0.18 * (grain - 0.5);
    const alpha = d <= 0 ? 0 : Math.min(1, 0.18 + d * 0.95 + (grain - 0.5) * 0.35);
    return [shade, alpha];
  });
}

/** 筆刷圓（円相）：一筆畫出的不完整的圈——起筆粗、收筆細、留一個缺口，帶飛白 */
export function inkEnsoTexture(): THREE.DataTexture {
  return make('enso', (u, v) => {
    const x = u * 2 - 1;
    const y = v * 2 - 1;
    const r = Math.hypot(x, y);
    const a = (Math.atan2(y, x) + Math.PI) / (Math.PI * 2); // 0～1 沿著筆畫
    const gap = smooth(0.0, 0.06, a) * (1 - smooth(0.9, 1.0, a)); // 起筆與收筆之間留缺口
    const width = 0.2 * (1 - 0.6 * a) + 0.03; // 起筆粗、收筆細
    const mid = 0.74 + 0.03 * Math.sin(a * 9);
    const across = Math.abs(r - mid) / width; // 0 = 筆畫中心
    const streak = valueNoise(a * 40, r * 60, 11); // 沿筆畫方向的飛白
    const dry = smooth(0.35, 1.0, a) * smooth(0.45, 0.8, streak); // 越到收筆越乾
    const body = (1 - smooth(0.55, 1.0, across)) * gap * (1 - 0.85 * dry);
    const shade = 0.55 + 0.4 * across - 0.15 * (streak - 0.5);
    return [shade, body <= 0.02 ? 0 : Math.min(1, body * 0.9 + 0.1)];
  });
}

/** 直筆（火柱、水柱）：由下往上的一筆，底部濃、往上變乾變細（u 繞圓柱一圈、v 由下往上） */
export function inkStrokeTexture(): THREE.DataTexture {
  return make('stroke', (u, v) => {
    const streak = fbm(u * 14, v * 2.2, 5, 3); // 直向的筆毛紋路
    const dry = smooth(0.3, 1.0, v) * smooth(0.42, 0.75, streak);
    const top = 1 - smooth(0.7, 1.0, v + (streak - 0.5) * 0.3);
    const body = top * (1 - 0.9 * dry);
    const shade = 0.5 + 0.45 * v - 0.2 * (streak - 0.5);
    return [shade, body <= 0.03 ? 0 : Math.min(1, body * 0.85 + 0.12)];
  });
}

/** 墨的材質：貼圖 × 實例顏色，一般混合；每個實例的 aFade（0 = 完整、1 = 全乾）決定墨從邊緣消失多少 */
export function inkMaterial(map: THREE.Texture, opts: { opacity?: number; side?: THREE.Side } = {}): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map, color: '#ffffff', transparent: true, opacity: opts.opacity ?? 0.9, depthWrite: false, side: opts.side ?? THREE.FrontSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('void main() {', 'attribute float aFade;\nvarying float vFade;\nvoid main() {\n  vFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vFade;\nvoid main() {')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.a *= smoothstep(vFade, vFade + 0.1, texture2D(map, vMapUv).a);');
  };
  m.customProgramCacheKey = () => 'ink';
  return m;
}

/** 幫 InstancedMesh 加上 aFade（每個實例一個數字）；回傳那個陣列，update 時直接寫、再標 needsUpdate */
export function addFade(mesh: THREE.InstancedMesh, n: number): THREE.InstancedBufferAttribute {
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aFade', attr);
  return attr;
}
