import { PROGRESSION } from '../data/progression';

/** 魂火（經驗）池：被拾取範圍吸住後飛向玩家；波次結束時全部吸過來。 */
export class Orbs {
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly value: Float32Array;
  readonly pulled: Uint8Array;
  readonly alive: Uint8Array;
  readonly speed: Float32Array;
  high = 0;
  aliveCount = 0;
  private freeTop = 0;
  private readonly free: Int32Array;
  /** 波次結束的全吸模式 */
  sweeping = false;

  constructor(readonly capacity: number) {
    this.x = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.value = new Float32Array(capacity);
    this.pulled = new Uint8Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.speed = new Float32Array(capacity);
    this.free = new Int32Array(capacity);
  }

  reset(): void {
    this.alive.fill(0);
    this.high = 0;
    this.aliveCount = 0;
    this.freeTop = 0;
    this.sweeping = false;
  }

  /** 生一顆；滿了回傳 false（呼叫端直接把價值加進經驗） */
  spawn(x: number, z: number, value: number): boolean {
    let i: number;
    if (this.freeTop > 0) i = this.free[--this.freeTop];
    else if (this.high < this.capacity) i = this.high++;
    else return false;
    this.alive[i] = 1;
    this.x[i] = x;
    this.z[i] = z;
    this.value[i] = value;
    this.pulled[i] = 0;
    this.speed[i] = 0;
    this.aliveCount++;
    return true;
  }

  /** 招魂鈴（D39）：場上所有魂火都被吸過來（不管距離） */
  vacuum(): void {
    for (let i = 0; i < this.high; i++) {
      if (!this.alive[i] || this.pulled[i]) continue;
      this.pulled[i] = 1;
      this.speed[i] = PROGRESSION.orbMagnetSpeed * 0.5;
    }
  }

  /** 前進一步；回傳這一步被拾取的總價值 */
  update(dt: number, px: number, pz: number, pickupRadius: number): number {
    let gained = 0;
    const r2 = pickupRadius * pickupRadius;
    for (let i = 0; i < this.high; i++) {
      if (!this.alive[i]) continue;
      const dx = px - this.x[i];
      const dz = pz - this.z[i];
      const d2 = dx * dx + dz * dz;
      if (!this.pulled[i] && (this.sweeping || d2 <= r2)) {
        this.pulled[i] = 1;
        this.speed[i] = this.sweeping ? PROGRESSION.orbSweepSpeed : PROGRESSION.orbMagnetSpeed * 0.5;
      }
      if (!this.pulled[i]) continue;
      const target = this.sweeping ? PROGRESSION.orbSweepSpeed : PROGRESSION.orbMagnetSpeed;
      this.speed[i] += (target - this.speed[i]) * Math.min(1, dt * 8);
      const d = Math.sqrt(d2);
      const step = this.speed[i] * dt;
      if (d <= step + 0.3) {
        gained += this.value[i];
        this.alive[i] = 0;
        this.free[this.freeTop++] = i;
        this.aliveCount--;
        continue;
      }
      this.x[i] += (dx / d) * step;
      this.z[i] += (dz / d) * step;
    }
    return gained;
  }
}
