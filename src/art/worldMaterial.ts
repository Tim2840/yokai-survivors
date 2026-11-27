import * as THREE from 'three';
import { lit } from './materials';
import grassUrl from '../assets/textures/ground-grass.jpg?inline';
import dirtUrl from '../assets/textures/ground-dirt.jpg?inline';
import stoneUrl from '../assets/textures/ground-stone.jpg?inline';
import rockUrl from '../assets/textures/ground-rock.jpg?inline';
import woodUrl from '../assets/textures/ground-wood.jpg?inline';
import { WORLD_TEX } from '../data/look';
import layerInfo from '../assets/textures/layers.json';

/**
 * 場景的貼圖材質（docs/37 第一批）：地形、岩石、石燈籠、木柵欄**共用同一個材質設定 → 同一個著色器程式**。
 * - 五層細節貼圖（Poly Haven CC0，tools/textures/prep_layers.py 轉成中性灰、平均 LAYER_MEAN）：草（底）、泥土、石板、岩石、木頭。
 *   顏色仍由頂點色（色票）決定，貼圖只給紋理（和風乾淨卡通：顏色不被照片帶跑）。
 * - 每個頂點一個 aSplat（vec4：泥土、石板、岩石、木頭的權重；剩下的是草）。
 * - 不用 UV：依世界座標投影（地面用俯視投影；岩石與木頭用三向投影，懸崖、石燈籠、柵欄的側面不會被拉長）。
 *   草地用兩種尺度混合，遠看不會出現一格一格重複的圖樣。
 * - 卡通著色＋邊緣光照舊（lit() 的 onBeforeCompile 先跑，再加這一段）。
 */
export const LAYER_MEAN: number = layerInfo.mean;
export const SPLAT = { dirt: 0, stone: 1, rock: 2, wood: 3 } as const;

function load(url: string): THREE.Texture {
  const img = new Image();
  const t = new THREE.Texture(img);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace; // 細節貼圖是「乘」上去的倍率，不做 sRGB 轉換
  t.anisotropy = 4;
  img.onload = () => (t.needsUpdate = true);
  img.src = url; // data URL：不用 fetch（Artifact 的沙盒可能擋）
  return t;
}
let texs: Record<'grass' | 'dirt' | 'stone' | 'rock' | 'wood', THREE.Texture> | null = null;
function textures() {
  texs ??= { grass: load(grassUrl), dirt: load(dirtUrl), stone: load(stoneUrl), rock: load(rockUrl), wood: load(woodUrl) };
  return texs;
}
// 一載入模組就開始解碼（開局前就好了，地面不會先黑一下）
if (typeof document !== 'undefined') textures();

const VERT_HEAD = /* glsl */ `
attribute vec4 aSplat;
varying vec4 vSplat;
varying vec3 vWPos;
varying vec3 vWNrm;
`;
const VERT_BODY = /* glsl */ `
  vSplat = aSplat;
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vWNrm = normalize(mat3(modelMatrix) * objectNormal);
`;
// uTile：草、泥土、石板、岩石與木頭的貼圖尺寸（公尺）
const FRAG_HEAD = /* glsl */ `
uniform sampler2D uGrass;
uniform sampler2D uDirt;
uniform sampler2D uStone;
uniform sampler2D uRock;
uniform sampler2D uWood;
uniform vec4 uTile;
uniform float uGain;
varying vec4 vSplat;
varying vec3 vWPos;
varying vec3 vWNrm;
vec3 triplanar(sampler2D t, vec3 p, vec3 w) {
  return texture2D(t, p.zy).rgb * w.x + texture2D(t, p.xz).rgb * w.y + texture2D(t, p.xy).rgb * w.z;
}
`;
const FRAG_BODY = /* glsl */ `
  {
    vec2 top = vWPos.xz;
    vec3 an = pow(abs(normalize(vWNrm)), vec3(4.0));
    an /= (an.x + an.y + an.z);
    float wg = clamp(1.0 - vSplat.x - vSplat.y - vSplat.z - vSplat.w, 0.0, 1.0);
    vec3 acc = vec3(0.0);
    if (wg > 0.003) acc += wg * mix(texture2D(uGrass, top / uTile.x).rgb, texture2D(uGrass, top / (uTile.x * 3.7) + 0.37).rgb, 0.45);
    if (vSplat.x > 0.003) acc += vSplat.x * texture2D(uDirt, top / uTile.y).rgb;
    if (vSplat.y > 0.003) acc += vSplat.y * texture2D(uStone, top / uTile.z).rgb;
    if (vSplat.z > 0.003) acc += vSplat.z * triplanar(uRock, vWPos / uTile.w, an);
    if (vSplat.w > 0.003) acc += vSplat.w * triplanar(uWood, vWPos / (uTile.w * 0.5), an);
    diffuseColor.rgb *= acc * uGain;
  }
`;

/** 一局建一個（worldView 負責 dispose）；貼圖是全域共用的，不跟著 dispose */
export function worldMaterial(): THREE.Material {
  const m = lit({ vertexColors: true, roughness: 0.9 });
  const t = textures();
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    Object.assign(shader.uniforms, {
      uGrass: { value: t.grass },
      uDirt: { value: t.dirt },
      uStone: { value: t.stone },
      uRock: { value: t.rock },
      uWood: { value: t.wood },
      uTile: { value: new THREE.Vector4(WORLD_TEX.tile.grass, WORLD_TEX.tile.dirt, WORLD_TEX.tile.stone, WORLD_TEX.tile.rock) },
      // 頂點色已經乘了 1/LAYER_MEAN 補亮度的話，這裡就是 1
      uGain: { value: 1 },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAG_BODY}`);
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${prevKey()}|splat`;
  return m;
}

/** 幾何加上 aSplat（全部同一個權重）：merge 前每個零件先呼叫 */
export function setSplat(g: THREE.BufferGeometry, w: [number, number, number, number]): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) a.set(w, i * 4);
  g.setAttribute('aSplat', new THREE.BufferAttribute(a, 4));
  return g;
}

/** 幾何加上單一的頂點色（色票的顏色 × 1/LAYER_MEAN，補回貼圖的平均亮度） */
export function setColor(g: THREE.BufferGeometry, hex: THREE.ColorRepresentation, gain = 1 / LAYER_MEAN): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r * gain, c.g * gain, c.b * gain], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
