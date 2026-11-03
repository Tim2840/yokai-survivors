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
  it('空白鍵＝跳躍（只觸發一次）、F＝號令；失焦清掉按鍵', () => {
    const t = fakeTarget();
    const input = new Input(t as unknown as Window);
    t.fire('keydown', { code: 'Space' });
    expect(input.consumeJump()).toBe(true);
    expect(input.consumeJump()).toBe(false);
    expect(input.consumeCommand()).toBe(false);
    t.fire('keydown', { code: 'KeyF' });
    expect(input.consumeCommand()).toBe(true);
    t.fire('keydown', { code: 'Space', repeat: true });
    expect(input.consumeJump()).toBe(false); // 長按不連跳
    t.fire('keydown', { code: 'ArrowLeft' });
    t.fire('blur', {});
    input.poll();
    expect(input.moveX).toBe(0);
  });
  it('Q／E 鍵轉視角：Q = +1、E = −1、同時按 = 0；停用時 0', () => {
    const t = fakeTarget();
    const input = new Input(t as unknown as Window);
    expect(input.rotateKey).toBe(0);
    t.fire('keydown', { code: 'KeyQ' });
    expect(input.rotateKey).toBe(1);
    t.fire('keydown', { code: 'KeyE' });
    expect(input.rotateKey).toBe(0);
    t.fire('keyup', { code: 'KeyQ' });
    expect(input.rotateKey).toBe(-1);
    input.enabled = false;
    expect(input.rotateKey).toBe(0);
  });
  it('拖曳轉視角：向右拖 → yaw 減少（視角往右轉）、向下拖 → pitch 增加；consume 之後歸零', () => {
    const handlers: Record<string, ((e: Record<string, unknown>) => void)[]> = {};
    const el = { addEventListener: (n: string, f: (e: Record<string, unknown>) => void) => (handlers[n] ??= []).push(f), setPointerCapture() {} } as unknown as HTMLElement;
    const t = fakeTarget();
    const input = new Input(t as unknown as Window);
    input.attachLook(el);
    const fire = (n: string, e: Record<string, unknown>) => handlers[n]?.forEach((f) => f({ preventDefault() {}, pointerId: 1, pointerType: 'mouse', button: 0, ...e }));
    fire('pointerdown', { clientX: 100, clientY: 100 });
    fire('pointermove', { clientX: 140, clientY: 120 });
    const out = [0, 0];
    input.consumeLook(out);
    expect(out[0]).toBeLessThan(0);
    expect(out[1]).toBeGreaterThan(0);
    input.consumeLook(out);
    expect(out).toEqual([0, 0]);
    fire('pointerup', {});
    fire('pointermove', { clientX: 300, clientY: 300 });
    input.consumeLook(out);
    expect(out).toEqual([0, 0]); // 放開後不再轉
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
