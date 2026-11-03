import * as THREE from 'three';
import { COMBAT } from '../data/combat';
import type { HitFeed } from '../systems/hitFeed';
import type { TerrainMap } from '../world/terrainMap';

/**
 * 傷害數字（物件池）：一張 0–9 的字元圖集 + 一個 InstancedMesh，每個數字的每一位是一片面向鏡頭的方片。
 * 鏡頭固定不旋轉，所以方片的朝向只要建立時對一次。讀 HitFeed（模擬端寫入的環狀緩衝），熱路徑零配置。
 */
const MAX_DIGITS = 5;
const GLYPH_W = 32;
const GLYPH_H = 48;

function makeAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = GLYPH_W * 10;
  canvas.height = GLYPH_H;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `bold ${GLYPH_H - 10}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (let d = 0; d < 10; d++) {
    const cx = d * GLYPH_W + GLYPH_W / 2;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(20,16,30,0.95)';
    ctx.strokeText(String(d), cx, GLYPH_H / 2 + 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(d), cx, GLYPH_H / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

export class DamageNumbers {
  readonly mesh: THREE.InstancedMesh;
  private readonly cap: number;
  private readonly quads: number;
  // 每個「數字」的狀態
  private readonly nx: Float32Array;
  private readonly nz: Float32Array;
  private readonly age: Float32Array;
  private readonly digits: Uint8Array;
  private readonly count: Uint8Array;
  private readonly crit: Uint8Array;
  private readonly alive: Uint8Array;
  private tail = 0;
  private cursor = 0;
  private readonly aDigit: THREE.InstancedBufferAttribute;
  private readonly aColor: THREE.InstancedBufferAttribute;
  private readonly aAlpha: THREE.InstancedBufferAttribute;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly tex: THREE.CanvasTexture;
  private readonly q = new THREE.Quaternion();
  private readonly m4 = new THREE.Matrix4();
  private readonly v3 = new THREE.Vector3();
  private readonly s3 = new THREE.Vector3();

  constructor(
    camera: THREE.Camera,
    private readonly feed: HitFeed,
  ) {
    this.cap = COMBAT.damageNumbers.max;
    this.quads = this.cap * MAX_DIGITS;
    this.nx = new Float32Array(this.cap);
    this.nz = new Float32Array(this.cap);
    this.age = new Float32Array(this.cap);
    this.digits = new Uint8Array(this.cap * MAX_DIGITS);
    this.count = new Uint8Array(this.cap);
    this.crit = new Uint8Array(this.cap);
    this.alive = new Uint8Array(this.cap);
    this.tail = feed.head;

    this.geo = new THREE.PlaneGeometry(1, GLYPH_H / GLYPH_W);
    this.aDigit = new THREE.InstancedBufferAttribute(new Float32Array(this.quads), 1);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(this.quads * 3), 3);
    this.aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(this.quads), 1);
    for (const a of [this.aDigit, this.aColor, this.aAlpha]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aDigit', this.aDigit);
    this.geo.setAttribute('aColor', this.aColor);
    this.geo.setAttribute('aAlpha', this.aAlpha);
    this.tex = makeAtlas();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: this.tex } },
      vertexShader: /* glsl */ `
        attribute float aDigit;
        attribute vec3 aColor;
        attribute float aAlpha;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vUv = vec2((uv.x + aDigit) / 10.0, uv.y);
          vColor = aColor;
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uTex, vUv);
          if (t.a * vAlpha < 0.02) discard;
          gl_FragColor = vec4(t.rgb * vColor, t.a * vAlpha);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, this.quads);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.count = 0;
    this.q.copy(camera.quaternion);
    // 鏡頭在 renderer 建構時已就位；若之後鏡頭俯角變了，由 refreshOrientation() 重設
    this.refreshOrientation(camera);
  }

  refreshOrientation(camera: THREE.Camera): void {
    camera.updateMatrixWorld();
    camera.getWorldQuaternion(this.q);
  }

  update(dt: number, map: TerrainMap): void {
    const cfg = COMBAT.damageNumbers;
    // 讀新的命中
    const feed = this.feed;
    if (feed.head - this.tail > feed.cap) this.tail = feed.head - feed.cap;
    while (this.tail < feed.head) {
      const i = this.tail % feed.cap;
      this.tail++;
      const dmg = Math.max(1, Math.round(feed.dmg[i]));
      // 同一幀大量命中時，每顆只顯示一部分，避免畫面糊成一片（每 2 次顯示 1 次，暴擊一定顯示）
      if (feed.crit[i] === 0 && this.tail % 2 === 0 && this.liveCount() > this.cap * 0.6) continue;
      const slot = this.cursor;
      this.cursor = (this.cursor + 1) % this.cap;
      // 用序號做固定的小偏移（不用亂數：可重現）
      const jx = (((this.tail * 7) % 11) - 5) * 0.06;
      this.nx[slot] = feed.x[i] + jx;
      this.nz[slot] = feed.z[i];
      this.age[slot] = 0;
      this.crit[slot] = feed.crit[i];
      this.alive[slot] = 1;
      const n = dmg >= 10000 ? 5 : dmg >= 1000 ? 4 : dmg >= 100 ? 3 : dmg >= 10 ? 2 : 1;
      this.count[slot] = n;
      let v = Math.min(dmg, 99999);
      for (let k = n - 1; k >= 0; k--) {
        this.digits[slot * MAX_DIGITS + k] = v % 10;
        v = Math.floor(v / 10);
      }
    }
    // 更新所有活著的
    let qn = 0;
    for (let s = 0; s < this.cap; s++) {
      if (!this.alive[s]) continue;
      this.age[s] += dt;
      const life = cfg.life;
      if (this.age[s] >= life) {
        this.alive[s] = 0;
        continue;
      }
      const u = this.age[s] / life;
      const crit = this.crit[s] === 1;
      const size = (crit ? 0.5 : 0.3) * (u < 0.15 ? 0.7 + (u / 0.15) * 0.3 : 1);
      const y = map.heightAt(this.nx[s], this.nz[s]) + 1.6 + this.age[s] * cfg.rise;
      const alpha = u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1;
      const n = this.count[s];
      const width = size * 0.62;
      for (let k = 0; k < n; k++) {
        const off = (k - (n - 1) / 2) * width;
        // 往鏡頭的右方向（世界 X）排開
        this.v3.set(this.nx[s] + off, y, this.nz[s]);
        this.s3.set(size, size, 1);
        this.m4.compose(this.v3, this.q, this.s3);
        this.mesh.setMatrixAt(qn, this.m4);
        this.aDigit.setX(qn, this.digits[s * MAX_DIGITS + k]);
        if (crit) this.aColor.setXYZ(qn, 2.2, 1.6, 0.5);
        else this.aColor.setXYZ(qn, 1.6, 1.6, 1.6);
        this.aAlpha.setX(qn, alpha);
        qn++;
      }
    }
    this.mesh.count = qn;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aDigit.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
  }

  /** 清掉所有還在飄的數字（結算畫面不要留著凍住的數字） */
  clear(): void {
    this.alive.fill(0);
    this.tail = this.feed.head;
    this.mesh.count = 0;
  }

  private liveCount(): number {
    let n = 0;
    for (let s = 0; s < this.cap; s++) n += this.alive[s];
    return n;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }
}
