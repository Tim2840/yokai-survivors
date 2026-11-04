import { describe, it } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { CARD_POOL_M1 } from '../../src/data/progression';
import { RARITIES } from '../../src/data/rarity';

// 卡片價值探針（不是斷言型）：每張卡每個稀有度各給 1 張、跑 N 秒（機器人風箏），和「沒有卡」的基準比擊殺數與受傷。
// 結果是相對值（機器人、非 sim、非真人）；用來看「哪張卡明顯強／弱」。`PROBE=1 npx vitest run tests/unit/card-value-probe.test.ts`
const run = process.env.PROBE ? describe : describe.skip;
const DT = 1 / 60;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SECONDS = Number(process.env.PROBE_SECONDS ?? 90);

function play(seed: number, card?: [string, string], copies = Number(process.env.PROBE_COPIES ?? 1)) {
  resetTuning();
  const r = new Run({ seed, bus: new EventBus() });
  r.devSetTime(Number(process.env.PROBE_START ?? 360));
  if (card) for (let i = 0; i < copies; i++) r.give(card[0], card[1] as 'common');
  let hurt = 0;
  (r as unknown as { bus: EventBus }).bus.on('playerHurt', (e) => (hurt += e.damage));
  let pick = 0;
  let t = 0;
  while (r.phase === 'combat' && r.time < Number(process.env.PROBE_START ?? 360) + SECONDS && !r.dead) {
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
    r.step(DT);
    t += DT;
  }
  return { kills: r.kills, hurt, alive: r.dead ? r.time : SECONDS };
}
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

run('卡片價值探針', () => {
  it('每張卡各稀有度 vs 基準', { timeout: 1200000 }, () => {
    const base = SEEDS.map((s) => play(s));
    const bk = avg(base.map((x) => x.kills));
    const bh = avg(base.map((x) => x.hurt));
    const lines = [`基準：擊殺 ${bk.toFixed(0)}、受傷 ${bh.toFixed(0)}、活 ${avg(base.map((x) => x.alive)).toFixed(0)}s`];
    for (const id of CARD_POOL_M1) {
      const row: string[] = [];
      for (const r of (process.env.PROBE_RARITIES ?? 'common,rare,epic,legend').split(',') as typeof RARITIES[number][]) {
        const res = SEEDS.map((s) => play(s, [id, r]));
        const k = avg(res.map((x) => x.kills));
        const h = avg(res.map((x) => x.hurt));
        row.push(`${r}: 擊殺 ${(((k / bk) - 1) * 100).toFixed(0)}% 受傷 ${(((h / Math.max(1, bh)) - 1) * 100).toFixed(0)}% 活 ${avg(res.map((x) => x.alive)).toFixed(0)}s`);
      }
      lines.push(`${id.padEnd(9)} ${row.join(' | ')}`);
    }
    throw new Error('\n' + lines.join('\n'));
  });
});
