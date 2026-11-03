/** 畫質分級（從燈落之境 renderer.ts 搬來的數字，docs/06 第 6 節）。0 全開 → 4 最省 */
export const MAX_QUALITY_LEVEL = 4;
export const QUALITY = {
  /** 手動模式對應的等級 */
  modeLevel: { high: 0, mid: 2, low: 4 },
  /** 各等級的像素倍率上限（觸控裝置／電腦） */
  ratioCapTouch: [2, 2, 1.6, 1.25, 1],
  ratioCapDesktop: [2, 2, 2, 1.5, 1],
  /** 自動降級：每 windowMs 看一次平均每幅時間，超過 slowFrameMs 降一級（只降不升；不存檔） */
  windowMs: 1500,
  slowFrameMs: 26,
  /** 開場與切回分頁後不量的時間 */
  warmupMs: 3000,
  resumeWarmupMs: 1500,
  /** Bloom：強度、半徑、門檻（只讓鬼火、紙燈這類高亮的東西發光） */
  bloom: { strength: 0.5, radius: 0.3, threshold: 1.05 },
  /** 調色：對比、飽和、暈影。移軸模糊不用（割草遊戲畫面邊緣也要看得清楚，docs/08 可讀性優先） */
  grade: { contrast: 1.06, saturation: 1.1, vignette: 0.28 },
} as const;
