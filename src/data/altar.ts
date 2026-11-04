import type { Rarity } from './rarity';
import type { StatId } from './stats';

/** 詛咒祭壇（docs/02 第 6.2 節①）：一項提升、一項降低（相對變化，%） */
export const ALTAR: Record<Rarity, { up: number; down: number }> = {
  common: { up: 20, down: 12 },
  rare: { up: 32, down: 17 },
  epic: { up: 48, down: 22 },
  legend: { up: 72, down: 28 },
};

/** 提升池：百分比提升（pct）。幸運、迴避是實數／基礎為 0，百分比沒有意義，先不放（docs/02 6.2 待補） */
export const ALTAR_UP: readonly StatId[] = ['power', 'atkSpeed', 'area', 'speed', 'maxHp', 'critDmg', 'pickup'];
/** 降低池：百分比降低（pct）。護甲改成固定值（下表），迴避沒有迴避才出所以先不放 */
export const ALTAR_DOWN_PCT: readonly StatId[] = ['maxHp', 'speed', 'area', 'pickup'];
/** 降低護甲的固定值（凡／靈／妖／神） */
export const ALTAR_DOWN_ARMOR: Record<Rarity, number> = { common: 3, rare: 4, epic: 5, legend: 7 };
