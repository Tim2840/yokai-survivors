/** 魂火與升級（docs/02 第 3.1 節，起始提案）。 */
export const PROGRESSION = {
  /** 第 L 級升到 L+1 所需魂火 = base + perLevel × L */
  needBase: 6,
  needPerLevel: 2.5,
  /** 魂火顆的數值 = 威脅點數 × 這個 */
  orbPerPoint: 1,
  /** 魂火被吸向玩家的速度（公尺/秒）與加速度 */
  orbMagnetSpeed: 11,
  orbIdleDrift: 0,
  /** 魂火顆數上限（超過直接加經驗，不再生顆） */
  maxOrbs: 600,
  /** 波次結束時，場上所有魂火自動吸向玩家的速度 */
  orbSweepSpeed: 22,
} as const;

export const xpNeed = (level: number): number => PROGRESSION.needBase + PROGRESSION.needPerLevel * level;

/** M1 的升級卡池（docs/05：4 張屬性卡就好）；M2 起改成依局外解鎖。每次升級給幾張、可用的稀有度 */
export const CARD_POOL_M1: readonly string[] = ['hp', 'power', 'atkSpeed', 'speed', 'area', 'volley', 'splash', 'pierce', 'armor', 'regen', 'dodge'];
export const CARD_CHOICES = 3;
/** 沒解鎖「妖」之前只有凡、靈（docs/02 第 4.1 節） */
export const RARITIES_UNLOCKED_M1 = ['common', 'rare'] as const;
/** 保底：連續幾次升級（每次 CARD_CHOICES 張）完全沒有「靈」以上，下一次的第 1 張保證至少是靈 */
export const PITY_LEVELUPS = 5;
