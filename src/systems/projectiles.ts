import { COMBAT } from '../data/combat';
import type { WeaponDef } from '../data/yokai';
import type { Enemies } from './enemies';

/** 投射物池（鬼火）：追蹤最近的敵人，命中時回呼。熱路徑不配置記憶體。 */
export class Projectiles {
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vz: Float32Array;
  readonly life: Float32Array;
  readonly damage: Float32Array;
  readonly crit: Uint8Array;
  readonly pierceLeft: Int8Array;
  readonly target: Int32Array;
  readonly lastHit: Int32Array;
  readonly alive: Uint8Array;
  /** 0 = 主武器射出的、1 = 分裂出來的小火（不會再分裂） */
  readonly gen: Uint8Array;
  high = 0;
  aliveCount = 0;
  private readonly near = new Int32Array(COMBAT.queryMax);

  constructor(readonly capacity: number) {
    this.x = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.damage = new Float32Array(capacity);
    this.crit = new Uint8Array(capacity);
    this.pierceLeft = new Int8Array(capacity);
    this.target = new Int32Array(capacity);
    this.lastHit = new Int32Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.gen = new Uint8Array(capacity);
  }

  reset(): void {
    this.alive.fill(0);
    this.high = 0;
    this.aliveCount = 0;
  }

  spawn(x: number, z: number, dirX: number, dirZ: number, w: WeaponDef, damage: number, crit: boolean, target: number, pierceBonus = 0, gen = 0): number {
    let i = -1;
    for (let k = 0; k < this.high; k++) if (!this.alive[k]) {
      i = k;
      break;
    }
    if (i < 0) {
      if (this.high >= this.capacity) return -1;
      i = this.high++;
    }
    this.alive[i] = 1;
    this.x[i] = x;
    this.z[i] = z;
    this.vx[i] = dirX * w.projectileSpeed;
    this.vz[i] = dirZ * w.projectileSpeed;
    this.life[i] = w.lifetime;
    this.damage[i] = damage;
    this.crit[i] = crit ? 1 : 0;
    this.pierceLeft[i] = w.pierce + pierceBonus;
    this.target[i] = target;
    this.lastHit[i] = -1;
    this.gen[i] = gen;
    this.aliveCount++;
    return i;
  }

  kill(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.aliveCount--;
  }

  /**
   * 前進一步：轉向目標、移動、命中判定。onHit(敵人索引, 投射物索引) 由呼叫端結算傷害與擊殺；
   * 回呼是固定的方法參照（不在迴圈裡建函式）。
   */
  update(dt: number, w: WeaponDef, enemies: Enemies, rangeMult: number, onHit: (enemy: number, proj: number) => void): void {
    const speed2 = w.projectileSpeed;
    for (let i = 0; i < this.high; i++) {
      if (!this.alive[i]) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.kill(i);
        continue;
      }
      // 追蹤：目標死了就重找最近的
      let t = this.target[i];
      if (t < 0 || !enemies.alive[t]) {
        t = enemies.nearest(this.x[i], this.z[i], w.range * rangeMult);
        this.target[i] = t;
      }
      if (t >= 0) {
        const dx = enemies.x[t] - this.x[i];
        const dz = enemies.z[t] - this.z[i];
        const want = Math.atan2(dz, dx);
        const cur = Math.atan2(this.vz[i], this.vx[i]);
        let diff = want - cur;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const maxTurn = w.turnRate * dt;
        const a = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
        this.vx[i] = Math.cos(a) * speed2;
        this.vz[i] = Math.sin(a) * speed2;
      }
      this.x[i] += this.vx[i] * dt;
      this.z[i] += this.vz[i] * dt;
      // 命中
      const n = enemies.within(this.x[i], this.z[i], w.hitRadius + 0.5, this.near);
      for (let k = 0; k < n; k++) {
        const e = this.near[k];
        if (e === this.lastHit[i] || !enemies.alive[e]) continue;
        const dx = enemies.x[e] - this.x[i];
        const dz = enemies.z[e] - this.z[i];
        const r = w.hitRadius + enemies.radius(e);
        if (dx * dx + dz * dz > r * r) continue;
        onHit(e, i);
        this.lastHit[i] = e;
        if (this.pierceLeft[i] <= 0) {
          this.kill(i);
          break;
        }
        this.pierceLeft[i]--;
      }
    }
  }
}
