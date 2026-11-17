import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { FORMS, FORM_BURST } from '../../src/data/yokai';
import { xpNeed } from '../../src/data/progression';
import { kindIndex } from '../../src/systems/enemies';

// D94（docs/33）：化身那一刻補滿血、腳下衝擊波；數值比 D84 有感
afterEach(() => resetTuning());

function make() {
  tuning.stageSeconds = 600;
  const bus = new EventBus();
  const run = new Run({ seed: 5, bus });
  run.god = true;
  run.director.active = false;
  return { run, bus };
}
function levelTo(run: Run, L: number): void {
  while (run.level < L) {
    run.addXp(xpNeed(run.level) - run.xp + 0.01);
    for (let g = 0; g < 10 && run.awaitingPick; g++) run.chooseCard(0);
  }
}

describe('化身的那一刻', () => {
  it('數值比舊版有感（舊版 生命 +15%／攻擊 +6% 會紅）', () => {
    expect(FORMS[0].pct.maxHp).toBeGreaterThanOrEqual(0.25);
    expect(FORMS[0].pct.power).toBeGreaterThanOrEqual(0.15);
    expect(FORMS[1].pct.maxHp).toBeGreaterThanOrEqual(0.5);
    expect(FORMS[1].pct.power).toBeGreaterThanOrEqual(0.3);
  });

  it('化身時補滿血、衝擊波打到半徑內的人類並把一般人類震開；頭目不被推；半徑外的不受影響', () => {
    const { run, bus } = make();
    let forms = 0;
    bus.on('formChange', () => forms++);
    levelTo(run, FORMS[0].level - 1);
    run.hp = 5;
    const near = run.enemies.spawn(kindIndex('villager'), run.px + 3, run.pz, 1, 0, 0);
    const boss = run.enemies.spawn(kindIndex('taimasou'), run.px - 3, run.pz, 1, 0, 0, 2);
    const far = run.enemies.spawn(kindIndex('villager'), run.px + FORM_BURST.radius + 6, run.pz, 1, 0, 0);
    for (const i of [near, boss, far]) run.enemies.hp[i] = run.enemies.maxHp[i] = 1e6;
    run.enemies.speedMult = 0;
    run.step(1 / 60); // 空間雜湊每步重建：剛生的人類要走過一步才查得到（實際遊戲裡每步都有）
    levelTo(run, FORMS[0].level);
    expect(forms).toBe(1);
    expect(run.hp).toBeCloseTo(run.maxHp, 5);
    expect(run.enemies.hp[near]).toBeLessThan(1e6);
    expect(Math.hypot(run.enemies.kx[near], run.enemies.kz[near]), '一般人類被震開').toBeGreaterThan(0);
    expect(run.enemies.hp[boss]).toBeLessThan(1e6);
    expect(Math.hypot(run.enemies.kx[boss], run.enemies.kz[boss]), '頭目不被推').toBe(0);
    expect(run.enemies.hp[far]).toBe(1e6);
  });
});
