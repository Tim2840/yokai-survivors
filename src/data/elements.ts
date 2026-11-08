import type { Rarity } from './rarity';

/** 地圖要素（docs/02 第 6 節）。M2 先做石地藏、結界石、詛咒祭壇；其餘隨後加入。 */
export const ELEMENT_KINDS = ['jizo', 'barrier', 'altar', 'offering', 'omikuji', 'chest', 'summon', 'fox', 'fuse', 'dosojin', 'trial', 'summit'] as const;
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
export const ELEMENT_WEIGHTS: Record<ElementKind, number> = { jizo: 1, barrier: 1, altar: 1, offering: 1, omikuji: 1, chest: 0.6, summon: 0, fox: 0.8, fuse: 0, dosojin: 0, trial: 0.8, summit: 0 };
/** 同種同時最多幾個（沒寫的用 ELEMENT_RULES.perKind） */
export const ELEMENT_PER_KIND: Partial<Record<ElementKind, number>> = { chest: 1, omikuji: 1, summon: 1, fox: 1, fuse: 1, dosojin: 1, trial: 1, summit: 1 };

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

/** 神籤（③）：抽一次，結果隨機；好結果 60 秒、凶 45 秒。weights 依稀有度（凡／良／珍／極） */
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

/**
 * 狐面商（D38，docs/02 第 6.2 節④）：取捨道具只在這裡拿得到。商人前面兩個發光圈，各放一個提案（一件取捨道具的下一級），
 * 站進其中一圈 acceptSeconds 秒＝收下；不要就走開。提案的稀有度 = 狐面商的稀有度（好處與代價都乘稀有度倍率：越高階越極端）。
 * 不能收的提案（道具欄滿了、已練滿）不會出現；一個都沒有時這一處不放狐面商。
 */
export const FOX = {
  /** 幾個提案（幾個圈） */
  offers: 2,
  /** 圈離商人多遠（公尺）、圈的半徑 */
  ringOffset: 2.4,
  ringRadius: 1.0,
  /** 站在圈內幾秒算收下 */
  acceptSeconds: 1.0,
} as const;

/**
 * 合魂祠（使用者 2026-11-05：「融合不要限制在打王後，請在地圖上弄一個可以融合的要素」）：
 * 大招材料湊齊後 appearDelay 秒，在離玩家 ringMin～ringMax 公尺的平地出現（HUD 箭頭指過去）；站上去按住 holdSeconds 秒
 * → 融合面板（只有湊齊的大招，選一個）。不會過期；沒有可以融合的大招時收掉。寶箱也照樣可以融合。
 */
export const FUSE = { appearDelay: 3, ringMin: 15, ringMax: 28, holdSeconds: 1.5 } as const;

/**
 * 道祖神（D47，使用者：「抽到某個方向的變化，要可以改，不然一抽定生死」）：守護岔路的神，在這裡換方向。
 * 選了招式變化之後，每關出現一座：第一次在選完 appearDelay 秒後，之後每關開始 appearDelay 秒後；離玩家 ringMin～ringMax 公尺。
 * 站上去按住 holdSeconds 秒 → 再跳一次變化三選一（目前的那張標「目前」，可以選回去）。免費、不會過期；這一關用過就不再出現。
 * HUD 的提示與箭頭只在出現後 hintSeconds 秒內顯示（不想換的人不會一直被叫過去）。
 */
export const DOSOJIN = { appearDelay: 20, ringMin: 15, ringMax: 28, holdSeconds: 1.5, hintSeconds: 15 } as const;

/**
 * 百鬼試煉碑（E1，docs/15 第 10.4 節；參考黑帝斯的挑戰房、RoR2 的戰鬥神殿）：站上去按住 holdSeconds 秒啟動 →
 * 限時 seconds 秒內，在碑周圍 radius 公尺的圈內打倒的人類越多越好（打倒的位置在圈內才算）→ 時間到依成績給寶箱：
 * 達到第 1／2／3 段門檻給第 1／2／3 階的寶箱，連第 1 段都沒達到什麼都沒有（沒有懲罰）。
 * 試煉中敵人湧出變快（spawnMult），不然圈裡沒有人可以打。
 * 門檻 = 基礎 × 稀有度倍率 ×（1 + growth × 關卡經過比例）：後面敵人多、火力強，門檻也跟著漲
 * （探針：站著不動的機器人 30 秒在圈內打倒 第 30 秒 約 150、第 120 秒 約 265、第 240 秒 約 430、第 420 秒 約 680 隻）。
 * 碑的稀有度越高，門檻越高、寶箱越好。數字為起始提案，sim 校準（docs/02 變更紀錄）。
 */
export const TRIAL = {
  holdSeconds: 1.2,
  seconds: 30,
  radius: 9,
  spawnMult: 1.6,
  baseNeeds: [60, 110, 170] as readonly [number, number, number],
  needMult: { common: 1, rare: 1.25, epic: 1.6, legend: 2 } as Record<Rarity, number>,
  growth: 3,
  /** 稀有度 → 三階寶箱 */
  rewards: {
    common: ['common', 'rare', 'epic'],
    rare: ['rare', 'epic', 'epic'],
    epic: ['rare', 'epic', 'legend'],
    legend: ['epic', 'legend', 'legend'],
  } as Record<Rarity, readonly [Rarity, Rarity, Rarity]>,
} as const;

/** 這座碑現在的三段門檻（progress = 關卡經過比例 0～1） */
export function trialNeeds(rarity: Rarity, progress: number): [number, number, number] {
  const m = TRIAL.needMult[rarity] * (1 + TRIAL.growth * Math.min(1, Math.max(0, progress)));
  return [Math.round(TRIAL.baseNeeds[0] * m), Math.round(TRIAL.baseNeeds[1] * m), Math.round(TRIAL.baseNeeds[2] * m)];
}

/**
 * 用地形（E2，docs/15 第 10.4 節；參考 RoR2 的山之神殿＋我們獨有的 3D 台地）：
 * ① 一部分落下的要素放在**高處**：比玩家現在的位置高 minRise 公尺以上、而且走得到（要沿坡繞上去或跳上去），機率 chance；找不到就放一般的地方。
 * ② **山頂神社**：每關在地圖最高的、走得到的平地放一座（比出生點至少高 minRise 公尺才放）；站上去按住 holdSeconds 秒 →
 * 這一關的**頭目生命 × bossMult**，但**打倒頭目多掉 extraChests 個寶箱**（和頭目的寶箱同階）。要在頭目出現前啟動。數字為起始提案，sim 校準。
 */
export const ELEVATED = { chance: 0.35, minRise: 2 } as const;
export const SUMMIT = { holdSeconds: 2, bossMult: 1.5, extraChests: 1, minRise: 3, minFromStart: 12 } as const;

