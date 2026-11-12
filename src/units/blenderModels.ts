import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { lit, glow } from '../art/materials';
import { palette } from '../art/palette';
import type { Character } from './lanternMonk';
import monkUrl from '../assets/models/chochin-kozo.glb?inline';
import toriiUrl from '../assets/models/torii.glb?inline';

/**
 * Blender 試作（docs/26，Q53 照預設）：用 Blender 腳本（tools/blender/build.py）建的模型，匯出 .glb 後內嵌進來。
 * **試作期間不影響現有的模型**：只有網址帶 `?model=blender`（開發版與測試頁）才會載入；主網址的打包不含這個檔案。
 * 模型的顏色在頂點色裡，一個模型一個材質（卡通著色，和其他東西同一套光影與邊緣光）；名字以 Glow 開頭的網格是發光的（燈籠紙）。
 */
async function load(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  const buf = await (await fetch(url)).arrayBuffer();
  return new Promise((resolve, reject) => new GLTFLoader().parse(buf, '', (g) => resolve({ scene: g.scene, animations: g.animations }), reject));
}

function dress(root: THREE.Object3D, mats: THREE.Material[]): THREE.MeshStandardMaterial[] {
  const body: THREE.MeshStandardMaterial[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    (m.material as THREE.Material).dispose();
    if (m.name.startsWith('Glow') || m.parent?.name.startsWith('Glow')) {
      m.material = glow(palette.warm.amber, 1.7);
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

/** 提燈小僧（Blender 版）：骨架動畫「walk」「idle」，依移動速度切換並調整播放速度 */
export async function loadBlenderMonk(): Promise<Character> {
  const { scene, animations } = await load(monkUrl);
  const root = new THREE.Group();
  root.add(scene);
  const mats: THREE.Material[] = [];
  const bodyMats = dress(scene, mats);
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
