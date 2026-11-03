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
  /** 地形頂點色（docs/03 第 2 節各地形的外觀） */
  terrain: { grass: '#4f7a55', shallow: '#4c7f8f', deep: '#25506b', mud: '#5b4a3a', rock: '#7b7d82', bamboo: '#5d8a58', stone: '#9a9488', spring: '#7fb6b0' },
  water: { shallow: '#7cc4d8', deep: '#1c4e78' },
  fire: { ghost: '#ffc46b', soul: '#9fe8ff', torch: '#ff9a3c' },
  ui: { text: '#f5efe2', textDim: '#b9b2a4', panel: '#1a1d2ecc', accent: '#ffb35c' },
} as const;
