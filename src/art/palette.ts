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
  human: { earth: '#a58563', slate: '#6b7a8f', robe: '#2b2b30', robeAccent: '#d88a3a' },
  rarity: { common: '#e8e6e0', rare: '#5ec4e8', epic: '#a678e0', legend: '#ffb347' },
  /** 補給品（D39）：糰子三色、飯糰、海苔、御神酒瓶與紅紋、金（鈴、小判、鼓框）、鼓身朱紅、雪女的吐息、地上光圈（回復綠、法器金、冰藍） */
  pickup: { dangoPink: '#f6a6bf', dangoWhite: '#f6f1e6', dangoGreen: '#a6d58a', stick: '#c99a64', rice: '#fbf8f0', nori: '#25382c', bottle: '#f3efe4', red: '#d8453a', gold: '#ffcf5a', drum: '#c8402f', yuki: '#bfe8ff', glowHeal: '#8ff0a0', glowTool: '#ffd27a', glowIce: '#9fdcff' },
  /** 狐面商的兩個圈（紅圈、藍圈；HUD 文字也叫紅圈／藍圈）與面具 */
  /** 道祖神（D47）：苔綠的石碑、指路牌的木頭、和招式變化卡同色的紫光 */
  dosojin: { stele: '#8f9a86', moss: '#6f8a5c', light: '#c08cff' },
  fox: { ringA: '#ff6f5a', ringB: '#5aaeff', mask: '#f6f1e6', mark: '#d8453a', robe: '#3d3f72' },
  /** 地形頂點色（docs/03 第 2 節各地形的外觀） */
  terrain: { grass: '#4f7a55', shallow: '#4c7f8f', deep: '#25506b', mud: '#5b4a3a', rock: '#7b7d82', bamboo: '#5d8a58', stone: '#9a9488', spring: '#7fb6b0' },
  water: { shallow: '#7cc4d8', deep: '#1c4e78' },
  /** 技法與大招特效的色組（每隻妖怪一組：main = 主色、mid = 亮色、accent = 點綴）；通用特效不寫死火的顏色（D65） */
  fx: {
    'chochin-kozo': { main: '#ff9a3c', mid: '#ffc46b', accent: '#9fe8ff', aura: '#ffd27a', light: '#ffb35c' },
    kappa: { main: '#3fb6de', mid: '#8fdcf0', accent: '#d6f5ff', aura: '#8fdcf0', light: '#8fd4ea' },
  } as Record<string, { main: string; mid: string; accent: string; aura: string; light: string }>,
  fire: { ghost: '#ffc46b', soul: '#9fe8ff', torch: '#ff9a3c' },
  ui: { text: '#f5efe2', textDim: '#b9b2a4', panel: '#1a1d2ecc', accent: '#ffb35c' },
} as const;

/** 這隻妖怪的特效色組（沒有的用提燈小僧的） */
export const fxOf = (yokaiId: string): { main: string; mid: string; accent: string; aura: string; light: string } => palette.fx[yokaiId] ?? palette.fx['chochin-kozo'];
