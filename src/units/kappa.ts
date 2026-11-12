import * as THREE from 'three';
import { palette } from '../art/palette';
import { soft, glow, haloTexture } from '../art/materials';
import { ball, lathe, limb, mesh } from '../art/shapes';
import { addChibiFace } from './chibiFace';
import type { Character } from './lanternMonk';

/**
 * 河童（docs/04 第 1.2 節）：D72 日系 Q 版——大頭、大眼睛、黃色鳥嘴、頭頂白盤子（裝著水）＋一圈深綠的瀏海、
 * 背後龜殼、淺色肚子，右手端著一個發亮的水盤。
 * 約定同提燈小僧：腳底 y = 0、臉朝 +z；尺寸寫成常數。
 */
export const KAPPA = { bodyR: 0.32, bodyY: 0.38, headR: 0.36, headY: 0.94, dishR: 0.2, discR: 0.2 } as const;

export function buildKappa(): Character {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T) => (geos.push(x), x);
  const m = <T extends THREE.Material>(x: T) => (mats.push(x), x);

  const skinMat = m(soft(palette.yokai.kappa.body));
  const bellyMat = m(soft('#d9ecc0'));
  const shellMat = m(soft('#7a6a3e'));
  const shellRimMat = m(soft('#a8925a'));
  const hairMat = m(soft('#2f6a4e'));
  const beakMat = m(soft(palette.yokai.kappa.accent));
  // 頭上的水、手上的水盤：只發一點光（以前發光太強，頭上一團白）
  const waterMat = m(glow('#58b4d6', 0.45));
  const dishMat = m(soft('#eef6f2'));

  // 身體：圓滾滾、淺色肚子、背後龜殼（帶一圈淺色殼緣）
  const torso = mesh(g(ball(KAPPA.bodyR, 24, 16)), skinMat);
  torso.scale.set(1.05, 1.05, 0.95);
  torso.position.y = KAPPA.bodyY;
  const belly = mesh(g(ball(KAPPA.bodyR * 0.75, 18, 12)), bellyMat, false);
  belly.scale.set(1, 1.05, 0.5);
  belly.position.set(0, KAPPA.bodyY - 0.02, KAPPA.bodyR * 0.62);
  const shell = mesh(g(ball(KAPPA.bodyR * 0.95, 22, 14)), shellMat);
  shell.scale.set(1.08, 1.05, 0.55);
  shell.position.set(0, KAPPA.bodyY + 0.04, -KAPPA.bodyR * 0.62);
  const rim = mesh(g(new THREE.TorusGeometry(KAPPA.bodyR * 0.95, 0.04, 8, 24)), shellRimMat, false);
  rim.scale.set(1.08, 1.05, 1);
  rim.position.set(0, KAPPA.bodyY + 0.04, -KAPPA.bodyR * 0.45);
  // 大頭＋臉＋鳥嘴
  const head = mesh(g(ball(KAPPA.headR, 28, 20)), skinMat);
  head.scale.set(1.03, 0.97, 1);
  head.position.y = KAPPA.headY;
  addChibiFace(body, { headY: KAPPA.headY, headR: KAPPA.headR, eyeY: 0.02, iris: '#1f3a32', mouth: false }, { g, m });
  const beak = mesh(g(ball(0.1, 14, 10)), beakMat, false, false);
  beak.scale.set(1.35, 0.6, 0.9);
  beak.position.set(0, KAPPA.headY - 0.13, KAPPA.headR * 0.9);
  // 頭頂：一圈深綠瀏海（一顆顆小圓球圍成一圈）＋白盤子＋盤中的水
  const hairGeo = g(ball(0.075, 10, 8));
  const hairY = KAPPA.headY + KAPPA.headR * 0.62;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const h = mesh(hairGeo, hairMat, false);
    h.position.set(Math.sin(a) * KAPPA.headR * 0.78, hairY - (Math.cos(a) > 0.6 ? 0.04 : 0), Math.cos(a) * KAPPA.headR * 0.78);
    h.scale.set(1, 1.3, 1);
    body.add(h);
  }
  const dish = mesh(g(lathe([[0, 0.0], [KAPPA.dishR, 0.0], [KAPPA.dishR * 1.05, 0.04], [KAPPA.dishR * 0.8, 0.055], [0, 0.03]], { radius: 0.02, segments: 24 })), dishMat, false);
  dish.position.y = KAPPA.headY + KAPPA.headR * 0.86;
  const water = mesh(g(ball(KAPPA.dishR * 0.75, 14, 8)), waterMat, false, false);
  water.scale.set(1, 0.18, 1);
  water.position.y = KAPPA.headY + KAPPA.headR * 0.86 + 0.045;
  // 短手：左手垂著、右手端水盤
  const armL = limb(new THREE.Vector3(-KAPPA.bodyR * 0.85, KAPPA.bodyY + 0.1, 0.02), new THREE.Vector3(-KAPPA.bodyR - 0.1, KAPPA.bodyY - 0.06, 0.08), 0.06, skinMat, false);
  const armR = limb(new THREE.Vector3(KAPPA.bodyR * 0.85, KAPPA.bodyY + 0.1, 0.02), new THREE.Vector3(KAPPA.bodyR + 0.16, KAPPA.bodyY + 0.2, 0.16), 0.06, skinMat, false);
  // 腳：兩顆小圓球（黃色蹼），走路時輪流擺動
  const footGeo = g(ball(0.1, 12, 8));
  const feet = [-1, 1].map((sx) => {
    const f = mesh(footGeo, beakMat, false);
    f.position.set(sx * 0.13, 0.08, 0.03);
    f.scale.set(1, 0.65, 1.4);
    root.add(f);
    return f;
  });
  // 水盤：右手上方一個發亮的小圓盤，繞著轉
  const disc = new THREE.Group();
  const discBody = mesh(g(ball(KAPPA.discR, 20, 10)), waterMat, false, false);
  discBody.scale.set(1, 0.22, 1);
  const halo = new THREE.Sprite(
    m(new THREE.SpriteMaterial({ map: haloTexture(), color: '#7fd6e8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.1 })) as THREE.SpriteMaterial,
  );
  halo.scale.setScalar(KAPPA.discR * 3.5);
  disc.add(discBody, halo);
  const discY = KAPPA.bodyY + 0.36;
  disc.position.set(KAPPA.bodyR + 0.2, discY, 0.2);
  body.add(torso, belly, shell, rim, head, beak, dish, water, armL, armR, disc);

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
      feet[0].position.z = 0.03 + (moving ? Math.sin(phase) * 0.14 * w : 0);
      feet[1].position.z = 0.03 + (moving ? -Math.sin(phase) * 0.14 * w : 0);
      feet[0].position.y = 0.08 + (moving ? Math.max(0, Math.sin(phase)) * 0.06 * w : 0);
      feet[1].position.y = 0.08 + (moving ? Math.max(0, -Math.sin(phase)) * 0.06 * w : 0);
      disc.rotation.y = t * 3.2;
      disc.position.y = discY + Math.sin(t * 2.6) * 0.025;
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
