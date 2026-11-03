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
  human: { earth: '#8a6f55', slate: '#6b7a8f', robe: '#2b2b30', robeAccent: '#d88a3a' },
  rarity: { common: '#e8e6e0', rare: '#5ec4e8', epic: '#a678e0', legend: '#ffb347' },
  ui: { text: '#f5efe2', textDim: '#b9b2a4', panel: '#1a1d2ecc', accent: '#ffb35c' },
} as const;
