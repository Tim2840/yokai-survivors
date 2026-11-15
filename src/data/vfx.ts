/**
 * 技法特效的風格與數字（docs/30，Q59 照預設：浮世繪取代水墨、先火＋水，再大招）。
 * 每隻妖怪一種「屬性的樣子」：fire = 燃燒的火舌＋火星＋燒焦痕；water = 浪、漣漪、水花（第二批）；ink = D85 的水墨（還沒換的）。
 */
export type VfxStyle = 'fire' | 'water' | 'ink';

export const VFX_STYLE: Record<string, VfxStyle> = {
  'chochin-kozo': 'fire',
  kappa: 'ink',
};
export const vfxStyleOf = (yokaiId: string): VfxStyle => VFX_STYLE[yokaiId] ?? 'ink';

/**
 * 火（浮世繪的火焰紋）：一個「火舌」= 面向鏡頭（只繞垂直軸轉）的一片，著色器畫出往上竄、尖端分叉捲曲、會搖的火，
 * 顏色是平塗的色帶（暗紅描邊 → 朱 → 橙 → 山吹 → 白芯），不是發光的光暈。
 * 火星（火の粉）：小小的菱形往上飄、左右晃、慢慢變暗。
 * 數量上限一次配置好（物件池，熱路徑不 new）。
 */
export const FIRE_FX = {
  /** 同時畫的火舌、火星上限（同一個實例化網格，一次繪製） */
  maxFlames: 320,
  maxSparks: 160,
  /** 火舌搖動的速度 */
  speed: 1.0,
  /** 投射物（鬼火）：寬、高（公尺）、離地；碎片縮小倍率在 runView */
  bullet: { w: 0.8, h: 1.1, lift: 0.45, sparkRate: 3 },
  /** 繞身的火球、衛星燈、開路燈：火舌疊在球上 */
  orb: { w: 1.0, h: 1.45, base: 0.55 },
  /** 火種、身上的火（燈油） */
  seed: { w: 0.6, h: 0.9 },
  oil: { w: 0.5, h: 0.8 },
  /** 燃燒地：每灘幾條火舌（依半徑）、每條的大小（相對半徑）、焦痕顏色、每秒噴幾顆火星 */
  zone: { tonguesBase: 2, tonguesPerMeter: 1.4, tonguesMax: 6, w: 0.62, h: 0.62, scorch: '#3a1712', sparkRate: 2.5 },
  /** 火柱：主火＋兩側的副火；高度（公尺） */
  pillar: { h: 6.5, sideH: 3.6, sparkRate: 18 },
  /** 爆開（火種、火柱落地…）：一圈火舌、一次噴的火星 */
  burst: { tongues: 6, h: 0.65, sparks: 10 },
  /** 護身火：充好時身邊一圈小火（數量、半徑、大小）；充能中火很小 */
  ward: { n: 10, r: 1.75, w: 0.45, h: 0.7 },
  /** 火星：大小、往上的初速、壽命（秒）、往上的浮力、左右晃 */
  spark: { size: 0.13, up: 2.4, spread: 1.6, life: 0.9, lift: 1.2, sway: 1.4 },
} as const;
