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
import { GROUND_LAYERS } from '../data/look';

/**
 * 地形與場景物件的 3D 外觀（高度圖網格、水面、石頭與石燈籠）。一局建一次、結束時 dispose。
 * 顏色一律取自 palette；材質用 soft()／softVertexColors()／glow()，沒有 flatShading。
 */
export interface WorldView {
  group: THREE.Group;
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
  // 貼了細節貼圖（平均亮度 < 1）之後，頂點色要乘回來，整體亮度才不變
  const detailGain = detail ? groundDetailGain(amb.groundDetail.strength) : 1;
  const uv = new Float32Array(vc * vr * 2);
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
  tg.setIndex(new THREE.BufferAttribute(idx, 1));
  tg.computeVertexNormals();
  const detailTex = detail ? groundDetailTexture(seed, amb.groundDetail.strength) : null;
  const terrainMat = trackM(softVertexColors(detailTex ? { map: detailTex } : {}));
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

  // ── 障礙：岩石（鵝卵石）與石燈籠 ──
  const rng = new Rng(seed ^ 0x51ed);
  const rockMat = trackM(soft(palette.terrain.rock));
  const stoneMat = trackM(soft(palette.terrain.stone));
  const lampMat = trackM(glow(palette.fire.torch, 2.2));
  for (const o of map.def.obstacles) {
    const y = map.heightAt(o.x, o.z);
    if (o.kind === 'rock') {
      const g = track(pebble(o.r * 1.15, rng, 0.14));
      const m = mesh(g, rockMat);
      m.position.set(o.x, y + o.r * 0.55, o.z);
      m.scale.set(1, 0.8, 1);
      m.rotation.y = rng.range(0, Math.PI * 2);
      group.add(m);
    } else {
      // 石燈籠：底座、柱、燈室（發光）、笠
      const lamp = new THREE.Group();
      const base = mesh(track(roundedCylinder(0.34, 0.4, 0.18, 0.05)), stoneMat);
      const pillar = mesh(track(roundedCylinder(0.13, 0.15, 0.7, 0.04)), stoneMat);
      pillar.position.y = 0.18;
      const box = mesh(track(roundedCylinder(0.26, 0.26, 0.34, 0.07)), lampMat, false);
      box.position.y = 0.88;
      const cap = mesh(track(roundedCylinder(0.0, 0.46, 0.2, 0.08)), stoneMat);
      cap.scale.y = 1;
      cap.position.y = 1.22;
      cap.rotation.x = Math.PI;
      cap.position.y = 1.42;
      const top = mesh(track(ball(0.09)), stoneMat);
      top.position.y = 1.5;
      lamp.add(base, pillar, box, cap, top);
      lamp.position.set(o.x, y, o.z);
      lamp.scale.setScalar(Math.max(0.8, o.r / 0.6));
      group.add(lamp);
    }
  }

  return {
    group,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
      group.removeFromParent();
    },
  };
}
