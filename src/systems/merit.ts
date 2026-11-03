import { MERIT } from '../data/merit';

/** 功德結算（docs/02 第 7.4 節）。wavesCleared = 通過的波數。 */
export function computeMerit(o: { wavesCleared: number; kills: number; bossDefeated: boolean; firstClear: boolean; meritStat: number; night: number; abandoned: boolean }): number {
  const base = MERIT.perWave * o.wavesCleared + o.kills / MERIT.killsDivisor + (o.bossDefeated ? MERIT.boss : 0) + (o.firstClear ? MERIT.firstClear : 0);
  const total = base * (1 + o.meritStat + MERIT.nightBonus * o.night);
  return Math.floor(o.abandoned ? total * MERIT.abandonRatio : total);
}
