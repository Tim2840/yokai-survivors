import { describe, it, expect } from 'vitest';
import { STAGE, isBigMap, stagesForMap, bossHpMult } from '../../src/data/stage';
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

  it('Run：大關有 bigStages 關，最後一關頭目 HP = 同關一般地圖的 bigBossHp 倍', () => {
    tuning.stageSeconds = 60;
    const e = STAGE.chapter.everyMaps;
    const bossHp = (mapNumber: number, stages: number) => {
      const run = new Run({ seed: 7, bus: new EventBus(), mapNumber });
      expect(run.stageCount).toBe(stages);
      // 建構時已開始第 1 關
      for (let s = 1; s < stages; s++) run.startNextStage();
      run.devSetTime(48);
      for (let i = 0; i < 30; i++) run.step(1 / 60);
      return run.enemies.maxHp[run.director.bossIndex];
    };
    const normal = bossHp(1, STAGE.chapter.normalStages);
    const bigRun = bossHp(e, STAGE.chapter.bigStages);
    expect(normal).toBeGreaterThan(0);
    // 大關多一關，stageMult 也多一級；先扣掉它再比較
    const stageMult = (k: number) => 1 + STAGE.hpPerStage * k;
    const ratio = bigRun / stageMult(STAGE.chapter.bigStages - 1) / (normal / stageMult(STAGE.chapter.normalStages - 1));
    expect(ratio).toBeCloseTo(STAGE.chapter.bigBossHp);
  });
});

import { WEAPON_CARDS, WEAPON_LIMITS } from '../../src/data/weaponCards';
import { CARD_POOL_M1 } from '../../src/data/progression';

describe('武器卡（鬼火增殖、爆裂）', () => {
  it('在卡池裡；給一張就多發射／濺射變大；有上限', () => {
    for (const c of WEAPON_CARDS) expect(CARD_POOL_M1).toContain(c.id);
    const run = new Run({ seed: 5, bus: new EventBus() });
    expect(run.volleyBonus).toBe(0);
    run.give('volley', 'epic');
    expect(run.volleyBonus).toBeCloseTo(0.6);
    for (let i = 0; i < 20; i++) run.give('volley', 'legend');
    expect(run.volleyBonus).toBe(WEAPON_LIMITS.volley - 1);
    run.give('splash', 'rare');
    expect(run.splashBonus).toBeCloseTo(0.5);
    for (let i = 0; i < 10; i++) run.give('splash', 'legend');
    expect(run.splashBonus).toBe(WEAPON_LIMITS.splash);
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
