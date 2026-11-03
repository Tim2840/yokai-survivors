/** 局外功德的結算（docs/02 第 7.4 節）。 */
export const MERIT = {
  /** 每通過一關（D22：約 10 分鐘，對應原本 20 波 × 12 = 240 的一半；M3 經濟模擬再調） */
  perStage: 120,
  killsDivisor: 10,
  /** 每打倒一隻頭目 */
  boss: 100,
  firstClear: 200,
  nightBonus: 0.25,
  /** 中途離開（放棄）給的比例（docs/14 Q9 建議值，未決定） */
  abandonRatio: 0.5,
} as const;
