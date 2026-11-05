import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { RARITIES } from '../../src/data/rarity';
import { FOX } from '../../src/data/elements';
import { ITEM_POOL, ITEM_RARITY_MULT, ITEM_SLOTS, TRADE_ITEMS, itemById } from '../../src/data/items';
import { CardDealer } from '../../src/systems/cards';
import { Rng } from '../../src/lib/random';
import type { ResultLine } from '../../src/systems/elementResult';

const DT = 1 / 60;
afterEach(() => resetTuning());

function make(seed = 3) {
  tuning.stageSeconds = 600;
  const run = new Run({ seed, bus: new EventBus() });
  run.god = true;
  return run;
}
/** 站在 (x,z) sec 秒（升級先選掉、結果卡出現就停） */
function standAt(run: Run, x: number, z: number, sec: number) {
  run.devTeleport(x, z);
  run.setMove(0, 0);
  for (let i = 0; i < sec / DT && !run.elementResult; i++) {
    if (run.awaitingPick) run.chooseCard(0);
    run.step(DT);
  }
}

describe('狐面商（D38）：取捨道具只在這裡拿得到', () => {
  it('取捨道具不在升級卡池；全掃 2,000 次發牌（升級、賽錢箱、寶箱的固定稀有度），一次都不會出現', () => {
    for (const id of TRADE_ITEMS) {
      expect(ITEM_POOL).not.toContain(id);
      expect(itemById(id).down, id).toBeTruthy();
    }
    const dealer = new CardDealer(new Rng(7), ITEM_POOL, [...RARITIES]);
    for (let k = 0; k < 1000; k++) {
      for (const o of dealer.deal(1 + (k % 40), 0, new Map())) expect(TRADE_ITEMS).not.toContain(o.cardId);
      for (const o of dealer.dealRarity(RARITIES[k % 4], new Map())) expect(TRADE_ITEMS).not.toContain(o.cardId);
    }
  });

  it('已經有取捨道具時，下一級也不會從升級出現（只在狐面商）', () => {
    const run = make(31);
    run.give('cursedBlade', 'common');
    for (let k = 0; k < 40; k++) {
      run.addXp(run.xpNeeded);
      while (run.awaitingPick) {
        expect(run.offer!.some((o) => TRADE_ITEMS.includes(o.cardId)), '升級出現取捨道具').toBe(false);
        run.chooseCard(0);
      }
    }
  });

  it('站進紅圈 1 秒 → 收下第 1 個提案（等級 +1、稀有度 = 狐面商的稀有度）、結果卡寫出拿到什麼；站在商人身上不會收', () => {
    for (const r of RARITIES) {
      const run = make(32);
      const s = run.elements.devForce('fox', r, run.px, run.pz)!;
      expect(s, r).toBeTruthy();
      expect(s.offers).toHaveLength(FOX.offers);
      // 站在商人身上（不在圈內）：什麼都不收
      standAt(run, s.x, s.z, 2);
      expect(run.elementResult).toBeNull();
      expect(s.usedAge).toBeLessThan(0);
      const id = s.offers[0];
      const lv0 = run.cardCounts.get(id) ?? 0;
      standAt(run, s.ringX[0], s.ringZ[0], FOX.acceptSeconds + 0.5);
      expect(run.cardCounts.get(id), `${r} ${id}`).toBe(lv0 + 1);
      expect(run.picked.at(-1)).toEqual({ cardId: id, rarity: r });
      const res = run.elementResult!;
      expect(res.kind).toBe('fox');
      expect(res.lines).toEqual([{ t: 'item', cardId: id, rarity: r, level: lv0 + 1 } satisfies ResultLine]);
      expect(s.usedAge).toBeGreaterThanOrEqual(0);
    }
  });

  it('越高階越極端：極階的好處與代價都是凡階的 ITEM_RARITY_MULT.legend 倍', () => {
    const take = (r: (typeof RARITIES)[number]) => {
      const run = make(33);
      const s = run.elements.devForce('fox', r, run.px, run.pz)!;
      const id = s.offers[0];
      const d = itemById(id);
      const up0 = run.stats.value[d.stat!];
      const dn0 = run.stats.value[d.down!.stat];
      standAt(run, s.ringX[0], s.ringZ[0], FOX.acceptSeconds + 0.5);
      return { id, up: run.stats.value[d.stat!] - up0, dn: dn0 - run.stats.value[d.down!.stat] };
    };
    const c = take('common');
    const l = take('legend');
    expect(l.id).toBe(c.id); // 同種子 → 同提案
    expect(l.up / c.up).toBeCloseTo(ITEM_RARITY_MULT.legend, 5);
    expect(l.dn / c.dn).toBeCloseTo(ITEM_RARITY_MULT.legend, 5);
  });

  it('走出圈外進度退回；只站一下不會收', () => {
    const run = make(34);
    const s = run.elements.devForce('fox', 'rare', run.px, run.pz)!;
    standAt(run, s.ringX[1], s.ringZ[1], FOX.acceptSeconds * 0.6);
    expect(s.ringProgress[1]).toBeGreaterThan(0.3);
    standAt(run, s.x + 12, s.z, 1);
    expect(s.ringProgress[1]).toBe(0);
    expect(run.elementResult).toBeNull();
  });

  it('道具欄滿了：新的取捨道具收不下（圈標成收不下、站多久都不收）；狐面商也不會再落下', () => {
    const run = make(35);
    const s = run.elements.devForce('fox', 'rare', run.px, run.pz)!;
    // 用其他道具把欄位塞滿
    for (const id of ['power', 'atkSpeed', 'area', 'hp', 'speed', 'armor', 'regen', 'dodge']) if ([...run.cardCounts.keys()].filter((k) => itemById(k).kind !== 'weapon').length < ITEM_SLOTS) run.give(id, 'common');
    while (run.awaitingPick) run.chooseCard(0);
    for (const id of s.offers) expect(run.canTakeItem(id)).toBe(false);
    standAt(run, s.ringX[0], s.ringZ[0], 3);
    expect(s.ringBlocked[0]).toBe(true);
    expect(run.elementResult).toBeNull();
    expect(run.cardCounts.get(s.offers[0]) ?? 0).toBe(0);
    // 能收的一件都沒有 → pickKind 不會選狐面商
    const host = (run.elements as unknown as { host: { foxCandidates(): readonly string[] } }).host;
    expect(host.foxCandidates()).toEqual([]);
  });

  it('已經練滿的取捨道具不會再被提出來', () => {
    const run = make(36);
    for (let k = 0; k < itemById('cursedBlade').maxLevel; k++) run.give('cursedBlade', 'common');
    for (let n = 0; n < 20; n++) {
      run.devTeleport(run.px + (n % 2 ? 9 : -9), run.pz);
      const s = run.elements.devForce('fox', 'common', run.px, run.pz);
      if (s) expect(s.offers).not.toContain('cursedBlade');
    }
  });
});
