/**
 * 招式變化（使用者：每個角色的招式要有 3 種變化）。主武器升到 VARIANT_LEVEL 時跳出三選一（同一個選卡面板），
 * 選了就整局固定；三種是「打法不同」而不是「數字不同」，而且各自想要不同的道具（參考 docs/15 第 4 節：
 * 20 Minutes Till Dawn 的武器進化三選一、黑帝斯的武器樣貌、深岩銀河：倖存者的超頻）。
 * 主武器滿級（maxLevel）時，變化本身再加強一次（atMax）。數字為起始提案，用 npm run sim -- --variant 比較三種的強度。
 */
export const VARIANT_LEVEL = 4;

export type VariantType = 'split' | 'orbit' | 'burn';

export interface VariantDef {
  id: string;
  /** 屬於哪把主武器 */
  weapon: string;
  type: VariantType;
  /** 適合搭配的道具（選卡畫面提示用） */
  likes: readonly string[];
  /** split：命中時分裂出幾顆小火、小火傷害比例、找下一個目標的範圍（公尺）；atMax：滿級多分裂 */
  split?: { children: number; damage: number; range: number; atMaxChildren: number; shardBonus: number; reSplit: number };
  /** orbit：不再發射，改成繞身的鬼火（數量 = 鬼火數量）；半徑（× 範圍）、角速度（弧度/秒）、命中半徑、
   *  每隔幾秒判定一次（÷ 攻速、× 冷卻）、傷害比例、擊退；atMax：多一顆、半徑倍率；
   *  innerDamage／innerKnockback：環內護身（D46）：鑽進環內（離身體 < 半徑 − 命中半徑）的人類每次判定受「傷害比例 × innerDamage」並被推出去 */
  orbit?: { radius: number; spin: number; hitRadius: number; tick: number; damage: number; knockback: number; baseOrbs: number; atMaxOrbs: number; atMaxRadius: number; innerDamage: number; innerKnockback: number };
  /** burn：命中處留下燃燒地（半徑 × 範圍、秒數、每隔幾秒燒一次、每次傷害比例），鬼火本身傷害與冷卻倍率；atMax：燃燒地大小倍率 */
  burn?: { radius: number; seconds: number; tick: number; damage: number; shotDamage: number; interval: number; atMaxScale: number; maxZones: number };
}

export const VARIANTS: readonly VariantDef[] = [
  {
    id: 'kitsunebi',
    weapon: 'ghostfire',
    type: 'split',
    likes: ['volley', 'splash', 'atkSpeed', 'power'],
    /** shardBonus：有碎火時每次多 1 片；碎片打中後再分裂 reSplit 片（D43：狐火分裂放大碎火） */
    split: { children: 2, damage: 0.55, range: 7, atMaxChildren: 3, shardBonus: 1, reSplit: 1 },
  },
  {
    id: 'lanternRing',
    weapon: 'ghostfire',
    type: 'orbit',
    likes: ['area', 'hp', 'armor', 'atkSpeed'],
    /** innerDamage／innerKnockback（D46，使用者：「環太爛，幾乎必死」）：以前貼身的人類打不到，sim 貪輸出過關 20%（另外兩種 65～70%）；加了 75%／70% */
    orbit: { radius: 3.0, spin: 2.6, hitRadius: 1.0, tick: 0.25, damage: 1.3, knockback: 3, baseOrbs: 1, atMaxOrbs: 1, atMaxRadius: 1.25, innerDamage: 0.5, innerKnockback: 6 },
  },
  {
    id: 'hellfire',
    weapon: 'ghostfire',
    type: 'burn',
    likes: ['area', 'power', 'atkSpeed'],
    burn: { radius: 1.6, seconds: 2.5, tick: 0.5, damage: 0.35, shotDamage: 1.2, interval: 1.25, atMaxScale: 1.3, maxZones: 24 },
  },
];

export const variantsFor = (weapon: string): VariantDef[] => VARIANTS.filter((v) => v.weapon === weapon);
export const variantById = (id: string): VariantDef => {
  const v = VARIANTS.find((x) => x.id === id);
  if (!v) throw new Error(`沒有這個變化：${id}`);
  return v;
};

/** 變化卡在選卡面板裡的 id 前綴（和法具的 id 分開） */
export const VARIANT_CARD_PREFIX = 'variant:';
export const isVariantCard = (cardId: string): boolean => cardId.startsWith(VARIANT_CARD_PREFIX);
export const variantOfCard = (cardId: string): VariantDef => variantById(cardId.slice(VARIANT_CARD_PREFIX.length));
