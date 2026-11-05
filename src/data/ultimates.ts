/**
 * 終極技（大招，D29）：每隻妖怪有數個「特色大招」，各有一張配方（要同時擁有指定數量的指定卡片，任何稀有度算 1 張）；
 * D30 第二步改成「進化式」（吸血鬼倖存者）：配方含主武器滿級（鬼火 Lv8），湊齊之後**開寶箱**（小頭目、精英掉的）才融合。
 * 一局可以融合多個，按大招時全部一起發動。
 * 發動需要大招量表集滿（殺敵、時間充能）；發動後歸零。數字為佔位，M2 sim 校準。
 */
export const ULT = {
  /** 量表滿格 */
  max: 100,
  /** 擊殺一般敵人、精英、頭目各充多少；每秒自然充能 */
  perKill: 1,
  perElite: 3,
  perBoss: 20,
  perSecond: 0.4,
  /** 冷卻（使用者 2026-11-05）：發動後這麼多秒內量表不會充能（殺敵、時間都不算），大招鈕顯示倒數 */
  cooldown: 25,
} as const;

export type UltEffect =
  /** 以玩家為中心的範圍爆發：半徑（公尺，乘範圍屬性）、傷害 = 領頭武器傷害 × 攻擊力 × damageMult、擊退 */
  | { type: 'nova'; radius: number; damageMult: number; knockback: number }
  /** 暫時強化：秒數、攻擊力／攻速的百分比加成、額外鬼火數量 */
  | { type: 'frenzy'; seconds: number; power: number; atkSpeed: number; volley: number }
  /** 護罩：無敵秒數、回復最大生命比例，並把周圍敵人震開（有傷害） */
  | { type: 'bulwark'; seconds: number; healFrac: number; radius: number; damageMult: number; knockback: number }
  /** 貫穿光束：朝最近的敵人（沒有就朝面向）射出，長度、寬度（公尺）、傷害倍率 */
  | { type: 'beam'; length: number; width: number; damageMult: number };

export interface UltRecipe {
  id: string;
  /** 屬於哪隻妖怪（docs/04）；其他妖怪的配方在做到那隻妖怪時加入 */
  yokai: string;
  /** 配方：卡片 id → 最少張數（任何稀有度；同一張卡重複拿算多張） */
  requires: Readonly<Record<string, number>>;
  effect: UltEffect;
}

export const ULT_RECIPES: readonly UltRecipe[] = [
  { id: 'infernoLantern', yokai: 'chochin-kozo', requires: { ghostfire: 8, splash: 2, area: 2, power: 1 }, effect: { type: 'nova', radius: 9, damageMult: 12, knockback: 8 } },
  { id: 'ghostfireDance', yokai: 'chochin-kozo', requires: { ghostfire: 8, volley: 2, atkSpeed: 2 }, effect: { type: 'frenzy', seconds: 6, power: 0.3, atkSpeed: 0.8, volley: 3 } },
  { id: 'bulwarkLantern', yokai: 'chochin-kozo', requires: { ghostfire: 8, hp: 2, armor: 2, regen: 1 }, effect: { type: 'bulwark', seconds: 4, healFrac: 0.4, radius: 7, damageMult: 3, knockback: 10 } },
  { id: 'thunderSpear', yokai: 'chochin-kozo', requires: { ghostfire: 8, pierce: 2, power: 2 }, effect: { type: 'beam', length: 22, width: 2.4, damageMult: 25 } },
];

/** 寶箱裡的融合卡：'ult:<大招 id>' */
export const ULT_CARD_PREFIX = 'ult:';
export const isUltCard = (cardId: string): boolean => cardId.startsWith(ULT_CARD_PREFIX);
export const ultOfCard = (cardId: string): UltRecipe => ultById(cardId.slice(ULT_CARD_PREFIX.length));

export const ultById = (id: string): UltRecipe => {
  const r = ULT_RECIPES.find((x) => x.id === id);
  if (!r) throw new Error(`沒有這個大招：${id}`);
  return r;
};

/** 配方進度：每個材料 { card, have, need } */
export function recipeProgress(r: UltRecipe, counts: ReadonlyMap<string, number>): { card: string; have: number; need: number }[] {
  return Object.entries(r.requires).map(([card, need]) => ({ card, have: Math.min(need, counts.get(card) ?? 0), need }));
}
export const recipeDone = (r: UltRecipe, counts: ReadonlyMap<string, number>): boolean => recipeProgress(r, counts).every((p) => p.have >= p.need);

/** 一張卡跟哪些還沒融合的大招有關（選卡提示用）：completes = 選了這張就湊齊配方（之後開寶箱融合） */
export interface UltHint {
  id: string;
  have: number;
  need: number;
  completes: boolean;
}

export function ultHints(cardId: string, yokai: string, counts: ReadonlyMap<string, number>, fused: readonly string[]): UltHint[] {
  const out: UltHint[] = [];
  for (const r of ULT_RECIPES) {
    if (r.yokai !== yokai || fused.includes(r.id) || !(cardId in r.requires)) continue;
    const need = r.requires[cardId];
    const have = counts.get(cardId) ?? 0;
    // 這個材料已經夠了（配方可能已經湊齊、等著開寶箱）：這張卡對這個大招沒有幫助，不提示
    if (have >= need) continue;
    // 選了這張之後，這個材料夠了、其他材料也都夠 → 融合
    const othersDone = Object.entries(r.requires).every(([c, n]) => c === cardId || (counts.get(c) ?? 0) >= n);
    out.push({ id: r.id, have: Math.min(need, have), need, completes: othersDone && have + 1 >= need });
  }
  return out;
}
