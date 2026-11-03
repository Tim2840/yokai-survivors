import { describe, expect, it } from 'vitest';
import { storage } from './setup';

// 確認測試環境的假 localStorage 可用，之後的存檔測試（docs/07、docs/06 第 8 節）建在這上面
describe('測試環境：假 localStorage', () => {
  it('寫入、讀取、清空', () => {
    localStorage.setItem('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
    storage.clear();
    expect(localStorage.getItem('k')).toBeNull();
  });
  it('failWrites 會讓寫入丟錯（模擬隱私模式／容量不足）', () => {
    storage.failWrites = true;
    expect(() => localStorage.setItem('k', 'v')).toThrow();
  });
});
