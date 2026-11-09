import * as THREE from 'three';
import { palette } from '../art/palette';
import { soft, glow, haloTexture } from '../art/materials';
import { ball, lathe, limb, mesh } from '../art/shapes';
import type { Character } from './lanternMonk';

/**
 * 河童（docs/04 第 1.2 節，M2-3 簡易版）：圓滾滾的綠色小孩、頭頂一個裝水的盤子、背後龜殼、尖尖的小嘴，手上端著一個發亮的水盤。
 * 約定同提燈小僧：腳底 y = 0、臉朝 +z；尺寸寫成常數。
 */
export const KAPPA = { bodyR: 0.4, bodyY: 0.44, headR: 0.28, headY: 1.0, dishR: 0.2, discR: 0.2 } as const;

export function buildKappa(): Character {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T) => (geos.push(x), x);
  const m = <T extends THREE.Material>(x: T) => (mats.push(x), x);

  const skinMat = m(soft(palette.yokai.kappa.body));
  const shellMat = m(soft('#6b8f4e'));
  const beakMat = m(soft(palette.yokai.kappa.accent));
  const darkMat = m(soft('#2b2b30'));
  const waterMat = m(glow('#7fd6e8', 1.6));
  const dishMat = m(soft('#e8f3f0'));

  // 身體：胖胖的水滴形，背後一片龜殼
  const torso = mesh(g(ball(KAPPA.bodyR, 28, 18)), skinMat);
  torso.scale.set(1, 1.1, 0.95);
  torso.position.y = KAPPA.bodyY;
  const shell = mesh(g(ball(KAPPA.bodyR * 0.9, 24, 16)), shellMat);
  shell.scale.set(1.05, 1, 0.55);
  shell.position.set(0, KAPPA.bodyY + 0.04, -KAPPA.bodyR * 0.62);
  // 頭、眼睛、嘴
  const head = mesh(g(ball(KAPPA.headR, 26, 18)), skinMat);
  head.position.y = KAPPA.headY;
  const eyeGeo = g(ball(0.045, 10, 8));
  for (const sx of [-1, 1]) {
    const white = mesh(g(ball(0.07, 12, 8)), dishMat, false, false);
    white.position.set(sx * 0.1, KAPPA.headY + 0.05, KAPPA.headR * 0.88);
    const eye = mesh(eyeGeo, darkMat, false, false);
    eye.position.set(sx * 0.1, KAPPA.headY + 0.05, KAPPA.headR * 0.88 + 0.05);
    body.add(white, eye);
  }
  const beak = mesh(g(ball(0.09, 12, 8)), beakMat, false, false);
  beak.scale.set(1.3, 0.7, 1);
  beak.position.set(0, KAPPA.headY - 0.08, KAPPA.headR * 0.95);
  // 頭頂的盤子（凹形）＋盤中的水
  const dish = mesh(g(lathe([[0, 0.0], [KAPPA.dishR, 0.0], [KAPPA.dishR * 1.05, 0.04], [KAPPA.dishR * 0.8, 0.055], [0, 0.03]], { radius: 0.02, segments: 24 })), dishMat, false);
  dish.position.y = KAPPA.headY + KAPPA.headR * 0.88;
  const water = mesh(g(ball(KAPPA.dishR * 0.75, 14, 8)), waterMat, false, false);
  water.scale.set(1, 0.18, 1);
  water.position.y = KAPPA.headY + KAPPA.headR * 0.88 + 0.045;
  // 腳：兩顆小圓球，走路時輪流擺動
  const footGeo = g(ball(0.11, 12, 8));
  const feet = [-1, 1].map((sx) => {
    const f = mesh(footGeo, beakMat, false);
    f.position.set(sx * 0.15, 0.09, 0.03);
    f.scale.set(1, 0.7, 1.4);
    root.add(f);
    return f;
  });
  // 水盤：右手端著一個發亮的小圓盤，繞著手轉
  const disc = new THREE.Group();
  const arm = limb(new THREE.Vector3(KAPPA.bodyR * 0.8, KAPPA.bodyY + 0.15, 0.05), new THREE.Vector3(0.5, KAPPA.bodyY + 0.36, 0.18), 0.055, skinMat, false);
  const discBody = mesh(g(ball(KAPPA.discR, 20, 10)), waterMat, false, false);
  discBody.scale.set(1, 0.22, 1);
  const halo = new THREE.Sprite(
    m(new THREE.SpriteMaterial({ map: haloTexture(), color: '#7fd6e8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 })) as THREE.SpriteMaterial,
  );
  halo.scale.setScalar(KAPPA.discR * 5);
  disc.add(discBody, halo);
  disc.position.set(0.52, KAPPA.bodyY + 0.34, 0.2);
  body.add(torso, shell, head, beak, dish, water, arm, disc);

  const flashMats = [skinMat, shellMat, beakMat] as THREE.MeshStandardMaterial[];
  const baseEm = flashMats.map((x) => x.emissive.clone());
  let flash = 0;

  return {
    root,
    update(dt, t, moving, speed) {
      const w = moving ? Math.min(1.4, speed / 4.6) : 0;
      const phase = t * 12;
      body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.07 * w : Math.sin(t * 2.2) * 0.012;
      body.rotation.z = moving ? Math.sin(phase) * 0.08 * w : 0;
      const sq = moving ? 1 - Math.abs(Math.cos(phase)) * 0.04 * w : 1 + Math.sin(t * 2.2) * 0.01;
      body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      feet[0].position.z = 0.03 + (moving ? Math.sin(phase) * 0.15 * w : 0);
      feet[1].position.z = 0.03 + (moving ? -Math.sin(phase) * 0.15 * w : 0);
      feet[0].position.y = 0.09 + (moving ? Math.max(0, Math.sin(phase)) * 0.06 * w : 0);
      feet[1].position.y = 0.09 + (moving ? Math.max(0, -Math.sin(phase)) * 0.06 * w : 0);
      // 水盤在手上轉、微微上下
      disc.rotation.y = t * 3.2;
      disc.position.y = KAPPA.bodyY + 0.34 + Math.sin(t * 2.6) * 0.025;
      if (flash > 0) {
        flash = Math.max(0, flash - 4 * dt);
        flashMats.forEach((mm, i) => mm.emissive.copy(baseEm[i]).addScalar(flash * 0.9));
      }
    },
    setFlash(v) {
      flash = v;
    },
    dispose() {
      for (const x of geos) x.dispose();
      for (const x of mats) x.dispose();
      root.removeFromParent();
    },
  };
}
