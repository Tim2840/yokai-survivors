import type { Rarity } from './rarity';

/** 屬性卡（docs/02 第 5.1 節）：每階的實際採用值 */
export interface StatCard {
  id: string;
  stat: string;
  starter: boolean;
  values: Record<Rarity, number>;
}

export const STAT_CARDS: readonly StatCard[] = [
  { id: 'hp', stat: 'maxHp', starter: true, values: { common: 10, rare: 16, epic: 24, legend: 35 } },
  { id: 'power', stat: 'power', starter: true, values: { common: 10, rare: 16, epic: 24, legend: 35 } },
  { id: 'atkSpeed', stat: 'atkSpeed', starter: true, values: { common: 10, rare: 16, epic: 24, legend: 35 } },
  { id: 'area', stat: 'area', starter: true, values: { common: 10, rare: 16, epic: 24, legend: 35 } },
  { id: 'speed', stat: 'speed', starter: true, values: { common: 8, rare: 13, epic: 19, legend: 28 } },
  { id: 'crit', stat: 'crit', starter: true, values: { common: 3, rare: 5, epic: 7, legend: 10 } },
  { id: 'critDmg', stat: 'critDmg', starter: true, values: { common: 10, rare: 16, epic: 24, legend: 35 } },
  { id: 'armor', stat: 'armor', starter: true, values: { common: 1, rare: 2, epic: 3, legend: 4 } },
  { id: 'regen', stat: 'regen', starter: false, values: { common: 0.3, rare: 0.5, epic: 0.7, legend: 1.0 } },
  { id: 'pickup', stat: 'pickup', starter: false, values: { common: 12, rare: 19, epic: 29, legend: 42 } },
  { id: 'dodge', stat: 'dodge', starter: false, values: { common: 2, rare: 3, epic: 5, legend: 7 } },
  { id: 'luck', stat: 'luck', starter: false, values: { common: 5, rare: 8, epic: 12, legend: 18 } },
];
