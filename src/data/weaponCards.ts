import type { Rarity } from './rarity';

/**
 * 武器卡（docs/02 第 5.2 節的「武器卡」，M2 起）：改變領頭妖怪攻擊的打法，不是單純加數字。
 * 一開始只有一顆鬼火、沒有濺射，要靠這些卡長出來（使用者 G1b 回饋：開局不要打得太強）。
 */
export type WeaponEffect = 'volley' | 'splash' | 'pierce';

export interface WeaponCard {
  id: string;
  weapon: WeaponEffect;
  values: Record<Rarity, number>;
}

export const WEAPON_CARDS: readonly WeaponCard[] = [
  /** 鬼火增殖：每次多發射幾顆（小數 = 機率多一顆；總數上限見 WEAPON_LIMITS.volley）。數值依 2026-11-04 卡片價值探針調整 */
  { id: 'volley', weapon: 'volley', values: { common: 0.25, rare: 0.4, epic: 0.6, legend: 0.9 } },
  /** 爆裂：命中時濺射半徑（公尺）增加 */
  { id: 'splash', weapon: 'splash', values: { common: 0.3, rare: 0.5, epic: 0.7, legend: 1.0 } },
  /** 穿透：每顆鬼火多穿過幾隻敵人 */
  { id: 'pierce', weapon: 'pierce', values: { common: 0.3, rare: 0.5, epic: 0.8, legend: 1.2 } },
];

export const WEAPON_LIMITS = { volley: 7, splash: 4, pierce: 6 } as const;
