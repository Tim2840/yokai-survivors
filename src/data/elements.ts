import type { Rarity } from './rarity';

/** 地圖要素（docs/02 第 6 節）。M2 先做石地藏、結界石、詛咒祭壇；其餘隨後加入。 */
export const ELEMENT_KINDS = ['jizo', 'barrier', 'altar', 'offering', 'omikuji', 'chest'] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

/** 出現規則（docs/02 第 6.3 節，改成連續關卡：用「關卡經過比例」取代「整備」） */
export const ELEMENT_RULES = {
  /** 開局先放幾個 */
  initial: 2,
  /** 之後每隔幾秒落下 1 個（關卡長度的比例；以 600 秒為準約每 50 秒） */
  everyFrac: 0.085,
  /** 同時最多幾個、同種最多幾個 */
  maxActive: 5,
  perKind: 2,
  /** 沒人理會，幾秒後消失（約 4 個虛擬波） */
  lifetime: 120,
  /** 離出生點、離邊界、彼此的最小距離（公尺） */
  minFromStart: 8,
  edgeMargin: 3,
  minApart: 10,
  /** 要素周圍必須平坦：四方向 1.5 公尺高度差上限 */
  flatTolerance: 0.5,
  /** 玩家與要素的互動半徑（公尺）、垂直容許（公尺） */
  useRadius: 1.8,
  useHeight: 2.0,
  /** 預告光柱：落下前幾秒（要素已存在但還不能用） */
  announce: 2.5,
  tries: 40,
} as const;

/** 要素種類權重（地圖可覆寫） */
export const ELEMENT_WEIGHTS: Record<ElementKind, number> = { jizo: 1, barrier: 1, altar: 1, offering: 1, omikuji: 1, chest: 0.6 };
/** 同種同時最多幾個（沒寫的用 ELEMENT_RULES.perKind） */
export const ELEMENT_PER_KIND: Partial<Record<ElementKind, number>> = { chest: 1, omikuji: 1 };

/** 稀有度權重（依虛擬波數；docs/02 第 6.3 節）。波數落在哪一列取最後一個 from <= n */
export const ELEMENT_RARITY_BY_WAVE: readonly { from: number; w: Record<Rarity, number> }[] = [
  { from: 1, w: { common: 80, rare: 20, epic: 0, legend: 0 } },
  { from: 5, w: { common: 55, rare: 33, epic: 12, legend: 0 } },
  { from: 10, w: { common: 40, rare: 35, epic: 20, legend: 5 } },
  { from: 15, w: { common: 28, rare: 35, epic: 27, legend: 10 } },
];

/** 石地藏（docs/02 第 6.2 節⑦） */
export const JIZO: Record<Rarity, { healFrac: number; armor: number }> = {
  common: { healFrac: 0.2, armor: 2 },
  rare: { healFrac: 0.35, armor: 3 },
  epic: { healFrac: 0.5, armor: 5 },
  legend: { healFrac: 1, armor: 8 },
};
/** 石地藏的護甲持續秒數（2 個虛擬波） */
export const JIZO_ARMOR_SECONDS = 60;
export const JIZO_HOLD_SECONDS = 1.0;

/** 結界石（⑥）：圈內的攻擊力與攻擊速度加成、半徑、存在秒數（3 個虛擬波）、圈內敵人湧出倍率 */
export const BARRIER: Record<Rarity, { bonus: number }> = {
  common: { bonus: 0.2 },
  rare: { bonus: 0.32 },
  epic: { bonus: 0.48 },
  legend: { bonus: 0.72 },
};
export const BARRIER_RADIUS = 4;
export const BARRIER_LIFETIME = 90;
export const BARRIER_SPAWN_MULT = 1.25;

/** 詛咒祭壇（①）：按住秒數 */
export const ALTAR_HOLD_SECONDS = 1.5;

/** 賽錢箱（docs/02 第 6.2 節②）：付出最大生命的比例（不致死），換一次三選一（三張都是 reward 階）；picks = 連選幾次 */
export const OFFERING: Record<Rarity, { costFrac: number; reward: Rarity; picks: number }> = {
  common: { costFrac: 0.1, reward: 'rare', picks: 1 },
  rare: { costFrac: 0.2, reward: 'epic', picks: 1 },
  epic: { costFrac: 0.3, reward: 'epic', picks: 2 },
  legend: { costFrac: 0.4, reward: 'legend', picks: 1 },
};
export const OFFERING_HOLD_SECONDS = 1.5;

/** 寶箱（M2 新增，docs/02 沒有原案）：不用付代價，一次三選一（三張都是同稀有度），數量少 */
export const CHEST_HOLD_SECONDS = 1.0;

/** 神籤（③）：抽一次，結果隨機；好結果 60 秒、凶 45 秒。weights 依稀有度（凡／靈／妖／神） */
export const OMIKUJI_HOLD_SECONDS = 1.0;
export const OMIKUJI_RESULTS = ['daikichi', 'chukichi', 'shokichi', 'suekichi', 'kyo', 'daikyo'] as const;
export type OmikujiResult = (typeof OMIKUJI_RESULTS)[number];
export const OMIKUJI_WEIGHTS: Record<Rarity, Record<OmikujiResult, number>> = {
  common: { daikichi: 5, chukichi: 15, shokichi: 30, suekichi: 20, kyo: 20, daikyo: 10 },
  rare: { daikichi: 8, chukichi: 20, shokichi: 32, suekichi: 20, kyo: 15, daikyo: 5 },
  epic: { daikichi: 12, chukichi: 26, shokichi: 32, suekichi: 18, kyo: 10, daikyo: 2 },
  legend: { daikichi: 20, chukichi: 32, shokichi: 30, suekichi: 15, kyo: 3, daikyo: 0 },
};
/** 各結果的效果：pct／flat = 自己的屬性；curse = 讓敵人變強（凶類）；merit = 功德；seconds = 持續 */
export const OMIKUJI_EFFECT: Record<OmikujiResult, { seconds: number; pct?: Partial<Record<'power' | 'atkSpeed' | 'area' | 'speed', number>>; flat?: { regen: number }; curse?: Partial<Record<'enemySpeed' | 'enemyDamage', number>>; merit?: number }> = {
  daikichi: { seconds: 60, pct: { power: 0.25, atkSpeed: 0.25, area: 0.25, speed: 0.25 } },
  chukichi: { seconds: 60, pct: { power: 0.25 } },
  shokichi: { seconds: 60, flat: { regen: 2 } },
  suekichi: { seconds: 0, merit: 5 },
  kyo: { seconds: 45, curse: { enemySpeed: 0.15 } },
  daikyo: { seconds: 45, curse: { enemyDamage: 0.3 } },
};
