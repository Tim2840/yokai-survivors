import { palette } from '../art/palette';
import { MINIMAP, type MarkerShape } from '../data/minimap';
import { collectMarkers, markers, type Marker } from '../game/minimapMarkers';
import { TERRAIN } from '../data/terrain';
import { t } from '../i18n';
import type { Run } from '../game/run';
import type { TerrainMap } from '../world/terrainMap';

/**
 * 小地圖（D66，docs/21）：右上角、北在上固定。底圖（地形：高低明暗、水、岩石、擋路處）每張地圖畫一次；
 * 動態層（玩家與鏡頭扇形、要素、傳送門、頭目、精英）以 MINIMAP.hz 重畫。點一下放大／縮小（不暫停、不是彈窗）。
 */

/** 世界座標 → 小地圖像素（北在上：−z 在上）。純函式，單元測試用 */
export function worldToMap(map: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number, size: number): { px: number; py: number } {
  return { px: ((x - map.minX) / (map.maxX - map.minX)) * size, py: ((z - map.minZ) / (map.maxZ - map.minZ)) * size };
}

export interface Minimap {
  root: HTMLElement;
  /** 每幀呼叫（內部自己限頻）：yaw = 鏡頭 yaw */
  update(run: Run, yaw: number, dtSeconds: number): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

export function buildMinimap(parent: HTMLElement): Minimap {
  const root = document.createElement('button');
  root.type = 'button';
  root.className = 'minimap hidden';
  root.id = 'minimap';
  root.setAttribute('aria-label', t('minimap.label'));
  const canvas = document.createElement('canvas');
  root.appendChild(canvas);
  parent.appendChild(root);
  const ctx = canvas.getContext('2d')!;
  const base = document.createElement('canvas');
  let baseMap: TerrainMap | null = null;
  let acc = 1;
  let big = false;
  root.addEventListener('click', () => {
    big = !big;
    root.classList.toggle('big', big);
    acc = 1;
  });

  const drawBase = (map: TerrainMap): void => {
    const longest = Math.max(map.cols, map.rows);
    const k = Math.min(1, MINIMAP.baseMax / longest);
    base.width = Math.max(1, Math.round(map.cols * k));
    base.height = Math.max(1, Math.round(map.rows * k));
    const bctx = base.getContext('2d')!;
    const img = bctx.createImageData(base.width, base.height);
    let hMin = Infinity;
    let hMax = -Infinity;
    for (let i = 0; i < map.heights.length; i++) {
      const h = map.heights[i];
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
    const span = Math.max(1e-6, hMax - hMin);
    const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const col = { deep: rgb(palette.minimap.water), shallow: rgb(palette.minimap.shallow), land: rgb(palette.minimap.land), rock: rgb(palette.minimap.rock), mud: rgb(palette.minimap.mud), blocked: rgb(palette.minimap.blocked) };
    for (let py = 0; py < base.height; py++) {
      for (let px = 0; px < base.width; px++) {
        const x = map.minX + ((px + 0.5) / base.width) * (map.maxX - map.minX);
        const z = map.minZ + ((py + 0.5) / base.height) * (map.maxZ - map.minZ);
        const id = map.typeIdAt(x, z);
        let c = col.land;
        if (!TERRAIN[id].walkable && id === 'deep') c = col.deep;
        else if (id === 'shallow') c = col.shallow;
        else if (id === 'rock' || id === 'stone') c = col.rock;
        else if (id === 'mud') c = col.mud;
        let f = 1;
        if (id !== 'deep' && id !== 'shallow') f = 1 - MINIMAP.shade + MINIMAP.shade * 2 * ((map.heightAt(x, z) - hMin) / span);
        const o = (py * base.width + px) * 4;
        const blocked = map.isBlocked(x, z) && id !== 'deep';
        const cc = blocked ? col.blocked : c;
        img.data[o] = Math.min(255, cc[0] * f);
        img.data[o + 1] = Math.min(255, cc[1] * f);
        img.data[o + 2] = Math.min(255, cc[2] * f);
        img.data[o + 3] = 235;
      }
    }
    bctx.putImageData(img, 0, 0);
    baseMap = map;
  };

  const fit = (): number => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const portrait = h > w;
    const basic = coarse ? (portrait ? MINIMAP.size.portrait : MINIMAP.size.landscape) : MINIMAP.size.desktop;
    const size = Math.round(basic * (big ? MINIMAP.bigScale : 1));
    // 版面（docs/21）：小圖佔掉右上角，中間的提示往左讓出這一欄；橫式手機放大時往左挪，免得蓋住大招與跳躍鈕
    document.documentElement.style.setProperty('--mm-reserve', `${basic + 8}px`);
    root.classList.toggle('shift', big && coarse && !portrait);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }
    return size;
  };

  const drawShape = (shape: MarkerShape, x: number, y: number, r: number): void => {
    ctx.beginPath();
    switch (shape) {
      case 'circle':
        ctx.arc(x, y, r, 0, Math.PI * 2);
        break;
      case 'square':
        ctx.rect(x - r, y - r, r * 2, r * 2);
        break;
      case 'diamond':
        ctx.moveTo(x, y - r * 1.2);
        ctx.lineTo(x + r * 1.2, y);
        ctx.lineTo(x, y + r * 1.2);
        ctx.lineTo(x - r * 1.2, y);
        ctx.closePath();
        break;
      case 'triangle':
        ctx.moveTo(x, y - r * 1.2);
        ctx.lineTo(x + r * 1.1, y + r * 0.9);
        ctx.lineTo(x - r * 1.1, y + r * 0.9);
        ctx.closePath();
        break;
      case 'star':
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rr = i % 2 === 0 ? r * 1.3 : r * 0.55;
          if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        break;
    }
  };
  const colorOf = (m: Marker): string => (palette.minimap as Record<string, string>)[m.group === 'portal' ? 'portal' : m.group === 'elite' ? 'elite' : m.group] ?? '#ffffff';

  return {
    root,
    update(run, yaw, dt) {
      acc += dt;
      if (acc < 1 / MINIMAP.hz) return;
      acc = 0;
      if (baseMap !== run.map) drawBase(run.map);
      const size = fit();
      const dpr = canvas.width / size;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.globalAlpha = 1;
      ctx.drawImage(base, 0, 0, size, size);
      const map = run.map;
      const n = collectMarkers(run);
      const r = (big ? MINIMAP.bigMarkerSize : MINIMAP.markerSize) / 2;
      const beat = 0.5 + 0.5 * Math.sin(run.clock * 6);
      for (let i = 0; i < n; i++) {
        const m = markers[i];
        const p = worldToMap(map, m.x, m.z, size);
        const rr = m.big ? r * (1.3 + 0.25 * beat) : r;
        drawShape(m.shape, p.px, p.py, rr);
        ctx.fillStyle = colorOf(m);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.stroke();
        if (m.high) {
          ctx.beginPath();
          ctx.arc(p.px, p.py, rr * 1.9, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
      // 玩家：鏡頭看的方向的淡色扇形＋白色箭頭（朝移動方向；不動時朝鏡頭方向）
      const me = worldToMap(map, run.px, run.pz, size);
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const ang = Math.atan2(fz, fx);
      ctx.beginPath();
      ctx.moveTo(me.px, me.py);
      ctx.arc(me.px, me.py, size * 0.2, ang - 0.5, ang + 0.5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill();
      const fa = run.facing;
      const ax = Math.sin(fa);
      const az = Math.cos(fa);
      const pa = Math.atan2(az, ax);
      ctx.beginPath();
      ctx.moveTo(me.px + Math.cos(pa) * r * 1.9, me.py + Math.sin(pa) * r * 1.9);
      ctx.lineTo(me.px + Math.cos(pa + 2.5) * r * 1.5, me.py + Math.sin(pa + 2.5) * r * 1.5);
      ctx.lineTo(me.px + Math.cos(pa - 2.5) * r * 1.5, me.py + Math.sin(pa - 2.5) * r * 1.5);
      ctx.closePath();
      ctx.fillStyle = palette.minimap.player;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    },
    setVisible(v) {
      root.classList.toggle('hidden', !v);
      if (v) acc = 1;
    },
    dispose() {
      root.remove();
    },
  };
}
