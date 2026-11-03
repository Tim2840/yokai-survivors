import { describe, expect, it } from 'vitest';
import { Input } from '../../src/core/input';

// 假的 window：只要 addEventListener，測試自己丟事件
function fakeTarget() {
  const h: Record<string, ((e: unknown) => void)[]> = {};
  return {
    addEventListener: (n: string, fn: (e: unknown) => void) => (h[n] ??= []).push(fn),
    fire: (n: string, e: Record<string, unknown>) => h[n]?.forEach((f) => f({ preventDefault() {}, repeat: false, ...e })),
  };
}

describe('輸入', () => {
  it('WASD 對到世界方向，斜走長度 1', () => {
    const t = fakeTarget();
    const input = new Input(t as unknown as Window);
    t.fire('keydown', { code: 'KeyW' });
    t.fire('keydown', { code: 'KeyD' });
    input.poll();
    expect(input.moveX).toBeCloseTo(Math.SQRT1_2);
    expect(input.moveZ).toBeCloseTo(-Math.SQRT1_2);
    t.fire('keyup', { code: 'KeyW' });
    t.fire('keyup', { code: 'KeyD' });
    input.poll();
    expect([input.moveX, input.moveZ]).toEqual([0, 0]);
  });
  it('空白鍵號令只觸發一次；失焦清掉按鍵', () => {
    const t = fakeTarget();
    const input = new Input(t as unknown as Window);
    t.fire('keydown', { code: 'Space' });
    expect(input.consumeCommand()).toBe(true);
    expect(input.consumeCommand()).toBe(false);
    t.fire('keydown', { code: 'ArrowLeft' });
    t.fire('blur', {});
    input.poll();
    expect(input.moveX).toBe(0);
  });
  it('停用時不動', () => {
    const t = fakeTarget();
    const input = new Input(t as unknown as Window);
    t.fire('keydown', { code: 'KeyA' });
    input.enabled = false;
    input.poll();
    expect(input.moveX).toBe(0);
  });
});
