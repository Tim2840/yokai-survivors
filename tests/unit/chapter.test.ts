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

import { ITEM_POOL, itemById, ITEM_SLOTS } from '../../src/data/items';

describe('法具：武器改造與主武器（D30）', () => {
  it('鬼火增殖 +1 顆、最多 2 級；爆裂吃稀有度；穿透最多 3 級；主武器 8 級後不再升', () => {
    for (const id of ['volley', 'splash', 'pierce', 'ghostfire']) expect(ITEM_POOL).toContain(id);
    const run = new Run({ seed: 5, bus: new EventBus() });
    expect(run.volleyBonus).toBe(0);
    run.give('volley', 'epic');
    expect(run.volleyBonus).toBe(1);
    run.give('volley', 'legend');
    run.give('volley', 'legend');
    expect(run.volleyBonus).toBe(itemById('volley').maxLevel);
    run.give('splash', 'rare');
    expect(run.splashBonus).toBeCloseTo(0.3 * 1.2);
    for (let i = 0; i < 5; i++) run.give('pierce', 'common');
    expect(run.pierceBonus).toBe(itemById('pierce').maxLevel);
    expect(run.weaponLevel).toBe(1);
    for (let i = 0; i < 12; i++) run.give('ghostfire', 'common');
    expect(run.weaponLevel).toBe(itemById('ghostfire').maxLevel);
    expect(run.weaponDamageBonus).toBe(12);
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

import { SYNERGIES } from '../../src/data/synergies';
import { cardById } from '../../src/systems/cards';

describe('卡片聯動（D28）', () => {
  it('聯動需要的卡都存在；全掃：每個聯動只有兩張都有才觸發、只觸發一次、效果疊上去', () => {
    for (const sy of SYNERGIES) for (const id of sy.requires) expect(() => cardById(id), `${sy.id} 需要 ${id}`).not.toThrow();
    for (const sy of SYNERGIES) {
      const run = new Run({ seed: 5, bus: new EventBus() });
      const events: string[] = [];
      const bus = (run as unknown as { bus: EventBus }).bus;
      bus.on('synergy', (e) => events.push(e.id));
      run.give(sy.requires[0], 'common');
      expect(run.activeSynergies, `${sy.id} 只有一張不該觸發`).not.toContain(sy.id);
      run.give(sy.requires[1], 'common');
      expect(run.activeSynergies).toContain(sy.id);
      expect(events.filter((x) => x === sy.id)).toHaveLength(1);
      run.give(sy.requires[1], 'rare');
      run.give(sy.requires[0], 'rare');
      expect(events.filter((x) => x === sy.id), '同一個聯動只觸發一次').toHaveLength(1);
      expect(run.lastSynergy?.id).toBeTruthy();
    }
  });

  it('貫穿火：鬼火數量 +0.5、穿透 +1（加成值與投射物的穿透次數）', () => {
    const count = (withSynergy: boolean) => {
      const run = new Run({ seed: 9, bus: new EventBus() });
      run.god = true;
      if (withSynergy) {
        run.give('volley', 'common');
        run.give('pierce', 'common');
      }
      return run;
    };
    const a = count(true);
    expect(a.activeSynergies).toContain('piercingFire');
    expect(a.syn.pierce).toBe(1);
    expect(a.syn.volley).toBe(0.5);
    // 投射物真的帶著額外穿透次數
    const w = a.yokai.weapon;
    const i = a.projectiles.spawn(0, 0, 1, 0, w, 1, false, -1, Math.floor(a.pierceBonus + a.syn.pierce));
    expect(a.projectiles.pierceLeft[i]).toBe(w.pierce + Math.floor(a.pierceBonus + a.syn.pierce));
    const b = new Run({ seed: 9, bus: new EventBus() });
    b.give('volley', 'common');
    expect(b.activeSynergies).toHaveLength(0);
    expect(b.syn.pierce).toBe(0);
  });

  it('連環爆與燈火通明的加成', () => {
    const run = new Run({ seed: 4, bus: new EventBus() });
    run.give('splash', 'common');
    run.give('volley', 'common');
    expect(run.syn.splashMult).toBeCloseTo(1.3);
    expect(run.syn.splashRatio).toBeCloseTo(0.4);
    run.give('area', 'common');
    expect(run.syn.auraMult).toBeCloseTo(1.5);
  });
});
