import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { STAGE } from '../../src/data/stage';
import { kindIndex } from '../../src/systems/enemies';

// Q55（docs/27 卡 A）：兩分鐘後穿插老練的人類：更硬、更痛、魂火更多，速度不變
afterEach(() => resetTuning());
const DT = 1 / 60;

function make() {
  tuning.stageSeconds = 600;
  const run = new Run({ seed: 7, bus: new EventBus() });
  run.god = true;
  return run;
}

describe('老練的人類', () => {
  it('機率：from 之前是 0，之後從 startFrac 升到 maxFrac', () => {
    const run = make();
    const d = run.director;
    expect(d.veteranChance(STAGE.veteran.from * 600 - 1)).toBe(0);
    expect(d.veteranChance(STAGE.veteran.from * 600)).toBeCloseTo(STAGE.veteran.startFrac, 5);
    expect(d.veteranChance(600)).toBeCloseTo(STAGE.veteran.maxFrac, 5);
    expect(d.veteranChance(120)).toBeGreaterThan(0); // 2 分鐘左右就開始（使用者要求）
  });

  it('數值：比一般的血厚、傷害高、魂火多、體型大，速度一樣，仍算一般敵人（variant 0）', () => {
    const run = make();
    const en = run.enemies;
    const a = en.spawn(kindIndex('villager'), 5, 5, 10, 0, 0, 0, 1, 0);
    const b = en.spawn(kindIndex('villager'), 6, 5, 10, 0, 0, 0, 1, 1);
    expect(en.vet[b]).toBe(1);
    expect(en.variant[b]).toBe(0);
    expect(en.maxHp[b]).toBeGreaterThan(en.maxHp[a] * STAGE.veteran.hp[0] - 1e-6);
    expect(en.damage[b]).toBeCloseTo(en.damage[a] * STAGE.veteran.damage, 5);
    expect(en.pointsLeft[b]).toBeCloseTo(en.pointsLeft[a] * STAGE.veteran.orbMult, 5);
    expect(en.scale[b]).toBeCloseTo(STAGE.veteran.scale, 5);
    expect(en.speed[b]).toBe(en.speed[a]);
  });

  it('跑一關：STAGE.veteran.from 之前沒有老練的，之後出現，並且第一次出現會有提示', () => {
    const run = make();
    const start = STAGE.veteran.from * run.director.duration; // D93：0.2 → 0.15（1:30）
    let before = 0;
    let after = 0;
    for (let k = 0; k < 60 * 240; k++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
      let n = 0;
      for (let i = 0; i < run.enemies.high; i++) if (run.enemies.alive[i] && run.enemies.vet[i]) n++;
      if (run.clock < start - 1) before = Math.max(before, n);
      else after = Math.max(after, n);
      run.god = true;
    }
    expect(before, '還沒到時間就出現老練的').toBe(0);
    expect(after, '時間到了沒有老練的').toBeGreaterThan(0);
    expect(run.enemyIntro?.key === 'enemy.veteran.intro' || run.director.veteranSeen).toBe(true);
  });
});

describe('老練的人類的裝備（D97：「長得也要不一樣」）', () => {
  it('背旗高出頭頂、有頂點色（拿掉裝備會紅）', async () => {
    const { buildVeteranGearGeometry, CHIBI } = await import('../../src/units/humans');
    const g = buildVeteranGearGeometry();
    g.computeBoundingBox();
    expect(g.getAttribute('color')).toBeTruthy();
    expect(g.boundingBox!.max.y, '旗要高出頭頂，俯視鏡頭才看得到').toBeGreaterThan(CHIBI.headY + CHIBI.headR + 0.3);
    expect(g.boundingBox!.min.z, '旗在背後（-z）').toBeLessThan(-0.15);
  });
});
