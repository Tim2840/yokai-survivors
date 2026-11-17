// p1 第二部分：每隻妖怪「帶滿」時用哪幾招（挑最吃 draw call 的：地上的效果、會留在場上的東西）。
// 新增妖怪時要加一列——單元測試 p1Loadout 會檢查每隻可選的妖怪都在這裡。
export const TECH_LOADOUT = {
  'chochin-kozo': ['hellfire', 'pillar', 'seed', 'ring'],
  kappa: ['vortex', 'geyser', 'domain', 'wake'],
  'aka-oni': ['onimon', 'kaminari', 'aftershock', 'rift'],
};
