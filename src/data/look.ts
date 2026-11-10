/**
 * 畫面風格（美術方向評估，docs/23 第 8 節）：
 * - classic：現在的樣子（夜晚、平滑的 3D 卡通）。
 * - jrpg：日系 RPG 樣張——整個畫面先畫在低解析度再放大（像素風）、物件邊緣描線、上下移軸景深（模型屋感）、白天的光。
 * D72 起預設是 jrpg；開發版可用 ?look=classic 看舊的樣子（打包時也可用 VITE_LOOK）。
 */
export interface LookDef {
  id: string;
  /** 像素化：低解析度畫面的「短邊」有幾個像素（0 = 不像素化）。依畫面大小換算放大倍率（可以不是整數），桌面與手機的像素粗細感一致 */
  pixelShort: number;
  /** 調色盤量化：每個色頻分幾階（0 = 不量化）、抖動強度（0～1；用 4×4 Bayer 矩陣，在低解析度像素上抖） */
  levels: number;
  dither: number;
  /** 描線：深色線的強度（0～1）、相對深度差從多少開始到多少算滿（越小越容易描到） */
  edge: number;
  edgeFrom: number;
  edgeTo: number;
  /** 移軸景深：模糊強度（0 = 不用）、清楚帶的位置（畫面高度比例，0 = 下緣） */
  tiltShift: number;
  tiltFocus: number;
  /** 卡通著色：光影分成幾階（0 = 平滑的一般著色）。像素畫的光影是一塊一塊的色階，不是平滑漸層 */
  toonSteps: number;
  /** 真陰影（太陽／月光投出來的影子，只有玩家、地圖上的物件、樹會投；敵人用腳下的圓影） */
  shadows: boolean;
  /** 真陰影的設定：覆蓋範圍（公尺，以玩家為中心的方形邊長的一半）、陰影圖邊長（像素；手機用 mobile）、偏移（避免自己的影子畫在自己身上） */
  shadow: { extent: number; size: number; sizeTouch: number; bias: number; normalBias: number };
  /** 依關卡換時段（白天→黃昏→夜晚，D72）；false = 永遠是基本主題（夜晚） */
  timeOfDay: boolean;
  /** 調色 */
  contrast: number;
  saturation: number;
  vignette: number;
  /** 真陰影的濃度（0～1；1 = 全黑）：太濃會變成一塊塊黑影 */
  shadowStrength: number;
  /** 卡通著色最暗那一階的亮度（0～1）：太低背光面會變黑塊 */
  rampMin: number;
}

/** 預設風格（D72：使用者「照你的，開始做」＝日系 RPG 像素風）。舊的樣子用 ?look=classic */
export const DEFAULT_LOOK = 'jrpg';

export const LOOKS: Record<string, LookDef> = {
  classic: { id: 'classic', toonSteps: 0, shadows: false, shadow: { extent: 24, size: 1024, sizeTouch: 1024, bias: -0.0005, normalBias: 0.05 }, pixelShort: 0, levels: 0, dither: 0, edge: 0, edgeFrom: 0.05, edgeTo: 0.1, tiltShift: 0, tiltFocus: 0.5, timeOfDay: false, contrast: 1.06, saturation: 1.1, vignette: 0.28, shadowStrength: 1, rampMin: 0.38 },
  jrpg: { id: 'jrpg', toonSteps: 4, shadows: true, shadow: { extent: 24, size: 2048, sizeTouch: 1024, bias: -0.0005, normalBias: 0.06 }, pixelShort: 520, levels: 20, dither: 0.25, edge: 0.3, edgeFrom: 0.08, edgeTo: 0.2, tiltShift: 0, tiltFocus: 0.5, timeOfDay: true, contrast: 1.08, saturation: 1.15, vignette: 0.16, shadowStrength: 0.55, rampMin: 0.6 },
};

/** 目前的畫面風格：網址 ?look= 優先（開發），其次打包時的 VITE_LOOK，都沒有就用 DEFAULT_LOOK */
export function currentLook(): LookDef {
  let id = '';
  try {
    id = new URLSearchParams(location.search).get('look') ?? '';
  } catch {
    /* 非瀏覽器環境（sim、單元測試） */
  }
  // 一定要寫成 import.meta.env.VITE_LOOK（Vite 打包時只認得這個寫法，才會換成字串）
  if (!id) id = (import.meta.env.VITE_LOOK as string | undefined) ?? '';
  return LOOKS[id] ?? LOOKS[DEFAULT_LOOK];
}
