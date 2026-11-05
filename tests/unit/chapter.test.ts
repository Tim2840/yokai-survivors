import { describe, it, expect } from 'vitest';
import { STAGE, isBigMap, stagesForMap, bossHpMult, isBigBossStage } from '../../src/data/stage';
import { DIFFICULTY } from '../../src/data/difficulty';
import { Run } from '../../src/game/run';
import { EventBus } from '../../src/core/bus';
import { tuning } from '../../src/data/tuning';

describe('章節制（D26）：每第 N 張地圖是 3 關的大關、頭目更強', () => {
  it('地圖 1～9 的關數：一般 2、每第 everyMaps 張 3', () => {
    const got = Array.from({ length: 9 }, (_, i) => stagesForMap(i + 1));
    const e = STAGE.chapter.everyMaps;
    const want = Array.from({ length: 9 }, (_, i) => ((i + 1) % e === 0 ? STAGE.chapter.bigStages : STAGE.chapter.normalStages));
    expect(got).toEqual(want);
    expect(isBigMap(0)).toBe(false);
    expect(isBigMap(e)).toBe(true);
  });

  it('頭目 HP 倍率只加在大關的最後一關', () => {
    const e = STAGE.chapter.everyMaps;
    const big = stagesForMap(e);
    for (let s = 0; s < big; s++) expect(bossHpMult(e, s)).toBe(s === big - 1 ? STAGE.chapter.bigBossHp : 1);
    for (let s = 0; s < stagesForMap(1); s++) expect(bossHpMult(1, s)).toBe(1);
    expect(STAGE.chapter.bigBossHp).toBeGreaterThan(1);
  });

  it('Run：大關有 bigStages 關，最後一關頭目自動出現、沒有召喚祭壇，HP = 一般小頭目（同難度、剛顯現就召喚）的 bigBossHp 倍', () => {
    tuning.stageSeconds = 60;
    const e = STAGE.chapter.everyMaps;
    const bossHp = (mapNumber: number, stages: number) => {
      const run = new Run({ seed: 7, bus: new EventBus(), mapNumber });
      expect(run.stageCount).toBe(stages);
      // 建構時已開始第 1 關
      for (let s = 1; s < stages; s++) run.startNextStage();
      const big = isBigBossStage(mapNumber, stages - 1);
      expect(run.summonStage).toBe(!big);
      if (big) run.devSetTime(48);
      else expect(run.devSummonBoss()).toBe(true); // t = 0 召喚：越晚越強的倍率 = 1
      for (let i = 0; i < 30; i++) run.step(1 / 60);
      if (big) {
        // 大頭目那一關：過了祭壇顯現的時間也不會有祭壇
        run.devSetTime(STAGE.summon.appearAt * 60 + 1);
        run.step(1 / 60);
        expect(run.elements.summonSlot).toBeNull();
      }
      return run.enemies.maxHp[run.director.bossIndex] / (1 + run.difficulty * DIFFICULTY.hp);
    };
    const normal = bossHp(1, STAGE.chapter.normalStages);
    const bigRun = bossHp(e, STAGE.chapter.bigStages);
    expect(normal).toBeGreaterThan(0);
    expect(bigRun / normal).toBeCloseTo(STAGE.chapter.bigBossHp);
  });
});

import { ITEM_POOL, itemById, ITEM_SLOTS, GHOSTFIRE_LEVELS } from '../../src/data/items';

describe('法具：武器改造與主武器（D30）', () => {
  it('鬼火增殖 +1 顆、最多 2 級；碎火吃稀有度；穿透最多 3 級；主武器 8 級後不再升', () => {
    for (const id of ['volley', 'splash', 'pierce', 'ghostfire']) expect(ITEM_POOL).toContain(id);
    const run = new Run({ seed: 5, bus: new EventBus() });
    expect(run.volleyBonus).toBe(0);
    run.give('volley', 'epic');
    expect(run.volleyBonus).toBe(1);
    run.give('volley', 'legend');
    run.give('volley', 'legend');
    expect(run.volleyBonus).toBe(itemById('volley').maxLevel);
    // 碎火（D43）：每級平均多飛出 0.6 片 × 稀有度
    run.give('splash', 'rare');
    expect(run.shardBonus).toBeCloseTo(0.6 * 1.2);
    expect(run.splashBonus).toBe(0);
    for (let i = 0; i < 5; i++) run.give('pierce', 'common');
    expect(run.pierceBonus).toBe(itemById('pierce').maxLevel);
    expect(run.weaponLevel).toBe(1);
    for (let i = 0; i < 12; i++) run.give('ghostfire', 'common');
    expect(run.weaponLevel).toBe(itemById('ghostfire').maxLevel);
    expect(run.weaponDamageBonus).toBe(GHOSTFIRE_LEVELS.reduce((a, s) => a + (s.damage ?? 0), 0));
    expect(run.cooldownMult).toBeCloseTo(0.81);
  });
  it('道具欄位上限：裝滿以後升級只出現已有道具（與主武器、備用獎勵）', () => {
    const run = new Run({ seed: 8, bus: new EventBus() });
    const six = ['power', 'atkSpeed', 'area', 'hp', 'armor', 'regen'];
    for (const id of six) run.give(id, 'common');
    expect(six.length).toBe(ITEM_SLOTS);
    for (let k = 0; k < 30; k++) {
      const o = run.dealer.deal(5, 0, run.cardCounts);
      for (const c of o) expect([...six, 'ghostfire', 'heal', 'meritBag'], `欄位滿了還出現 ${c.cardId}`).toContain(c.cardId);
    }
  });
  it('全部練滿後只出現備用獎勵：療傷回血、香油錢加功德', () => {
    const run = new Run({ seed: 9, bus: new EventBus() });
    const six = ['power', 'atkSpeed', 'area', 'hp', 'armor', 'regen'];
    for (const id of [...six, 'ghostfire']) for (let i = 0; i < 10; i++) run.give(id, 'common');
    const o = run.dealer.deal(30, 0, run.cardCounts);
    expect(o.map((c) => c.cardId).sort()).toEqual(['heal', 'meritBag']);
    run.hp = 10;
    run.give('heal', 'common');
    expect(run.hp).toBeGreaterThan(10);
    const m = run.bonusMerit;
    run.give('meritBag', 'common');
    expect(run.bonusMerit).toBeGreaterThan(m);
  });
});

import { SYNERGIES, synergyTierOf } from '../../src/data/synergies';
import { cardById } from '../../src/systems/cards';

/** 把道具升到指定等級（主武器 Lv4 的招式變化選第一個） */
function levelTo(run: Run, id: string, lv: number) {
  for (let g = 0; g < 12 && (run.cardCounts.get(id) ?? 0) < lv; g++) {
    run.give(id, 'common');
    while (run.awaitingPick) run.chooseCard(0);
  }
}

describe('卡片聯動（D28；D37 分初／極兩段）', () => {
  it('資料全掃：兩件道具都存在；每段的門檻 ≤ 道具最高等級；極的門檻 ≥ 初；極的效果 ≥ 初', () => {
    for (const sy of SYNERGIES) {
      for (const id of sy.items) expect(() => cardById(id), `${sy.id} 需要 ${id}`).not.toThrow();
      const [t1, t2] = sy.tiers;
      for (const tier of sy.tiers) {
        expect(Object.keys(tier.requires).sort(), sy.id).toEqual([...sy.items].sort());
        for (const [id, n] of Object.entries(tier.requires)) expect(n, `${sy.id} ${id}`).toBeLessThanOrEqual(cardById(id).maxLevel);
      }
      for (const id of sy.items) expect(t2.requires[id]).toBeGreaterThanOrEqual(t1.requires[id]);
      expect(Object.entries(t2.requires).some(([id, n]) => n > t1.requires[id]), `${sy.id} 極和初的門檻一樣`).toBe(true);
      for (const [k, v] of Object.entries(t1.effect)) expect((t2.effect as Record<string, number>)[k], `${sy.id} ${k}`).toBeGreaterThanOrEqual(v as number);
    }
  });

  it('全掃：每個聯動——兩件都 1 級不觸發（舊版會紅）、到初的門檻觸發「初」、到極升段；每段只觸發一次；效果 = 該段的總效果', () => {
    for (const sy of SYNERGIES) {
      const run = new Run({ seed: 5, bus: new EventBus() });
      const events: string[] = [];
      const bus = (run as unknown as { bus: EventBus }).bus;
      bus.on('synergy', (e) => events.push(`${e.id}:${e.tier}`));
      for (const id of sy.items) levelTo(run, id, 1);
      expect(run.activeSynergies, `${sy.id} 兩件都 1 級就觸發了`).not.toContain(sy.id);
      // 初：除了最後一件，其他都到門檻；最後一件差一級
      const req1 = Object.entries(sy.tiers[0].requires);
      for (const [id, n] of req1.slice(0, -1)) levelTo(run, id, n);
      const [lastId, lastN] = req1[req1.length - 1];
      levelTo(run, lastId, lastN - 1);
      expect(run.synergyTiers.get(sy.id) ?? 0, `${sy.id} 差一級`).toBe(synergyTierOf(sy, run.cardCounts));
      if (synergyTierOf(sy, run.cardCounts) === 0) {
        levelTo(run, lastId, lastN);
      }
      expect(run.synergyTiers.get(sy.id)).toBe(1);
      expect(run.activeSynergies).toContain(sy.id);
      for (const [id, n] of Object.entries(sy.tiers[1].requires)) levelTo(run, id, n);
      expect(run.synergyTiers.get(sy.id)).toBe(2);
      expect(events.filter((x) => x === `${sy.id}:1`), '初只觸發一次').toHaveLength(1);
      expect(events.filter((x) => x === `${sy.id}:2`), '極只觸發一次').toHaveLength(1);
      expect(run.lastSynergy?.tier).toBe(2);
    }
  });

  it('升段只補差額：連環爆到極時的總加成 = 極的效果（不是初＋極）', () => {
    const run = new Run({ seed: 4, bus: new EventBus() });
    const sy = SYNERGIES.find((x) => x.id === 'chainBlast')!;
    levelTo(run, 'volley', 2);
    levelTo(run, 'splash', 3);
    expect(run.syn.shardCount).toBeCloseTo(sy.tiers[0].effect.shardCount!);
    expect(run.syn.shardDamage).toBeCloseTo(sy.tiers[0].effect.shardDamage ?? 0);
    levelTo(run, 'splash', 5);
    expect(run.syn.shardCount).toBeCloseTo(sy.tiers[1].effect.shardCount!);
    expect(run.syn.shardDamage).toBeCloseTo(sy.tiers[1].effect.shardDamage!);
    // 燈火通明（爆裂已 5 級）：廣域到 3 → 初、到 5 → 極
    const lg = SYNERGIES.find((x) => x.id === 'lanternGlow')!;
    levelTo(run, 'area', 3);
    expect(run.syn.auraMult).toBeCloseTo(lg.tiers[0].effect.auraMult!);
    levelTo(run, 'area', 5);
    expect(run.syn.auraMult).toBeCloseTo(lg.tiers[1].effect.auraMult!);
  });

  it('貫穿火：極時穿透 +1、鬼火 +0.5；投射物真的帶著額外穿透', () => {
    const a = new Run({ seed: 9, bus: new EventBus() });
    a.god = true;
    levelTo(a, 'volley', 2);
    levelTo(a, 'pierce', 3);
    expect(a.synergyTiers.get('piercingFire')).toBe(2);
    expect(a.syn.pierce).toBe(1);
    expect(a.syn.volley).toBe(0.5);
    const w = a.yokai.weapon;
    const i = a.projectiles.spawn(0, 0, 1, 0, w, 1, false, -1, Math.floor(a.pierceBonus + a.syn.pierce));
    expect(a.projectiles.pierceLeft[i]).toBe(w.pierce + Math.floor(a.pierceBonus + a.syn.pierce));
  });
});
