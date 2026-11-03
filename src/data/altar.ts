import type { Rarity } from './rarity';

/** 詛咒祭壇（docs/02 第 6.2 節①）：一項提升、一項降低（相對變化，%） */
export const ALTAR: Record<Rarity, { up: number; down: number }> = {
  common: { up: 20, down: 12 },
  rare: { up: 32, down: 17 },
  epic: { up: 48, down: 22 },
  legend: { up: 72, down: 28 },
};
