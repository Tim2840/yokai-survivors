/** 玩家屬性定義（docs/02 第 2、3 節）。最終值 = (基礎 + Σ加算) × (1 + Σ百分比)，再夾在上下限。 */
export const STAT_IDS = ['maxHp', 'regen', 'power', 'atkSpeed', 'area', 'crit', 'critDmg', 'speed', 'armor', 'dodge', 'pickup', 'luck', 'merit'] as const;
export type StatId = (typeof STAT_IDS)[number];

/** 內部單位：power／atkSpeed／area／speed／pickup 是倍率（1 = 100%）；crit／critDmg／dodge／merit 是比例（0.05 = 5%）；maxHp／regen／armor／luck 是實數 */
export interface StatLimit {
  /** 下限、上限；rel = true 表示是「基礎值的倍數」（maxHp、speed） */
  min: number;
  max: number;
  rel?: boolean;
}

export const STAT_LIMITS: Record<StatId, StatLimit> = {
  maxHp: { min: 0.4, max: 4, rel: true },
  regen: { min: 0, max: 8 },
  power: { min: 0.4, max: 6 },
  atkSpeed: { min: 0.5, max: 4 },
  area: { min: 0.5, max: 3 },
  crit: { min: 0, max: 1 },
  critDmg: { min: 1.5, max: 5 },
  speed: { min: 0.55, max: 1.8, rel: true },
  armor: { min: -12, max: 45 },
  dodge: { min: 0, max: 0.6 },
  pickup: { min: 1, max: 8 },
  luck: { min: -50, max: 300 },
  merit: { min: 0, max: 1 },
};

/** 共通基礎值（領頭妖怪各自的覆寫在 yokai.ts） */
export const STAT_BASE: Record<StatId, number> = {
  maxHp: 100,
  regen: 0.5,
  power: 1,
  atkSpeed: 1,
  area: 1,
  crit: 0.05,
  critDmg: 1.5,
  speed: 4,
  armor: 0,
  dodge: 0,
  pickup: 2,
  luck: 0,
  merit: 0,
};

/**
 * 屬性卡的數值（docs/02 第 5.1 節，單位是卡片上寫的數字）怎麼加進屬性：
 * target = flat（加進基礎）或 pct（加進百分比）；scale 把卡片數字換成內部單位。
 */
export const CARD_EFFECT: Record<StatId, { target: 'flat' | 'pct'; scale: number }> = {
  maxHp: { target: 'flat', scale: 1 },
  regen: { target: 'flat', scale: 1 },
  power: { target: 'pct', scale: 0.01 },
  atkSpeed: { target: 'pct', scale: 0.01 },
  area: { target: 'pct', scale: 0.01 },
  crit: { target: 'flat', scale: 0.01 },
  critDmg: { target: 'flat', scale: 0.01 },
  speed: { target: 'pct', scale: 0.01 },
  armor: { target: 'flat', scale: 1 },
  dodge: { target: 'flat', scale: 0.01 },
  pickup: { target: 'pct', scale: 0.01 },
  luck: { target: 'flat', scale: 1 },
  merit: { target: 'flat', scale: 0.01 },
};

/** 減傷（docs/02 第 3 節）：護甲 A≥0 倍率 = 1 − A/(A+15)，最低 0.25；A<0 倍率 = 1 + |A|/15，最高 1.8 */
export const ARMOR = { k: 15, minMult: 0.25, maxMult: 1.8 } as const;
