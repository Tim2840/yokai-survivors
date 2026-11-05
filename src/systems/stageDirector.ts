import { STAGE } from '../data/stage';
import { WAVES, threat } from '../data/waves';
import { tuning } from '../data/tuning';
import type { Rng } from '../lib/random';
import type { TerrainMap } from '../world/terrainMap';
import type { Enemies } from './enemies';
import { kindIndex } from './enemies';
import type { FlowField } from './flowField';

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
  private kindBoss = kindIndex('taimasou');
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

  /** stage = 第幾關（0 起）；hpMult = 難度帶來的敵人生命倍率（含關卡）；bossMult = 大頭目倍率 */
  start(stage: number, bossMult = 1, opts: { autoBoss?: boolean; hpMult?: number } = {}): void {
    void stage;
    this.stageMult = opts.hpMult ?? 1;
    this.bossMult = bossMult;
    this.autoBoss = opts.autoBoss ?? true;
    this.summonMult = 1;
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
  }

  /** 召喚祭壇開了：召喚小頭目（越晚越強；時間到後召喚 = 最強） */
  summonBoss(): boolean {
    if (this.bossSpawned) return false;
    this.bossSpawned = true;
    this.bossPending = true;
    this.summonMult = 1 + STAGE.summon.hpGrowth * Math.min(1, this.time / this.duration);
    return true;
  }

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
    r *= this.extraMult;
    return r;
  }

  private findSpot(px: number, pz: number): boolean {
    const m = this.map;
    for (let t = 0; t < WAVES.spawnTries; t++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(STAGE.spawnRingMin, STAGE.spawnRingMax);
      const x = px + Math.cos(a) * r;
      const z = pz + Math.sin(a) * r;
      if (x < m.minX + 1 || x > m.maxX - 1 || z < m.minZ + 1 || z > m.maxZ - 1) continue;
      if (m.isBlocked(x, z)) continue;
      if (!this.flow.isolated && !this.flow.reachable(x, z)) continue;
      this.spot[0] = x;
      this.spot[1] = z;
      return true;
    }
    return false;
  }

  private spawnOne(kind: number, variant: number, px: number, pz: number, night: number): number {
    if (!this.findSpot(px, pz)) return -1;
    return this.enemies.spawn(kind, this.spot[0], this.spot[1], this.virtualWave(), night, this.rng.range(0, Math.PI * 2), variant, (variant === 2 ? this.stageMult * this.bossMult * this.summonMult : this.stageMult) * this.hpCurse);
  }

  update(dt: number, px: number, pz: number, night: number, bossDefeated: boolean): void {
    if (!this.active) return;
    this.time += dt;
    const dur = this.duration;
    // 定時事件
    while (this.eventsFired < STAGE.events.length && this.time >= STAGE.events[this.eventsFired].at * dur) {
      const ev = STAGE.events[this.eventsFired++];
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
      const i = this.spawnOne(this.kindVillager, 0, px, pz, night);
      if (i < 0) break;
      this.pending -= this.enemies.points(i);
      n++;
    }
    // 同畫面滿了：多出來的點數只保留一小段（不無限累積成一次爆出）
    if (this.pending > 40) this.pending = 40;
  }
}
