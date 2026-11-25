/** 人類（docs/04 第 3.1 節）。M1 只有村人。 */
export interface EnemyDef {
  id: string;
  /** 威脅點數（波次預算的成本） */
  points: number;
  hp: number;
  speed: number;
  /** 接觸傷害 */
  contact: number;
  radius: number;
  /** 每個虛擬波的 HP 成長（沒寫就用 WAVES.hpPerWave）；D30：每種敵人可以有自己的成長曲線 */
  hpPerWave?: number;
  /** 行為種類（docs/22 第 4 節）：沒寫 = 直線走向玩家（村人）。名稱依功能，不帶任何角色專屬字 */
  behavior?: 'chase' | 'shield' | 'ranged' | 'aura' | 'drum' | 'dash' | 'caster';
  /** 盾（behavior = shield）：面向玩家的盾面；正面來的傷害乘 (1 - reduction)；盾面轉向有速度上限，玩家繞到側面／背後就破 */
  shield?: { reduction: number; /** 盾面半角（弧度） */ halfArc: number; /** 盾面轉向速度（弧度／秒） */ turn: number };
  /** 遠程（behavior = ranged）：離玩家 keep 公尺停下、range 公尺內開始瞄準；windup 秒預告後射出（方向在預告開始時鎖定）；每 cooldown 秒一發 */
  ranged?: { keep: number; range: number; windup: number; cooldown: number; shotSpeed: number; shotLife: number; shotRadius: number; /** 傷害 = 接觸傷害 × 這個倍率 */ damageMult: number };
  /** 護法（behavior = aura，E-2 僧兵）：radius 公尺內的「同伴」（不含自己、不含頭目）受到的傷害 × (1 - reduction)；先打倒它，旁邊的人就好打 */
  aura?: { radius: number; reduction: number };
  /** 鼓舞（behavior = drum，E-2 太鼓兵）：radius 公尺內的同伴移動速度 × (1 + speed)；自己停在 keep 公尺外不靠近 */
  drum?: { radius: number; speed: number; keep: number };
  /** 衝刺（behavior = dash，E-2 探子）：進到 trigger 公尺內 → 停下預告 windup 秒（地上一條線）→ 往鎖定方向以 speed 衝 seconds 秒；
   *  鎖定方向 = 朝玩家再往左或右偏 side 弧度（從側面切進來）；之後 cooldown 秒才會再衝 */
  dash?: { trigger: number; windup: number; speed: number; seconds: number; cooldown: number; side: number };
  /** 咒術（behavior = caster，E-2 陰陽師）：停在 keep 公尺外；range 公尺內 → 在玩家腳下畫一個半徑 radius 的紅圈，windup 秒後落下；
   *  傷害 = 接觸傷害 × damageMult（跳起來躲不掉，要走出圈）；每 cooldown 秒一次 */
  caster?: { keep: number; range: number; windup: number; cooldown: number; radius: number; damageMult: number; /** 施法時站定幾秒（動作） */ pose: number };
  /** 玩家第一次遇到時的簡短提示（i18n 鍵）；沒有就不提示 */
  intro?: string;
  /** 名稱（i18n 鍵；圖鑑與提示用） */
  name: string;
}

export const ENEMIES: Record<string, EnemyDef> = {
  villager: { id: 'villager', name: 'enemy.villager.name', points: 1, hp: 10, speed: 2.0, contact: 5, radius: 0.4 },
  /** 足輕（E-1）：持盾推進，盾面正面減傷；要繞到側面、背後打。HP 與點數同比（敵人預算不變）、盾讓有效 HP 更高 → 點數取 3 */
  ashigaru: {
    id: 'ashigaru',
    name: 'enemy.ashigaru.name',
    intro: 'enemy.ashigaru.intro',
    behavior: 'shield',
    points: 3,
    hp: 20,
    speed: 1.7,
    contact: 6,
    radius: 0.5,
    shield: { reduction: 0.5, halfArc: 1.2, turn: 1.8 },
  },
  /** 弓手（E-1）：停在遠處瞄準、預告後射箭；箭可以閃（預告線＋飛行時間） */
  yumi: {
    id: 'yumi',
    name: 'enemy.yumi.name',
    intro: 'enemy.yumi.intro',
    behavior: 'ranged',
    points: 2,
    hp: 7,
    speed: 1.9,
    contact: 3,
    radius: 0.35,
    ranged: { keep: 11, range: 14, windup: 0.8, cooldown: 2.8, shotSpeed: 9, shotLife: 2.2, shotRadius: 0.3, damageMult: 1.6 },
  },
  /** 僧兵（E-2，docs/22）：護法——身邊的同伴受到的傷害減少（看到它就先打它）；自己很硬但慢 */
  sohei: {
    id: 'sohei',
    name: 'enemy.sohei.name',
    intro: 'enemy.sohei.intro',
    behavior: 'aura',
    points: 4,
    hp: 30,
    speed: 1.5,
    contact: 7,
    radius: 0.5,
    aura: { radius: 5, reduction: 0.4 },
  },
  /** 探子（E-2）：快、血少；靠近後預告一下，從側面衝過來（看到地上的線就往旁邊走） */
  shinobi: {
    id: 'shinobi',
    name: 'enemy.shinobi.name',
    intro: 'enemy.shinobi.intro',
    behavior: 'dash',
    points: 2,
    hp: 8,
    speed: 2.6,
    contact: 7,
    radius: 0.35,
    dash: { trigger: 7, windup: 0.55, speed: 12, seconds: 0.55, cooldown: 3.2, side: 0.45 },
  },
  /** 陰陽師（E-2）：遠處施法，玩家腳下出現紅圈、1.2 秒後落下；走出圈就沒事 */
  onmyoji: {
    id: 'onmyoji',
    name: 'enemy.onmyoji.name',
    intro: 'enemy.onmyoji.intro',
    behavior: 'caster',
    points: 3,
    hp: 9,
    speed: 1.7,
    contact: 3,
    radius: 0.35,
    caster: { keep: 10, range: 13, windup: 1.2, cooldown: 4.2, radius: 2, damageMult: 2.2, pose: 0.6 },
  },
  /** 太鼓兵（E-2）：待在後面敲鼓，附近的人走得更快；先繞過去打它 */
  taiko: {
    id: 'taiko',
    name: 'enemy.taiko.name',
    intro: 'enemy.taiko.intro',
    behavior: 'drum',
    points: 3,
    hp: 16,
    speed: 1.8,
    contact: 4,
    radius: 0.45,
    drum: { radius: 6, speed: 0.35, keep: 8 },
  },
  /** 退魔僧（頭目佔位，docs/04 第 3.2 節）：M1.5 用放大的村人造型；HP 是 M1.5 手感佔位（docs/04 寫 6000，M1.5 玩家火力還不夠），依試玩調 */
  /** 小頭目（召喚祭壇叫出來的；大頭目那一關同一隻 × 大頭目倍率）。HP 不吃虛擬波數，改吃「召喚時間」（D34） */
  taimasou: { id: 'taimasou', name: 'enemy.taimasou.name', points: 30, hp: 3200, speed: 1.4, contact: 20, radius: 1.0 }, // D95：2500 → 3200（有招式之後頭目戰太短，sim 20～54 秒）
  /** 獵河武士（第 2 關的頭目，D95，docs/34）：投網、居合三連、半血疾走。比退魔僧快、血少一點 */
  kawagari: { id: 'kawagari', name: 'enemy.kawagari.name', points: 30, hp: 4000, speed: 1.8, contact: 18, radius: 0.95 }, // 第 2 關玩家已經強很多：2300 時 sim 19～44 秒就倒；4800 河童打太久（58～95 秒）
};

/** 新人類第一次出場的提示顯示幾秒 */
export const ENEMY_INTRO_SECONDS = 7;

export const ENEMY_IDS = Object.keys(ENEMIES);
