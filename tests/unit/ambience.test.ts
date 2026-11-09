import { describe, it, expect } from 'vitest';
import { AMBIENCE, ambienceFor, type AmbienceDef } from '../../src/data/ambience';
import * as THREE from 'three';
import { groundDetailGain, groundDetailTexture } from '../../src/art/groundTexture';
import { makeHighlands } from '../../src/data/maps/highlands';
import { PROTOTYPE_MAP } from '../../src/data/maps/prototype';

/** 場景氣氛（美術第一輪 A，docs/23）：每張地圖的主題參數要完整、顏色合法、數量在效能預算內 */
const HEX = /^#[0-9a-fA-F]{6}$/;

function colorsOf(a: AmbienceDef): string[] {
  return [a.sky.horizon, a.sky.mid, a.sky.top, a.sky.stars.color, a.sky.moon.color, a.fog.color, a.hemi.sky, a.hemi.ground, ...a.tufts.colors, ...a.flowers.colors, ...a.bushes.colors, ...a.trees.canopy, ...a.trees.autumnColors, a.trees.trunk, a.motes.color];
}

describe('場景氣氛資料全掃', () => {
  for (const [id, a] of Object.entries(AMBIENCE)) {
    it(`${id}：顏色都是合法色碼、地平線與霧同色（地圖盡頭才接得起來）`, () => {
      for (const c of colorsOf(a)) expect(c, `${id}`).toMatch(HEX);
      expect(a.sky.horizon.toLowerCase()).toBe(a.fog.color.toLowerCase());
      expect(a.fog.near).toBeLessThan(a.fog.far);
    });
    it(`${id}：月亮的仰角低到鏡頭壓低時看得到（5～30 度）；光點的顏色不是魂火的青色也不是燈火的橘色`, () => {
      expect(a.sky.moon.elevation).toBeGreaterThanOrEqual(5);
      expect(a.sky.moon.elevation).toBeLessThanOrEqual(30);
      expect(a.motes.color.toLowerCase()).not.toBe('#9fe8ff');
      expect(a.motes.color.toLowerCase()).not.toBe('#ffc46b');
    });
    it(`${id}：裝飾的三角形總數在預算內（手機直式滿場還有餘裕 ≤ 40000）；手機倍率 0～1`, () => {
      const tris = a.tufts.count * 5 + a.flowers.clusters * a.flowers.perCluster * 8 + a.bushes.count * 80 + a.trees.count * (12 + 80);
      expect(tris * a.mobileScale).toBeLessThanOrEqual(40000);
      expect(a.mobileScale).toBeGreaterThan(0);
      expect(a.mobileScale).toBeLessThanOrEqual(1);
      expect(a.groundDetail.strength).toBeGreaterThanOrEqual(0);
      expect(a.groundDetail.strength).toBeLessThan(0.9);
      expect(a.groundDetail.tile).toBeGreaterThan(0);
    });
  }
  it('每張地圖（程式生成的與原型）都找得到主題：沒有專屬主題就用 highlands（不會是 undefined）', () => {
    for (const seed of [1, 2, 3, 93]) expect(ambienceFor(makeHighlands(seed).id)).toBeTruthy();
    expect(ambienceFor(PROTOTYPE_MAP.id)).toBe(AMBIENCE.highlands);
    expect(ambienceFor('不存在的地圖')).toBe(AMBIENCE.highlands);
  });
  it('地表細節貼圖：真的算出來的平均亮度 × 補償 ≈ 1（誤差 5% 內）、最近點取樣不做 mipmap（像素畫風）、亮度在 (1 - 強度)～1', () => {
    for (const s of [0.2, 0.3, 0.4]) {
      const tex = groundDetailTexture(93, s);
      const d = tex.image.data as Uint8Array;
      let sum = 0;
      let min = 255;
      for (let i = 0; i < d.length; i += 4) {
        sum += d[i];
        min = Math.min(min, d[i]);
      }
      const mean = sum / (d.length / 4) / 255;
      expect(mean * groundDetailGain(s), `強度 ${s}：平均 ${mean}`).toBeGreaterThan(0.95);
      expect(mean * groundDetailGain(s)).toBeLessThan(1.05);
      expect(min / 255).toBeGreaterThanOrEqual(1 - s - 0.01);
      expect(tex.magFilter).toBe(THREE.NearestFilter);
      expect(tex.minFilter).toBe(THREE.NearestFilter);
      expect(tex.generateMipmaps).toBe(false);
    }
  });

});
