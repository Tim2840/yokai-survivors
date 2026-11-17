import * as THREE from 'three';
import { palette } from '../art/palette';
import { soft } from '../art/materials';
import { ball, lathe, limb, mesh } from '../art/shapes';
import { addChibiFace } from './chibiFace';
import type { Character } from './lanternMonk';

/**
 * 赤鬼（docs/35、docs/04 第 1.3 節）：程式建的舊模型（Blender 模型載好之前顯示）。日系 Q 版——大頭、大眼睛、紅皮膚、
 * 頭頂兩根圓頭的角、深色捲髮、虎皮腰布（黃底深色條紋）、右手扛一根有釘的金棒。
 * 約定同提燈小僧：腳底 y = 0、臉朝 +z；尺寸寫成常數。
 */
export const AKA_ONI = { bodyR: 0.34, bodyY: 0.4, headR: 0.36, headY: 0.98, hornH: 0.2, clubLen: 1.0 } as const;

export function buildAkaOni(): Character {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T) => (geos.push(x), x);
  const m = <T extends THREE.Material>(x: T) => (mats.push(x), x);
  const C = palette.yokai.akaOni;

  const skinMat = m(soft(C.body));
  const hairMat = m(soft('#3a2620'));
  const hornMat = m(soft('#f4e6c8'));
  const tigerMat = m(soft(C.accent));
  const stripeMat = m(soft('#3a2a1e'));
  const clubMat = m(soft('#5a4a3e'));
  const studMat = m(soft('#c9c2b0'));

  // 身體：寬一點的圓身體＋虎皮腰布（黃底、三條深色條紋）
  const torso = mesh(g(ball(AKA_ONI.bodyR, 24, 16)), skinMat);
  torso.scale.set(1.12, 1.05, 1);
  torso.position.y = AKA_ONI.bodyY;
  const cloth = mesh(g(ball(AKA_ONI.bodyR * 1.02, 22, 12)), tigerMat);
  cloth.scale.set(1.12, 0.5, 1.04);
  cloth.position.y = AKA_ONI.bodyY - 0.14;
  const stripeGeo = g(new THREE.TorusGeometry(AKA_ONI.bodyR * 1.1, 0.025, 6, 24, Math.PI * 0.5));
  const stripes = [-0.6, 0, 0.6].map((a) => {
    const st = mesh(stripeGeo, stripeMat, false);
    st.rotation.set(Math.PI / 2, 0, a - Math.PI * 0.25);
    st.position.y = AKA_ONI.bodyY - 0.12;
    return st;
  });
  // 大頭＋臉
  const head = mesh(g(ball(AKA_ONI.headR, 28, 20)), skinMat);
  head.scale.set(1.04, 0.97, 1);
  head.position.y = AKA_ONI.headY;
  addChibiFace(body, { headY: AKA_ONI.headY, headR: AKA_ONI.headR, eyeY: 0.0, iris: '#3a1a14', mouth: true }, { g, m });
  // 捲髮：頭頂後半一圈小圓球
  const hairGeo = g(ball(0.09, 10, 8));
  const curls: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.55 + (i / 8) * 0.9);
    const c = mesh(hairGeo, hairMat, false);
    c.position.set(Math.cos(a) * AKA_ONI.headR * 0.78, AKA_ONI.headY + AKA_ONI.headR * 0.55, Math.sin(a) * -AKA_ONI.headR * 0.62 - 0.02);
    curls.push(c);
  }
  // 兩根角：圓頭的短角（不留尖）
  const hornGeo = g(lathe([[0, 0], [0.07, 0], [0.06, AKA_ONI.hornH * 0.6], [0.03, AKA_ONI.hornH], [0, AKA_ONI.hornH + 0.01]], { radius: 0.02, segments: 14 }));
  const horns = [-1, 1].map((sx) => {
    const h = mesh(hornGeo, hornMat, false);
    h.position.set(sx * AKA_ONI.headR * 0.42, AKA_ONI.headY + AKA_ONI.headR * 0.72, 0.04);
    h.rotation.z = -sx * 0.25;
    return h;
  });
  // 手：左手垂著、右手扛金棒
  const armL = limb(new THREE.Vector3(-AKA_ONI.bodyR * 0.9, AKA_ONI.bodyY + 0.12, 0.02), new THREE.Vector3(-AKA_ONI.bodyR - 0.12, AKA_ONI.bodyY - 0.04, 0.08), 0.07, skinMat, false);
  const armR = limb(new THREE.Vector3(AKA_ONI.bodyR * 0.9, AKA_ONI.bodyY + 0.12, 0.02), new THREE.Vector3(AKA_ONI.bodyR + 0.14, AKA_ONI.bodyY + 0.22, 0.12), 0.07, skinMat, false);
  // 金棒：右肩上斜扛，前端粗、上面一圈圈的釘
  const club = new THREE.Group();
  const clubBody = mesh(g(new THREE.CylinderGeometry(0.09, 0.05, AKA_ONI.clubLen, 12)), clubMat);
  clubBody.position.y = AKA_ONI.clubLen / 2;
  club.add(clubBody);
  const studGeo = g(ball(0.028, 8, 6));
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + r * 0.5;
      const y = AKA_ONI.clubLen * (0.55 + r * 0.12);
      const rad = 0.05 + 0.04 * ((y / AKA_ONI.clubLen) * 1.0);
      const st = mesh(studGeo, studMat, false);
      st.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
      club.add(st);
    }
  }
  club.position.set(AKA_ONI.bodyR + 0.16, AKA_ONI.bodyY + 0.2, 0.12);
  club.rotation.set(-0.5, 0, -0.35);
  // 腳
  const footGeo = g(ball(0.11, 12, 8));
  const feet = [-1, 1].map((sx) => {
    const f = mesh(footGeo, skinMat, false);
    f.position.set(sx * 0.14, 0.08, 0.03);
    f.scale.set(1, 0.65, 1.4);
    root.add(f);
    return f;
  });
  body.add(torso, cloth, ...stripes, head, ...curls, ...horns, armL, armR, club);

  const flashMats = [skinMat, tigerMat] as THREE.MeshStandardMaterial[];
  const baseEm = flashMats.map((x) => x.emissive.clone());
  let flash = 0;

  return {
    root,
    update(dt, t, moving, speed) {
      const w = moving ? Math.min(1.4, speed / 4.4) : 0;
      const phase = t * 10;
      body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.06 * w : Math.sin(t * 2) * 0.012;
      body.rotation.z = moving ? Math.sin(phase) * 0.06 * w : 0;
      const sq = moving ? 1 - Math.abs(Math.cos(phase)) * 0.04 * w : 1 + Math.sin(t * 2) * 0.01;
      body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      feet[0].position.z = 0.03 + (moving ? Math.sin(phase) * 0.14 * w : 0);
      feet[1].position.z = 0.03 + (moving ? -Math.sin(phase) * 0.14 * w : 0);
      feet[0].position.y = 0.08 + (moving ? Math.max(0, Math.sin(phase)) * 0.06 * w : 0);
      feet[1].position.y = 0.08 + (moving ? Math.max(0, -Math.sin(phase)) * 0.06 * w : 0);
      club.rotation.x = -0.5 + Math.sin(t * 2) * 0.04;
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
