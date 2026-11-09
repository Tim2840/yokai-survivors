/**
 * 技法池（D48，使用者：「分三條路有點過於單調」「一局選兩次太少」「可以把技法池變大」；取代 D31 的「3 種變化、整局固定」）。
 * 設計稿 docs/15 第 8.5 節。每隻妖怪一池技法（三個系各幾種），一局最多 TECH_MAX 個。
 * D49（使用者 2026-11-06：「技法太容易取得」「不要是升級的選項，整場遊戲都機率出現在升級卡片中」「技法也有 8 級」）：
 *  - 不再有「主武器 4／7 級、過關畫面」固定跳出的技法面板；改成**每次升級選卡有 TECH_OFFER.chance 的機率，三張卡裡換進一張技法卡**
 *    （玩家 TECH_OFFER.minLevel 級起；沒拿過的與已有的下一級都可能出現，已有的權重高一點）；
 *  - 技法和道具一樣分凡／良／珍／極（稀有度跟升級卡同一套抽法），最高 TECH_LEVELS.max 級；每拿一次 = 升一級，效果 × (1 + perLevel × 累積的稀有度倍率)；
 *  - 道祖神（D47）：換掉一個技法（新的從 1 級開始）。
 * 混搭靠「掛勾」自動發生：
 *  - 出手方式（delivery：燈籠環，取代發射；extra：衛星燈、鬼火柱，額外的）；
 *  - 命中效果（onHit）：任何出手方式「打中人類」都會觸發全部命中效果（每隻人類有冷卻，避免繞身的高頻判定爆量）。
 * 同系拿兩個以上 → 該系加深（TECH_DEEPEN）。互斥（excludes）：燈籠環不再發射，所以不能和要靠飛出去的鬼火的技法一起拿。
 * 數字為起始提案，用 npm run sim -- --techs 全掃組合校準（docs/02 變更紀錄）。
 */
export const TECH_MAX = 3;
/** 道祖神換法提案用的抽選數（舊的三選一面板已拿掉） */
export const TECH_CHOICES = 3;
/**
 * 技法卡出現在升級選卡裡的規則（D49）：每次升級（不含賽錢箱、寶箱）有 chance 的機率把三張裡的一張換成技法卡；
 * 玩家 minLevel 級以前不會出現；沒拿過的技法權重 fresh、已有的（下一級）權重 owned。
 * 起始提案，sim 校準（docs/02 變更紀錄）。
 */
/**
 * D60（使用者 2026-11-09：「拜託你試到可行的方法再報告」；docs/02 變更紀錄）：一局只抽得到約 5 張技法卡、而且分散在 3 個技法上，6～8 級碰不到。
 * 改成：chance 0.2 → 0.3（技法卡更常出現）；**集中**：已有技法的權重 owned 1.3 → 2.5，再加 levelBias × (目前等級 − 1)（練得越高越常出現），沒拿過的 fresh 1 → 0.25。
 * 目標（sim 20 分鐘、貪輸出）：進化 ≥ 1 次的局 > 50%、技法 ≥ 6 級的局 30～40%、8 級 10～20%，過關率與主武器 4 級時間不變壞。
 */
/** D50（使用者：「技法的養成速度太快」）：chance 0.15 → 0.12；已有的技法下一級要玩家等級 ≥ minLevel + levelGap × 目前技法等級。D59（使用者 2026-11-09：「放寬技法升級的玩家等級門檻，讓技法 6～8 級不用等到那麼晚」）：levelGap 3 → 2（6 級要玩家 16 級、7 級 18、8 級 20；原本 19／22／25） */
export const TECH_OFFER = { chance: 0.3, minLevel: 4, fresh: 0.25, owned: 2.5, levelGap: 2, levelBias: 3 } as const;

export const TECH_FAMILIES = ['split', 'orbit', 'burn'] as const;
export type TechFamily = (typeof TECH_FAMILIES)[number];

/** delivery：取代原本的發射；extra：照常發射，另外多一種出手方式；onHit：打中人類時多發生的事（出手方式打中也會觸發）；passive：自己運作，不吃也不給掛勾（歸巢、護身火） */
export type TechKind = 'delivery' | 'extra' | 'onHit' | 'passive';
export type TechMechanic = 'kitsunebi' | 'bounce' | 'homing' | 'rain' | 'ring' | 'ward' | 'satellite' | 'lamp' | 'hellfire' | 'seed' | 'pillar' | 'oil';

export interface TechDef {
  id: string;
  /** 屬於哪把主武器（目前只有鬼火） */
  weapon: string;
  family: TechFamily;
  kind: TechKind;
  /** 適合搭配的道具（選卡畫面提示用） */
  likes: readonly string[];
  /** 不能同時拿的技法 */
  excludes: readonly string[];
  /** 狐火分裂：命中時分裂出幾顆小火、小火傷害比例、找下一個目標的範圍（公尺）；atMax：滿級多分裂；
   *  shardBonus：有碎火時每次多 1 片；碎片打中後再分裂 reSplit 片（D43：狐火分裂放大碎火） */
  split?: { children: number; damage: number; range: number; atMaxChildren: number; shardBonus: number; reSplit: number };
  /** 彈跳：打中後跳到範圍內下一隻（不回頭），最多 jumps 次，每次傷害 × damage；atMax：多跳一次 */
  bounce?: { range: number; jumps: number; damage: number; atMaxJumps: number };
  /** 鬼火雨：命中時在命中點 range 公尺內隨機落下 count 顆小火（落點隨機、不追人；每顆在半徑 radius 內傷害 × damage，畫面停留 life 秒）；atMax：多一顆 */
  rain?: { count: number; atMaxCount: number; range: number; radius: number; damage: number; life: number };
  /** 歸巢：鬼火飛到盡頭還沒用完時折返，飛回你身邊（回程也會打人，多穿透 returnPierce 隻）；所有鬼火飛行速度 × speedMult；atMax：穿透 +1 */
  homing?: { returnPierce: number; speedMult: number; atMaxPierce: number };
  /** 燈籠環：不再發射，鬼火繞身（數量 = 鬼火數量 + baseOrbs）；半徑（× 範圍）、角速度（弧度/秒）、命中半徑、
   *  每隔幾秒判定一次（÷ 攻速、× 冷卻）、傷害比例、擊退；atMax：多一顆、半徑倍率；
   *  innerDamage／innerKnockback：環內護身（D46）：鑽進環內（離身體 < 半徑 − 命中半徑）的人類每次判定受「傷害比例 × innerDamage」並被推出去 */
  orbit?: { radius: number; spin: number; hitRadius: number; tick: number; damage: number; knockback: number; baseOrbs: number; atMaxOrbs: number; atMaxRadius: number; innerDamage: number; innerKnockback: number };
  /** 護身火：每 chargeSeconds 秒充一層；被碰到時擋下這次傷害並炸開（半徑、傷害比例）；atMax：充能秒數改成 atMaxChargeSeconds */
  ward?: { chargeSeconds: number; atMaxChargeSeconds: number; burstRadius: number; burstDamage: number };
  /** 衛星燈：照常發射，另有 count 盞大燈籠在半徑 radius（× 範圍）慢慢繞；其餘同燈籠環；atMax：多一盞 */
  satellite?: { count: number; atMaxCount: number; radius: number; spin: number; hitRadius: number; tick: number; damage: number; knockback: number };
  /** 開路燈：count 盞燈籠跑在移動方向前方 ahead 公尺處（不動時留在身前；兩盞時在前方兩側 side 公尺），每 tick 秒判定、命中半徑、傷害比例、擊退；atMax：兩盞 */
  lamp?: { count: number; atMaxCount: number; ahead: number; side: number; hitRadius: number; tick: number; damage: number; knockback: number };
  /** 燈油：命中的人身上沾火，燒 seconds 秒（每 tick 秒燒一次，傷害 = 命中傷害 × damage）；燒死時火傳給 spreadRange 公尺內最多 spread 個人；atMax：燒 atMaxSeconds 秒、傳 atMaxSpread 個 */
  oil?: { seconds: number; atMaxSeconds: number; tick: number; damage: number; spreadRange: number; spread: number; atMaxSpread: number; max: number };
  /** 業火：命中處留下燃燒地（半徑 × 範圍、秒數、每隔幾秒燒一次、每次傷害比例），鬼火本身傷害與冷卻倍率；atMax：燃燒地大小倍率 */
  burn?: { radius: number; seconds: number; tick: number; damage: number; shotDamage: number; interval: number; atMaxScale: number; maxZones: number };
  /** 火種：被鬼火打倒的人留下火種，delay 秒後爆炸（半徑、傷害比例）；最多 max 個；atMax：半徑 atMaxRadius */
  seed?: { delay: number; radius: number; damage: number; atMaxRadius: number; max: number };
  /** 鬼火柱：每 interval 秒（÷ 攻速）在 range 公尺內人最多的地方噴火柱（半徑、傷害比例、畫面停留秒數）；atMax：一次 atMaxCount 根 */
  pillar?: { interval: number; range: number; radius: number; damage: number; atMaxCount: number; life: number; max: number };
}

export const TECHS: readonly TechDef[] = [
  // ── 分裂系 ──
  {
    id: 'kitsunebi',
    weapon: 'ghostfire',
    family: 'split',
    kind: 'onHit',
    likes: ['volley', 'splash', 'atkSpeed', 'power'],
    excludes: [],
    split: { children: 2, damage: 0.55, range: 7, atMaxChildren: 3, shardBonus: 1, reSplit: 1 },
    // 併進來的「鬼火雨」（D57）：進化形態 Lv6 解鎖，命中處再落下幾顆小火
    rain: { count: 2, atMaxCount: 3, range: 3, radius: 1.2, damage: 0.5, life: 0.3 },
  },
  {
    id: 'bounce',
    weapon: 'ghostfire',
    family: 'split',
    kind: 'onHit',
    likes: ['volley', 'power', 'atkSpeed'],
    excludes: ['ring'],
    bounce: { range: 6, jumps: 2, damage: 0.7, atMaxJumps: 3 },
  },
  {
    id: 'homing',
    weapon: 'ghostfire',
    family: 'split',
    kind: 'passive',
    likes: ['pierce', 'volley', 'atkSpeed'],
    excludes: ['ring'],
    homing: { returnPierce: 2, speedMult: 1.15, atMaxPierce: 1 },
  },
  // ── 環繞系 ──
  {
    id: 'ring',
    weapon: 'ghostfire',
    family: 'orbit',
    kind: 'delivery',
    likes: ['area', 'hp', 'armor', 'atkSpeed'],
    excludes: ['bounce', 'homing'],
    orbit: { radius: 3.0, spin: 2.6, hitRadius: 1.0, tick: 0.25, damage: 1.3, knockback: 3, baseOrbs: 1, atMaxOrbs: 1, atMaxRadius: 1.25, innerDamage: 0.5, innerKnockback: 6 },
    // 併進來的「衛星燈」（D57）：進化形態 Lv6 解鎖，外圈多一盞大燈籠慢慢繞
    satellite: { count: 1, atMaxCount: 2, radius: 5.5, spin: 1.2, hitRadius: 1.3, tick: 0.4, damage: 1.5, knockback: 3 },
  },
  {
    id: 'ward',
    weapon: 'ghostfire',
    family: 'orbit',
    kind: 'passive',
    likes: ['armor', 'hp', 'regen', 'area'],
    excludes: [],
    ward: { chargeSeconds: 6, atMaxChargeSeconds: 4, burstRadius: 2.5, burstDamage: 2 },
  },
  {
    id: 'lamp',
    weapon: 'ghostfire',
    family: 'orbit',
    kind: 'extra',
    likes: ['speed', 'area', 'atkSpeed'],
    excludes: [],
    lamp: { count: 1, atMaxCount: 2, ahead: 4, side: 1.6, hitRadius: 1.3, tick: 0.3, damage: 1.2, knockback: 4 },
  },
  // ── 燃燒系 ──
  {
    id: 'hellfire',
    weapon: 'ghostfire',
    family: 'burn',
    kind: 'onHit',
    likes: ['area', 'power', 'atkSpeed'],
    excludes: [],
    burn: { radius: 1.6, seconds: 2.5, tick: 0.5, damage: 0.35, shotDamage: 1.2, interval: 1.25, atMaxScale: 1.3, maxZones: 24 },
    // 併進來的「燈油」（D57）：進化形態 Lv6 解鎖，被打中的人身上沾火，燒死時火傳給附近的人
    oil: { seconds: 3, atMaxSeconds: 4, tick: 0.5, damage: 0.25, spreadRange: 3, spread: 2, atMaxSpread: 3, max: 24 },
  },
  {
    id: 'seed',
    weapon: 'ghostfire',
    family: 'burn',
    kind: 'onHit',
    likes: ['power', 'area', 'volley'],
    excludes: [],
    seed: { delay: 1, radius: 2, damage: 0.6, atMaxRadius: 2.6, max: 12 },
  },
  {
    id: 'pillar',
    weapon: 'ghostfire',
    family: 'burn',
    kind: 'extra',
    likes: ['power', 'area', 'atkSpeed'],
    excludes: [],
    pillar: { interval: 4, range: 10, radius: 1.8, damage: 2.5, atMaxCount: 2, life: 0.5, max: 4 },
  },
];

export const techsFor = (weapon: string): TechDef[] => TECHS.filter((t) => t.weapon === weapon);
export const techById = (id: string): TechDef => {
  const t = TECHS.find((x) => x.id === id);
  if (!t) throw new Error(`沒有這個技法：${id}`);
  return t;
};

/** 同系拿兩個以上：每多一個，該系加深一次（效果各自讀 deep） */
export const TECH_DEEPEN = {
  /** 分裂系：狐火分裂多分 1 顆、彈跳多跳 1 次、歸巢回程多穿透 1 隻 */
  split: { targets: 1, homingPierce: 1 },
  /** 環繞系：繞身的燈籠環與衛星燈半徑 ×、燈籠環多 1 顆、護身火充能時間 × */
  orbit: { radius: 1.15, orbs: 1, wardCharge: 0.8 },
  /** 燃燒系：燃燒地、火種、鬼火柱的傷害 ×（每多一個再乘一次） */
  burn: { damage: 1.25 },
} as const;

/** 技法等級（D49）：最高 max 級；每拿一次升一級，傷害與持續效果 × (1 + perLevel × (累積的稀有度倍率 − 1))（凡 1.0／良 1.2／珍 1.5／極 2.0，第一次拿的也算） */
export const TECH_LEVELS = { max: 8, perLevel: 0.12 } as const;

/** 其他規則 */
export const TECH_RULES = {
  /** 繞身／衛星／火柱的命中，同一隻人類兩次觸發「命中效果」至少隔幾秒（鬼火直接命中沒有這個限制） */
  hitFxCooldown: 0.5,
  /** 道祖神換技法時，提案卡的張數（含最後一張「維持現狀」） */
  swapProposals: 2,
} as const;

/** 技法卡在選卡面板裡的 id 前綴（和法具的 id 分開） */
export const TECH_CARD_PREFIX = 'tech:';
/** 升級卡裡的技法卡：tech:<id>（沒有 = 學會、已有 = 升一級）；道祖神換技法：tech-swap:<舊>><新>；道祖神維持現狀：tech-keep */
export const TECH_SWAP_PREFIX = 'tech-swap:';
export const TECH_KEEP = 'tech-keep';
export const isTechCard = (id: string): boolean => id.startsWith(TECH_CARD_PREFIX) || id.startsWith(TECH_SWAP_PREFIX) || id === TECH_KEEP;

/** 兩個技法放在一起會怎樣（選卡提示用）：命中效果 × 出手方式 → 出手方式打中人類也會觸發命中效果；同系 → 加深 */
export type TechMix = { kind: 'hit'; via: string; hit: string } | { kind: 'family'; family: TechFamily };
export function techMix(candidate: string, owned: readonly string[]): TechMix | null {
  const c = techById(candidate);
  let family: TechMix | null = null;
  for (const id of owned) {
    if (id === candidate) continue;
    const o = techById(id);
    if (c.kind === 'onHit' && (o.kind === 'delivery' || o.kind === 'extra')) return { kind: 'hit', via: o.id, hit: c.id };
    if (o.kind === 'onHit' && (c.kind === 'delivery' || c.kind === 'extra')) return { kind: 'hit', via: c.id, hit: o.id };
    if (!family && o.family === c.family) family = { kind: 'family', family: c.family };
  }
  return family;
}

/** 主武器（鬼火）也是一個技法（D53）：它的等級就是主武器等級；適合的法具只是選卡提示（使用者 2026-11-06：「不要再有適合加成」，適合沒有加成） */
export const BASE_TECH_ID = 'ghostfire';
export const BASE_TECH_LIKES: readonly string[] = ['power', 'atkSpeed', 'volley', 'pierce', 'splash'];

/**
 * 技法進化（D53，使用者 2026-11-06：「技法進化要做，一開始的鬼火也要是一個技法，納入招式進化的名單，融合時兩招都要等級 8」）：
 * 配方（D56，使用者 2026-11-09：「先照你建議吧」，docs/18）= **主武器鬼火 + 一個技法**，兩個都練到 EVO.minLevel（5）級；每個技法各有一個進化（12 個）。湊齊後到**合魂祠**（地圖上出現）或**開寶箱**選進化卡。
 * 進化後兩個技法併成一個（技法欄位少佔一格；有鬼火的不省格）、效果倍率 × EVO.power，並套用 `set`（把兩個技法的參數換成更強的值，
 * 只寫要換的欄位）；有鬼火的另外給主武器 `weapon` 加成。一個技法一局只能進化一次。
 * 名稱先用暫名（使用者要保留「九尾」給之後的角色）。
 */
/** minLevel：兩個材料都要練到幾級（D54，使用者 2026-11-08：「進化材料降到 5 級」；原本 8 級，sim 20 分鐘幾乎碰不到） */
export const EVO = { power: 1.25, minLevel: 5 } as const;

type Block = Record<string, number>;
/** 技法 id → 區塊名 → 欄位 → 數值（換成新值，或加上去，看用在哪） */
export type EvoPatch = Readonly<Record<string, Readonly<Record<string, Block>>>>;
export interface EvoDef {
  id: string;
  /** 兩個材料：鬼火 + 一個技法（D56） */
  from: readonly [string, string];
  /** 進化的那一刻：把這幾個技法的參數換掉（直接取代） */
  set: EvoPatch;
  /** 有鬼火的進化：主武器傷害倍率、穿透、發射數（加在主武器上） */
  weapon?: { damage: number; pierce: number; volley: number };
  /**
   * 進化形態的升級（D57，使用者 2026-11-09：「升級後的融合招式我也想要有可以升級的設計」「技法 5 級就能合併，剩下 3 級是做甚麼的？」）：
   * 技法在進化前最多 5 級（EVO.minLevel）；進化後才能繼續升到 6、7、8 級，每一級各有一組強化（**加上去**，累積）。
   * up[0] = 6 級、up[1] = 7 級、up[2] = 8 級。
   */
  up: readonly [EvoPatch, EvoPatch, EvoPatch];
  /** 進化形態到這個等級，併進來的舊招式（鬼火雨／衛星燈／燈油）開始作用 */
  unlock?: { mech: TechMechanic; level: number };
}

/** 進化形態的等級：進化前最多 EVO.minLevel 級，進化後最多 TECH_LEVELS.max 級；up 的第 k 組在 FORM_LEVEL0 + k 級生效 */
export const FORM_LEVEL0 = EVO.minLevel + 1;

export const EVOS: readonly EvoDef[] = [
  {
    id: 'evoSplit',
    from: ['ghostfire', 'kitsunebi'],
    set: { kitsunebi: { split: { children: 4, atMaxChildren: 5, damage: 0.75, range: 9, reSplit: 2 } } },
    weapon: { damage: 0.15, pierce: 1, volley: 0 },
    unlock: { mech: 'rain', level: 6 },
    up: [{}, { kitsunebi: { split: { children: 1, atMaxChildren: 1 } } }, { kitsunebi: { split: { reSplit: 1 }, rain: { count: 1, atMaxCount: 1 } } }],
  },
  {
    id: 'evoSoul',
    from: ['ghostfire', 'seed'],
    set: { seed: { seed: { delay: 0.6, radius: 2.8, atMaxRadius: 3.4, damage: 1.0, max: 20 } } },
    weapon: { damage: 0.15, pierce: 0, volley: 0.5 },
    up: [{ seed: { seed: { radius: 0.4, atMaxRadius: 0.4, damage: 0.2 } } }, { seed: { seed: { delay: -0.15 } } }, { seed: { seed: { radius: 0.5, atMaxRadius: 0.5, damage: 0.3 } } }],
  },
  {
    id: 'evoBounce',
    from: ['ghostfire', 'bounce'],
    set: { bounce: { bounce: { range: 8, jumps: 5, atMaxJumps: 6, damage: 0.85 } } },
    weapon: { damage: 0.1, pierce: 0, volley: 0 },
    up: [{ bounce: { bounce: { jumps: 1, atMaxJumps: 1 } } }, { bounce: { bounce: { range: 1.5 } } }, { bounce: { bounce: { jumps: 1, atMaxJumps: 1, damage: 0.1 } } }],
  },
  {
    id: 'evoHoming',
    from: ['ghostfire', 'homing'],
    set: { homing: { homing: { returnPierce: 4, speedMult: 1.3, atMaxPierce: 2 } } },
    weapon: { damage: 0.1, pierce: 1, volley: 0 },
    up: [{ homing: { homing: { returnPierce: 1 } } }, { homing: { homing: { speedMult: 0.15 } } }, { homing: { homing: { returnPierce: 2 } } }],
  },
  {
    id: 'evoPillar',
    from: ['ghostfire', 'pillar'],
    set: { pillar: { pillar: { interval: 2.5, range: 12, radius: 2.2, damage: 3.5, atMaxCount: 3, life: 0.5, max: 6 } } },
    weapon: { damage: 0.1, pierce: 0, volley: 0 },
    up: [{ pillar: { pillar: { radius: 0.4 } } }, { pillar: { pillar: { interval: -0.4 } } }, { pillar: { pillar: { damage: 1.0, radius: 0.4 } } }],
  },
  {
    id: 'evoRing',
    from: ['ghostfire', 'ring'],
    set: { ring: { orbit: { baseOrbs: 3, atMaxOrbs: 2, radius: 3.6, damage: 1.7, innerDamage: 0.8 } } },
    weapon: { damage: 0.1, pierce: 0, volley: 0 },
    unlock: { mech: 'satellite', level: 6 },
    up: [{}, { ring: { orbit: { baseOrbs: 1 } } }, { ring: { satellite: { count: 1, atMaxCount: 1 }, orbit: { damage: 0.3 } } }],
  },
  {
    id: 'evoWard',
    from: ['ghostfire', 'ward'],
    set: { ward: { ward: { chargeSeconds: 3, atMaxChargeSeconds: 2, burstRadius: 3.8, burstDamage: 3 } } },
    weapon: { damage: 0.1, pierce: 0, volley: 0 },
    up: [{ ward: { ward: { burstRadius: 0.6 } } }, { ward: { ward: { chargeSeconds: -0.5, atMaxChargeSeconds: -0.3 } } }, { ward: { ward: { burstDamage: 1, burstRadius: 0.6 } } }],
  },
  {
    id: 'evoLamp',
    from: ['ghostfire', 'lamp'],
    set: { lamp: { lamp: { count: 2, atMaxCount: 3, damage: 1.7 } } },
    weapon: { damage: 0.1, pierce: 0, volley: 0 },
    up: [{ lamp: { lamp: { hitRadius: 0.3, damage: 0.4 } } }, { lamp: { lamp: { ahead: 1 } } }, { lamp: { lamp: { damage: 0.6, hitRadius: 0.3 } } }],
  },
  {
    id: 'evoHellfire',
    from: ['ghostfire', 'hellfire'],
    set: { hellfire: { burn: { radius: 2.2, seconds: 4, damage: 0.5, atMaxScale: 1.4 } } },
    weapon: { damage: 0.1, pierce: 0, volley: 0 },
    unlock: { mech: 'oil', level: 6 },
    up: [{}, { hellfire: { burn: { radius: 0.4 } } }, { hellfire: { burn: { seconds: 1, damage: 0.15 }, oil: { spread: 1, atMaxSpread: 1 } } }],
  },
];

export const evoById = (id: string): EvoDef => {
  const e = EVOS.find((x) => x.id === id);
  if (!e) throw new Error(`沒有這個進化：${id}`);
  return e;
};

/** 進化卡在選卡面板裡的 id：evo:<進化 id> */
export const EVO_CARD_PREFIX = 'evo:';
export const isEvoCard = (id: string): boolean => id.startsWith(EVO_CARD_PREFIX);
export const evoOfCard = (id: string): EvoDef => evoById(id.slice(EVO_CARD_PREFIX.length));
