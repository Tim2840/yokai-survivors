import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { SHARDS } from '../../src/data/items';
import { kindIndex } from '../../src/systems/enemies';

const DT = 1 / 60;
afterEach(() => resetTuning());

/** 一次只射 1 顆、沒有範圍濺射；清場後放：正前方一隻（主鬼火打牠）＋旁邊 k 隻（碎火的目標） */
function setup(shardLevels: number, around: number, variant?: 'kitsunebi') {
  tuning.stageSeconds = 600;
  tuning.volley = 1;
  tuning.splash = 0;
  const run = new Run({ seed: 91, bus: new EventBus() });
  run.god = true;
  for (let k = 0; k < shardLevels; k++) run.give('splash', 'common');
  if (variant) run.devAddTech(variant);
  const en = run.enemies;
  for (let i = 0; i < en.capacity; i++) if (en.alive[i]) en.kill(i);
  run.director.active = false;
  const put = (dx: number, dz: number) => {
    const i = en.spawn(kindIndex('villager'), run.px + dx, run.pz + dz, 5, 0, 0, 0, 1);
    en.hp[i] = en.maxHp[i] = 1e6;
    return i;
  };
  const main = put(4, 0);
  // 旁邊的都在主目標後方（離玩家比較遠），鬼火會先打主目標
  const side = Array.from({ length: around }, (_, k) => put(6 + 0.3 * k, (k - (around - 1) / 2) * 1.1));
  en.update(0, run.px, run.pz, run.flow, 0, 0);
  return { run, main, side };
}
/** 跑到主鬼火第一次打中為止，回傳那一刻所有碎片（gen > 0）的目標與傷害 */
function firstHitShards(run: Run, main: number) {
  const en = run.enemies;
  const pr = run.projectiles;
  for (let i = 0; i < 120 && en.hp[main] >= 1e6; i++) {
    run.setMove(0, 0);
    run.step(DT);
  }
  const out: { target: number; dmg: number; gen: number }[] = [];
  for (let k = 0; k < pr.capacity; k++) if (pr.alive[k] && pr.gen[k] > 0) out.push({ target: pr.target[k], dmg: pr.damage[k], gen: pr.gen[k] });
  return { shards: out, hit: 1e6 - en.hp[main] };
}

describe('碎火（D43）：爆裂改成碎片飛去打附近的敵人', () => {
  it('沒有碎火：命中時不飛出碎片', () => {
    const { run, main } = setup(0, 4);
    expect(firstHitShards(run, main).shards).toHaveLength(0);
  });

  it('碎火 5 級（平均 3 片）：命中時飛出 3 片、各打不同的「其他」敵人、每片傷害 = 那一發 × SHARDS.damage', () => {
    const { run, main, side } = setup(5, 6);
    expect(run.shardsExact).toBeCloseTo(3);
    const { shards, hit } = firstHitShards(run, main);
    expect(shards).toHaveLength(3);
    const targets = new Set(shards.map((s) => s.target));
    expect(targets.size).toBe(3);
    for (const s of shards) {
      expect(side).toContain(s.target);
      // hit 是 1e6 − 剩下的血，float32 在 1e6 附近的精度只有約 0.06，所以只比到小數點後一位
      expect(s.dmg).toBeCloseTo(hit * SHARDS.damage, 1);
      expect(s.gen).toBe(1);
    }
  });

  it('附近沒有其他敵人：不飛（不會打回同一隻）；片數上限 SHARDS.max', () => {
    const a = setup(5, 0);
    expect(firstHitShards(a.run, a.main).shards).toHaveLength(0);
    const b = setup(5, 10);
    b.run.shardBonus = 20;
    expect(firstHitShards(b.run, b.main).shards.length).toBeLessThanOrEqual(SHARDS.max);
  });

  it('狐火分裂放大碎火：有碎火時片數 +1，碎片打中後會再分裂（第 2 代）；沒有碎火時碎片不再分裂', () => {
    const { run } = setup(5, 8, 'kitsunebi');
    expect(run.shardsExact).toBeCloseTo(3 + 1);
    // 跑一段時間：應該看到第 2 代
    let gen2 = 0;
    for (let i = 0; i < 180; i++) {
      run.step(DT);
      for (let k = 0; k < run.projectiles.capacity; k++) if (run.projectiles.alive[k] && run.projectiles.gen[k] === 2) gen2++;
    }
    expect(gen2).toBeGreaterThan(0);
    const plain = setup(5, 8);
    let g2 = 0;
    for (let i = 0; i < 180; i++) {
      plain.run.step(DT);
      for (let k = 0; k < plain.run.projectiles.capacity; k++) if (plain.run.projectiles.alive[k] && plain.run.projectiles.gen[k] === 2) g2++;
    }
    expect(g2).toBe(0);
  });
});
