import * as THREE from 'three';
import { palette } from '../art/palette';
import { glow } from '../art/materials';
import { ball } from '../art/shapes';
import type { Run } from '../game/run';
import { setHugeBounds } from './instancedLayer';

const MAX_ORBS = 12;
const DECAL_LIFT = 0.16;

/** 招式變化的外觀：燈籠環的繞身鬼火、業火的燃燒地。都用 InstancedMesh、每幀不配置 */
export class VariantFx {
  readonly group = new THREE.Group();
  private readonly orbs: THREE.InstancedMesh;
  private readonly zones: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly c = new THREE.Color();
  private readonly base = new THREE.Color(palette.fire.torch);
  private readonly disposables: { dispose(): void }[] = [];
  /** 燈籠環的環內護身（D46）：腳下一片淡光，推開人類時亮一下 */
  private readonly guard: THREE.Mesh;
  private readonly guardMat: THREE.MeshBasicMaterial;
  private lastInner = 0;
  private flash = 0;
  private lastT = 0;

  constructor(private readonly run: Run) {
    const og = ball(0.32, 14, 10);
    const om = glow(palette.fire.ghost, 3);
    this.orbs = new THREE.InstancedMesh(og, om, MAX_ORBS);
    this.orbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.orbs.count = 0;
    setHugeBounds(this.orbs, 200);
    const zg = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
    const zm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    this.zones = new THREE.InstancedMesh(zg, zm, run.zoneX.length);
    this.zones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.zones.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(run.zoneX.length * 3), 3);
    this.zones.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.zones.count = 0;
    this.zones.renderOrder = 2;
    setHugeBounds(this.zones, 200);
    this.guardMat = new THREE.MeshBasicMaterial({ color: palette.fire.ghost, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.guard = new THREE.Mesh(zg, this.guardMat);
    this.guard.renderOrder = 2;
    this.guard.visible = false;
    this.group.add(this.orbs, this.zones, this.guard);
    this.disposables.push(og, om, zg, zm, this.guardMat);
  }

  update(t: number): void {
    const run = this.run;
    // 燈籠環
    const n = Math.min(MAX_ORBS, run.orbitCount);
    const R = run.orbitRadius;
    for (let k = 0; k < n; k++) {
      const a = run.orbitAngle + (k / n) * Math.PI * 2;
      const x = run.px + Math.cos(a) * R;
      const z = run.pz + Math.sin(a) * R;
      const s = 1 + 0.12 * Math.sin(t * 9 + k);
      this.m.makeScale(s, s, s).setPosition(x, run.py + 0.9, z);
      this.orbs.setMatrixAt(k, this.m);
    }
    this.orbs.count = n;
    this.orbs.instanceMatrix.needsUpdate = true;
    // 環內護身：平常很淡；這一幀有推開人類就亮一下再退
    const o = run.variant?.orbit;
    const inner = o ? R - o.hitRadius : 0;
    this.guard.visible = inner > 0;
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    if (run.innerHits !== this.lastInner) {
      this.lastInner = run.innerHits;
      this.flash = 1;
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    if (inner > 0) {
      this.guard.scale.set(inner, 1, inner);
      this.guard.position.set(run.px, run.map.heightAt(run.px, run.pz) + DECAL_LIFT, run.pz);
      this.guardMat.opacity = 0.07 + 0.25 * this.flash;
    }
    // 業火：燃燒地（越快熄滅越暗）
    let zc = 0;
    for (let i = 0; i < run.zoneX.length; i++) {
      if (run.zoneLife[i] <= 0) continue;
      const r = run.zoneR[i];
      const x = run.zoneX[i];
      const z = run.zoneZ[i];
      this.m.makeScale(r, 1, r).setPosition(x, run.map.heightAt(x, z) + DECAL_LIFT, z);
      this.zones.setMatrixAt(zc, this.m);
      const f = Math.max(0, run.zoneLife[i] / run.zoneMaxLife[i]);
      this.c.copy(this.base).multiplyScalar(0.35 + 0.65 * f * (0.85 + 0.15 * Math.sin(t * 12 + i)));
      this.zones.setColorAt(zc, this.c);
      zc++;
    }
    this.zones.count = zc;
    this.zones.instanceMatrix.needsUpdate = true;
    if (this.zones.instanceColor) this.zones.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.orbs.dispose();
    this.zones.dispose();
    this.group.removeFromParent();
  }
}
