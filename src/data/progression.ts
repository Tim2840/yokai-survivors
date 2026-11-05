/** 魂火與升級（docs/02 第 3.1 節，起始提案）。 */
export const PROGRESSION = {
  /** 第 L 級升到 L+1 所需魂火 = round(needScale × (L + needOffset)²)（D30：平方曲線，參考 Brotato 的 (L+3)²；後期升級變慢、每一級更有份量） */
  needScale: 0.35,
  needOffset: 3,
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

export const xpNeed = (level: number): number => Math.max(1, Math.round(PROGRESSION.needScale * (level + PROGRESSION.needOffset) ** 2));

/** 升級時能拿到的東西改成「法具」（src/data/items.ts 的 ITEM_POOL）。每次升級給幾張、可用的稀有度 */
export const CARD_CHOICES = 3;
/** 沒解鎖「珍」之前只有凡、良（docs/02 第 4.1 節） */
export const RARITIES_UNLOCKED_M1 = ['common', 'rare'] as const;
/** 保底：連續幾次升級（每次 CARD_CHOICES 張）完全沒有「良」以上，下一次的第 1 張保證至少是良 */
export const PITY_LEVELUPS = 5;
