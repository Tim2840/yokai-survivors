import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/lib/random';
import { fbm, valueNoise } from '../../src/lib/noise';

describe('Rng（固定種子，可重現）', () => {
  it('同一個種子給出同一串數字', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });
  it('不同種子給出不同的數字', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });
  it('range／int 落在範圍內', () => {
    const r = new Rng(7);
    for (let i = 0; i < 200; i++) {
      const x = r.range(2, 5);
      expect(x).toBeGreaterThanOrEqual(2);
      expect(x).toBeLessThan(5);
      const n = r.int(1, 3);
      expect([1, 2, 3]).toContain(n);
    }
  });
});

describe('noise（地形起伏用）', () => {
  it('valueNoise 在 0..1、fbm 在 -1..1，且同輸入同輸出', () => {
    for (let i = 0; i < 100; i++) {
      const v = valueNoise(i * 0.37, i * 0.91, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      const f = fbm(i * 0.37, i * 0.91, 3);
      expect(f).toBeGreaterThanOrEqual(-1);
      expect(f).toBeLessThanOrEqual(1);
      expect(fbm(i * 0.37, i * 0.91, 3)).toBe(f);
    }
  });
});
