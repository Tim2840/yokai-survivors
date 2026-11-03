import * as THREE from 'three';

/** 圓潤卡通材質：平滑著色、柔和的霧面質感，像上了一層消光漆的玩具 */
export function soft(color: THREE.ColorRepresentation, opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0,
    ...opts,
  });
}

/** 使用頂點色的材質（地形用，顏色在頂點之間平滑漸層） */
export function softVertexColors(opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    ...opts,
  });
}

/** 發光材質：亮度超過 Bloom 門檻，會產生光暈 */
export function glow(color: THREE.ColorRepresentation, intensity = 2.5, opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.5,
    metalness: 0,
    ...opts,
  });
}

let softDot: THREE.Texture | null = null;

/** 柔邊圓點貼圖，用在螢火蟲、霧、光暈 */
/**
 * 光暈貼圖（加法混合的光暈貼片、螢火蟲之類的光粒子用）：比 softDotTexture 收得更快——中心亮、外圈很快淡掉，
 * 看得見的半徑（亮度 ≥ 15%）約是貼片半徑的 0.45（softDotTexture 約 0.66）。使用者反映光暈太大、螢火蟲擋住地圖之後換的。
 * 霧氣、柔邊的半透明方片繼續用 softDotTexture。光暈大小的驗收：scripts/glowaudit.mjs。
 */
let haloTex: THREE.Texture | null = null;
export function haloTexture(): THREE.Texture {
  if (haloTex) return haloTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.17)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.03)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  haloTex = new THREE.CanvasTexture(canvas);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

export function softDotTexture(): THREE.Texture {
  if (softDot) return softDot;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  softDot = new THREE.CanvasTexture(canvas);
  softDot.colorSpace = THREE.SRGBColorSpace;
  return softDot;
}
