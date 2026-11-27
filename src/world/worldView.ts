import * as THREE from 'three';
import { palette } from '../art/palette';
import { soft, softVertexColors, glow } from '../art/materials';
import { ball, mesh, pebble, roundedCylinder } from '../art/shapes';
import { fbm } from '../lib/noise';
import { Rng } from '../lib/random';
import { TERRAIN_IDS } from '../data/terrain';
import type { TerrainMap } from './terrainMap';
import { ambienceFor, type AmbienceDef } from '../data/ambience';
import { groundDetailTexture, groundDetailGain } from '../art/groundTexture';
import { GROUND_LAYERS, WORLD_TEX, currentLook } from '../data/look';
import { SANDO } from '../data/scenery';
import { worldMaterial, setSplat, setColor, LAYER_MEAN, SPLAT } from '../art/worldMaterial';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 地形與場景物件的 3D 外觀（高度圖網格、水面、石頭與石燈籠）。一局建一次、結束時 dispose。
 * 顏色一律取自 palette；材質用 soft()／softVertexColors()／glow()，沒有 flatShading。
 */
export interface WorldView {
  group: THREE.Group;
  /**
   * 換上 Blender 的場景道具（載好之後呼叫）：石燈籠換成 Blender 版、加上參道兩側的石燈籠與木柵欄（docs/37）。
   * 幾何是「已經轉好世界座標以外」的原始幾何（含 color、aSplat）；這裡依每個擺放位置複製、合併進區塊。
   */
  upgradeProps(p: { lanternStone: THREE.BufferGeometry; lanternGlow: THREE.BufferGeometry; fence: THREE.BufferGeometry }): void;
  /** 測試與量測用：靜態道具的區塊網格數 */
  chunkMeshes(): number;
  dispose(): void;
}

export function buildWorldView(map: TerrainMap, seed: number, amb: AmbienceDef = ambienceFor(map.def.id)): WorldView {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T) => (geos.push(g), g);
  const trackM = <T extends THREE.Material>(m: T) => (mats.push(m), m);

  // ── 地形網格：每個頂點一個高度與一個顏色 ──
  const vc = map.cols + 1;
  const vr = map.rows + 1;
  const pos = new Float32Array(vc * vr * 3);
  const col = new Float32Array(vc * vr * 3);
  const c = new THREE.Color();
  const tmp = new THREE.Color();
  const rockColor = new THREE.Color(palette.terrain.rock);
  const tint = new THREE.Color(amb.terrainTint ?? '#ffffff');
  const detail = amb.groundDetail.strength > 0;
  // 場景貼圖（docs/37）：預設用 Poly Haven 的細節貼圖分層混合；像素風（?look=jrpg）保留舊的小草符號貼圖
  const textured = detail && currentLook().id !== 'jrpg';
  // 貼了細節貼圖（平均亮度 < 1）之後，頂點色要乘回來，整體亮度才不變
  const detailGain = textured ? 1 / LAYER_MEAN : detail ? groundDetailGain(amb.groundDetail.strength) : 1;
  const uv = new Float32Array(vc * vr * 2);
  const splat = new Float32Array(vc * vr * 4);
  const sx0 = map.def.playerStart.x;
  const sz0 = map.def.playerStart.z;
  /** 參道（石板路）：點到線段的距離 → 石板權重；路邊一圈泥土 */
  const sando = (x: number, z: number): [number, number] => {
    const ax = sx0 + SANDO.from.x;
    const az = sz0 + SANDO.from.z;
    const bx = sx0 + SANDO.to.x - ax;
    const bz = sz0 + SANDO.to.z - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz)));
    const d = Math.hypot(x - ax - bx * t, z - az - bz * t) + (fbm(x * 1.3, z * 1.3, seed ^ 0x5a, 2) - 0.5) * 0.5;
    const stone = 1 - Math.min(1, Math.max(0, (d - SANDO.halfWidth) / 0.25));
    const dirt = 1 - Math.min(1, Math.max(0, (d - SANDO.halfWidth) / SANDO.edge));
    return [stone, dirt];
  };
  for (let j = 0; j < vr; j++) {
    for (let i = 0; i < vc; i++) {
      const k = j * vc + i;
      const x = map.minX + i * map.cell;
      const z = map.minZ + j * map.cell;
      const h = map.heights[k];
      pos[k * 3] = x;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = z;
      // 顏色：周圍四格的地形色平均 + 依高度提亮 + 低頻色斑
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
        const ci = i + di;
        const cj = j + dj;
        if (ci < 0 || cj < 0 || ci >= map.cols || cj >= map.rows) continue;
        c.set(palette.terrain[TERRAIN_IDS[map.types[cj * map.cols + ci]]]);
        r += c.r;
        g += c.g;
        b += c.b;
        n++;
      }
      c.setRGB(r / n, g / n, b / n);
      const patch = (fbm(x * 0.2, z * 0.2, seed, 2) - 0.5) * 0.18;
      const lift = Math.max(0, h) * 0.035;
      // 陡處（懸崖、陡坡）露出岩石色，高處略亮
      const hl = map.heightAt(x - map.cell, z);
      const hr = map.heightAt(x + map.cell, z);
      const hu = map.heightAt(x, z - map.cell);
      const hd = map.heightAt(x, z + map.cell);
      const steep = Math.min(1, Math.max(0, (Math.hypot(hr - hl, hd - hu) / (2 * map.cell) - 0.45) / 0.5));
      // 大片的明暗（約 20 公尺一塊，層次感 2026-11-10）：亮的地方偏暖黃綠、暗的地方偏冷藍綠，像日系 RPG 手繪草地的色塊
      const big = (fbm(x * 0.045 + 31, z * 0.045 - 17, seed ^ 0x9e37, 3) - 0.5) * GROUND_LAYERS.bigPatch;
      // 低窪處（比周圍低：懸崖底、台地邊下方、水池周圍）變暗一點，像環境光遮蔽，高低差更明顯
      const ring = GROUND_LAYERS.cavityRadius * map.cell;
      const around = (map.heightAt(x - ring, z) + map.heightAt(x + ring, z) + map.heightAt(x, z - ring) + map.heightAt(x, z + ring)) / 4;
      const occ = Math.min(GROUND_LAYERS.cavityMax, Math.max(0, around - h) * GROUND_LAYERS.cavity);
      tmp.setRGB((1 + patch + lift + big * 0.75) * (1 - occ), (1 + patch + lift + big * 0.4) * (1 - occ * 0.9), (1 + patch * 0.6 + lift - big * 0.5) * (1 - occ * 0.6));
      c.multiply(tmp);
      if (steep > 0) c.lerp(rockColor, steep * 0.85);
      col[k * 3] = c.r * detailGain * tint.r;
      col[k * 3 + 1] = c.g * detailGain * tint.g;
      col[k * 3 + 2] = c.b * detailGain * tint.b;
      uv[k * 2] = x / amb.groundDetail.tile;
      uv[k * 2 + 1] = z / amb.groundDetail.tile;
      if (textured) {
        // 貼圖層的權重：周圍四格的地形種類平均（泥地 → 泥土、岩地 → 岩石、石地 → 石板、水底 → 泥土）＋陡處岩石＋零星的泥土斑塊＋參道
        let wd = 0;
        let ws = 0;
        let wr = 0;
        let m = 0;
        for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
          const ci = i + di;
          const cj = j + dj;
          if (ci < 0 || cj < 0 || ci >= map.cols || cj >= map.rows) continue;
          const t = TERRAIN_IDS[map.types[cj * map.cols + ci]];
          if (t === 'mud' || t === 'spring') wd += 1;
          else if (t === 'shallow' || t === 'deep') wd += WORLD_TEX.waterBed;
          else if (t === 'rock') wr += 1;
          else if (t === 'stone') ws += 1;
          m++;
        }
        wd /= m;
        ws /= m;
        wr = Math.max(wr / m, steep);
        const P = WORLD_TEX.dirtPatch;
        const dpatch = fbm(x * P.scale + 7, z * P.scale - 3, seed ^ 0x77, 3);
        wd = Math.max(wd, Math.min(1, Math.max(0, (dpatch - P.from) / (P.to - P.from))) * P.max);
        const [sStone, sDirt] = sando(x, z);
        ws = Math.max(ws, sStone);
        wd = Math.max(wd, sDirt * 0.8) * (1 - sStone);
        // 權重總和 ≤ 1（剩下的是草）：岩石優先（懸崖）、其次石板
        wr = Math.min(1, wr);
        ws = Math.min(ws, 1 - wr);
        wd = Math.min(wd, 1 - wr - ws);
        splat.set([wd, ws, wr, 0], k * 4);
        // 頂點色也跟著換：石板是石頭的灰、泥土斑塊與路邊是泥土色（不然石板會被草地的綠染成綠色）
        const lerpTo = (hex: string, w: number) => {
          if (w <= 0) return;
          tmp.set(hex);
          for (let q = 0; q < 3; q++) col[k * 3 + q] += (tmp.toArray()[q] * detailGain * [tint.r, tint.g, tint.b][q] * (1 + patch) - col[k * 3 + q]) * w;
        };
        lerpTo(palette.terrain.stone, ws);
        lerpTo(palette.terrain.mud, Math.min(1, wd) * 0.75);
      }
    }
  }
  const idx = new Uint32Array(map.cols * map.rows * 6);
  let q = 0;
  for (let j = 0; j < map.rows; j++) {
    for (let i = 0; i < map.cols; i++) {
      const a = j * vc + i;
      idx.set([a, a + vc, a + 1, a + 1, a + vc, a + vc + 1], q);
      q += 6;
    }
  }
  const tg = track(new THREE.BufferGeometry());
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (textured) tg.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
  tg.setIndex(new THREE.BufferAttribute(idx, 1));
  tg.computeVertexNormals();
  const detailTex = detail && !textured ? groundDetailTexture(seed, amb.groundDetail.strength) : null;
  // 場景貼圖材質：地形、岩石、石燈籠、柵欄共用這一個（同一個著色器程式）
  const worldMat = trackM(worldMaterial());
  const terrainMat = textured ? worldMat : trackM(softVertexColors(detailTex ? { map: detailTex } : {}));
  if (detailTex) texs.push(detailTex);
  const terrain = new THREE.Mesh(tg, terrainMat);
  terrain.receiveShadow = true;
  group.add(terrain);

  // ── 地圖外的暗地：直式手機的視野看得到地圖盡頭，不能露出天空 ──
  const skirtGeo = track(new THREE.CircleGeometry(220, 48).rotateX(-Math.PI / 2));
  const skirt = new THREE.Mesh(skirtGeo, trackM(soft(palette.night.groundDark)));
  skirt.position.y = -0.8; // 要低於水池的最低處（約 -0.55），否則地形凹下去的地方會透出暗地，看起來像一塊塊深色斑
  group.add(skirt);

  // ── 水面：每個水域一片半透明圓 ──
  for (const z of map.def.zones) {
    if (z.type !== 'shallow' && z.type !== 'deep') continue;
    const geo = track(new THREE.CircleGeometry(z.r, 40));
    const m = trackM(
      new THREE.MeshStandardMaterial({
        color: z.type === 'deep' ? palette.water.deep : palette.water.shallow,
        transparent: true,
        opacity: z.type === 'deep' ? 0.6 : 0.34,
        roughness: 0.25,
        depthWrite: false,
      }),
    );
    const water = new THREE.Mesh(geo, m);
    water.rotation.x = -Math.PI / 2;
    // 水面高度 = 池中心的地面高度 + 一點點（池塘不放在山上，所以周圍大致等高）
    const outer = Math.max(...map.def.zones.filter((o) => o.x === z.x && o.z === z.z).map((o) => o.r));
    water.position.set(z.x, map.heightAt(z.x + outer, z.z) + 0.04 + (z.type === 'deep' ? 0.01 : 0), z.z);
    water.renderOrder = 1;
    group.add(water);
  }

  // ── 障礙：岩石（鵝卵石）與石燈籠（docs/37：按區塊合併成少數幾個網格，岩石、石燈籠用場景貼圖材質）──
  const rng = new Rng(seed ^ 0x51ed);
  const lampMat = trackM(glow(palette.fire.torch, 2.2));
  const rockMat = textured ? worldMat : trackM(soft(palette.terrain.rock));
  const stoneMat = textured ? worldMat : trackM(soft(palette.terrain.stone));
  // 每一筆：已經轉到世界座標的幾何、用哪個材質、屬於哪一類（換 Blender 版時整類換掉）
  type Piece = { geo: THREE.BufferGeometry; mat: THREE.Material; kind: 'rock' | 'lantern' | 'decor'; x: number; z: number };
  let pieces: Piece[] = [];
  const m4 = new THREE.Matrix4();
  const place = (g: THREE.BufferGeometry, mat: THREE.Material, kind: Piece['kind'], x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1, color?: string, layer?: number) => {
    const out = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(sx, sy, sz)));
    if (out.getAttribute('uv')) out.deleteAttribute('uv');
    if (color) setColor(out, color, textured ? 1 / LAYER_MEAN : 1);
    if (layer !== undefined) {
      const w: [number, number, number, number] = [0, 0, 0, 0];
      w[layer] = 1;
      setSplat(out, w);
    }
    pieces.push({ geo: out, mat, kind, x, z });
  };
  const lanternSpots: { x: number; y: number; z: number; s: number; yaw: number }[] = [];
  for (const o of map.def.obstacles) {
    const y = map.heightAt(o.x, o.z);
    if (o.kind === 'rock') {
      const g = pebble(o.r * 1.15, rng, 0.14, 12);
      place(g, rockMat, 'rock', o.x, y + o.r * 0.55, o.z, rng.range(0, Math.PI * 2), 1, 0.8, 1, palette.terrain.rock, SPLAT.rock);
      g.dispose();
    } else {
      lanternSpots.push({ x: o.x, y, z: o.z, s: Math.max(0.8, o.r / 0.6), yaw: rng.range(0, Math.PI * 2) });
    }
  }
  // 程式建的石燈籠（Blender 版載好之前、或開發版沒帶 ?model=blender）：底座、柱、燈室（發光）、笠。
  // 合併成區塊後整塊一起畫（看不到的那幾座也算三角形），所以分段數比以前少（p1 的三角形預算）
  const codeLantern = (() => {
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, y: number, flip = false) => {
      if (flip) g.rotateX(Math.PI);
      g.translate(0, y, 0);
      parts.push(g.index ? g.toNonIndexed() : g);
    };
    add(roundedCylinder(0.34, 0.4, 0.18, 0.05, 12), 0);
    add(roundedCylinder(0.13, 0.15, 0.7, 0.04, 10), 0.18);
    add(roundedCylinder(0.0, 0.46, 0.2, 0.08, 12), 1.42, true);
    add(ball(0.09, 10, 6), 1.5);
    for (const p of parts) if (p.getAttribute('uv')) p.deleteAttribute('uv');
    const stone = mergeGeometries(parts, false);
    const box = roundedCylinder(0.26, 0.26, 0.34, 0.07, 12).translate(0, 0.88, 0);
    parts.forEach((p) => p.dispose());
    return { stone, glow: box };
  })();
  const addLanterns = (stone: THREE.BufferGeometry, glowGeo: THREE.BufferGeometry, fromModel: boolean) => {
    const spots = fromModel ? [...lanternSpots, ...SANDO.lanterns.map((l) => ({ x: sx0 + l.x, y: map.heightAt(sx0 + l.x, sz0 + l.z), z: sz0 + l.z, s: 1, yaw: 0 }))] : lanternSpots;
    for (const l of spots) {
      place(stone, stoneMat, 'lantern', l.x, l.y, l.z, l.yaw, l.s, l.s, l.s, fromModel ? undefined : palette.terrain.stone, fromModel ? undefined : SPLAT.rock);
      place(glowGeo, lampMat, 'lantern', l.x, l.y, l.z, l.yaw, l.s, l.s, l.s);
    }
  };
  addLanterns(codeLantern.stone, codeLantern.glow, false);
  codeLantern.stone.dispose();
  codeLantern.glow.dispose();

  // 區塊：WORLD_TEX.chunk 公尺見方一格，同一格、同一個材質的全部合併成一個網格（保留視錐剔除；draw call = 看得到的格數）
  const chunkGroup = new THREE.Group();
  group.add(chunkGroup);
  let chunkGeos: THREE.BufferGeometry[] = [];
  const rebuildChunks = () => {
    for (const g of chunkGeos) g.dispose();
    chunkGeos = [];
    chunkGroup.clear();
    const cells = new Map<string, Piece[]>();
    const C = WORLD_TEX.chunk;
    for (const p of pieces) {
      const key = `${Math.floor(p.x / C)},${Math.floor(p.z / C)},${p.mat.uuid}`;
      (cells.get(key) ?? cells.set(key, []).get(key)!).push(p);
    }
    for (const list of cells.values()) {
      const geo = mergeGeometries(list.map((p) => p.geo), false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      chunkGeos.push(geo);
      const isGlow = list[0].mat === lampMat;
      chunkGroup.add(mesh(geo, list[0].mat, !isGlow, !isGlow));
    }
  };
  rebuildChunks();

  return {
    group,
    upgradeProps({ lanternStone, lanternGlow, fence }) {
      if (!textured) return;
      for (const p of pieces) if (p.kind === 'lantern') p.geo.dispose();
      pieces = pieces.filter((p) => p.kind !== 'lantern');
      addLanterns(lanternStone, lanternGlow, true);
      for (const f of SANDO.fences) {
        const x = sx0 + f.x;
        const z = sz0 + f.z;
        place(fence, worldMat, 'decor', x, map.heightAt(x, z), z, Math.PI / 2);
      }
      rebuildChunks();
    },
    chunkMeshes: () => chunkGroup.children.length,
    dispose() {
      for (const p of pieces) p.geo.dispose();
      for (const g of chunkGeos) g.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
      group.removeFromParent();
    },
  };
}
