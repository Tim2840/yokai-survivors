import * as THREE from 'three';
import { fxOf } from '../art/palette';
import { glow } from '../art/materials';
import { ball } from '../art/shapes';
import type { Run } from '../game/run';
import { FLASH_KINDS } from '../game/techniques';
import { setHugeBounds } from './instancedLayer';

const MAX_ORBS = 18;
const MAX_OIL = 24;
const MAX_SEEDS = 16;
const MAX_PILLARS = 6; // = techniques.ts 的 PILLARS（數量詞條會一次噴更多根）
const MAX_FLASHES = 24;
const MAX_ZONES = 32;
const DECAL_LIFT = 0.16;
const PILLAR_HEIGHT = 7;
/** 衛星燈比繞身的鬼火大幾倍 */
const SAT_SCALE = 1.7;

/** 技法的外觀（D48）：燈籠環與衛星燈的繞身鬼火、業火的燃燒地、火種、鬼火柱、護身火、爆炸圈。都用 InstancedMesh、每幀不配置 */
export class TechFx {
  readonly group = new THREE.Group();
  private readonly orbs: THREE.InstancedMesh;
  private readonly zones: THREE.InstancedMesh;
  private readonly seeds: THREE.InstancedMesh;
  private readonly oil: THREE.InstancedMesh;
  private readonly pillars: THREE.InstancedMesh;
  private readonly flashes: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly c = new THREE.Color();
  private readonly fire: THREE.Color;
  private readonly soul: THREE.Color;
  private readonly ghost: THREE.Color;
  private readonly disposables: { dispose(): void }[] = [];
  /** 燈籠環的環內護身：腳下一片淡光，推開人類時亮一下 */
  private readonly guard: THREE.Mesh;
  private readonly guardMat: THREE.MeshBasicMaterial;
  /** 護身火：充好了身邊一圈淡青光環 */
  private readonly ward: THREE.Mesh;
  private readonly wardMat: THREE.MeshBasicMaterial;
  private lastInner = 0;
  private flash = 0;
  private lastT = 0;

  constructor(private readonly run: Run) {
    const fx = fxOf(run.yokai.id);
    this.fire = new THREE.Color(fx.main);
    this.soul = new THREE.Color(fx.accent);
    this.ghost = new THREE.Color(fx.mid);
    const og = ball(0.32, 14, 10);
    // 2026-11-10「太炫光」：發光倍率降低（繞身的球 3 → 1.6）
    const om = glow(fx.mid, 1.6);
    this.orbs = this.instanced(og, om, MAX_ORBS);
    const zg = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
    const additive = (): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending });
    const zm = additive();
    this.zones = this.instanced(zg, zm, MAX_ZONES, true);
    this.zones.renderOrder = 2;
    const sg = ball(0.2, 12, 8);
    const sm = glow(fx.main, 1.9);
    this.seeds = this.instanced(sg, sm, MAX_SEEDS);
    const og2 = ball(0.2, 10, 8);
    const om2 = glow(fx.main, 1.7);
    this.oil = this.instanced(og2, om2, MAX_OIL);
    const pg = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
    const pm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.pillars = this.instanced(pg, pm, MAX_PILLARS, true);
    this.pillars.renderOrder = 3;
    const fm = additive();
    this.flashes = this.instanced(zg, fm, MAX_FLASHES, true);
    this.flashes.renderOrder = 3;
    this.guardMat = new THREE.MeshBasicMaterial({ color: fx.mid, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.guard = new THREE.Mesh(zg, this.guardMat);
    this.guard.renderOrder = 2;
    this.guard.visible = false;
    const wg = new THREE.RingGeometry(0.9, 1.1, 36).rotateX(-Math.PI / 2);
    this.wardMat = new THREE.MeshBasicMaterial({ color: fx.accent, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.ward = new THREE.Mesh(wg, this.wardMat);
    this.ward.renderOrder = 3;
    this.ward.visible = false;
    this.group.add(this.orbs, this.zones, this.seeds, this.oil, this.pillars, this.flashes, this.guard, this.ward);
    this.disposables.push(og, om, og2, om2, zg, zm, sg, sm, pg, pm, fm, wg, this.guardMat, this.wardMat);
  }

  private instanced(g: THREE.BufferGeometry, mat: THREE.Material, n: number, colored = false): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(g, mat, n);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (colored) {
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    im.count = 0;
    setHugeBounds(im, 200);
    return im;
  }

  update(t: number): void {
    const run = this.run;
    const tc = run.tech;
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    // 繞身鬼火：燈籠環＋衛星燈
    let k = 0;
    const nRing = Math.min(MAX_ORBS - 2, tc.ringCount);
    const R = tc.ringRadius;
    for (let i = 0; i < nRing; i++, k++) {
      const a = tc.ringAngle + (i / nRing) * Math.PI * 2;
      const s = 1 + 0.12 * Math.sin(t * 9 + i);
      this.m.makeScale(s, s, s).setPosition(run.px + Math.cos(a) * R, run.py + 0.9, run.pz + Math.sin(a) * R);
      this.orbs.setMatrixAt(k, this.m);
    }
    const nSat = Math.min(2, tc.satCount);
    const RS = tc.satRadius;
    for (let i = 0; i < nSat; i++, k++) {
      const a = tc.satAngle + (i / nSat) * Math.PI * 2;
      const s = SAT_SCALE * (1 + 0.08 * Math.sin(t * 5 + i));
      this.m.makeScale(s, s, s).setPosition(run.px + Math.cos(a) * RS, run.py + 1.0, run.pz + Math.sin(a) * RS);
      this.orbs.setMatrixAt(k, this.m);
    }
    // 開路燈：移動方向前方的燈籠
    for (let i = 0; i < tc.lampN && k < MAX_ORBS; i++, k++) {
      const s = 1.4 * (1 + 0.08 * Math.sin(t * 7 + i));
      this.m.makeScale(s, s, s).setPosition(tc.lampX[i], run.py + 0.9, tc.lampZ[i]);
      this.orbs.setMatrixAt(k, this.m);
    }
    this.orbs.count = k;
    this.orbs.instanceMatrix.needsUpdate = true;
    // 環內護身：平常很淡；這一幀有推開人類就亮一下再退
    const o = tc.act.ring?.orbit;
    const inner = o ? R - o.hitRadius : 0;
    this.guard.visible = inner > 0;
    if (tc.innerHits !== this.lastInner) {
      this.lastInner = tc.innerHits;
      this.flash = 1;
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    if (inner > 0) {
      this.guard.scale.set(inner, 1, inner);
      this.guard.position.set(run.px, run.map.heightAt(run.px, run.pz) + DECAL_LIFT, run.pz);
      this.guardMat.opacity = 0.07 + 0.25 * this.flash;
    }
    // 護身火：充好了身邊一圈淡青光環；充能中很淡
    const hasWard = !!tc.act.ward;
    this.ward.visible = hasWard;
    if (hasWard) {
      this.ward.scale.set(1.3, 1, 1.3);
      this.ward.position.set(run.px, run.map.heightAt(run.px, run.pz) + DECAL_LIFT + 0.02, run.pz);
      this.wardMat.opacity = tc.wardReady ? 0.55 + 0.2 * Math.sin(t * 6) : 0.08 + 0.2 * tc.wardProgress;
    }
    // 業火：燃燒地（越快熄滅越暗）
    let zc = 0;
    for (let i = 0; i < tc.zoneX.length; i++) {
      if (tc.zoneLife[i] <= 0) continue;
      const r = tc.zoneR[i];
      const x = tc.zoneX[i];
      const z = tc.zoneZ[i];
      this.m.makeScale(r, 1, r).setPosition(x, run.map.heightAt(x, z) + DECAL_LIFT, z);
      this.zones.setMatrixAt(zc, this.m);
      const f = Math.max(0, tc.zoneLife[i] / tc.zoneMaxLife[i]);
      this.c.copy(this.fire).multiplyScalar(0.35 + 0.65 * f * (0.85 + 0.15 * Math.sin(t * 12 + i)));
      this.zones.setColorAt(zc, this.c);
      zc++;
    }
    this.zones.count = zc;
    this.zones.instanceMatrix.needsUpdate = true;
    if (this.zones.instanceColor) this.zones.instanceColor.needsUpdate = true;
    // 火種：地上一顆發光的小火，快爆炸時變大
    let sc = 0;
    for (let i = 0; i < tc.seedT.length && sc < MAX_SEEDS; i++) {
      if (tc.seedT[i] <= 0) continue;
      const x = tc.seedX[i];
      const z = tc.seedZ[i];
      const s = 1 + 0.5 * (1 - Math.min(1, tc.seedT[i])) + 0.15 * Math.sin(t * 14 + i);
      this.m.makeScale(s, s, s).setPosition(x, run.map.heightAt(x, z) + 0.25, z);
      this.seeds.setMatrixAt(sc++, this.m);
    }
    this.seeds.count = sc;
    this.seeds.instanceMatrix.needsUpdate = true;
    // 燈油：燒著的人頭上一朵小火
    let oc = 0;
    for (let i = 0; i < tc.oilShown && oc < MAX_OIL; i++) {
      const e = tc.oilShow[i];
      const x = run.enemies.x[e];
      const z = run.enemies.z[e];
      const s = 1 + 0.25 * Math.sin(t * 13 + i);
      this.m.makeScale(s, s, s).setPosition(x, run.map.heightAt(x, z) + 1.5, z);
      this.oil.setMatrixAt(oc++, this.m);
    }
    this.oil.count = oc;
    this.oil.instanceMatrix.needsUpdate = true;
    // 鬼火柱：一根往上的光柱，快速淡出
    let pc = 0;
    for (let i = 0; i < MAX_PILLARS; i++) {
      if (tc.pillarLife[i] <= 0) continue;
      const f = tc.pillarLife[i] / tc.pillarMax[i];
      const x = tc.pillarX[i];
      const z = tc.pillarZ[i];
      const r = tc.pillarR * (0.6 + 0.4 * f);
      this.m.makeScale(r, PILLAR_HEIGHT, r).setPosition(x, run.map.heightAt(x, z) + PILLAR_HEIGHT / 2, z);
      this.pillars.setMatrixAt(pc, this.m);
      this.c.copy(this.ghost).multiplyScalar(f);
      this.pillars.setColorAt(pc, this.c);
      pc++;
    }
    this.pillars.count = pc;
    this.pillars.instanceMatrix.needsUpdate = true;
    if (this.pillars.instanceColor) this.pillars.instanceColor.needsUpdate = true;
    // 爆炸圈：火種、護身火、火柱落地
    let fc = 0;
    for (let i = 0; i < tc.flashLife.length && fc < MAX_FLASHES; i++) {
      if (tc.flashLife[i] <= 0) continue;
      const f = tc.flashLife[i] / tc.flashMax[i];
      const x = tc.flashX[i];
      const z = tc.flashZ[i];
      const r = tc.flashR[i] * (1.25 - 0.25 * f);
      this.m.makeScale(r, 1, r).setPosition(x, run.map.heightAt(x, z) + DECAL_LIFT + 0.03, z);
      this.flashes.setMatrixAt(fc, this.m);
      this.c.copy(tc.flashKind[i] === FLASH_KINDS.ward ? this.soul : tc.flashKind[i] === FLASH_KINDS.pillar || tc.flashKind[i] === FLASH_KINDS.rain ? this.ghost : this.fire).multiplyScalar(0.2 + 0.8 * f);
      this.flashes.setColorAt(fc, this.c);
      fc++;
    }
    this.flashes.count = fc;
    this.flashes.instanceMatrix.needsUpdate = true;
    if (this.flashes.instanceColor) this.flashes.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.orbs.dispose();
    this.zones.dispose();
    this.seeds.dispose();
    this.oil.dispose();
    this.pillars.dispose();
    this.flashes.dispose();
    this.group.removeFromParent();
  }
}
