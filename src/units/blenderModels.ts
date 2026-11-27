import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { lit, glow } from '../art/materials';
import { palette } from '../art/palette';
import type { Character } from './lanternMonk';
import monkUrl from '../assets/models/chochin-kozo.glb?inline';
import toriiUrl from '../assets/models/torii.glb?inline';
import kappaUrl from '../assets/models/kappa.glb?inline';
import monkF1Url from '../assets/models/chochin-kozo-f1.glb?inline';
import monkF2Url from '../assets/models/chochin-kozo-f2.glb?inline';
import kappaF1Url from '../assets/models/kappa-f1.glb?inline';
import kappaF2Url from '../assets/models/kappa-f2.glb?inline';
import oniUrl from '../assets/models/aka-oni.glb?inline';
import oniF1Url from '../assets/models/aka-oni-f1.glb?inline';
import oniF2Url from '../assets/models/aka-oni-f2.glb?inline';
import villagerUrl from '../assets/models/villager.glb?inline';
import ashigaruUrl from '../assets/models/ashigaru.glb?inline';
import yumiUrl from '../assets/models/yumi.glb?inline';
import soheiUrl from '../assets/models/sohei.glb?inline';
import shinobiUrl from '../assets/models/shinobi.glb?inline';
import onmyojiUrl from '../assets/models/onmyoji.glb?inline';
import taikoUrl from '../assets/models/taiko.glb?inline';
import taimasouUrl from '../assets/models/taimasou.glb?inline';
import kawagariUrl from '../assets/models/kawagari.glb?inline';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import stoneLanternUrl from '../assets/models/stone-lantern.glb?inline';
import fenceUrl from '../assets/models/fence.glb?inline';
import { LAYER_MEAN } from '../art/worldMaterial';
import monkAtlasUrl from '../assets/textures/chochin-atlas.png?inline';
import monkGlowUrl from '../assets/textures/chochin-glow.png?inline';
import kappaAtlasUrl from '../assets/textures/kappa-atlas.png?inline';
import oniAtlasUrl from '../assets/textures/oni-atlas.png?inline';

/**
 * Blender 模型（docs/26；D87 試作、Q54 通過 D92）：用 Blender 腳本（tools/blender/build.py）建的模型，匯出 .glb 後內嵌進來。
 * 主網址固定載入、測試頁預設載入、開發版要帶 `?model=blender`（判斷在 runView 的 useBlenderModels）；載好之前先顯示程式建的舊模型。
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

/**
 * 角色的貼圖集（docs/37 第一批；tools/blender/paint_atlas.py 畫的）：base color（臉、布料、編織、頭髮、燈籠紙）＋發光貼圖（只有燈籠紙亮）。
 * 化身三階共用同一組（同一個材質設定 → 同一個著色器程式；換掉的是「頂點色＋沒貼圖」那一份，程式數不變）。
 */
export interface Skin {
  map: string;
  glow?: string;
  /** 發光貼圖的強度（光暈門檻 1.9：燈籠紙要超過才會有光暈） */
  glowPower?: number;
}
const texCache = new Map<string, Promise<THREE.Texture>>();
function texture(url: string, srgb = true): Promise<THREE.Texture> {
  let p = texCache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      // data URL 用 Image 解碼（不用 fetch：Artifact 的沙盒可能擋 connect-src）
      const img = new Image();
      img.onload = () => {
        const t = new THREE.Texture(img);
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.flipY = false; // glTF 的 UV 原點在左上
        t.anisotropy = 4;
        t.needsUpdate = true;
        resolve(t);
      };
      img.onerror = reject;
      img.src = url;
    });
    texCache.set(url, p);
  }
  return p;
}

function dress(root: THREE.Object3D, mats: THREE.Material[], glowColor: string = palette.warm.amber, glowPower = 1.7, skin?: { map: THREE.Texture; glow?: THREE.Texture; glowPower: number }): THREE.MeshStandardMaterial[] {
  const body: THREE.MeshStandardMaterial[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    (m.material as THREE.Material).dispose();
    if (m.name.startsWith('Glow') || m.parent?.name.startsWith('Glow')) {
      m.material = glow(glowColor, glowPower);
      m.castShadow = false;
    } else {
      const mat = (skin
        ? lit({ vertexColors: true, roughness: 0.8, map: skin.map, ...(skin.glow ? { emissiveMap: skin.glow, emissive: '#ffffff', emissiveIntensity: skin.glowPower } : {}) })
        : lit({ vertexColors: true, roughness: 0.8 })) as THREE.MeshStandardMaterial;
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
const MONK_SKIN: Skin = { map: monkAtlasUrl, glow: monkGlowUrl, glowPower: 2.3 };
export const loadBlenderMonk = (): Promise<Character> => loadRigged(monkUrl, undefined, undefined, MONK_SKIN);
/** 河童（Blender 版）：頭頂的水與手上的水盤是發光的網格（顏色取河童的特效色，只發一點光） */
const KAPPA_SKIN: Skin = { map: kappaAtlasUrl };
const ONI_SKIN: Skin = { map: oniAtlasUrl };
export const loadBlenderKappa = (): Promise<Character> => loadRigged(kappaUrl, palette.fx.kappa.light, 0.6, KAPPA_SKIN);

/** 赤鬼（Blender 版，docs/35）：化身二身上的火紋與雷鼓是發光的網格（取赤鬼的特效色） */
export const loadBlenderOni = (): Promise<Character> => loadRigged(oniUrl, palette.fx['aka-oni'].light, 0.7, ONI_SKIN);

/** 化身的造型（D94、docs/33）：[化身一, 化身二]；沒有的妖怪回傳空陣列（只放大，不換造型） */
export async function loadBlenderForms(yokaiId: string): Promise<Character[]> {
  if (yokaiId === 'chochin-kozo') return Promise.all([loadRigged(monkF1Url, undefined, undefined, MONK_SKIN), loadRigged(monkF2Url, undefined, undefined, MONK_SKIN)]);
  if (yokaiId === 'kappa') return Promise.all([loadRigged(kappaF1Url, palette.fx.kappa.light, 0.6, KAPPA_SKIN), loadRigged(kappaF2Url, palette.fx.kappa.light, 0.6, KAPPA_SKIN)]);
  if (yokaiId === 'aka-oni') return Promise.all([loadRigged(oniF1Url, palette.fx['aka-oni'].light, 0.7, ONI_SKIN), loadRigged(oniF2Url, palette.fx['aka-oni'].light, 0.7, ONI_SKIN)]);
  return [];
}

/** 帶骨架的角色：骨架動畫「walk」「idle」，依移動速度切換並調整播放速度 */
async function loadRigged(url: string, glowColor?: string, glowPower?: number, skinDef?: Skin): Promise<Character> {
  const { scene, animations } = await load(url);
  const root = new THREE.Group();
  root.add(scene);
  const mats: THREE.Material[] = [];
  const skin = skinDef ? { map: await texture(skinDef.map), glow: skinDef.glow ? await texture(skinDef.glow) : undefined, glowPower: skinDef.glowPower ?? 2 } : undefined;
  const bodyMats = dress(scene, mats, glowColor, glowPower, skin);
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
        // 有發光貼圖的材質：emissive 只會亮燈籠紙那一格，受傷閃白改成把底色調亮
        for (const m of bodyMats) {
          if (m.emissiveMap) m.color.setScalar(1 + flash * 1.6);
          else m.emissive.setScalar(flash * 0.9);
        }
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
  ashigaru: { url: ashigaruUrl },
  yumi: { url: yumiUrl },
  sohei: { url: soheiUrl },
  shinobi: { url: shinobiUrl },
  onmyoji: { url: onmyojiUrl },
  taiko: { url: taikoUrl },
  taimasou: { url: taimasouUrl },
  kawagari: { url: kawagariUrl },
};

/**
 * 場景道具（docs/37 第一批：石燈籠、木柵欄）：每個 .glb 依「發光／不發光」各合成一個幾何（原點在底部中心），給 worldView 依擺放位置複製、按區塊合併。
 * 頂點色的 alpha 記的是場景貼圖的哪一層（tools/blender/build.py 的 layer_color：0.125 + 0.25 × 層）→ 轉成 aSplat；顏色乘 1/LAYER_MEAN 補回貼圖的平均亮度。
 */
async function propGeometry(url: string): Promise<{ solid: THREE.BufferGeometry; glow: THREE.BufferGeometry | null }> {
  const { scene } = await load(url);
  scene.updateMatrixWorld(true);
  const solid: THREE.BufferGeometry[] = [];
  const glowParts: THREE.BufferGeometry[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
    const n = g.getAttribute('position').count;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.getAttribute('position'));
    out.setAttribute('normal', g.getAttribute('normal'));
    if (m.name.startsWith('Glow') || m.parent?.name.startsWith('Glow')) {
      glowParts.push(out);
    } else {
      const src = g.getAttribute('color');
      const col = new Float32Array(n * 3);
      const spl = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        col.set([src.getX(i) / LAYER_MEAN, src.getY(i) / LAYER_MEAN, src.getZ(i) / LAYER_MEAN], i * 3);
        const layer = Math.max(0, Math.min(3, Math.round((src.getW(i) - 0.125) / 0.25)));
        spl[i * 4 + layer] = 1;
      }
      out.setAttribute('color', new THREE.BufferAttribute(col, 3));
      out.setAttribute('aSplat', new THREE.BufferAttribute(spl, 4));
      solid.push(out);
    }
    g.dispose();
  });
  const merged = mergeGeometries(solid, false);
  const glowGeo = glowParts.length ? mergeGeometries(glowParts, false) : null;
  solid.forEach((p) => p.dispose());
  glowParts.forEach((p) => p.dispose());
  return { solid: merged, glow: glowGeo };
}

export async function loadBlenderProps(): Promise<{ lanternStone: THREE.BufferGeometry; lanternGlow: THREE.BufferGeometry; fence: THREE.BufferGeometry }> {
  const [lantern, fence] = await Promise.all([propGeometry(stoneLanternUrl), propGeometry(fenceUrl)]);
  return { lanternStone: lantern.solid, lanternGlow: lantern.glow!, fence: fence.solid };
}
