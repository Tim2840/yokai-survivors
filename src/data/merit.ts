/** 局外功德的結算（docs/02 第 7.4 節）。 */
export const MERIT = {
  perWave: 12,
  killsDivisor: 10,
  boss: 100,
  firstClear: 200,
  nightBonus: 0.25,
  /** 中途離開（放棄）給的比例（docs/14 Q9 建議值，未決定） */
  abandonRatio: 0.5,
} as const;
