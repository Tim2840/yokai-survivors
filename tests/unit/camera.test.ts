import { describe, expect, it } from 'vitest';
import { CAMERA, fovForAspect, horizontalView } from '../../src/data/camera';
import { CameraRig, worldMove } from '../../src/core/cameraRig';
import { makeHighlands } from '../../src/data/maps/highlands';
import { TerrainMap } from '../../src/world/terrainMap';
import { Rng } from '../../src/lib/random';

describe('鏡頭視野（自由視角版）', () => {
  it('橫式維持基本 FOV', () => {
    expect(fovForAspect(16 / 9)).toBe(CAMERA.baseFovDeg);
  });
  it('直式手機 390×780：FOV 放大、水平可視 ≥ 9 公尺（舊版只有約 6 公尺會紅）', () => {
    const a = 390 / 780;
    const fov = fovForAspect(a);
    expect(fov).toBeGreaterThan(CAMERA.baseFovDeg);
    expect(horizontalView(a, fov)).toBeGreaterThanOrEqual(CAMERA.minHorizontalView - 1e-6);
    expect(horizontalView(a, CAMERA.baseFovDeg)).toBeLessThan(CAMERA.minHorizontalView);
  });
  it('極窄畫面 FOV 不超過上限', () => {
    expect(fovForAspect(0.2)).toBe(CAMERA.maxFovDeg);
  });
});

describe('移動相對鏡頭', () => {
  const out = new Float32Array(2);
  it('yaw = 0：與世界座標相同（W = −z、D = +x）', () => {
    worldMove(0, -1, 0, out);
    expect([out[0], out[1]].map((v) => Math.round(v * 1000) / 1000)).toEqual([0, -1]);
    worldMove(1, 0, 0, out);
    expect([Math.round(out[0] * 1000) / 1000, Math.round(out[1] * 1000) / 1000]).toEqual([1, 0]);
  });
  it('全掃：任何 yaw，「往前」都是鏡頭看的方向（鏡頭位置 → 玩家）；「往右」垂直於它且在右手邊；長度不變', () => {
    const rig = new CameraRig();
    const flat = { heightAt: () => 0 };
    for (let yaw = -Math.PI; yaw <= Math.PI; yaw += 0.3) {
      rig.yaw = yaw;
      rig.snap(0, 0, 0, flat);
      const fx = rig.tx - rig.x;
      const fz = rig.tz - rig.z;
      const fl = Math.hypot(fx, fz);
      worldMove(0, -1, yaw, out);
      expect(out[0]).toBeCloseTo(fx / fl, 5);
      expect(out[1]).toBeCloseTo(fz / fl, 5);
      worldMove(1, 0, yaw, out);
      expect(out[0] * fx + out[1] * fz).toBeCloseTo(0, 5);
      // 右手邊：前 × 右 在 y 軸向下（Three.js 右手座標）→ fx*rz − fz*rx > 0 ... 用旋轉方向驗：(rx,rz) 是 (fx,fz) 順時針轉 90°（從上往下看）
      expect(fx * out[1] - fz * out[0]).toBeGreaterThan(0);
      worldMove(0.6, -0.8, yaw, out);
      expect(Math.hypot(out[0], out[1])).toBeCloseTo(1, 5);
    }
  });
});

describe('軌道鏡頭與彈簧臂', () => {
  it('pitch 夾在上下限、yaw 轉一圈回到原處（不會無限增大）', () => {
    const rig = new CameraRig();
    rig.rotate(0, 100);
    expect(rig.pitch).toBeCloseTo((CAMERA.maxPitchDeg * Math.PI) / 180);
    rig.rotate(0, -100);
    expect(rig.pitch).toBeCloseTo((CAMERA.minPitchDeg * Math.PI) / 180);
    rig.yaw = 0;
    for (let i = 0; i < 1000; i++) rig.rotate(0.37, 0);
    expect(Math.abs(rig.yaw)).toBeLessThanOrEqual(Math.PI + 1e-9);
  });

  it('平地上：鏡頭在玩家後上方，距離與俯角正確', () => {
    const rig = new CameraRig();
    rig.snap(0, 0, 0, { heightAt: () => 0 });
    expect(Math.hypot(rig.x - rig.tx, rig.y - rig.ty, rig.z - rig.tz)).toBeCloseTo(CAMERA.distance, 5);
    expect(rig.z).toBeGreaterThan(rig.tz);
    expect(rig.y).toBeGreaterThan(rig.ty);
  });

  it('全掃（T3）：20 張地圖 × 每張 150 個位置 × 隨機 yaw 與 pitch，鏡頭都在地形上方、距離不小於最短距離（舊的「不管地形」版本會穿地）', () => {
    const rng = new Rng(77);
    let worstClear = Infinity;
    let pulled = 0;
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const map = new TerrainMap(makeHighlands(seed));
      const rig = new CameraRig();
      for (let k = 0; k < 150; k++) {
        const px = rng.range(map.minX + 2, map.maxX - 2);
        const pz = rng.range(map.minZ + 2, map.maxZ - 2);
        const py = map.heightAt(px, pz);
        rig.yaw = rng.range(-Math.PI, Math.PI);
        rig.pitch = (rng.range(CAMERA.minPitchDeg, CAMERA.maxPitchDeg) * Math.PI) / 180;
        rig.snap(px, py, pz, map);
        total++;
        if (rig.dist < CAMERA.distance - 1e-6) pulled++;
        expect(Number.isFinite(rig.x + rig.y + rig.z)).toBe(true);
        expect(rig.dist).toBeGreaterThanOrEqual(CAMERA.minDistance - 1e-6);
        const clear = rig.y - map.heightAt(rig.x, rig.z);
        worstClear = Math.min(worstClear, clear);
        expect(clear, `種子 ${seed} 位置 ${px.toFixed(1)},${pz.toFixed(1)} yaw ${rig.yaw.toFixed(2)}`).toBeGreaterThanOrEqual(CAMERA.hardMargin - 1e-6);
      }
    }
    console.log(`鏡頭全掃：${total} 組，彈簧臂縮短 ${pulled} 組（${((pulled / total) * 100).toFixed(1)}%），最小離地 ${worstClear.toFixed(2)} 公尺`);
    expect(pulled).toBeGreaterThan(0); // 地形有起伏，彈簧臂真的有作用
  });

  it('玩家快速繞圈走動：連續更新時鏡頭永遠在地形上方（不是只有 snap 時才對）', () => {
    const map = new TerrainMap(makeHighlands(4));
    const rig = new CameraRig();
    let px = 0, pz = 0;
    rig.snap(px, map.heightAt(px, pz), pz, map);
    let worst = Infinity;
    for (let i = 0; i < 4000; i++) {
      const a = i * 0.004;
      px = Math.min(50, Math.max(-50, px + Math.cos(a * 3) * 0.12));
      pz = Math.min(50, Math.max(-50, pz + Math.sin(a * 2) * 0.12));
      rig.rotate(0.01, Math.sin(i * 0.01) * 0.004);
      rig.update(1 / 60, px, map.heightAt(px, pz), pz, map);
      worst = Math.min(worst, rig.y - map.heightAt(rig.x, rig.z));
    }
    expect(worst).toBeGreaterThanOrEqual(CAMERA.hardMargin - 1e-6);
  });

  it('彈簧臂放開時距離是慢慢回復的（不是瞬間跳回去）', () => {
    const wall = { heightAt: (x: number, z: number) => (z > 4 ? 20 : 0) };
    const rig = new CameraRig();
    rig.yaw = 0; // 鏡頭在 +z 側
    rig.snap(0, 0, 0, wall);
    const pulled = rig.dist;
    expect(pulled).toBeLessThan(CAMERA.distance);
    // 把牆移開
    const open = { heightAt: () => 0 };
    rig.update(1 / 60, 0, 0, 0, open);
    expect(rig.dist).toBeGreaterThan(pulled);
    expect(rig.dist).toBeLessThan(CAMERA.distance - 0.1);
  });
});
