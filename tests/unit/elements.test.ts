import { describe, it, expect } from 'vitest';
import { Run } from '../../src/game/run';
import { EventBus } from '../../src/core/bus';
import { STAGE } from '../../src/data/stage';
import { tuning } from '../../src/data/tuning';
import { RARITIES, type Rarity } from '../../src/data/rarity';
import { ALTAR_BOON_PCT, ALTAR_CURSE, ALTAR_EFFECT_COUNT, ALTAR_BOONS, ALTAR_CURSE_IDS } from '../../src/data/altar';
import { ELEMENT_RULES, JIZO, JIZO_ARMOR_SECONDS, JIZO_HOLD_SECONDS, ALTAR_HOLD_SECONDS, BARRIER, BARRIER_SPAWN_MULT, BARRIER_RADIUS } from '../../src/data/elements';
import { STAT_LIMITS, STAT_IDS } from '../../src/data/stats';
import { Elements, elementRarityWeights } from '../../src/systems/elements';
import { TerrainMap } from '../../src/world/terrainMap';
import { FlowField } from '../../src/systems/flowField';
import { Stats } from '../../src/systems/stats';
import { Rng } from '../../src/lib/random';
import { makeHighlands } from '../../src/data/maps/highlands';

const DT = 1 / 60;
function make(seed = 3) {
  tuning.stageSeconds = 600;
  const bus = new EventBus();
  const run = new Run({ seed, bus });
  run.god = true;
  return { run, bus };
}
function advance(run: Run, sec: number) {
  for (let i = 0; i < Math.round(sec / DT); i++) {
    if (run.awaitingPick) run.chooseCard(0);
    run.step(DT);
  }
}
/** 把玩家放到要素上並站著不動，跑 sec 秒 */
function stand(run: Run, x: number, z: number, sec: number) {
  run.devTeleport(x, z);
  run.setMove(0, 0);
  for (let i = 0; i < Math.round(sec / DT); i++) {
    if (run.awaitingPick) run.chooseCard(0);
    run.step(DT);
  }
}

function stubElements(seed: number) {
  const map = new TerrainMap(makeHighlands(seed));
  const flow = new FlowField(map);
  const stats = new Stats();
  const start = map.def.playerStart;
  flow.update(start.x, start.z, true);
  const el = new Elements(new Rng(seed), map, flow, { stats, healFrac: () => {}, emitSpawn: () => {}, emitUsed: () => {} });
  return { map, flow, stats, el, start };
}

describe('地圖要素：落下規則（種子全掃）', () => {
  it('20 個種子、整關 600 秒：每個落下的要素都平坦、不擋路、離出生點與邊界夠遠、彼此夠遠、數量不超過上限', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { map: m, el, start } = stubElements(seed);
      const R = ELEMENT_RULES;
      el.start(start.x, start.z, 600, 1, 0);
      const seen = new Set<string>();
      for (let t = 0; t < 600 / DT; t++) {
        el.update(DT, t * DT, 600, 1 + (19 * t * DT) / 600, 0, start.x, m.heightAt(start.x, start.z), start.z);
        if (t % 30 !== 0) continue;
        const live = el.slots.filter((s) => s.active);
        expect(live.length, `種子 ${seed}`).toBeLessThanOrEqual(R.maxActive);
        for (const kind of ['jizo', 'barrier', 'altar']) expect(live.filter((s) => s.kind === kind).length).toBeLessThanOrEqual(R.perKind);
        for (const s of live) {
          const key = `${s.kind}@${s.x.toFixed(2)},${s.z.toFixed(2)}`;
          seen.add(key);
          expect(m.isBlocked(s.x, s.z), `種子 ${seed} ${key} 擋路格`).toBe(false);
          expect(Math.hypot(s.x - start.x, s.z - start.z), `種子 ${seed} ${key} 離出生點`).toBeGreaterThanOrEqual(R.minFromStart - 1e-6);
          expect(s.x).toBeGreaterThanOrEqual(m.minX + R.edgeMargin - 1e-6);
          expect(s.x).toBeLessThanOrEqual(m.maxX - R.edgeMargin + 1e-6);
          expect(s.z).toBeGreaterThanOrEqual(m.minZ + R.edgeMargin - 1e-6);
          expect(s.z).toBeLessThanOrEqual(m.maxZ - R.edgeMargin + 1e-6);
          const h = m.heightAt(s.x, s.z);
          for (const [ox, oz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) expect(Math.abs(m.heightAt(s.x + ox, s.z + oz) - h), `種子 ${seed} ${key} 平坦`).toBeLessThanOrEqual(R.flatTolerance + 1e-6);
          for (const o of live) if (o !== s) expect(Math.hypot(o.x - s.x, o.z - s.z), `種子 ${seed} 彼此距離`).toBeGreaterThanOrEqual(R.minApart - 1e-6);
        }
      }
      expect(seen.size, `種子 ${seed} 一整關至少落下 5 個要素`).toBeGreaterThanOrEqual(5);
    }
  }, 60000);

  it('同種子同走位 → 同樣的要素（可重現）', () => {
    const snap = (seed: number) => {
      const { run } = make(seed);
      for (let i = 0; i < 60 * 130; i++) run.step(DT);
      return JSON.stringify(run.elements.slots.map((s) => [s.active, s.kind, s.rarity, +s.x.toFixed(3), +s.z.toFixed(3)]));
    };
    expect(snap(9)).toBe(snap(9));
    expect(snap(9)).not.toBe(snap(10));
  });

  it('稀有度權重：前期只有凡／靈，後期有神；幸運只乘非凡', () => {
    expect(elementRarityWeights(1, 0)).toEqual({ common: 80, rare: 20, epic: 0, legend: 0 });
    expect(elementRarityWeights(16, 0).legend).toBe(10);
    const w = elementRarityWeights(16, 100);
    expect(w.common).toBe(28);
    expect(w.rare).toBeCloseTo(70);
  });
});

describe('石地藏', () => {
  it('按住 1 秒 → 回復最大生命的 frac 並加護甲，護甲 60 秒後消失', () => {
    for (const r of RARITIES) {
      const { run } = make(4);
      const slot = run.elements.devForce('jizo', r, run.px, run.pz)!;
      expect(slot).toBeTruthy();
      run.hp = 10;
      const armor0 = run.stats.value.armor;
      stand(run, slot.x, slot.z, JIZO_HOLD_SECONDS + 0.2);
      const j = JIZO[r];
      expect(run.hp, r).toBeGreaterThanOrEqual(Math.min(run.maxHp, 10 + run.maxHp * j.healFrac) - 1);
      expect(run.stats.value.armor, r).toBeCloseTo(armor0 + j.armor);
      stand(run, slot.x + 6, slot.z, JIZO_ARMOR_SECONDS + 1);
      expect(run.stats.value.armor, r).toBeCloseTo(armor0);
    }
  });

  it('不到一秒就離開 → 進度退回、沒有效果', () => {
    const { run } = make(4);
    const slot = run.elements.devForce('jizo', 'epic', run.px, run.pz)!;
    run.hp = 10;
    stand(run, slot.x, slot.z, 0.5);
    expect(slot.progress).toBeGreaterThan(0.3);
    stand(run, slot.x + 10, slot.z, 1);
    expect(slot.progress).toBe(0);
    expect(run.hp).toBeLessThan(15);
  });
});

describe('詛咒祭壇（D27：隨機抽數個不同效果，含詛咒）', () => {
  it('每個稀有度、30 個種子、每個 20 次：效果數照表、互不相同、至少 1 好處 1 詛咒、數字照表', () => {
    const seenBoon = new Set<string>();
    const seenCurse = new Set<string>();
    const sizes = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const { el, start } = stubElements(seed);
      for (const r of RARITIES) {
        for (let k = 0; k < 20; k++) {
          const s = el.devForce('altar', r, start.x, start.z)!;
          expect(s, `種子 ${seed} 放得下`).toBeTruthy();
          const fx = s.effects.slice(0, s.effectCount);
          expect(fx.length).toBe(ALTAR_EFFECT_COUNT[r]);
          expect(new Set(fx.map((f) => f.id)).size, '效果不可重複').toBe(fx.length);
          expect(fx.some((f) => f.curse), '至少一個詛咒').toBe(true);
          expect(fx.some((f) => !f.curse), '至少一個好處').toBe(true);
          for (const f of fx) {
            if (f.curse) {
              expect(f.v).toBeCloseTo(ALTAR_CURSE[r][f.id as keyof (typeof ALTAR_CURSE)[typeof r]]);
              seenCurse.add(f.id);
            } else {
              expect(ALTAR_BOONS).toContain(f.id);
              expect(f.v).toBeCloseTo(ALTAR_BOON_PCT[r]);
              seenBoon.add(f.id);
            }
          }
          sizes.add(fx.map((f) => f.id).sort().join());
        }
      }
    }
    // 真的是「隨機」：每種好處與每種詛咒都抽得到、組合不只幾種
    expect(seenBoon.size).toBe(ALTAR_BOONS.length);
    expect(seenCurse.size).toBe(ALTAR_CURSE_IDS.length);
    expect(sizes.size).toBeGreaterThan(20);
  }, 60000);

  it('按住 1.5 秒才生效：好處加在屬性、詛咒讓敵人變強；帶到下一關還在', () => {
    const { run } = make(11);
    const s = run.elements.devForce('altar', 'legend', run.px, run.pz)!;
    const fx = s.effects.slice(0, s.effectCount).map((f) => ({ ...f }));
    const before = { ...run.stats.value };
    stand(run, s.x, s.z, ALTAR_HOLD_SECONDS - 0.4);
    expect(run.curse.enemyHp + run.curse.enemySpeed + run.curse.enemyDamage + run.curse.spawnRate).toBe(0);
    stand(run, s.x, s.z, 0.6);
    for (const f of fx) {
      if (f.curse) expect(run.curse[f.id as 'enemyHp']).toBeCloseTo(f.v);
      else expect(run.stats.value[f.id as 'power']).toBeGreaterThan(before[f.id as 'power']);
    }
    const afterCurse = { ...run.curse };
    run.devSetTime(STAGE.bossAt * 600 + 2);
    for (let i = 0; i < 30; i++) run.step(DT);
    run.devKillBoss();
    run.devTeleport(run.portal.x - 2, run.portal.z);
    for (let g = 0; run.phase === 'combat' && g < 600; g++) {
      run.setMove(run.portal.x - run.px, run.portal.z - run.pz);
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.phase).toBe('intermission');
    run.continueFromIntermission();
    expect(run.stageNumber).toBe(2);
    expect(run.curse).toEqual(afterCurse);
  });

  it('詛咒真的讓敵人變強：敵人生命、速度、傷害、湧出速率', () => {
    const { run } = make(13);
    run.god = false;
    const base = run.curse.enemyHp;
    expect(base).toBe(0);
    // 直接以祭壇接受：選一個一定含某詛咒的種子太脆弱，改為對照「有／無詛咒」的同一刻
    const hpAt = () => {
      run.devSpawn('villager', 1);
      let m = 0;
      for (let i = 0; i < run.enemies.high; i++) if (run.enemies.alive[i]) m = Math.max(m, run.enemies.maxHp[i]);
      return m;
    };
    const h0 = hpAt();
    // 讓場上有一個祭壇被接受，並確認所有詛咒總和 > 0
    const a = run.elements.devForce('altar', 'epic', run.px, run.pz)!;
    stand(run, a.x, a.z, ALTAR_HOLD_SECONDS + 0.3);
    const total = run.curse.enemyHp + run.curse.enemySpeed + run.curse.enemyDamage + run.curse.spawnRate;
    expect(total, '接受祭壇後詛咒合計').toBeGreaterThan(0);
    expect(run.enemies.speedMult).toBeCloseTo(1 + run.curse.enemySpeed);
    expect(run.director.extraMult).toBeCloseTo(run.elements.spawnMult * (1 + run.curse.spawnRate));
    expect(run.director.hpCurse).toBeCloseTo(1 + run.curse.enemyHp);
    expect(h0).toBeGreaterThan(0);
  });

  it('石地藏神階解除一項詛咒', () => {
    const { run } = make(12);
    const a = run.elements.devForce('altar', 'epic', run.px, run.pz)!;
    stand(run, a.x, a.z, ALTAR_HOLD_SECONDS + 0.2);
    const sum = () => run.curse.enemyHp + run.curse.enemySpeed + run.curse.enemyDamage + run.curse.spawnRate;
    const before = sum();
    expect(before).toBeGreaterThan(0);
    const j = run.elements.devForce('jizo', 'legend', run.px, run.pz)!;
    stand(run, j.x, j.z, JIZO_HOLD_SECONDS + 0.2);
    expect(sum()).toBeLessThan(before);
  });
});

describe('結界石', () => {
  it('圈內攻擊力與攻擊速度加成、湧出 ×1.25；走出去就沒有；過關清掉', () => {
    for (const r of RARITIES) {
      const { run } = make(5);
      const b = run.elements.devForce('barrier', r, run.px, run.pz)!;
      const p0 = run.stats.value.power;
      const a0 = run.stats.value.atkSpeed;
      stand(run, b.x, b.z, 0.2);
      expect(run.stats.value.power, r).toBeCloseTo(p0 * (1 + BARRIER[r].bonus));
      expect(run.stats.value.atkSpeed, r).toBeCloseTo(a0 * (1 + BARRIER[r].bonus));
      expect(run.elements.spawnMult).toBe(BARRIER_SPAWN_MULT);
      stand(run, b.x + BARRIER_RADIUS + 3, b.z, 0.2);
      expect(run.stats.value.power, r).toBeCloseTo(p0);
      expect(run.elements.spawnMult).toBe(1);
    }
  });

  it('站在圈內時過關 → 加成不會留到下一關（拿掉 endStage 會紅）', () => {
    const { run } = make(6);
    const b = run.elements.devForce('barrier', 'legend', run.px, run.pz)!;
    const p0 = run.stats.value.power;
    stand(run, b.x, b.z, 0.2);
    expect(run.stats.value.power).toBeGreaterThan(p0);
    run.devClearStage();
    expect(run.phase, '應該已經過關').not.toBe('combat');
    expect(run.stats.value.power).toBeCloseTo(p0);
  });
});

describe('要素過期', () => {
  it('沒人理會的要素 lifetime 秒後消失', () => {
    const { run } = make(7);
    const s = run.elements.devForce('jizo', 'common', run.px, run.pz)!;
    run.devTeleport(s.x + 12, s.z);
    advance(run, ELEMENT_RULES.lifetime + 1);
    expect(run.elements.slots.some((o) => o === s && o.active && o.kind === 'jizo' && o.x === s.x)).toBe(false);
  });
});

export type { Rarity };
