import * as THREE from 'three';
import { haloTexture } from '../art/materials';
import { fbm } from '../lib/noise';
import { Rng } from '../lib/random';
import type { AmbienceDef } from '../data/ambience';
import type { TerrainMap } from './terrainMap';
import { setHugeBounds } from '../render/instancedLayer';

/**
 * 場景氣氛的 3D 外觀（美術第一輪 A）：天空球（頂點色漸層）、月亮與光暈、星星、草叢、花叢、遠景的樹、飄浮的光點。
 * 全部是實例化／點雲：一局建一次、固定數量、每幀只更新天空位置與光點（不配置記憶體）。
 * 草叢、花、樹是純裝飾，沒有碰撞，也不影響玩法（只放在地圖上沒有障礙、不陡的地方）。
 */
export interface AmbienceView {
  group: THREE.Group;
  /** 每個畫面幀：天空跟著鏡頭、光點跟著玩家飄；t 是畫面時間（秒） */
  update(t: number, cam: THREE.Vector3, px: number, pz: number): void;
  /** 測試與量測用：各圖層的實例數 */
  counts: { tufts: number; flowers: number; bushes: number; trees: number; stars: number; motes: number };
  dispose(): void;
}

const SKY_RADIUS = 300;
const DEG = Math.PI / 180;

function colorOf(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/** 一叢草：4 片朝外微彎的葉子（三角形），頂點色從根（暗）到尖（亮）；法線全朝上＝柔和的受光 */
function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const blades = 5;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + 0.4;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const baseR = 0.07;
    const w = 0.18;
    const h = 0.7 + (i % 3) * 0.15;
    const lean = 0.2 + (i % 2) * 0.1;
    // 根部兩點（垂直於朝外方向）＋尖端（朝外彎）
    const bx = ca * baseR;
    const bz = sa * baseR;
    pos.push(bx - sa * w, 0, bz + ca * w, bx + sa * w, 0, bz - ca * w, bx + ca * lean, h, bz + sa * lean);
    col.push(0.9, 0.95, 0.8, 0.9, 0.95, 0.8, 1.35, 1.4, 1.1);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

export function buildAmbienceView(map: TerrainMap, seed: number, a: AmbienceDef, touch: boolean): AmbienceView {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const disposables: { dispose(): void }[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T) => (geos.push(g), g);
  const trackM = <T extends THREE.Material>(m: T) => (mats.push(m), m);
  const scale = touch ? a.mobileScale : 1;
  const rng = new Rng(seed ^ 0xa3b1);
  const half = map.def.size.w / 2;

  // ── 天空球：頂點色漸層（地平線 → 中段 → 頭頂）；不吃霧、不寫深度，永遠畫在最後面 ──
  const sky = track(new THREE.SphereGeometry(SKY_RADIUS, 28, 18));
  {
    const p = sky.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const cH = colorOf(a.sky.horizon);
    const cM = colorOf(a.sky.mid);
    const cT = colorOf(a.sky.top);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / SKY_RADIUS; // -1..1
      if (y <= 0.0) c.copy(cH);
      else if (y < 0.28) c.copy(cH).lerp(cM, Math.pow(y / 0.28, 0.7));
      else c.copy(cM).lerp(cT, Math.min(1, (y - 0.28) / 0.55));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    sky.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const skyMat = trackM(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  const skyMesh = new THREE.Mesh(sky, skyMat);
  skyMesh.renderOrder = -20;
  skyMesh.frustumCulled = false;
  group.add(skyMesh);

  // ── 月亮：圓盤＋光暈（加色混合的貼片）；位置由方位角與仰角決定，和月光（Renderer）同一個方位 ──
  const az = a.sky.moon.azimuth * DEG;
  const el = a.sky.moon.elevation * DEG;
  const moonDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const moonGeo = track(new THREE.CircleGeometry(a.sky.moon.size, 40));
  const moonMat = trackM(new THREE.MeshBasicMaterial({ color: a.sky.moon.color, fog: false, depthWrite: false }));
  const moon = new THREE.Mesh(moonGeo, moonMat);
  moon.position.copy(moonDir).multiplyScalar(SKY_RADIUS * 0.92);
  moon.lookAt(0, 0, 0);
  moon.renderOrder = -19;
  group.add(moon);
  const haloGeo = track(new THREE.PlaneGeometry(a.sky.moon.halo, a.sky.moon.halo));
  const haloMat = trackM(new THREE.MeshBasicMaterial({ map: haloTexture(), color: '#aebfff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.position.copy(moonDir).multiplyScalar(SKY_RADIUS * 0.91);
  halo.lookAt(0, 0, 0);
  halo.renderOrder = -18;
  group.add(halo);

  // ── 星星：天空球上半部的點（大小固定像素，不隨距離變）──
  const starN = Math.round(a.sky.stars.count * (touch ? 0.8 : 1));
  const starPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const phi = rng.range(0, Math.PI * 2);
    const e = Math.asin(rng.range(0.08, 1));
    starPos[i * 3] = Math.cos(phi) * Math.cos(e) * SKY_RADIUS * 0.97;
    starPos[i * 3 + 1] = Math.sin(e) * SKY_RADIUS * 0.97;
    starPos[i * 3 + 2] = Math.sin(phi) * Math.cos(e) * SKY_RADIUS * 0.97;
  }
  const starGeo = track(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = trackM(new THREE.PointsMaterial({ color: a.sky.stars.color, size: a.sky.stars.size, sizeAttenuation: false, fog: false, depthWrite: false, transparent: true, opacity: 0.85 }));
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -17;
  stars.frustumCulled = false;
  group.add(stars);

  // ── 能放裝飾的地方：沒有障礙、不是水、不陡 ──
  const obst = map.def.obstacles;
  const free = (x: number, z: number, margin: number): boolean => {
    if (x < map.minX + 1 || x > map.maxX - 1 || z < map.minZ + 1 || z > map.maxZ - 1) return false;
    const t = map.typeIdAt(x, z);
    if (t !== 'grass' && t !== 'bamboo') return false;
    for (const o of obst) {
      const dx = o.x - x;
      const dz = o.z - z;
      const r = o.r + margin;
      if (dx * dx + dz * dz < r * r) return false;
    }
    const h = map.heightAt(x, z);
    return Math.abs(map.heightAt(x + 0.8, z) - h) < 0.7 && Math.abs(map.heightAt(x, z + 0.8) - h) < 0.7;
  };

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pv = new THREE.Vector3();
  const sv = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();

  // ── 草叢（一個實例化圖層）：密度跟著低頻雜訊，成片的草地與空地 ──
  const tuftN = Math.round(a.tufts.count * scale);
  const tuftGeo = track(tuftGeometry());
  const tuftMat = trackM(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide, emissive: '#16301c' }));
  // 草葉兩面都看得到，但背面不要被「翻轉法線」打黑（法線全朝上、兩面一樣受光）
  tuftMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;');
  };
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftN);
  const tuftColors = a.tufts.colors.map(colorOf);
  let made = 0;
  for (let tries = 0; made < tuftN && tries < tuftN * 8; tries++) {
    const x = rng.range(map.minX + 1, map.maxX - 1);
    const z = rng.range(map.minZ + 1, map.maxZ - 1);
    const dens = 0.35 + 0.9 * fbm(x * 0.09, z * 0.09, seed + 11, 2);
    if (rng.next() > dens) continue;
    if (!free(x, z, 0.35)) continue;
    const s = rng.range(a.tufts.height[0], a.tufts.height[1]);
    q.setFromAxisAngle(up, rng.range(0, Math.PI * 2));
    pv.set(x, map.heightAt(x, z) - 0.02, z);
    sv.set(s * rng.range(0.8, 1.3), s, s * rng.range(0.8, 1.3));
    m4.compose(pv, q, sv);
    tufts.setMatrixAt(made, m4);
    col.copy(tuftColors[rng.int(0, tuftColors.length - 1)]).multiplyScalar(rng.range(0.8, 1.15));
    tufts.setColorAt(made, col);
    made++;
  }
  tufts.count = made;
  setHugeBounds(tufts, 200);
  group.add(tufts);

  // ── 花叢：幾十個小花團，每團十幾朵（八面體小花苞，顏色分組）──
  const flowerGeo = track(new THREE.OctahedronGeometry(0.1, 0).translate(0, 0.16, 0));
  // 花不受光（像夜裡微微發亮的花），顏色才不會被夜色壓暗成黑點
  const flowerMat = trackM(new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  const flowerTotal = Math.round(a.flowers.clusters * a.flowers.perCluster * scale);
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerTotal);
  const flowerColors = a.flowers.colors.map(colorOf);
  let fmade = 0;
  const clusters = Math.max(1, Math.round(a.flowers.clusters * scale));
  for (let ci = 0; ci < clusters && fmade < flowerTotal; ci++) {
    let cx = 0;
    let cz = 0;
    let ok = false;
    for (let tries = 0; tries < 30 && !ok; tries++) {
      cx = rng.range(map.minX + 4, map.maxX - 4);
      cz = rng.range(map.minZ + 4, map.maxZ - 4);
      ok = free(cx, cz, 1.2);
    }
    if (!ok) continue;
    const base = flowerColors[rng.int(0, flowerColors.length - 1)];
    for (let k = 0; k < a.flowers.perCluster && fmade < flowerTotal; k++) {
      const ang = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * 1.6;
      const x = cx + Math.cos(ang) * r;
      const z = cz + Math.sin(ang) * r;
      if (!free(x, z, 0.3)) continue;
      pv.set(x, map.heightAt(x, z), z);
      q.setFromAxisAngle(up, rng.range(0, Math.PI));
      const s = rng.range(0.8, 1.4);
      sv.set(s, s, s);
      m4.compose(pv, q, sv);
      flowers.setMatrixAt(fmade, m4);
      col.copy(rng.next() < 0.75 ? base : flowerColors[rng.int(0, flowerColors.length - 1)]);
      flowers.setColorAt(fmade, col);
      fmade++;
    }
  }
  flowers.count = fmade;
  setHugeBounds(flowers, 200);
  group.add(flowers);

  // ── 灌木：草地上的圓球（純裝飾，走得過去），讓地面不只有草叢 ──
  const bushN = Math.round(a.bushes.count * scale);
  const bushGeo = track(new THREE.IcosahedronGeometry(0.5, 1).scale(1.1, 0.95, 1.1).translate(0, 0.32, 0));
  const bushMat = trackM(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }));
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, bushN);
  const bushColors = a.bushes.colors.map(colorOf);
  let bmade = 0;
  for (let tries = 0; bmade < bushN && tries < bushN * 15; tries++) {
    const x = rng.range(map.minX + 2, map.maxX - 2);
    const z = rng.range(map.minZ + 2, map.maxZ - 2);
    if (!free(x, z, 0.9)) continue;
    const s = rng.range(0.45, 0.95);
    q.setFromAxisAngle(up, rng.range(0, Math.PI * 2));
    pv.set(x, map.heightAt(x, z) - 0.08, z);
    sv.set(s, s * rng.range(0.85, 1.2), s);
    m4.compose(pv, q, sv);
    bushes.setMatrixAt(bmade, m4);
    col.copy(bushColors[rng.int(0, bushColors.length - 1)]).multiplyScalar(rng.range(0.85, 1.1));
    bushes.setColorAt(bmade, col);
    bmade++;
  }
  bushes.count = bmade;
  setHugeBounds(bushes, 200);
  group.add(bushes);

  // ── 遠景的樹：沿地圖邊緣一圈（一部分在地圖內側邊緣），樹幹＋樹冠兩個實例化圖層；一部分是紅葉 ──
  const treeN = Math.round(a.trees.count * scale);
  const trunkGeo = track(new THREE.CylinderGeometry(0.2, 0.32, 2.6, 6, 1).translate(0, 1.3, 0));
  const canopyGeo = track(new THREE.IcosahedronGeometry(1.5, 1).scale(1.15, 0.95, 1.15).translate(0, 3.3, 0));
  const trunkMat = trackM(new THREE.MeshStandardMaterial({ color: a.trees.trunk, roughness: 0.95, metalness: 0 }));
  const canopyMat = trackM(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }));
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeN);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, treeN);
  const green = a.trees.canopy.map(colorOf);
  const autumn = a.trees.autumnColors.map(colorOf);
  let tmade = 0;
  for (let tries = 0; tmade < treeN && tries < treeN * 20; tries++) {
    // 方形環帶：地圖邊界往外 22 公尺到往內 5 公尺
    const t = rng.range(0, 4);
    const edge = Math.floor(t);
    const along = (t - edge) * 2 - 1;
    const d = half + rng.range(-5, 22);
    let x = 0;
    let z = 0;
    if (edge === 0) { x = along * (half + 22); z = -d; }
    else if (edge === 1) { x = along * (half + 22); z = d; }
    else if (edge === 2) { x = -d; z = along * (half + 22); }
    else { x = d; z = along * (half + 22); }
    const inside = Math.abs(x) < half - 1 && Math.abs(z) < half - 1;
    if (inside && !free(x, z, 1.2)) continue;
    const s = rng.range(0.85, 1.7);
    q.setFromAxisAngle(up, rng.range(0, Math.PI * 2));
    pv.set(x, inside ? map.heightAt(x, z) - 0.05 : -0.3, z);
    sv.set(s, s * rng.range(0.9, 1.25), s);
    m4.compose(pv, q, sv);
    trunks.setMatrixAt(tmade, m4);
    canopies.setMatrixAt(tmade, m4);
    const c = rng.next() < a.trees.autumn ? autumn[rng.int(0, autumn.length - 1)] : green[rng.int(0, green.length - 1)];
    col.copy(c).multiplyScalar(rng.range(0.85, 1.1));
    canopies.setColorAt(tmade, col);
    tmade++;
  }
  trunks.count = tmade;
  canopies.count = tmade;
  setHugeBounds(trunks, 250);
  setHugeBounds(canopies, 250);
  group.add(trunks, canopies);

  // ── 飄浮的光點（螢火）：跟著玩家附近飄，顏色是黃綠，和魂火（青）、燈火（橘）分得開 ──
  const moteN = Math.round(a.motes.count * scale);
  const motePos = new Float32Array(moteN * 3);
  const moteCol = new Float32Array(moteN * 3);
  const mc = colorOf(a.motes.color);
  for (let i = 0; i < moteN; i++) {
    const b = rng.range(0.7, 1.5);
    moteCol[i * 3] = mc.r * b * 1.4;
    moteCol[i * 3 + 1] = mc.g * b * 1.4;
    moteCol[i * 3 + 2] = mc.b * b * 1.4;
  }
  const moteBase = new Float32Array(moteN * 4); // x、z、相位、高度
  for (let i = 0; i < moteN; i++) {
    moteBase[i * 4] = rng.range(0, a.motes.range * 2);
    moteBase[i * 4 + 1] = rng.range(0, a.motes.range * 2);
    moteBase[i * 4 + 2] = rng.range(0, Math.PI * 2);
    moteBase[i * 4 + 3] = rng.range(a.motes.height[0], a.motes.height[1]);
  }
  const moteGeo = track(new THREE.BufferGeometry());
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3).setUsage(THREE.DynamicDrawUsage));
  moteGeo.setAttribute('color', new THREE.BufferAttribute(moteCol, 3));
  moteGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const moteMat = trackM(new THREE.PointsMaterial({ map: haloTexture(), vertexColors: true, size: a.motes.size, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  motes.renderOrder = 4;
  group.add(motes);

  const span = a.motes.range * 2;
  return {
    group,
    counts: { tufts: made, flowers: fmade, bushes: bmade, trees: tmade, stars: starN, motes: moteN },
    update(t, cam, px, pz) {
      skyMesh.position.copy(cam);
      moon.position.copy(moonDir).multiplyScalar(SKY_RADIUS * 0.92).add(cam);
      halo.position.copy(moonDir).multiplyScalar(SKY_RADIUS * 0.91).add(cam);
      stars.position.copy(cam);
      const arr = moteGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < moteN; i++) {
        const ph = moteBase[i * 4 + 2];
        // 在玩家附近的方框裡慢慢飄，超出就從另一邊繞回來（所以永遠在身邊）
        const wx = ((moteBase[i * 4] + t * 0.35 + Math.sin(t * 0.6 + ph) * 1.2 - px) % span + span) % span - a.motes.range + px;
        const wz = ((moteBase[i * 4 + 1] + t * 0.22 + Math.cos(t * 0.5 + ph) * 1.2 - pz) % span + span) % span - a.motes.range + pz;
        arr[i * 3] = wx;
        arr[i * 3 + 1] = map.heightAt(wx, wz) + moteBase[i * 4 + 3] + Math.sin(t * 0.9 + ph) * 0.35;
        arr[i * 3 + 2] = wz;
      }
      moteGeo.attributes.position.needsUpdate = true;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const d of disposables) d.dispose();
      tufts.dispose();
      flowers.dispose();
      bushes.dispose();
      trunks.dispose();
      canopies.dispose();
      group.removeFromParent();
    },
  };
}
