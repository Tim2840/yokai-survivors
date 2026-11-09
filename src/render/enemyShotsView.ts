import * as THREE from 'three';
import { ENEMIES, ENEMY_IDS } from '../data/enemies';
import type { Run } from '../game/run';
import { ENEMY_SHOT_CAPACITY } from '../systems/enemyShots';
import { setHugeBounds, writeMatrix } from './instancedLayer';

const LINE_CAPACITY = 32;
const LINE_WIDTH = 0.28;
const LINE_LIFT = 0.12;
const ARROW_HEIGHT = 0.8;

/**
 * 敵方的箭與弓手的瞄準預告（E-1）：兩個實例化圖層、固定容量、每幀不配置。
 * 預告 = 地上一條從弓手射向鎖定方向的紅色細線，預告越接近射出越亮；箭 = 暖色亮棒（和我方鬼火／水盤的顏色不同）。
 */
export class EnemyShotsView {
  readonly group = new THREE.Group();
  private readonly arrows: THREE.InstancedMesh;
  private readonly lines: THREE.InstancedMesh;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];
  private readonly col = new THREE.Color();
  /** 預告線的顏色（亮度 0～1 由進度決定）；用 uniform 色＋instanceColor 乘法 */
  private readonly lineColor = new THREE.Color('#ff4030');
  /** 每種遠程敵人的預告長度（公尺） */
  private readonly rangeOf: number[] = ENEMY_IDS.map((id) => ENEMIES[id].ranged?.range ?? 0);
  private readonly windupOf: number[] = ENEMY_IDS.map((id) => ENEMIES[id].ranged?.windup ?? 1);

  constructor(private readonly run: Run) {
    const ag = new THREE.CylinderGeometry(0.07, 0.07, 1.0, 5).rotateX(Math.PI / 2);
    const head = new THREE.ConeGeometry(0.17, 0.34, 6).rotateX(Math.PI / 2).translate(0, 0, 0.6);
    // 合併成一支箭（桿＋箭頭），沿 +z
    const arrowGeo = mergeSimple(ag, head);
    const am = new THREE.MeshBasicMaterial({ color: '#ffe3a0' });
    this.arrows = new THREE.InstancedMesh(arrowGeo, am, ENEMY_SHOT_CAPACITY);
    this.arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arrows.count = 0;
    setHugeBounds(this.arrows, 200);
    this.arrows.renderOrder = 3;
    this.group.add(this.arrows);

    const lg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    const lm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.lines = new THREE.InstancedMesh(lg, lm, LINE_CAPACITY);
    this.lines.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.lines.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LINE_CAPACITY * 3), 3);
    this.lines.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.lines.count = 0;
    setHugeBounds(this.lines, 200);
    this.lines.renderOrder = 3;
    this.group.add(this.lines);
    this.geos.push(arrowGeo, lg);
    this.mats.push(am, lm);
  }

  /** 畫面上現在有幾支箭／幾條預告線（測試用） */
  active = { arrows: 0, lines: 0 };

  update(): void {
    const run = this.run;
    const sh = run.shots;
    const am = this.arrows.instanceMatrix.array as Float32Array;
    let n = 0;
    for (let i = 0; i < sh.high; i++) {
      if (!sh.alive[i]) continue;
      const y = run.map.heightAt(sh.x[i], sh.z[i]) + ARROW_HEIGHT;
      writeMatrix(am, n, sh.x[i], y, sh.z[i], Math.atan2(sh.vx[i], sh.vz[i]), 1, 1, 1);
      n++;
    }
    this.arrows.count = n;
    this.arrows.instanceMatrix.needsUpdate = true;
    this.active.arrows = n;

    // 預告線：每個正在瞄準的弓手一條
    const e = run.enemies;
    const lm = this.lines.instanceMatrix.array as Float32Array;
    const lc = (this.lines.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    let m = 0;
    for (let i = 0; i < e.high && m < LINE_CAPACITY; i++) {
      if (!e.alive[i] || e.wind[i] <= 0) continue;
      const k = e.kind[i];
      const range = this.rangeOf[k];
      if (range <= 0) continue;
      const progress = 1 - e.wind[i] / this.windupOf[k];
      writeMatrix(lm, m, e.x[i], run.map.heightAt(e.x[i], e.z[i]) + LINE_LIFT, e.z[i], Math.atan2(e.aimX[i], e.aimZ[i]), LINE_WIDTH, 1, range);
      const b = 0.6 + 1.0 * progress;
      this.col.copy(this.lineColor).multiplyScalar(b);
      lc[m * 3] = this.col.r;
      lc[m * 3 + 1] = this.col.g;
      lc[m * 3 + 2] = this.col.b;
      m++;
    }
    this.lines.count = m;
    this.lines.instanceMatrix.needsUpdate = true;
    (this.lines.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    this.active.lines = m;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.arrows.dispose();
    this.lines.dispose();
    this.group.removeFromParent();
  }
}

function mergeSimple(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const ga = a.toNonIndexed();
  const gb = b.toNonIndexed();
  const pa = ga.attributes.position.array as Float32Array;
  const pb = gb.attributes.position.array as Float32Array;
  const pos = new Float32Array(pa.length + pb.length);
  pos.set(pa, 0);
  pos.set(pb, pa.length);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  a.dispose();
  b.dispose();
  ga.dispose();
  gb.dispose();
  return g;
}
