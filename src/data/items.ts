import type { StatId } from './stats';
import type { Rarity } from './rarity';

/**
 * 法具（D30 第一步，docs/15 第 3 節；取代「無限重複的屬性卡」）。
 * - 主武器（鬼火）有 8 級，每一級加不同的東西（參考吸血鬼倖存者的魔杖）；**D53 起每一級也看稀有度**（那一級加的東西 × 稀有度倍率）。
 * - 屬性道具最多 5 級，每級固定幅度 × 稀有度倍率（凡 1.0／良 1.2／珍 1.5／極 2.0，參考 Megabonk）。
 * - 「多一顆」「穿透」這種整數效果（D53 起也吃稀有度，小數 = 機率多一顆／多穿一隻）等級很少（多重 2 級，參考 Duplicator）。
 * - 道具欄位有上限（ITEM_SLOTS）：滿了以後只會出現「已有道具的下一級」。都滿級之後出現備用獎勵（療傷、香油錢）。
 * 數字是起始提案，依 npm run sim 校準（docs/02 變更紀錄）。
 */
export const ITEM_SLOTS = 6;

/** 稀有度倍率（只乘在會縮放的道具上） */
export const ITEM_RARITY_MULT: Record<Rarity, number> = { common: 1.0, rare: 1.2, epic: 1.5, legend: 2.0 };

export type ItemKind = 'weapon' | 'stat' | 'mod' | 'fallback';
export type WeaponMod = 'volley' | 'shards' | 'pierce';

export interface ItemDef {
  id: string;
  kind: ItemKind;
  maxLevel: number;
  /** 屬性道具：加哪一個屬性、每級多少（卡片單位：% 類寫 10 = +10%） */
  stat?: StatId;
  /** 武器改造：改哪一項、每級多少 */
  mod?: WeaponMod;
  perLevel?: number;
  /** 這個道具的每級數值會不會乘稀有度倍率 */
  rarityScales: boolean;
  /** 出現權重倍率（沒寫 = 1）、玩家幾級以後才會出現（沒寫 = 一開始就會）：讓太強的道具晚一點、少一點出現 */
  weight?: number;
  minLevel?: number;
  /** 養成門檻（D50，使用者：「主武器的養成速度太快」）：下一級要玩家等級 ≥ levelGate × 目前等級（沒寫 = 沒有門檻） */
  levelGate?: number;
  /** 取捨道具（D30 第二步，參考 Brotato）：每級同時扣的能力值（卡片單位、正數 = 扣多少）。D38 起也乘稀有度：越高階越極端 */
  down?: { stat: StatId; perLevel: number };
}

/** 主武器每升一級加什麼（第 i 個 = 從 Lv(i+1) 升到 Lv(i+2)）。damage 加在基礎傷害；cooldownPct 是冷卻縮短 % */
export interface WeaponLevel {
  damage?: number;
  volley?: number;
  cooldownPct?: number;
  pierce?: number;
  splash?: number;
}

/** 鬼火（提燈小僧）8 級表：Lv1 是起始。顆數、傷害、冷卻、穿透、濺射輪流加，滿級 ≈ 傷害 ×2.9、+2 顆（Lv6 的 +1 顆改成傷害 +3：鬼火分打不同目標後每顆都很值錢） */
export const GHOSTFIRE_LEVELS: readonly WeaponLevel[] = [
  { damage: 3 },
  { volley: 1 },
  { cooldownPct: 10 },
  { damage: 4, pierce: 1 },
  { damage: 3 },
  { cooldownPct: 10, splash: 0.5 },
  { damage: 5, volley: 1 },
];

/** 每隻妖怪的主武器升級表（id = 道具 id） */
export const WEAPON_LEVELS: Record<string, readonly WeaponLevel[]> = { ghostfire: GHOSTFIRE_LEVELS };

export const ITEMS: readonly ItemDef[] = [
  { id: 'ghostfire', kind: 'weapon', maxLevel: GHOSTFIRE_LEVELS.length + 1, rarityScales: true, levelGate: 4 },
  // 屬性道具（5 級）
  { id: 'power', kind: 'stat', stat: 'power', perLevel: 10, maxLevel: 5, rarityScales: true },
  { id: 'atkSpeed', kind: 'stat', stat: 'atkSpeed', perLevel: 8, maxLevel: 5, rarityScales: true },
  { id: 'area', kind: 'stat', stat: 'area', perLevel: 10, maxLevel: 5, rarityScales: true },
  { id: 'hp', kind: 'stat', stat: 'maxHp', perLevel: 20, maxLevel: 5, rarityScales: true },
  { id: 'speed', kind: 'stat', stat: 'speed', perLevel: 6, maxLevel: 5, rarityScales: true },
  { id: 'armor', kind: 'stat', stat: 'armor', perLevel: 2, maxLevel: 5, rarityScales: true },
  { id: 'regen', kind: 'stat', stat: 'regen', perLevel: 0.5, maxLevel: 5, rarityScales: true },
  { id: 'dodge', kind: 'stat', stat: 'dodge', perLevel: 4, maxLevel: 5, rarityScales: true },
  // 取捨道具（D38：只在狐面商拿得到，不進升級／賽錢箱／寶箱）：好處比一般道具大，每級都會扣一項；好處與代價都乘稀有度
  { id: 'cursedBlade', kind: 'stat', stat: 'power', perLevel: 20, maxLevel: 5, rarityScales: true, down: { stat: 'maxHp', perLevel: 10 } },
  { id: 'wildLantern', kind: 'stat', stat: 'atkSpeed', perLevel: 16, maxLevel: 5, rarityScales: true, down: { stat: 'armor', perLevel: 1 } },
  { id: 'diamondBody', kind: 'stat', stat: 'armor', perLevel: 4, maxLevel: 5, rarityScales: true, down: { stat: 'speed', perLevel: 3 } },
  // 武器改造
  // 鬼火增殖：每顆鬼火打不同的敵人之後（修正疊成一顆）變得很強 → 6 級以後才出現、出現機率 ×0.35（使用者：太容易拿到、遊戲太簡單）
  { id: 'volley', kind: 'mod', mod: 'volley', perLevel: 1, maxLevel: 2, rarityScales: true, weight: 0.35, minLevel: 6 },
  // 碎火（道具 id 沿用 splash；D43 取代原本的範圍濺射）：每級平均多飛出 perLevel 片（小數 = 機率多一片），吃稀有度
  { id: 'splash', kind: 'mod', mod: 'shards', perLevel: 0.6, maxLevel: 5, rarityScales: true },
  { id: 'pierce', kind: 'mod', mod: 'pierce', perLevel: 1, maxLevel: 3, rarityScales: true },
  // 備用獎勵（全部滿級、欄位也滿了才會出現；不佔欄位、沒有等級上限）
  { id: 'heal', kind: 'fallback', perLevel: 30, maxLevel: Infinity, rarityScales: true },
  { id: 'meritBag', kind: 'fallback', perLevel: 5, maxLevel: Infinity, rarityScales: true },
];

/** 提燈小僧能拿到的道具（之後依局外解鎖與妖怪分開） */
export const ITEM_POOL: readonly string[] = ['ghostfire', 'power', 'atkSpeed', 'area', 'hp', 'speed', 'armor', 'regen', 'dodge', 'volley', 'splash', 'pierce'];
/** 取捨道具（D38）：只有狐面商會給，已經拿到的下一級也只在狐面商 */
export const TRADE_ITEMS: readonly string[] = ['cursedBlade', 'wildLantern', 'diamondBody'];
export const FALLBACK_ITEMS: readonly string[] = ['heal', 'meritBag'];

/** 出現權重：主武器與已有道具比較容易出現（讓「練滿」有機會） */
/** D50：主武器 1.6 → 1.2（使用者：「主武器的養成速度太快」；另見 levelGate） */
export const ITEM_WEIGHT = { weapon: 1.2, owned: 1.3, fresh: 1 } as const;

/** 稀有度里程碑（參考 Brotato）：升到這些等級時，第一張會縮放的卡至少是這個稀有度（受已解鎖的稀有度限制） */
export function milestoneRarity(level: number): Rarity | null {
  if (level >= 20 && level % 5 === 0) return 'legend';
  if (level === 10 || level === 15) return 'epic';
  if (level === 5) return 'rare';
  return null;
}

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const itemById = (id: string): ItemDef => {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`沒有這個道具：${id}`);
  return d;
};

/** 取捨道具這一級扣多少（卡片單位，正數；D38 起乘稀有度） */
export function itemDown(d: ItemDef, rarity: Rarity): number {
  return d.down ? d.down.perLevel * ITEM_RARITY_MULT[rarity] : 0;
}

/** 主武器某一級的步驟 × 稀有度倍率（D53：每一級升級卡都有稀有度，加成的多寡） */
export function scaleWeaponStep(st: WeaponLevel, rarity: Rarity): WeaponLevel {
  const m = ITEM_RARITY_MULT[rarity];
  return { damage: (st.damage ?? 0) * m, volley: (st.volley ?? 0) * m, cooldownPct: (st.cooldownPct ?? 0) * m, pierce: (st.pierce ?? 0) * m, splash: (st.splash ?? 0) * m };
}

/** 這一級的實際數值（已乘稀有度） */
export function itemValue(d: ItemDef, rarity: Rarity): number {
  return (d.perLevel ?? 0) * (d.rarityScales ? ITEM_RARITY_MULT[rarity] : 1);
}

/**
 * 碎火（D43，使用者：「濺射的選項想要是比較細碎的鬼火數個碎片飛去打敵人，傷害更低」）：
 * 主鬼火命中時，從被打中的人類身上飛出幾片小鬼火，各自追向 range 公尺內其他（不同的）人類，每片傷害 = 那一發 × damage。
 * 一次最多 max 片。碎片本身不再飛出碎片（招式變化「狐火分裂」例外：碎片打中後再分裂 1 次，片數 +1）。
 */
export const SHARDS = { damage: 0.35, range: 6, max: 5 } as const;
