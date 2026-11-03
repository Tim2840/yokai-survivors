import { describe, expect, it } from 'vitest';
import { CAMERA, fovForAspect, horizontalView } from '../../src/data/camera';

describe('鏡頭視野（docs/06 第 7 節）', () => {
  it('橫式維持基本 FOV 35°', () => {
    expect(fovForAspect(16 / 9)).toBe(CAMERA.baseFovDeg);
    expect(fovForAspect(1280 / 720)).toBe(CAMERA.baseFovDeg);
  });
  it('直式手機 390×780：FOV 放大、水平可視 ≥ 14 公尺（舊版只有約 7.8 公尺會紅）', () => {
    const a = 390 / 780;
    const fov = fovForAspect(a);
    expect(fov).toBeGreaterThan(CAMERA.baseFovDeg);
    expect(horizontalView(a, fov)).toBeGreaterThanOrEqual(CAMERA.minHorizontalView - 1e-6);
    expect(horizontalView(a, CAMERA.baseFovDeg)).toBeLessThan(9);
  });
  it('極窄畫面 FOV 不超過上限', () => {
    expect(fovForAspect(0.3)).toBe(CAMERA.maxFovDeg);
  });
});
