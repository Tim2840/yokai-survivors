import { bus as defaultBus, type EventBus } from '../core/bus';
import { COMBAT } from '../data/combat';
import { PLAYABLE_YOKAI, YOKAI, type YokaiDef } from '../data/yokai';
import { PROGRESSION, CARD_POOL_M1, RARITIES_UNLOCKED_M1, xpNeed } from '../data/progression';
import { RARITY_MULT } from '../data/rarity';
import { WAVES } from '../data/waves';
import { tuning } from '../data/tuning';
import { PROTOTYPE_MAP, type MapDef } from '../data/maps/prototype';
import { Rng } from '../lib/random';
import { TerrainMap } from '../world/terrainMap';
import { FlowField } from '../systems/flowField';
import { Enemies } from '../systems/enemies';
import { Projectiles } from '../systems/projectiles';
import { Orbs } from '../systems/orbs';
import { HitFeed } from '../systems/hitFeed';
import { Stats, armorMult } from '../systems/stats';
import { CardDealer, cardById, type CardOffer } from '../systems/cards';
import { WaveDirector } from '../systems/waves';
import { computeMerit } from '../systems/merit';
import type { StatId } from '../data/stats';

export interface RunOptions {
  seed: number;
  yokaiId?: string;
  night?: number;
  mobile?: boolean;
  map?: MapDef;
  bus?: EventBus;
  /** 之前通關過這張地圖嗎（功德 +200） */
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
 * 狀態機（BOOT/MENU/…）在外面，這裡只有 phase：combat（模擬中）、intermission（整備）、ended。
 * 升級選卡：升級當下 awaitingPick = true，step() 直接返回（模擬凍結），直到選完（D15）。
 */
export class Run {
  readonly seed: number;
  readonly night: number;
  readonly yokai: YokaiDef;
  readonly map: TerrainMap;
  readonly flow: FlowField;
  readonly enemies: Enemies;
  readonly projectiles: Projectiles;
  readonly orbs: Orbs;
  readonly feed = new HitFeed();
  readonly stats: Stats;
  readonly director: WaveDirector;
  readonly dealer: CardDealer;
  private readonly rngCombat: Rng;
  private readonly rngCards: Rng;
  private readonly bus: EventBus;
  private readonly opts: RunOptions;

  phase: RunPhase = 'combat';
  time = 0;
  wave = 0;
  // 玩家
  px: number;
  pz: number;
  /** 面向（弧度，atan2(x, z)） */
  facing = 0;
  /** 本步的移動速度（公尺/秒，給動畫用） */
  moveSpeed = 0;
  hp: number;
  invul = 0;
  god = false;
  dead = false;
  private deathTimer = 0;
  // 輸入（-1..1）
  private mx = 0;
  private mz = 0;
  // 成長
  level = 0;
  xp = 0;
  kills = 0;
  pendingPicks = 0;
  offer: CardOffer[] | null = null;
  /** 已選過的卡（記錄；測試與結算用） */
  readonly picked: CardOffer[] = [];
  private fireCd = 0;
  private readonly near = new Int32Array(COMBAT.queryMax);
  private readonly splashNear = new Int32Array(COMBAT.queryMax);

  constructor(opts: RunOptions) {
    this.opts = opts;
    this.bus = opts.bus ?? defaultBus;
    this.seed = opts.seed >>> 0;
    this.night = opts.night ?? 0;
    const id = opts.yokaiId ?? 'chochin-kozo';
    if (!PLAYABLE_YOKAI.includes(id)) throw new Error(`這隻妖怪還不能玩：${id}`);
    this.yokai = YOKAI[id];
    this.map = new TerrainMap(opts.map ?? PROTOTYPE_MAP);
    this.flow = new FlowField(this.map);
    const maxEnemies = opts.mobile ? WAVES.maxEnemiesMobile : WAVES.maxEnemiesDesktop;
    this.enemies = new Enemies(this.map, maxEnemies);
    this.projectiles = new Projectiles(300);
    this.orbs = new Orbs(PROGRESSION.maxOrbs);
    this.stats = new Stats(this.yokai.base);
    this.rngCombat = new Rng(subSeed(this.seed, 1));
    this.rngCards = new Rng(subSeed(this.seed, 2));
    this.dealer = new CardDealer(this.rngCards, CARD_POOL_M1, RARITIES_UNLOCKED_M1);
    this.director = new WaveDirector(new Rng(subSeed(this.seed, 3)), this.map, this.flow, this.enemies, maxEnemies);
    const start = this.map.def.playerStart;
    this.px = start.x;
    this.pz = start.z;
    this.hp = this.stats.value.maxHp;
    this.flow.update(this.px, this.pz, true);
    this.startNextWave();
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

  setMove(x: number, z: number): void {
    this.mx = x;
    this.mz = z;
  }

  startNextWave(): void {
    if (this.phase === 'ended') return;
    this.wave++;
    this.phase = 'combat';
    this.director.start(this.wave);
    this.fireCd = 0.3;
    this.bus.emit('waveStart', { wave: this.wave });
  }

  /** 開發與測試：直接跳到第 n 波（清掉場上的敵人、投射物、魂火）。n 從 1 起 */
  setWave(n: number): void {
    if (this.phase === 'ended') return;
    this.enemies.reset();
    this.projectiles.reset();
    this.orbs.reset();
    this.wave = Math.max(1, Math.min(WAVES.total, Math.floor(n))) - 1;
    this.startNextWave();
  }

  /** 整備→下一波（外面的狀態機在 INTERMISSION 按「出發」時呼叫） */
  continueFromIntermission(): void {
    if (this.phase !== 'intermission') return;
    this.startNextWave();
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

    this.director.update(dt, this.px, this.pz, this.night);

    if (this.hp <= 0 && !this.god) {
      this.dead = true;
      this.deathTimer = COMBAT.deathDelay;
      return;
    }
    if (this.director.finished) this.endWave();
  }

  private movePlayer(dt: number): void {
    const m = this.map;
    let mx = this.mx;
    let mz = this.mz;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    if (len < 1e-3) {
      this.moveSpeed = 0;
      return;
    }
    let spd = this.stats.value.speed * m.speedAt(this.px, this.pz);
    spd *= m.slopeMult(this.px, this.pz, this.px + mx, this.pz + mz);
    const step = Math.min(1, len) * spd * dt;
    const dirX = mx / Math.max(len, 1e-6);
    const dirZ = mz / Math.max(len, 1e-6);
    let nx = this.px + dirX * step;
    let nz = this.pz + dirZ * step;
    const r = COMBAT.playerRadius;
    nx = Math.min(m.maxX - r, Math.max(m.minX + r, nx));
    nz = Math.min(m.maxZ - r, Math.max(m.minZ + r, nz));
    if (m.isBlocked(nx, nz)) {
      if (!m.isBlocked(nx, this.pz)) nz = this.pz;
      else if (!m.isBlocked(this.px, nz)) nx = this.px;
      else {
        nx = this.px;
        nz = this.pz;
      }
    }
    this.moveSpeed = Math.hypot(nx - this.px, nz - this.pz) / dt;
    this.px = nx;
    this.pz = nz;
    this.facing = Math.atan2(dirX, dirZ);
  }

  private contactDamage(): void {
    const e = this.enemies;
    const n = e.within(this.px, this.pz, COMBAT.playerRadius + 1, this.near);
    for (let k = 0; k < n; k++) {
      const i = this.near[k];
      if (!e.alive[i] || e.contactCd[i] > 0) continue;
      const dx = e.x[i] - this.px;
      const dz = e.z[i] - this.pz;
      const r = COMBAT.playerRadius + e.radius(i);
      if (dx * dx + dz * dz > r * r) continue;
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
      // 多顆時左右散開一點
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
    if (this.enemies.hurt(e, dmg, pr.vx[p] / vl, pr.vz[p] / vl, w.knockback)) this.onKill(e);
    const splashR = tuning.splash > 0 ? tuning.splash : w.splashRadius;
    if (splashR > 0) {
      const n = this.enemies.within(this.enemies.x[e], this.enemies.z[e], splashR * this.stats.value.area, this.splashNear);
      const sd = dmg * (w.splashRatio > 0 ? w.splashRatio : 0.6);
      for (let k = 0; k < n; k++) {
        const o = this.splashNear[k];
        if (o === e || !this.enemies.alive[o]) continue;
        this.feed.push(this.enemies.x[o], this.enemies.z[o], sd, false);
        if (this.enemies.hurt(o, sd, 0, 0, 0)) this.onKill(o);
      }
    }
  };

  private onKill(e: number): void {
    this.kills++;
    const value = this.enemies.points(e) * PROGRESSION.orbPerPoint;
    if (!this.orbs.spawn(this.enemies.x[e], this.enemies.z[e], value)) this.addXp(value);
    this.enemies.kill(e);
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
    const card = cardById(o.cardId);
    const before = this.maxHp;
    this.stats.addCard(card.stat as StatId, card.values[o.rarity]);
    // 最大生命增加時，現有生命同步增加（不會「變成扣血」）
    if (this.maxHp > before) this.hp += this.maxHp - before;
    this.hp = Math.min(this.hp, this.maxHp);
    this.picked.push(o);
    this.pendingPicks--;
    this.bus.emit('cardChosen', { cardId: o.cardId, rarity: o.rarity });
    if (this.pendingPicks > 0) {
      this.makeOffer();
      return true;
    }
    this.offer = null;
    return false;
  }

  /** 測試與開發介面：直接給一張卡（不經選卡） */
  give(cardId: string, rarity: keyof typeof RARITY_MULT): void {
    const card = cardById(cardId);
    const before = this.maxHp;
    this.stats.addCard(card.stat as StatId, card.values[rarity]);
    if (this.maxHp > before) this.hp += this.maxHp - before;
    this.picked.push({ cardId, rarity });
  }

  // ── 波次與結束 ───────────────────────────────────────────────
  private endWave(): void {
    // 沒打完的人類撤退（不給魂火）、投射物消失；場上的魂火全部收進來
    this.enemies.reset();
    this.projectiles.reset();
    let rest = 0;
    for (let i = 0; i < this.orbs.high; i++) if (this.orbs.alive[i]) rest += this.orbs.value[i];
    this.orbs.reset();
    this.director.active = false;
    const last = this.wave >= WAVES.total;
    if (rest > 0) this.addXp(rest);
    if (last) {
      this.bus.emit('waveEnd', { wave: this.wave, last: true });
      this.finish('victory');
      return;
    }
    this.phase = 'intermission';
    this.bus.emit('waveEnd', { wave: this.wave, last: false });
  }

  /** 放棄這一局（整備或暫停選單）：局外獎勵照 50% 結算 */
  abandon(): void {
    if (this.phase === 'ended') return;
    this.offer = null;
    this.pendingPicks = 0;
    this.finish('abandon');
  }

  finish(result: 'death' | 'victory' | 'abandon'): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    const cleared = result === 'victory' ? this.wave : Math.max(0, this.wave - 1);
    const merit = computeMerit({
      wavesCleared: cleared,
      kills: this.kills,
      bossDefeated: false,
      firstClear: result === 'victory' && !this.opts.clearedBefore,
      meritStat: this.opts.meritStat ?? 0,
      night: this.night,
      abandoned: result === 'abandon',
    });
    this.meritEarned = merit;
    this.result = result;
    this.bus.emit('runEnd', { result, wave: this.wave, kills: this.kills, level: this.level, time: this.time, merit });
  }

  meritEarned = 0;
  result: 'death' | 'victory' | 'abandon' | null = null;
}
