import * as THREE from 'three';
import { Rng } from '../lib/random';

/**
 * 地表細節貼圖（像素畫風，D72）：一小張（64×64）可無縫重複的草地圖，**最近點取樣、不做 mipmap**，
 * 所以放大後是一格一格的方塊；內容是「平坦的底色＋少量刻意的小草符號（深色小 V）＋零星亮點」，
 * 而不是以前那種到處都有的細碎雜訊（雜訊在像素化後看起來像畫質差）。
 * 亮度範圍 (1 - strength)～1，平均約 1 - strength × 0.03（小草符號淡、只佔一小部分）：貼在地形上是「乘」，所以地形頂點色要先乘 groundDetailGain 補回來。
 */
export function groundDetailGain(strength: number): number {
  return 1 / (1 - strength * 0.03);
}

export function groundDetailTexture(seed: number, strength: number): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const lo = 1 - strength;
  const put = (x: number, y: number, v: number) => {
    const xx = ((x % size) + size) % size;
    const yy = ((y % size) + size) % size;
    const c = Math.round(Math.min(1, Math.max(0, v)) * 255);
    const i = (yy * size + xx) * 4;
    data[i] = data[i + 1] = data[i + 2] = c;
    data[i + 3] = 255;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, 1);
  const rng = new Rng(seed ^ 0x9e37);
  // 小草符號：深色的小 V（3 格高、5 格寬），每格之間留空，間隔均勻（把 64×64 分成 8×8 個格子，每格 55% 機率放一個）
  const cell = 8;
  for (let cy = 0; cy < size / cell; cy++) {
    for (let cx = 0; cx < size / cell; cx++) {
      if (rng.next() > 0.55) continue;
      const x = cx * cell + rng.int(1, 3);
      const y = cy * cell + rng.int(1, 4);
      const v = lo + (1 - lo) * 0.35; // 小草符號不要太深（太深在像素畫面上像一塊塊黑點）
      put(x, y, v);
      put(x + 4, y, v);
      put(x + 1, y + 1, v);
      put(x + 3, y + 1, v);
      put(x + 2, y + 2, v);
      // 一半的符號旁邊加一格較淺的陰影（讓符號有立體感）
      if (rng.next() < 0.5) put(x + 2, y + 3, lo + (1 - lo) * 0.55);
    }
  }
  // 零星的亮點（陽光照到的小草尖）：不加亮（貼圖最亮就是 1），所以用「周圍變暗、亮點保持 1」的方式：隨機一小塊 2×2 的淺色
  for (let i = 0; i < 6; i++) {
    const x = rng.int(0, size - 1);
    const y = rng.int(0, size - 1);
    const v = lo + (1 - lo) * 0.4;
    put(x, y, v);
    put(x + 1, y, v);
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}
