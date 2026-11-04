import { bus as defaultBus, type EventBus } from '../core/bus';
import { COMBAT } from '../data/combat';
import { MOVE } from '../data/movement';
import { PLAYABLE_YOKAI, YOKAI, type YokaiDef } from '../data/yokai';
import { PROGRESSION, CARD_POOL_M1, RARITIES_UNLOCKED_M1, xpNeed } from '../data/progression';
import { RARITY_MULT } from '../data/rarity';
import { STAGE, stagesForMap, bossHpMult } from '../data/stage';
import { WAVES } from '../data/waves';
import { tuning } from '../data/tuning';
import type { MapDef } from '../data/maps/prototype';
import { makeHighlands } from '../data/maps/highlands';
import { Rng } from '../lib/random';
import { TerrainMap, WALL_TAN } from '../world/terrainMap';
import { FlowField } from '../systems/flowField';
import { Enemies, kindIndex } from '../systems/enemies';
import { Projectiles } from '../systems/projectiles';
import { Orbs } from '../systems/orbs';
import { HitFeed } from '../systems/hitFeed';
import { Stats, armorMult } from '../systems/stats';
import { CardDealer, cardById, type CardOffer } from '../systems/cards';
import { StageDirector } from '../systems/stageDirector';
import { computeMerit } from '../systems/merit';
import type { StatId } from '../data/stats';

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
  readonly projectiles: Projectiles;
  readonly orbs: Orbs;
  readonly feed = new HitFeed();
  readonly stats: Stats;
  readonly dealer: CardDealer;
  private readonly rngCombat: Rng;
  private readonly rngCards: Rng;
  private readonly rngSpawn: Rng;
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
  private fireCd = 0;
  private readonly near = new Int32Array(COMBAT.queryMax);
  private readonly splashNear = new Int32Array(COMBAT.queryMax);

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
    this.dealer = new CardDealer(this.rngCards, CARD_POOL_M1, RARITIES_UNLOCKED_M1);
    this.hp = this.stats.value.maxHp;
    this.startNextStage();
  }

  get awaitingPick(): boolean {
    return this.offer !== null;
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

  startNextStage(): void {
    if (this.phase === 'ended') return;
    this.stageIndex++;
    this.phase = 'combat';
    this.time = 0;
    this.bossDefeated = false;
    this.portal.active = false;
    this.buildWorld();
    this.director.start(this.stageIndex, bossHpMult(this.mapNumber, this.stageIndex));
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
    if (this.phase !== 'combat' || this.awaitingPick) return;
    if (this.dead) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.finish('death');
      return;
    }
    this.time += dt;
    this.movePlayer(dt);
    const s = this.stats.value;
    this.hp = Math.min(this.maxHp, this.hp + s.regen * dt);
    if (this.invul > 0) this.invul -= dt;

    this.flow.update(this.px, this.pz);
    const aura = this.yokai.aura;
    this.enemies.update(dt, this.px, this.pz, this.flow, aura.radius * s.area, aura.slow);
    this.contactDamage();
    this.weapon(dt);
    this.projectiles.update(dt, this.yokai.weapon, this.enemies, s.area, this.onProjectileHit);
    const gained = this.orbs.update(dt, this.px, this.pz, s.pickup);
    if (gained > 0) this.addXp(gained);

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
      const dmg = e.damage[i] * armorMult(this.stats.value.armor);
      this.hp -= dmg;
      this.invul = COMBAT.invulnerable;
      this.bus.emit('playerHurt', { damage: dmg, hp: this.hp });
      break;
    }
  }

  private weapon(dt: number): void {
    const w = this.yokai.weapon;
    const s = this.stats.value;
    this.fireCd -= dt;
    if (this.fireCd > 0) return;
    const target = this.enemies.nearest(this.px, this.pz, w.range * s.area);
    if (target < 0) {
      this.fireCd = 0;
      return;
    }
    this.fireCd += w.interval / s.atkSpeed;
    const dx = this.enemies.x[target] - this.px;
    const dz = this.enemies.z[target] - this.pz;
    const d = Math.hypot(dx, dz) || 1;
    const volley = tuning.volley > 0 ? tuning.volley : w.volley;
    for (let v = 0; v < volley; v++) {
      const crit = this.rngCombat.next() < s.crit;
      const dmg = w.damage * s.power * tuning.damageScale * (crit ? s.critDmg : 1);
      const spread = (v - (volley - 1) / 2) * 0.18;
      const c = Math.cos(spread);
      const sn = Math.sin(spread);
      const ux = dx / d;
      const uz = dz / d;
      this.projectiles.spawn(this.px, this.pz, ux * c - uz * sn, ux * sn + uz * c, w, dmg, crit, target);
    }
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
    if (this.enemies.hurt(e, dmg, pr.vx[p] / vl, pr.vz[p] / vl, knock)) this.onKill(e);
    const splashR = tuning.splash > 0 ? tuning.splash : w.splashRadius;
    if (splashR > 0) {
      const n = this.enemies.within(this.enemies.x[e], this.enemies.z[e], splashR * this.stats.value.area, this.splashNear);
      const sd = dmg * (w.splashRatio > 0 ? w.splashRatio : 0.6);
      for (let k = 0; k < n; k++) {
        const o = this.splashNear[k];
        if (o === e || !this.enemies.alive[o]) continue;
        if (this.enemies.hurt(o, sd, 0, 0, 0)) this.onKill(o);
      }
    }
  };

  private onKill(e: number): void {
    this.kills++;
    const value = this.enemies.points(e) * PROGRESSION.orbPerPoint;
    const x = this.enemies.x[e];
    const z = this.enemies.z[e];
    const isBoss = this.enemies.variant[e] === 2;
    if (!this.orbs.spawn(x, z, value)) this.addXp(value);
    this.enemies.kill(e);
    if (isBoss) this.openPortal(x, z);
  }

  private openPortal(x: number, z: number): void {
    this.bossDefeated = true;
    this.bossesDefeated++;
    // 頭目倒在擋路格（深水、岩石）時，改開在離玩家近的地方
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
    this.offer = this.dealer.deal(this.level, this.stats.value.luck);
  }

  /** 玩家選了第 index 張卡。回傳是否還有下一次待選（UI 繼續開著面板） */
  chooseCard(index: number): boolean {
    if (!this.offer || index < 0 || index >= this.offer.length) return this.offer !== null;
    const o = this.offer[index];
    this.applyCard(o);
    this.pendingPicks--;
    this.bus.emit('cardChosen', { cardId: o.cardId, rarity: o.rarity });
    if (this.pendingPicks > 0) {
      this.makeOffer();
      return true;
    }
    this.offer = null;
    return false;
  }

  private applyCard(o: CardOffer): void {
    const card = cardById(o.cardId);
    const before = this.maxHp;
    this.stats.addCard(card.stat as StatId, card.values[o.rarity]);
    // 最大生命增加時，現有生命同步增加（不會「變成扣血」）
    if (this.maxHp > before) this.hp += this.maxHp - before;
    this.hp = Math.min(this.hp, this.maxHp);
    this.picked.push(o);
  }

  /** 測試與開發介面：直接給一張卡（不經選卡） */
  give(cardId: string, rarity: keyof typeof RARITY_MULT): void {
    this.applyCard({ cardId, rarity });
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
    this.finish('abandon');
  }

  finish(result: 'death' | 'victory' | 'abandon'): void {
    if (this.phase === 'ended') return;
    const wasPhase = this.phase;
    this.phase = 'ended';
    // 通過的關卡數：勝利 = 全部；其餘 = 已走進傳送門的關（在過關畫面放棄算已通過目前這關）
    const cleared = result === 'victory' ? this.stageNumber : wasPhase === 'intermission' ? this.stageNumber : this.stageIndex;
    const merit = computeMerit({
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
