import * as THREE from 'three';
import { fxOf } from '../art/palette';
import { FEEL } from '../data/feel';
import { feel } from '../core/feel';
import type { Run } from '../game/run';
import { setHugeBounds } from './instancedLayer';

/**
 * 手感的外觀（D69）：擊殺爆圈（擴散的淡色圓環，一般／精英／頭目大小不同）與升級光環。
 * 讀 `Run.deathLog`（環形緩衝）決定哪裡要爆；固定大小的池，每幀不配置。顏色跟著妖怪的色組（palette.fx）。
 */
export class FeelFx {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly geo: THREE.RingGeometry;
  private readonly m = new THREE.Matrix4();
  private readonly c = new THREE.Color();
  private readonly s = new THREE.Vector3();
  private readonly q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  private readonly p = new THREE.Vector3();
  // 池：每一格的 x、z、起始時間、存活秒數、最大半徑、種類（0 一般／1 精英／2 頭目／3 升級光環）
  private readonly px = new Float32Array(FEEL.pop.pool);
  private readonly pz = new Float32Array(FEEL.pop.pool);
  private readonly t0 = new Float32Array(FEEL.pop.pool).fill(-99);
  private readonly life = new Float32Array(FEEL.pop.pool);
  private readonly rad = new Float32Array(FEEL.pop.pool);
  private readonly kind = new Uint8Array(FEEL.pop.pool);
  private next = 0;
  private seen = 0;
  private time = 0;
  /** 畫面上現在有幾個（測試用） */
  active = 0;
  private readonly cMain: THREE.Color;
  private readonly cMid: THREE.Color;
  private readonly cAccent: THREE.Color;

  constructor(private readonly run: Run) {
    const fx = fxOf(run.yokai.id);
    this.cMain = new THREE.Color(fx.main);
    this.cMid = new THREE.Color(fx.mid);
    this.cAccent = new THREE.Color(fx.accent);
    this.geo = new THREE.RingGeometry(0.82, 1, 40);
    this.mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, FEEL.pop.pool);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FEEL.pop.pool * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.renderOrder = 4;
    setHugeBounds(this.mesh, 200);
    this.group.add(this.mesh);
    this.seen = run.deathHead;
  }

  private spawn(x: number, z: number, kind: number, radius: number, life: number): void {
    const i = this.next++ % FEEL.pop.pool;
    this.px[i] = x;
    this.pz[i] = z;
    this.t0[i] = this.time;
    this.life[i] = life;
    this.rad[i] = radius;
    this.kind[i] = kind;
  }

  /** 升級光環：從玩家腳下擴散（不管減少特效的設定也會畫，只是比較淡的由 feel.pops 決定是否畫；0 = 不畫） */
  levelBurst(): void {
    if (feel.pops <= 0) return;
    this.spawn(this.run.px, this.run.pz, 3, FEEL.levelRing.radius, FEEL.levelRing.life);
  }

  update(dt: number): void {
    this.time += dt;
    const run = this.run;
    // 新的擊殺 → 爆圈（每幀最多 perFrame 個；落後太多就直接跳到最新的 pool 筆）
    const behind = run.deathHead - this.seen;
    if (behind > FEEL.deathLog) this.seen = run.deathHead - FEEL.deathLog;
    if (feel.pops > 0) {
      let n = 0;
      while (this.seen < run.deathHead && n < FEEL.pop.perFrame) {
        const di = (this.seen % FEEL.deathLog) * 4;
        const v = run.deathLog[di + 2];
        const r = v === 2 ? FEEL.pop.radius.boss : v === 1 ? FEEL.pop.radius.elite : FEEL.pop.radius.normal;
        // 減少特效時一般敵人隔一個才畫
        if (v > 0 || feel.pops >= 1 || (this.seen & 1) === 0) this.spawn(run.deathLog[di], run.deathLog[di + 1], v, r * Math.max(0.8, run.deathLog[di + 3]), FEEL.pop.life * (v === 2 ? 1.6 : 1));
        this.seen++;
        n++;
      }
    }
    this.seen = Math.max(this.seen, run.deathHead - FEEL.deathLog);
    if (feel.pops <= 0) this.seen = run.deathHead;
    // 畫出來
    let count = 0;
    for (let i = 0; i < FEEL.pop.pool; i++) {
      const age = this.time - this.t0[i];
      if (age < 0 || age > this.life[i]) continue;
      const u = age / this.life[i];
      const k = this.kind[i];
      const sc = this.rad[i] * (0.35 + 0.65 * (1 - (1 - u) * (1 - u)));
      this.s.set(sc, sc, 1);
      this.p.set(this.px[i], run.map.heightAt(this.px[i], this.pz[i]) + 0.12, this.pz[i]);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(count, this.m);
      // 顏色隨年齡變暗（加色混合，等於淡出）：一般用亮色、精英用主色、頭目與升級用點綴色
      this.c.copy(k === 0 ? this.cMid : k === 1 ? this.cMain : this.cAccent).multiplyScalar((1 - u) * (k === 3 ? 0.9 : 0.8));
      this.mesh.setColorAt(count, this.c);
      count++;
    }
    this.active = count;
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.mesh.dispose();
    this.group.removeFromParent();
  }
}
