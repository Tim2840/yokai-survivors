import type { Quality } from '../core/save';

/**
 * 設定畫面（docs/20 商業體檢「設定與無障礙」，docs/05 排程第 5 項）。選項全是資料；存檔只存選了哪一個。
 * 特效：手感的四個倍率（震動、頓幀、受傷暈邊、命中／打倒的小特效），和網址 ?fx=、系統「減少動態效果」同一組（core/feel.ts）。
 */
export const FX_LEVELS = {
  full: { shake: 1, hitStop: 1, vignette: 1, pops: 1 },
  low: { shake: 0.5, hitStop: 0, vignette: 0.5, pops: 0.5 },
  off: { shake: 0, hitStop: 0, vignette: 0, pops: 0 },
} as const;
export type FxLevel = keyof typeof FX_LEVELS;
export const FX_CHOICES = Object.keys(FX_LEVELS) as FxLevel[];

/** 字級：所有介面文字的倍率（theme.css 的 --ts） */
export const TEXT_SCALE = { normal: 1, large: 1.15 } as const;
export type TextSize = keyof typeof TEXT_SCALE;
export const TEXT_CHOICES = Object.keys(TEXT_SCALE) as TextSize[];

export const QUALITY_CHOICES: readonly Quality[] = ['auto', 'low', 'mid', 'high'];

/** 音量滑桿：0～100 的整數，存檔存 0～1 */
export const VOLUME_STEP = 5;
