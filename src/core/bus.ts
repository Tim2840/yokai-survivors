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
  /** 玩家升級（pending = 還有幾次待選）；UI 收到後暫停並開選卡面板 */
  levelUp: { level: number; pending: number };
  /** 選了一張卡 */
  cardChosen: { cardId: string; rarity: string };
  /** 關卡開始（stage 從 1 起） */
  stageStart: { stage: number };
  /** 過關（走進傳送門）；last = 這是最後一關 */
  stageClear: { stage: number; last: boolean };
  /** 頭目倒下（傳送門已開） */
  bossDown: { stage: number };
  /** 玩家受傷（低頻事件；每擊殺等高頻事件不走匯流排，見 docs/06） */
  playerHurt: { damage: number; hp: number };
  /** 地圖要素落下／被用掉／消失（低頻） */
  /** 大招融合成功／發動（低頻） */
  fusion: { id: string };
  ultimate: { ids: string[] };
  /** 觸發了一個卡片聯動（低頻） */
  synergy: { id: string };
  elementSpawn: { kind: string; rarity: string };
  elementUsed: { kind: string; rarity: string };
  runEnd: { result: 'death' | 'victory' | 'abandon'; stage: number; kills: number; level: number; time: number; merit: number };
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
