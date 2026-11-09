import * as THREE from 'three';
import { palette } from '../art/palette';
import { soft, glow, haloTexture } from '../art/materials';
import { ball, lathe, limb, mesh, roundedCylinder } from '../art/shapes';
import { addChibiFace } from './chibiFace';

/**
 * 提燈小僧（docs/04 第 1.1 節）：D72 日系 Q 版——大頭（頭約佔身高一半）、大眼睛、寬斗笠、
 * 米白僧衣＋橙色腰帶、兩隻短手，右手舉一根竹竿、竿頭掛一盞發光的紅白紙燈籠。
 * 約定：腳底 y = 0、臉朝 +z。尺寸寫成常數，零件位置由它們算出來。
 */
export const MONK = { bodyR: 0.3, bodyY: 0.38, headR: 0.36, headY: 0.94, hatR: 0.56, lanternR: 0.2 } as const;

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
  const C = palette.chibi;

  const robeMat = m(soft(palette.yokai.chochinKozo.body));
  const sashMat = m(soft(palette.yokai.chochinKozo.accent));
  const skinMat = m(soft(C.skin));
  const hatMat = m(soft(palette.human.straw));
  const hatBandMat = m(soft(palette.pickup.red));
  const darkMat = m(soft(C.foot));
  const poleMat = m(soft('#9a7a4a'));
  const lampMat = m(glow(palette.warm.amber, 2.6));
  const lampBandMat = m(glow('#ff6a4a', 1.8));

  // 身體：小小的袍子（下寬上窄）、腰帶、白色交領
  const torso = mesh(g(ball(MONK.bodyR, 24, 16)), robeMat);
  torso.scale.set(1.05, 1.05, 0.95);
  torso.position.y = MONK.bodyY;
  const sash = mesh(g(new THREE.TorusGeometry(MONK.bodyR * 0.97, 0.05, 10, 26)), sashMat, false);
  sash.rotation.x = Math.PI / 2;
  sash.position.y = MONK.bodyY - 0.02;
  const collar = mesh(g(new THREE.ConeGeometry(0.11, 0.16, 3)), m(soft(C.collar)), false);
  collar.rotation.x = Math.PI;
  collar.position.set(0, MONK.bodyY + 0.22, MONK.bodyR * 0.8);
  // 大頭＋臉
  const head = mesh(g(ball(MONK.headR, 28, 20)), skinMat);
  head.scale.set(1.03, 0.97, 1);
  head.position.y = MONK.headY;
  addChibiFace(body, { headY: MONK.headY, headR: MONK.headR, eyeY: -0.05 }, { g, m });
  // 斗笠：寬大的圓錐（蓋住頭頂，臉在帽簷下），帽頂一圈紅帶
  const hat = mesh(g(lathe([[0, 0.0], [MONK.hatR, 0.0], [MONK.hatR * 0.55, 0.12], [0.14, 0.3], [0, 0.33]], { radius: 0.05, segments: 30 })), hatMat);
  hat.position.y = MONK.headY + MONK.headR * 0.5;
  const band = mesh(g(new THREE.TorusGeometry(MONK.hatR * 0.42, 0.035, 8, 26)), hatBandMat, false);
  band.rotation.x = Math.PI / 2;
  band.position.y = MONK.headY + MONK.headR * 0.5 + 0.16;
  // 短手：左手垂著、右手舉竿
  const armL = limb(new THREE.Vector3(-MONK.bodyR * 0.85, MONK.bodyY + 0.12, 0.02), new THREE.Vector3(-MONK.bodyR - 0.1, MONK.bodyY - 0.05, 0.08), 0.06, robeMat, false);
  const handL = mesh(g(ball(0.065, 10, 8)), skinMat, false);
  handL.position.set(-MONK.bodyR - 0.1, MONK.bodyY - 0.07, 0.08);
  const armR = limb(new THREE.Vector3(MONK.bodyR * 0.85, MONK.bodyY + 0.12, 0.02), new THREE.Vector3(MONK.bodyR + 0.14, MONK.bodyY + 0.22, 0.14), 0.06, robeMat, false);
  const handR = mesh(g(ball(0.065, 10, 8)), skinMat, false);
  handR.position.set(MONK.bodyR + 0.14, MONK.bodyY + 0.22, 0.14);
  // 竹竿＋燈籠（燈籠掛在竿頭，會晃）
  const pole = limb(new THREE.Vector3(MONK.bodyR + 0.14, MONK.bodyY + 0.12, 0.14), new THREE.Vector3(MONK.bodyR + 0.36, MONK.bodyY + 0.78, 0.22), 0.025, poleMat, false);
  const lantern = new THREE.Group();
  const lampBody = mesh(g(ball(MONK.lanternR, 22, 16)), lampMat, false, false);
  lampBody.scale.set(1, 1.25, 1);
  // 紅白燈籠：上下兩圈紅帶
  for (const y of [-0.12, 0.12]) {
    const rb = mesh(g(new THREE.TorusGeometry(MONK.lanternR * 0.93, 0.022, 6, 22)), lampBandMat, false, false);
    rb.rotation.x = Math.PI / 2;
    rb.position.y = y;
    lantern.add(rb);
  }
  const lampCap = mesh(g(roundedCylinder(MONK.lanternR * 0.62, MONK.lanternR * 0.62, 0.05, 0.02, 14)), darkMat, false);
  lampCap.position.y = MONK.lanternR * 1.22;
  const lampBottom = lampCap.clone();
  lampBottom.position.y = -MONK.lanternR * 1.3;
  const halo = new THREE.Sprite(
    m(new THREE.SpriteMaterial({ map: haloTexture(), color: palette.warm.orange, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })) as THREE.SpriteMaterial,
  );
  halo.scale.setScalar(MONK.lanternR * 5);
  lantern.add(lampBody, lampCap, lampBottom, halo);
  const lanternY = MONK.bodyY + 0.78 - MONK.lanternR * 1.35;
  lantern.position.set(MONK.bodyR + 0.36, lanternY, 0.22);
  // 腳：兩顆小圓球，走路時輪流擺動
  const footGeo = g(ball(0.09, 12, 8));
  const feet = [-1, 1].map((sx) => {
    const f = mesh(footGeo, darkMat, false);
    f.position.set(sx * 0.12, 0.08, 0.02);
    f.scale.set(1, 0.7, 1.3);
    root.add(f);
    return f;
  });
  body.add(torso, sash, collar, head, hat, band, armL, handL, armR, handR, pole, lantern);

  const flashMats = [robeMat, skinMat, hatMat] as THREE.MeshStandardMaterial[];
  const baseEm = flashMats.map((x) => x.emissive.clone());
  let flash = 0;

  return {
    root,
    update(dt, t, moving, speed) {
      const w = moving ? Math.min(1.4, speed / 4) : 0;
      const phase = t * 11;
      const bob = moving ? Math.abs(Math.sin(phase)) * 0.07 * w : Math.sin(t * 2.2) * 0.012;
      body.position.y = bob;
      body.rotation.z = moving ? Math.sin(phase) * 0.07 * w : 0;
      // 擠壓拉伸：落地時略扁
      const sq = moving ? 1 - Math.abs(Math.cos(phase)) * 0.04 * w : 1 + Math.sin(t * 2.2) * 0.01;
      body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      feet[0].position.z = 0.02 + (moving ? Math.sin(phase) * 0.13 * w : 0);
      feet[1].position.z = 0.02 + (moving ? -Math.sin(phase) * 0.13 * w : 0);
      feet[0].position.y = 0.08 + (moving ? Math.max(0, Math.sin(phase)) * 0.06 * w : 0);
      feet[1].position.y = 0.08 + (moving ? Math.max(0, -Math.sin(phase)) * 0.06 * w : 0);
      // 燈籠隨步伐晃
      lantern.rotation.z = Math.sin(t * 3.1) * 0.12 + (moving ? Math.sin(phase + 1) * 0.12 : 0);
      lantern.position.y = lanternY + Math.sin(t * 2.6) * 0.02;
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
