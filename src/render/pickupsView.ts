import { markOverlay } from './overlay';
import * as THREE from 'three';
import { palette } from '../art/palette';
import { glow, soft } from '../art/materials';
import { ball, roundedCylinder, teardrop } from '../art/shapes';
import { PICKUP_KINDS, PICKUP_RULES } from '../data/pickups';
import type { Run } from '../game/run';

/**
 * 補給品的外觀（D39）：每個池位有七種模型（只顯示對應的那一個）＋地上的小光圈；上下浮動、慢慢轉。
 * 雷鼓：以玩家為中心擴散的金色環；雪女的吐息：冰藍色環。每幀不配置。
 */
interface Slot {
  root: THREE.Group;
  models: THREE.Object3D[];
  disc: THREE.Mesh;
  discMat: THREE.MeshBasicMaterial;
}

const LIFT = 0.12;
/** 外觀放大倍率：預設鏡頭距離下小東西要看得清楚 */
const VIEW_SCALE = 1.4;
const FLASH_SECONDS = 0.7;

export class PickupsView {
  readonly group = new THREE.Group();
  private readonly slots: Slot[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly flash: THREE.Mesh;
  private readonly flashMat: THREE.MeshBasicMaterial;
  private readonly discColor: THREE.Color[];

  constructor(private readonly run: Run) {
    const P = palette.pickup;
    const mat = (c: string) => soft(c);
    const mPink = mat(P.dangoPink);
    const mWhite = mat(P.dangoWhite);
    const mGreen = mat(P.dangoGreen);
    const mStick = mat(P.stick);
    const mRice = mat(P.rice);
    const mNori = mat(P.nori);
    const mBottle = mat(P.bottle);
    const mRed = mat(P.red);
    const mGold = glow(P.gold, 1.4);
    const mDrum = mat(P.drum);
    const mYuki = glow(P.yuki, 1.8);
    const gDango = ball(0.13, 14, 10);
    const gStick = new THREE.CylinderGeometry(0.025, 0.025, 0.75, 6);
    const gRice = ball(0.3, 16, 12).scale(1, 0.92, 0.6);
    const gNori = ball(0.2, 12, 8).scale(1.25, 0.55, 0.66);
    const gBottle = roundedCylinder(0.12, 0.19, 0.42, 0.08, 16);
    const gNeck = roundedCylinder(0.05, 0.07, 0.16, 0.03, 12);
    const gBand = new THREE.TorusGeometry(0.17, 0.035, 8, 18).rotateX(Math.PI / 2);
    const gBell = roundedCylinder(0.1, 0.24, 0.34, 0.08, 18);
    const gClapper = ball(0.07, 10, 8);
    const gTassel = teardrop(0.06, 0.2, { bulge: 0.5 });
    const gDrum = roundedCylinder(0.26, 0.26, 0.3, 0.06, 20);
    const gRim = new THREE.TorusGeometry(0.26, 0.04, 8, 22).rotateX(Math.PI / 2);
    const gWisp = teardrop(0.2, 0.55, { bulge: 0.5 });
    const gFlake = ball(0.06, 8, 6);
    const gCoin = new THREE.CylinderGeometry(0.24, 0.24, 0.05, 24).rotateX(Math.PI / 2).scale(0.72, 1, 1);
    const gDisc = new THREE.CircleGeometry(0.45, 24).rotateX(-Math.PI / 2);
    this.disposables.push(mPink, mWhite, mGreen, mStick, mRice, mNori, mBottle, mRed, mGold, mDrum, mYuki, gDango, gStick, gRice, gNori, gBottle, gNeck, gBand, gBell, gClapper, gTassel, gDrum, gRim, gWisp, gFlake, gCoin, gDisc);
    this.discColor = PICKUP_KINDS.map((k) => new THREE.Color(k === 'dango' || k === 'onigiri' || k === 'sake' ? P.glowHeal : k === 'yukiBreath' ? P.glowIce : P.glowTool));

    for (let i = 0; i < run.pickups.capacity; i++) {
      const root = new THREE.Group();
      // 三色糰子：竹籤＋粉白綠三顆
      const dango = new THREE.Group();
      const st = new THREE.Mesh(gStick, mStick);
      dango.add(st);
      [mPink, mWhite, mGreen].forEach((m, k) => {
        const b = new THREE.Mesh(gDango, m);
        b.position.y = 0.2 - k * 0.22;
        dango.add(b);
      });
      dango.rotation.z = 0.35;
      // 飯糰：白飯＋海苔
      const onigiri = new THREE.Group();
      const rice = new THREE.Mesh(gRice, mRice);
      const nori = new THREE.Mesh(gNori, mNori);
      nori.position.set(0, -0.14, 0.04);
      onigiri.add(rice, nori);
      // 御神酒：白瓶、紅帶、細頸
      const sake = new THREE.Group();
      const bottle = new THREE.Mesh(gBottle, mBottle);
      bottle.position.y = -0.21;
      const neck = new THREE.Mesh(gNeck, mBottle);
      neck.position.y = 0.2;
      const band = new THREE.Mesh(gBand, mRed);
      band.position.y = 0.0;
      sake.add(bottle, neck, band);
      // 招魂鈴：金鈴＋鈴舌＋紅流蘇
      const bell = new THREE.Group();
      const shell = new THREE.Mesh(gBell, mGold);
      shell.position.y = -0.12;
      const clap = new THREE.Mesh(gClapper, mGold);
      clap.position.y = -0.2;
      const tassel = new THREE.Mesh(gTassel, mRed);
      tassel.position.y = 0.22;
      bell.add(shell, clap, tassel);
      // 雷鼓：朱紅鼓身＋金框（鼓面朝前）
      const drum = new THREE.Group();
      const body = new THREE.Mesh(gDrum, mDrum);
      body.position.y = -0.15;
      const r1 = new THREE.Mesh(gRim, mGold);
      r1.position.y = 0.15;
      const r2 = new THREE.Mesh(gRim, mGold);
      r2.position.y = -0.15;
      drum.add(body, r1, r2);
      drum.rotation.x = Math.PI / 2;
      // 雪女的吐息：冰藍色的一縷氣＋三片雪
      const yuki = new THREE.Group();
      const wisp = new THREE.Mesh(gWisp, mYuki);
      wisp.position.y = -0.25;
      yuki.add(wisp);
      for (let k = 0; k < 3; k++) {
        const f = new THREE.Mesh(gFlake, mYuki);
        const a = (k / 3) * Math.PI * 2;
        f.position.set(Math.cos(a) * 0.3, 0.05 * k, Math.sin(a) * 0.3);
        yuki.add(f);
      }
      // 小判：金色橢圓
      const koban = new THREE.Mesh(gCoin, mGold);
      const models = [dango, onigiri, sake, bell, drum, yuki, koban];
      const discMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const disc = new THREE.Mesh(gDisc, discMat);
      disc.renderOrder = 2;
      this.disposables.push(discMat);
      root.add(...models, disc);
      root.visible = false;
      root.scale.setScalar(VIEW_SCALE);
      this.group.add(root);
      this.slots.push({ root, models, disc, discMat });
    }
    // 雷鼓／雪女的吐息的擴散環
    const gf = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
    this.flashMat = new THREE.MeshBasicMaterial({ color: P.gold, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.flash = new THREE.Mesh(gf, this.flashMat);
    this.flash.visible = false;
    this.flash.renderOrder = 3;
    markOverlay(this.flash); // 雷鼓、雪女的吐息擴散的範圍環：指示範圍，不像素化
    this.group.add(this.flash);
    this.disposables.push(gf, this.flashMat);
  }

  update(t: number): void {
    const p = this.run.pickups;
    const map = this.run.map;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const on = p.alive[i] === 1;
      s.root.visible = on && !(p.blinking(i) && Math.floor(t * 6) % 2 === 0);
      if (!on) continue;
      const k = p.kind[i];
      for (let m = 0; m < s.models.length; m++) s.models[m].visible = m === k;
      const y = map.heightAt(p.x[i], p.z[i]);
      s.root.position.set(p.x[i], y, p.z[i]);
      const model = s.models[k];
      model.position.y = 0.55 + Math.sin(t * 2.4 + i) * 0.1;
      model.rotation.y = t * 1.5 + i;
      s.disc.position.y = LIFT / VIEW_SCALE;
      s.discMat.color.copy(this.discColor[k]);
      s.discMat.opacity = 0.35 + 0.15 * Math.sin(t * 3 + i);
    }
    // 擴散環：雷鼓（金）優先，否則雪女的吐息（冰藍，剛撿到時）
    const run = this.run;
    const th = run.lastThunder;
    const pk = run.lastPickup;
    let x = 0;
    let z = 0;
    let r = 0;
    let age = Infinity;
    if (th && run.clock - th.at < FLASH_SECONDS) {
      age = run.clock - th.at;
      x = th.x;
      z = th.z;
      r = th.r;
      this.flashMat.color.set(palette.pickup.gold);
    } else if (pk && pk.kind === 'yukiBreath' && run.clock - pk.at < FLASH_SECONDS) {
      age = run.clock - pk.at;
      x = run.px;
      z = run.pz;
      r = PICKUP_RULES.freezeFxRadius;
      this.flashMat.color.set(palette.pickup.yuki);
    }
    this.flash.visible = age < FLASH_SECONDS;
    if (this.flash.visible) {
      const u = age / FLASH_SECONDS;
      this.flash.position.set(x, map.heightAt(x, z) + 0.3, z);
      this.flash.scale.setScalar(Math.max(0.01, r * (0.2 + 0.8 * u)));
      this.flashMat.opacity = 0.8 * (1 - u);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
