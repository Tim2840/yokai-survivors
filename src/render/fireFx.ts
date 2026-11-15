import * as THREE from 'three';
import { flameMaterial, flameQuad, glowMaterial, glowQuad } from '../art/flame';
import { FIRE_FX } from '../data/vfx';
import { feel } from '../core/feel';
import { setHugeBounds } from './instancedLayer';

/** 粒子種類（和著色器的 aInfo.z 一致） */
export const FIRE_KIND = { flame: 0, spark: 1, glint: 2, smoke: 3 } as const;
/** 光的種類：0 = 平鋪在地上、1 = 面向鏡頭的光暈 */
export const GLOW_GROUND = 0;
export const GLOW_HALO = 1;

/**
 * 火的特效池（docs/30）：每幀 begin() → 各處呼叫 flame()、glow()、emit()… → end(dt) 上傳。
 * - 火舌（每幀重畫）與粒子（火星、金色閃光、煙、飛出去的小火團、短暫的火焰；自己模擬）用同一個實例化網格（一次繪製）。
 * - 火光（加法混合、很淡）另一個實例化網格（一次繪製）：每幀的光＋短暫的光。
 * 全部預先配置，熱路徑不 new。粒子的隨機只影響畫面，用自己的小亂數產生器（固定種子，不碰遊戲的 Rng）。
 */
export class FireFx {
  readonly mesh: THREE.InstancedMesh;
  readonly glowMesh: THREE.InstancedMesh;
  private readonly info: THREE.InstancedBufferAttribute;
  private readonly arr: Float32Array;
  private readonly cap: number;
  private n = 0;
  // 粒子
  private readonly P: number;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly seed: Float32Array;
  private readonly pw: Float32Array;
  private readonly ph: Float32Array;
  private readonly kind: Uint8Array;
  private readonly lift: Float32Array;
  private readonly drag: Float32Array;
  private readonly grow: Float32Array;
  private next = 0;
  // 光
  private readonly gArr: Float32Array;
  private readonly gInfo: THREE.InstancedBufferAttribute;
  private readonly gCap: number;
  private gn = 0;
  private readonly tx: Float32Array;
  private readonly ty: Float32Array;
  private readonly tz: Float32Array;
  private readonly tr: Float32Array;
  private readonly ti: Float32Array;
  private readonly tage: Float32Array;
  private readonly tlife: Float32Array;
  private readonly tkind: Uint8Array;
  private tnext = 0;

  private rnd = 0x2545f491;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly gGeo: THREE.BufferGeometry;
  private readonly gMat: THREE.ShaderMaterial;
  /** 給「每秒 rate 顆」用的累加器（只影響數量，不影響位置） */
  private acc = 0;
  private accSmoke = 0;

  /** 自己的時鐘（不能用每 2π 歸零的那個：雜訊會每 6 秒跳一下） */
  private readonly time = { value: 0 };

  constructor() {
    const F = FIRE_FX;
    this.P = F.maxParticles;
    this.cap = F.maxFlames + this.P;
    this.geo = flameQuad();
    this.info = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    this.info.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aInfo', this.info);
    this.mat = flameMaterial(this.time);
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, this.cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.renderOrder = 4;
    setHugeBounds(this.mesh, 200);
    this.arr = this.mesh.instanceMatrix.array as Float32Array;
    const P = this.P;
    this.px = new Float32Array(P);
    this.py = new Float32Array(P);
    this.pz = new Float32Array(P);
    this.vx = new Float32Array(P);
    this.vy = new Float32Array(P);
    this.vz = new Float32Array(P);
    this.age = new Float32Array(P).fill(1);
    this.life = new Float32Array(P).fill(1);
    this.seed = new Float32Array(P);
    this.pw = new Float32Array(P);
    this.ph = new Float32Array(P);
    this.kind = new Uint8Array(P);
    this.lift = new Float32Array(P);
    this.drag = new Float32Array(P);
    this.grow = new Float32Array(P);
    // 光
    const G = F.glow;
    this.gCap = G.max + G.transient;
    this.gGeo = glowQuad();
    this.gInfo = new THREE.InstancedBufferAttribute(new Float32Array(this.gCap * 2), 2);
    this.gInfo.setUsage(THREE.DynamicDrawUsage);
    this.gGeo.setAttribute('aGlow', this.gInfo);
    this.gMat = glowMaterial(G.color);
    this.glowMesh = new THREE.InstancedMesh(this.gGeo, this.gMat, this.gCap);
    this.glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glowMesh.count = 0;
    this.glowMesh.renderOrder = 5;
    setHugeBounds(this.glowMesh, 200);
    this.gArr = this.glowMesh.instanceMatrix.array as Float32Array;
    const T = G.transient;
    this.tx = new Float32Array(T);
    this.ty = new Float32Array(T);
    this.tz = new Float32Array(T);
    this.tr = new Float32Array(T);
    this.ti = new Float32Array(T);
    this.tage = new Float32Array(T).fill(1);
    this.tlife = new Float32Array(T).fill(1);
    this.tkind = new Uint8Array(T);
  }

  /** 加到場景的兩個網格 */
  get objects(): THREE.Object3D[] {
    return [this.mesh, this.glowMesh];
  }

  /** 這一幀：每幀的火舌、粒子、光各幾個（開發介面 fxStats；查哪一種沒畫出來用） */
  get stats(): { flames: number; particles: number; glows: number } {
    return { flames: this.n, particles: this.mesh.count - this.n, glows: this.glowMesh.count };
  }

  /** 畫面上現在有幾個（火舌＋粒子＋光；測試用） */
  get count(): number {
    return this.mesh.count + this.glowMesh.count;
  }

  rand(): number {
    // xorshift32
    let x = this.rnd;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rnd = x >>> 0;
    return this.rnd / 4294967296;
  }

  /** 依「減少特效」打折後的數量（小數用機率補） */
  private scaled(n: number): number {
    return Math.floor(n * feel.pops + this.rand());
  }

  begin(): void {
    this.n = 0;
    this.gn = 0;
  }

  /** 一條火舌：底在 (x, y, z)，寬 w、高 h（公尺）；seed 讓每條搖得不一樣；fade 0 = 正旺、1 = 快熄 */
  flame(x: number, y: number, z: number, w: number, h: number, seed: number, fade = 0): void {
    if (this.n >= FIRE_FX.maxFlames || w <= 0 || h <= 0) return;
    this.put(this.n++, x, y, z, w, h, seed, fade, 0);
  }

  /** 這一幀的一團光：kind = GLOW_GROUND（地上）或 GLOW_HALO（光暈）；r 半徑（公尺）、強度（相對 palette 的基準） */
  glow(x: number, y: number, z: number, r: number, intensity: number, kind: number): void {
    if (this.gn >= FIRE_FX.glow.max || r <= 0 || intensity <= 0) return;
    this.putGlow(this.gn++, x, y, z, r, intensity * (kind === GLOW_GROUND ? FIRE_FX.glow.ground : FIRE_FX.glow.halo), kind);
  }

  /** 短暫的光（打中、爆開）：從 0.6 倍半徑長到 r，亮度很快退掉 */
  flash(x: number, y: number, z: number, r: number, intensity: number, life: number, kind: number): void {
    const k = this.tnext;
    this.tnext = (this.tnext + 1) % FIRE_FX.glow.transient;
    this.tx[k] = x;
    this.ty[k] = y;
    this.tz[k] = z;
    this.tr[k] = r;
    this.ti[k] = intensity * (kind === GLOW_GROUND ? FIRE_FX.glow.ground : FIRE_FX.glow.halo);
    this.tage[k] = 0;
    this.tlife[k] = life;
    this.tkind[k] = kind;
  }

  private put(k: number, x: number, y: number, z: number, w: number, h: number, seed: number, fade: number, kind: number): void {
    const o = k * 16;
    const a = this.arr;
    a[o] = w;
    a[o + 1] = 0;
    a[o + 2] = 0;
    a[o + 3] = 0;
    a[o + 4] = 0;
    a[o + 5] = h;
    a[o + 6] = 0;
    a[o + 7] = 0;
    a[o + 8] = 0;
    a[o + 9] = 0;
    a[o + 10] = 1;
    a[o + 11] = 0;
    a[o + 12] = x;
    a[o + 13] = y;
    a[o + 14] = z;
    a[o + 15] = 1;
    const i = this.info.array as Float32Array;
    i[k * 3] = seed;
    i[k * 3 + 1] = fade;
    i[k * 3 + 2] = kind;
  }

  private putGlow(k: number, x: number, y: number, z: number, r: number, intensity: number, kind: number): void {
    const o = k * 16;
    const a = this.gArr;
    a[o] = r;
    a[o + 1] = 0;
    a[o + 2] = 0;
    a[o + 3] = 0;
    a[o + 4] = 0;
    a[o + 5] = r;
    a[o + 6] = 0;
    a[o + 7] = 0;
    a[o + 8] = 0;
    a[o + 9] = 0;
    a[o + 10] = r;
    a[o + 11] = 0;
    a[o + 12] = x;
    a[o + 13] = y;
    a[o + 14] = z;
    a[o + 15] = 1;
    const i = this.gInfo.array as Float32Array;
    i[k * 2] = intensity;
    i[k * 2 + 1] = kind;
  }

  /**
   * 一顆粒子：種類（FIRE_KIND）、位置、速度、寬高、壽命（秒）；
   * lift = 往上的浮力（負的 = 往下掉）、drag = 阻力（越大越快停）、grow = 一生中大小變化（-0.5 = 縮到一半、1 = 長到兩倍）
   */
  part(kind: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, w: number, h: number, life: number, lift: number, drag: number, grow: number): void {
    const k = this.next;
    this.next = (this.next + 1) % this.P;
    this.px[k] = x;
    this.py[k] = y;
    this.pz[k] = z;
    this.vx[k] = vx;
    this.vy[k] = vy;
    this.vz[k] = vz;
    this.pw[k] = w;
    this.ph[k] = h;
    this.age[k] = 0;
    this.life[k] = life;
    this.kind[k] = kind;
    this.lift[k] = lift;
    this.drag[k] = drag;
    this.grow[k] = grow;
    this.seed[k] = this.rand() * 10;
  }

  /** 噴 n 顆火星（減少特效時按 feel.pops 打折）；spread = 水平初速上限；speed 另外加一個往外的速度 */
  emit(x: number, y: number, z: number, n: number, spread: number = FIRE_FX.spark.spread, outward = 0): void {
    const S = FIRE_FX.spark;
    const count = this.scaled(n);
    for (let c = 0; c < count; c++) {
      const a = this.rand() * Math.PI * 2;
      const r = this.rand() * spread + outward * (0.6 + 0.4 * this.rand());
      const s = S.size * (0.8 + 0.5 * this.rand());
      this.part(1, x, y, z, Math.cos(a) * r, S.up * (0.5 + this.rand()), Math.sin(a) * r, s, s, S.life * (0.6 + 0.8 * this.rand()), S.lift, 2.2, -0.5);
    }
  }

  /** 每秒 rate 顆的連續火星（燃燒地、火柱、投射物尾巴） */
  emitRate(x: number, y: number, z: number, rate: number, dt: number, spread?: number): void {
    this.acc += rate * dt;
    if (this.acc < 1) return;
    const n = Math.floor(this.acc);
    this.acc -= n;
    this.emit(x, y, z, n, spread);
  }

  /** 冒煙：浮世繪的捲雲，往上飄、變大、縮掉 */
  smoke(x: number, y: number, z: number, n: number, size: number, spread = 0.4): void {
    const M = FIRE_FX.smoke;
    const count = this.scaled(n);
    for (let c = 0; c < count; c++) {
      const a = this.rand() * Math.PI * 2;
      const r = this.rand() * spread;
      const s = size * (0.75 + 0.5 * this.rand());
      this.part(3, x + Math.cos(a) * r, y, z + Math.sin(a) * r, Math.cos(a) * r * 0.8, M.up * (0.7 + 0.6 * this.rand()), Math.sin(a) * r * 0.8, s, s, M.life * (0.7 + 0.6 * this.rand()), 0, 1.2, M.grow);
    }
  }

  /** 每秒 rate 團的煙（燒著的人、燃燒地） */
  smokeRate(x: number, y: number, z: number, rate: number, dt: number, size: number): void {
    this.accSmoke += rate * dt;
    if (this.accSmoke < 1) return;
    const n = Math.floor(this.accSmoke);
    this.accSmoke -= n;
    this.smoke(x, y, z, n, size, 0.2);
  }

  /** 金色閃光（精英、頭目、暴擊）：在周圍 spread 公尺內閃一下 */
  glints(x: number, y: number, z: number, n: number, spread: number, size: number = FIRE_FX.glint.size): void {
    const count = this.scaled(n);
    for (let c = 0; c < count; c++) {
      const a = this.rand() * Math.PI * 2;
      const r = spread * Math.sqrt(this.rand());
      const s = size * (0.7 + 0.6 * this.rand());
      this.part(2, x + Math.cos(a) * r, y + this.rand() * spread * 0.8, z + Math.sin(a) * r, 0, 0.6, 0, s, s, FIRE_FX.glint.life * (0.7 + 0.6 * this.rand()), 0, 2, -0.3);
    }
  }

  /** 往外飛的小火團（打倒、爆開）：速度 speed（公尺／秒）、大小 size */
  blobs(x: number, y: number, z: number, n: number, speed: number, size: number, life: number): void {
    const count = this.scaled(n);
    for (let c = 0; c < count; c++) {
      const a = this.rand() * Math.PI * 2;
      const v = speed * (0.6 + 0.6 * this.rand());
      const s = size * (0.7 + 0.6 * this.rand());
      this.part(0, x, y, z, Math.cos(a) * v, 1.5 + 2.5 * this.rand(), Math.sin(a) * v, s * 0.75, s, life * (0.7 + 0.6 * this.rand()), -3, 2.6, -0.4);
    }
  }

  /** 原地竄一下的短暫火焰（打中、燒傷的一跳、打倒時那一團）：grow = 一生中長大的倍率 */
  flare(x: number, y: number, z: number, w: number, h: number, life: number, grow: number): void {
    this.part(0, x, y, z, 0, 0, 0, w, h, life, 0, 0, grow);
  }

  end(dt: number, t: number): void {
    this.time.value = (t * FIRE_FX.speed) % 1000;
    const S = FIRE_FX.spark;
    let k = this.n;
    for (let i = 0; i < this.P; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      const f = Math.min(1, this.age[i] / this.life[i]);
      const d = this.drag[i];
      this.vy[i] += (this.lift[i] - d * this.vy[i]) * dt;
      this.vx[i] *= Math.max(0, 1 - d * 0.7 * dt);
      this.vz[i] *= Math.max(0, 1 - d * 0.7 * dt);
      const sway = this.kind[i] === 1 ? Math.sin(t * 6 + this.seed[i]) * S.sway * 0.3 : 0;
      this.px[i] += (this.vx[i] + sway) * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const g = Math.max(0.05, 1 + this.grow[i] * f);
      // 火團與短暫火焰：fade 用 f 的平方（前半段正旺、最後才縮成紅色的小火）
      const fade = this.kind[i] === 0 ? f * f : f;
      this.put(k++, this.px[i], this.py[i], this.pz[i], this.pw[i] * g, this.ph[i] * g, this.seed[i], fade, this.kind[i]);
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.info.needsUpdate = true;
    // 光：每幀的＋短暫的
    let g = this.gn;
    for (let i = 0; i < FIRE_FX.glow.transient; i++) {
      if (this.tage[i] >= this.tlife[i]) continue;
      this.tage[i] += dt;
      const f = Math.min(1, this.tage[i] / this.tlife[i]);
      this.putGlow(g++, this.tx[i], this.ty[i], this.tz[i], this.tr[i] * (0.6 + 0.4 * f), this.ti[i] * (1 - f) * (1 - f), this.tkind[i]);
    }
    this.glowMesh.count = g;
    this.glowMesh.instanceMatrix.needsUpdate = true;
    this.gInfo.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.mesh.dispose();
    this.gGeo.dispose();
    this.gMat.dispose();
    this.glowMesh.dispose();
  }
}
