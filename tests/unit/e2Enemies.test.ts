import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { ENEMIES } from '../../src/data/enemies';
import { recipeFor } from '../../src/data/spawnRecipes';
import { kindIndex } from '../../src/systems/enemies';
import { ZONE_LINGER } from '../../src/systems/enemyShots';

/** E-2 新人類（docs/22）：僧兵（護法）、太鼓兵（鼓舞）、探子（衝刺）、陰陽師（紅圈）。直接驅動敵人池，不讓武器干擾 */
const DT = 1 / 60;
afterEach(() => resetTuning());
function make(seed = 3): Run {
  tuning.stageSeconds = 600;
  const run = new Run({ seed, bus: new EventBus(), yokaiId: 'chochin-kozo' });
  run.god = true;
  run.director.active = false;
  for (let i = 0; i < run.enemies.high; i++) if (run.enemies.alive[i]) run.enemies.kill(i);
  return run;
}
/** 只跑敵人（不出手、不受傷），回傳 run 讓測試讀狀態 */
function stepEnemies(run: Run, seconds: number, px = run.px, pz = run.pz): void {
  for (let k = 0; k < Math.round(seconds / DT); k++) run.enemies.update(DT, px, pz, run.flow, 0, 0, run.shots);
}
/** 在玩家附近找一個走得到的位置（偏移 dx, dz） */
const at = (run: Run, dx: number, dz: number) => [run.px + dx, run.pz + dz] as const;

describe('僧兵：護法', () => {
  it('範圍內的同伴受傷 × (1 − reduction)，自己不算；範圍外、僧兵倒下後恢復（舊版沒有護法會紅）', () => {
    const run = make();
    const en = run.enemies;
    const A = ENEMIES.sohei.aura!;
    const s = en.spawn(kindIndex('sohei'), ...at(run, 10, 0), 1, 0, 0);
    const near = en.spawn(kindIndex('villager'), ...at(run, 10, A.radius - 1.5), 1, 0, 0);
    const far = en.spawn(kindIndex('villager'), ...at(run, 10, -(A.radius + 4)), 1, 0, 0);
    for (const i of [s, near, far]) en.speed[i] = 0;
    stepEnemies(run, DT * 2);
    expect(en.guard(near, 100)).toBeCloseTo(100 * (1 - A.reduction), 5);
    expect(en.guard(far, 100)).toBeCloseTo(100, 5);
    expect(en.guard(s, 100), '僧兵自己不吃護法').toBeCloseTo(100, 5);
    en.kill(s);
    stepEnemies(run, DT * 2);
    expect(en.guard(near, 100), '僧兵倒下後').toBeCloseTo(100, 5);
  });
});

describe('太鼓兵：鼓舞', () => {
  it('範圍內的同伴走得比較快；自己躲在 keep 外不靠近', () => {
    const run = make();
    const en = run.enemies;
    const D = ENEMIES.taiko.drum!;
    const t = en.spawn(kindIndex('taiko'), ...at(run, D.keep + 0.5, 0), 1, 0, 0);
    const buffed = en.spawn(kindIndex('villager'), ...at(run, D.keep + 0.5, 1.5), 1, 0, 0);
    const plain = en.spawn(kindIndex('villager'), ...at(run, -(D.keep + 0.5), 0), 1, 0, 0);
    stepEnemies(run, DT * 2);
    expect(en.buffSpd[buffed]).toBeCloseTo(1 + D.speed, 5);
    expect(en.buffSpd[plain]).toBeCloseTo(1, 5);
    expect(en.buffSpd[t], '太鼓兵自己不吃').toBeCloseTo(1, 5);
    const d0 = Math.hypot(en.x[t] - run.px, en.z[t] - run.pz);
    stepEnemies(run, 3);
    const d1 = Math.hypot(en.x[t] - run.px, en.z[t] - run.pz);
    expect(d1, '太鼓兵不會貼上來').toBeGreaterThan(D.keep * 0.7);
    expect(Math.abs(d1 - d0)).toBeLessThan(2);
  });
});

describe('探子：衝刺', () => {
  it('進到 trigger 內 → 站定預告 windup 秒 → 往偏一邊的方向衝 speed×seconds 公尺 → 冷卻', () => {
    const run = make();
    const en = run.enemies;
    const S = ENEMIES.shinobi.dash!;
    const i = en.spawn(kindIndex('shinobi'), ...at(run, S.trigger - 1, 0), 1, 0, 0);
    en.shootCd[i] = 0;
    stepEnemies(run, DT);
    expect(en.wind[i], '進到範圍就開始預告').toBeGreaterThan(0);
    const x0 = en.x[i];
    const z0 = en.z[i];
    stepEnemies(run, S.windup * 0.8);
    expect(Math.hypot(en.x[i] - x0, en.z[i] - z0), '預告中站定').toBeLessThan(0.05);
    // 鎖定的方向不是正對玩家：偏了 side 弧度
    const toP = Math.atan2(run.px - x0, run.pz - z0);
    const aim = Math.atan2(en.aimX[i], en.aimZ[i]);
    expect(Math.abs(Math.abs(Math.atan2(Math.sin(aim - toP), Math.cos(aim - toP))) - S.side)).toBeLessThan(0.05);
    stepEnemies(run, S.windup * 0.3 + S.seconds);
    const moved = Math.hypot(en.x[i] - x0, en.z[i] - z0);
    expect(moved, '衝出去的距離').toBeGreaterThan(S.speed * S.seconds * 0.6);
    expect(en.shootCd[i], '衝完要冷卻').toBeGreaterThan(S.cooldown * 0.5);
  });
});

describe('陰陽師：紅圈', () => {
  it('在玩家腳下畫圈；windup 秒後落下：站在圈裡扣血、走出圈沒事；跳起來也躲不掉', () => {
    for (const stay of [true, false]) {
      const run = make(7);
      run.god = false;
      const C = ENEMIES.onmyoji.caster!;
      const i = run.enemies.spawn(kindIndex('onmyoji'), ...at(run, C.keep, 0), 1, 0, 0);
      run.enemies.shootCd[i] = 0;
      run.enemies.hp[i] = run.enemies.maxHp[i] = 1e6;
      stepEnemies(run, DT);
      expect(run.shots.zonesCast).toBe(1);
      const zi = run.shots.zAlive.indexOf(1);
      expect(Math.hypot(run.shots.zx[zi] - run.px, run.shots.zz[zi] - run.pz)).toBeLessThan(0.01);
      if (!stay) run.devTeleport(run.px - (C.radius + 2), run.pz);
      const hp0 = run.hp;
      run.invul = 0;
      for (let k = 0; k < Math.round((C.windup + 0.1) / DT); k++) {
        run.setMove(0, 0);
        if (stay) run.requestJump();
        run.step(DT);
        if (run.hp < hp0) break;
      }
      if (stay) expect(run.hp, '站在圈裡（跳也一樣）').toBeLessThan(hp0);
      else expect(run.hp, '走出圈').toBe(hp0);
      // 落下後淡出、消失
      for (let k = 0; k < Math.round((ZONE_LINGER + 0.2) / DT); k++) run.shots.updateZones(DT, run.px, run.pz, 0.5, false);
      expect(run.shots.zoneCount).toBe(0);
    }
  });

  it('停在 keep 附近，不貼上來', () => {
    const run = make();
    const C = ENEMIES.onmyoji.caster!;
    const i = run.enemies.spawn(kindIndex('onmyoji'), ...at(run, C.keep + 4, 0), 1, 0, 0);
    stepEnemies(run, 6);
    const d = Math.hypot(run.enemies.x[i] - run.px, run.enemies.z[i] - run.pz);
    expect(d).toBeGreaterThan(C.keep * 0.7);
    expect(d).toBeLessThan(C.keep + 4.5);
  });
});

describe('出場配方（E-2）', () => {
  it('第 1 關沒有新面孔；第 2 關四種都會出現（依序），第 3 關起一開局就多數都有', () => {
    const fresh = ['sohei', 'shinobi', 'onmyoji', 'taiko'];
    expect(recipeFor(0).some((e) => fresh.includes(e.id))).toBe(false);
    const s2 = recipeFor(1);
    for (const id of fresh) expect(s2.find((e) => e.id === id), `第 2 關沒有 ${id}`).toBeTruthy();
    const order = fresh.map((id) => s2.find((e) => e.id === id)!.from);
    expect(Math.max(...order)).toBeLessThan(0.7);
    for (const id of fresh) expect(recipeFor(2).find((e) => e.id === id)!.from).toBeLessThanOrEqual(0.2);
  });
});
