/** 遊戲狀態（docs/06 第 2 節）。PAUSE 不是狀態，是覆蓋層。 */
export const GAME_STATES = ['BOOT', 'MENU', 'RUN_SETUP', 'COMBAT', 'INTERMISSION', 'RUN_END', 'META_SHOP'] as const;
export type GameState = (typeof GAME_STATES)[number];

/**
 * 合法轉換表。
 * - RUN_SETUP → MENU：選妖怪時按返回。
 * - INTERMISSION → RUN_END：整備時放棄這一局（照結算規則給局外獎勵）。
 * - RUN_END → RUN_SETUP：結算畫面的「再來一局」；RUN_END → META_SHOP：「去神社」（docs/08 第 5 節）。
 * - MENU → META_SHOP：從主選單直接去神社。
 */
export const TRANSITIONS: Readonly<Record<GameState, readonly GameState[]>> = {
  BOOT: ['MENU'],
  MENU: ['RUN_SETUP', 'META_SHOP'],
  RUN_SETUP: ['COMBAT', 'MENU'],
  COMBAT: ['INTERMISSION', 'RUN_END'],
  INTERMISSION: ['COMBAT', 'RUN_END'],
  RUN_END: ['META_SHOP', 'RUN_SETUP', 'MENU'],
  META_SHOP: ['MENU', 'RUN_SETUP'],
};

/** 會不會被分頁失焦自動暫停（只有模擬在跑的狀態） */
export const SIMULATED_STATES: readonly GameState[] = ['COMBAT', 'INTERMISSION'];
