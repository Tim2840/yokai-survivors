import { bus as defaultBus, type EventBus } from '../core/bus';
import { COMBAT } from '../data/combat';
import { MOVE } from '../data/movement';
import { PLAYABLE_YOKAI, YOKAI, type YokaiDef } from '../data/yokai';
import { rollAffixes } from '../data/affixes';
import { mechOf, techById } from '../data/techniques';
import { CARD_CHOICES, PROGRESSION, RARITIES_UNLOCKED_M1, xpNeed } from '../data/progression';
import { DOSOJIN, FUSE, SUMMIT } from '../data/elements';
import { itemPoolFor, ITEM_RARITY_MULT, ITEM_SLOTS, SHARDS, TRADE_ITEMS, WEAPON_LEVELS, itemDown, itemValue, itemById, scaleWeaponStep } from '../data/items';
import { EVO_CARD_PREFIX, TECH_CARD_PREFIX, TECH_KEEP, TECH_OFFER, TECH_SWAP_PREFIX, evoOfCard, isEvoCard, isTechCard } from '../data/techniques';
import { Techniques } from './techniques';
import { RARITY_MULT } from '../data/rarity';
import { STAGE, stagesForMap, bossHpMult, isBigBossStage } from '../data/stage';
import { FEEL } from '../data/feel';
import { DIFFICULTY } from '../data/difficulty';
import { WAVES } from '../data/waves';
import { tuning } from '../data/tuning';
import type { MapDef } from '../data/maps/prototype';
import { makeHighlands } from '../data/maps/highlands';
import { Rng } from '../lib/random';
import { TerrainMap, WALL_TAN } from '../world/terrainMap';
import { PlayerReach } from '../systems/reach';
import type { ElementResult } from '../systems/elementResult';
import { Pickups } from '../systems/pickups';
import { PICKUPS, PICKUP_KINDS, PICKUP_RULES, type PickupKind } from '../data/pickups';
import { FlowField } from '../systems/flowField';
import { Enemies, kindIndex } from '../systems/enemies';
import { EnemyShots } from '../systems/enemyShots';
import { ENEMY_IDS } from '../data/enemies';
import { Projectiles } from '../systems/projectiles';
import { Orbs } from '../systems/orbs';
import { HitFeed } from '../systems/hitFeed';
import { Stats, armorMult } from '../systems/stats';
import { CardDealer, cardById, slotsUsed, type CardOffer } from '../systems/cards';
import { StageDirector } from '../systems/stageDirector';
import { Elements, type ElementCarry } from '../systems/elements';
import { computeMerit } from '../systems/merit';
import { ULT, ultById, ultMods, defaultUltsOf, ULT_SLOTS, type UltEffect, type UltMods } from '../data/ultimates';
import { ALTAR_CURSE_IDS, type CurseId } from '../data/altar';

export interface RunOptions {
  seed: number;
  yokaiId?: string;
  night?: number;
  mobile?: boolean;
  /** 每一關用哪張地圖（預設：大起伏的 highlands，種子由局的種子與關卡序號衍生） */
  mapFor?: (stageIndex: number, runSeed: number) => MapDef;
  bus?: EventBus;
  /** 這一局打的是第幾張地圖（從 1 起，D26 章節制；預設 1） */
  mapNumber?: number;
  /** 之前通關過嗎（功德 +200） */
  clearedBefore?: boolean;
  /** 局外的功德加成（M3） */
  meritStat?: number;
  /** 這一局裝配的大招 id（D52；沒給 = 這隻妖怪一開始就有的那一招）與各招的局外升級等級 */
  ults?: string[];
  ultLevels?: Record<string, number>;
}

export type RunPhase = 'combat' | 'intermission' | 'ended';

/** 從一個種子衍生各子系統的種子（docs/06 第 11 節）：同種子同輸入 → 同結果 */
export function subSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * 一局的模擬（純邏輯，不碰 Three.js；渲染層只讀這裡的陣列與數值）。
 * 關卡（D22）：一關是連續計時，敵人持續湧出；頭目倒下後傳送門開，走進去過關。
 * 玩家有 3D 位置與跳躍（D24）；移動輸入是「世界座標」的向量（鏡頭相對的換算在外面）。
 * 升級選卡：升級當下 awaitingPick = true，step() 直接返回（模擬凍結），直到選完（D15）。
 * 要素結果卡（D36）：要素集滿後 result 不是 null，同樣凍結，直到 dismissResult()；同時有待選的升級時，介面先顯示結果卡。
 */
export class Run {
  readonly seed: number;
  readonly night: number;
  readonly yokai: YokaiDef;
  // 每一關重建
  map!: TerrainMap;
  flow!: FlowField;
  enemies!: Enemies;
  director!: StageDirector;
  elements!: Elements;
  /** 詛咒祭壇留下的詛咒（整局有效）：來源 key → 效果；totals 是各項的相對增加合計 */
  private readonly curseSources = new Map<string, { id: CurseId; v: number }>();
  readonly curse: Record<CurseId, number> = { enemyHp: 0, enemySpeed: 0, enemyDamage: 0, spawnRate: 0 };
  private readonly elementCarry: ElementCarry = { serial: 0, downKeys: [] };
  readonly projectiles: Projectiles;
  /** 敵方投射物（弓手的箭，E-1） */
  readonly shots = new EnemyShots();
  readonly orbs: Orbs;
  readonly feed = new HitFeed();
  readonly stats: Stats;
  readonly dealer: CardDealer;
  private readonly rngCombat: Rng;
  private readonly rngCards: Rng;
  private readonly rngSpawn: Rng;
  private readonly rngElements: Rng;
  private readonly rngPickups: Rng;
  /** 補給品（D39） */
  readonly pickups: Pickups;
  /** 雪女的吐息：人類凍住到這個時間（clock）；最近一次撿到的補給品（HUD 提示）、最近一次雷鼓（畫面效果） */
  freezeUntil = 0;
  lastPickup: { kind: PickupKind; at: number; v: number } | null = null;
  lastThunder: { at: number; x: number; z: number; r: number } | null = null;
  private readonly bus: EventBus;
  private readonly opts: RunOptions;
  private readonly maxEnemies: number;

  phase: RunPhase = 'combat';
  /** 目前這一關的 0 起序號 */
  stageIndex = -1;
  /** 這一局打第幾張地圖、共幾關（一般 2、大關 3，D26） */
  readonly mapNumber: number;
  readonly stageCount: number;
  /** 這一關已經過的秒數 */
  time = 0;
  // 玩家（py = 腳底高度）
  px = 0;
  py = 0;
  pz = 0;
  vy = 0;
  grounded = true;
  private coyote = 0;
  private jumpBuf = 0;
  private hvx = 0;
  private hvz = 0;
  /** 面向（弧度，atan2(x, z)） */
  facing = 0;
  /** 本步的水平速度（公尺/秒，給動畫用） */
  moveSpeed = 0;
  hp: number;
  invul = 0;
  god = false;
  dead = false;
  private deathTimer = 0;
  // 輸入（世界座標的移動向量；-1..1）
  private mx = 0;
  private mz = 0;
  private jumpReq = false;
  // 成長
  level = 0;
  xp = 0;
  kills = 0;
  pendingPicks = 0;
  offer: CardOffer[] | null = null;
  readonly picked: CardOffer[] = [];
  // 頭目與傳送門
  bossesDefeated = 0;
  bossDefeated = false;
  portal = { active: false, x: 0, y: 0, z: 0 };
  /** 武器卡累積：多發射的顆數、濺射半徑（公尺）。一開始都是 0（領頭只有一顆鬼火、沒有濺射） */
  volleyBonus = 0;
  splashBonus = 0;
  /** 碎火（D43）：平均每次命中多飛出幾片 */
  shardBonus = 0;
  pierceBonus = 0;
  /** 主武器升級帶來的：基礎傷害加值、冷卻倍率（< 1 = 變快） */
  weaponDamageBonus = 0;
  cooldownMult = 1;
  /** 技法（D48）：這一局拿到的技法與它們的狀態（docs/15 第 8.5 節） */
  readonly tech: Techniques;
  /** 現在的技法面板：swap = 道祖神換一個（D49 起技法卡混在升級選卡裡，只有道祖神會開專用的技法面板） */
  techMode: 'new' | 'swap' = 'new';
  /** 開發與測試：下一次升級選卡一定換進一張技法卡（不看機率與等級） */
  private forceTechCard = false;
  /** 道祖神（D47）：這一關什麼時候放（clock；Infinity = 還沒有技法或這一關放過了） */
  private dosojinAt = Infinity;
  /** 最近一次在道祖神換了技法（HUD 提示用） */
  lastTechChange: { from: string; to: string; at: number } | null = null;
  private resumeKind: 'levelup' | 'offering' | 'chest' | 'fusion' = 'levelup';
  /** 主武器的道具 id（鬼火） */
  get weaponItemId(): string {
    return this.yokai.weapon.id;
  }
  /** 主武器目前幾級 */
  get weaponLevel(): number {
    return this.cardCounts.get(this.weaponItemId) ?? 1;
  }
  /** 拿過的卡 id */
  readonly ownedCards = new Set<string>();
  /** 神籤的功德獎勵累計、最近一次神籤結果（HUD 提示用） */
  bonusMerit = 0;
  lastOmikuji: { id: string; at: number } | null = null;
  /** 目前這個選卡面板的來源：升級／賽錢箱／寶箱；賽錢箱、寶箱的剩餘選卡次數與稀有度 */
  offerKind: 'levelup' | 'offering' | 'chest' | 'tech' | 'fusion' = 'levelup';
  /** 有可以進化、還沒進化的技法組合（D53；事件時更新，每步不重算）；從什麼時候開始有（合魂祠延遲出現用） */
  private hasEvolvable = false;
  private evolvableSince = 0;
  /** 已經提示過「可以進化」的配方、最近一次提示與最近一次進化（HUD 提示用） */
  private readonly evolveNotified: string[] = [];
  lastReady: { id: string; at: number } | null = null;
  lastEvolve: { id: string; at: number } | null = null;
  private bonusLeft = 0;
  private bonusRarity: import('../data/rarity').Rarity = 'rare';
  /** 法具等級（id → 等級）、這一局裝配的大招（D52，最多 ULT_SLOTS 招）、大招量表（0～ULT.max）、最近一次發動（給外觀用） */
  readonly cardCounts = new Map<string, number>();
  readonly ults: string[] = [];
  /** 裝配的大招各自的局外升級等級 → 累計的攻擊力、範圍、冷卻、充能（開局算好，每步不重算） */
  readonly ultLevels = new Map<string, number>();
  private ultModsNow: UltMods = ultMods(0);
  ultCharge = 0;
  /** 大招冷卻到這個時間（clock）為止：期間量表不充能 */
  ultCoolUntil = 0;
  get ultCooling(): boolean {
    return this.clock < this.ultCoolUntil;
  }
  /** 冷卻還剩幾秒（0 = 沒在冷卻） */
  get ultCooldownLeft(): number {
    return Math.max(0, this.ultCoolUntil - this.clock);
  }
  /** 這一關的召喚祭壇放了沒（D34） */
  private summonPlaced = false;
  lastCast: { ids: string[]; at: number; x: number; z: number; dx: number; dz: number } | null = null;
  /** 狂亂（暫時強化）與護罩結束的時間（clock）、狂亂額外鬼火 */
  private frenzyUntil = 0;
  private frenzyVolley = 0;
  shieldUntil = 0;
  private frenzyTotal = 1;
  private frenzyLabel = '';
  private shieldTotal = 1;
  private shieldLabel = '';
  private freezeTotal = 1;
  /**
   * 現在作用中的限時效果（D78：HUD 的倒數標籤）：collectBuffs() 重填同一個陣列（不配置），回傳個數。
   * label = i18n key；left／total 秒；bad = 對玩家不利（紅色）。
   */
  readonly buffs: { label: string; left: number; total: number; bad: boolean }[] = Array.from({ length: 8 }, () => ({ label: '', left: 0, total: 1, bad: false }));
  buffCount = 0;
  private readonly pushBuff = (label: string, left: number, total: number, bad: boolean): void => {
    if (this.buffCount >= this.buffs.length || left <= 0) return;
    const b = this.buffs[this.buffCount++];
    b.label = label;
    b.left = left;
    b.total = Math.max(total, 0.001);
    b.bad = bad;
  };
  collectBuffs(): number {
    this.buffCount = 0;
    if (this.frenzyUntil > this.clock) this.pushBuff(this.frenzyLabel, this.frenzyUntil - this.clock, this.frenzyTotal, false);
    if (this.shieldUntil > this.clock) this.pushBuff(this.shieldLabel, this.shieldUntil - this.clock, this.shieldTotal, false);
    if (this.freezeUntil > this.clock) this.pushBuff('pickup.yukiBreath', this.freezeUntil - this.clock, this.freezeTotal, false);
    this.elements.visitTimed(this.pushBuff);
    return this.buffCount;
  }
  private ultNear = new Int32Array(0);
  /** 這一局累計的模擬秒數（跨關） */
  clock = 0;
  private fireCd = 0;
  private readonly near = new Int32Array(COMBAT.queryMax);
  /** 鬼火瞄準用：這一發每顆的目標（最多 COMBAT.maxVolley 顆） */
  private readonly aim = new Int32Array(COMBAT.maxVolley);
  private readonly splashNear = new Int32Array(COMBAT.queryMax);
  private readonly splitNear = new Int32Array(COMBAT.queryMax);

  constructor(opts: RunOptions) {
    this.opts = opts;
    this.mapNumber = opts.mapNumber ?? 1;
    this.stageCount = stagesForMap(this.mapNumber);
    this.bus = opts.bus ?? defaultBus;
    this.seed = opts.seed >>> 0;
    this.night = opts.night ?? 0;
    const id = opts.yokaiId ?? 'chochin-kozo';
    if (!PLAYABLE_YOKAI.includes(id)) throw new Error(`這隻妖怪還不能玩：${id}`);
    this.yokai = YOKAI[id];
    this.maxEnemies = opts.mobile ? WAVES.maxEnemiesMobile : WAVES.maxEnemiesDesktop;
    // 大招（D52）：沒給就用這隻妖怪一開始就有的那一招；最多 ULT_SLOTS 招
    for (const u of (opts.ults ?? defaultUltsOf(id)).slice(0, ULT_SLOTS)) this.ults.push(u);
    for (const u of this.ults) this.ultLevels.set(u, opts.ultLevels?.[u] ?? 0);
    this.ultModsNow = ultMods(this.ults.length ? this.ultLevels.get(this.ults[0]) ?? 0 : 0);
    this.projectiles = new Projectiles(300);
    this.tech = new Techniques(this, this.maxEnemies);
    this.orbs = new Orbs(PROGRESSION.maxOrbs);
    this.stats = new Stats(this.yokai.base);
    this.rngCombat = new Rng(subSeed(this.seed, 1));
    this.rngCards = new Rng(subSeed(this.seed, 2));
    this.rngSpawn = new Rng(subSeed(this.seed, 3));
    this.rngElements = new Rng(subSeed(this.seed, 4));
    this.rngPickups = new Rng(subSeed(this.seed, 5));
    this.pickups = new Pickups(this.rngPickups);
    this.dealer = new CardDealer(this.rngCards, itemPoolFor(this.weaponItemId), RARITIES_UNLOCKED_M1);
    // 主武器從 1 級開始（佔的不是道具欄位）
    this.cardCounts.set(this.weaponItemId, 1);
    this.ownedCards.add(this.weaponItemId);
    this.hp = this.stats.value.maxHp;
    this.startNextStage();
  }

  get awaitingPick(): boolean {
    return this.offer !== null;
  }
  /** 這件道具現在收得下嗎：沒練滿；新道具要有空的道具欄（狐面商用，D38） */
  canTakeItem(id: string): boolean {
    const d = itemById(id);
    const lv = this.cardCounts.get(id) ?? 0;
    if (lv >= d.maxLevel) return false;
    return lv > 0 || slotsUsed(this.cardCounts) < ITEM_SLOTS;
  }

  /** 結果卡開著或要選卡：模擬凍結 */
  get frozen(): boolean {
    return this.offer !== null || this.elementResult !== null;
  }

  /** 要素結果卡（D36）：開著時模擬凍結；介面關掉時呼叫 dismissResult() */
  elementResult: ElementResult | null = null;
  private showResult(res: ElementResult): void {
    this.elementResult = res;
    this.bus.emit('elementResult', { kind: res.kind });
  }
  dismissResult(): void {
    this.elementResult = null;
  }
  get maxHp(): number {
    return this.stats.value.maxHp;
  }
  get xpNeeded(): number {
    return xpNeed(this.level);
  }
  /** 第幾關（1 起） */
  get stageNumber(): number {
    return this.stageIndex + 1;
  }
  /** 這一關還剩幾秒（最終蜂群時為 0） */
  get timeLeft(): number {
    return Math.max(0, this.director.duration - this.time);
  }

  /** 世界座標的移動向量（長度 > 1 會被正規化）；鏡頭相對的換算由呼叫端做（cameraRig.worldMove） */
  setMove(wx: number, wz: number): void {
    this.mx = wx;
    this.mz = wz;
  }

  requestJump(): void {
    this.jumpReq = true;
  }

  // ── 關卡 ─────────────────────────────────────────────────────
  private buildWorld(): void {
    const def = this.opts.mapFor ? this.opts.mapFor(this.stageIndex, this.seed) : makeHighlands(subSeed(this.seed, 100 + this.stageIndex));
    this.map = new TerrainMap(def);
    this.flow = new FlowField(this.map);
    this.enemies = new Enemies(this.map, this.maxEnemies);
    this.director = new StageDirector(this.rngSpawn, this.map, this.flow, this.enemies, this.maxEnemies);
    this.elements = new Elements(this.rngElements, this.map, this.flow, {
      stats: this.stats,
      healFrac: (f) => {
        const before = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * f);
        return this.hp - before;
      },
      canPayHpFrac: (f) => this.hp > this.maxHp * f + 1,
      payHpFrac: (f) => {
        this.hp -= this.maxHp * f;
      },
      openPick: (rarity, picks, kind) => this.openBonusPick(rarity, picks, kind),
      canFuse: () => this.hasEvolvable,
      walkable: (x, z) => this.walkableFromPlayer(x, z),
      canSummit: () => !this.director.bossSpawned,
      activateSummit: () => {
        this.director.summitMult = SUMMIT.bossMult;
        this.summitChests = SUMMIT.extraChests;
        this.bus.emit('summit', { stage: this.stageNumber, mult: SUMMIT.bossMult, chests: SUMMIT.extraChests });
        return { mult: SUMMIT.bossMult, chests: SUMMIT.extraChests };
      },
      addMerit: (n) => {
        this.bonusMerit += n;
      },
      notifyOmikuji: (result) => {
        this.lastOmikuji = { id: result, at: this.clock };
      },
      setCurse: (key, id, v) => {
        this.curseSources.set(key, { id, v });
        this.recomputeCurse();
      },
      clearCurse: (key) => {
        this.curseSources.delete(key);
        this.recomputeCurse();
      },
      rechooseVariant: () => this.openRechoose(),
      summonBoss: () => {
        if (!this.director.summonBoss()) return 0;
        this.bus.emit('summonBoss', { stage: this.stageNumber, mult: this.director.summonMult });
        return this.director.summonMult;
      },
      showResult: (res) => this.showResult(res),
      foxCandidates: () => TRADE_ITEMS.filter((id) => this.canTakeItem(id)),
      canTakeItem: (id) => this.canTakeItem(id),
      grantItem: (id, rarity) => {
        const o = { cardId: id, rarity };
        this.applyCard(o);
        this.bus.emit('cardChosen', { cardId: id, rarity });
        return this.cardCounts.get(id) ?? 0;
      },
      emitSpawn: (kind, rarity) => this.bus.emit('elementSpawn', { kind, rarity }),
      emitUsed: (kind, rarity) => this.bus.emit('elementUsed', { kind, rarity }),
    }, this.elementCarry);
    this.projectiles.reset();
    this.shots.reset();
    this.orbs.reset();
    this.pickups?.reset();
    this.freezeUntil = 0;
    const s = this.map.def.playerStart;
    this.px = s.x;
    this.pz = s.z;
    this.py = this.map.heightAt(s.x, s.z);
    this.vy = 0;
    this.grounded = true;
    this.hvx = 0;
    this.hvz = 0;
    this.flow.update(this.px, this.pz, true);
  }

  private recomputeCurse(): void {
    for (const id of ALTAR_CURSE_IDS) this.curse[id] = 0;
    for (const c of this.curseSources.values()) this.curse[c.id] += c.v;
  }

  /** 難度 %（D30 第二步）：關卡與地圖帶來的難度（0.5 = +50%）。詛咒另外算（this.curse） */
  get difficulty(): number {
    return DIFFICULTY.perStage * this.stageIndex + DIFFICULTY.perMap * (this.mapNumber - 1);
  }

  /** 這一關頭目要不要玩家去召喚（不是大頭目那一關） */
  get summonStage(): boolean {
    return !this.director.autoBoss;
  }

  startNextStage(): void {
    if (this.phase === 'ended') return;
    this.stageIndex++;
    this.phase = 'combat';
    this.time = 0;
    this.bossDefeated = false;
    this.portal.active = false;
    this.buildWorld();
    this.director.start(this.stageIndex, bossHpMult(this.mapNumber, this.stageIndex), {
      autoBoss: isBigBossStage(this.mapNumber, this.stageIndex),
      hpMult: 1 + this.difficulty * DIFFICULTY.hp,
    });
    this.summonPlaced = false;
    this.summitChests = 0;
    this.dosojinAt = this.tech.owned.length > 0 ? this.clock + DOSOJIN.appearDelay : Infinity;
    this.elements.start(this.px, this.pz, this.director.duration, this.director.virtualWave(), this.stats.value.luck);
    this.elements.placeSummit(); // 山頂神社（E2）：每關一座，放在地圖最高的、走得到的平地
    this.fireCd = 0.3;
    this.bus.emit('stageStart', { stage: this.stageNumber });
  }

  /** 過關畫面 → 下一關（外面的狀態機在 INTERMISSION 按「出發」時呼叫） */
  continueFromIntermission(): void {
    if (this.phase !== 'intermission' || this.offer !== null) return;
    this.startNextStage();
  }

  /** 開發與測試：把關卡時間直接設成 t 秒（觸發中間錯過的定時事件不補發；只用來跳到頭目前後） */
  devSetTime(t: number): void {
    this.time = t;
    this.director.time = t;
    const dur = this.director.duration;
    this.director.eventsFired = STAGE.events.filter((e) => e.at * dur <= t).length;
  }

  /** 開發與測試：頭目現在就倒下（走正常的擊殺流程，傳送門會開） */
  devKillBoss(): boolean {
    const i = this.director.bossIndex;
    if (i < 0 || !this.enemies.alive[i]) return false;
    this.enemies.hp[i] = 0;
    this.onKill(i);
    return true;
  }

  /** 開發與測試：直接召喚小頭目（像開了召喚祭壇；祭壇還在就一起收掉）。大頭目那一關沒有祭壇，回傳 false */
  devSummonBoss(): boolean {
    if (!this.summonStage) return false;
    const s = this.elements.summonSlot;
    if (s) s.usedAge = 0;
    this.summonPlaced = true;
    const ok = this.director.summonBoss();
    if (ok) this.bus.emit('summonBoss', { stage: this.stageNumber, mult: this.director.summonMult });
    return ok;
  }

  /** 開發與測試：不管在哪，現在就過關（走正常的過關流程） */
  devClearStage(): void {
    if (this.phase === 'combat') this.clearStage();
  }

  /** 開發與測試：清場（敵人、敵方的箭）、解除受傷後的無敵時間、並停止這一關的湧出（只剩測試自己放的敵人） */
  devClearEnemies(): void {
    this.director.active = false;
    this.enemies.reset();
    this.shots.reset();
    this.invul = 0;
  }

  /** 開發與測試：場上所有敵人的生命設成極大（行為測試不要被玩家的武器先打死） */
  devTankEnemies(): void {
    for (let i = 0; i < this.enemies.high; i++) if (this.enemies.alive[i]) this.enemies.hp[i] = this.enemies.maxHp[i] = 1e9;
  }

  devSpawn(kindId: string, n: number): number {
    const kind = kindIndex(kindId);
    let made = 0;
    for (let k = 0; k < n; k++) {
      for (const r of [8, 6, 10, 12]) {
        const a = k * 2.399963 + r;
        const x = this.px + Math.cos(a) * r;
        const z = this.pz + Math.sin(a) * r;
        if (this.map.isBlocked(x, z) || !(this.flow.isolated || this.flow.reachable(x, z))) continue;
        if (this.enemies.spawn(kind, x, z, this.director.virtualWave(), this.night, k * 0.7) >= 0) made++;
        break;
      }
    }
    return made;
  }

  devTeleport(x: number, z: number): boolean {
    if (this.map.isBlocked(x, z) || !this.map.inBounds(x, z)) return false;
    this.px = x;
    this.pz = z;
    this.py = this.map.heightAt(x, z);
    this.vy = 0;
    this.grounded = true;
    this.hvx = 0;
    this.hvz = 0;
    this.flow.update(x, z, true);
    return true;
  }

  // ── 一個模擬步 ───────────────────────────────────────────────
  step(dt: number): void {
    if (this.phase !== 'combat' || this.frozen) return;
    if (this.dead) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.finish('death');
      return;
    }
    this.time += dt;
    this.clock += dt;
    if (!this.ultCooling) this.ultCharge = Math.min(ULT.max, this.ultCharge + ULT.perSecond * this.ultModsNow.charge * dt);
    if (this.frenzyUntil > 0 && this.clock >= this.frenzyUntil) {
      this.stats.clearMod('ult:frenzy');
      this.frenzyUntil = 0;
      this.frenzyVolley = 0;
    }
    this.movePlayer(dt);
    const s = this.stats.value;
    this.hp = Math.min(this.maxHp, this.hp + s.regen * dt);
    if (this.invul > 0) this.invul -= dt;

    this.flow.update(this.px, this.pz);
    const aura = this.yokai.aura;
    this.enemies.update(dt, this.px, this.pz, this.flow, aura.radius * s.area, aura.slow, this.shots);
    this.contactDamage();
    this.arrowDamage(dt);
    this.weapon(dt);
    this.tech.update(dt);
    this.projectiles.homeX = this.px;
    this.projectiles.homeZ = this.pz;
    this.projectiles.update(dt, this.tech.weapon, this.enemies, s.area, this.onProjectileHit);
    const gained = this.orbs.update(dt, this.px, this.pz, s.pickup);
    const picked = this.pickups.update(dt, this.px, this.pz, s.pickup);
    for (let k = 0; k < picked; k++) this.applyPickup(PICKUP_KINDS[this.pickups.got[k]]);
    if (gained > 0) this.addXp(gained);

    this.elements.update(dt, this.time, this.director.duration, this.director.virtualWave(), s.luck, this.px, this.py, this.pz);
    // 合魂祠：可以進化之後 appearDelay 秒出現在地圖上（一次一座；D53）
    if (this.hasEvolvable && !this.elements.fuseSlot && this.clock >= this.evolvableSince + FUSE.appearDelay) {
      if (this.elements.placeFuse(this.px, this.pz)) this.bus.emit('fuseShrine', { stage: this.stageNumber });
    }
    // 道祖神：選了變化之後每關一座（D47）
    if (this.clock >= this.dosojinAt && this.phase === 'combat') {
      this.dosojinAt = Infinity;
      if (this.elements.placeDosojin(this.px, this.pz)) this.bus.emit('dosojin', { stage: this.stageNumber });
    }
    if (!this.summonPlaced && this.summonStage && !this.director.bossSpawned && this.time >= STAGE.summon.appearAt * this.director.duration) {
      if (this.elements.placeSummon(this.px, this.pz)) {
        this.summonPlaced = true;
        this.bus.emit('summonAltar', { stage: this.stageNumber });
      }
    }
    this.director.extraMult = this.elements.spawnMult * (1 + this.curse.spawnRate) * (1 + this.difficulty * DIFFICULTY.spawn);
    this.director.hpCurse = 1 + this.curse.enemyHp;
    this.enemies.speedMult = this.frozenEnemies ? 0 : 1 + this.curse.enemySpeed;
    this.director.update(dt, this.px, this.pz, this.night, this.bossDefeated);
    this.checkEnemySeen();

    if (this.hp <= 0 && !this.god) {
      this.dead = true;
      this.deathTimer = COMBAT.deathDelay;
      return;
    }
    if (this.portal.active && this.portalReached()) this.clearStage();
  }

  /** 這一局第一次看到某種人類（頭目以外）→ 發事件（字幕與圖鑑）；每種只發一次 */
  private checkEnemySeen(): void {
    const c = this.enemies.kindCount;
    for (let k = 0; k < c.length; k++) {
      if (c[k] <= 0 || this.seenKinds[k]) continue;
      this.seenKinds[k] = 1;
      this.bus.emit('enemySeen', { id: ENEMY_IDS[k] });
    }
  }
  private readonly seenKinds = new Uint8Array(ENEMY_IDS.length);
  /** 新人類第一次出場的簡短提示（i18n 鍵與結束時間；由 Game 在存檔裡沒有紀錄時設定，HUD 顯示在波數旁） */
  enemyIntro: { key: string; until: number } | null = null;

  private portalReached(): boolean {
    const p = this.portal;
    return Math.hypot(this.px - p.x, this.pz - p.z) <= STAGE.portalRadius && Math.abs(this.py - p.y) <= STAGE.portalHeight;
  }

  /** 玩家在 (x1,z1) 這個水平位置、目前腳高 py 時，這一步被擋住嗎（地面與空中規則不同） */
  private moveBlocked(x0: number, z0: number, x1: number, z1: number): boolean {
    const m = this.map;
    if (m.isBlocked(x1, z1)) return true;
    const h1 = m.heightAt(x1, z1);
    if (this.grounded) {
      const dist = Math.hypot(x1 - x0, z1 - z0);
      return dist > 1e-6 && (h1 - m.heightAt(x0, z0)) / dist > WALL_TAN;
    }
    // 空中：腳要高過前方地面才過得去，否則撞上牆
    return h1 > this.py + 0.05;
  }

  private movePlayer(dt: number): void {
    const m = this.map;
    // 跳躍：土狼時間與跳躍緩衝
    this.coyote = this.grounded ? MOVE.coyote : Math.max(0, this.coyote - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.jumpReq) {
      this.jumpBuf = MOVE.jumpBuffer;
      this.jumpReq = false;
    }
    if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0)) {
      this.vy = MOVE.jumpSpeed;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuf = 0;
    }
    // 想走的水平速度
    let mx = this.mx;
    let mz = this.mz;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const mag = Math.min(1, len);
    let spd = this.stats.value.speed * mag;
    if (this.grounded && len > 1e-3) {
      spd *= m.speedAt(this.px, this.pz) * m.slopeMult(this.px, this.pz, this.px + mx, this.pz + mz);
    }
    const dx = len > 1e-3 ? mx / Math.max(mag, 1e-6) : 0;
    const dz = len > 1e-3 ? mz / Math.max(mag, 1e-6) : 0;
    const tvx = dx * spd;
    const tvz = dz * spd;
    if (this.grounded) {
      this.hvx = tvx;
      this.hvz = tvz;
    } else {
      const k = Math.min(1, MOVE.airAccel * dt) * MOVE.airControl;
      this.hvx += (tvx - this.hvx) * k;
      this.hvz += (tvz - this.hvz) * k;
    }
    // 水平移動（軸分離碰撞）
    const r = COMBAT.playerRadius;
    let nx = Math.min(m.maxX - r, Math.max(m.minX + r, this.px + this.hvx * dt));
    let nz = Math.min(m.maxZ - r, Math.max(m.minZ + r, this.pz + this.hvz * dt));
    if (this.moveBlocked(this.px, this.pz, nx, nz)) {
      if (!this.moveBlocked(this.px, this.pz, nx, this.pz)) nz = this.pz;
      else if (!this.moveBlocked(this.px, this.pz, this.px, nz)) nx = this.px;
      else {
        nx = this.px;
        nz = this.pz;
        // 撞牆：水平速度歸零（空中也一樣，免得貼著牆一直推）
        this.hvx = 0;
        this.hvz = 0;
      }
    }
    const hdist = Math.hypot(nx - this.px, nz - this.pz);
    this.moveSpeed = hdist / dt;
    if (this.moveSpeed > 0.05) this.facing = Math.atan2(nx - this.px, nz - this.pz);
    this.px = nx;
    this.pz = nz;
    // 垂直：走出懸崖邊（向下的坡度超過牆的角度，或一步掉太多）就變成掉落，不貼著崖面滑下去
    const ground = m.heightAt(this.px, this.pz);
    if (this.grounded) {
      const drop = this.py - ground;
      if (drop > MOVE.stepDown || (hdist > 1e-6 && drop / hdist > WALL_TAN)) {
        this.grounded = false;
        this.vy = 0;
      } else this.py = ground;
    }
    if (!this.grounded) {
      this.vy -= MOVE.gravity * dt;
      this.py += this.vy * dt;
      if (this.py <= ground) {
        this.py = ground;
        this.vy = 0;
        this.grounded = true;
      }
    }
  }

  private contactDamage(): void {
    const e = this.enemies;
    const n = e.within(this.px, this.pz, COMBAT.playerRadius + 2, this.near);
    for (let k = 0; k < n; k++) {
      const i = this.near[k];
      if (!e.alive[i] || e.contactCd[i] > 0) continue;
      const dx = e.x[i] - this.px;
      const dz = e.z[i] - this.pz;
      const r = COMBAT.playerRadius + e.radius(i);
      if (dx * dx + dz * dz > r * r) continue;
      // 跳起來越過人群：腳高於敵人腳底一定高度就不會被這隻的接觸傷害
      if (this.py - this.map.heightAt(e.x[i], e.z[i]) > MOVE.contactClear * e.scale[i]) continue;
      if (this.invul > 0 || this.god || this.frozenEnemies) continue;
      e.contactCd[i] = COMBAT.contactCooldown;
      if (this.rngCombat.next() < this.stats.value.dodge) continue;
      if (this.hurtPlayer(e.damage[i])) break;
    }
  }

  /** 敵方的箭：前進一步；打中就走和接觸傷害同一條受傷流程。跳起來（腳離地超過 arrowClear）箭從腳下飛過 */
  private arrowDamage(dt: number): void {
    if (this.shots.aliveCount === 0) return;
    const airborne = this.py - this.map.heightAt(this.px, this.pz) > COMBAT.arrowClear;
    const canHit = this.invul <= 0 && !this.god && !this.frozenEnemies && !airborne;
    const dmg = this.shots.update(dt, this.px, this.pz, COMBAT.playerRadius, canHit);
    if (dmg > 0 && this.rngCombat.next() >= this.stats.value.dodge) this.hurtPlayer(dmg);
  }

  /**
   * 玩家受到一次傷害（已排除無敵與閃避）：護身火擋下就回傳 true 且不扣血；否則依難度、詛咒、護甲換算後扣血。
   * rawDamage 是敵人身上的原始傷害（接觸傷害或箭的傷害）。
   */
  private hurtPlayer(rawDamage: number): boolean {
    if (this.tech.tryWard()) {
      this.invul = COMBAT.invulnerable;
      return true;
    }
    const dmg = rawDamage * (1 + this.curse.enemyDamage) * (1 + this.difficulty * DIFFICULTY.damage) * armorMult(this.stats.value.armor);
    this.hp -= dmg;
    this.invul = COMBAT.invulnerable;
    this.bus.emit('playerHurt', { damage: dmg, hp: this.hp });
    return true;
  }

  private weapon(dt: number): void {
    const w = this.tech.weapon;
    const s = this.stats.value;
    if (this.tech.replacesFire) return; // 燈籠環：不發射，改由技法系統繞身攻擊
    if (w.kind === 'sweep') {
      this.sweepWeapon(dt);
      return;
    }
    this.fireCd -= dt;
    if (this.fireCd > 0) return;
    // 回力武器（河童的水盤）：上一批還沒回到身邊就不丟下一批（一次一批，D67）
    if (w.kind === 'boomerang' && this.projectiles.hasHoming()) {
      this.fireCd = 0;
      return;
    }
    const volleyExact = this.volleyExact;
    // 小數的部分 = 機率多一顆（卡片的數值是小數，這樣每張卡的價值才能細調）
    const volley = Math.min(this.aim.length, Math.floor(volleyExact) + (this.rngCombat.next() < volleyExact - Math.floor(volleyExact) ? 1 : 0));
    // 每顆打不同的敵人（由近到遠）；敵人比鬼火少時，多的那幾顆輪流打同一批、出手時錯開角度（D39 之後修：以前全部瞄最近那隻，疊成一顆）
    const nTargets = this.enemies.nearestK(this.px, this.pz, w.range * s.area, volley, this.aim);
    if (nTargets <= 0) {
      this.fireCd = 0;
      return;
    }
    this.fireCd += (w.interval * this.cooldownMult * this.tech.intervalMult) / s.atkSpeed;
    for (let v = 0; v < volley; v++) {
      const target = this.aim[v % nTargets];
      const dx = this.enemies.x[target] - this.px;
      const dz = this.enemies.z[target] - this.pz;
      const d = Math.hypot(dx, dz) || 1;
      const crit = this.rngCombat.next() < s.crit;
      const dmg = this.shotDamage(crit) * this.tech.shotMult;
      // 同一個目標的第 2、3 顆：出手時往兩側錯開，飛行路線看得出是好幾顆
      const lap = Math.floor(v / nTargets);
      const spread = lap === 0 ? 0 : (lap % 2 === 1 ? 1 : -1) * Math.ceil(lap / 2) * COMBAT.volleySpread;
      const c = Math.cos(spread);
      const sn = Math.sin(spread);
      const ux = dx / d;
      const uz = dz / d;
      const pi = this.projectiles.spawn(this.px, this.pz, ux * c - uz * sn, ux * sn + uz * c, w, dmg, crit, target, this.rollPierce());
      if (pi >= 0) this.projectiles.homing[pi] = w.kind === 'boomerang' ? 1 : this.tech.homingFlag;
    }
  }

  /** 揮擊次數（sweep 武器：每 shockEvery 下一次震波） */
  private swings = 0;
  /** 最近一次揮擊（畫面與測試用）：時間（clock）、朝向、是不是震波 */
  lastSwing: { at: number; dx: number; dz: number; shock: boolean } | null = null;
  /** 測試用：到目前揮了幾下 */
  get swingCountForTest(): number {
    return this.swings;
  }
  /**
   * 近戰扇形揮擊（D61，赤鬼的金棒）：冷卻到了、半徑內有敵人才揮；朝最近的敵人揮，扇形內的每一隻都吃傷害與擊退；
   * 每 shockEvery 下變成震波（半徑、傷害加大，擊退也用震波的範圍）。命中也會觸發技法的命中效果。
   */
  private sweepWeapon(dt: number): void {
    const w = this.tech.weapon;
    const s = this.stats.value;
    this.fireCd -= dt;
    if (this.fireCd > 0) return;
    const reach = (w.reach ?? 3) * s.area;
    if (this.enemies.nearestK(this.px, this.pz, reach, 1, this.aim) <= 0) {
      this.fireCd = 0;
      return;
    }
    this.fireCd += (w.interval * this.cooldownMult * this.tech.intervalMult) / s.atkSpeed;
    const t0 = this.aim[0];
    const fx = this.enemies.x[t0] - this.px;
    const fz = this.enemies.z[t0] - this.pz;
    const fl = Math.hypot(fx, fz) || 1;
    this.swings++;
    const shock = (w.shockEvery ?? 0) > 0 && this.swings % (w.shockEvery ?? 1) === 0;
    const R = reach * (shock ? (w.shockRadius ?? 1) : 1);
    const half = (shock ? Math.PI : (w.arc ?? Math.PI / 2) / 2);
    const cosHalf = Math.cos(half);
    const crit = this.rngCombat.next() < s.crit;
    const dmg = this.shotDamage(crit) * this.tech.shotMult * (shock ? (w.shockDamage ?? 1) : 1);
    this.lastSwing = { at: this.clock, dx: fx / fl, dz: fz / fl, shock };
    const n = this.enemies.within(this.px, this.pz, R, this.splashNear);
    for (let k = 0; k < n; k++) {
      const e = this.splashNear[k];
      if (!this.enemies.alive[e]) continue;
      const dx = this.enemies.x[e] - this.px;
      const dz = this.enemies.z[e] - this.pz;
      const d = Math.hypot(dx, dz) || 1;
      if ((dx * fx + dz * fz) / (d * fl) < cosHalf) continue;
      const hx = this.enemies.x[e];
      const hz = this.enemies.z[e];
      this.weaponHit(e, dmg, dx / d, dz / d, w.knockback * (shock ? 1.5 : 1), crit);
      if (this.enemies.alive[e]) this.tech.hitFx(e, hx, hz, dmg, true, crit);
    }
  }

  /** 每顆鬼火的穿透次數：小數 = 機率多穿一隻 */
  private rollPierce(): number {
    const p = this.pierceBonus + this.tech.evoPierce;
    const base = Math.floor(p);
    return base + (this.rngCombat.next() < p - base ? 1 : 0);
  }

  /** 固定的方法參照：投射物命中時結算傷害（不在迴圈裡建函式） */
  private readonly onProjectileHit = (e: number, p: number): void => {
    const pr = this.projectiles;
    const w = this.yokai.weapon;
    const vl = Math.hypot(pr.vx[p], pr.vz[p]) || 1;
    const dmg = pr.damage[p];
    const hx = this.enemies.x[e];
    const hz = this.enemies.z[e];
    const gen = pr.gen[p];
    this.weaponHit(e, dmg, pr.vx[p] / vl, pr.vz[p] / vl, w.knockback, pr.crit[p] === 1);
    // 技法的命中效果（D48）：主鬼火直接命中每次都觸發；彈跳的小火打中後再跳
    if (gen === 0) this.tech.hitFx(e, hx, hz, dmg, true, pr.crit[p] === 1);
    else if (gen === 3) this.tech.onBounceHit(e, hx, hz, dmg, pr.chain[p]);
    // 碎火（D43）：主鬼火命中 → 飛出幾片；狐火分裂時碎片打中後再分裂一次
    if (gen === 0) {
      const exact = this.shardsExact;
      if (exact > 0) {
        const n = Math.min(SHARDS.max, Math.floor(exact) + (this.rngCombat.next() < exact - Math.floor(exact) ? 1 : 0));
        this.emitShards(hx, hz, e, dmg * SHARDS.damage, n, 1);
      }
    } else if (gen === 1 && this.tech.act.kitsunebi?.split && this.shardsExact > 0) {
      this.emitShards(hx, hz, e, dmg, this.tech.act.kitsunebi.split.reSplit, 2);
    }
    const splashR = ((tuning.splash > 0 ? tuning.splash : w.splashRadius) + this.splashBonus);
    if (splashR > 0) {
      const n = this.enemies.within(hx, hz, splashR * this.stats.value.area, this.splashNear);
      const sd = dmg * ((w.splashRatio > 0 ? w.splashRatio : 0.6));
      for (let k = 0; k < n; k++) {
        const o = this.splashNear[k];
        if (o === e || !this.enemies.alive[o]) continue;
        this.weaponHit(o, sd, 0, 0, 0, false, true);
      }
    }
  };

  /**
   * 武器傷害（鬼火、繞身、燃燒地、火柱…）打中 e：頭目不被擊退、跳傷害數字（quiet = 不跳）、打倒就結算；
   * 技法系統（火種）會知道這隻是被武器打倒的。dx, dz 是擊退方向（不用單位向量）。
   */
  weaponHit(e: number, dmg: number, dx: number, dz: number, knock: number, crit: boolean, quiet = false): void {
    const en = this.enemies;
    const x = en.x[e];
    const z = en.z[e];
    dmg = en.guard(e, dmg); // 盾面正面減傷（E-1）：傷害數字也顯示減傷後的
    if (!quiet) this.feed.push(x, z, dmg, crit);
    const l = Math.hypot(dx, dz);
    if (en.hurt(e, dmg, l > 1e-6 ? dx / l : 0, l > 1e-6 ? dz / l : 0, en.variant[e] === 2 ? 0 : knock)) {
      this.onKill(e);
      this.tech.onWeaponKill(x, z);
    }
  }

  /** 戰鬥用的固定種子亂數 0～1（技法系統用） */
  rand(): number {
    return this.rngCombat.next();
  }

  /** 暴擊判定（技法系統用；rate 不給就用玩家的暴擊率） */
  rollCrit(rate: number = this.stats.value.crit): boolean {
    return this.rngCombat.next() < rate;
  }

  /** 擊殺紀錄（環形緩衝，給畫面做爆圈）：x、z、種類（0 一般／1 精英／2 頭目）、體型；deathHead = 總共寫了幾筆 */
  readonly deathLog = new Float32Array(FEEL.deathLog * 4);
  deathHead = 0;
  /** 精英、頭目擊殺數（頓幀與震動用） */
  eliteKills = 0;
  private onKill(e: number): void {
    this.kills++;
    const di = (this.deathHead++ % FEEL.deathLog) * 4;
    this.deathLog[di] = this.enemies.x[e];
    this.deathLog[di + 1] = this.enemies.z[e];
    this.deathLog[di + 2] = this.enemies.variant[e];
    this.deathLog[di + 3] = this.enemies.scale[e];
    if (this.enemies.variant[e] === 1) this.eliteKills++;
    if (!this.ultCooling) this.ultCharge = Math.min(ULT.max, this.ultCharge + (this.enemies.variant[e] === 2 ? ULT.perBoss : this.enemies.variant[e] === 1 ? ULT.perElite : ULT.perKill) * this.ultModsNow.charge);
    const value = this.enemies.points(e) * PROGRESSION.orbPerPoint;
    const x = this.enemies.x[e];
    const z = this.enemies.z[e];
    const isBoss = this.enemies.variant[e] === 2;
    const isElite = this.enemies.variant[e] === 1;
    if (!this.orbs.spawn(x, z, value)) this.addXp(value);
    this.elements.noteKill(x, z);
    this.enemies.kill(e);
    if (isBoss) {
      // 寶箱與傳送門放在玩家走得到的地方（敵人會擠進玩家去不了的凹地；D34 試算時發現）
      this.reachableNear(x, z);
      const sx = this.spot[0];
      const sz = this.spot[1];
      this.openPortal(sx, sz);
      // 寶箱離傳送門夠遠：走去開寶箱時不會先踩進傳送門過關
      this.reachableNear(sx, sz, sx, sz, STAGE.chestFromPortal);
      this.elements.dropChest(this.spot[0], this.spot[1], STAGE.drops.bossChest);
      // 山頂神社（E2）：啟動過的話多掉幾個寶箱（同階）
      for (let k = 0; k < this.summitChests; k++) {
        this.reachableNear(sx + (k + 1) * 1.5, sz, sx, sz, STAGE.chestFromPortal);
        this.elements.dropChest(this.spot[0], this.spot[1], STAGE.drops.bossChest);
      }
    } else if (isElite && this.rngCombat.next() < STAGE.drops.eliteChestChance) {
      this.reachableNear(x, z);
      this.elements.dropChest(this.spot[0], this.spot[1], STAGE.drops.eliteChest);
    }
    this.dropPickups(x, z, isBoss ? 'boss' : isElite ? 'elite' : 'normal');
  }

  /** 補給品掉落（D39）：一般人類機率（幸運加成）、精英 1 個、頭目 bossDrops 個；精英與頭目的放在玩家走得到的地方 */
  private dropPickups(x: number, z: number, source: 'normal' | 'elite' | 'boss'): void {
    const R = PICKUP_RULES;
    if (source === 'normal') {
      if (this.rngPickups.next() >= R.normalChance * (1 + Math.max(0, this.stats.value.luck) / 100)) return;
      this.pickups.spawn(this.pickups.roll('normal'), x, z);
      return;
    }
    const n = source === 'boss' ? R.bossDrops : 1;
    for (let k = 0; k < n; k++) {
      this.reachableNear(x + (k - (n - 1) / 2) * R.spread, z);
      this.pickups.spawn(this.pickups.roll(source), this.spot[0], this.spot[1]);
    }
  }

  /** 人類被雪女的吐息凍住中 */
  get frozenEnemies(): boolean {
    return this.clock < this.freezeUntil;
  }

  /** 撿到補給品：套用效果、HUD 提示、發事件（D39） */
  private applyPickup(kind: PickupKind): void {
    const e = PICKUPS[kind];
    let v = 0;
    if (e.type === 'heal') {
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * e.frac);
      v = this.hp - before;
    } else if (e.type === 'vacuum') {
      v = this.orbs.aliveCount;
      this.orbs.vacuum();
    } else if (e.type === 'thunder') {
      if (this.ultNear.length < this.enemies.capacity) this.ultNear = new Int32Array(this.enemies.capacity);
      const en = this.enemies;
      const n = en.within(this.px, this.pz, e.radius, this.ultNear);
      for (let k = 0; k < n; k++) {
        const i = this.ultNear[k];
        if (!en.alive[i]) continue;
        const dmg = en.variant[i] === 0 ? en.hp[i] + 1 : en.maxHp[i] * e.bossFrac;
        if (en.hurt(i, dmg, 0, 0, 0)) {
          this.onKill(i);
          v++;
        }
      }
      this.lastThunder = { at: this.clock, x: this.px, z: this.pz, r: e.radius };
    } else if (e.type === 'freeze') {
      this.freezeUntil = this.clock + e.seconds;
      this.freezeTotal = e.seconds;
      v = e.seconds;
    } else {
      this.bonusMerit += e.amount;
      v = e.amount;
    }
    this.lastPickup = { kind, at: this.clock, v };
    this.bus.emit('pickup', { kind });
  }

  /** 開發與測試：在玩家前方 dist 公尺放一個補給品 */
  devPickup(kind: PickupKind, dist = 2.5): void {
    this.pickups.spawn(kind, this.px + dist, this.pz);
  }

  private readonly spot = new Float32Array(2);
  private reach: PlayerReach | null = null;
  private reachMap: TerrainMap | null = null;
  /** 山頂神社啟動後：打倒頭目多掉幾個寶箱（每關重設） */
  summitChests = 0;
  private reachAt = -Infinity;
  private reachX = 0;
  private reachZ = 0;

  /** 玩家用走的到不到得了 (x,z)（高處的要素、山頂神社用；同一刻同一個位置的結果共用，不重算） */
  private walkableFromPlayer(x: number, z: number): boolean {
    const m = this.map;
    if (!this.reach || this.reachMap !== m) {
      this.reach = new PlayerReach(m);
      this.reachMap = m;
      this.reachAt = -Infinity;
    }
    if (this.clock !== this.reachAt || this.reachX !== this.px || this.reachZ !== this.pz) {
      this.reach.compute(this.px, this.pz);
      this.reachAt = this.clock;
      this.reachX = this.px;
      this.reachZ = this.pz;
    }
    return this.reach.ok(x, z);
  }
  /** (x,z) 附近玩家走得到、不擋路的位置（由近到遠找；可要求離 avoid 至少 minDist），寫進 this.spot；都找不到就放在玩家旁邊 */
  private reachableNear(x: number, z: number, avoidX = 0, avoidZ = 0, minDist = 0): void {
    const m = this.map;
    const R = STAGE.dropClearance;
    // 用細格 BFS 看玩家走不走得到（流場的粗格會判錯）；四周 R 公尺也要不擋路，不放在擠死的角落
    if (!this.reach || this.reachMap !== m) {
      this.reach = new PlayerReach(m);
      this.reachMap = m;
    }
    this.reach.compute(this.px, this.pz);
    const rc = this.reach;
    const ok = (cx: number, cz: number) =>
      rc.ok(cx, cz) &&
      !m.isBlocked(cx + R, cz) &&
      !m.isBlocked(cx - R, cz) &&
      !m.isBlocked(cx, cz + R) &&
      !m.isBlocked(cx, cz - R) &&
      (minDist <= 0 || Math.hypot(cx - avoidX, cz - avoidZ) >= minDist);
    for (const r of STAGE.dropSearchRadii) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const cx = x + Math.cos(a) * r;
        const cz = z + Math.sin(a) * r;
        if (ok(cx, cz)) {
          this.spot[0] = cx;
          this.spot[1] = cz;
          return;
        }
      }
    }
    this.spot[0] = this.px;
    this.spot[1] = this.pz;
  }

  private openPortal(x: number, z: number): void {
    this.bossDefeated = true;
    this.bossesDefeated++;
    // 呼叫端已經挑好走得到的位置（reachableNear）；保險：還是擋路就開在玩家身邊
    let px = x;
    let pz = z;
    if (this.map.isBlocked(px, pz) || !this.map.inBounds(px, pz)) {
      px = this.px + 3;
      pz = this.pz;
      if (this.map.isBlocked(px, pz)) pz = this.pz + 3;
    }
    this.portal = { active: true, x: px, y: this.map.heightAt(px, pz), z: pz };
    this.bus.emit('bossDown', { stage: this.stageNumber });
  }

  // ── 成長 ─────────────────────────────────────────────────────
  addXp(v: number): void {
    this.xp += v;
    let leveled = 0;
    while (this.xp >= xpNeed(this.level)) {
      this.xp -= xpNeed(this.level);
      this.level++;
      this.pendingPicks++;
      leveled++;
    }
    if (leveled > 0 && this.offer === null) {
      this.makeOffer();
      this.bus.emit('levelUp', { level: this.level, pending: this.pendingPicks });
    }
  }

  private makeOffer(): void {
    this.dealer.playerLevel = this.level;
    this.offer = this.dealer.deal(this.level, this.stats.value.luck, this.cardCounts);
    this.mixTechCard(this.offer);
  }

  /**
   * 技法卡（D49）：每次升級有 TECH_OFFER.chance 的機率，把三張裡隨機一張換成技法卡（沒拿過的或已有的下一級）；
   * 玩家 TECH_OFFER.minLevel 級起。稀有度和升級卡同一套抽法。
   */
  private mixTechCard(offer: CardOffer[]): void {
    const roll = this.rngCards.next();
    const forced = this.forceTechCard;
    this.forceTechCard = false;
    if (!forced && (this.level < TECH_OFFER.minLevel || roll >= tuning.techChance)) return;
    const id = this.tech.pickCard(this.rngCards);
    if (!id || offer.length === 0) return;
    const at = Math.floor(this.rngCards.next() * offer.length);
    const rarity = this.dealer.rollRarity(this.level, this.stats.value.luck);
    offer[at] = { cardId: TECH_CARD_PREFIX + id, rarity, affixes: rollAffixes(this.rngCards, rarity, mechOf(techById(id))) };
  }

  /** 選了升級卡裡的技法卡：沒有就學會、有就升一級（效果吃那張卡的稀有度） */
  private applyTechCard(o: CardOffer): void {
    const id = o.cardId.slice(TECH_CARD_PREFIX.length);
    const mult = ITEM_RARITY_MULT[o.rarity];
    // 詞條（D53）：技法卡帶的詞條只強化這個技法本身，選了就永久加在它身上
    if (this.tech.has(id)) {
      this.tech.levelUp(id, mult);
      this.tech.addAffixes(id, o.affixes ?? []);
      return;
    }
    const first = this.tech.owned.length === 0;
    if (this.tech.add(id, mult)) {
      this.tech.addAffixes(id, o.affixes ?? []);
      if (first) this.dosojinAt = this.clock + DOSOJIN.appearDelay;
    }
  }

  /** 玩家選了第 index 張卡。回傳是否還有下一次待選（UI 繼續開著面板） */
  /** 賽錢箱、寶箱：開三選一面板（模擬暫停，沿用升級選卡的同一個面板，D15），連選 picks 次 */
  private openBonusPick(rarity: import('../data/rarity').Rarity, picks: number, kind: 'offering' | 'chest' | 'fusion'): void {
    if (this.offer !== null) return;
    this.bonusLeft = picks;
    this.bonusRarity = rarity;
    this.offerKind = kind;
    this.offer = this.dealBonus();
    this.bus.emit('levelUp', { level: this.level, pending: this.bonusLeft });
  }

  /** 賽錢箱／寶箱的三張卡 */
  private dealBonus(): CardOffer[] {
    // 合魂祠：只有可以進化的（選一個）
    if (this.offerKind === 'fusion') return this.tech.evolvable.slice(0, CARD_CHOICES).map((e) => ({ cardId: EVO_CARD_PREFIX + e.id, rarity: 'legend' as const }));
    this.dealer.playerLevel = this.level;
    const cards = this.dealer.dealRarity(this.bonusRarity, this.cardCounts);
    if (this.offerKind !== 'chest') return cards;
    // 寶箱：可以進化的排在最前面
    const evo = this.tech.evolvable.slice(0, cards.length).map((e) => ({ cardId: EVO_CARD_PREFIX + e.id, rarity: 'legend' as const }));
    return [...evo, ...cards.slice(0, Math.max(0, cards.length - evo.length))];
  }

  /** 有沒有可以進化的：變成「有」時記下時間；變成「沒有」時收掉合魂祠；第一次湊齊時提示（D53） */
  private refreshEvolvable(): void {
    const list = this.tech.evolvable;
    const has = list.length > 0;
    for (const e of list) {
      if (this.evolveNotified.includes(e.id)) continue;
      this.evolveNotified.push(e.id);
      this.lastReady = { id: e.id, at: this.clock };
      this.bus.emit('evolveReady', { id: e.id });
    }
    if (has && !this.hasEvolvable) this.evolvableSince = this.clock;
    if (!has && this.hasEvolvable) this.elements.removeKind('fuse');
    this.hasEvolvable = has;
  }

  /** 面板上「還有幾次」：賽錢箱／寶箱看剩下的連選次數，升級看待選的升級數 */
  get picksLeft(): number {
    if (this.offerKind === 'tech') return 1;
    return this.offerKind === 'levelup' ? this.pendingPicks : this.bonusLeft;
  }

  chooseCard(index: number): boolean {
    if (!this.offer || index < 0 || index >= this.offer.length) return this.offer !== null;
    const o = this.offer[index];
    if (this.offerKind === 'tech') return this.chooseTech(o);
    if (isEvoCard(o.cardId)) {
      // 進化卡（D53）：兩個材料技法併成一個
      const e = evoOfCard(o.cardId);
      if (this.tech.evolve(e.id)) {
        this.lastEvolve = { id: e.id, at: this.clock };
        this.bus.emit('evolve', { id: e.id });
      }
    } else if (isTechCard(o.cardId)) this.applyTechCard(o);
    else this.applyCard(o);
    this.refreshEvolvable();
    this.bus.emit('cardChosen', { cardId: o.cardId, rarity: o.rarity });
    if (this.offerKind !== 'levelup') this.bonusLeft--;
    else this.pendingPicks--;
    return this.continueOffers();
  }

  /** 道祖神的技法面板：換掉一個，或維持現狀 */
  private chooseTech(o: CardOffer): boolean {
    const id = o.cardId;
    if (id.startsWith(TECH_SWAP_PREFIX)) {
      const [from, to] = id.slice(TECH_SWAP_PREFIX.length).split('>');
      if (this.tech.replace(from, to)) {
        this.lastTechChange = { from, to, at: this.clock };
        this.bus.emit('techChanged', { from, to });
      }
    }
    this.bus.emit('cardChosen', { cardId: id, rarity: o.rarity });
    this.offerKind = this.resumeKind;
    this.techMode = 'new';
    return this.continueOffers();
  }

  /** 道祖神（D47）：兩個換法的提案＋「維持現狀」 */
  private openRechoose(): void {
    if (this.offer !== null || this.tech.owned.length === 0) return;
    const proposals = this.tech.offerSwap(this.rngCards);
    if (proposals.length === 0) return;
    this.resumeKind = 'levelup';
    this.techMode = 'swap';
    this.offerKind = 'tech';
    this.offer = [...proposals.map(([a, b]) => ({ cardId: `${TECH_SWAP_PREFIX}${a}>${b}`, rarity: 'common' as const })), { cardId: TECH_KEEP, rarity: 'common' as const }];
    this.bus.emit('levelUp', { level: this.level, pending: 1 });
  }

  /** 選完一張之後：賽錢箱／寶箱還有次數就繼續，否則看還有沒有待選的升級 */
  private continueOffers(): boolean {
    if (this.offerKind !== 'levelup') {
      if (this.bonusLeft > 0) {
        this.offer = this.dealBonus();
        return true;
      }
      this.offerKind = 'levelup';
    }
    if (this.pendingPicks > 0) {
      this.makeOffer();
      return true;
    }
    this.offer = null;
    return false;
  }


  /** 加一項能力值（卡片單位）；最大生命增加時，現有生命同步增加（不會「變成扣血」） */
  private applyStat(stat: import('../data/stats').StatId, v: number): void {
    const before = this.maxHp;
    this.stats.addCard(stat, v);
    if (this.maxHp > before) this.hp += this.maxHp - before;
    this.hp = Math.min(this.hp, this.maxHp);
  }

  /** 套用一張卡（法具升一級；D30） */
  private applyCard(o: CardOffer): void {
    const d = cardById(o.cardId);
    this.picked.push(o);
    if (d.kind === 'fallback') {
      const v = itemValue(d, o.rarity);
      if (d.id === 'heal') this.hp = Math.min(this.maxHp, this.hp + (this.maxHp * v) / 100);
      else this.bonusMerit += v;
      return;
    }
    const lv = this.cardCounts.get(d.id) ?? 0;
    if (lv >= d.maxLevel) return;
    this.ownedCards.add(d.id);
    this.cardCounts.set(d.id, lv + 1);
    if (d.kind === 'weapon') {
      const raw = WEAPON_LEVELS[d.id]?.[lv - 1];
      const step = raw ? scaleWeaponStep(raw, o.rarity) : null;
      if (step) {
        this.weaponDamageBonus += step.damage ?? 0;
        this.volleyBonus += step.volley ?? 0;
        this.pierceBonus += step.pierce ?? 0;
        this.splashBonus += step.splash ?? 0;
        if (step.cooldownPct) this.cooldownMult *= 1 - step.cooldownPct / 100;
      }
    } else if (d.kind === 'mod') {
      const v = itemValue(d, o.rarity);
      if (d.mod === 'volley') this.volleyBonus += v;
      else if (d.mod === 'pierce') this.pierceBonus += v;
      else this.shardBonus += v;
    } else if (d.stat) {
      this.applyStat(d.stat, itemValue(d, o.rarity));
      if (d.down) this.applyStat(d.down.stat, -itemDown(d, o.rarity));
    }
  }

  get ultReady(): boolean {
    return this.ults.length > 0 && this.ultCharge >= ULT.max && !this.ultCooling;
  }

  /** 玩家按大招：量表滿、有裝配大招才會發動（裝配的大招一起發動），量表歸零、進入冷卻 */
  castUltimate(): boolean {
    if (this.phase !== 'combat' || this.frozen || this.dead || !this.ultReady) return false;
    if (this.ultNear.length < this.enemies.capacity) this.ultNear = new Int32Array(this.enemies.capacity);
    // 瞄準：最近的敵人，沒有就朝面向
    let dx = Math.sin(this.facing);
    let dz = Math.cos(this.facing);
    const n = this.enemies.nearest(this.px, this.pz, 30);
    if (n >= 0) {
      const ex = this.enemies.x[n] - this.px;
      const ez = this.enemies.z[n] - this.pz;
      const d = Math.hypot(ex, ez) || 1;
      dx = ex / d;
      dz = ez / d;
    }
    for (const id of this.ults) this.applyUltEffect(ultById(id).effect, dx, dz, id);
    this.lastCast = { ids: [...this.ults], at: this.clock, x: this.px, z: this.pz, dx, dz };
    this.ultCoolUntil = this.clock + this.ultModsNow.cooldown;
    this.ultCharge = 0;
    this.bus.emit('ultimate', { ids: [...this.ults] });
    return true;
  }

  private ultDamage(e: UltEffect & { damageMult: number }): number {
    return (this.yokai.weapon.damage + this.weaponDamageBonus) * this.stats.value.power * tuning.damageScale * e.damageMult * this.ultModsNow.power;
  }

  private applyUltEffect(e: UltEffect, dx: number, dz: number, id = ''): void {
    const s = this.stats.value;
    if (e.type === 'frenzy') {
      this.stats.setMod('ult:frenzy', { pct: { power: e.power * this.ultModsNow.power, atkSpeed: e.atkSpeed * this.ultModsNow.power } });
      this.frenzyUntil = this.clock + e.seconds * this.ultModsNow.radius;
      this.frenzyTotal = e.seconds * this.ultModsNow.radius;
      this.frenzyLabel = `ult.${id}`;
      this.frenzyVolley = e.volley;
      return;
    }
    if (e.type === 'bulwark') {
      this.invul = Math.max(this.invul, e.seconds * this.ultModsNow.radius);
      this.shieldUntil = this.clock + e.seconds * this.ultModsNow.radius;
      this.shieldTotal = e.seconds * this.ultModsNow.radius;
      this.shieldLabel = `ult.${id}`;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * e.healFrac);
    }
    const dmg = e.type === 'beam' || e.type === 'nova' || e.type === 'bulwark' ? this.ultDamage(e) : 0;
    const en = this.enemies;
    if (e.type === 'beam') {
      // 沿射線、寬度內的所有敵人（先用範圍查詢取候選，再用到射線的距離篩）
      const len = e.length * this.ultModsNow.radius;
      const wid = e.width * this.ultModsNow.radius;
      const cx = this.px + dx * (len / 2);
      const cz = this.pz + dz * (len / 2);
      const k = en.within(cx, cz, len / 2 + wid, this.ultNear);
      for (let i = 0; i < k; i++) {
        const o = this.ultNear[i];
        if (!en.alive[o]) continue;
        const rx = en.x[o] - this.px;
        const rz = en.z[o] - this.pz;
        const along = rx * dx + rz * dz;
        const across = Math.abs(rx * -dz + rz * dx);
        if (along < 0 || along > len || across > wid / 2 + en.radius(o)) continue;
        this.feed.push(en.x[o], en.z[o], dmg, false);
        if (en.hurt(o, dmg, dx, dz, 0)) this.onKill(o);
      }
      return;
    }
    const radius = e.radius * this.ultModsNow.radius * s.area;
    const k = en.within(this.px, this.pz, radius, this.ultNear);
    for (let i = 0; i < k; i++) {
      const o = this.ultNear[i];
      if (!en.alive[o]) continue;
      const rx = en.x[o] - this.px;
      const rz = en.z[o] - this.pz;
      const d = Math.hypot(rx, rz) || 1;
      this.feed.push(en.x[o], en.z[o], dmg, false);
      const knock = en.variant[o] === 2 ? 0 : e.knockback;
      if (en.hurt(o, dmg, rx / d, rz / d, knock)) this.onKill(o);
    }
  }

  /** 開發與測試：換成指定的大招（可帶升級等級）；量表與冷卻不動 */
  devSetUlt(id: string, level = 0): void {
    this.ults.length = 0;
    this.ults.push(id);
    this.ultLevels.set(id, level);
    this.ultModsNow = ultMods(level);
  }

  /** 目前裝配的大招的局外升級累計（HUD、能力面板、測試看用） */
  get ultModsView(): UltMods {
    return this.ultModsNow;
  }

  /** 開發與測試：大招量表直接充滿 */
  devChargeUlt(): void {
    this.ultCharge = ULT.max;
    this.ultCoolUntil = 0;
  }

  /** 測試與開發介面：直接給一張卡（不經選卡） */
  give(cardId: string, rarity: keyof typeof RARITY_MULT): void {
    this.applyCard({ cardId, rarity });
  }

  /** 開發與測試：下一次升級選卡一定有一張技法卡 */
  devTechNext(): void {
    this.forceTechCard = true;
  }

  /** 開發與測試：直接給技法（不經面板；可以給好幾個，不受 TECH_MAX 以外的限制） */
  devAddTech(...ids: string[]): void {
    for (const id of ids) {
      const first = this.tech.owned.length === 0;
      if (this.tech.add(id) && first) this.dosojinAt = this.clock + DOSOJIN.appearDelay;
    }
    this.refreshEvolvable();
  }

  /** 開發與測試：把技法（或鬼火）練到指定等級，並重新檢查可不可以進化 */
  devTechLevel(id: string, level: number): void {
    this.tech.devSetLevel(id, level);
    this.refreshEvolvable();
  }

  /** 主武器滿級了嗎（sim 統計用；D81 起技法不再因為主武器滿級而加強） */
  get weaponMaxed(): boolean {
    return this.weaponLevel >= itemById(this.weaponItemId).maxLevel;
  }

  /** 現在一次發射幾顆（含小數：小數 = 機率多一顆） */
  get volleyExact(): number {
    const w = this.yokai.weapon;
    return (tuning.volley > 0 ? tuning.volley : w.volley) + this.volleyBonus + this.frenzyVolley + this.tech.evoVolley;
  }

  /** 燈籠環：繞身鬼火幾顆、半徑（公尺）；環內護身打到的累計次數；燃燒地數（外觀、測試用） */
  get orbitCount(): number {
    return this.tech.ringCount;
  }
  get orbitRadius(): number {
    return this.tech.ringRadius;
  }
  get innerHits(): number {
    return this.tech.innerHits;
  }
  get zoneCount(): number {
    return this.tech.zoneCount;
  }

  /** 一發鬼火的基礎傷害（主武器傷害＋升級加值、攻擊力、暴擊） */
  shotDamage(crit: boolean): number {
    const s = this.stats.value;
    return (this.yokai.weapon.damage + this.weaponDamageBonus) * s.power * tuning.damageScale * (crit ? s.critDmg : 1) * this.tech.evoWeaponDamage;
  }

  /** 平均每次命中的碎火片數（狐火分裂時有碎火就 +shardBonus） */
  get shardsExact(): number {
    const base = this.shardBonus;
    if (base <= 0) return 0;
    return base + (this.tech.act.kitsunebi?.split?.shardBonus ?? 0);
  }

  /** 碎火：從 (x,z) 朝 range 內最近的 n 隻其他人類各飛一片（不同的人類；第 gen 代） */
  private emitShards(x: number, z: number, e: number, dmg: number, n: number, gen: number): void {
    if (n <= 0) return;
    const en = this.enemies;
    const m = en.within(x, z, SHARDS.range, this.splitNear);
    const w = this.tech.weapon;
    for (let made = 0; made < n; made++) {
      let best = -1;
      let bd = Infinity;
      for (let j = 0; j < m; j++) {
        const o = this.splitNear[j];
        if (o === e || o < 0 || !en.alive[o]) continue;
        const d = (en.x[o] - x) ** 2 + (en.z[o] - z) ** 2;
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      if (best < 0) return;
      const t = this.splitNear[best];
      this.splitNear[best] = -1;
      const d = Math.sqrt(bd) || 1;
      const ci = this.projectiles.spawn(x, z, (en.x[t] - x) / d, (en.z[t] - z) / d, w, dmg, false, t, 0, gen);
      if (ci >= 0) this.projectiles.lastHit[ci] = e;
    }
  }

  // ── 過關與結束 ───────────────────────────────────────────────
  private clearStage(): void {
    // 沒打完的人類撤退（不給魂火）、投射物消失；場上的魂火全部收進來
    this.enemies.reset();
    this.projectiles.reset();
    this.shots.reset();
    let rest = 0;
    for (let i = 0; i < this.orbs.high; i++) if (this.orbs.alive[i]) rest += this.orbs.value[i];
    this.orbs.reset();
    this.director.active = false;
    this.portal.active = false;
    this.elements.endStage();
    this.tech.endStage();
    const last = this.stageNumber >= this.stageCount;
    if (rest > 0) this.addXp(rest);
    this.bus.emit('stageClear', { stage: this.stageNumber, last });
    if (last) {
      this.finish('victory');
      return;
    }
    this.phase = 'intermission';
  }

  /** 放棄這一局（過關畫面或暫停選單）：局外獎勵照 50% 結算 */
  abandon(): void {
    if (this.phase === 'ended') return;
    this.offer = null;
    this.pendingPicks = 0;
    this.bonusLeft = 0;
    this.offerKind = 'levelup';
    this.elementResult = null;
    this.finish('abandon');
  }

  finish(result: 'death' | 'victory' | 'abandon'): void {
    if (this.phase === 'ended') return;
    const wasPhase = this.phase;
    this.phase = 'ended';
    // 通過的關卡數：勝利 = 全部；其餘 = 已走進傳送門的關（在過關畫面放棄算已通過目前這關）
    const cleared = result === 'victory' ? this.stageNumber : wasPhase === 'intermission' ? this.stageNumber : this.stageIndex;
    const merit = this.bonusMerit + computeMerit({
      stagesCleared: cleared,
      kills: this.kills,
      bossesDefeated: this.bossesDefeated,
      firstClear: result === 'victory' && !this.opts.clearedBefore,
      meritStat: this.opts.meritStat ?? 0,
      night: this.night,
      abandoned: result === 'abandon',
    });
    this.meritEarned = merit;
    this.result = result;
    this.bus.emit('runEnd', { result, stage: this.stageNumber, kills: this.kills, level: this.level, time: this.time, merit });
  }

  meritEarned = 0;
  result: 'death' | 'victory' | 'abandon' | null = null;
}
