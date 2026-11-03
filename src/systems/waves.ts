import { WAVES, threat, waveKinds } from '../data/waves';
import { tuning } from '../data/tuning';
import type { Rng } from '../lib/random';
import type { TerrainMap } from '../world/terrainMap';
import type { Enemies } from './enemies';
import { kindIndex } from './enemies';
import type { FlowField } from './flowField';

/**
 * 波次導演（docs/02 第 8 節）：每波一份威脅點數預算，分 WAVES.batches 批在波長前 spawnSpan 的時間內湧入；
 * 在玩家周圍 spawnRing 公尺的圓周找「走得到玩家、不在擋路格」的位置生成；超過同畫面上限的點數留到下一步。
 */
export class WaveDirector {
  wave = 0;
  time = 0;
  active = false;
  /** 等著生成的點數 */
  pending = 0;
  /** 這一波的總預算（點數）與已排入的批數 */
  budget = 0;
  private batchesQueued = 0;
  private kindCum: number[] = [];
  private kindIds: number[] = [];

  constructor(
    private readonly rng: Rng,
    private readonly map: TerrainMap,
    private readonly flow: FlowField,
    private readonly enemies: Enemies,
    private readonly maxEnemies: number,
  ) {}

  start(wave: number): void {
    this.wave = wave;
    this.time = 0;
    this.active = true;
    this.pending = 0;
    this.budget = Math.max(1, Math.round(threat(wave) * tuning.countScale));
    this.batchesQueued = 0;
    const kinds = waveKinds(wave);
    let acc = 0;
    this.kindCum = [];
    this.kindIds = [];
    for (const k of kinds) {
      acc += k.weight;
      this.kindCum.push(acc);
      this.kindIds.push(kindIndex(k.id));
    }
  }

  get finished(): boolean {
    return this.active && this.time >= WAVES.duration;
  }

  private pickKind(): number {
    const total = this.kindCum[this.kindCum.length - 1];
    const t = this.rng.next() * total;
    for (let i = 0; i < this.kindCum.length; i++) if (t < this.kindCum[i]) return this.kindIds[i];
    return this.kindIds[0];
  }

  /** 在玩家周圍找一個能生的位置；找不到回傳 false，結果寫進 pos[0]、pos[1] */
  private findSpot(px: number, pz: number, pos: Float32Array): boolean {
    const m = this.map;
    for (let t = 0; t < WAVES.spawnTries; t++) {
      const a = this.rng.range(0, Math.PI * 2);
      const x = px + Math.cos(a) * WAVES.spawnRing;
      const z = pz + Math.sin(a) * WAVES.spawnRing;
      if (x < m.minX + 1 || x > m.maxX - 1 || z < m.minZ + 1 || z > m.maxZ - 1) continue;
      if (m.isBlocked(x, z) || !this.flow.reachable(x, z)) continue;
      pos[0] = x;
      pos[1] = z;
      return true;
    }
    return false;
  }
  private readonly spot = new Float32Array(2);

  update(dt: number, px: number, pz: number, night: number): void {
    if (!this.active) return;
    this.time += dt;
    // 到點的批次進預算
    const span = WAVES.duration * WAVES.spawnSpan;
    while (this.batchesQueued < WAVES.batches && this.time >= (span * this.batchesQueued) / WAVES.batches) {
      const per = Math.floor(this.budget / WAVES.batches);
      const extra = this.batchesQueued === 0 ? this.budget - per * WAVES.batches : 0;
      this.pending += per + extra;
      this.batchesQueued++;
    }
    let n = 0;
    while (this.pending > 0 && n < WAVES.spawnPerStepMax && this.enemies.aliveCount < this.maxEnemies) {
      if (!this.findSpot(px, pz, this.spot)) break;
      const kind = this.pickKind();
      const i = this.enemies.spawn(kind, this.spot[0], this.spot[1], this.wave, night, this.rng.range(0, Math.PI * 2));
      if (i < 0) break;
      this.pending -= this.enemies.points(i);
      n++;
    }
  }
}
