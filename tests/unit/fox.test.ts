import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { RARITIES } from '../../src/data/rarity';
import { FOX, FOX_SKIP } from '../../src/data/elements';
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
/** D99：走到商人身上、按互動 → 開狐面商面板（兩個提案＋不要）；回傳有沒有開 */
function openFox(run: Run, x: number, z: number): boolean {
  run.devTeleport(x, z);
  run.setMove(0, 0);
  for (let i = 0; i < 60 && run.offerKind !== 'fox'; i++) {
    if (run.awaitingPick) run.chooseCard(0);
    run.requestInteract();
    run.step(DT);
  }
  return run.offerKind === 'fox';
}
/** 狐面商面板裡選某個 cardId */
function pickFox(run: Run, cardId: string): void {
  const k = run.offer!.findIndex((o) => o.cardId === cardId);
  expect(k, cardId).toBeGreaterThanOrEqual(0);
  run.chooseCard(k);
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

  it('D99：站著不按不會收；按互動 → 面板（兩個提案＋不要）→ 選第 1 個 → 等級 +1、稀有度 = 狐面商的稀有度、結果卡寫出拿到什麼', () => {
    for (const r of RARITIES) {
      const run = make(32);
      const s = run.elements.devForce('fox', r, run.px, run.pz)!;
      expect(s, r).toBeTruthy();
      expect(s.offers).toHaveLength(FOX.offers);
      // 只站著：什麼都不收（舊版站進圈就收，會紅）
      standAt(run, s.x, s.z, 2);
      expect(run.elementResult).toBeNull();
      expect(s.usedAge).toBeLessThan(0);
      const id = s.offers[0];
      const lv0 = run.cardCounts.get(id) ?? 0;
      expect(openFox(run, s.x, s.z), r).toBe(true);
      expect(run.offer!.map((o) => o.cardId)).toEqual([...s.offers, FOX_SKIP]);
      pickFox(run, id);
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
      openFox(run, s.x, s.z);
      pickFox(run, id);
      return { id, up: run.stats.value[d.stat!] - up0, dn: dn0 - run.stats.value[d.down!.stat] };
    };
    const c = take('common');
    const l = take('legend');
    expect(l.id).toBe(c.id); // 同種子 → 同提案
    expect(l.up / c.up).toBeCloseTo(ITEM_RARITY_MULT.legend, 5);
    expect(l.dn / c.dn).toBeCloseTo(ITEM_RARITY_MULT.legend, 5);
  });

  it('D99：選「不要」→ 什麼都不收、商人還在，之後還能再按', () => {
    const run = make(34);
    const s = run.elements.devForce('fox', 'rare', run.px, run.pz)!;
    expect(openFox(run, s.x, s.z)).toBe(true);
    pickFox(run, FOX_SKIP);
    expect(run.offer).toBeNull();
    expect(run.elementResult).toBeNull();
    expect(s.usedAge).toBeLessThan(0);
    for (const id of s.offers) expect(run.cardCounts.get(id) ?? 0).toBe(0);
    expect(openFox(run, s.x, s.z), '還能再按').toBe(true);
  });

  it('道具欄滿了：新的取捨道具收不下（圈標成收不下、站多久都不收）；狐面商也不會再落下', () => {
    const run = make(35);
    const s = run.elements.devForce('fox', 'rare', run.px, run.pz)!;
    // 用其他道具把欄位塞滿
    for (const id of ['power', 'atkSpeed', 'area', 'hp', 'speed', 'armor', 'regen', 'dodge']) if ([...run.cardCounts.keys()].filter((k) => itemById(k).kind !== 'weapon').length < ITEM_SLOTS) run.give(id, 'common');
    while (run.awaitingPick) run.chooseCard(0);
    for (const id of s.offers) expect(run.canTakeItem(id)).toBe(false);
    expect(openFox(run, s.x, s.z), '全部收不下：按了也不開面板').toBe(false);
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
