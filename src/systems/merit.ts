import { MERIT } from '../data/merit';

/** 功德結算（docs/02 第 7.4 節、第 8.1 節）。stagesCleared = 通過的關卡數。 */
export function computeMerit(o: { stagesCleared: number; kills: number; bossesDefeated: number; firstClear: boolean; meritStat: number; night: number; abandoned: boolean }): number {
  const base = MERIT.perStage * o.stagesCleared + o.kills / MERIT.killsDivisor + MERIT.boss * o.bossesDefeated + (o.firstClear ? MERIT.firstClear : 0);
  const total = base * (1 + o.meritStat + MERIT.nightBonus * o.night);
  return Math.floor(o.abandoned ? total * MERIT.abandonRatio : total);
}
