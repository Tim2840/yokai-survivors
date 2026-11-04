import type { Rarity } from './rarity';
import type { StatId } from './stats';

/** 詛咒祭壇（docs/02 第 6.2 節①，D27 改版）：每次隨機抽出數個「不同」效果，其中至少一個是讓這一局變難的詛咒、至少一個是好處 */

/** 好處：百分比提升（pct）。數值 = 稀有度對應的相對提升 */
export const ALTAR_BOON_PCT: Record<Rarity, number> = { common: 0.2, rare: 0.32, epic: 0.48, legend: 0.72 };
export const ALTAR_BOONS: readonly StatId[] = ['power', 'atkSpeed', 'area', 'speed', 'maxHp', 'critDmg', 'pickup'];

/** 詛咒（讓整局的敵人變強；整局有效、跨關保留）。數值是相對增加（0.1 = +10%） */
export const ALTAR_CURSE_IDS = ['enemyHp', 'enemySpeed', 'enemyDamage', 'spawnRate'] as const;
export type CurseId = (typeof ALTAR_CURSE_IDS)[number];
export const ALTAR_CURSE: Record<Rarity, Record<CurseId, number>> = {
  common: { enemyHp: 0.1, enemySpeed: 0.05, enemyDamage: 0.1, spawnRate: 0.1 },
  rare: { enemyHp: 0.15, enemySpeed: 0.08, enemyDamage: 0.15, spawnRate: 0.15 },
  epic: { enemyHp: 0.22, enemySpeed: 0.12, enemyDamage: 0.22, spawnRate: 0.22 },
  legend: { enemyHp: 0.32, enemySpeed: 0.18, enemyDamage: 0.32, spawnRate: 0.32 },
};

/** 一個祭壇抽幾個效果（其中至少 1 好處、1 詛咒） */
export const ALTAR_EFFECT_COUNT: Record<Rarity, number> = { common: 2, rare: 2, epic: 3, legend: 3 };
export const ALTAR_MAX_EFFECTS = 3;
