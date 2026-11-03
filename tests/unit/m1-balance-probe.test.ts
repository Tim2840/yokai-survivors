import { describe, it } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning } from '../../src/data/tuning';

// 這不是斷言型測試，是 M1 的手感探針：用簡單機器人（繞圈風箏、選卡依序輪流）看不同「數量倍率」下撐到第幾波。
// 平常不跑（PROBE=1 才跑）：`PROBE=1 npx vitest run tests/unit/m1-balance-probe.test.ts`。結果寫進 docs/02 的變更紀錄時要註明「M1 探針、非 sim」。
const run = process.env.PROBE ? describe : describe.skip;
const DT = 1 / 60;

function play(seed: number, count: number, dmg: number, hpScale: number, volley = 0, splash = 0) {
  tuning.volley = volley;
  tuning.splash = splash;
  tuning.countScale = count;
  tuning.damageScale = dmg;
  tuning.hpScale = hpScale;
  const r = new Run({ seed, bus: new EventBus() });
  let t = 0;
  let pick = 0;
  while (r.phase !== 'ended' && t < 900) {
    if (r.awaitingPick) {
      r.chooseCard(pick++ % 3);
      continue;
    }
    if (r.phase === 'intermission') {
      r.continueFromIntermission();
      continue;
    }
    // 風箏：離最近的敵人遠一點，否則繞圈
    const e = r.enemies;
    const n = e.nearest(r.px, r.pz, 4);
    if (n >= 0) {
      const dx = r.px - e.x[n];
      const dz = r.pz - e.z[n];
      const d = Math.hypot(dx, dz) || 1;
      r.setMove(dx / d + Math.cos(t) * 0.4, dz / d + Math.sin(t) * 0.4);
    } else r.setMove(Math.cos(t * 0.5), Math.sin(t * 0.5));
    r.step(DT);
    t += DT;
  }
  return { wave: r.wave, level: r.level, kills: r.kills, result: r.result };
}

run('M1 手感探針', () => {
  it('不同數量倍率下撐到第幾波（5 個種子的平均）', () => {
    for (const [count, dmg, hp, vol, spl] of [[1, 1, 1, 0, 0], [2.5, 1, 1, 0, 0], [1, 1, 1, 3, 1.2], [2.5, 1, 1, 3, 1.2], [2.5, 1.5, 1, 4, 1.5], [2.5, 2, 1, 5, 1.5]] as const) {
      const res = [1, 2, 3, 4, 5].map((s) => play(s, count, dmg, hp, vol, spl));
      const avg = (k: 'wave' | 'level' | 'kills') => (res.reduce((a, b) => a + b[k], 0) / res.length).toFixed(1);
      console.log(`count×${count} dmg×${dmg} hp×${hp} volley${vol} splash${spl}: 平均波 ${avg('wave')}，級 ${avg('level')}，擊殺 ${avg('kills')}；各局 ${res.map((x) => `${x.wave}${x.result === 'victory' ? '勝' : ''}`).join('/')}`);
    }
  });
});
