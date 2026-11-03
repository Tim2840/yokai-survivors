import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Rng } from '../lib/random';

/**
 * 圓潤卡通風的造型工具。原則：
 * - 旋轉體一律用 lathe（車床）+ 圓角輪廓，邊緣不會有稜角
 * - 需要不規則感時用低頻、平滑的形變（pebble），不用隨機亂推頂點
 */

type P = [number, number];

/** 把折線輪廓的每個內角換成圓弧（二次貝茲曲線），首尾兩點保持不動 */
export function roundCorners(points: P[], radius: number, steps = 5): THREE.Vector2[] {
  const pts = points.map(([x, y]) => new THREE.Vector2(x, y));
  const out: THREE.Vector2[] = [pts[0].clone()];
  const push = (v: THREE.Vector2) => {
    if (out[out.length - 1].distanceTo(v) > 1e-4) out.push(v);
  };
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const da = pts[i - 1].clone().sub(p);
    const db = pts[i + 1].clone().sub(p);
    const r = Math.min(radius, da.length() / 2, db.length() / 2);
    const p1 = p.clone().add(da.normalize().multiplyScalar(r));
    const p2 = p.clone().add(db.normalize().multiplyScalar(r));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      push(
        new THREE.Vector2(
          (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * p.x + t * t * p2.x,
          (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * p.y + t * t * p2.y,
        ),
      );
    }
  }
  push(pts[pts.length - 1].clone());
  return out;
}

/**
 * 旋轉體：profile 是 [半徑, 高度] 的點列，由下往上排列，首尾放在軸上（半徑 0）就會封口。
 * radius > 0 時自動把轉角修圓。
 */
export function lathe(profile: P[], opts: { radius?: number; segments?: number; steps?: number } = {}) {
  const pts = opts.radius
    ? roundCorners(profile, opts.radius, opts.steps ?? 5)
    : profile.map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, opts.segments ?? 24);
}

/** 圓角圓柱／圓盤：底部在 y=0 */
export function roundedCylinder(radiusTop: number, radiusBottom: number, height: number, round: number, segments = 24) {
  return lathe(
    [
      [0, 0],
      [radiusBottom, 0],
      [radiusTop, height],
      [0, height],
    ],
    { radius: round, segments },
  );
}

/**
 * 水滴形：底部圓潤、頂端收尖，底部在 y=0、尖端在 y=height。
 * bulge 控制最胖的位置（越小越靠下），sharp 控制尖端（>1 更細長，<1 更圓鈍）。
 */
export function teardrop(radius: number, height: number, opts: { bulge?: number; sharp?: number; segments?: number } = {}) {
  const k = opts.bulge ?? 0.58;
  const s = opts.sharp ?? 1;
  const n = 18;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const r = i === 0 || i === n ? 0 : radius * Math.pow(Math.sin(Math.PI * Math.pow(u, k)), s);
    pts.push(new THREE.Vector2(r, u * height));
  }
  return new THREE.LatheGeometry(pts, opts.segments ?? 20);
}

/** 平滑的球 */
export function ball(radius: number, widthSegments = 24, heightSegments = 16) {
  return new THREE.SphereGeometry(radius, widthSegments, heightSegments);
}

/**
 * 鵝卵石：球體加上低頻、平滑的起伏，看起來自然又圓潤。
 * 先合併接縫頂點再算法線，接縫處才不會出現折線。
 */
export function pebble(radius: number, rng: Rng, lumpiness = 0.12, segments = 20) {
  const g = mergeVertices(
    new THREE.SphereGeometry(radius, segments, Math.round(segments * 0.7)).deleteAttribute('normal').deleteAttribute('uv'),
  );
  const waves = Array.from({ length: 4 }, () => ({
    k: new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize().multiplyScalar(rng.range(1.2, 2.4)),
    p: rng.range(0, Math.PI * 2),
  }));
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = v.clone().normalize();
    let n = 0;
    for (const w of waves) n += Math.sin(d.dot(w.k) * Math.PI + w.p);
    v.multiplyScalar(1 + (n / waves.length) * lumpiness);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** 建立網格並設定陰影 */
export function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, cast = true, receive = true) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// ── 讓零件「一定接得上」的工具 ─────────────────────────────────────────
// 角色的手、腳、五官都不要手打座標：位置要由「父部位的尺寸」算出來，連接點才不會漂掉或歪掉。

/** 兩點之間的圓頭肢體（膠囊）：兩端的圓心正好落在 from、to，起點放在身體裡面就一定接得上 */
export function limb(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material, cast = true) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const m = mesh(new THREE.CapsuleGeometry(radius, Math.max(0.0001, len), 6, 14), material, cast);
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** 橢球（半徑 radii、中心 center）表面上，從中心朝 dir 方向的那一點 */
export function ellipsoidPoint(center: THREE.Vector3, radii: THREE.Vector3, dir: THREE.Vector3) {
  const d = dir.clone().normalize();
  const t = 1 / Math.sqrt((d.x / radii.x) ** 2 + (d.y / radii.y) ** 2 + (d.z / radii.z) ** 2);
  return center.clone().addScaledVector(d, t);
}

/** 橢球前面（+z）表面在 (x, y) 位置的 z（中心在原點）；超出橢球範圍回傳 NaN。五官貼在臉上用它算深度 */
export function ellipsoidFrontZ(radii: THREE.Vector3, x: number, y: number) {
  const k = 1 - (x / radii.x) ** 2 - (y / radii.y) ** 2;
  return k <= 0 ? NaN : radii.z * Math.sqrt(k);
}

/** 貼在橢球表面的曲線（例如嘴巴）：points 是 (x, y) 序列，z 自動算出來，再往外推一點點免得被埋住 */
export function surfaceCurve(radii: THREE.Vector3, points: [number, number][], lift = 0.004) {
  return points.map(([x, y]) => new THREE.Vector3(x, y, ellipsoidFrontZ(radii, x, y) + lift));
}

/**
 * 沿著一條弧線排的圓球串（半徑由粗漸細）：做彎彎的鉤嘴、尖端要圓滑不能有三角形時用。
 * path 是點列（從根部到尖端），r0、r1 是根部與尖端的半徑；球一個疊著一個，看起來是一條連續的錐形。
 */
export function beadChain(path: THREE.Vector3[], r0: number, r1: number, material: THREE.Material, cast = true) {
  const g = new THREE.Group();
  const n = path.length;
  path.forEach((p, i) => {
    const u = n === 1 ? 0 : i / (n - 1);
    const b = mesh(new THREE.SphereGeometry(THREE.MathUtils.lerp(r0, r1, Math.pow(u, 0.85)), 14, 10), material, cast, false);
    b.position.copy(p);
    g.add(b);
  });
  return g;
}

/** 二次貝茲弧線上的 n 個點（from → to，control 是彎曲的方向） */
export function arcPoints(from: THREE.Vector3, control: THREE.Vector3, to: THREE.Vector3, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const u = i / (n - 1);
    return new THREE.Vector3().addScaledVector(from, (1 - u) * (1 - u)).addScaledVector(control, 2 * (1 - u) * u).addScaledVector(to, u * u);
  });
}

/** 沿著曲線的圓管（兩端補圓頭），用來畫嘴、眉毛這種貼在表面的線條 */
export function tubeAlong(points: THREE.Vector3[], radius: number, material: THREE.Material) {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(points);
  g.add(mesh(new THREE.TubeGeometry(curve, points.length * 6, radius, 8, false), material, false, false));
  for (const p of [points[0], points[points.length - 1]]) {
    const cap = mesh(new THREE.SphereGeometry(radius, 10, 8), material, false, false);
    cap.position.copy(p);
    g.add(cap);
  }
  return g;
}
