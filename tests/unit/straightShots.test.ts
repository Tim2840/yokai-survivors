import { describe, it, expect } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { COMBAT } from '../../src/data/combat';
import { kindIndex } from '../../src/systems/enemies';

/**
 * 子彈不追蹤（使用者 2026-11-17）：出手時瞄一次、直線飛；只有彈跳（COMBAT.trackGen）會轉向追下一個人。
 * 舊版：每一顆都會依 turnRate 轉向目標 → 「目標移開後方向不變」這條會紅。
 */
function fly(yokaiId: 'chochin-kozo' | 'kappa', gen: number) {
  const run = new Run({ seed: 3, bus: new EventBus(), yokaiId });
  const en = run.enemies;
  for (let i = 0; i < en.capacity; i++) if (en.alive[i]) en.kill(i);
  run.director.active = false;
  const t = en.spawn(kindIndex('villager'), run.px + 8, run.pz, 5, 0, 0, 0, 1);
  en.update(0, run.px, run.pz, run.flow, 0, 0);
  const pr = run.projectiles;
  const p = pr.spawn(run.px, run.pz, 1, 0, run.yokai.weapon, 1, false, t, 0, gen);
  // 目標往側邊跑開
  en.z[t] += 6;
  en.update(0, run.px, run.pz, run.flow, 0, 0);
  for (let k = 0; k < 10; k++) pr.update(1 / 60, run.yokai.weapon, en, 1, () => {});
  return Math.atan2(pr.vz[p], pr.vx[p]);
}

describe('子彈直線飛，只有彈跳會追', () => {
  for (const y of ['chochin-kozo', 'kappa'] as const) {
    it(`${y}：主彈與碎片（gen 0/1/2）方向不變`, () => {
      for (const g of [0, 1, 2]) expect(Math.abs(fly(y, g))).toBeLessThan(1e-9);
    });
    it(`${y}：彈跳（gen ${COMBAT.trackGen}）會轉向目標`, () => {
      expect(fly(y, COMBAT.trackGen)).toBeGreaterThan(0.05);
    });
  }
});
