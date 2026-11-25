/**
 * 敵方投射物池（E-1，弓手的箭）：SoA 型別陣列、固定容量、熱路徑不配置記憶體。
 * 只飛直線、不吃地形（箭射的是水平方向，碰不到就消失在最大射程）；打中玩家由 Run 結算（走和接觸傷害同一條受傷流程）。
 */
export const ENEMY_SHOT_CAPACITY = 96;
/** 地上的紅圈（E-2 陰陽師）：同時最多幾個；落下後留 ZONE_LINGER 秒給畫面淡出 */
export const ENEMY_ZONE_CAPACITY = 24;
export const ZONE_LINGER = 0.35;

export class EnemyShots {
  readonly x = new Float32Array(ENEMY_SHOT_CAPACITY);
  readonly z = new Float32Array(ENEMY_SHOT_CAPACITY);
  readonly vx = new Float32Array(ENEMY_SHOT_CAPACITY);
  readonly vz = new Float32Array(ENEMY_SHOT_CAPACITY);
  readonly life = new Float32Array(ENEMY_SHOT_CAPACITY);
  readonly damage = new Float32Array(ENEMY_SHOT_CAPACITY);
  readonly radius = new Float32Array(ENEMY_SHOT_CAPACITY);
  readonly alive = new Uint8Array(ENEMY_SHOT_CAPACITY);
  high = 0;
  aliveCount = 0;
  /** 已經射出的總數（測試與統計用） */
  fired = 0;

  /** 紅圈：中心、半徑、剩幾秒落下（≤ 0 = 已經落下、正在淡出，到 −ZONE_LINGER 消失）、總預告秒數、傷害 */
  readonly zx = new Float32Array(ENEMY_ZONE_CAPACITY);
  readonly zz = new Float32Array(ENEMY_ZONE_CAPACITY);
  readonly zr = new Float32Array(ENEMY_ZONE_CAPACITY);
  readonly zt = new Float32Array(ENEMY_ZONE_CAPACITY);
  readonly zTotal = new Float32Array(ENEMY_ZONE_CAPACITY);
  readonly zDamage = new Float32Array(ENEMY_ZONE_CAPACITY);
  readonly zAlive = new Uint8Array(ENEMY_ZONE_CAPACITY);
  zoneCount = 0;
  /** 畫過的紅圈總數（測試與統計用） */
  zonesCast = 0;

  reset(): void {
    this.alive.fill(0);
    this.high = 0;
    this.aliveCount = 0;
    this.zAlive.fill(0);
    this.zoneCount = 0;
  }

  /** 畫一個紅圈；池滿了回傳 -1（這次不施法） */
  zone(x: number, z: number, radius: number, windup: number, damage: number): number {
    const i = this.zAlive.indexOf(0);
    if (i < 0) return -1;
    this.zAlive[i] = 1;
    this.zx[i] = x;
    this.zz[i] = z;
    this.zr[i] = radius;
    this.zt[i] = windup;
    this.zTotal[i] = windup;
    this.zDamage[i] = damage;
    this.zoneCount++;
    this.zonesCast++;
    return i;
  }

  /**
   * 紅圈倒數一步；落下的那一步玩家在圈內（canHit）就回傳傷害（一步最多一個）。跳起來躲不掉（是地上的咒），要走出圈。
   */
  updateZones(dt: number, px: number, pz: number, pr: number, canHit: boolean): number {
    let hit = 0;
    for (let i = 0; i < ENEMY_ZONE_CAPACITY; i++) {
      if (!this.zAlive[i]) continue;
      const was = this.zt[i];
      this.zt[i] -= dt;
      if (was > 0 && this.zt[i] <= 0 && hit === 0 && canHit) {
        const dx = this.zx[i] - px;
        const dz = this.zz[i] - pz;
        const r = this.zr[i] + pr * 0.5;
        if (dx * dx + dz * dz <= r * r) hit = this.zDamage[i];
      }
      if (this.zt[i] <= -ZONE_LINGER) {
        this.zAlive[i] = 0;
        this.zoneCount--;
      }
    }
    return hit;
  }

  /** 射出一支；池滿了回傳 -1（直接少射，不擠掉別人） */
  spawn(x: number, z: number, dirX: number, dirZ: number, speed: number, life: number, damage: number, radius: number): number {
    let i = -1;
    for (let k = 0; k < this.high; k++) {
      if (!this.alive[k]) {
        i = k;
        break;
      }
    }
    if (i < 0) {
      if (this.high >= ENEMY_SHOT_CAPACITY) return -1;
      i = this.high++;
    }
    this.alive[i] = 1;
    this.x[i] = x;
    this.z[i] = z;
    this.vx[i] = dirX * speed;
    this.vz[i] = dirZ * speed;
    this.life[i] = life;
    this.damage[i] = damage;
    this.radius[i] = radius;
    this.aliveCount++;
    this.fired++;
    return i;
  }

  kill(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.aliveCount--;
  }

  /**
   * 前進一步；碰到玩家（圓與圓，玩家半徑 pr）就回傳那支的傷害並讓它消失，沒有碰到回傳 0。
   * 一步最多結算一支（玩家受傷後有無敵時間，多支同時到也只算一次；其餘留到下一步）。
   * canHit = false（無敵、凍結、跳起來躲過…）時箭照飛，但不結算。
   */
  update(dt: number, px: number, pz: number, pr: number, canHit: boolean): number {
    let hit = 0;
    for (let i = 0; i < this.high; i++) {
      if (!this.alive[i]) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.kill(i);
        continue;
      }
      this.x[i] += this.vx[i] * dt;
      this.z[i] += this.vz[i] * dt;
      if (hit === 0 && canHit) {
        const dx = this.x[i] - px;
        const dz = this.z[i] - pz;
        const r = pr + this.radius[i];
        if (dx * dx + dz * dz <= r * r) {
          hit = this.damage[i];
          this.kill(i);
        }
      }
    }
    return hit;
  }
}
