import type { GameState } from '../game/states';

/**
 * 事件匯流排（docs/06 第 9 節）：系統之間不直接互叫，只 emit／on。
 * 事件清單是型別化的聯集；新增事件要同步補單元測試（誰會收到）。
 * 熱路徑：emit 不配置記憶體（監聽陣列用「寫入時複製」，emit 只走目前的陣列）。
 */
export interface GameEvents {
  /** 狀態已改變（只有狀態機會發） */
  stateChanged: { from: GameState; to: GameState };
  /** 請求改變狀態（任何系統都可以發；由狀態機決定准不准） */
  'request:state': { to: GameState };
  /** 狀態轉換被拒絕（非法轉換） */
  stateRejected: { from: GameState; to: GameState };
  /** 暫停覆蓋層開關（不改狀態） */
  paused: { paused: boolean; reason: 'user' | 'hidden' };
  /** 存檔寫入失敗（隱私模式、容量不足）；只在第一次失敗時發 */
  saveFailed: { error: string };
}

export type GameEventName = keyof GameEvents;
type Handler<K extends GameEventName> = (payload: GameEvents[K]) => void;

export class EventBus {
  private handlers: { [K in GameEventName]?: Handler<K>[] } = {};

  on<K extends GameEventName>(name: K, fn: Handler<K>): () => void {
    const list = (this.handlers[name] ?? []) as Handler<K>[];
    (this.handlers as Record<string, unknown>)[name] = [...list, fn];
    return () => this.off(name, fn);
  }

  off<K extends GameEventName>(name: K, fn: Handler<K>): void {
    const list = this.handlers[name] as Handler<K>[] | undefined;
    if (!list) return;
    (this.handlers as Record<string, unknown>)[name] = list.filter((h) => h !== fn);
  }

  emit<K extends GameEventName>(name: K, payload: GameEvents[K]): void {
    const list = this.handlers[name] as Handler<K>[] | undefined;
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i](payload);
  }

  /** 測試用：清空所有監聽 */
  clear(): void {
    this.handlers = {};
  }
}

/** 全遊戲共用的一條匯流排 */
export const bus = new EventBus();
