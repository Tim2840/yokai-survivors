import { bus as defaultBus, type EventBus } from '../core/bus';
import { COMBAT } from '../data/combat';
import { MOVE } from '../data/movement';
import { PLAYABLE_YOKAI, YOKAI, type YokaiDef } from '../data/yokai';
import { PROGRESSION, RARITIES_UNLOCKED_M1, xpNeed } from '../data/progression';
import { ITEM_POOL, ITEM_SLOTS, TRADE_ITEMS, WEAPON_LEVELS, itemDown, itemValue, itemById } from '../data/items';
import { VARIANT_CARD_PREFIX, VARIANT_LEVEL, variantOfCard, variantsFor, type VariantDef } from '../data/variants';
import { RARITY_MULT } from '../data/rarity';
import { STAGE, stagesForMap, bossHpMult, isBigBossStage } from '../data/stage';
import { DIFFICULTY } from '../data/difficulty';
import { WAVES } from '../data/waves';
import { tuning } from '../data/tuning';
import type { MapDef } from '../data/maps/prototype';
import { makeHighlands } from '../data/maps/highlands';
import { Rng } from '../lib/random';
import { TerrainMap, WALL_TAN } from '../world/terrainMap';
import { PlayerReach } from '../systems/reach';
import type { ElementResult } from '../systems/elementResult';
import { FlowField } from '../systems/flowField';
import { Enemies, kindIndex } from '../systems/enemies';
import { Projectiles } from '../systems/projectiles';
import { Orbs } from '../systems/orbs';
import { HitFeed } from '../systems/hitFeed';
import { Stats, armorMult } from '../systems/stats';
import { CardDealer, cardById, slotsUsed, type CardOffer } from '../systems/cards';
import { StageDirector } from '../systems/stageDirector';
import { Elements, type ElementCarry } from '../systems/elements';
import { computeMerit } from '../systems/merit';
import { SYNERGIES, synergyTierOf } from '../data/synergies';
import { ULT, ULT_RECIPES, ULT_CARD_PREFIX, isUltCard, ultOfCard, recipeDone, type UltEffect } from '../data/ultimates';
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
  readonly orbs: Orbs;
  readonly feed = new HitFeed();
  readonly stats: Stats;
  readonly dealer: CardDealer;
  private readonly rngCombat: Rng;
  private readonly rngCards: Rng;
  private readonly rngSpawn: Rng;
  private readonly rngElements: Rng;
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
  pierceBonus = 0;
  /** 主武器升級帶來的：基礎傷害加值、冷卻倍率（< 1 = 變快） */
  weaponDamageBonus = 0;
  cooldownMult = 1;
  /** 招式變化（主武器 VARIANT_LEVEL 級時三選一，整局固定）；null = 還沒選 */
  variant: VariantDef | null = null;
  private variantPending = false;
  private resumeKind: 'levelup' | 'offering' | 'chest' = 'levelup';
  /** 燈籠環：繞身鬼火的角度與下次判定倒數 */
  orbitAngle = 0;
  private orbitTimer = 0;
  /** 業火：燃燒地（固定數量的池；外觀直接讀） */
  readonly zoneX = new Float32Array(32);
  readonly zoneZ = new Float32Array(32);
  readonly zoneR = new Float32Array(32);
  readonly zoneLife = new Float32Array(32);
  readonly zoneMaxLife = new Float32Array(32);
  private readonly zoneDmg = new Float32Array(32);
  private readonly zoneTick = new Float32Array(32);
  private zoneNext = 0;
  /** 主武器的道具 id（鬼火） */
  get weaponItemId(): string {
    return this.yokai.weapon.id;
  }
  /** 主武器目前幾級 */
  get weaponLevel(): number {
    return this.cardCounts.get(this.weaponItemId) ?? 1;
  }
  /** 拿過的卡 id、已觸發的聯動（D28）與目前的段數（D37：1 = 初、2 = 極），與聯動帶來的加成 */
  readonly ownedCards = new Set<string>();
  readonly activeSynergies: string[] = [];
  readonly synergyTiers = new Map<string, number>();
  readonly syn = { splashRatio: 0, splashMult: 1, pierce: 0, volley: 0, auraMult: 1 };
  /** 最近一次聯動觸發或升段的時間（模擬累計秒）、id 與段數，HUD 顯示提示用 */
  lastSynergy: { id: string; tier: number; at: number } | null = null;
  /** 神籤的功德獎勵累計、最近一次神籤結果（HUD 提示用） */
  bonusMerit = 0;
  lastOmikuji: { id: string; at: number } | null = null;
  /** 目前這個選卡面板的來源：升級／賽錢箱／寶箱；賽錢箱、寶箱的剩餘選卡次數與稀有度 */
  offerKind: 'levelup' | 'offering' | 'chest' | 'variant' = 'levelup';
  private bonusLeft = 0;
  private bonusRarity: import('../data/rarity').Rarity = 'rare';
  /** 法具等級（id → 等級；大招配方用的「張數」就是等級）、已融合的大招、大招量表（0～ULT.max）、最近一次發動（給外觀用） */
  readonly cardCounts = new Map<string, number>();
  readonly fused: string[] = [];
  ultCharge = 0;
  lastFuse: { id: string; at: number } | null = null;
  /** 配方湊齊、等著開寶箱融合的大招（D30 第二步：進化式）；lastReady 給 HUD 提示用 */
  private readonly readyNotified: string[] = [];
  lastReady: { id: string; at: number } | null = null;
  /** 這一關的召喚祭壇放了沒（D34） */
  private summonPlaced = false;
  lastCast: { ids: string[]; at: number; x: number; z: number; dx: number; dz: number } | null = null;
  /** 狂亂（暫時強化）與護罩結束的時間（clock）、狂亂額外鬼火 */
  private frenzyUntil = 0;
  private frenzyVolley = 0;
  shieldUntil = 0;
  private ultNear = new Int32Array(0);
  /** 這一局累計的模擬秒數（跨關） */
  clock = 0;
  private fireCd = 0;
  private readonly near = new Int32Array(COMBAT.queryMax);
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
    this.projectiles = new Projectiles(300);
    this.orbs = new Orbs(PROGRESSION.maxOrbs);
    this.stats = new Stats(this.yokai.base);
    this.rngCombat = new Rng(subSeed(this.seed, 1));
    this.rngCards = new Rng(subSeed(this.seed, 2));
    this.rngSpawn = new Rng(subSeed(this.seed, 3));
    this.rngElements = new Rng(subSeed(this.seed, 4));
    this.dealer = new CardDealer(this.rngCards, ITEM_POOL, RARITIES_UNLOCKED_M1);
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
    this.orbs.reset();
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
    this.elements.start(this.px, this.pz, this.director.duration, this.director.virtualWave(), this.stats.value.luck);
    this.fireCd = 0.3;
    this.bus.emit('stageStart', { stage: this.stageNumber });
  }

  /** 過關畫面 → 下一關（外面的狀態機在 INTERMISSION 按「出發」時呼叫） */
  continueFromIntermission(): void {
    if (this.phase !== 'intermission') return;
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
    this.ultCharge = Math.min(ULT.max, this.ultCharge + ULT.perSecond * dt);
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
    this.enemies.update(dt, this.px, this.pz, this.flow, aura.radius * s.area * this.syn.auraMult, aura.slow);
    this.contactDamage();
    this.weapon(dt);
    if (this.variant?.type === 'orbit') this.orbitStep(dt);
    this.zonesStep(dt);
    this.projectiles.update(dt, this.yokai.weapon, this.enemies, s.area, this.onProjectileHit);
    const gained = this.orbs.update(dt, this.px, this.pz, s.pickup);
    if (gained > 0) this.addXp(gained);

    this.elements.update(dt, this.time, this.director.duration, this.director.virtualWave(), s.luck, this.px, this.py, this.pz);
    if (!this.summonPlaced && this.summonStage && !this.director.bossSpawned && this.time >= STAGE.summon.appearAt * this.director.duration) {
      if (this.elements.placeSummon(this.px, this.pz)) {
        this.summonPlaced = true;
        this.bus.emit('summonAltar', { stage: this.stageNumber });
      }
    }
    this.director.extraMult = this.elements.spawnMult * (1 + this.curse.spawnRate) * (1 + this.difficulty * DIFFICULTY.spawn);
    this.director.hpCurse = 1 + this.curse.enemyHp;
    this.enemies.speedMult = 1 + this.curse.enemySpeed;
    this.director.update(dt, this.px, this.pz, this.night, this.bossDefeated);

    if (this.hp <= 0 && !this.god) {
      this.dead = true;
      this.deathTimer = COMBAT.deathDelay;
      return;
    }
    if (this.portal.active && this.portalReached()) this.clearStage();
  }

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
      if (this.invul > 0 || this.god) continue;
      e.contactCd[i] = COMBAT.contactCooldown;
      if (this.rngCombat.next() < this.stats.value.dodge) continue;
      const dmg = e.damage[i] * (1 + this.curse.enemyDamage) * (1 + this.difficulty * DIFFICULTY.damage) * armorMult(this.stats.value.armor);
      this.hp -= dmg;
      this.invul = COMBAT.invulnerable;
      this.bus.emit('playerHurt', { damage: dmg, hp: this.hp });
      break;
    }
  }

  private weapon(dt: number): void {
    const w = this.yokai.weapon;
    const s = this.stats.value;
    if (this.variant?.type === 'orbit') return; // 燈籠環：不發射，改由 orbitStep 繞身攻擊
    const burn = this.variant?.burn;
    this.fireCd -= dt;
    if (this.fireCd > 0) return;
    const target = this.enemies.nearest(this.px, this.pz, w.range * s.area);
    if (target < 0) {
      this.fireCd = 0;
      return;
    }
    this.fireCd += (w.interval * this.cooldownMult * (burn ? burn.interval : 1)) / s.atkSpeed;
    const dx = this.enemies.x[target] - this.px;
    const dz = this.enemies.z[target] - this.pz;
    const d = Math.hypot(dx, dz) || 1;
    const volleyExact = this.volleyExact;
    // 小數的部分 = 機率多一顆（卡片的數值是小數，這樣每張卡的價值才能細調）
    const volley = Math.floor(volleyExact) + (this.rngCombat.next() < volleyExact - Math.floor(volleyExact) ? 1 : 0);
    for (let v = 0; v < volley; v++) {
      const crit = this.rngCombat.next() < s.crit;
      const dmg = this.baseShotDamage(crit) * (burn ? burn.shotDamage : 1);
      const spread = (v - (volley - 1) / 2) * 0.18;
      const c = Math.cos(spread);
      const sn = Math.sin(spread);
      const ux = dx / d;
      const uz = dz / d;
      this.projectiles.spawn(this.px, this.pz, ux * c - uz * sn, ux * sn + uz * c, w, dmg, crit, target, this.rollPierce());
    }
  }

  /** 每顆鬼火的穿透次數：小數 = 機率多穿一隻 */
  private rollPierce(): number {
    const p = this.pierceBonus + this.syn.pierce;
    const base = Math.floor(p);
    return base + (this.rngCombat.next() < p - base ? 1 : 0);
  }

  /** 固定的方法參照：投射物命中時結算傷害（不在迴圈裡建函式） */
  private readonly onProjectileHit = (e: number, p: number): void => {
    const pr = this.projectiles;
    const w = this.yokai.weapon;
    const vl = Math.hypot(pr.vx[p], pr.vz[p]) || 1;
    const dmg = pr.damage[p];
    this.feed.push(this.enemies.x[e], this.enemies.z[e], dmg, pr.crit[p] === 1);
    // 頭目不被擊退
    const knock = this.enemies.variant[e] === 2 ? 0 : w.knockback;
    const hx = this.enemies.x[e];
    const hz = this.enemies.z[e];
    const parent = pr.gen[p] === 0;
    if (this.enemies.hurt(e, dmg, pr.vx[p] / vl, pr.vz[p] / vl, knock)) this.onKill(e);
    // 招式變化：業火在命中處留下燃燒地；狐火分裂朝其他敵人分裂（小火不會再分裂）
    const v = this.variant;
    if (v?.burn && parent) this.addZone(hx, hz, dmg * v.burn.damage);
    if (v?.split && parent) this.splitFromPos(hx, hz, e, dmg);
    const splashR = ((tuning.splash > 0 ? tuning.splash : w.splashRadius) + this.splashBonus) * this.syn.splashMult;
    if (splashR > 0) {
      const n = this.enemies.within(hx, hz, splashR * this.stats.value.area, this.splashNear);
      const sd = dmg * ((w.splashRatio > 0 ? w.splashRatio : 0.6) + this.syn.splashRatio);
      for (let k = 0; k < n; k++) {
        const o = this.splashNear[k];
        if (o === e || !this.enemies.alive[o]) continue;
        if (this.enemies.hurt(o, sd, 0, 0, 0)) this.onKill(o);
      }
    }
  };

  private onKill(e: number): void {
    this.kills++;
    this.ultCharge = Math.min(ULT.max, this.ultCharge + (this.enemies.variant[e] === 2 ? ULT.perBoss : this.enemies.variant[e] === 1 ? ULT.perElite : ULT.perKill));
    const value = this.enemies.points(e) * PROGRESSION.orbPerPoint;
    const x = this.enemies.x[e];
    const z = this.enemies.z[e];
    const isBoss = this.enemies.variant[e] === 2;
    const isElite = this.enemies.variant[e] === 1;
    if (!this.orbs.spawn(x, z, value)) this.addXp(value);
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
    } else if (isElite && this.rngCombat.next() < STAGE.drops.eliteChestChance) {
      this.reachableNear(x, z);
      this.elements.dropChest(this.spot[0], this.spot[1], STAGE.drops.eliteChest);
    }
  }

  private readonly spot = new Float32Array(2);
  private reach: PlayerReach | null = null;
  private reachMap: TerrainMap | null = null;
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
    this.offer = this.dealer.deal(this.level, this.stats.value.luck, this.cardCounts);
  }

  /** 玩家選了第 index 張卡。回傳是否還有下一次待選（UI 繼續開著面板） */
  /** 賽錢箱、寶箱：開三選一面板（模擬暫停，沿用升級選卡的同一個面板，D15），連選 picks 次 */
  private openBonusPick(rarity: import('../data/rarity').Rarity, picks: number, kind: 'offering' | 'chest'): void {
    if (this.offer !== null) return;
    this.bonusLeft = picks;
    this.bonusRarity = rarity;
    this.offerKind = kind;
    this.offer = this.dealBonus();
    this.bus.emit('levelUp', { level: this.level, pending: this.bonusLeft });
  }

  /** 賽錢箱／寶箱的三張卡；寶箱且有湊齊的配方時，融合卡排在最前面（D30 第二步） */
  private dealBonus(): CardOffer[] {
    const cards = this.dealer.dealRarity(this.bonusRarity, this.cardCounts);
    if (this.offerKind !== 'chest') return cards;
    const ult = this.fusable.slice(0, cards.length).map((id) => ({ cardId: ULT_CARD_PREFIX + id, rarity: 'legend' as const }));
    return [...ult, ...cards.slice(0, Math.max(0, cards.length - ult.length))];
  }

  /** 配方湊齊、還沒融合的大招（這隻妖怪的） */
  get fusable(): string[] {
    return ULT_RECIPES.filter((rc) => rc.yokai === this.yokai.id && !this.fused.includes(rc.id) && recipeDone(rc, this.cardCounts)).map((rc) => rc.id);
  }

  private fuse(id: string): void {
    if (this.fused.includes(id)) return;
    this.fused.push(id);
    this.lastFuse = { id, at: this.clock };
    this.bus.emit('fusion', { id });
  }

  /** 面板上「還有幾次」：賽錢箱／寶箱看剩下的連選次數，升級看待選的升級數 */
  get picksLeft(): number {
    if (this.offerKind === 'variant') return 1;
    return this.offerKind === 'levelup' ? this.pendingPicks : this.bonusLeft;
  }

  chooseCard(index: number): boolean {
    if (!this.offer || index < 0 || index >= this.offer.length) return this.offer !== null;
    const o = this.offer[index];
    if (this.offerKind === 'variant') {
      this.variant = variantOfCard(o.cardId);
      this.variantPending = false;
      this.bus.emit('cardChosen', { cardId: o.cardId, rarity: o.rarity });
      this.offerKind = this.resumeKind;
      return this.continueOffers();
    }
    if (isUltCard(o.cardId)) {
      this.fuse(ultOfCard(o.cardId).id);
      this.bus.emit('cardChosen', { cardId: o.cardId, rarity: o.rarity });
      this.bonusLeft--;
      return this.continueOffers();
    }
    this.applyCard(o);
    this.bus.emit('cardChosen', { cardId: o.cardId, rarity: o.rarity });
    if (this.offerKind !== 'levelup') this.bonusLeft--;
    else this.pendingPicks--;
    if (this.variantPending) {
      this.resumeKind = this.offerKind;
      this.openVariantOffer();
      return true;
    }
    return this.continueOffers();
  }

  /** 主武器到了變化等級：三選一（同一個面板） */
  private openVariantOffer(): void {
    this.offer = variantsFor(this.weaponItemId).map((v) => ({ cardId: VARIANT_CARD_PREFIX + v.id, rarity: 'common' as const }));
    this.offerKind = 'variant';
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


  /** 套用一張卡（法具升一級；D30） */
  private applyCard(o: CardOffer): void {
    const d = cardById(o.cardId);
    this.picked.push(o);
    if (d.kind === 'fallback') {
      if (d.id === 'heal') this.hp = Math.min(this.maxHp, this.hp + this.maxHp * (d.perLevel ?? 0) / 100);
      else this.bonusMerit += d.perLevel ?? 0;
      return;
    }
    const lv = this.cardCounts.get(d.id) ?? 0;
    if (lv >= d.maxLevel) return;
    this.ownedCards.add(d.id);
    this.cardCounts.set(d.id, lv + 1);
    if (d.kind === 'weapon') {
      if (lv + 1 === VARIANT_LEVEL && !this.variant && variantsFor(d.id).length > 0) this.variantPending = true;
      const step = WEAPON_LEVELS[d.id]?.[lv - 1];
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
      else this.splashBonus += v;
    } else if (d.stat) {
      const before = this.maxHp;
      this.stats.addCard(d.stat, itemValue(d, o.rarity));
      if (d.down) this.stats.addCard(d.down.stat, -itemDown(d, o.rarity));
      // 最大生命增加時，現有生命同步增加（不會「變成扣血」）
      if (this.maxHp > before) this.hp += this.maxHp - before;
      this.hp = Math.min(this.hp, this.maxHp);
    }
    this.checkSynergies();
    this.checkFusion();
  }

  /** 拿到卡之後檢查聯動（D37）：兩件道具都練到門檻 → 觸發「初」；再練到「極」→ 升段。只補這一段和上一段的差額 */
  private checkSynergies(): void {
    for (const sy of SYNERGIES) {
      const before = this.synergyTiers.get(sy.id) ?? 0;
      const now = synergyTierOf(sy, this.cardCounts);
      if (now <= before) continue;
      const prev = before > 0 ? sy.tiers[before - 1].effect : {};
      const e = sy.tiers[now - 1].effect;
      this.syn.splashRatio += (e.splashRatio ?? 0) - (prev.splashRatio ?? 0);
      this.syn.splashMult *= (e.splashMult ?? 1) / (prev.splashMult ?? 1);
      this.syn.pierce += (e.pierce ?? 0) - (prev.pierce ?? 0);
      this.syn.volley += (e.volley ?? 0) - (prev.volley ?? 0);
      this.syn.auraMult *= (e.auraMult ?? 1) / (prev.auraMult ?? 1);
      this.synergyTiers.set(sy.id, now);
      if (before === 0) this.activeSynergies.push(sy.id);
      this.lastSynergy = { id: sy.id, tier: now, at: this.clock };
      this.bus.emit('synergy', { id: sy.id, tier: now });
    }
  }

  /** 拿到卡之後檢查大招配方：湊齊了就提示「開寶箱融合」（進化式，D30 第二步；不再自動融合） */
  private checkFusion(): void {
    for (const id of this.fusable) {
      if (this.readyNotified.includes(id)) continue;
      this.readyNotified.push(id);
      this.lastReady = { id, at: this.clock };
      this.bus.emit('fusionReady', { id });
    }
  }

  get ultReady(): boolean {
    return this.fused.length > 0 && this.ultCharge >= ULT.max;
  }

  /** 玩家按大招：量表滿、有融合過的大招才會發動；全部已融合的大招一起發動，量表歸零 */
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
    for (const id of this.fused) this.applyUltEffect(ULT_RECIPES.find((x) => x.id === id)!.effect, dx, dz);
    this.lastCast = { ids: [...this.fused], at: this.clock, x: this.px, z: this.pz, dx, dz };
    this.ultCharge = 0;
    this.bus.emit('ultimate', { ids: [...this.fused] });
    return true;
  }

  private ultDamage(e: UltEffect & { damageMult: number }): number {
    return (this.yokai.weapon.damage + this.weaponDamageBonus) * this.stats.value.power * tuning.damageScale * e.damageMult;
  }

  private applyUltEffect(e: UltEffect, dx: number, dz: number): void {
    const s = this.stats.value;
    if (e.type === 'frenzy') {
      this.stats.setMod('ult:frenzy', { pct: { power: e.power, atkSpeed: e.atkSpeed } });
      this.frenzyUntil = this.clock + e.seconds;
      this.frenzyVolley = e.volley;
      return;
    }
    if (e.type === 'bulwark') {
      this.invul = Math.max(this.invul, e.seconds);
      this.shieldUntil = this.clock + e.seconds;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * e.healFrac);
    }
    const dmg = e.type === 'beam' || e.type === 'nova' || e.type === 'bulwark' ? this.ultDamage(e) : 0;
    const en = this.enemies;
    if (e.type === 'beam') {
      // 沿射線、寬度內的所有敵人（先用範圍查詢取候選，再用到射線的距離篩）
      const cx = this.px + dx * (e.length / 2);
      const cz = this.pz + dz * (e.length / 2);
      const k = en.within(cx, cz, e.length / 2 + e.width, this.ultNear);
      for (let i = 0; i < k; i++) {
        const o = this.ultNear[i];
        if (!en.alive[o]) continue;
        const rx = en.x[o] - this.px;
        const rz = en.z[o] - this.pz;
        const along = rx * dx + rz * dz;
        const across = Math.abs(rx * -dz + rz * dx);
        if (along < 0 || along > e.length || across > e.width / 2 + en.radius(o)) continue;
        this.feed.push(en.x[o], en.z[o], dmg, false);
        if (en.hurt(o, dmg, dx, dz, 0)) this.onKill(o);
      }
      return;
    }
    const radius = e.radius * s.area;
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

  /** 開發與測試：大招量表直接充滿 */
  devChargeUlt(): void {
    this.ultCharge = ULT.max;
  }

  /** 測試與開發介面：直接給一張卡（不經選卡） */
  give(cardId: string, rarity: keyof typeof RARITY_MULT): void {
    this.applyCard({ cardId, rarity });
    // 主武器到了變化等級：開三選一面板（和真的升級一樣）
    if (this.variantPending && this.offer === null && this.phase === 'combat') {
      this.resumeKind = 'levelup';
      this.openVariantOffer();
      this.bus.emit('levelUp', { level: this.level, pending: 1 });
    }
  }

  /** 開發與測試：直接設定招式變化（不經面板） */
  devSetVariant(id: string): void {
    this.variant = variantOfCard(VARIANT_CARD_PREFIX + id);
    this.variantPending = false;
  }

  /** 主武器滿級了嗎（變化的 atMax 加強） */
  get weaponMaxed(): boolean {
    return this.weaponLevel >= itemById(this.weaponItemId).maxLevel;
  }

  /** 現在一次發射幾顆（含小數：小數 = 機率多一顆） */
  get volleyExact(): number {
    const w = this.yokai.weapon;
    return (tuning.volley > 0 ? tuning.volley : w.volley) + this.volleyBonus + this.syn.volley + this.frenzyVolley;
  }

  /** 燈籠環：繞身鬼火幾顆、半徑（公尺） */
  get orbitCount(): number {
    const o = this.variant?.orbit;
    if (!o) return 0;
    return Math.max(1, Math.floor(this.volleyExact) + o.baseOrbs + (this.weaponMaxed ? o.atMaxOrbs : 0));
  }
  get orbitRadius(): number {
    const o = this.variant?.orbit;
    if (!o) return 0;
    return o.radius * this.stats.value.area * (this.weaponMaxed ? o.atMaxRadius : 1);
  }

  private baseShotDamage(crit: boolean): number {
    const s = this.stats.value;
    return (this.yokai.weapon.damage + this.weaponDamageBonus) * s.power * tuning.damageScale * (crit ? s.critDmg : 1);
  }

  /** 燈籠環：轉動並每隔一段時間判定碰到的敵人 */
  private orbitStep(dt: number): void {
    const o = this.variant!.orbit!;
    const s = this.stats.value;
    this.orbitAngle = (this.orbitAngle + o.spin * dt) % (Math.PI * 2);
    this.orbitTimer -= dt;
    if (this.orbitTimer > 0) return;
    this.orbitTimer += (o.tick * this.cooldownMult) / s.atkSpeed;
    const n = this.orbitCount;
    const R = this.orbitRadius;
    const en = this.enemies;
    for (let k = 0; k < n; k++) {
      const a = this.orbitAngle + (k / n) * Math.PI * 2;
      const ox = this.px + Math.cos(a) * R;
      const oz = this.pz + Math.sin(a) * R;
      const m = en.within(ox, oz, o.hitRadius + 0.5, this.near);
      for (let j = 0; j < m; j++) {
        const e = this.near[j];
        if (!en.alive[e]) continue;
        const dx = en.x[e] - ox;
        const dz = en.z[e] - oz;
        const rr = o.hitRadius + en.radius(e);
        if (dx * dx + dz * dz > rr * rr) continue;
        const crit = this.rngCombat.next() < s.crit;
        const dmg = this.baseShotDamage(crit) * o.damage;
        this.feed.push(en.x[e], en.z[e], dmg, crit);
        const ex = en.x[e] - this.px;
        const ez = en.z[e] - this.pz;
        const d = Math.hypot(ex, ez) || 1;
        if (en.hurt(e, dmg, ex / d, ez / d, en.variant[e] === 2 ? 0 : o.knockback)) this.onKill(e);
      }
    }
  }

  /** 業火：在 (x,z) 留下一塊燃燒地（池滿了就蓋掉最舊的） */
  private addZone(x: number, z: number, tickDamage: number): void {
    const b = this.variant!.burn!;
    const i = this.zoneNext;
    this.zoneNext = (this.zoneNext + 1) % Math.min(b.maxZones, this.zoneX.length);
    this.zoneX[i] = x;
    this.zoneZ[i] = z;
    this.zoneR[i] = b.radius * this.stats.value.area * (this.weaponMaxed ? b.atMaxScale : 1);
    this.zoneLife[i] = b.seconds;
    this.zoneMaxLife[i] = b.seconds;
    this.zoneDmg[i] = tickDamage;
    this.zoneTick[i] = 0;
  }

  get zoneCount(): number {
    let n = 0;
    for (let i = 0; i < this.zoneLife.length; i++) if (this.zoneLife[i] > 0) n++;
    return n;
  }

  private zonesStep(dt: number): void {
    const b = this.variant?.burn;
    if (!b) return;
    const en = this.enemies;
    for (let i = 0; i < this.zoneLife.length; i++) {
      if (this.zoneLife[i] <= 0) continue;
      this.zoneLife[i] -= dt;
      this.zoneTick[i] -= dt;
      if (this.zoneTick[i] > 0) continue;
      this.zoneTick[i] += b.tick;
      const m = en.within(this.zoneX[i], this.zoneZ[i], this.zoneR[i], this.near);
      for (let j = 0; j < m; j++) {
        const e = this.near[j];
        if (!en.alive[e]) continue;
        this.feed.push(en.x[e], en.z[e], this.zoneDmg[i], false);
        if (en.hurt(e, this.zoneDmg[i], 0, 0, 0)) this.onKill(e);
      }
    }
  }

  /** 狐火分裂：從命中處朝其他敵人分裂出小火 */
  private splitFromPos(x: number, z: number, e: number, dmg: number): void {
    const sp = this.variant!.split!;
    const en = this.enemies;
    const want = this.weaponMaxed ? sp.atMaxChildren : sp.children;
    const m = en.within(x, z, sp.range, this.splitNear);
    const w = this.yokai.weapon;
    let made = 0;
    let lastPick = -1;
    while (made < want) {
      // 找還沒選過的最近敵人（n 很小，重複掃描即可，不配置記憶體）
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
      if (best < 0) break;
      const t = this.splitNear[best];
      this.splitNear[best] = -1;
      const d = Math.sqrt(bd) || 1;
      const ci = this.projectiles.spawn(x, z, (en.x[t] - x) / d, (en.z[t] - z) / d, w, dmg * sp.damage, false, t, 0, 1);
      // 小火從被打中的那隻身上出發：不要馬上又打回同一隻
      if (ci >= 0) this.projectiles.lastHit[ci] = e;
      made++;
      lastPick = t;
    }
    void lastPick;
  }

  // ── 過關與結束 ───────────────────────────────────────────────
  private clearStage(): void {
    // 沒打完的人類撤退（不給魂火）、投射物消失；場上的魂火全部收進來
    this.enemies.reset();
    this.projectiles.reset();
    let rest = 0;
    for (let i = 0; i < this.orbs.high; i++) if (this.orbs.alive[i]) rest += this.orbs.value[i];
    this.orbs.reset();
    this.director.active = false;
    this.portal.active = false;
    this.elements.endStage();
    this.zoneLife.fill(0);
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
