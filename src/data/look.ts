/**
 * 畫面風格（美術方向評估，docs/23 第 8 節）：
 * - classic：現在的樣子（夜晚、平滑的 3D 卡通）。
 * - jrpg：日系 RPG 樣張——整個畫面先畫在低解析度再放大（像素風）、物件邊緣描線、上下移軸景深（模型屋感）、白天的光。
 * D72 起預設是 jrpg；開發版可用 ?look=classic 看舊的樣子（打包時也可用 VITE_LOOK）。
 */
export interface LookDef {
  id: string;
  /** 像素化：每個畫面像素放大幾倍（0 = 不像素化）；手機另外一個值 */
  pixel: number;
  pixelTouch: number;
  /** 描線：深色線的強度（0～1）、相對深度差從多少開始到多少算滿（越小越容易描到） */
  edge: number;
  edgeFrom: number;
  edgeTo: number;
  /** 移軸景深：模糊強度（0 = 不用）、清楚帶的位置（畫面高度比例，0 = 下緣） */
  tiltShift: number;
  tiltFocus: number;
  /** 依關卡換時段（白天→黃昏→夜晚，D72）；false = 永遠是基本主題（夜晚） */
  timeOfDay: boolean;
  /** 調色 */
  contrast: number;
  saturation: number;
  vignette: number;
}

/** 預設風格（D72：使用者「照你的，開始做」＝日系 RPG 像素風）。舊的樣子用 ?look=classic */
export const DEFAULT_LOOK = 'jrpg';

export const LOOKS: Record<string, LookDef> = {
  classic: { id: 'classic', pixel: 0, pixelTouch: 0, edge: 0, edgeFrom: 0.05, edgeTo: 0.1, tiltShift: 0, tiltFocus: 0.5, timeOfDay: false, contrast: 1.06, saturation: 1.1, vignette: 0.28 },
  jrpg: { id: 'jrpg', pixel: 3, pixelTouch: 2, edge: 0.55, edgeFrom: 0.05, edgeTo: 0.12, tiltShift: 2.2, tiltFocus: 0.5, timeOfDay: true, contrast: 1.08, saturation: 1.18, vignette: 0.32 },
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
