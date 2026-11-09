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
  behavior?: 'chase' | 'shield' | 'ranged';
  /** 盾（behavior = shield）：面向玩家的盾面；正面來的傷害乘 (1 - reduction)；盾面轉向有速度上限，玩家繞到側面／背後就破 */
  shield?: { reduction: number; /** 盾面半角（弧度） */ halfArc: number; /** 盾面轉向速度（弧度／秒） */ turn: number };
  /** 遠程（behavior = ranged）：離玩家 keep 公尺停下、range 公尺內開始瞄準；windup 秒預告後射出（方向在預告開始時鎖定）；每 cooldown 秒一發 */
  ranged?: { keep: number; range: number; windup: number; cooldown: number; shotSpeed: number; shotLife: number; shotRadius: number; /** 傷害 = 接觸傷害 × 這個倍率 */ damageMult: number };
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
  /** 退魔僧（頭目佔位，docs/04 第 3.2 節）：M1.5 用放大的村人造型；HP 是 M1.5 手感佔位（docs/04 寫 6000，M1.5 玩家火力還不夠），依試玩調 */
  /** 小頭目（召喚祭壇叫出來的；大頭目那一關同一隻 × 大頭目倍率）。HP 不吃虛擬波數，改吃「召喚時間」（D34） */
  taimasou: { id: 'taimasou', name: 'enemy.taimasou.name', points: 30, hp: 2500, speed: 1.4, contact: 20, radius: 1.0 },
};

/** 新人類第一次出場的提示顯示幾秒 */
export const ENEMY_INTRO_SECONDS = 7;

export const ENEMY_IDS = Object.keys(ENEMIES);
