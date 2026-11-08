import { ITEMS, itemValue, type ItemDef } from './items';
import type { Rarity } from './rarity';
import type { StatId } from './stats';
import type { Rng } from '../lib/random';

/**
 * 詞條（D53，使用者 2026-11-06：「連技法也要每個升級卡片都加成不一樣，從現有的能抽到的數值去抽選，越稀有的數值越好，也越多詞條」）：
 * 技法卡除了學會／升一級，還帶幾條隨機的能力值加成。詞條的候選 = 現有法具能給的屬性（力量、迅捷、廣域、強健、疾風、堅甲、再生、迴避），
 * 每一條的數值 = 那個法具一級的數值 × 這張卡的稀有度倍率（凡 1.0／良 1.2／珍 1.5／極 2.0）；條數越稀有越多（AFFIX_COUNT），
 * 同一張卡不會有兩條一樣的。詞條在發牌時就抽好（固定種子），卡上看得到，選了就永久加在身上。
 */
export const AFFIX_COUNT: Record<Rarity, number> = { common: 1, rare: 2, epic: 3, legend: 4 };

export interface Affix {
  stat: StatId;
  /** 卡片單位（% 類 10 = +10%，和法具卡同一套） */
  value: number;
  /** 數值來自哪個法具（候選的來源，測試與文字用） */
  item: string;
}

/** 候選：屬性法具（不含取捨道具）。順序固定，抽選才能用種子重現 */
export function affixPool(): ItemDef[] {
  return ITEMS.filter((d) => d.kind === 'stat' && !d.down && d.stat);
}

/** 抽一張卡的詞條：條數看稀有度，不重複 */
export function rollAffixes(rng: Rng, rarity: Rarity): Affix[] {
  const pool = affixPool();
  const out: Affix[] = [];
  const n = Math.min(AFFIX_COUNT[rarity], pool.length);
  while (out.length < n) {
    const d = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    out.push({ stat: d.stat!, value: itemValue(d, rarity), item: d.id });
  }
  return out;
}
