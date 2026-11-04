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
