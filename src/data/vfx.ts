/**
 * 技法特效的風格與數字（docs/30，Q59 照預設：浮世繪取代水墨、先火＋水，再大招）。
 * 每隻妖怪一種「屬性的樣子」：fire = 燃燒的火舌＋火星＋燒焦痕；water = 浪、漣漪、水花（第二批）；ink = D85 的水墨（還沒換的）。
 */
export type VfxStyle = 'fire' | 'water' | 'ink';

export const VFX_STYLE: Record<string, VfxStyle> = {
  'chochin-kozo': 'fire',
  kappa: 'water',
  // 赤鬼：第一版沿用火的樣子（紅、金）；鬼氣／雷的專屬樣子照 docs/30 第 ⑩ 節事件表另做（docs/35 ⑥）
  'aka-oni': 'fire',
};

/** 揮擊的樣子（SwingView，赤鬼的金棒）：停留秒數、透明度、離地高度（震波另一組，比較久、比較亮） */
export const SWING_VIEW = { life: 0.18, opacity: 0.7, shockLife: 0.32, shockOpacity: 0.85, lift: 0.12 } as const;

/**
 * 屬性特效引擎（ElementFx）共用的外觀數字：火、水各一份（FIRE_FX、WATER_FX）。
 * 形狀：hook = 尖端勾的強度（水的浪頭勾得更彎，北齋浪頭的爪）；drop = 粒子畫成圓水珠（否則是菱形火星）；
 * spark.lift 負的 = 往下掉（水珠有重力、火星往上飄）。
 */
export interface ElementLook {
  maxFlames: number;
  maxParticles: number;
  speed: number;
  hook: number;
  /** 上半部分叉的強度（火 1；水小：浪是一整塊） */
  fork: number;
  /** 邊緣雜訊的強度（火 1；水小：浪的邊比較圓順） */
  noise: number;
  /** 往上收尖的程度（火 0.75 尖；水 0.35 肩膀圓、頂端圓，不然像冰晶） */
  taper: number;
  drop: boolean;
  /** 用浪的造型（圓弧浪身＋往前捲的浪唇＋浪唇下的空洞＋扇貝邊），不用火舌的收尖造型 */
  wave: boolean;
  glow: { max: number; transient: number; color: string; ground: number; halo: number; offAtQuality: number };
  smoke: { dark: string; light: string; up: number; life: number; grow: number };
  glint: { size: number; life: number };
  spark: { size: number; up: number; spread: number; life: number; lift: number; sway: number };
}
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
  hook: 1.0,
  fork: 1.0,
  noise: 1.0,
  taper: 0.75,
  drop: false,
  wave: false,
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

/**
 * 水（docs/30 第 ⑪ 節，河童）：浪頭＝和火舌同一個造型、勾得更彎、色帶反過來（邊白、裡深）；
 * 水珠會往下掉（重力）；煙改成浪花的白沫；地上的光改成漣漪（擴散的圈）；水牢是水泡。
 */
export const WATER_FX = {
  maxFlames: 320,
  maxParticles: 420,
  speed: 1.15,
  hook: 1.8,
  fork: 0.15,
  noise: 0.45,
  taper: 0.35,
  drop: true,
  wave: true,
  glow: { max: 96, transient: 64, color: '#5cc8ff', ground: 0.24, halo: 0.16, offAtQuality: 4 },
  /** 浪花白沫（浮世繪的捲雲畫法，白與淺藍） */
  smoke: { dark: '#a9d3ec', light: '#f2f9ff', up: 0.7, life: 0.75, grow: 1.1 },
  glint: { size: 0.36, life: 0.35 },
  /** 水珠：往上噴、受重力往下掉 */
  spark: { size: 0.13, up: 3.4, spread: 2.0, life: 0.85, lift: -11, sway: 0 },
  /** 漣漪：地上擴散的圈（半徑、壽命） */
  ripple: { r: 1.3, life: 0.55 },
  /** 水盤：飛的時候甩出的水珠、光暈 */
  bullet: { dropRate: 7, halo: 0.75 },
  /** 打中：一圈往外濺的小浪（王冠）、水珠、漣漪；暴擊更大＋閃光 */
  hit: {
    perFrame: 12, y: 0.85,
    crown: { tongues: 4, w: 0.5, h: 0.42, life: 0.3, speed: 2.4 }, drops: 4, dropSpeed: 2.6,
    crit: { mult: 1.5, drops: 10, glints: 2 },
  },
  /** 打倒：沖起的水柱、四散的水珠、白沫、漣漪；精英、頭目加閃光與一圈往外倒的浪 */
  kill: {
    perFrame: 10,
    normal: { col: 1.3, drops: 10, foam: 1, glints: 0, ring: 0, ripple: 1.8 },
    elite: { col: 1.9, drops: 18, foam: 3, glints: 3, ring: 8, ripple: 2.8 },
    boss: { col: 2.8, drops: 36, foam: 6, glints: 7, ring: 14, ripple: 5 },
    colLife: 0.5,
    /** 水柱的寬、高（相對 col）；一圈往外倒的浪的寬、高 */
    colW: 1.0, colH: 1.25, ringW: 0.85, ringH: 0.75,
  },
  /** 渦盤（繞身）：每個水盤上一個小浪頭＋甩水珠 */
  orb: { w: 0.7, h: 0.85, base: 0.45, halo: 0.9, dropRate: 2 },
  /** 渦流：幾個浪頭繞著中心轉、往內捲；每隔一段時間一圈漣漪 */
  vortex: { crests: 6, w: 0.55, h: 0.75, spin: 3.2, rippleEvery: 0.35 },
  /** 滑水的水痕：每灘一個小浪＋偶爾一圈漣漪 */
  wake: { w: 0.4, h: 0.45, rippleRate: 1.5 },
  /** 水域：邊上一圈浪頭、裡面不時起漣漪 */
  domain: { crests: 10, w: 0.55, h: 0.6, rippleRate: 3 },
  /** 水牢的水泡（直徑相對判定半徑） */
  bubble: { size: 0.9, bob: 0.12 },
  /** 間歇泉：主水柱＋兩側副水柱、大量水珠、底部白沫 */
  geyser: { h: 5.5, sideH: 3.0, dropRate: 30, foamRate: 4 },
  /** 相撲：正前方一排往前倒的大浪 */
  sumo: { crests: 7, w: 0.95, h: 1.6 },
  /** 爆開（水泡破、間歇泉落地）：一圈浪、水珠、白沫、漣漪 */
  burst: { tongues: 6, h: 0.7, drops: 12, foam: 1 },
  /** 大招：大海嘯（nova，一圈大浪往外推）、雨乞（bulwark：一圈水牆＋身邊下雨） */
  ult: {
    nova: { life: 1.0, tongues: 26, h: 2.4, w: 2.3, drops: 60, foam: 12, glints: 8, column: 5.0 },
    shield: { tongues: 14, r: 1.7, w: 0.75, h: 1.5, rain: 40, rainR: 4.5, rainFrom: 6 },
  },
} as const;

/** 兩份外觀都要符合 ElementLook（型別檢查用） */
export const ELEMENT_LOOKS: Record<'fire' | 'water', ElementLook> = { fire: FIRE_FX, water: WATER_FX };
