import { describe, expect, it } from 'vitest';
import { makeHighlands, HIGHLANDS } from '../../src/data/maps/highlands';
import { TerrainMap, WALL_TAN, plateauHeight } from '../../src/world/terrainMap';
import { FlowField } from '../../src/systems/flowField';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('大起伏地圖（M1.5）：全掃 20 個種子', () => {
  const maps = SEEDS.map((s) => ({ seed: s, def: makeHighlands(s), map: new TerrainMap(makeHighlands(s)) }));

  it('同種子同地圖（可重現）、不同種子不同', () => {
    expect(JSON.stringify(makeHighlands(5))).toBe(JSON.stringify(makeHighlands(5)));
    expect(JSON.stringify(makeHighlands(5))).not.toBe(JSON.stringify(makeHighlands(6)));
  });

  it('出生點周圍 12 公尺內是平地（高度差 ≤ 0.4 公尺）、不擋路', () => {
    for (const { seed, map } of maps) {
      const h0 = map.heightAt(0, 0);
      for (let a = 0; a < 360; a += 20) for (const r of [0, 4, 8, 12]) {
        const x = Math.cos((a * Math.PI) / 180) * r;
        const z = Math.sin((a * Math.PI) / 180) * r;
        expect(Math.abs(map.heightAt(x, z) - h0), `種子 ${seed} (${x.toFixed(1)},${z.toFixed(1)})`).toBeLessThan(0.4);
        expect(map.isBlocked(x, z), `種子 ${seed}`).toBe(false);
      }
    }
  });

  it('高度在 -1～12 公尺內；而且真的有起伏（最高處 ≥ 3 公尺）', () => {
    for (const { seed, map } of maps) {
      let lo = Infinity, hi = -Infinity;
      for (const h of map.heights) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
      expect(hi, `種子 ${seed}`).toBeLessThanOrEqual(12);
      expect(lo, `種子 ${seed}`).toBeGreaterThan(-1.2);
      expect(hi, `種子 ${seed} 太平`).toBeGreaterThan(3);
    }
  });

  it('有懸崖：每張圖都有一批「走得上去的坡度超過牆」的邊（人類與玩家走不上去）', () => {
    for (const { seed, map } of maps) {
      let cliffs = 0;
      for (let z = map.minZ + 1; z < map.maxZ - 1; z += 2) for (let x = map.minX + 1; x < map.maxX - 1; x += 2) {
        if (map.maxRiseAlong(x, z, x + 2, z) > WALL_TAN) cliffs++;
      }
      expect(cliffs, `種子 ${seed}`).toBeGreaterThan(20);
    }
  });

  it('台地不重疊（含緩坡長度）', () => {
    for (const { seed, def } of maps) {
      const ps = def.plateaus ?? [];
      expect(ps.length, `種子 ${seed} 台地太少`).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(Math.hypot(ps[i].x - ps[j].x, ps[i].z - ps[j].z), `種子 ${seed}`).toBeGreaterThanOrEqual(ps[i].r + ps[j].r + 30);
    }
  });

  it('每個台地都有緩坡：從出生點沿流場走得到台地上（沒有只能跳上去的孤島）', () => {
    for (const { seed, def, map } of maps) {
      const flow = new FlowField(map);
      flow.update(0, 0, true);
      for (const [k, p] of (def.plateaus ?? []).entries()) {
        // 台地頂（半徑 0.5r 內）至少有一格走得到
        let ok = false;
        for (let a = 0; a < 360 && !ok; a += 30) for (const f of [0, 0.3, 0.5]) {
          const x = p.x + Math.cos((a * Math.PI) / 180) * p.r * f;
          const z = p.z + Math.sin((a * Math.PI) / 180) * p.r * f;
          if (map.inBounds(x, z) && !map.isBlocked(x, z) && flow.reachable(x, z) && plateauHeight(p, x, z) > p.height * 0.8) ok = true;
        }
        expect(ok, `種子 ${seed} 台地 ${k} 走不上去（高 ${p.height.toFixed(1)}）`).toBe(true);
      }
    }
  });

  it('可走區域連通：走得到玩家的比例 ≥ 97%', () => {
    for (const { seed, map } of maps) {
      const flow = new FlowField(map);
      flow.update(0, 0, true);
      let walk = 0, reach = 0;
      for (let c = 0; c < flow.blocked.length; c++) if (!flow.blocked[c]) { walk++; if (flow.dist[c] < Infinity) reach++; }
      expect(reach / walk, `種子 ${seed}`).toBeGreaterThanOrEqual(0.97);
    }
  });

  it('流場重算（120×120 公尺、2 公尺格 = 3,600 格）CPU 時間（T8，記錄實測）', () => {
    const map = maps[0].map;
    const flow = new FlowField(map);
    flow.update(0, 0, true);
    const t0 = performance.now();
    for (let k = 0; k < 100; k++) flow.update(((k * 7) % 40) - 20, ((k * 3) % 40) - 20, true);
    const per = (performance.now() - t0) / 100;
    console.log(`流場重算 ${per.toFixed(3)} ms／次（${flow.cols}×${flow.rows} 格）`);
    expect(per).toBeLessThan(8);
  });

  it('玩家站在上不去的台地頂（把緩坡堵起來模擬）→ 流場標成孤島，不是全部卡死', () => {
    const def = makeHighlands(3);
    // 把第一個台地的緩坡改成懸崖（rampWidth 0 → 視窗幾乎為 0）
    const p = def.plateaus![0];
    p.rampWidth = 0;
    p.cliffEdge = 1.2;
    const map = new TerrainMap(def);
    const flow = new FlowField(map);
    flow.update(p.x, p.z, true);
    expect(flow.isolated || flow.reachableCount < 3000).toBe(true);
  });

  it('設定檔合理：尺寸 120、台地數與高度', () => {
    expect(HIGHLANDS.size).toBe(120);
    expect(HIGHLANDS.plateaus.height[1]).toBeLessThanOrEqual(12);
  });
});
