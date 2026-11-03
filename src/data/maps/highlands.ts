import type { MapDef, Plateau } from './prototype';
import { Rng } from '../../lib/random';

/**
 * 大起伏的關卡地圖（M1.5，D23、D24）：約 120×120 公尺、高度 0～12 公尺。
 * 由種子生成：丘陵（高斯）、**台地**（有陡峭的懸崖邊，但一定有一條緩坡可以走上去）、水池、散落的岩石與石燈籠。
 * 地形骨架由種子決定，所以同種子同地圖（回報問題帶種子）；出生點周圍保證是平地。
 * 單元測試全掃多個種子：出生點平坦、可走區域連通、台地都有坡道。
 */
export const HIGHLANDS = {
  size: 120,
  hills: { count: 16, height: [1.5, 6.5], sigma: [5, 12] },
  plateaus: { count: 5, r: [8, 14], height: [2.2, 5.5], /** 懸崖邊的寬度（公尺）：要小於高度圖的格距（1 公尺），邊上的頂點才會「一格內直接升高」，不然低矮的懸崖會被取樣成可走的斜坡 */
    cliffEdge: 0.01, rampWidth: [9, 13] },
  ponds: { count: 3, r: [6, 11] },
  obstacles: { rocks: 40, lanterns: 14 },
  /** 出生點周圍保證平坦的半徑（公尺） */
  safeRadius: 12,
} as const;

function farFromStart(rng: Rng, half: number, min: number): { x: number; z: number } {
  for (let i = 0; i < 40; i++) {
    const x = rng.range(-half + 6, half - 6);
    const z = rng.range(-half + 6, half - 6);
    if (Math.hypot(x, z) >= min) return { x, z };
  }
  return { x: half - 10, z: half - 10 };
}

export function makeHighlands(seed: number): MapDef {
  const rng = new Rng(seed ^ 0x9e3779b1);
  const half = HIGHLANDS.size / 2;
  const H = HIGHLANDS;
  const hills = Array.from({ length: H.hills.count }, () => {
    const p = farFromStart(rng, half, H.safeRadius + 8);
    const height = rng.range(H.hills.height[0], H.hills.height[1]);
    // 丘的最大坡度 = 0.607 × 高度 ÷ σ：σ ≥ 1.4 × 高度 → ≤ 0.43（約 23°），一定走得上去
    return { ...p, height, sigma: Math.max(rng.range(H.hills.sigma[0], H.hills.sigma[1]), height * 1.4) };
  });
  const plateaus: Plateau[] = [];
  for (let n = 0; n < H.plateaus.count; n++) {
    const r = rng.range(H.plateaus.r[0], H.plateaus.r[1]);
    let p = farFromStart(rng, half, H.safeRadius + r + 10);
    // 台地彼此要離得夠遠（含緩坡的長度），否則疊在一起會把緩坡切斷
    for (let t = 0; t < 30 && plateaus.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < o.r + r + 30); t++) p = farFromStart(rng, half, H.safeRadius + r + 10);
    if (plateaus.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < o.r + r + 30)) continue;
    plateaus.push({
      ...p,
      r,
      height: rng.range(H.plateaus.height[0], H.plateaus.height[1]),
      // 緩坡面向出生點的大致方向（加一點隨機），玩家比較容易發現
      rampDir: Math.atan2(-p.z, -p.x) + rng.range(-0.8, 0.8),
      rampWidth: rng.range(H.plateaus.rampWidth[0], H.plateaus.rampWidth[1]),
      cliffEdge: H.plateaus.cliffEdge,
    });
  }
  // 台地（含緩坡）的範圍內不放池塘與障礙，免得把唯一的路堵死
  const nearPlateau = (x: number, z: number, extra: number) => plateaus.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + o.height * 1.6 + 4 + extra);
  /** 丘在某處的高度（池塘不放在山上，水面是平的） */
  const hillAt = (x: number, z: number) => hills.reduce((a, h) => a + h.height * Math.exp(-((x - h.x) ** 2 + (z - h.z) ** 2) / (2 * h.sigma * h.sigma)), 0);
  const zones = [] as MapDef['zones'];
  for (let i = 0; i < H.ponds.count; i++) {
    const r = rng.range(H.ponds.r[0], H.ponds.r[1]);
    let p = farFromStart(rng, half, H.safeRadius + 14);
    for (let t = 0; t < 60 && (nearPlateau(p.x, p.z, r) || hillAt(p.x, p.z) > 0.4); t++) p = farFromStart(rng, half, H.safeRadius + 14);
    if (nearPlateau(p.x, p.z, r) || hillAt(p.x, p.z) > 0.4) continue;
    zones.push({ ...p, r, type: 'shallow', depth: 0.15 });
    zones.push({ ...p, r: r * 0.45, type: 'deep', depth: 0.5 });
  }
  const obstacles: MapDef['obstacles'] = [];
  for (let i = 0; i < H.obstacles.rocks + H.obstacles.lanterns; i++) {
    let p = farFromStart(rng, half, H.safeRadius + 3);
    for (let t = 0; t < 40 && nearPlateau(p.x, p.z, 0); t++) p = farFromStart(rng, half, H.safeRadius + 3);
    if (nearPlateau(p.x, p.z, 0)) continue;
    const rock = i < H.obstacles.rocks;
    obstacles.push({ ...p, r: rock ? rng.range(0.8, 1.6) : 0.6, kind: rock ? 'rock' : 'lantern' });
  }
  return {
    id: 'highlands',
    size: { w: H.size, d: H.size },
    cell: 1,
    noiseSeed: seed & 0xffff,
    noiseHeight: 0.15,
    hills,
    zones,
    obstacles,
    playerStart: { x: 0, z: 0 },
    plateaus,
    flatRadius: H.safeRadius,
    edgeFalloff: 14,
  };
}
