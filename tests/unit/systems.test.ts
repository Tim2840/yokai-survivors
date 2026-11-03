import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/lib/random';
import { SpatialHash } from '../../src/lib/spatialHash';
import { TerrainMap } from '../../src/world/terrainMap';
import { FlowField } from '../../src/systems/flowField';
import { Stats, armorMult } from '../../src/systems/stats';
import { CardDealer, cardById, pickRarity } from '../../src/systems/cards';
import { PROTOTYPE_MAP } from '../../src/data/maps/prototype';
import { STAT_IDS, STAT_LIMITS, STAT_BASE } from '../../src/data/stats';
import { STAT_CARDS } from '../../src/data/statCards';
import { RARITIES } from '../../src/data/rarity';
import { CARD_POOL_M1, xpNeed } from '../../src/data/progression';
import { computeMerit } from '../../src/systems/merit';

describe('空間雜湊', () => {
  it('跟暴力搜尋結果完全一樣（隨機 500 點、200 次查詢）', () => {
    const rng = new Rng(5);
    const n = 500;
    const xs = new Float32Array(n);
    const zs = new Float32Array(n);
    const alive = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = rng.range(-25, 25);
      zs[i] = rng.range(-25, 25);
      alive[i] = rng.next() < 0.9 ? 1 : 0;
    }
    const h = new SpatialHash(-25, -25, 50, 50, 2, n);
    h.rebuild(xs, zs, alive, n);
    const out = new Int32Array(512);
    for (let q = 0; q < 200; q++) {
      const x = rng.range(-26, 26);
      const z = rng.range(-26, 26);
      const r = rng.range(0.3, 8);
      const cnt = h.queryInto(x, z, r, xs, zs, out);
      const got = [...out.slice(0, cnt)].sort((a, b) => a - b);
      const want: number[] = [];
      for (let i = 0; i < n; i++) if (alive[i] && (xs[i] - x) ** 2 + (zs[i] - z) ** 2 <= r * r) want.push(i);
      expect(got).toEqual(want);
    }
  });
});

describe('地形', () => {
  const map = new TerrainMap(PROTOTYPE_MAP);
  it('出生點周圍 6 公尺（安全區）都是可走的平地', () => {
    for (let a = 0; a < 360; a += 15) for (const r of [0, 2, 4, 6]) {
      const x = Math.cos((a * Math.PI) / 180) * r;
      const z = Math.sin((a * Math.PI) / 180) * r;
      expect(map.isBlocked(x, z), `${x.toFixed(1)},${z.toFixed(1)}`).toBe(false);
    }
  });
  it('深水與障礙是阻擋、地圖外也是阻擋', () => {
    expect(map.isBlocked(-10, 8)).toBe(true);
    expect(map.isBlocked(6, 5)).toBe(true);
    expect(map.isBlocked(100, 0)).toBe(true);
  });
  it('淺水速度 ×0.8、草地 ×1', () => {
    expect(map.speedAt(-10 + 5, 8)).toBeCloseTo(0.8);
    expect(map.speedAt(0, 0)).toBe(1);
  });
  it('高度圖：丘的中心比平地高、最高 ≤ 12 公尺；陡坡不再標進阻擋圖（走不走得上去看移動方向的坡度）', () => {
    expect(map.heightAt(10, -8)).toBeGreaterThan(1.8);
    expect(Math.max(...map.heights)).toBeLessThanOrEqual(12);
    const nonObstacleBlocked = [...map.blocked].filter((b, c) => {
      if (!b) return false;
      const cx = map.minX + (c % map.cols) + 0.5, cz = map.minZ + Math.floor(c / map.cols) + 0.5;
      const nearObstacle = PROTOTYPE_MAP.obstacles.some((o) => (cx - o.x) ** 2 + (cz - o.z) ** 2 <= (o.r + 0.4) ** 2);
      return !nearObstacle && map.types[c] !== 2;
    }).length;
    expect(nonObstacleBlocked).toBe(0);
  });
  it('上坡 ×0.85、下坡 ×1.1', () => {
    expect(map.slopeMult(7, -8, 9, -8)).toBe(0.85);
    expect(map.slopeMult(11, -8, 13, -8)).toBe(1.1);
    expect(map.slopeMult(0, 0, 0.01, 0)).toBe(1);
  });
  it('熱路徑 heightAt／speedAt 不配置：連呼 20 萬次也很快', () => {
    const t0 = performance.now();
    let s = 0;
    for (let i = 0; i < 200000; i++) s += map.heightAt(i % 40 - 20, (i * 7) % 40 - 20) + map.speedAt(i % 30, i % 20);
    expect(s).not.toBeNaN();
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe('流場尋路（T7）', () => {
  const map = new TerrainMap(PROTOTYPE_MAP);
  const flow = new FlowField(map);
  it('所有可走的粗格都走得到玩家（深水另一側沒有孤島）', () => {
    flow.update(0, 0, true);
    let unreachable = 0;
    for (let c = 0; c < flow.blocked.length; c++) if (!flow.blocked[c] && flow.dist[c] === Infinity) unreachable++;
    expect(unreachable).toBe(0);
    expect(flow.isolated).toBe(false);
  });
  it('從地圖上任何可走格出發，沿流場一直走，一定走到玩家且不踩阻擋格', () => {
    flow.update(0, 0, true);
    const dir = new Float32Array(2);
    const target = flow.cellIndex(0, 0);
    for (let j = 0; j < flow.rows; j += 2) for (let i = 0; i < flow.cols; i += 2) {
      if (flow.blocked[j * flow.cols + i]) continue;
      let x = map.minX + (i + 0.5) * flow.cell;
      let z = map.minZ + (j + 0.5) * flow.cell;
      let steps = 0;
      while (flow.cellIndex(x, z) !== target && steps < 600) {
        expect(flow.dirAt(x, z, dir)).toBe(true);
        x += dir[0] * 0.5;
        z += dir[1] * 0.5;
        expect(map.isBlocked(x, z), `卡進阻擋格 ${x.toFixed(1)},${z.toFixed(1)}`).toBe(false);
        steps++;
      }
      expect(flow.cellIndex(x, z), `起點 ${i},${j} 沒走進玩家所在的格`).toBe(target);
    }
  });
  it('重算一次（50×50 公尺、2 公尺格）CPU 時間（記錄實測）', () => {
    flow.update(0, 0, true);
    const t0 = performance.now();
    for (let k = 0; k < 50; k++) flow.update(k % 2 ? 6 : -6, 2, true);
    const per = (performance.now() - t0) / 50;
    console.log(`流場重算（小地圖）${per.toFixed(3)} ms／次`);
    expect(per).toBeLessThan(10);
  });
  it('玩家沒換格就不重算', () => {
    flow.update(1.1, 1.1, true);
    expect(flow.update(1.4, 1.4)).toBe(false);
    expect(flow.update(5.5, 1.4)).toBe(true);
  });
});

describe('屬性', () => {
  it('加算：(基礎 + flat) × (1 + pct)，卡片單位正確', () => {
    const s = new Stats();
    s.addCard('maxHp', 10);
    s.addCard('power', 6);
    s.addCard('power', 10);
    s.addCard('crit', 3);
    expect(s.value.maxHp).toBe(110);
    expect(s.value.power).toBeCloseTo(1.16);
    expect(s.value.crit).toBeCloseTo(0.08);
  });
  it('全掃：每個屬性疊到極端都夾在 docs/02 的上下限內', () => {
    for (const id of STAT_IDS) {
      for (const v of [-1e6, 1e6]) {
        const a = new Stats();
        a.addFlat(id, v);
        const b = new Stats();
        b.addPct(id, v);
        for (const s of [a, b]) {
          const lim = STAT_LIMITS[id];
          const lo = lim.rel ? STAT_BASE[id] * lim.min : lim.min;
          const hi = lim.rel ? STAT_BASE[id] * lim.max : lim.max;
          expect(s.value[id], `${id} ${v}`).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(s.value[id], `${id} ${v}`).toBeLessThanOrEqual(hi + 1e-9);
        }
      }
    }
  });
  it('護甲公式：0→1、15→0.5、45 起封頂 0.25、−12 起封頂 1.8', () => {
    expect(armorMult(0)).toBe(1);
    expect(armorMult(15)).toBeCloseTo(0.5);
    expect(armorMult(45)).toBeCloseTo(0.25);
    expect(armorMult(60)).toBe(0.25);
    expect(armorMult(-12)).toBeCloseTo(1.8);
    expect(armorMult(-20)).toBe(1.8);
  });
  it('每張屬性卡的 stat 都是合法屬性、數值能被屬性系統吃進去', () => {
    for (const c of STAT_CARDS) {
      expect((STAT_IDS as readonly string[]).includes(c.stat), c.id).toBe(true);
      const s = new Stats();
      s.addCard(c.stat as (typeof STAT_IDS)[number], c.values.legend);
      expect(Number.isFinite(s.value[c.stat as (typeof STAT_IDS)[number]])).toBe(true);
    }
  });
});

describe('發牌', () => {
  it('三張是不同的卡、都在卡池內、稀有度只有已解鎖的', () => {
    const d = new CardDealer(new Rng(3), CARD_POOL_M1, ['common', 'rare']);
    for (let L = 1; L < 60; L++) {
      const o = d.deal(L, 0);
      expect(o).toHaveLength(3);
      expect(new Set(o.map((x) => x.cardId)).size).toBe(3);
      for (const c of o) {
        expect(CARD_POOL_M1).toContain(c.cardId);
        expect(['common', 'rare']).toContain(c.rarity);
        expect(cardById(c.cardId).values[c.rarity]).toBeGreaterThan(0);
      }
    }
  });
  it('同種子同結果；不同種子不同結果', () => {
    const run = (seed: number) => {
      const d = new CardDealer(new Rng(seed), CARD_POOL_M1, [...RARITIES]);
      return JSON.stringify(Array.from({ length: 20 }, (_, i) => d.deal(i + 1, 0)));
    };
    expect(run(9)).toBe(run(9));
    expect(run(9)).not.toBe(run(10));
  });
  it('稀有度分佈：L=20、幸運 0、全解鎖 ≈ 凡 64%／靈 23%／妖 10%／神 3%（docs/02 4.1）', () => {
    const rng = new Rng(11);
    const w = { common: 100, rare: 36, epic: 16, legend: 4 };
    const cnt: Record<string, number> = { common: 0, rare: 0, epic: 0, legend: 0 };
    const N = 20000;
    for (let i = 0; i < N; i++) cnt[pickRarity(rng, w)]++;
    expect(cnt.common / N).toBeCloseTo(0.641, 1);
    expect(cnt.rare / N).toBeCloseTo(0.231, 1);
    expect(cnt.epic / N).toBeCloseTo(0.103, 1);
  });
  it('保底：連續 5 次升級都沒有靈以上，下一次第 1 張至少是靈', () => {
    // 用一個永遠抽到「凡」的假亂數（next 恆為 0.99 會落在最後一個稀有度，所以只開 common+rare 並讓 rare 權重為 0：L=0、luck=-50 時 rare 仍>0，改用直接設 drought）
    const d = new CardDealer(new Rng(1), CARD_POOL_M1, ['common', 'rare']);
    d.drought = 5;
    // 對很多種子試：第 1 張一定不是凡
    for (let s = 0; s < 200; s++) {
      const dd = new CardDealer(new Rng(s), CARD_POOL_M1, ['common', 'rare']);
      dd.drought = 5;
      expect(dd.deal(1, 0)[0].rarity).toBe('rare');
    }
  });
});

describe('升級曲線與功德', () => {
  it('第 L 級需要 6 + 2.5L 魂火（docs/02 3.1）', () => {
    expect(xpNeed(0)).toBe(6);
    expect(xpNeed(10)).toBe(31);
  });
  it('功德（D22 版，docs/02 第 8.1 節）：每關 120 ＋ 擊殺 ÷ 10 ＋ 每隻頭目 100 ＋ 首次通關 200', () => {
    const m = computeMerit({ stagesCleared: 2, kills: 4000, bossesDefeated: 2, firstClear: true, meritStat: 0, night: 0, abandoned: false });
    expect(m).toBe(240 + 400 + 200 + 200);
    expect(computeMerit({ stagesCleared: 1, kills: 2000, bossesDefeated: 1, firstClear: false, meritStat: 0, night: 0, abandoned: false })).toBe(120 + 200 + 100);
  });
  it('放棄只給 50%；夜深度與功德加成相乘', () => {
    const base = { stagesCleared: 1, kills: 100, bossesDefeated: 0, firstClear: false, meritStat: 0, night: 0 };
    expect(computeMerit({ ...base, abandoned: true })).toBe(Math.floor(computeMerit({ ...base, abandoned: false }) * 0.5));
    expect(computeMerit({ ...base, night: 2, abandoned: false })).toBe(Math.floor((120 + 10) * 1.5));
  });
});
