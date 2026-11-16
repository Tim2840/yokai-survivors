import * as THREE from 'three';
import { fxOf } from '../art/palette';
import { ultById } from '../data/ultimates';
import type { Run } from '../game/run';
import { FIRE_FX, WATER_FX, vfxStyleOf } from '../data/vfx';
import { GLOW_GROUND, GLOW_HALO, type ElementFx } from './elementFx';

const LIFE = 0.7;
type FxType = 'nova' | 'frenzy' | 'bulwark' | 'beam';

interface Fx {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  type: FxType;
  at: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
  size: number;
}

/** 大招發動的外觀（擴散的光環、光束、護罩）：讀 Run.lastCast／shieldUntil，每幀不配置，用固定數量的物件 */
export class UltFx {
  readonly group = new THREE.Group();
  private readonly fx: Fx[] = [];
  private readonly dome: THREE.Mesh;
  private readonly domeMat: THREE.MeshBasicMaterial;
  /** 這隻妖怪的特效色（D65：通用特效不寫死火的顏色） */
  private readonly colors: Record<FxType, string>;
  private seen = -1;
  private next = 0;
  private readonly disposables: { dispose(): void }[] = [];
  /** 火（D91）：大火圈（往外擴散的一圈火舌），最多同時 4 個；狐火之舞、護罩每幀直接畫 */
  private readonly nAt = new Float32Array(4).fill(-99);
  private readonly nX = new Float32Array(4);
  private readonly nZ = new Float32Array(4);
  private readonly nR = new Float32Array(4);
  private readonly nBig = new Uint8Array(4);
  private nNext = 0;

  /** 水（河童）：同一套大火圈／護罩的畫法換成浪（數字在 WATER_FX.ult） */
  private readonly water: boolean;

  constructor(private readonly run: Run, private readonly fire: ElementFx | null = null) {
    this.water = vfxStyleOf(run.yokai.id) === 'water';
    const c = fxOf(run.yokai.id);
    this.colors = { nova: c.main, frenzy: c.mid, bulwark: c.accent, beam: '#c08cff' };
    const ring = new THREE.RingGeometry(0.88, 1, 56).rotateX(-Math.PI / 2);
    const beam = new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1, true).rotateZ(Math.PI / 2).translate(0.5, 0, 0);
    this.disposables.push(ring, beam);
    for (let i = 0; i < 8; i++) {
      const isBeam = i >= 6;
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(isBeam ? beam : ring, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.disposables.push(mat);
      this.fx.push({ mesh, mat, type: isBeam ? 'beam' : 'nova', at: -99, x: 0, z: 0, dx: 1, dz: 0, size: 1 });
    }
    const dg = new THREE.SphereGeometry(1.7, 20, 14);
    this.domeMat = new THREE.MeshBasicMaterial({ color: c.accent, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    this.dome = new THREE.Mesh(dg, this.domeMat);
    this.dome.visible = false;
    this.group.add(this.dome);
    this.disposables.push(dg, this.domeMat);
  }

  private spawn(type: FxType, x: number, z: number, dx: number, dz: number, size: number): void {
    const isBeam = type === 'beam';
    const pool = isBeam ? [6, 7] : [0, 1, 2, 3, 4, 5];
    const f = this.fx[pool[this.next++ % pool.length]];
    f.type = type;
    f.at = this.run.clock;
    f.x = x;
    f.z = z;
    f.dx = dx;
    f.dz = dz;
    f.size = size;
    f.mat.color.set(this.colors[type]);
    f.mesh.visible = true;
  }

  /** 火的大火圈：發動那一下竄起一根火柱、往外噴火星與煙，接著一圈火舌往外擴散到 r */
  private fireNova(x: number, z: number, r: number, big: boolean): void {
    const fire = this.fire as ElementFx;
    const k = this.nNext++ % 4;
    this.nAt[k] = this.run.clock;
    this.nX[k] = x;
    this.nZ[k] = z;
    this.nR[k] = r;
    this.nBig[k] = big ? 1 : 0;
    const N = this.water ? WATER_FX.ult.nova : FIRE_FX.ult.nova;
    const gy = this.run.map.heightAt(x, z);
    const m = big ? 1 : 0.6;
    const sparks = 'drops' in N ? N.drops : N.sparks;
    const smoke = 'foam' in N ? N.foam : N.smoke;
    if (this.water) {
      // 浪：地上一圈一圈的漣漪往外推
      fire.ripple(x, gy + 0.06, z, r * 1.1, N.life * 1.2, 1.4);
      fire.ripple(x, gy + 0.06, z, r * 0.6, N.life, 1.2);
    }
    // 大火圈：中央竄起一根火柱；護罩只有往外推的火圈（中央不蓋住角色）
    if (big) {
      fire.flare(x, gy, z, 2.2, N.column, 0.7, 0.2);
      fire.flash(x, gy + 1.5, z, 3.5, 1.1, 0.4, GLOW_HALO);
    }
    fire.emit(x, gy + 1, z, sparks * m, 1.5, 7 * m);
    fire.glints(x, gy + 1, z, N.glints * m, 2.5);
    fire.flash(x, gy + 0.06, z, r * 1.2, 1.6 * m, 0.8, GLOW_GROUND);
    // 煙往外推成一圈（護罩的少一點）
    const ns = Math.floor(smoke * m * m);
    for (let j = 0; j < ns; j++) {
      const a = (j / ns) * Math.PI * 2 + fire.rand();
      fire.part(3, x + Math.cos(a), gy + 0.6, z + Math.sin(a), Math.cos(a) * r * 1.4, 1.2, Math.sin(a) * r * 1.4, 0.7, 0.7, 0.9, 0, 1.6, 1.3);
    }
  }

  update(dt = 0): void {
    const run = this.run;
    const fire = this.fire;
    const c = run.lastCast;
    if (c && c.at !== this.seen) {
      this.seen = c.at;
      for (const id of c.ids) {
        const e = ultById(id).effect;
        const rm = run.ultModsView.radius;
        const y = run.map.heightAt(c.x, c.z);
        void y;
        if (fire && (e.type === 'nova' || e.type === 'bulwark')) this.fireNova(c.x, c.z, e.radius * rm * run.stats.value.area, e.type === 'nova');
        else if (fire && e.type === 'frenzy') fire.flash(c.x, run.map.heightAt(c.x, c.z) + 0.06, c.z, 4, 1.4, 0.6, GLOW_GROUND);
        else if (e.type === 'nova' || e.type === 'bulwark') this.spawn(e.type, c.x, c.z, c.dx, c.dz, e.radius * rm * run.stats.value.area);
        else if (e.type === 'frenzy') this.spawn('frenzy', c.x, c.z, c.dx, c.dz, 3);
        else this.spawn('beam', c.x, c.z, c.dx, c.dz, e.length * rm);
      }
    }
    for (const f of this.fx) {
      const age = run.clock - f.at;
      if (age < 0 || age > LIFE) {
        f.mesh.visible = false;
        continue;
      }
      const u = age / LIFE;
      f.mat.opacity = (1 - u) * 0.8;
      const gy = run.map.heightAt(f.x, f.z) + 0.25;
      if (f.type === 'beam') {
        f.mesh.position.set(run.px, run.py + 1, run.pz);
        f.mesh.rotation.set(0, -Math.atan2(f.dz, f.dx), 0);
        const w = 2.4 * (1 - u * 0.5);
        f.mesh.scale.set(f.size, w, w);
      } else {
        // 光環貼在發動時的位置（自由視角下看得清楚）；擴散到 size
        f.mesh.position.set(f.x, gy, f.z);
        f.mesh.rotation.set(0, 0, 0);
        const r = f.size * Math.min(1, u * 2.2 + 0.08);
        f.mesh.scale.set(r, 1, r);
      }
    }
    if (fire) this.updateFire(dt);
    const shield = run.clock < run.shieldUntil;
    this.dome.visible = shield && !fire;
    if (shield) {
      this.dome.position.set(run.px, run.py + 1, run.pz);
      this.domeMat.opacity = 0.18 + 0.08 * Math.sin(run.clock * 10);
    }
  }

  /** 火的大招每幀：擴散中的大火圈、狐火之舞（身邊繞著飛的火）、護罩（一圈火牆） */
  private updateFire(dt: number): void {
    const run = this.run;
    const fire = this.fire as ElementFx;
    const N = this.water ? WATER_FX.ult.nova : FIRE_FX.ult.nova;
    for (let k = 0; k < 4; k++) {
      const age = run.clock - this.nAt[k];
      if (age < 0 || age > N.life) continue;
      const u = age / N.life;
      const x = this.nX[k];
      const z = this.nZ[k];
      const R = this.nR[k] * (1 - (1 - u) * (1 - u) * (1 - u));
      const m = this.nBig[k] ? 1 : 0.6;
      const n = Math.max(12, Math.round(N.tongues * Math.min(1.4, this.nR[k] / 9)));
      const hh = N.h * m * Math.pow(1 - u, 0.6);
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + k;
        const tx = x + Math.cos(a) * R;
        const tz = z + Math.sin(a) * R;
        const v = 0.7 + 0.3 * Math.sin(j * 2.3 + k);
        fire.flame(tx, run.map.heightAt(tx, tz), tz, N.w * m * v, hh * v, j * 1.7 + k, u * 0.8);
      }
      fire.glow(x, run.map.heightAt(x, z) + 0.06, z, R * 1.15, 1.2 * (1 - u), GLOW_GROUND);
    }
    // 狐火之舞：幾團火繞著身體螺旋往上飄
    if (run.frenzyUntil > run.clock) {
      const F = FIRE_FX.ult.frenzy;
      const gy = run.map.heightAt(run.px, run.pz);
      for (let j = 0; j < F.wisps; j++) {
        const a = run.clock * 3.2 + (j / F.wisps) * Math.PI * 2;
        const h = ((run.clock * 0.8 + j / F.wisps) % 1) * F.rise;
        const r = F.r * (1 - 0.3 * h / F.rise);
        const x = run.px + Math.cos(a) * r;
        const z = run.pz + Math.sin(a) * r;
        fire.flame(x, gy + 0.2 + h, z, F.w, F.h, j * 2.1, h / F.rise * 0.6);
        fire.glow(x, gy + 0.6 + h, z, 0.9, 0.8, GLOW_HALO);
      }
      fire.emitRate(run.px, gy + 1, run.pz, F.sparkRate, dt, 1.2);
      fire.glow(run.px, gy + 0.05, run.pz, F.r * 1.6, 0.7, GLOW_GROUND);
    }
    // 護罩：一圈火牆繞著轉
    if (run.clock < run.shieldUntil) {
      const S = this.water ? WATER_FX.ult.shield : FIRE_FX.ult.shield;
      const gy = run.map.heightAt(run.px, run.pz);
      if (this.water) {
        // 雨乞：身邊下雨（水珠從天上直直落下）、地上不時起漣漪
        const W = WATER_FX.ult.shield;
        const n = Math.floor(W.rain * dt + fire.rand());
        for (let j = 0; j < n; j++) {
          const a = fire.rand() * Math.PI * 2;
          const d = Math.sqrt(fire.rand()) * W.rainR;
          fire.part(1, run.px + Math.cos(a) * d, gy + W.rainFrom, run.pz + Math.sin(a) * d, 0, -14, 0, 0.09, 0.3, 0.45, 0, 0, 0);
        }
        if (fire.rand() < 6 * dt) {
          const a = fire.rand() * Math.PI * 2;
          const d = Math.sqrt(fire.rand()) * W.rainR;
          fire.ripple(run.px + Math.cos(a) * d, gy + 0.06, run.pz + Math.sin(a) * d, 0.9, 0.5, 0.8);
        }
      }
      for (let j = 0; j < S.tongues; j++) {
        const a = (j / S.tongues) * Math.PI * 2 - run.clock * 1.4;
        const v = 0.85 + 0.15 * Math.sin(run.clock * 5 + j * 1.9);
        fire.flame(run.px + Math.cos(a) * S.r, gy, run.pz + Math.sin(a) * S.r, S.w, S.h * v, j * 1.3);
      }
      if ('sparkRate' in S) fire.emitRate(run.px, gy + 1, run.pz, S.sparkRate, dt, S.r);
      fire.glow(run.px, gy + 0.05, run.pz, S.r * 1.7, 1, GLOW_GROUND);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
