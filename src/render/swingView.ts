import * as THREE from 'three';
import { fxOf } from '../art/palette';
import { SWING_VIEW } from '../data/vfx';
import type { Run } from '../game/run';
import { markOverlay } from './overlay';

const NU = 6;
const NV = 28;

/**
 * 揮擊的樣子（赤鬼的金棒，docs/35 ⑥）：揮的那一下地上亮起一片扇形（震波／旋風棒是一整圈），從內往外掃開再淡掉。
 * 顏色讀這隻妖怪的特效色組（palette.fx）。只有揮擊武器的妖怪才建；頂點貼著地形算（每幀不配置）。
 */
export class SwingView {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly cMain: THREE.Color;
  private readonly cShock: THREE.Color;

  constructor(private readonly run: Run) {
    const fx = fxOf(run.yokai.id);
    this.cMain = new THREE.Color(fx.main);
    this.cShock = new THREE.Color(fx.accent);
    this.mat = new THREE.MeshBasicMaterial({ color: this.cMain, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((NU + 1) * (NV + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < NU; i++)
      for (let j = 0; j < NV; j++) {
        const a = i * (NV + 1) + j;
        const b = a + NV + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    this.group.add(this.mesh);
    markOverlay(this.group);
  }

  /** 畫面上有沒有揮擊（測試用） */
  visible = false;

  update(): void {
    const run = this.run;
    const sw = run.lastSwing;
    const age = sw ? run.clock - sw.at : Infinity;
    const life = sw?.shock ? SWING_VIEW.shockLife : SWING_VIEW.life;
    const on = !!sw && age >= 0 && age < life;
    this.visible = on;
    this.mesh.visible = on;
    if (!on || !sw) return;
    const k = age / life;
    const w = run.tech.weapon;
    const R = run.swingReach * (sw.shock ? (w.shockRadius ?? 1) * run.tech.shockRadiusMult : 1);
    const half = sw.full ? Math.PI : (w.arc ?? Math.PI / 2) / 2;
    // 一般揮擊：一道月牙形的刀光，從扇形的一邊掃到另一邊（貼在半徑外圈，不蓋住自己——以前整片從身體長出來，看起來像翅膀）
    // 震波：一圈往外擴散的環
    let inner: number;
    let outer: number;
    let a0 = -half;
    let a1 = half;
    if (sw.shock || sw.full) {
      outer = R * Math.min(1, 0.4 + k * 1.6);
      inner = outer * 0.72;
    } else {
      outer = R;
      inner = R * SWING_VIEW.bandInner;
      const sweep = Math.min(1, k * SWING_VIEW.sweepSpeed);
      a1 = -half + 2 * half * sweep;
      a0 = Math.max(-half, a1 - 2 * half * SWING_VIEW.trail);
    }
    const fx = sw.dx;
    const fz = sw.dz;
    const rx = fz;
    const rz = -fx;
    const pos = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    let n = 0;
    for (let i = 0; i <= NU; i++) {
      const r = inner + (outer - inner) * (i / NU);
      for (let j = 0; j <= NV; j++) {
        const ang = a0 + (a1 - a0) * (j / NV);
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const x = run.px + (fx * c + rx * s) * r;
        const z = run.pz + (fz * c + rz * s) * r;
        arr[n++] = x;
        arr[n++] = run.map.heightAt(x, z) + SWING_VIEW.lift;
        arr[n++] = z;
      }
    }
    pos.needsUpdate = true;
    this.mat.color.copy(sw.shock ? this.cShock : this.cMain);
    this.mat.opacity = (sw.shock ? SWING_VIEW.shockOpacity : SWING_VIEW.opacity) * (1 - k);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
