import { STAGE } from '../data/stage';
import { ELITE_AFFIXES, AFFIX_IDS } from '../data/enemies';

const AFFIX_SUMMON = AFFIX_IDS.indexOf('summon') + 1;
import { WAVES, threat } from '../data/waves';
import { tuning } from '../data/tuning';
import type { Rng } from '../lib/random';
import type { TerrainMap } from '../world/terrainMap';
import type { Enemies } from './enemies';
import { kindIndex } from './enemies';
import type { FlowField } from './flowField';
import { recipeFor, type RecipeEntry } from '../data/spawnRecipes';

/**
 * 連續計時關卡的導演（D22，docs/02 第 8.1 節）：
 * - 湧出速率隨時間升高（用虛擬波數沿用 T(n)），持續累積「待生成的威脅點數」再一隻隻生出來；
 * - 定時事件：精英、小高潮（湧出速率加倍一段時間）、頭目；時間歸零而頭目還活著 → 最終蜂群；
 * - 生成位置：離玩家 spawnRingMin～Max 公尺、不在擋路格、走得到玩家（玩家被困在孤島時不看連通）。
 * 時間由 Run 餵進來（dt）；這裡不碰渲染與輸入。
 */
export class StageDirector {
  time = 0;
  active = false;
  /** 等著生成的點數 */
  pending = 0;
  /** 已觸發的事件數（STAGE.events 依序）與頭目是否已出現 */
  eventsFired = 0;
  bossSpawned = false;
  /** 外部的湧出倍率（結界圈內 ×1.25 等；每步由 Run 設） */
  extraMult = 1;
  /** 詛咒讓敵人 HP 變多的倍率（每步由 Run 設） */
  hpCurse = 1;
  /** 頭目 HP 倍率（大關最後一關加強，D26） */
  bossMult = 1;
  bossIndex = -1;
  /** 小高潮結束的時間（秒）；0 = 沒有進行中的 */
  surgeUntil = 0;
  surgeMult = 1;
  swarm = false;
  private nextSwarmElite = 0;
  private stageMult = 1;
  private kindVillager = kindIndex('villager');
  /** 這一關的出場配方（已換成種類索引）；每步依經過的時間挑一種 */
  private recipe: { kind: number; from: number; weight: number; cap: number }[] = [];
  /** 這一關的頭目種類（D95：每關各自的頭目；start 時由 Run 給） */
  kindBoss = kindIndex('taimasou');
  /** 待生成的精英數（因同畫面上限或找不到位置而延後） */
  private pendingElites = 0;
  private bossPending = false;
  private readonly spot = new Float32Array(2);

  constructor(
    private readonly rng: Rng,
    private readonly map: TerrainMap,
    private readonly flow: FlowField,
    private readonly enemies: Enemies,
    private readonly maxEnemies: number,
  ) {}

  /** 這一關的頭目是自動出現（大頭目那一關）還是要玩家去開召喚祭壇（D34） */
  autoBoss = true;
  /** 召喚越晚越強：召喚當下決定的倍率 */
  summonMult = 1;
  /** 山頂神社（E2）啟動後：這一關頭目生命倍率（沒啟動 = 1） */
  summitMult = 1;

  /** stage = 第幾關（0 起）；hpMult = 難度帶來的敵人生命倍率（含關卡）；bossMult = 大頭目倍率 */
  /** 這一關是第幾關（0 起；精英詞綴從第幾關開始用） */
  private stage = 0;
  start(stage: number, bossMult = 1, opts: { autoBoss?: boolean; hpMult?: number; bossKind?: number } = {}): void {
    this.stage = stage;
    if (opts.bossKind !== undefined) this.kindBoss = opts.bossKind;
    this.recipe = recipeFor(stage).map((r: RecipeEntry) => ({ kind: kindIndex(r.id), from: r.from, weight: r.weight, cap: r.cap ?? Infinity }));
    this.stageMult = opts.hpMult ?? 1;
    this.bossMult = bossMult;
    this.autoBoss = opts.autoBoss ?? true;
    this.summonMult = 1;
    this.summitMult = 1;
    this.time = 0;
    this.active = true;
    this.pending = 0;
    this.eventsFired = 0;
    this.bossSpawned = false;
    this.bossIndex = -1;
    this.bossPending = false;
    this.surgeUntil = 0;
    this.surgeMult = 1;
    this.swarm = false;
    this.pendingElites = 0;
    this.nextSwarmElite = 0;
    this.veteranSeen = false;
  }

  /** 召喚祭壇開了：召喚小頭目（越晚越強；時間到後召喚 = 最強） */
  summonBoss(): boolean {
    if (this.bossSpawned) return false;
    this.bossSpawned = true;
    this.bossPending = true;
    this.summonMult = 1 + STAGE.summon.hpGrowth * Math.min(1, this.time / this.duration);
    return true;
  }

  /** 這一關搬回生成圈的敵人數（sim、測試用） */
  recycled = 0;

  /** 開場緩衝倍率：t = 0 時 startMult，線性升到 until 時 1 */
  openingFactor(t = this.time): number {
    const O = STAGE.opening;
    const u = Math.min(1, t / this.duration);
    return u >= O.until ? 1 : O.startMult + (1 - O.startMult) * (u / O.until);
  }

  /** 後段加壓倍率（Q60）：late.from 之前 1，之後平滑升到 late.mult */
  lateFactor(t = this.time): number {
    const u = Math.min(1, t / this.duration);
    const L = STAGE.late;
    if (u <= L.from) return 1;
    const k = (u - L.from) / (1 - L.from);
    return 1 + (L.mult - 1) * k * k * (3 - 2 * k);
  }

  /** 後段一般人類的血量倍率（Q60）：和數量同一條曲線，從 1 升到 late.hp */
  lateHp(t = this.time): number {
    const f = this.lateFactor(t);
    const L = STAGE.late;
    return L.mult > 1 ? 1 + ((f - 1) / (L.mult - 1)) * (L.hp - 1) : 1;
  }

  /** 現在打倒的一般人類經驗倍率（後段加壓時打折，總經驗不跟著翻倍） */
  xpScale(t = this.time): number {
    return 1 / Math.pow(this.lateFactor(t), STAGE.late.xpDamp);
  }

  /** 頭目的「喚眾」（D95）：在玩家身邊圍一圈 count 隻（沿用包圍圈） */
  queueRing(count: number): void {
    this.ringLeft += count;
    this.ringTotal = this.ringLeft;
  }

  /** 包圍圈還沒生完的隻數（一步生不完就留到下一步） */
  private ringLeft = 0;
  private ringTotal = 0;

  get duration(): number {
    return tuning.stageSeconds;
  }

  /** 虛擬波數 n(t)：t = 0 → virtualStart，t = duration → virtualEnd（之後不再增加） */
  virtualWave(t = this.time): number {
    const u = Math.min(1, Math.max(0, t / this.duration));
    return STAGE.virtualStart + (STAGE.virtualEnd - STAGE.virtualStart) * u;
  }

  /** 目前的湧出速率（威脅點數／秒） */
  rate(t = this.time): number {
    const n = this.virtualWave(t);
    let r = ((threat(n) / STAGE.rateBaseSeconds) * tuning.countScale);
    if (this.surgeUntil > t) r *= this.surgeMult;
    if (this.swarm) r *= STAGE.swarm.rateMult;
    r *= this.openingFactor(t); // 開場緩衝（2026-11-17）
    r *= this.lateFactor(t); // 後段加壓（Q60）
    r *= this.extraMult;
    return r;
  }

  /**
   * 近距離湧出（D97，試煉碑進行中）：frac 的機率改生在 (x, z) 周圍 min～max 公尺，不是玩家外面 18～24 公尺。
   * Run 每步設定；沒有 = null。
   */
  near: { x: number; z: number; frac: number; min: number; max: number } | null = null;

  private findSpot(px: number, pz: number): boolean {
    const m = this.map;
    const nr = this.near && this.rng.next() < this.near.frac ? this.near : null;
    const cx = nr ? nr.x : px;
    const cz = nr ? nr.z : pz;
    for (let t = 0; t < WAVES.spawnTries; t++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = nr ? this.rng.range(nr.min, nr.max) : this.rng.range(STAGE.spawnRingMin, STAGE.spawnRingMax);
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (x < m.minX + 1 || x > m.maxX - 1 || z < m.minZ + 1 || z > m.maxZ - 1) continue;
      if (m.isBlocked(x, z)) continue;
      if (!this.flow.isolated && !this.flow.reachable(x, z)) continue;
      this.spot[0] = x;
      this.spot[1] = z;
      return true;
    }
    return false;
  }

  /** 依配方挑這一次要生哪一種：已開始出現、還沒到同時上限的，按權重抽；都不行就是村人 */
  private pickKind(): number {
    const u = this.time / this.duration;
    let total = 0;
    for (const r of this.recipe) if (u >= r.from && this.enemies.kindCount[r.kind] < r.cap) total += r.weight;
    if (total <= 0) return this.kindVillager;
    let roll = this.rng.next() * total;
    for (const r of this.recipe) {
      if (u < r.from || this.enemies.kindCount[r.kind] >= r.cap) continue;
      roll -= r.weight;
      if (roll <= 0) return r.kind;
    }
    return this.kindVillager;
  }

  /** 這一關第一隻老練的人類出現了嗎（Run 用來顯示一次提示） */
  veteranSeen = false;

  /** 這個時間點每次湧出是「老練」的機率（Q55）：from 之前 0，之後從 startFrac 線性升到 maxFrac */
  veteranChance(t = this.time): number {
    const V = STAGE.veteran;
    const u = t / this.duration;
    if (u < V.from) return 0;
    return V.startFrac + (V.maxFrac - V.startFrac) * Math.min(1, (u - V.from) / (1 - V.from));
  }

  private spawnRing(px: number, pz: number, night: number): number {
    const m = this.map;
    const R = STAGE.ring.radius;
    let made = 0;
    let tries = 0;
    while (this.ringLeft > 0 && made < WAVES.spawnPerStepMax * 2 && tries < WAVES.spawnPerStepMax * 4) {
      tries++;
      const k = this.ringTotal - this.ringLeft;
      this.ringLeft--;
      const a = (k / Math.max(1, this.ringTotal)) * Math.PI * 2 + this.rng.range(-0.05, 0.05);
      const x = px + Math.cos(a) * R;
      const z = pz + Math.sin(a) * R;
      if (x < m.minX + 1 || x > m.maxX - 1 || z < m.minZ + 1 || z > m.maxZ - 1) continue;
      if (m.isBlocked(x, z) || (!this.flow.isolated && !this.flow.reachable(x, z))) continue;
      if (this.enemies.aliveCount >= this.maxEnemies) {
        const far = this.enemies.farthestNormal(px, pz, STAGE.recycle.beyond);
        if (far < 0) continue;
        this.enemies.relocate(far, x, z);
        this.recycled++;
        made++;
        continue;
      }
      const vet = this.rng.next() < this.veteranChance() ? 1 : 0;
      if (this.enemies.spawn(this.pickKind(), x, z, this.virtualWave(), night, this.rng.range(0, Math.PI * 2), 0, this.stageMult * this.lateHp() * this.hpCurse, vet) >= 0) made++;
    }
    this.ringsSpawned += made;
    return made;
  }

  /** 包圍圈一共生（或搬）了幾隻（sim、測試用） */
  ringsSpawned = 0;

  private spawnOne(kind: number, variant: number, px: number, pz: number, night: number, vet = 0): number {
    if (!this.findSpot(px, pz)) return -1;
    const i = this.spawnRaw(kind, variant, night, vet);
    // 精英詞綴（E-2）：第 fromStage 關起，每隻精英隨機一個
    if (i >= 0 && variant === 1 && this.stage >= ELITE_AFFIXES.fromStage) this.enemies.setAffix(i, 1 + Math.floor(this.rng.next() * AFFIX_IDS.length));
    return i;
  }

  /** 在 (x, z) 附近 spread 公尺內生 n 隻一般的人類（分身、召喚用；走不到的位置就少生），回傳生了幾隻 */
  spawnNear(kind: number, x: number, z: number, n: number, spread: number, night: number): number {
    let made = 0;
    for (let k = 0; k < n && this.enemies.aliveCount < this.enemies.capacity; k++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(0.5, spread);
      const sx = x + Math.cos(a) * r;
      const sz = z + Math.sin(a) * r;
      if (this.map.isBlocked(sx, sz)) continue;
      this.spot[0] = sx;
      this.spot[1] = sz;
      if (this.spawnRaw(kind, 0, night, 0) >= 0) made++;
    }
    return made;
  }

  /** 召喚詞綴的精英：倒數到了就叫村人過來 */
  private updateSummoners(dt: number, night: number): void {
    const e = this.enemies;
    const S = ELITE_AFFIXES.summon;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.affix[i] !== AFFIX_SUMMON) continue;
      e.affixCd[i] -= dt;
      if (e.affixCd[i] > 0) continue;
      e.affixCd[i] = S.every;
      this.spawnNear(this.kindVillager, e.x[i], e.z[i], S.count, S.spread, night);
    }
  }

  private spawnRaw(kind: number, variant: number, night: number, vet: number): number {
    return this.enemies.spawn(kind, this.spot[0], this.spot[1], this.virtualWave(), night, this.rng.range(0, Math.PI * 2), variant, (variant === 2 ? this.stageMult * this.bossMult * this.summonMult * this.summitMult : this.stageMult * (variant === 0 ? this.lateHp() : 1)) * this.hpCurse, vet);
  }

  update(dt: number, px: number, pz: number, night: number, bossDefeated: boolean): void {
    if (!this.active) return;
    this.time += dt;
    this.updateSummoners(dt, night);
    const dur = this.duration;
    // 定時事件
    while (this.eventsFired < STAGE.events.length && this.time >= STAGE.events[this.eventsFired].at * dur) {
      const ev = STAGE.events[this.eventsFired++];
      if (ev.kind === 'ring') {
        this.ringLeft += ev.count;
        this.ringTotal = this.ringLeft;
        continue;
      }
      this.pendingElites += ev.count;
      if (ev.kind === 'surge') {
        this.surgeUntil = this.time + (ev.surgeSeconds ?? 0);
        this.surgeMult = ev.surgeMult ?? 1;
      }
    }
    if (this.autoBoss && !this.bossSpawned && this.time >= STAGE.bossAt * dur) {
      this.bossSpawned = true;
      this.bossPending = true;
    }
    if (!this.swarm && this.time >= dur && !bossDefeated) {
      this.swarm = true;
      this.nextSwarmElite = this.time;
    }
    if (this.swarm && this.time >= this.nextSwarmElite) {
      this.pendingElites++;
      this.nextSwarmElite += STAGE.swarm.eliteEvery;
    }
    // 持續湧出
    this.pending += this.rate() * dt;
    let n = 0;
    // 包圍圈（Q60）：均勻圍在玩家身邊；滿了先把遠遠落後的搬過來，再不行就少生幾隻
    if (this.ringLeft > 0) n += this.spawnRing(px, pz, night);
    if (this.bossPending) {
      // 頭目是這一關的重點：場上滿了就擠掉最遠的一般敵人，不能因為同畫面上限而生不出來
      if (this.enemies.aliveCount >= this.enemies.capacity) this.enemies.evictFarthest(px, pz);
      const i = this.spawnOne(this.kindBoss, 2, px, pz, night);
      if (i >= 0) {
        this.bossPending = false;
        this.bossIndex = i;
      }
    }
    while (this.pendingElites > 0 && this.enemies.aliveCount < this.enemies.capacity && n < WAVES.spawnPerStepMax) {
      if (this.spawnOne(this.kindVillager, 1, px, pz, night) < 0) break;
      this.pendingElites--;
      n++;
    }
    while (this.pending >= 1 && n < WAVES.spawnPerStepMax && this.enemies.aliveCount < this.maxEnemies) {
      const vet = this.rng.next() < this.veteranChance() ? 1 : 0;
      const i = this.spawnOne(this.pickKind(), 0, px, pz, night, vet);
      if (i < 0) break;
      if (vet) this.veteranSeen = true;
      this.pending -= this.enemies.points(i);
      n++;
    }
    // 同畫面滿了、還有要湧出的：把遠遠落後的一般敵人搬回生成圈（Q60；手機上限 200 時後段才感覺得到數量變多）
    if (this.pending >= 1 && this.enemies.aliveCount >= this.maxEnemies) {
      const R = STAGE.recycle;
      for (let k = 0; k < R.perStep && this.pending >= 1; k++) {
        const i = this.enemies.farthestNormal(px, pz, R.beyond);
        if (i < 0 || !this.findSpot(px, pz)) break;
        this.enemies.relocate(i, this.spot[0], this.spot[1]);
        this.pending -= this.enemies.points(i);
        this.recycled++;
      }
    }
    // 同畫面滿了：多出來的點數只保留一小段（不無限累積成一次爆出）
    if (this.pending > 40) this.pending = 40;
  }
}
