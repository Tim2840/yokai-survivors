import * as THREE from 'three';
import { palette } from '../art/palette';
import { glow, soft } from '../art/materials';
import { ball, roundedCylinder, teardrop } from '../art/shapes';
import { RARITIES, type Rarity } from '../data/rarity';
import { BARRIER_RADIUS, ELEMENT_RULES } from '../data/elements';
import type { ElementSlot, Elements } from '../systems/elements';
import type { TerrainMap } from '../world/terrainMap';

const SEG = 48;
const LIFT = 0.16;
/** 光柱高度（公尺）：遠處也看得到，大地圖才找得到要素 */
const BEAM_H = 26;

interface SlotView {
  root: THREE.Group;
  jizo: THREE.Group;
  barrier: THREE.Group;
  altar: THREE.Group;
  beam: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  fill: THREE.Mesh;
  fillMat: THREE.MeshBasicMaterial;
  zone: THREE.Mesh;
  zoneMat: THREE.MeshBasicMaterial;
  flame: THREE.Mesh;
  /** 上一次建立結界圈時的位置（變了才重算頂點） */
  zx: number;
  zz: number;
}

/** 地圖要素的外觀（石地藏、結界石、詛咒祭壇）：只讀 Elements.slots，每幀不配置 */
export class ElementsView {
  readonly group = new THREE.Group();
  private readonly views: SlotView[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly rarityColor: Record<Rarity, THREE.Color>;

  constructor(
    private readonly elements: Elements,
    private readonly map: TerrainMap,
  ) {
    this.rarityColor = Object.fromEntries(RARITIES.map((r) => [r, new THREE.Color(palette.rarity[r])])) as Record<Rarity, THREE.Color>;
    const R = ELEMENT_RULES;
    const stone = soft(palette.terrain.stone);
    const stoneDark = soft('#58555a');
    const red = soft('#d8453a');
    const rope = soft('#e8dcc0');
    const purple = glow('#b46cff', 2.6);
    const gBase = roundedCylinder(0.55, 0.7, 0.28, 0.1);
    const gBody = teardrop(0.42, 0.95, { bulge: 0.45 });
    const gHead = ball(0.34, 18, 12);
    const gBib = new THREE.TorusGeometry(0.32, 0.07, 8, 20).rotateX(Math.PI / 2);
    const gPillar = roundedCylinder(0.42, 0.55, 2.0, 0.14);
    const gRope = new THREE.TorusGeometry(0.46, 0.06, 8, 24).rotateX(Math.PI / 2);
    const gAltarBase = roundedCylinder(0.75, 0.9, 0.55, 0.15);
    const gAltarTop = roundedCylinder(0.5, 0.65, 0.3, 0.1);
    const gFlame = teardrop(0.32, 0.9, { bulge: 0.35, sharp: 1.4 });
    const gBeam = new THREE.CylinderGeometry(0.4, 0.4, BEAM_H, 20, 1, true);
    const gRing = new THREE.RingGeometry(R.useRadius - 0.12, R.useRadius, 40).rotateX(-Math.PI / 2);
    const gFill = new THREE.CircleGeometry(R.useRadius - 0.12, 40).rotateX(-Math.PI / 2);
    this.disposables.push(stone, stoneDark, red, rope, purple, gBase, gBody, gHead, gBib, gPillar, gRope, gAltarBase, gAltarTop, gFlame, gBeam, gRing, gFill);

    for (let i = 0; i < this.elements.slots.length; i++) {
      const root = new THREE.Group();
      // 石地藏：圓底座＋水滴身體＋圓頭＋紅圍兜
      const jizo = new THREE.Group();
      const jb = new THREE.Mesh(gBase, stone);
      const jbody = new THREE.Mesh(gBody, stone);
      jbody.position.y = 0.26;
      const jhead = new THREE.Mesh(gHead, stone);
      jhead.position.y = 1.32;
      const jbib = new THREE.Mesh(gBib, red);
      jbib.position.y = 1.0;
      jizo.add(jb, jbody, jhead, jbib);
      // 結界石：立石＋注連繩
      const barrier = new THREE.Group();
      const bp = new THREE.Mesh(gPillar, stoneDark);
      const br = new THREE.Mesh(gRope, rope);
      br.position.y = 1.35;
      barrier.add(bp, br);
      // 祭壇：兩層黑石＋紫色火焰
      const altar = new THREE.Group();
      const ab = new THREE.Mesh(gAltarBase, stoneDark);
      const at = new THREE.Mesh(gAltarTop, stone);
      at.position.y = 0.55;
      const flame = new THREE.Mesh(gFlame, purple);
      flame.position.y = 0.85;
      altar.add(ab, at, flame);
      // 稀有度光圈（互動範圍）、進度填色、光柱
      const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(gRing, ringMat);
      ring.position.y = LIFT;
      ring.renderOrder = 2;
      const fillMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const fill = new THREE.Mesh(gFill, fillMat);
      fill.position.y = LIFT + 0.01;
      fill.renderOrder = 2;
      const beamMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const beam = new THREE.Mesh(gBeam, beamMat);
      beam.position.y = BEAM_H / 2;
      // 結界圈：貼地形的環（不放進 root，直接放世界座標）
      const zg = new THREE.BufferGeometry();
      const pos = new Float32Array((SEG + 1) * 2 * 3);
      const idx: number[] = [];
      for (let k = 0; k < SEG; k++) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
      zg.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      zg.setIndex(idx);
      zg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);
      const zoneMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
      const zone = new THREE.Mesh(zg, zoneMat);
      zone.frustumCulled = false;
      zone.renderOrder = 2;
      zone.visible = false;
      this.disposables.push(ringMat, fillMat, beamMat, zg, zoneMat);
      root.add(jizo, barrier, altar, ring, fill, beam);
      root.visible = false;
      this.group.add(root, zone);
      this.views.push({ root, jizo, barrier, altar, beam, beamMat, ring, ringMat, fill, fillMat, zone, zoneMat, flame, zx: NaN, zz: NaN });
    }
  }

  private buildZone(v: SlotView, s: ElementSlot): void {
    const att = v.zone.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = att.array as Float32Array;
    for (let k = 0; k <= SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      for (let side = 0; side < 2; side++) {
        const r = side === 0 ? BARRIER_RADIUS - 0.14 : BARRIER_RADIUS;
        const x = s.x + Math.cos(a) * r;
        const z = s.z + Math.sin(a) * r;
        const o = (k * 2 + side) * 3;
        arr[o] = x;
        arr[o + 1] = this.map.heightAt(x, z) + LIFT;
        arr[o + 2] = z;
      }
    }
    att.needsUpdate = true;
    v.zx = s.x;
    v.zz = s.z;
  }

  update(t: number): void {
    const slots = this.elements.slots;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const v = this.views[i];
      v.root.visible = s.active;
      if (!s.active) {
        v.zone.visible = false;
        continue;
      }
      const c = this.rarityColor[s.rarity];
      v.root.position.set(s.x, s.y, s.z);
      v.jizo.visible = s.kind === 'jizo';
      v.barrier.visible = s.kind === 'barrier';
      v.altar.visible = s.kind === 'altar';
      v.ringMat.color.copy(c);
      v.fillMat.color.copy(c);
      v.beamMat.color.copy(c);
      // 預告：光柱較亮、模型還沒浮現
      const ann = s.announce > 0;
      const used = s.usedAge >= 0;
      const grow = ann ? 0.001 : Math.min(1, s.age / 0.5);
      const fade = used ? Math.max(0, 1 - s.usedAge / 0.7) : 1;
      const g = Math.max(0.001, grow * fade);
      v.jizo.scale.setScalar(g);
      v.barrier.scale.setScalar(g);
      v.altar.scale.setScalar(g);
      v.beamMat.opacity = (ann ? 0.26 : 0.08 + 0.03 * Math.sin(t * 2 + i)) * fade;
      // 結界石的環是範圍；其他兩種是互動圈
      const isBarrier = s.kind === 'barrier';
      v.ring.visible = !isBarrier && !ann;
      v.fill.visible = !isBarrier && !ann;
      v.fill.scale.setScalar(Math.max(0.001, s.progress * g));
      v.zone.visible = isBarrier && !ann;
      if (isBarrier) {
        if (v.zx !== s.x || v.zz !== s.z) this.buildZone(v, s);
        v.zoneMat.color.copy(c);
        v.zoneMat.opacity = (s.inside ? 0.6 : 0.34) * fade;
      }
      if (s.kind === 'altar') v.flame.scale.set(1, 0.85 + Math.sin(t * 7 + i) * 0.15, 1);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
