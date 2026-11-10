import type { Rarity } from './rarity';
import type { TechMechanic } from './techniques';
import { ITEM_RARITY_MULT } from './items';
import type { Rng } from '../lib/random';

/**
 * 詞條（D53；D74 使用者 2026-11-09：「技法的詞條不應該有除了增強技法本身以外的能力」；
 * D77 使用者 2026-11-10：「所有的詞條庫請統一名稱」「詞條庫再加點不同詞條」「技法每一級升級請拿掉每一級升級強化，留下隨機詞條即可（詞條數值變化再豐富一點）」）：
 * 技法卡除了學會／升一級，還帶幾條隨機的詞條；**詞條只強化這個技法自己**；**技法變強只靠詞條**（升級本身不再 +%，見 TECH_LEVELS）。
 * 名稱和全身能力值共用同一組字（AFFIX_LABEL 指向 stat.*，單元測試守著）：
 *  - power 攻擊力：這個技法造成的傷害（或效果）；
 *  - area 範圍：作用範圍（半徑、搜尋距離）；
 *  - rate 攻擊速度：出手快慢（判定間隔、冷卻、充能、飛行速度）；
 *  - chain 連鎖：連鎖類技法多分裂、多彈跳、多落火（小數 = 機率多一次）；
 *  - crit 暴擊率：這個技法的傷害多一份暴擊機率；
 *  - critDmg 暴擊傷害：這個技法暴擊時的倍率（命中效果沿用那一下有沒有暴擊）；
 *  - duration 持續時間：留在地上的燃燒、身上的火燒多久；
 *  - count 數量：繞身的顆數、燈籠數、一次噴幾根柱子（只出現在 珍、極，一次 +1）。
 * 每種技法只會抽到它「真的有作用」的那幾種（AFFIX_STATS；單元測試逐個檢查）。
 * 數值 = 基準 × 稀有度倍率（凡 1.0／良 1.2／珍 1.5／極 2.0）× 隨機（AFFIX_ROLL，取整到 1%），所以同稀有度的兩張卡也不一樣。
 * 條數 凡 2／良 2／珍 3／極 3，同一張卡不重複；在發牌時就抽好（固定種子），卡上看得到，選了就永久加在那個技法身上。
 */
export type TechStat = 'power' | 'area' | 'rate' | 'chain' | 'crit' | 'critDmg' | 'duration' | 'count';
export const TECH_STATS: readonly TechStat[] = ['power', 'area', 'rate', 'chain', 'crit', 'critDmg', 'duration', 'count'];

/** 詞條的名稱：一律借用全身能力值的字（統一名稱，D77） */
export const AFFIX_LABEL: Record<TechStat, string> = {
  power: 'stat.power',
  area: 'stat.area',
  rate: 'stat.atkSpeed',
  chain: 'stat.chain',
  crit: 'stat.crit',
  critDmg: 'stat.critDmg',
  duration: 'stat.duration',
  count: 'stat.count',
};

export const AFFIX_COUNT: Record<Rarity, number> = { common: 2, rare: 2, epic: 3, legend: 3 };

/**
 * 每條詞條的基準值（比例；chain 是連鎖數的增量；count 是整數、不吃稀有度與隨機），乘上稀有度倍率與隨機。
 * D77：拿掉每級 +12% 之後，攻擊力的基準從 0.1 提高（sim 校準，docs/02 變更紀錄）。
 */
export const AFFIX_BASE: Record<TechStat, number> = { power: 0.3, area: 0.12, rate: 0.12, chain: 0.3, crit: 0.1, critDmg: 0.5, duration: 0.25, count: 1 };

/** 隨機範圍：基準 × [lo, hi]（均勻），取整到 1% */
export const AFFIX_ROLL = { lo: 0.6, hi: 1.4 } as const;

/** 數量詞條只出現在這些稀有度 */
export const COUNT_RARITIES: readonly Rarity[] = ['epic', 'legend'];

/** 每種機制抽得到哪幾種詞條（順序固定，抽選才能用種子重現） */
export const AFFIX_STATS: Record<TechMechanic, readonly TechStat[]> = {
  kitsunebi: ['power', 'area', 'chain', 'crit', 'critDmg'],
  bounce: ['power', 'area', 'chain', 'crit', 'critDmg'],
  homing: ['power', 'rate'],
  rain: ['power', 'area', 'chain', 'crit', 'critDmg'],
  ring: ['power', 'area', 'rate', 'crit', 'critDmg', 'count'],
  ward: ['power', 'area', 'rate', 'crit', 'critDmg'],
  satellite: ['power', 'area', 'rate', 'crit', 'critDmg', 'count'],
  lamp: ['power', 'area', 'rate', 'crit', 'critDmg', 'count'],
  hellfire: ['power', 'area', 'rate', 'crit', 'critDmg', 'duration'],
  seed: ['power', 'area', 'rate', 'crit', 'critDmg'],
  pillar: ['power', 'area', 'rate', 'crit', 'critDmg', 'count'],
  oil: ['power', 'area', 'rate', 'crit', 'critDmg', 'duration'],
};

export interface Affix {
  stat: TechStat;
  /** 比例（0.12 = +12%）；chain 是連鎖數的增量（0.3 = 平均多 0.3 次）；count 是整數 */
  value: number;
}

export const emptyAffixes = (): Record<TechStat, number> => ({ power: 0, area: 0, rate: 0, chain: 0, crit: 0, critDmg: 0, duration: 0, count: 0 });

/** 一條詞條的數值（count 固定 1；其他 = 基準 × 稀有度倍率 × 隨機，取整到 1%） */
export function affixValue(rng: Rng, stat: TechStat, rarity: Rarity): number {
  if (stat === 'count') return AFFIX_BASE.count;
  const r = AFFIX_ROLL.lo + (AFFIX_ROLL.hi - AFFIX_ROLL.lo) * rng.next();
  return Math.max(0.01, Math.round(AFFIX_BASE[stat] * ITEM_RARITY_MULT[rarity] * r * 100) / 100);
}

/** 抽一張技法卡的詞條：條數看稀有度，只從這種機制有作用的詞條裡抽，不重複 */
export function rollAffixes(rng: Rng, rarity: Rarity, mech: TechMechanic): Affix[] {
  const pool = AFFIX_STATS[mech].filter((s) => s !== 'count' || COUNT_RARITIES.includes(rarity));
  const out: Affix[] = [];
  const n = Math.min(AFFIX_COUNT[rarity], pool.length);
  while (out.length < n) {
    const stat = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    out.push({ stat, value: affixValue(rng, stat, rarity) });
  }
  return out;
}
