import * as THREE from 'three';
import { palette } from '../art/palette';
import { ULT_RECIPES } from '../data/ultimates';
import type { Run } from '../game/run';

const LIFE = 0.7;
const COLORS = { nova: palette.fire.torch, frenzy: palette.fire.ghost, bulwark: palette.fire.soul, beam: '#c08cff' } as const;

interface Fx {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  type: keyof typeof COLORS;
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
  private seen = -1;
  private next = 0;
  private readonly disposables: { dispose(): void }[] = [];

  constructor(private readonly run: Run) {
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
    this.domeMat = new THREE.MeshBasicMaterial({ color: palette.fire.soul, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    this.dome = new THREE.Mesh(dg, this.domeMat);
    this.dome.visible = false;
    this.group.add(this.dome);
    this.disposables.push(dg, this.domeMat);
  }

  private spawn(type: keyof typeof COLORS, x: number, z: number, dx: number, dz: number, size: number): void {
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
    f.mat.color.set(COLORS[type]);
    f.mesh.visible = true;
  }

  update(): void {
    const run = this.run;
    const c = run.lastCast;
    if (c && c.at !== this.seen) {
      this.seen = c.at;
      for (const id of c.ids) {
        const e = ULT_RECIPES.find((r) => r.id === id)!.effect;
        const y = run.map.heightAt(c.x, c.z);
        void y;
        if (e.type === 'nova' || e.type === 'bulwark') this.spawn(e.type, c.x, c.z, c.dx, c.dz, e.radius * run.stats.value.area);
        else if (e.type === 'frenzy') this.spawn('frenzy', c.x, c.z, c.dx, c.dz, 3);
        else this.spawn('beam', c.x, c.z, c.dx, c.dz, e.length);
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
    const shield = run.clock < run.shieldUntil;
    this.dome.visible = shield;
    if (shield) {
      this.dome.position.set(run.px, run.py + 1, run.pz);
      this.domeMat.opacity = 0.18 + 0.08 * Math.sin(run.clock * 10);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
