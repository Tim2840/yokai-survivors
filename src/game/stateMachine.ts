import { bus as defaultBus, type EventBus } from '../core/bus';
import { TRANSITIONS, type GameState } from './states';

export interface StateHandler {
  enter?(from: GameState): void;
  update?(dt: number): void;
  exit?(to: GameState): void;
}

/**
 * 嚴格狀態機（docs/06 第 2 節）：只有這裡能改狀態；其他系統 emit 'request:state'。
 * 非法轉換一律拒絕並發 stateRejected（不丟錯，避免玩家流程當掉；開發時看事件與 console）。
 */
export class GameStateMachine {
  private current: GameState = 'BOOT';
  private handlers: Partial<Record<GameState, StateHandler>> = {};
  private readonly unsub: () => void;

  constructor(private readonly bus: EventBus = defaultBus) {
    this.unsub = bus.on('request:state', ({ to }) => {
      this.go(to);
    });
  }

  get state(): GameState {
    return this.current;
  }

  register(state: GameState, handler: StateHandler): void {
    this.handlers[state] = handler;
  }

  canGo(to: GameState): boolean {
    return TRANSITIONS[this.current].includes(to);
  }

  /** 回傳是否成功 */
  go(to: GameState): boolean {
    const from = this.current;
    if (!this.canGo(to)) {
      this.bus.emit('stateRejected', { from, to });
      return false;
    }
    this.handlers[from]?.exit?.(to);
    this.current = to;
    this.handlers[to]?.enter?.(from);
    this.bus.emit('stateChanged', { from, to });
    return true;
  }

  update(dt: number): void {
    this.handlers[this.current]?.update?.(dt);
  }

  dispose(): void {
    this.unsub();
  }
}
