import * as THREE from 'three';
import { palette } from '../art/palette';
import { soft, glow, haloTexture } from '../art/materials';
import { ball, lathe, limb, mesh, roundedCylinder } from '../art/shapes';

/**
 * 提燈小僧（docs/04 第 1.1 節）：圓滾滾的小孩、斗笠、手提一盞發光的紙燈籠。
 * M1 是「簡易版」：先求固定俯角下剪影與動作可讀（docs/08 第 7.2 節；精緻版在 M2b）。
 * 約定：腳底 y = 0、臉朝 +z。尺寸寫成常數，零件位置由它們算出來。
 */
export const MONK = { bodyR: 0.36, bodyY: 0.42, headR: 0.27, headY: 0.98, hatR: 0.4, lanternR: 0.22 } as const;

export interface Character {
  root: THREE.Group;
  /** moving：是否在移動；speed：實際速度（公尺/秒）；t：累計時間（秒） */
  update(dt: number, t: number, moving: boolean, speed: number): void;
  /** 受傷閃白（0..1） */
  setFlash(v: number): void;
  dispose(): void;
}

export function buildLanternMonk(): Character {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T) => (geos.push(x), x);
  const m = <T extends THREE.Material>(x: T) => (mats.push(x), x);

  const robeMat = m(soft(palette.yokai.chochinKozo.body));
  const sashMat = m(soft(palette.yokai.chochinKozo.accent));
  const skinMat = m(soft('#f6dcc0'));
  const hatMat = m(soft('#c9a566'));
  const darkMat = m(soft('#2b2b30'));
  const lampMat = m(glow(palette.warm.amber, 2.6));

  // 身體：胖胖的水滴袍子，腰間一條橙色帶子
  const torso = mesh(g(ball(MONK.bodyR, 28, 18)), robeMat);
  torso.scale.set(1, 1.12, 0.95);
  torso.position.y = MONK.bodyY;
  const sash = mesh(g(new THREE.TorusGeometry(MONK.bodyR * 0.93, 0.045, 10, 28)), sashMat, false);
  sash.rotation.x = Math.PI / 2;
  sash.position.y = MONK.bodyY + 0.02;
  // 頭、五官
  const head = mesh(g(ball(MONK.headR, 26, 18)), skinMat);
  head.position.y = MONK.headY;
  const eyeGeo = g(ball(0.035, 10, 8));
  for (const sx of [-1, 1]) {
    const eye = mesh(eyeGeo, darkMat, false, false);
    eye.position.set(sx * 0.1, MONK.headY + 0.02, MONK.headR * 0.93);
    body.add(eye);
    const cheek = mesh(g(ball(0.05, 8, 6)), m(soft('#f4a896')), false, false);
    cheek.scale.set(1, 0.6, 0.4);
    cheek.position.set(sx * 0.17, MONK.headY - 0.07, MONK.headR * 0.86);
    body.add(cheek);
  }
  // 斗笠：圓錐形旋轉體，邊緣修圓
  const hat = mesh(
    g(lathe([[0, 0.0], [MONK.hatR, 0.0], [MONK.hatR * 0.5, 0.1], [0.12, 0.26], [0, 0.29]], { radius: 0.05, segments: 28 })),
    hatMat,
  );
  hat.position.y = MONK.headY + MONK.headR * 0.55;
  // 腳：兩顆小圓球，走路時輪流擺動
  const footGeo = g(ball(0.1, 12, 8));
  const feet = [-1, 1].map((sx) => {
    const f = mesh(footGeo, darkMat, false);
    f.position.set(sx * 0.14, 0.09, 0.02);
    f.scale.set(1, 0.7, 1.3);
    root.add(f);
    return f;
  });
  // 提燈：右手一根細棒＋紙燈籠（發光），棒子從身體側邊伸出去
  const lantern = new THREE.Group();
  const arm = limb(new THREE.Vector3(MONK.bodyR * 0.8, MONK.bodyY + 0.2, 0.05), new THREE.Vector3(0.5, MONK.bodyY + 0.42, 0.18), 0.05, robeMat, false);
  const lampBody = mesh(g(ball(MONK.lanternR, 20, 14)), lampMat, false, false);
  lampBody.scale.set(1, 1.15, 1);
  const lampCap = mesh(g(roundedCylinder(MONK.lanternR * 0.7, MONK.lanternR * 0.7, 0.05, 0.02, 14)), darkMat, false);
  lampCap.position.y = MONK.lanternR * 1.1;
  const lampBottom = lampCap.clone();
  lampBottom.position.y = -MONK.lanternR * 1.15;
  const halo = new THREE.Sprite(
    m(new THREE.SpriteMaterial({ map: haloTexture(), color: palette.warm.orange, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })) as THREE.SpriteMaterial,
  );
  halo.scale.setScalar(MONK.lanternR * 5);
  lantern.add(lampBody, lampCap, lampBottom, halo);
  lantern.position.set(0.52, MONK.bodyY + 0.34, 0.2);
  body.add(torso, sash, head, hat, arm, lantern);

  const flashMats = [robeMat, skinMat, hatMat] as THREE.MeshStandardMaterial[];
  const baseEm = flashMats.map((x) => x.emissive.clone());
  let flash = 0;

  return {
    root,
    update(_dt, t, moving, speed) {
      const w = moving ? Math.min(1.4, speed / 4) : 0;
      const phase = t * 11;
      const bob = moving ? Math.abs(Math.sin(phase)) * 0.07 * w : Math.sin(t * 2.2) * 0.012;
      body.position.y = bob;
      body.rotation.z = moving ? Math.sin(phase) * 0.07 * w : 0;
      // 擠壓拉伸：落地時略扁
      const sq = moving ? 1 - Math.abs(Math.cos(phase)) * 0.04 * w : 1 + Math.sin(t * 2.2) * 0.01;
      body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      feet[0].position.z = 0.02 + (moving ? Math.sin(phase) * 0.14 * w : 0);
      feet[1].position.z = 0.02 + (moving ? -Math.sin(phase) * 0.14 * w : 0);
      feet[0].position.y = 0.09 + (moving ? Math.max(0, Math.sin(phase)) * 0.06 * w : 0);
      feet[1].position.y = 0.09 + (moving ? Math.max(0, -Math.sin(phase)) * 0.06 * w : 0);
      // 燈籠隨步伐晃
      lantern.rotation.z = Math.sin(t * 3.1) * 0.12 + (moving ? Math.sin(phase + 1) * 0.1 : 0);
      lantern.position.y = MONK.bodyY + 0.34 + Math.sin(t * 2.6) * 0.02;
      if (flash > 0) {
        flash = Math.max(0, flash - 4 * _dt);
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
