import { describe, it } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';

// 這不是斷言型測試，是 M1.5 的手感探針：用簡單機器人（遠離最近的敵人、否則繞圈；選卡輪流）跑第 1 關，
// 看不同設定下撐多久、打倒多少、等級多少、有沒有打倒頭目。平常不跑：`PROBE=1 npx vitest run tests/unit/m1-balance-probe.test.ts`。
// 結果寫進 docs/02 的變更紀錄時要註明「機器人探針、非 sim、非真人」。
const run = process.env.PROBE ? describe : describe.skip;
const DT = 1 / 60;

function play(seed: number, cfg: Partial<typeof tuning>) {
  resetTuning();
  Object.assign(tuning, cfg);
  const r = new Run({ seed, bus: new EventBus() });
  let pick = 0;
  let t = 0;
  let bossSeenAt = -1;
  while (r.phase === 'combat' && r.stageIndex === 0 && r.time < tuning.stageSeconds + 120 && !r.dead) {
    if (r.awaitingPick) {
      r.chooseCard(pick++ % 3);
      continue;
    }
    const e = r.enemies;
    const n = e.nearest(r.px, r.pz, 5);
    if (n >= 0) {
      const dx = r.px - e.x[n];
      const dz = r.pz - e.z[n];
      const d = Math.hypot(dx, dz) || 1;
      r.setMove(dx / d + Math.cos(t) * 0.4, dz / d + Math.sin(t) * 0.4);
    } else r.setMove(Math.cos(t * 0.5), Math.sin(t * 0.5));
    // portal 開了就走過去
    if (r.portal.active) r.setMove(r.portal.x - r.px, r.portal.z - r.pz);
    r.step(DT);
    t += DT;
    if (bossSeenAt < 0 && r.director.bossIndex >= 0) bossSeenAt = r.time;
  }
  return { time: r.time, kills: r.kills, level: r.level, boss: r.bossesDefeated, bossSeen: bossSeenAt >= 0, dead: r.dead || r.phase === 'ended', cleared: r.phase === 'intermission' };
}

run('M1.5 手感探針（第 1 關）', () => {
  it('不同設定下的存活與擊殺（4 個種子）', { timeout: 900000 }, () => {
    const configs: [string, Partial<typeof tuning>][] = [
      ['預設（×2.5、3 顆、濺射 1.2）', {}],
      ['數量 ×1.5', { countScale: 1.5 }],
      ['數量 ×4', { countScale: 4 }],
      ['4 顆、濺射 1.5、傷害 ×1.5', { volley: 4, splash: 1.5, damageScale: 1.5 }],
    ];
    for (const [name, cfg] of configs) {
      const res = [1, 2, 3, 4].map((s) => play(s, cfg));
      const avg = (k: 'time' | 'kills' | 'level') => (res.reduce((a, b) => a + b[k], 0) / res.length).toFixed(0);
      console.log(`${name}: 平均存活 ${avg('time')} 秒、擊殺 ${avg('kills')}、等級 ${avg('level')}；頭目出現 ${res.filter((x) => x.bossSeen).length}/4、打倒 ${res.filter((x) => x.boss > 0).length}/4、過關 ${res.filter((x) => x.cleared).length}/4；各局存活 ${res.map((x) => Math.round(x.time)).join('/')}`);
    }
    resetTuning();
  });
});
