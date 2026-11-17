import * as THREE from 'three';
import { fxOf, palette } from '../art/palette';
import { soft } from '../art/materials';
import { addFade, inkBlotTexture, inkEnsoTexture, inkMaterial, inkStrokeTexture } from '../art/ink';
import { ball } from '../art/shapes';
import type { Run } from '../game/run';
import { FLASH_KINDS } from '../game/techniques';
import { setHugeBounds } from './instancedLayer';
import { FIRE_FX, ONI_FX, WATER_FX, vfxStyleOf } from '../data/vfx';
import { GLOW_GROUND, GLOW_HALO, type ElementFx } from './elementFx';

const TAU = Math.PI * 2;

const MAX_ORBS = 18;
const MAX_OIL = 24;
const MAX_SEEDS = 16;
const MAX_PILLARS = 6; // = techniques.ts 的 PILLARS（數量詞條會一次噴更多根）
const MAX_FLASHES = 32; // 爆圈 24 ＋ 河童的漩渦 6（漩渦用同一張筆刷圓，會轉）
const MAX_ZONES = 64; // 燃燒地 32 ＋ 河童的水痕 28 ＋ 水域 4
const DECAL_LIFT = 0.16;
const PILLAR_HEIGHT = 7;
/** 衛星燈比繞身的鬼火大幾倍 */
const SAT_SCALE = 1.7;
const rr0 = (r: number) => Math.max(0.8, r * 0.8);

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
  /** 火（docs/30）：有這個就走浮世繪的火，沒有就是 D85 的水墨 */
  private readonly fire: ElementFx | null;
  /** 水（docs/30 第 ⑪ 節，河童）：浪頭、水珠、漣漪、水泡 */
  private readonly water: ElementFx | null;
  /** 鬼氣／雷（docs/30 第 ⑫ 節，赤鬼）：走火的引擎與分支，只有落雷（鬼雷）換成閃電 */
  private readonly oni: boolean;
  private readonly scorch = new THREE.Color(FIRE_FX.zone.scorch);
  /** 爆開的偵測：上一幀每個爆圈剩多少壽命（變多 = 新的一個） */
  private readonly prevFlash: Float32Array;

  constructor(private readonly run: Run, elementFx: ElementFx | null = null) {
    const style = vfxStyleOf(run.yokai.id);
    this.fire = style === 'fire' || style === 'oni' ? elementFx : null;
    this.oni = style === 'oni';
    this.water = style === 'water' ? elementFx : null;
    const fx = fxOf(run.yokai.id);
    this.ink = new THREE.Color(fx.ink);
    this.inkLight = new THREE.Color(fx.inkLight);
    const blob = (c: string) => soft(c, { emissive: c, emissiveIntensity: BLOB_GLOW });
    const og = ball(0.32, 14, 10);
    // 繞身的球用主色（深一點才像墨，不是亮亮的球）
    const om = blob(fx.ink);
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
    this.prevFlash = new Float32Array(run.tech.flashLife.length);
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
    const fire = this.fire;
    if (fire) {
      // 火：每顆火球上疊一條火舌（球本身是火芯）
      const O = FIRE_FX.orb;
      const e = this.orbs.instanceMatrix.array as Float32Array;
      for (let i = 0; i < k; i++) {
        const sc = e[i * 16];
        fire.flame(e[i * 16 + 12], e[i * 16 + 13] - O.base * sc, e[i * 16 + 14], O.w * sc, O.h * sc, i * 1.37);
        fire.glow(e[i * 16 + 12], e[i * 16 + 13] + 0.1, e[i * 16 + 14], O.halo * sc, 1, GLOW_HALO);
        fire.emitRate(e[i * 16 + 12], e[i * 16 + 13] + 0.4 * sc, e[i * 16 + 14], O.sparkRate, dt, 0.25);
      }
      // 火的繞身是「飄著的火」（鬼火），不畫墨團球
      this.orbs.count = 0;
    }
    const water = this.water;
    if (water) {
      // 水：每個繞身的水盤上一個小浪頭＋甩出水珠
      const O = WATER_FX.orb;
      const e = this.orbs.instanceMatrix.array as Float32Array;
      for (let i = 0; i < k; i++) {
        const sc = e[i * 16];
        water.flame(e[i * 16 + 12], e[i * 16 + 13] - O.base * sc, e[i * 16 + 14], O.w * sc, O.h * sc, i * 1.37);
        water.glow(e[i * 16 + 12], e[i * 16 + 13], e[i * 16 + 14], O.halo * sc, 1, GLOW_HALO);
        water.emitRate(e[i * 16 + 12], e[i * 16 + 13] + 0.2, e[i * 16 + 14], O.dropRate, dt, 0.6);
      }
      this.orbs.count = 0;
    }
    // 環內護身：平常很淡；這一幀有推開人類就亮一下再退
    const o = tc.act.ring?.orbit;
    const inner = o ? R - o.hitRadius : 0;
    this.guard.visible = inner > 0;
    if (tc.innerHits !== this.lastInner) {
      this.lastInner = tc.innerHits;
      this.flash = 1;
      if (fire && inner > 0) {
        // 火：環內推開人類那一下，貼地竄起一圈往外倒的火、往外噴火星
        const gy = run.map.heightAt(run.px, run.pz);
        const G = FIRE_FX.guard;
        for (let j = 0; j < G.n; j++) {
          const a = (j / G.n) * Math.PI * 2 + fire.rand();
          fire.part(0, run.px + Math.cos(a) * inner * 0.7, gy, run.pz + Math.sin(a) * inner * 0.7, Math.cos(a) * G.speed, 0, Math.sin(a) * G.speed, G.w, G.h, G.life, 0, 4, -0.3);
        }
        fire.emit(run.px, gy + 0.5, run.pz, G.sparks, 0.5, G.speed * 1.4);
        fire.flash(run.px, gy + 0.06, run.pz, inner * 1.3, 1.2, 0.35, GLOW_GROUND);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    if (inner > 0) {
      this.guard.scale.set(inner, 1, inner);
      this.guard.position.set(run.px, run.map.heightAt(run.px, run.pz) + DECAL_LIFT, run.pz);
      this.guardMat.opacity = 0.1 + 0.3 * this.flash;
    }
    // 護身火：充好了身邊一圈淡青光環；充能中很淡
    const hasWard = !!tc.act.ward;
    this.ward.visible = hasWard && !fire;
    if (hasWard && fire) {
      // 火：身邊一圈小火，充好了竄高、充能中只有小小的火苗
      const W = FIRE_FX.ward;
      const g = tc.wardReady ? 1 + 0.12 * Math.sin(t * 6) : 0.25 + 0.4 * tc.wardProgress;
      const gy = run.map.heightAt(run.px, run.pz);
      for (let j = 0; j < W.n; j++) {
        const a = (j / W.n) * Math.PI * 2 + t * 0.6;
        fire.flame(run.px + Math.cos(a) * W.r, gy, run.pz + Math.sin(a) * W.r, W.w * g, W.h * g, j * 1.9, tc.wardReady ? 0 : 0.5);
      }
      if (tc.wardReady) fire.glow(run.px, gy + 0.05, run.pz, W.r * 1.5, 0.8, GLOW_GROUND);
    }
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
      this.zones.setColorAt(zc, fire ? this.scorch : this.ink);
      if (fire) {
        // 燒焦的地上舔著幾條火舌（半徑越大越多）、往上噴火星；快熄時火舌變小變紅
        const Z = FIRE_FX.zone;
        const n = Math.min(Z.tonguesMax, Math.round(Z.tonguesBase + r * Z.tonguesPerMeter));
        const gy = run.map.heightAt(x, z);
        for (let j = 0; j < n; j++) {
          const a = j * 2.399 + i * 1.7;
          const rr = r * 0.78 * Math.sqrt((j + 0.5) / n);
          const tx = x + Math.cos(a) * rr;
          const tz = z + Math.sin(a) * rr;
          const big = (0.75 + 0.5 * ((j * 7 + i * 3) % 5) / 4) * (0.45 + 0.55 * f);
          fire.flame(tx, gy, tz, Z.w * r * big + 0.25, Z.h * r * big + 0.4, i * 3.1 + j, 1 - f);
        }
        fire.emitRate(x, gy + 0.3, z, Z.sparkRate * f, dt, r * 0.5);
        fire.smokeRate(x, gy + 0.8 + r * 0.3, z, Z.smokeRate * f, dt, 0.35 + r * 0.12);
        // 地上的火光（慢慢呼吸）
        fire.glow(x, gy + 0.05, z, r * 1.35, (0.55 + 0.45 * f) * (0.9 + 0.1 * Math.sin(t * 7 + i)), GLOW_GROUND);
      }
      // 墨慢慢乾：快消失時從邊緣一塊一塊不見
      this.zoneFade.setX(zc, 0.08 + 0.75 * (1 - f) * (1 - f));
      zc++;
    }
    // 河童的水痕（小墨漬，沿路一段一段）與水域（大片淡墨）：和燃燒地用同一組實例
    for (let i = 0; i < tc.wakeX.length && zc < MAX_ZONES; i++) {
      if (tc.wakeLife[i] <= 0) continue;
      const x = tc.wakeX[i];
      const z = tc.wakeZ[i];
      const r = tc.wakeR * 1.35;
      this.m.makeRotationY(i * 2.399).scale(this.v.set(r, 1, r)).setPosition(x, run.map.heightAt(x, z) + DECAL_LIFT, z);
      this.zones.setMatrixAt(zc, this.m);
      this.zones.setColorAt(zc, this.inkLight);
      const f = Math.max(0, tc.wakeLife[i] / tc.wakeMax[i]);
      if (water) {
        // 水痕：每灘一個小浪（快乾時變小）、偶爾起一圈漣漪
        const W = WATER_FX.wake;
        const gy = run.map.heightAt(x, z);
        water.flame(x, gy, z, W.w * (0.5 + 0.5 * f), W.h * (0.4 + 0.6 * f), i * 2.9, 1 - f);
        if (water.rand() < W.rippleRate * dt) water.ripple(x, gy + 0.06, z, tc.wakeR * 1.6, WATER_FX.ripple.life, 0.8);
      }
      this.zoneFade.setX(zc, 0.15 + 0.7 * (1 - f));
      zc++;
    }
    for (let i = 0; i < tc.domX.length && zc < MAX_ZONES; i++) {
      if (tc.domLife[i] <= 0) continue;
      const x = tc.domX[i];
      const z = tc.domZ[i];
      const r = tc.domR[i] * 1.2;
      this.m.makeRotationY(i * 1.3 + t * 0.15).scale(this.v.set(r, 1, r)).setPosition(x, run.map.heightAt(x, z) + DECAL_LIFT - 0.02, z);
      this.zones.setMatrixAt(zc, this.m);
      this.zones.setColorAt(zc, tc.inDomain ? this.ink : this.inkLight);
      const f = Math.max(0, tc.domLife[i] / tc.domMax[i]);
      if (water) {
        // 水域：邊上一圈浪頭慢慢繞、裡面不時起漣漪、地上淡淡的水光
        const D = WATER_FX.domain;
        const gy = run.map.heightAt(x, z);
        const rr = tc.domR[i];
        for (let j = 0; j < D.crests; j++) {
          const a = (j / D.crests) * TAU + t * 0.5 + i;
          water.flame(x + Math.cos(a) * rr, gy, z + Math.sin(a) * rr, D.w, D.h * (0.6 + 0.4 * f) * (0.85 + 0.15 * Math.sin(t * 3 + j)), i * 4.1 + j, 1 - f);
        }
        if (water.rand() < D.rippleRate * dt) {
          const a = water.rand() * TAU;
          const d = Math.sqrt(water.rand()) * rr * 0.8;
          water.ripple(x + Math.cos(a) * d, gy + 0.06, z + Math.sin(a) * d, 1.2 + water.rand(), WATER_FX.ripple.life * 1.3, 0.8);
        }
        water.glow(x, gy + 0.05, z, rr * 1.2, 0.5 * f, GLOW_GROUND);
      }
      this.zoneFade.setX(zc, 0.05 + 0.6 * (1 - f) * (1 - f));
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
      if (water) {
        // 水牢：一顆會晃的水泡，等人碰
        const B = WATER_FX.bubble;
        const gy = run.map.heightAt(x, z);
        const size = B.size * (tc.act.prison?.prison?.radius ?? 1) * run.stats.value.area * (1 + 0.04 * Math.sin(t * 5 + i));
        water.bubble(x, gy + 0.05 + B.bob * Math.sin(t * 2.4 + i), z, size, i * 1.9);
        water.glow(x, gy + 0.05, z, size * 0.8, 0.5, GLOW_GROUND);
      }
      if (fire) {
        // 火種：一小團火，快炸時引信的火星越噴越多
        const gy = run.map.heightAt(x, z);
        const fuse = 1 - Math.min(1, tc.seedT[i]);
        fire.flame(x, gy, z, FIRE_FX.seed.w * s, FIRE_FX.seed.h * s, i * 2.3);
        fire.glow(x, gy + 0.05, z, 1.0 + fuse, 0.6 + 0.6 * fuse, GLOW_GROUND);
        fire.emitRate(x, gy + 0.5, z, FIRE_FX.seed.sparkRate * (0.3 + fuse), dt, 0.4);
      }
    }
    this.seeds.count = fire || water ? 0 : sc;
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
      if (fire) {
        // 燒傷：身上繞著幾條火舌（不是只有頭頂一朵）、冒煙、掉火星
        const B = FIRE_FX.burning;
        const gy = run.map.heightAt(x, z);
        const sc = run.enemies.scale[e];
        for (let j = 0; j < B.tongues; j++) {
          const a = (j / B.tongues) * Math.PI * 2 + t * 1.3 + e;
          const lift = j === 0 ? 0.95 : 0.35 + 0.25 * j;
          fire.flame(x + Math.cos(a) * B.r * sc, gy + lift * sc, z + Math.sin(a) * B.r * sc, B.w * s * sc, B.h * s * sc, e * 0.71 + j * 1.3);
        }
        fire.smokeRate(x, gy + 1.6 * sc, z, B.smokeRate, dt, 0.32);
        fire.emitRate(x, gy + 1.0 * sc, z, B.sparkRate, dt, 0.4);
        fire.glow(x, gy + 0.9 * sc, z, 1.1 * sc, 0.8, GLOW_HALO);
      }
    }
    this.oil.count = fire ? 0 : oc;
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
      if (water) {
        // 間歇泉：沖天的水柱＋兩側副水柱、大量水珠往外落、底部白沫、地上漣漪
        const G = WATER_FX.geyser;
        const gy = run.map.heightAt(x, z);
        const g = 0.55 + 0.45 * f;
        water.column(x, gy, z, r * 1.9 * g, G.h * g, i * 5.3, (1 - f) * 0.8);
        water.column(x + r * 0.6, gy, z + r * 0.3, r * 1.1 * g, G.sideH * g, i * 5.3 + 1, (1 - f) * 0.8);
        water.column(x - r * 0.5, gy, z - r * 0.4, r * 1.0 * g, G.sideH * 0.85 * g, i * 5.3 + 2, (1 - f) * 0.8);
        water.emitRate(x, gy + G.h * 0.7 * g, z, G.dropRate * f, dt, r * 1.4);
        water.smokeRate(x, gy + 0.2, z, G.foamRate * f, dt, 0.5);
        if (water.rand() < 4 * dt) water.ripple(x, gy + 0.06, z, r * 2.6, WATER_FX.ripple.life);
        water.glow(x, gy + G.h * 0.4 * g, z, r * 2.4, 0.8 * f, GLOW_HALO);
      }
      if (fire && this.oni) {
        // 鬼雷：從高處劈下一道折線的閃電（一節節細長的光，位置每一小段時間換一次＝閃爍），落地炸出碎片與地上一圈光
        const T = ONI_FX.thunder;
        const gy = run.map.heightAt(x, z);
        if (f > 0.55) {
          const flick = Math.floor(run.clock / 0.06);
          const seg = T.from / T.segments;
          let ox = 0;
          let oz = 0;
          for (let s = 0; s < T.segments; s++) {
            const h0 = T.from - (s + 1) * seg;
            const nx = s === T.segments - 1 ? 0 : Math.sin(i * 12.9 + s * 7.3 + flick * 3.1) * T.jag;
            const nz = s === T.segments - 1 ? 0 : Math.cos(i * 4.1 + s * 5.7 + flick * 2.3) * T.jag;
            fire.flame(x + (ox + nx) / 2, gy + h0, z + (oz + nz) / 2, T.w * (0.7 + 0.3 * f), seg * 1.25, i * 3.1 + s, 0.1);
            ox = nx;
            oz = nz;
          }
          fire.glow(x, gy + T.from * 0.5, z, r * 2.4, f, GLOW_HALO);
        }
        if (f > 0.9) {
          fire.emitRate(x, gy + 0.3, z, T.sparks * 20, dt, r);
          if (fire.rand() < 10 * dt) fire.glints(x, gy + 0.6, z, 1, r);
        }
        fire.glow(x, gy + 0.05, z, T.ground * (0.6 + 0.4 * f), f, GLOW_GROUND);
      } else if (fire) {
        // 火柱：一條沖天的大火舌＋兩側較矮的副火，往上噴大量火星
        const P = FIRE_FX.pillar;
        const gy = run.map.heightAt(x, z);
        const g = 0.55 + 0.45 * f;
        fire.flame(x, gy, z, r * 2.4 * g, P.h * g, i * 5.3, 1 - f);
        fire.flame(x + r * 0.7, gy, z + r * 0.3, r * 1.5 * g, P.sideH * g, i * 5.3 + 1, 1 - f);
        fire.flame(x - r * 0.6, gy, z - r * 0.4, r * 1.4 * g, P.sideH * 0.85 * g, i * 5.3 + 2, 1 - f);
        fire.emitRate(x, gy + 1, z, P.sparkRate * f, dt, r);
        fire.glow(x, gy + 0.05, z, r * 3.2, f, GLOW_GROUND);
        fire.glow(x, gy + P.h * 0.45 * g, z, r * 3, 0.9 * f, GLOW_HALO);
        if (f < 0.5) fire.smokeRate(x, gy + P.h * 1.05 * g, z, P.smokeRate, dt, 0.6); // 煙從火尖上方冒（放在火裡面會變成火裡的黑塊）
      }
    }
    this.pillars.count = fire || water ? 0 : pc;
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
      this.flashes.setColorAt(fc, tc.flashKind[i] === FLASH_KINDS.ward ? this.inkLight : tc.flashKind[i] === FLASH_KINDS.pillar || tc.flashKind[i] === FLASH_KINDS.sumo ? this.black : this.ink);
      this.flashFade.setX(fc, 0.04 + 0.85 * (1 - f));
      fc++;
      if (fire && tc.flashKind[i] !== FLASH_KINDS.ward) {
        // 爆開：一圈往外倒的火舌（先竄高再縮）＋一次噴一把火星
        const B = FIRE_FX.burst;
        const gy = run.map.heightAt(x, z);
        const rise = Math.sin(Math.PI * Math.min(1, (1 - f) * 1.4));
        for (let j = 0; j < B.tongues; j++) {
          const a = (j / B.tongues) * Math.PI * 2 + i;
          const rr = tc.flashR[i] * 0.75;
          fire.flame(x + Math.cos(a) * rr, gy, z + Math.sin(a) * rr, 0.5 + rr * 0.35, (B.h + rr * 0.6) * rise, i + j * 0.37, 1 - f);
        }
        if (tc.flashLife[i] > this.prevFlash[i] + 1e-4) {
          // 剛爆開：火星、飛出去的小火團、一圈地上的火光、一朵煙；鬼火雨再加一顆從天上落下的火
          const R = tc.flashR[i];
          fire.emit(x, gy + 0.4, z, B.sparks, rr0(R), R * 1.2);
          fire.blobs(x, gy + 0.3, z, B.blobs, 2 + R * 1.5, 0.35 + R * 0.08, 0.45);
          fire.flash(x, gy + 0.06, z, R * 1.6, 1.3, 0.45, GLOW_GROUND);
          fire.flash(x, gy + 0.8, z, R * 1.1, 1, 0.25, GLOW_HALO);
          fire.smoke(x, gy + 0.9, z, B.smoke, 0.4 + R * 0.12, R * 0.4);
          if (tc.flashKind[i] === FLASH_KINDS.rain) {
            const F = FIRE_FX.rain;
            fire.part(0, x, gy + F.from, z, 0, -F.from / F.fall, 0, F.w, F.h, F.fall, 0, 0, -0.2);
          }
        }
      }
    }
    if (water) this.waterFlashes();
    for (let i = 0; i < tc.flashLife.length; i++) this.prevFlash[i] = tc.flashLife[i];
    // 河童的漩渦：兩圈反方向轉的筆刷圓（大的主色、小的墨黑），快消失時乾掉
    for (let i = 0; i < tc.vortX.length; i++) {
      if (tc.vortLife[i] <= 0) continue;
      const x = tc.vortX[i];
      const z = tc.vortZ[i];
      const f = Math.max(0, tc.vortLife[i] / tc.vortMax[i]);
      if (water) {
        // 渦流：幾個浪頭繞著中心轉、半徑一邊轉一邊縮（往內捲），不時一圈漣漪
        const V = WATER_FX.vortex;
        const gy = run.map.heightAt(x, z);
        const R = tc.vortR[i];
        for (let j = 0; j < V.crests; j++) {
          const ph = (t * 0.6 + j / V.crests) % 1;
          const a = -t * V.spin + (j / V.crests) * TAU + i;
          const rr = R * (1 - 0.65 * ph);
          water.flame(x + Math.cos(a) * rr, gy, z + Math.sin(a) * rr, V.w * (1 - 0.4 * ph), V.h * (0.6 + 0.4 * f), i * 3.3 + j, ph * 0.6 + (1 - f) * 0.4);
        }
        if (water.rand() < dt / V.rippleEvery) water.ripple(x, gy + 0.06, z, R * 1.1, WATER_FX.ripple.life, 0.9);
        water.glow(x, gy + 0.05, z, R, 0.6 * f, GLOW_GROUND);
      }
      for (let ring = 0; ring < 2 && fc < MAX_FLASHES; ring++) {
        const r = tc.vortR[i] * (ring === 0 ? 1.15 : 0.6);
        this.m.makeRotationY((ring === 0 ? -1 : 1.6) * t * 5 + i).scale(this.v.set(r, 1, r)).setPosition(x, run.map.heightAt(x, z) + DECAL_LIFT + 0.04 + ring * 0.01, z);
        this.flashes.setMatrixAt(fc, this.m);
        this.flashes.setColorAt(fc, ring === 0 ? this.ink : this.inkLight);
        this.flashFade.setX(fc, 0.04 + 0.7 * (1 - f) * (1 - f));
        fc++;
      }
    }
    this.flashes.count = fc;
    this.flashes.instanceMatrix.needsUpdate = true;
    if (this.flashes.instanceColor) this.flashes.instanceColor.needsUpdate = true;
    this.flashFade.needsUpdate = true;
  }

  /** 水：新出現的爆圈 → 相撲是正前方一排往前倒的大浪；水泡破、間歇泉落下／落地是一圈浪＋水珠＋白沫＋漣漪 */
  private waterFlashes(): void {
    const water = this.water as ElementFx;
    const run = this.run;
    const tc = run.tech;
    for (let i = 0; i < tc.flashLife.length; i++) {
      if (tc.flashLife[i] <= 0 || tc.flashLife[i] <= this.prevFlash[i] + 1e-4) continue;
      const x = tc.flashX[i];
      const z = tc.flashZ[i];
      const R = tc.flashR[i];
      const gy = run.map.heightAt(x, z);
      if (tc.flashKind[i] === FLASH_KINDS.sumo) {
        const S = WATER_FX.sumo;
        const dx = x - run.px;
        const dz = z - run.pz;
        const l = Math.hypot(dx, dz) || 1;
        const fx = dx / l;
        const fz = dz / l;
        for (let j = 0; j < S.crests; j++) {
          const o = (j / (S.crests - 1) - 0.5) * R * 1.6;
          const px = x - fz * o;
          const pz = z + fx * o;
          water.part(0, px, run.map.heightAt(px, pz), pz, fx * 3, 0, fz * 3, S.w, S.h * (1 - 0.35 * Math.abs(o / R)), 0.42, 0, 3, -0.2);
        }
        water.emit(x, gy + 0.8, z, 14, 1, 3);
        water.ripple(x, gy + 0.06, z, R * 1.8, WATER_FX.ripple.life * 1.2);
        continue;
      }
      if (tc.flashKind[i] === FLASH_KINDS.ward) continue;
      const B = WATER_FX.burst;
      for (let j = 0; j < B.tongues; j++) {
        const a = (j / B.tongues) * TAU + water.rand();
        water.part(0, x, gy, z, Math.cos(a) * (2 + R), 0, Math.sin(a) * (2 + R), 0.45 + R * 0.12, B.h + R * 0.3, 0.4, 0, 4, -0.2);
      }
      water.emit(x, gy + 0.6, z, B.drops, 1, 1.5 + R);
      water.smoke(x, gy + 0.4, z, B.foam, 0.45 + R * 0.1, R * 0.4);
      water.ripple(x, gy + 0.06, z, R * 1.7, WATER_FX.ripple.life * 1.2);
    }
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
