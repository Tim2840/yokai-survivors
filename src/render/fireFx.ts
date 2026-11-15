import * as THREE from 'three';
import { flameMaterial, flameQuad } from '../art/flame';
import { FIRE_FX } from '../data/vfx';
import { feel } from '../core/feel';
import { setHugeBounds } from './instancedLayer';

/**
 * 火的特效池（docs/30）：每幀 begin() → 各處呼叫 flame()、emit() → end(dt) 上傳。
 * 火舌與火星用同一個實例化網格（一次繪製）；火星自己模擬（往上飄、左右晃、變暗）。全部預先配置，熱路徑不 new。
 * 火星的隨機只影響畫面，用自己的小亂數產生器（固定種子，不碰遊戲的 Rng）。
 */
export class FireFx {
  readonly mesh: THREE.InstancedMesh;
  private readonly info: THREE.InstancedBufferAttribute;
  private readonly arr: Float32Array;
  private readonly cap: number;
  private n = 0;
  // 火星
  private readonly sx: Float32Array;
  private readonly sy: Float32Array;
  private readonly sz: Float32Array;
  private readonly svx: Float32Array;
  private readonly svy: Float32Array;
  private readonly svz: Float32Array;
  private readonly sage: Float32Array;
  private readonly slife: Float32Array;
  private readonly sseed: Float32Array;
  private next = 0;
  private rnd = 0x2545f491;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  /** 給「每秒 rate 顆」用的累加器（各來源共用一個也可以：只影響數量，不影響位置） */
  private acc = 0;

  /** 自己的時鐘（不能用每 2π 歸零的那個：雜訊會每 6 秒跳一下） */
  private readonly time = { value: 0 };

  constructor() {
    const F = FIRE_FX;
    this.cap = F.maxFlames + F.maxSparks;
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
    const S = F.maxSparks;
    this.sx = new Float32Array(S);
    this.sy = new Float32Array(S);
    this.sz = new Float32Array(S);
    this.svx = new Float32Array(S);
    this.svy = new Float32Array(S);
    this.svz = new Float32Array(S);
    this.sage = new Float32Array(S).fill(1);
    this.slife = new Float32Array(S).fill(1);
    this.sseed = new Float32Array(S);
  }

  private rand(): number {
    // xorshift32
    let x = this.rnd;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rnd = x >>> 0;
    return this.rnd / 4294967296;
  }

  begin(): void {
    this.n = 0;
  }

  /** 一條火舌：底在 (x, y, z)，寬 w、高 h（公尺）；seed 讓每條搖得不一樣；fade 0 = 正旺、1 = 快熄 */
  flame(x: number, y: number, z: number, w: number, h: number, seed: number, fade = 0): void {
    if (this.n >= FIRE_FX.maxFlames || w <= 0 || h <= 0) return;
    this.put(this.n++, x, y, z, w, h, seed, fade, 0);
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

  /** 噴 n 顆火星（減少特效時按 feel.pops 打折） */
  emit(x: number, y: number, z: number, n: number, spread: number = FIRE_FX.spark.spread): void {
    const S = FIRE_FX.spark;
    const count = Math.floor(n * feel.pops + this.rand());
    for (let c = 0; c < count; c++) {
      const k = this.next;
      this.next = (this.next + 1) % FIRE_FX.maxSparks;
      const a = this.rand() * Math.PI * 2;
      const r = this.rand() * spread;
      this.sx[k] = x;
      this.sy[k] = y;
      this.sz[k] = z;
      this.svx[k] = Math.cos(a) * r;
      this.svz[k] = Math.sin(a) * r;
      this.svy[k] = S.up * (0.5 + this.rand());
      this.sage[k] = 0;
      this.slife[k] = S.life * (0.6 + 0.8 * this.rand());
      this.sseed[k] = this.rand() * 10;
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

  end(dt: number, t: number): void {
    this.time.value = (t * FIRE_FX.speed) % 1000;
    const S = FIRE_FX.spark;
    let k = this.n;
    for (let i = 0; i < FIRE_FX.maxSparks; i++) {
      if (this.sage[i] >= this.slife[i]) continue;
      this.sage[i] += dt;
      const f = Math.min(1, this.sage[i] / this.slife[i]);
      this.svy[i] += (S.lift - 2.2 * this.svy[i]) * dt; // 往上的浮力，速度慢慢收斂
      this.svx[i] *= 1 - 1.5 * dt;
      this.svz[i] *= 1 - 1.5 * dt;
      this.sx[i] += (this.svx[i] + Math.sin(t * 6 + this.sseed[i]) * S.sway * 0.3) * dt;
      this.sy[i] += this.svy[i] * dt;
      this.sz[i] += this.svz[i] * dt;
      const s = S.size * (1 - 0.5 * f);
      this.put(k++, this.sx[i], this.sy[i], this.sz[i], s, s, this.sseed[i], f, 1);
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.info.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}
