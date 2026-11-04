/** 波次與敵人強度（docs/02 第 3、8、9 節）。 */
export const WAVES = {
  /** 一局幾波 */
  total: 20,
  /** 原型波長（秒，D16）；正式版依波數見 docs/02 第 8 節 */
  duration: 20,
  /** 威脅點數 T(n) = base + perWave × n（以 20 秒波為基準） */
  threatBase: 8,
  threatPerWave: 5,
  /**
   * 數量倍率（D18：先做成可調，G1 試玩定）。1 = docs/02 的原值（第 20 波約 60 隻，不像割草）；
   * docs/14 D18 目標是第 5 波約 60 隻、第 10 波約 150 隻、第 20 波約 300 隻 ≈ 2.5。測試頁可用 ?count= 調。
   */
  countScale: 1,
  /** 單隻 HP 的額外倍率（改數量時等比下調用）；?hp= */
  hpScale: 1.5,
  /** 每波分幾批湧入、湧入佔波長的比例（最後一段留給收尾） */
  batches: 5,
  spawnSpan: 0.8,
  /** 敵人強度（第 n 波、夜深度 d） */
  hpPerWave: 0.25,
  hpPerNight: 0.15,
  damagePerWave: 0.08,
  speedPerNight: 0.03,
  /** 同畫面敵人上限（桌機／手機）；超過的點數留到下一批 */
  maxEnemiesDesktop: 400,
  maxEnemiesMobile: 200,
  /** 生成：離玩家的距離（公尺）、嘗試幾個角度找可走的位置 */
  spawnRing: 15,
  spawnTries: 12,
  /** 每個模擬步最多生幾隻（避免一步生太多卡住） */
  spawnPerStepMax: 12,
  /** 玩家出生點周圍不生成的安全半徑 */
  safeRadius: 6,
} as const;

export function threat(n: number): number {
  return WAVES.threatBase + WAVES.threatPerWave * n;
}
export const enemyHpMult = (n: number, night = 0) => (1 + WAVES.hpPerWave * (n - 1)) * (1 + WAVES.hpPerNight * night);
export const enemyDamageMult = (n: number) => 1 + WAVES.damagePerWave * (n - 1);
export const enemySpeedMult = (night = 0) => 1 + WAVES.speedPerNight * night;

/** 這一波會出現哪些人類與權重（M1 只有村人；M2 起依 docs/01 第 6 節加足輕、僧兵…） */
export function waveKinds(_wave: number): readonly { id: string; weight: number }[] {
  return [{ id: 'villager', weight: 1 }];
}
