import * as THREE from 'three';
import { palette } from '../art/palette';
import { BOSS_TELEGRAPH } from '../data/bosses';
import type { Run } from '../game/run';
import { TELE_CIRCLE, TELE_LINE, TELE_NONE } from '../game/bossSkills';
import { markOverlay } from './overlay';

/** 網格解析度：沿半徑（或長度）NU 格、沿角度（或寬度）NV 格；頂點高度每幀貼著地形重算 */
const NU = 10;
const NV = 32;

/**
 * 頭目招式的地面預告（D95，docs/34）：紅色範圍（底色）＋從中心往外填滿的進度；出手那一下變亮再淡掉。
 * 一個頭目同時只會有一個預告，所以只有兩個網格（底色、進度），頂點在 CPU 上貼著地形算（330 個頂點，每幀不配置）。
 * 形狀：直線（衝撞，原點在頭目、往前 a 公尺、寬 b）、圓（封魔陣，半徑 a）、扇形（投網、居合，半徑 a、半角 b）。
 */
export class BossTelegraphView {
  readonly group = new THREE.Group();
  private readonly area: THREE.Mesh;
  private readonly fill: THREE.Mesh;
  private readonly areaMat: THREE.MeshBasicMaterial;
  private readonly fillMat: THREE.MeshBasicMaterial;
  private readonly cArea = new THREE.Color(palette.bossTele.area);
  private readonly cFill = new THREE.Color(palette.bossTele.fill);
  private readonly cStrike = new THREE.Color(palette.bossTele.strike);
  /** 畫面上有沒有預告（測試用） */
  visible = false;

  constructor(private readonly run: Run) {
    this.areaMat = new THREE.MeshBasicMaterial({ color: this.cArea, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    this.fillMat = new THREE.MeshBasicMaterial({ color: this.cFill, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.area = new THREE.Mesh(makeGrid(), this.areaMat);
    this.fill = new THREE.Mesh(makeGrid(), this.fillMat);
    for (const m of [this.area, this.fill]) {
      m.frustumCulled = false;
      m.renderOrder = 3;
      m.visible = false;
      this.group.add(m);
    }
    markOverlay(this.group); // 指示：不像素化
  }

  update(t: number): void {
    const tele = this.run.boss.tele;
    const on = tele.shape !== TELE_NONE;
    this.visible = on;
    this.area.visible = on;
    this.fill.visible = on;
    if (!on) return;
    const p = tele.strike ? 1 : tele.progress;
    this.shape(this.area.geometry, 1);
    this.shape(this.fill.geometry, Math.max(0.02, p));
    if (tele.strike) {
      // 出手：整片變亮，剩下的餘韻淡掉
      const k = Math.min(1, tele.linger / Math.max(1e-3, BOSS_TELEGRAPH.linger));
      this.fillMat.color.copy(this.cStrike);
      this.fillMat.opacity = 0.35 + 0.5 * k;
      this.areaMat.opacity = 0.2 * k + 0.08;
    } else {
      // 預告：越接近出手越亮、邊緣閃
      this.fillMat.color.copy(this.cFill);
      this.fillMat.opacity = 0.35 + 0.35 * p;
      this.areaMat.color.copy(this.cArea);
      this.areaMat.opacity = 0.22 + 0.1 * Math.sin(t * 18) * p;
    }
  }

  /** 把網格擺成目前的預告形狀；scale = 沿半徑（或長度）只畫到這個比例（進度） */
  private shape(g: THREE.BufferGeometry, scale: number): void {
    const run = this.run;
    const tele = run.boss.tele;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const lift = BOSS_TELEGRAPH.lift;
    const fx = tele.dx;
    const fz = tele.dz;
    // 右手方向（垂直於前方）
    const rx = fz;
    const rz = -fx;
    let n = 0;
    for (let i = 0; i <= NU; i++) {
      const u = (i / NU) * scale;
      for (let j = 0; j <= NV; j++) {
        const v = j / NV;
        let x: number;
        let z: number;
        if (tele.shape === TELE_LINE) {
          const along = u * tele.a;
          const side = (v - 0.5) * tele.b;
          x = tele.x + fx * along + rx * side;
          z = tele.z + fz * along + rz * side;
        } else {
          const ang = tele.shape === TELE_CIRCLE ? v * Math.PI * 2 : (v * 2 - 1) * tele.b;
          const r = u * tele.a;
          const c = Math.cos(ang);
          const s = Math.sin(ang);
          // 從前方轉 ang（往右手方向為正）
          const dx = fx * c + rx * s;
          const dz = fz * c + rz * s;
          x = tele.x + dx * r;
          z = tele.z + dz * r;
        }
        arr[n++] = x;
        arr[n++] = run.map.heightAt(x, z) + lift;
        arr[n++] = z;
      }
    }
    pos.needsUpdate = true;
  }

  dispose(): void {
    this.area.geometry.dispose();
    this.fill.geometry.dispose();
    this.areaMat.dispose();
    this.fillMat.dispose();
    this.group.removeFromParent();
  }
}

function makeGrid(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((NU + 1) * (NV + 1) * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const idx: number[] = [];
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j;
      const b = a + NV + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  g.setIndex(idx);
  return g;
}
