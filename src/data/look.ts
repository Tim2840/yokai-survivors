/**
 * 畫面風格（美術方向評估，docs/23 第 8 節）：
 * - classic：現在的樣子（夜晚、平滑的 3D 卡通）。
 * - jrpg：日系 RPG 樣張——整個畫面先畫在低解析度再放大（像素風）、物件邊緣描線、上下移軸景深（模型屋感）、白天的光。
 * 目前只是「樣張」：開發版用 ?look=jrpg，打包時用環境變數 VITE_LOOK=jrpg 做成另一個分享頁；正式採用要使用者拍板。
 */
export interface LookDef {
  id: string;
  /** 像素化：每個畫面像素放大幾倍（0 = 不像素化）；手機另外一個值 */
  pixel: number;
  pixelTouch: number;
  /** 描線強度（依法線與深度找邊） */
  normalEdge: number;
  depthEdge: number;
  /** 移軸景深：模糊強度（0 = 不用）、清楚帶的位置（畫面高度比例，0 = 下緣） */
  tiltShift: number;
  tiltFocus: number;
  /** 覆寫場景主題（ambience 的 key 後綴，例 '@day'） */
  ambienceSuffix: string;
  /** 調色 */
  contrast: number;
  saturation: number;
  vignette: number;
}

export const LOOKS: Record<string, LookDef> = {
  classic: { id: 'classic', pixel: 0, pixelTouch: 0, normalEdge: 0, depthEdge: 0, tiltShift: 0, tiltFocus: 0.5, ambienceSuffix: '', contrast: 1.06, saturation: 1.1, vignette: 0.28 },
  jrpg: { id: 'jrpg', pixel: 3, pixelTouch: 2, normalEdge: 0.35, depthEdge: 0.45, tiltShift: 2.2, tiltFocus: 0.5, ambienceSuffix: '@day', contrast: 1.08, saturation: 1.18, vignette: 0.32 },
};

/** 目前的畫面風格：網址 ?look= 優先（開發），其次打包時的 VITE_LOOK，都沒有就是 classic */
export function currentLook(): LookDef {
  let id = '';
  try {
    id = new URLSearchParams(location.search).get('look') ?? '';
  } catch {
    /* 非瀏覽器環境（sim、單元測試） */
  }
  // 一定要寫成 import.meta.env.VITE_LOOK（Vite 打包時只認得這個寫法，才會換成字串）
  if (!id) id = (import.meta.env.VITE_LOOK as string | undefined) ?? '';
  return LOOKS[id] ?? LOOKS.classic;
}
