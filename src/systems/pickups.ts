import type { Rng } from '../lib/random';
import { PICKUP_KINDS, PICKUP_RULES, PICKUP_WEIGHTS, type PickupKind } from '../data/pickups';

/**
 * 補給品（D39）：人類倒下時掉在地上，玩家碰到就撿起來（拾取範圍內會被吸過來）。純邏輯、固定大小的池，每幀不配置。
 * 撿到的種類寫進 got[0..n)，由 Run 套用效果。
 */
export class Pickups {
  readonly capacity = PICKUP_RULES.max;
  readonly kind = new Int8Array(this.capacity);
  readonly x = new Float32Array(this.capacity);
  readonly z = new Float32Array(this.capacity);
  readonly age = new Float32Array(this.capacity);
  readonly alive = new Uint8Array(this.capacity);
  readonly pulled = new Uint8Array(this.capacity);
  /** 這一步撿到的種類（索引到 PICKUP_KINDS） */
  readonly got = new Int8Array(this.capacity);
  aliveCount = 0;

  constructor(private readonly rng: Rng) {}

  reset(): void {
    this.alive.fill(0);
    this.aliveCount = 0;
  }

  /** 依來源的權重抽一種 */
  roll(source: 'normal' | 'elite' | 'boss'): PickupKind {
    const w = PICKUP_WEIGHTS[source];
    let total = 0;
    for (const k of PICKUP_KINDS) total += w[k];
    let r = this.rng.next() * total;
    for (const k of PICKUP_KINDS) {
      r -= w[k];
      if (r < 0) return k;
    }
    return PICKUP_KINDS[0];
  }

  /** 放一個；池滿了就擠掉最舊的 */
  spawn(kind: PickupKind, x: number, z: number): number {
    let i = -1;
    let oldest = 0;
    for (let k = 0; k < this.capacity; k++) {
      if (!this.alive[k]) {
        i = k;
        break;
      }
      if (this.age[k] > this.age[oldest]) oldest = k;
    }
    if (i < 0) {
      i = oldest;
      this.aliveCount--;
    }
    this.kind[i] = PICKUP_KINDS.indexOf(kind);
    this.x[i] = x;
    this.z[i] = z;
    this.age[i] = 0;
    this.alive[i] = 1;
    this.pulled[i] = 0;
    this.aliveCount++;
    return i;
  }

  /** 前進一步；回傳這一步撿到幾個（種類在 got） */
  update(dt: number, px: number, pz: number, pickupRadius: number): number {
    let n = 0;
    const R = PICKUP_RULES;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
      this.age[i] += dt;
      if (this.age[i] >= R.lifetime) {
        this.alive[i] = 0;
        this.aliveCount--;
        continue;
      }
      const dx = px - this.x[i];
      const dz = pz - this.z[i];
      const d = Math.hypot(dx, dz);
      if (d <= R.touchRadius) {
        this.got[n++] = this.kind[i];
        this.alive[i] = 0;
        this.aliveCount--;
        continue;
      }
      if (!this.pulled[i] && d <= pickupRadius) this.pulled[i] = 1;
      if (this.pulled[i]) {
        const step = Math.min(d, R.magnetSpeed * dt);
        this.x[i] += (dx / d) * step;
        this.z[i] += (dz / d) * step;
      }
    }
    return n;
  }

  /** 快要消失：閃爍用 */
  blinking(i: number): boolean {
    return this.age[i] >= PICKUP_RULES.lifetime - PICKUP_RULES.blinkSeconds;
  }
}
