/** 色票（docs/08 第 1 節）：所有顏色從這裡取，不在別處寫死。 */
export const palette = {
  night: { sky: '#1b2040', fog: '#233a4a', ground: '#4f7a55', groundDark: '#3b5e43' },
  warm: { orange: '#ffb35c', amber: '#ffd27a' },
  moon: '#cfd8ff',
  yokai: {
    chochinKozo: { body: '#f4ead8', accent: '#ffb35c' },
    kappa: { body: '#5fae8e', accent: '#f1e2a8' },
    akaOni: { body: '#d9503f', accent: '#f2c14e' },
  },
  /** 日系 Q 版角色共用（D72）：膚色、髮色、眼睛（深色＋高光）、腮紅、白衣領、深色腳 */
  chibi: { skin: '#f8dcbc', hair: '#6b4532', eye: '#1e1a24', eyeHi: '#ffffff', blush: '#f49a8a', collar: '#f4efe4', foot: '#3a3029', gold: '#e8c25a' },
  human: { earth: '#a58563', slate: '#6b7a8f', robe: '#2b2b30', robeAccent: '#d88a3a', archer: '#5f8a74', straw: '#c9a86a', wood: '#6a4b2e', monk: '#6a4a9a', kesa: '#e8c25a', hunter: '#2f6f7a', hakama: '#3a3550', net: '#c8b48a', steel: '#d6dde4', vetBanner: '#6a3fb0', vetCrest: '#f6f1e6', soheiRobe: '#4b4f63', hood: '#dfe8f6', shinobi: '#2c3350', mask: '#3a4266', onmyoji: '#dfe8f2', eboshi: '#1f1f26', ofuda: '#f6efd2', drum: '#c8402f', drumHead: '#efe2c4', band: '#d8453a' },
  rarity: { common: '#e8e6e0', rare: '#5ec4e8', epic: '#a678e0', legend: '#ffb347' },
  /** 補給品（D39）：糰子三色、飯糰、海苔、御神酒瓶與紅紋、金（鈴、小判、鼓框）、鼓身朱紅、雪女的吐息、地上光圈（回復綠、法器金、冰藍） */
  pickup: { dangoPink: '#f6a6bf', dangoWhite: '#f6f1e6', dangoGreen: '#a6d58a', stick: '#c99a64', rice: '#fbf8f0', nori: '#25382c', bottle: '#f3efe4', red: '#d8453a', gold: '#ffcf5a', drum: '#c8402f', yuki: '#bfe8ff', glowHeal: '#8ff0a0', glowTool: '#ffd27a', glowIce: '#9fdcff' },
  /** 狐面商的兩個圈（紅圈、藍圈；HUD 文字也叫紅圈／藍圈）與面具 */
  /** 道祖神（D47）：苔綠的石碑、指路牌的木頭、和招式變化卡同色的紫光 */
  dosojin: { stele: '#8f9a86', moss: '#6f8a5c', light: '#c08cff' },
  fox: { ringA: '#ff6f5a', ringB: '#5aaeff', mask: '#f6f1e6', mark: '#d8453a', robe: '#3d3f72' },
  /** 地形頂點色（docs/03 第 2 節各地形的外觀） */
  terrain: { grass: '#4f7a55', shallow: '#4c7f8f', deep: '#25506b', mud: '#5b4a3a', rock: '#7b7d82', bamboo: '#5d8a58', stone: '#9a9488', spring: '#7fb6b0' },
  /** 頭目招式的地面預告（D95）：範圍底色、填滿的進度、出手那一下 */
  bossTele: { area: '#ff3a2a', fill: '#ff5a3a', strike: '#ffd7a0' },
  /** E-2：陰陽師的紅圈、僧兵（護法，藍）與太鼓兵（鼓舞，金）的範圍 */
  enemyZone: { curse: '#ff3a2a', strike: '#ffd7a0', aura: '#6fa8ff', drum: '#ffc04a' },
  /** 精英詞綴（E-2）腳下光圈的顏色：加速、護盾、分身、召喚（順序同 AFFIX_IDS） */
  affix: ['#7dffa0', '#9fdcff', '#d79bff', '#ff9a3c'] as readonly string[],
  water: { shallow: '#7cc4d8', deep: '#1c4e78' },
  /** 小地圖（D66）：符號顏色依「功能」分組，不依屬性；每個符號再配不同的形狀（色盲也分得出來） */
  minimap: { boon: '#7ddc8a', risk: '#ff6b6b', trade: '#ffd24d', reward: '#ffb347', luck: '#c79bff', boss: '#ff4d4d', upgrade: '#6fe3ff', swap: '#9fe8ff', challenge: '#ff9a3c', player: '#ffffff', portal: '#b88cff', elite: '#ff5a5a', water: '#2f6f9c', shallow: '#5aa2c4', land: '#4f7a55', rock: '#7b7d82', mud: '#6b5646', blocked: '#2e3a34' },
  /** 技法與大招特效的色組（每隻妖怪一組：main = 主色、mid = 亮色、accent = 點綴）；通用特效不寫死火的顏色（D65） */
  fx: {
    'chochin-kozo': { main: '#ff9a3c', mid: '#ffc46b', accent: '#9fe8ff', aura: '#ffd27a', light: '#ffb35c', ink: '#d8432a', inkLight: '#f08a4a' },
    'aka-oni': { main: '#ff5a3a', mid: '#ffb347', accent: '#ffe27a', aura: '#ff7a5a', light: '#ff8a5a', ink: '#a01e2a', inkLight: '#e0503a' },
    kappa: { main: '#3fb6de', mid: '#8fdcf0', accent: '#d6f5ff', aura: '#8fdcf0', light: '#8fd4ea', ink: '#1f6f9c', inkLight: '#58b4d6' },
  } as Record<string, { main: string; mid: string; accent: string; aura: string; light: string; ink: string; inkLight: string }>,
  /** 水墨特效（D85）：墨黑、紙白；每隻妖怪的主色在 fx.<妖怪>.ink（提燈小僧 朱、河童 藍青） */
  ink: { black: '#1d1b24', paper: '#f4ecd8' },
  fire: { ghost: '#ffc46b', soul: '#9fe8ff', torch: '#ff9a3c' },
  /** 浮世繪的火（docs/30）：平塗色帶，由外而內：暗紅描邊 → 朱 → 橙 → 山吹 → 白芯 */
  flame: { outline: '#4a0d16', red: '#d8341f', orange: '#ff7f1e', yellow: '#ffc93c', core: '#fff3cf', gold: '#ffd75a' },
  /** 浮世繪的浪（docs/30 第 ⑪ 節）：由外而內：靛藍描邊 → 白浪花 → 淺藍 → 藍 → 深藍（浪頭的邊是白的、裡面是深的，北齋的畫法）；水泡與閃光用 gold 的位置放白 */
  /** 鬼氣與雷（赤鬼，docs/30 第 ⑫ 節）：描邊深紫、外圈深紅、中間紫、裡面金、白芯 */
  oniFx: { outline: '#2a0a28', red: '#b8243a', orange: '#8a3cd8', yellow: '#ffd75a', core: '#fff4d6', gold: '#ffe27a' },
  wave: { outline: '#132a5c', red: '#f2f8ff', orange: '#8fd0f0', yellow: '#3f8fd0', core: '#1d5aa6', gold: '#f2fbff' },
  ui: { text: '#f5efe2', textDim: '#b9b2a4', panel: '#1a1d2ecc', accent: '#ffb35c' },
} as const;

/** 這隻妖怪的特效色組（沒有的用提燈小僧的） */
export const fxOf = (yokaiId: string): { main: string; mid: string; accent: string; aura: string; light: string; ink: string; inkLight: string } => palette.fx[yokaiId] ?? palette.fx['chochin-kozo'];
