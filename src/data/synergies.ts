/**
 * 聯動（D28；D37 起分「初」「極」兩段）：兩件指定道具都練到門檻等級才觸發，練得更高再升一段。
 * 「初」約滿級的 6 成、給一半效果；「極」要練滿、給完整效果（= D28 原本的效果）。
 * 參考 TFT 羈絆與 Brotato 同類武器加成的分段（docs/15 第 5.2 節）。數字為起始提案，sim 校準（docs/02 第 5.3 節）。
 * 每一段寫的是「到這一段為止的總效果」；升段時只補差額。
 */
export interface SynergyEffect {
  /** 濺射傷害比例增加（加在 0.6 的基礎上） */
  splashRatio?: number;
  /** 濺射半徑倍率 */
  splashMult?: number;
  /** 碎火：每次命中多幾片（D43）、每片傷害比例增加 */
  shardCount?: number;
  shardDamage?: number;
  /** 每顆鬼火額外穿透 */
  pierce?: number;
  /** 額外多發射 */
  volley?: number;
  /** 燈火光圈半徑倍率 */
  auraMult?: number;
}

export interface SynergyTier {
  /** 道具 id → 最低等級（兩件都要到） */
  requires: Readonly<Record<string, number>>;
  /** 到這一段為止的總效果 */
  effect: SynergyEffect;
}

export interface Synergy {
  id: string;
  /** 需要的兩件道具 */
  items: readonly [string, string];
  /** [初, 極] */
  tiers: readonly [SynergyTier, SynergyTier];
}

/** 提燈小僧的聯動（其他妖怪的聯動在各自的武器卡做好時加入） */
export const SYNERGIES: readonly Synergy[] = [
  {
    id: 'chainBlast',
    items: ['volley', 'splash'],
    tiers: [
      { requires: { volley: 2, splash: 3 }, effect: { shardCount: 1 } },
      { requires: { volley: 2, splash: 5 }, effect: { shardCount: 1, shardDamage: 0.15 } },
    ],
  },
  {
    id: 'piercingFire',
    items: ['volley', 'pierce'],
    tiers: [
      { requires: { volley: 2, pierce: 2 }, effect: { pierce: 1 } },
      { requires: { volley: 2, pierce: 3 }, effect: { pierce: 1, volley: 0.5 } },
    ],
  },
  {
    id: 'lanternGlow',
    items: ['splash', 'area'],
    tiers: [
      { requires: { splash: 3, area: 3 }, effect: { auraMult: 1.25 } },
      { requires: { splash: 5, area: 5 }, effect: { auraMult: 1.5 } },
    ],
  },
];

/** 段數名稱的 i18n key：0 = 沒觸發、1 = 初、2 = 極 */
export const SYNERGY_TIER_COUNT = 2;

/** 依目前道具等級，這個聯動到第幾段（0 = 還沒、1 = 初、2 = 極） */
export function synergyTierOf(s: Synergy, levels: ReadonlyMap<string, number>): number {
  let t = 0;
  for (let k = 0; k < s.tiers.length; k++) {
    if (Object.entries(s.tiers[k].requires).every(([id, n]) => (levels.get(id) ?? 0) >= n)) t = k + 1;
  }
  return t;
}

/**
 * 選卡提示：這張卡跟哪些還沒到「極」的聯動有關。
 * nextTier = 下一段（1 = 初、2 = 極）；progress = 下一段每件道具的 have／need（have 是目前等級，不含這張）；
 * completes = 選了這張就到下一段。這張卡對下一段沒有幫助（已經夠了）就不列。
 */
export interface SynergyHint {
  id: string;
  nextTier: number;
  progress: { card: string; have: number; need: number }[];
  completes: boolean;
}

export function synergyHints(cardId: string, levels: ReadonlyMap<string, number>, list: readonly Synergy[] = SYNERGIES): SynergyHint[] {
  const out: SynergyHint[] = [];
  for (const s of list) {
    if (!s.items.includes(cardId)) continue;
    const cur = synergyTierOf(s, levels);
    if (cur >= s.tiers.length) continue;
    const req = s.tiers[cur].requires;
    const have = levels.get(cardId) ?? 0;
    if (have >= (req[cardId] ?? 0)) continue;
    const progress = Object.entries(req).map(([card, need]) => ({ card, have: Math.min(need, levels.get(card) ?? 0), need }));
    const completes = Object.entries(req).every(([card, need]) => (card === cardId ? have + 1 : levels.get(card) ?? 0) >= need);
    out.push({ id: s.id, nextTier: cur + 1, progress, completes });
  }
  return out;
}
