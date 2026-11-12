import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { DELIVERY_CONVERT, SHARDS } from '../../src/data/items';
import { TECHS } from '../../src/data/techniques';
import { kindIndex } from '../../src/systems/enemies';

// Q56（docs/27 卡 B）：取代發射的技法（燈籠環、渦盤）在場時，穿透／濺射／碎裂不能變成廢卡
afterEach(() => resetTuning());
const DT = 1 / 60;

function make(yokai?: string) {
  tuning.stageSeconds = 600;
  const run = new Run({ seed: 5, bus: new EventBus(), yokai } as never);
  run.god = true;
  return run;
}

describe('取代發射的技法：穿透、濺射、碎裂自動轉換', () => {
  it('每一種「取代發射」的技法都是繞身機制（轉換規則才涵蓋；新增這類技法要補轉換）', () => {
    for (const t of TECHS.filter((x) => x.kind === 'delivery')) {
      expect((t.mech ?? t.id) === 'ring', `${t.id} 取代發射但不是繞身機制，沒有轉換規則`).toBe(true);
    }
  });

  it('穿透、濺射 → 繞身判定半徑變大，上限 hitRadiusCap', () => {
    const run = make();
    run.devAddTech('ring');
    const base = run.tech.ringHitMult;
    expect(base).toBe(1);
    run.pierceBonus = 2;
    expect(run.tech.ringHitMult).toBeCloseTo(1 + 2 * DELIVERY_CONVERT.hitRadiusPerPierce, 5);
    run.splashBonus = 1;
    expect(run.tech.ringHitMult).toBeGreaterThan(1 + 2 * DELIVERY_CONVERT.hitRadiusPerPierce);
    run.pierceBonus = 99;
    expect(run.tech.ringHitMult).toBeCloseTo(1 + DELIVERY_CONVERT.hitRadiusCap, 5);
  });

  it('碎裂 → 繞身打中人類時飛出碎片；沒有碎裂就不會', () => {
    const count = (shards: number) => {
      const run = make();
      run.devAddTech('ring');
      run.shardBonus = shards;
      // 一隻在環上、一隻在碎片射程內的旁觀者
      const R = run.tech.ringRadius;
      for (const [dx, dz] of [[R, 0], [R, 0.5], [R, -0.5], [R + 2, 1]]) {
        const i = run.enemies.spawn(kindIndex('villager'), run.px + dx, run.pz + dz, 1, 0, 0);
        run.enemies.hp[i] = run.enemies.maxHp[i] = 1e6;
        run.enemies.speed[i] = 0;
      }
      let made = 0;
      for (let k = 0; k < 120; k++) {
        if (run.awaitingPick) run.chooseCard(0);
        run.step(DT);
        for (let p = 0; p < run.projectiles.capacity; p++) if (run.projectiles.alive[p] && run.projectiles.gen[p] === 1) made++;
      }
      return made;
    };
    expect(count(0)).toBe(0);
    expect(count(3), '有碎裂時繞身命中沒有飛出碎片（舊版：碎裂完全沒用）').toBeGreaterThan(0);
  });

  it('碎片傷害比例沿用 SHARDS.damage（沒有另外放大）', () => {
    expect(SHARDS.damage).toBeLessThanOrEqual(0.35);
  });
});
