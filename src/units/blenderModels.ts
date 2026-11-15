import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { lit, glow } from '../art/materials';
import { palette } from '../art/palette';
import type { Character } from './lanternMonk';
import monkUrl from '../assets/models/chochin-kozo.glb?inline';
import toriiUrl from '../assets/models/torii.glb?inline';
import kappaUrl from '../assets/models/kappa.glb?inline';
import villagerUrl from '../assets/models/villager.glb?inline';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Blender 試作（docs/26，Q53 照預設）：用 Blender 腳本（tools/blender/build.py）建的模型，匯出 .glb 後內嵌進來。
 * **試作期間不影響現有的模型**：只有網址帶 `?model=blender`（開發版與測試頁）才會載入；主網址的打包不含這個檔案。
 * 模型的顏色在頂點色裡，一個模型一個材質（卡通著色，和其他東西同一套光影與邊緣光）；名字以 Glow 開頭的網格是發光的（燈籠紙）。
 */
function dataUrlToBuffer(url: string): ArrayBuffer {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function load(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  // 內嵌的 data URL 直接解碼，不用 fetch：Artifact 之類的沙盒可能擋掉 fetch（connect-src），載入失敗就會靜默退回舊模型（2026-11-13 使用者看到的「舊造型」）
  const buf = url.startsWith('data:') ? dataUrlToBuffer(url) : await (await fetch(url)).arrayBuffer();
  return new Promise((resolve, reject) => new GLTFLoader().parse(buf, '', (g) => resolve({ scene: g.scene, animations: g.animations }), reject));
}

function dress(root: THREE.Object3D, mats: THREE.Material[], glowColor: string = palette.warm.amber, glowPower = 1.7): THREE.MeshStandardMaterial[] {
  const body: THREE.MeshStandardMaterial[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    (m.material as THREE.Material).dispose();
    if (m.name.startsWith('Glow') || m.parent?.name.startsWith('Glow')) {
      m.material = glow(glowColor, glowPower);
      m.castShadow = false;
    } else {
      const mat = lit({ vertexColors: true, roughness: 0.8 }) as THREE.MeshStandardMaterial;
      m.material = mat;
      m.castShadow = true;
      body.push(mat);
    }
    m.frustumCulled = false; // 骨架動畫的包圍盒不會跟著動
    mats.push(m.material as THREE.Material);
  });
  return body;
}

/** 提燈小僧（Blender 版） */
export const loadBlenderMonk = (): Promise<Character> => loadRigged(monkUrl);
/** 河童（Blender 版）：頭頂的水與手上的水盤是發光的網格（顏色取河童的特效色，只發一點光） */
export const loadBlenderKappa = (): Promise<Character> => loadRigged(kappaUrl, palette.fx.kappa.light, 0.6);

/** 帶骨架的角色：骨架動畫「walk」「idle」，依移動速度切換並調整播放速度 */
async function loadRigged(url: string, glowColor?: string, glowPower?: number): Promise<Character> {
  const { scene, animations } = await load(url);
  const root = new THREE.Group();
  root.add(scene);
  const mats: THREE.Material[] = [];
  const bodyMats = dress(scene, mats, glowColor, glowPower);
  const mixer = new THREE.AnimationMixer(scene);
  const walk = mixer.clipAction(animations.find((a) => a.name === 'walk')!);
  const idle = mixer.clipAction(animations.find((a) => a.name === 'idle')!);
  idle.play();
  walk.play();
  walk.setEffectiveWeight(0);
  let w = 0;
  let flash = 0;
  return {
    root,
    update(dt, _t, moving, speed) {
      // 走路與待機之間平滑過渡；走得越快、腳步越快
      w += ((moving ? 1 : 0) - w) * Math.min(1, dt * 10);
      walk.setEffectiveWeight(w);
      idle.setEffectiveWeight(1 - w);
      walk.setEffectiveTimeScale(Math.max(0.6, speed / 2.6));
      mixer.update(dt);
      if (flash > 0) {
        flash = Math.max(0, flash - 4 * dt);
        for (const m of bodyMats) m.emissive.setScalar(flash * 0.9);
      }
    },
    setFlash(v) {
      flash = v;
    },
    dispose() {
      mixer.stopAllAction();
      scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      for (const m of mats) m.dispose();
      root.removeFromParent();
    },
  };
}

/** 鳥居（Blender 版，靜態） */
export async function loadBlenderTorii(): Promise<{ root: THREE.Group; dispose(): void }> {
  const { scene } = await load(toriiUrl);
  const root = new THREE.Group();
  root.add(scene);
  const mats: THREE.Material[] = [];
  dress(scene, mats);
  scene.traverse((o) => ((o as THREE.Mesh).receiveShadow = true));
  return {
    root,
    dispose() {
      scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      for (const m of mats) m.dispose();
      root.removeFromParent();
    },
  };
}

/**
 * 敵人（Blender 版，靜態）：整個 .glb 合成一個幾何（位置、法線、頂點色 RGB），給實例化網格用；走路靠既有的頂點著色器（腳的頂點在 CHIBI.footY 以下）。
 * 頂點色換成 3 個分量（4 個分量會讓著色器多一個版本，p1 的程式數會變）；整體調亮一點（舊模型的 paint() 有 1.1～1.3 倍的亮度加成）；
 * 火焰（顏色接近 fireColor 的頂點）調到很亮，讓光暈抓得到。
 */
export async function loadBlenderEnemyGeometry(url: string, fireColor?: string): Promise<THREE.BufferGeometry> {
  const { scene } = await load(url);
  scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  const fire = fireColor ? new THREE.Color(fireColor) : null;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
    const src = g.getAttribute('color');
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let r = src ? src.getX(i) : 1;
      let gg = src ? src.getY(i) : 1;
      let b = src ? src.getZ(i) : 1;
      const isFire = fire && Math.abs(r - fire.r) + Math.abs(gg - fire.g) + Math.abs(b - fire.b) < 0.06;
      const k = isFire ? ENEMY_FIRE_BOOST : ENEMY_BRIGHT;
      r *= k;
      gg *= k;
      b *= k;
      col.set([r, gg, b], i * 3);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.getAttribute('position'));
    out.setAttribute('normal', g.getAttribute('normal'));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    parts.push(out);
    g.dispose();
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  merged.computeBoundingSphere();
  return merged;
}
/** 敵人整體亮度（舊模型 paint() 的加成約 1.1～1.3）、火焰的發光倍率（舊模型 3.2） */
const ENEMY_BRIGHT = 1.15;
const ENEMY_FIRE_BOOST = 2.0; // 3.2 會被色調壓縮成淡膚色、看不出是火（敵人轉檯圖抓到的）
export const BLENDER_ENEMIES: Record<string, { url: string; fire?: string }> = {
  villager: { url: villagerUrl, fire: palette.fire.torch },
};
