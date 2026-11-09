import * as THREE from 'three';
import { Rng } from '../lib/random';

/**
 * 地表細節貼圖（程式畫出來的、可無縫重複的草地紋理）：深淺不一的短筆畫＋細斑點。
 * 亮度範圍 (1 - strength)～1，平均約 1 - strength / 2：貼在地形上是「乘」，所以地形頂點色要先乘 groundDetailGain 補回來。
 */
export function groundDetailGain(strength: number): number {
  return 1 / (1 - strength / 2);
}

export function groundDetailTexture(seed: number, strength: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const lo = 1 - strength;
  const base = (lo + 1) / 2;
  ctx.fillStyle = `rgb(${Math.round(base * 255)},${Math.round(base * 255)},${Math.round(base * 255)})`;
  ctx.fillRect(0, 0, size, size);
  const rng = new Rng(seed ^ 0x9e37);
  // 同一筆畫在上下左右各畫一次（位置 ± size），貼圖才無縫
  const stroke = (x: number, y: number, len: number, ang: number, v: number, w: number, a: number) => {
    const c = Math.round(Math.min(1, Math.max(lo, v)) * 255);
    ctx.strokeStyle = `rgba(${c},${c},${c},${a})`;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len);
        ctx.stroke();
      }
    }
  };
  // 大片的明暗塊（低頻，鋪滿整張）
  for (let i = 0; i < 46; i++) {
    const v = rng.range(lo, 1);
    stroke(rng.range(0, size), rng.range(0, size), rng.range(20, 60), rng.range(0, Math.PI * 2), v, rng.range(30, 80), 0.22);
  }
  // 葉片筆畫：偏向朝上的短線，比較粗（太細的筆畫在遠處會被縮圖抹掉）
  for (let i = 0; i < 640; i++) {
    const dark = rng.next() < 0.55;
    const v = dark ? rng.range(lo, base) : rng.range(base, 1);
    stroke(rng.range(0, size), rng.range(0, size), rng.range(8, 20), -Math.PI / 2 + rng.range(-0.8, 0.8), v, rng.range(2, 4.2), rng.range(0.4, 0.85));
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace; // 當成明暗倍率，不做色彩空間轉換
  tex.anisotropy = 4;
  return tex;
}
