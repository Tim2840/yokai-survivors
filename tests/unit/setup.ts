// 單元測試的環境：用 node 跑，不拉進瀏覽器。src/game 的存檔、家園、任務只用到 localStorage、
// window.setTimeout／addEventListener、document.addEventListener，用最簡單的假物件補上就夠。
// 每個測試前（beforeEach）清空假 localStorage，彼此不影響。
import { beforeEach } from 'vitest';

class FakeStorage {
  private map = new Map<string, string>();
  /** 測試用：true 時 setItem 會丟錯（模擬隱私模式或容量不足） */
  failWrites = false;
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
  get length() {
    return this.map.size;
  }
}

export const storage = new FakeStorage();

const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = storage;
// window.setTimeout 在呼叫時才去取全域的 setTimeout，所以 vi.useFakeTimers() 之後也抓得到
g.window = {
  addEventListener() {},
  setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
};
g.document = { addEventListener() {}, visibilityState: 'visible' };

beforeEach(() => {
  storage.failWrites = false;
  storage.clear();
});
