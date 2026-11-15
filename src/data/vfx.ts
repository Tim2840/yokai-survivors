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
  /** 每幀畫的火舌上限（和粒子同一個實例化網格，一次繪製） */
  maxFlames: 320,
  /** 火舌搖動的速度 */
  speed: 1.0,
  /** 投射物（鬼火）：寬、高（公尺）、離地；碎片縮小倍率在 runView */
  bullet: { w: 0.8, h: 1.1, lift: 0.45, sparkRate: 3, halo: 0.9 },
  /** 繞身的火球、衛星燈、開路燈：火舌疊在球上 */
  orb: { w: 1.0, h: 1.45, base: 0.55, halo: 1.1, sparkRate: 1.5 },
  /** 火種、身上的火（燈油） */
  seed: { w: 0.6, h: 0.9, sparkRate: 10 },
  oil: { w: 0.5, h: 0.8 },
  /** 燃燒地：每灘幾條火舌（依半徑）、每條的大小（相對半徑）、焦痕顏色、每秒噴幾顆火星 */
  zone: { tonguesBase: 2, tonguesPerMeter: 1.4, tonguesMax: 6, w: 0.62, h: 0.62, scorch: '#3a1712', sparkRate: 2.5, smokeRate: 0.8 },
  /** 火柱：主火＋兩側的副火；高度（公尺） */
  pillar: { h: 6.5, sideH: 3.6, sparkRate: 18, smokeRate: 6 },
  /** 爆開（火種、火柱落地…）：一圈火舌、一次噴的火星 */
  burst: { tongues: 6, h: 0.65, sparks: 10, blobs: 4, smoke: 1 },
  /** 護身火：充好時身邊一圈小火（數量、半徑、大小）；充能中火很小 */
  ward: { n: 10, r: 1.75, w: 0.45, h: 0.7 },
  /** 燈籠環的環內護身推開人類那一下：一圈往外倒的火（條數、速度、大小、壽命）、火星 */
  guard: { n: 10, speed: 3.4, w: 0.5, h: 0.8, life: 0.35, sparks: 8 },
  /** 火星：大小、往上的初速、壽命（秒）、往上的浮力、左右晃 */
  spark: { size: 0.13, up: 2.4, spread: 1.6, life: 0.9, lift: 1.2, sway: 1.4 },
  /**
   * 會飛、會消失的粒子（D91）：火星、金色閃光（きら）、煙（浮世繪的捲雲）、飛出去的小火團、短暫的火焰，共用一個池。
   * 每個粒子自己記位置、速度、壽命、大小變化；全部在火的同一個實例化網格裡畫（一次繪製）。
   */
  maxParticles: 420,
  /** 光（加法混合、很淡）：地上的火光、投射物與火球的光暈；每幀最多幾個、短暫的光幾個；畫質等級到 offAtQuality（4 = 最省）就不畫 */
  glow: { max: 96, transient: 48, color: '#ff8a2a', ground: 0.32, halo: 0.22, offAtQuality: 4 },
  /** 煙：顏色（暖灰、木版的平塗；太暗在夜晚會像一塊塊泥巴，手機截圖看過）、往上飄的速度、壽命、變大倍率 */
  smoke: { dark: '#5e5552', light: '#958a84', up: 1.1, life: 1.0, grow: 1.4 },
  /** 金色閃光（精英、頭目、暴擊）：大小、壽命 */
  glint: { size: 0.42, life: 0.45 },
  /**
   * 打中人類（D91）：每幀最多處理幾筆命中；離地高度；
   * 直接命中 = 一朵往外炸的短火＋幾顆往外噴的火星＋一圈光；暴擊再加金色閃光；
   * 持續傷害（燒傷、燃燒地）= 身上竄一下的小火苗＋一顆火星（比直接命中安靜，看得出是「還在燒」）
   */
  hit: {
    perFrame: 12, y: 0.95,
    flare: { w: 0.62, h: 0.85, life: 0.22, grow: 0.6 }, sparks: 4, sparkSpeed: 3.2, halo: { r: 1.1, life: 0.18 },
    crit: { mult: 1.5, sparks: 7, glints: 2 },
    dot: { w: 0.38, h: 0.6, life: 0.32, sparks: 1 },
  },
  /**
   * 打倒人類（D91）：一團竄起的火＋往外飛的小火團＋火星＋煙＋地上燒焦痕（FeelFx 的墨點改成焦色）；
   * 依一般／精英／頭目分三級；精英、頭目再加金色閃光與一圈倒下的火舌
   */
  kill: {
    perFrame: 10,
    normal: { puff: 1.35, blobs: 5, sparks: 8, smoke: 1, glints: 0, ring: 0, glow: 1.8 },
    elite: { puff: 1.6, blobs: 7, sparks: 14, smoke: 3, glints: 3, ring: 8, glow: 2.6 },
    boss: { puff: 2.6, blobs: 12, sparks: 30, smoke: 6, glints: 7, ring: 14, glow: 5.0 },
    puffLife: 0.42, blobSpeed: 3.6, blobLife: 0.5,
  },
  /** 燒傷（燈油）：身上幾條火舌（繞著身體）、每秒冒幾團煙、幾顆火星 */
  burning: { tongues: 3, r: 0.32, w: 0.36, h: 0.62, smokeRate: 1.2, sparkRate: 2.5 },
  /** 鬼火雨：每顆從多高落下、落下秒數、火的大小 */
  rain: { from: 7, fall: 0.2, w: 0.55, h: 1.5 },
  /** 大招（D91）：大火圈（往外擴散的一圈火舌）、狐火之舞（身邊繞著飛的火）、護罩（一圈火牆） */
  ult: {
    nova: { life: 0.95, tongues: 34, h: 3.0, w: 1.1, sparks: 46, smoke: 12, glints: 8, column: 5.5 },
    frenzy: { wisps: 6, r: 1.5, w: 0.6, h: 0.9, rise: 2.2, sparkRate: 14 },
    shield: { tongues: 14, r: 1.7, w: 0.7, h: 1.5, sparkRate: 10 },
  },
} as const;
