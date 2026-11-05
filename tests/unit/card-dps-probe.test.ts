import { describe, it } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { resetTuning } from '../../src/data/tuning';
import { ITEM_POOL as CARD_POOL_M1 } from '../../src/data/items';
import { RARITIES } from '../../src/data/rarity';

// 卡片輸出探針（不是斷言型，比 card-value-probe 乾淨）：玩家不動、無敵、不升級，場上固定放一圈村人，量 SECONDS 秒內「打倒幾隻」。
// 只看「輸出」類卡；生命、移速這類防禦卡用算式評估。`PROBE=1 npx vitest run tests/unit/card-dps-probe.test.ts`
const run = process.env.PROBE ? describe : describe.skip;
const DT = 1 / 60;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const SECONDS = Number(process.env.PROBE_SECONDS ?? 20);
const N = Number(process.env.PROBE_N ?? 80);

function play(seed: number, cards: [string, string][]) {
  resetTuning();
  const r = new Run({ seed, bus: new EventBus() });
  r.god = true;
  r.devSetTime(300);
  for (const [id, rar] of cards) r.give(id, rar as 'common');
  r.director.active = false;
  r.devSpawn('villager', N);
  let t = 0;
  while (t < SECONDS && r.kills < N * 0.6) {
    if (r.awaitingPick) {
      r.chooseCard(0);
      continue;
    }
    r.step(DT);
    t += DT;
  }
  return t;
}
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

run('卡片輸出探針', () => {
  it('每張輸出卡各稀有度 vs 基準（數字 = 清場速度提升 %，越大越強）', { timeout: 1200000 }, () => {
    const base = avg(SEEDS.map((s) => play(s, [])));
    const lines = [`基準：打倒 60% 的 ${N} 隻要 ${base.toFixed(2)} 秒（上限 ${SECONDS} 秒）`];
    for (const id of CARD_POOL_M1) {
      if (id === 'hp' || id === 'speed') continue;
      const row = RARITIES.map((r) => {
        const k = avg(SEEDS.map((s) => play(s, [[id, r]])));
        return `${r}: ${(((base / k) - 1) * 100).toFixed(0)}%`;
      });
      lines.push(`${id.padEnd(9)} ${row.join(' | ')}`);
    }
    throw new Error('\n' + lines.join('\n'));
  });
});
