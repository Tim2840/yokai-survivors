import type { StatId } from './stats';
import type { Rarity } from './rarity';

/**
 * 法具（D30 第一步，docs/15 第 3 節；取代「無限重複的屬性卡」）。
 * - 主武器（鬼火）有 8 級，每一級加不同的東西（參考吸血鬼倖存者的魔杖）；升級不看稀有度。
 * - 屬性道具最多 5 級，每級固定幅度 × 稀有度倍率（凡 1.0／靈 1.2／妖 1.5／神 2.0，參考 Megabonk）。
 * - 「多一顆」「穿透」這種整數效果不吃稀有度，而且等級很少（鬼火增殖 2 級，參考 Duplicator）。
 * - 道具欄位有上限（ITEM_SLOTS）：滿了以後只會出現「已有道具的下一級」。都滿級之後出現備用獎勵（療傷、香油錢）。
 * 數字是起始提案，依 npm run sim 校準（docs/02 變更紀錄）。
 */
export const ITEM_SLOTS = 6;

/** 稀有度倍率（只乘在會縮放的道具上） */
export const ITEM_RARITY_MULT: Record<Rarity, number> = { common: 1.0, rare: 1.2, epic: 1.5, legend: 2.0 };

export type ItemKind = 'weapon' | 'stat' | 'mod' | 'fallback';
export type WeaponMod = 'volley' | 'splash' | 'pierce';

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
  /** 取捨道具（D30 第二步，參考 Brotato）：每級同時扣的屬性（卡片單位、正數 = 扣多少；不乘稀有度） */
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

/** 鬼火（提燈小僧）8 級表：Lv1 是起始。顆數、傷害、冷卻、穿透、濺射輪流加，滿級 ≈ 傷害 ×2.5、+3 顆 */
export const GHOSTFIRE_LEVELS: readonly WeaponLevel[] = [
  { damage: 3 },
  { volley: 1 },
  { cooldownPct: 10 },
  { damage: 4, pierce: 1 },
  { volley: 1 },
  { cooldownPct: 10, splash: 0.5 },
  { damage: 5, volley: 1 },
];

/** 每隻妖怪的主武器升級表（id = 道具 id） */
export const WEAPON_LEVELS: Record<string, readonly WeaponLevel[]> = { ghostfire: GHOSTFIRE_LEVELS };

export const ITEMS: readonly ItemDef[] = [
  { id: 'ghostfire', kind: 'weapon', maxLevel: GHOSTFIRE_LEVELS.length + 1, rarityScales: false },
  // 屬性道具（5 級）
  { id: 'power', kind: 'stat', stat: 'power', perLevel: 10, maxLevel: 5, rarityScales: true },
  { id: 'atkSpeed', kind: 'stat', stat: 'atkSpeed', perLevel: 8, maxLevel: 5, rarityScales: true },
  { id: 'area', kind: 'stat', stat: 'area', perLevel: 10, maxLevel: 5, rarityScales: true },
  { id: 'hp', kind: 'stat', stat: 'maxHp', perLevel: 20, maxLevel: 5, rarityScales: true },
  { id: 'speed', kind: 'stat', stat: 'speed', perLevel: 6, maxLevel: 5, rarityScales: true },
  { id: 'armor', kind: 'stat', stat: 'armor', perLevel: 2, maxLevel: 5, rarityScales: true },
  { id: 'regen', kind: 'stat', stat: 'regen', perLevel: 0.5, maxLevel: 5, rarityScales: true },
  { id: 'dodge', kind: 'stat', stat: 'dodge', perLevel: 4, maxLevel: 5, rarityScales: true },
  // 取捨道具：好處比一般道具大，但每級都會扣一項（不乘稀有度）
  { id: 'cursedBlade', kind: 'stat', stat: 'power', perLevel: 20, maxLevel: 5, rarityScales: true, down: { stat: 'maxHp', perLevel: 10 } },
  { id: 'wildLantern', kind: 'stat', stat: 'atkSpeed', perLevel: 16, maxLevel: 5, rarityScales: true, down: { stat: 'armor', perLevel: 1 } },
  { id: 'diamondBody', kind: 'stat', stat: 'armor', perLevel: 4, maxLevel: 5, rarityScales: true, down: { stat: 'speed', perLevel: 3 } },
  // 武器改造
  { id: 'volley', kind: 'mod', mod: 'volley', perLevel: 1, maxLevel: 2, rarityScales: false },
  { id: 'splash', kind: 'mod', mod: 'splash', perLevel: 0.3, maxLevel: 5, rarityScales: true },
  { id: 'pierce', kind: 'mod', mod: 'pierce', perLevel: 1, maxLevel: 3, rarityScales: false },
  // 備用獎勵（全部滿級、欄位也滿了才會出現；不佔欄位、沒有等級上限）
  { id: 'heal', kind: 'fallback', perLevel: 30, maxLevel: Infinity, rarityScales: false },
  { id: 'meritBag', kind: 'fallback', perLevel: 5, maxLevel: Infinity, rarityScales: false },
];

/** 提燈小僧能拿到的道具（之後依局外解鎖與妖怪分開） */
export const ITEM_POOL: readonly string[] = ['ghostfire', 'power', 'atkSpeed', 'area', 'hp', 'speed', 'armor', 'regen', 'dodge', 'volley', 'splash', 'pierce', 'cursedBlade', 'wildLantern', 'diamondBody'];
export const FALLBACK_ITEMS: readonly string[] = ['heal', 'meritBag'];

/** 出現權重：主武器與已有道具比較容易出現（讓「練滿」有機會） */
export const ITEM_WEIGHT = { weapon: 1.6, owned: 1.3, fresh: 1 } as const;

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

/** 這一級的實際數值（已乘稀有度） */
export function itemValue(d: ItemDef, rarity: Rarity): number {
  return (d.perLevel ?? 0) * (d.rarityScales ? ITEM_RARITY_MULT[rarity] : 1);
}
