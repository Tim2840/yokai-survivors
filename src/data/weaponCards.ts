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
  /** 鬼火增殖：每次多發射幾顆（總數上限見 WEAPON_LIMITS.volley） */
  { id: 'volley', weapon: 'volley', values: { common: 1, rare: 1, epic: 2, legend: 2 } },
  /** 爆裂：命中時濺射半徑（公尺）增加 */
  { id: 'splash', weapon: 'splash', values: { common: 0.6, rare: 0.9, epic: 1.2, legend: 1.6 } },
  /** 穿透：每顆鬼火多穿過幾隻敵人 */
  { id: 'pierce', weapon: 'pierce', values: { common: 1, rare: 1, epic: 2, legend: 2 } },
];

export const WEAPON_LIMITS = { volley: 7, splash: 4, pierce: 6 } as const;
