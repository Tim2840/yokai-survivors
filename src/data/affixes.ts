import type { Rarity } from './rarity';
import type { TechMechanic } from './techniques';
import { ITEM_RARITY_MULT } from './items';
import type { Rng } from '../lib/random';

/**
 * 詞條（D53；使用者 2026-11-09 改：「技法的詞條不應該有除了增強技法本身以外的能力，而且怎麼都只有一條加成」）：
 * 技法卡除了學會／升一級，還帶幾條隨機的詞條；**詞條只強化這個技法自己**（不再給最大生命、護甲這類全身的能力值）。
 * 詞條有四種，每種技法只會抽到它「真的有作用」的那幾種（AFFIX_STATS，單元測試逐個檢查每種技法的詞條真的改變了該技法的行為）：
 *  - power 威力：這個技法造成的傷害（或效果）；
 *  - area 範圍：這個技法的作用範圍（半徑、搜尋距離）；
 *  - rate 頻率：這個技法的出手快慢（判定間隔、冷卻、充能、飛行速度）；
 *  - chain 連鎖：連鎖類技法的連鎖數（多分裂、多彈跳、多落火），小數 = 機率多一次。
 * 數值 = 該詞條的基準 × 這張卡的稀有度倍率（凡 1.0／良 1.2／珍 1.5／極 2.0）；條數 凡 2／良 2／珍 3／極 3，同一張卡不重複，
 * 所以每張技法卡至少 2 條（以前凡階只有 1 條）。詞條在發牌時就抽好（固定種子），卡上看得到，選了就永久加在那個技法身上。
 */
export type TechStat = 'power' | 'area' | 'rate' | 'chain';
export const TECH_STATS: readonly TechStat[] = ['power', 'area', 'rate', 'chain'];

export const AFFIX_COUNT: Record<Rarity, number> = { common: 2, rare: 2, epic: 3, legend: 3 };

/** 每條詞條的基準值（比例；chain 是「連鎖數」的增量），乘上稀有度倍率 */
export const AFFIX_BASE: Record<TechStat, number> = { power: 0.1, area: 0.1, rate: 0.1, chain: 0.25 };

/** 每種機制抽得到哪幾種詞條（順序固定，抽選才能用種子重現） */
export const AFFIX_STATS: Record<TechMechanic, readonly TechStat[]> = {
  kitsunebi: ['power', 'area', 'chain'],
  bounce: ['power', 'area', 'chain'],
  homing: ['power', 'rate'],
  rain: ['power', 'area', 'chain'],
  ring: ['power', 'area', 'rate'],
  ward: ['power', 'area', 'rate'],
  satellite: ['power', 'area', 'rate'],
  lamp: ['power', 'area', 'rate'],
  hellfire: ['power', 'area', 'rate'],
  seed: ['power', 'area', 'rate'],
  pillar: ['power', 'area', 'rate'],
  oil: ['power', 'area', 'rate'],
};

export interface Affix {
  stat: TechStat;
  /** 比例（0.12 = +12%）；chain 是連鎖數的增量（0.3 = 平均多 0.3 次） */
  value: number;
}

export const emptyAffixes = (): Record<TechStat, number> => ({ power: 0, area: 0, rate: 0, chain: 0 });

/** 抽一張技法卡的詞條：條數看稀有度，只從這種機制有作用的詞條裡抽，不重複 */
export function rollAffixes(rng: Rng, rarity: Rarity, mech: TechMechanic): Affix[] {
  const pool = [...AFFIX_STATS[mech]];
  const out: Affix[] = [];
  const n = Math.min(AFFIX_COUNT[rarity], pool.length);
  while (out.length < n) {
    const stat = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    out.push({ stat, value: AFFIX_BASE[stat] * ITEM_RARITY_MULT[rarity] });
  }
  return out;
}
