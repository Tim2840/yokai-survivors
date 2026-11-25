import * as THREE from 'three';
import { ENEMIES, ENEMY_IDS } from '../data/enemies';
import type { Run } from '../game/run';
import { ENEMY_SHOT_CAPACITY, ENEMY_ZONE_CAPACITY, ZONE_LINGER } from '../systems/enemyShots';
import { palette } from '../art/palette';
import { setHugeBounds, writeMatrix } from './instancedLayer';
import { markOverlay } from './overlay';

const LINE_CAPACITY = 32;
const LINE_WIDTH = 0.28;
const LINE_LIFT = 0.12;
const ARROW_HEIGHT = 0.8;
/** 地上的圓（紅圈兩層＋護法／鼓舞範圍）：同時最多幾片 */
const DISC_CAPACITY = ENEMY_ZONE_CAPACITY * 2 + 16;
const DISC_LIFT = 0.15;
/** 護法／鼓舞範圍的亮度（很淡，只是讓人看出「這群人被加持了」） */
const AURA_GLOW = 0.1;
/** 精英詞綴的腳下光圈：半徑（× 體型）與亮度 */
const AFFIX_RING = { r: 0.7, glow: 0.8 } as const;

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
  // 探子（E-2）衝刺前也畫一條：長度 = 衝出去的距離
  private readonly rangeOf: number[] = ENEMY_IDS.map((id) => ENEMIES[id].ranged?.range ?? (ENEMIES[id].dash ? ENEMIES[id].dash!.speed * ENEMIES[id].dash!.seconds : 0));
  private readonly windupOf: number[] = ENEMY_IDS.map((id) => ENEMIES[id].ranged?.windup ?? ENEMIES[id].dash?.windup ?? 1);
  /** 每種人類的範圍圈：0 = 沒有；半徑與顏色 */
  private readonly auraR: number[] = ENEMY_IDS.map((id) => ENEMIES[id].aura?.radius ?? ENEMIES[id].drum?.radius ?? 0);
  private readonly auraC: THREE.Color[] = ENEMY_IDS.map((id) => new THREE.Color(ENEMIES[id].aura ? palette.enemyZone.aura : palette.enemyZone.drum));
  private readonly discs: THREE.InstancedMesh;
  private readonly cCurse = new THREE.Color(palette.enemyZone.curse);
  private readonly cStrike = new THREE.Color(palette.enemyZone.strike);
  private readonly cAffix = palette.affix.map((c) => new THREE.Color(c));

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
    markOverlay(this.lines); // 瞄準預告線：指示，不像素化
    this.group.add(this.lines);
    // 地上的圓：中心暗、邊緣亮的圓片（頂點色），加法混合、不寫深度、蓋在地形上（大範圍在坡上不會被切掉）
    // 用分成幾圈的圓環（內徑接近 0）：CircleGeometry 只有中心＋外圈頂點，顏色只能線性內插，邊緣亮不起來
    const dg = new THREE.RingGeometry(0.001, 1, 28, 6).rotateX(-Math.PI / 2);
    const dpos = dg.attributes.position;
    const dcol = new Float32Array(dpos.count * 3);
    for (let v = 0; v < dpos.count; v++) {
      const r = Math.hypot(dpos.getX(v), dpos.getZ(v));
      const k = 0.06 + 0.94 * r ** 4; // 邊緣亮、中間很淡：看起來像一個圈，不是一整片
      dcol[v * 3] = dcol[v * 3 + 1] = dcol[v * 3 + 2] = k;
    }
    dg.setAttribute('color', new THREE.BufferAttribute(dcol, 3));
    const dm = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.discs = new THREE.InstancedMesh(dg, dm, DISC_CAPACITY);
    this.discs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.discs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DISC_CAPACITY * 3), 3);
    this.discs.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.discs.count = 0; // 數量 0 時不會畫（three 的 renderInstances 直接跳過，也不算繪製次數）；保持 visible 讓開局預編譯編得到
    setHugeBounds(this.discs, 200);
    this.discs.renderOrder = 2;
    markOverlay(this.discs);
    this.group.add(this.discs);
    this.geos.push(arrowGeo, lg, dg);
    this.mats.push(am, lm, dm);
  }

  /** 畫面上現在有幾支箭／幾條預告線（測試用） */
  active = { arrows: 0, lines: 0, zones: 0, auras: 0, affixes: 0 };

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
    this.updateDiscs();
  }

  private disc(dm: Float32Array, dc: Float32Array, q: number, x: number, z: number, r: number, c: THREE.Color, k: number): void {
    writeMatrix(dm, q, x, this.run.map.heightAt(x, z) + DISC_LIFT, z, 0, r, 1, r);
    dc[q * 3] = c.r * k;
    dc[q * 3 + 1] = c.g * k;
    dc[q * 3 + 2] = c.b * k;
  }

  /** 紅圈（底＋從中心往外長的進度；落下那一下變亮再淡掉）與護法／鼓舞的範圍 */
  private updateDiscs(): void {
    const run = this.run;
    const sh = run.shots;
    const dm = this.discs.instanceMatrix.array as Float32Array;
    const dc = (this.discs.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    let q = 0;
    let zones = 0;
    for (let i = 0; i < ENEMY_ZONE_CAPACITY && q < DISC_CAPACITY - 1; i++) {
      if (!sh.zAlive[i]) continue;
      zones++;
      const r = sh.zr[i];
      if (sh.zt[i] > 0) {
        const p = 1 - sh.zt[i] / Math.max(1e-3, sh.zTotal[i]);
        this.disc(dm, dc, q++, sh.zx[i], sh.zz[i], r, this.cCurse, 0.35 + 0.25 * p);
        this.disc(dm, dc, q++, sh.zx[i], sh.zz[i], r * Math.max(0.05, p), this.cCurse, 0.5 + 0.6 * p);
      } else {
        const k = 1 + sh.zt[i] / ZONE_LINGER; // 1 → 0
        this.disc(dm, dc, q++, sh.zx[i], sh.zz[i], r * (1 + 0.15 * (1 - k)), this.cStrike, 1.4 * k);
      }
    }
    const e = run.enemies;
    let auras = 0;
    let affixes = 0;
    for (let i = 0; i < e.high && q < DISC_CAPACITY; i++) {
      if (!e.alive[i]) continue;
      const af = e.affix[i];
      if (af > 0 && q < DISC_CAPACITY) {
        this.disc(dm, dc, q++, e.x[i], e.z[i], AFFIX_RING.r * e.scale[i], this.cAffix[af - 1], AFFIX_RING.glow);
        affixes++;
      }
      const r = this.auraR[e.kind[i]];
      if (r <= 0 || q >= DISC_CAPACITY) continue;
      this.disc(dm, dc, q++, e.x[i], e.z[i], r, this.auraC[e.kind[i]], AURA_GLOW);
      auras++;
    }
    this.discs.count = q;
    this.discs.instanceMatrix.needsUpdate = true;
    (this.discs.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    this.active.zones = zones;
    this.active.auras = auras;
    this.active.affixes = affixes;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.arrows.dispose();
    this.lines.dispose();
    this.discs.dispose();
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
