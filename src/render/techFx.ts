import * as THREE from 'three';
import { fxOf, palette } from '../art/palette';
import { soft } from '../art/materials';
import { addFade, inkBlotTexture, inkEnsoTexture, inkMaterial, inkStrokeTexture } from '../art/ink';
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

/** 墨團（繞身的球、火種、身上的火）自己發的光：夜晚也看得到，但遠低於光暈門檻（不炫光） */
const BLOB_GLOW = 0.55;

/**
 * 技法的外觀（D48）：燈籠環與衛星燈的繞身鬼火、業火的燃燒地、火種、鬼火柱、護身火、爆炸圈。都用 InstancedMesh、每幀不配置。
 * D85 水墨風：地上的東西是「墨漬」（邊緣濃、慢慢乾掉）、爆開是「一筆畫的圈」、柱子是「由下往上的一筆」、球是有顏色的墨團；
 * 顏色只用角色主色（fx.ink）、淡一階（fx.inkLight）、墨黑；一般混合、不發光。draw call 數和以前一樣。
 */
export class TechFx {
  readonly group = new THREE.Group();
  private readonly orbs: THREE.InstancedMesh;
  private readonly zones: THREE.InstancedMesh;
  private readonly seeds: THREE.InstancedMesh;
  private readonly oil: THREE.InstancedMesh;
  private readonly pillars: THREE.InstancedMesh;
  private readonly flashes: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly ink: THREE.Color;
  private readonly inkLight: THREE.Color;
  private readonly black = new THREE.Color(palette.ink.black);
  private readonly v = new THREE.Vector3();
  private readonly zoneFade: THREE.InstancedBufferAttribute;
  private readonly pillarFade: THREE.InstancedBufferAttribute;
  private readonly flashFade: THREE.InstancedBufferAttribute;
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
    this.ink = new THREE.Color(fx.ink);
    this.inkLight = new THREE.Color(fx.inkLight);
    const blob = (c: string) => soft(c, { emissive: c, emissiveIntensity: BLOB_GLOW });
    const og = ball(0.32, 14, 10);
    const om = blob(fx.inkLight);
    this.orbs = this.instanced(og, om, MAX_ORBS);
    const circle = () => new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
    const zg = circle();
    const zm = inkMaterial(inkBlotTexture(), { opacity: 0.8 });
    this.zones = this.instanced(zg, zm, MAX_ZONES, true);
    this.zones.renderOrder = 2;
    this.zoneFade = addFade(this.zones, MAX_ZONES);
    const sg = ball(0.2, 12, 8);
    const sm = blob(fx.ink);
    this.seeds = this.instanced(sg, sm, MAX_SEEDS);
    const og2 = ball(0.2, 10, 8);
    const om2 = blob(fx.ink);
    this.oil = this.instanced(og2, om2, MAX_OIL);
    const pg = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
    const pm = inkMaterial(inkStrokeTexture(), { opacity: 0.9, side: THREE.DoubleSide });
    this.pillars = this.instanced(pg, pm, MAX_PILLARS, true);
    this.pillars.renderOrder = 3;
    this.pillarFade = addFade(this.pillars, MAX_PILLARS);
    const fg = circle();
    const fm = inkMaterial(inkEnsoTexture(), { opacity: 0.95 });
    this.flashes = this.instanced(fg, fm, MAX_FLASHES, true);
    this.flashes.renderOrder = 3;
    this.flashFade = addFade(this.flashes, MAX_FLASHES);
    // 環內護身：腳下一片很淡的墨暈；護身火：身邊一個筆刷圓（不用 aFade，一般的貼圖材質）
    const gg = circle();
    this.guardMat = new THREE.MeshBasicMaterial({ map: inkBlotTexture(), color: fx.inkLight, transparent: true, opacity: 0, depthWrite: false });
    this.guard = new THREE.Mesh(gg, this.guardMat);
    this.guard.renderOrder = 2;
    this.guard.visible = false;
    const wg = circle();
    this.wardMat = new THREE.MeshBasicMaterial({ map: inkEnsoTexture(), color: fx.ink, transparent: true, opacity: 0.55, depthWrite: false });
    this.ward = new THREE.Mesh(wg, this.wardMat);
    this.ward.renderOrder = 3;
    this.ward.visible = false;
    this.group.add(this.orbs, this.zones, this.seeds, this.oil, this.pillars, this.flashes, this.guard, this.ward);
    this.disposables.push(og, om, og2, om2, zg, zm, sg, sm, pg, pm, fg, fm, gg, wg, this.guardMat, this.wardMat);
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
      this.guardMat.opacity = 0.1 + 0.3 * this.flash;
    }
    // 護身火：充好了身邊一圈淡青光環；充能中很淡
    const hasWard = !!tc.act.ward;
    this.ward.visible = hasWard;
    if (hasWard) {
      this.ward.scale.set(1.75, 1, 1.75);
      this.ward.rotation.y = t * 0.6;
      this.ward.position.set(run.px, run.map.heightAt(run.px, run.pz) + DECAL_LIFT + 0.02, run.pz);
      this.wardMat.opacity = tc.wardReady ? 0.7 + 0.2 * Math.sin(t * 6) : 0.1 + 0.25 * tc.wardProgress;
    }
    // 業火：燃燒地（越快熄滅越暗）
    let zc = 0;
    for (let i = 0; i < tc.zoneX.length; i++) {
      if (tc.zoneLife[i] <= 0) continue;
      const r = tc.zoneR[i];
      const x = tc.zoneX[i];
      const z = tc.zoneZ[i];
      // 每一灘轉不同的角度（同一張墨漬貼圖看起來不重複）；放大一點，墨漬的邊在判定範圍外緣
      this.m.makeRotationY(i * 2.399).scale(this.v.set(r * 1.2, 1, r * 1.2)).setPosition(x, run.map.heightAt(x, z) + DECAL_LIFT, z);
      this.zones.setMatrixAt(zc, this.m);
      const f = Math.max(0, tc.zoneLife[i] / tc.zoneMaxLife[i]);
      this.zones.setColorAt(zc, this.ink);
      // 墨慢慢乾：快消失時從邊緣一塊一塊不見
      this.zoneFade.setX(zc, 0.08 + 0.75 * (1 - f) * (1 - f));
      zc++;
    }
    this.zones.count = zc;
    this.zones.instanceMatrix.needsUpdate = true;
    if (this.zones.instanceColor) this.zones.instanceColor.needsUpdate = true;
    this.zoneFade.needsUpdate = true;
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
      this.m.makeRotationY(i * 1.7).scale(this.v.set(r, PILLAR_HEIGHT, r)).setPosition(x, run.map.heightAt(x, z) + PILLAR_HEIGHT / 2, z);
      this.pillars.setMatrixAt(pc, this.m);
      this.pillars.setColorAt(pc, this.ink);
      this.pillarFade.setX(pc, 0.05 + 0.8 * (1 - f));
      pc++;
    }
    this.pillars.count = pc;
    this.pillars.instanceMatrix.needsUpdate = true;
    if (this.pillars.instanceColor) this.pillars.instanceColor.needsUpdate = true;
    this.pillarFade.needsUpdate = true;
    // 爆炸圈：火種、護身火、火柱落地
    let fc = 0;
    for (let i = 0; i < tc.flashLife.length && fc < MAX_FLASHES; i++) {
      if (tc.flashLife[i] <= 0) continue;
      const f = tc.flashLife[i] / tc.flashMax[i];
      const x = tc.flashX[i];
      const z = tc.flashZ[i];
      const r = tc.flashR[i] * (1.25 - 0.25 * f);
      // 一筆畫出的圈（円相），每個轉不同角度；柱子落地用墨黑、護身用淡色、其他用主色
      this.m.makeRotationY(i * 2.1).scale(this.v.set(r * 1.3, 1, r * 1.3)).setPosition(x, run.map.heightAt(x, z) + DECAL_LIFT + 0.03, z);
      this.flashes.setMatrixAt(fc, this.m);
      this.flashes.setColorAt(fc, tc.flashKind[i] === FLASH_KINDS.ward ? this.inkLight : tc.flashKind[i] === FLASH_KINDS.pillar ? this.black : this.ink);
      this.flashFade.setX(fc, 0.04 + 0.85 * (1 - f));
      fc++;
    }
    this.flashes.count = fc;
    this.flashes.instanceMatrix.needsUpdate = true;
    if (this.flashes.instanceColor) this.flashes.instanceColor.needsUpdate = true;
    this.flashFade.needsUpdate = true;
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
