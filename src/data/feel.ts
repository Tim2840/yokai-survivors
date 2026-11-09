/**
 * 手感（D69，docs/20 排程順序 1；使用者 2026-11-09：「開始」）：螢幕震動、頓幀、受傷暈邊、擊殺爆圈、升級光環。
 * **只動呈現層，不改模擬**（sim 與平衡不受影響）。所有數字都在這裡；玩家可以用「減少特效」整組關掉（設定畫面之後接，先吃
 * `?fx=off` 與系統的 prefers-reduced-motion）。
 */
export const FEEL = {
  /** 螢幕震動：trauma 0～1，位移 ∝ trauma²（小震幾乎看不到、大震才明顯）；每秒衰減；最大位移（公尺）、頻率（Hz） */
  shake: { max: 1, decay: 2.4, amplitude: 0.32, frequency: 34, hurt: 0.32, elite: 0.3, boss: 0.9, ult: 0.6, evolve: 0.5, element: 0.18, levelUp: 0.12 },
  /** 頓幀：事件發生時模擬停這麼多秒（畫面照畫，只是動作凝結一下）；同時多個取最長、不疊加 */
  hitStop: { elite: 0.05, boss: 0.14, ult: 0.07, evolve: 0.09 },
  /** 受傷暈邊：強度 = 基礎 + 傷害佔最大生命的比例 × 倍率（夾在 max）；每秒淡出 */
  vignette: { base: 0.22, perFrac: 1.6, max: 0.6, fade: 1.8 },
  /** 擊殺爆圈：最多同時幾個、存活秒數、半徑（公尺：一般／精英／頭目）、每幀最多新生幾個 */
  pop: { pool: 72, life: 0.3, radius: { normal: 0.9, elite: 1.6, boss: 3.2 }, perFrame: 14 },
  /** 升級光環：存活秒數、最大半徑（公尺） */
  levelRing: { life: 0.75, radius: 4.2 },
  /** 擊殺紀錄環形緩衝（Run 寫、畫面讀）的長度 */
  deathLog: 128,
} as const;

/** 受傷暈邊的強度（0～1）：傷害越大越紅；純函式，測試用 */
export function hurtStrength(damage: number, maxHp: number): number {
  const frac = maxHp > 0 ? damage / maxHp : 0;
  return Math.min(FEEL.vignette.max, FEEL.vignette.base + frac * FEEL.vignette.perFrac);
}
