/**
 * 玩家輸入（從燈落之境的 input.ts 精簡，docs/10 第 2 節）：只留「移動」與一顆「號令」。
 * 拿掉了鏡頭拖曳、縮放、跳躍、聚光（本作鏡頭固定、不跳）。
 * - 電腦：WASD／方向鍵移動；空白鍵或 Q 號令。
 * - 手機：左下虛擬搖桿；右下號令鈕（M1 的 HUD 建立，傳進 attachTouch）。
 * 每個模擬步開頭呼叫 poll()，讀 moveX／moveZ（世界座標：x 往右、z 往畫面下方）；consumeCommand() 取出號令。
 * 熱路徑不配置記憶體。
 */
export class Input {
  /** 移動方向（世界 X／Z），長度 0..1 */
  moveX = 0;
  moveZ = 0;
  enabled = true;
  /** 玩家第一次操作時觸發（隱藏提示用） */
  onFirstAction?: () => void;

  private keys = new Set<string>();
  private stickX = 0;
  private stickY = 0;
  private stickActive = false;
  private commandQueued = false;
  private acted = false;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if ((e.code === 'Space' || e.code === 'KeyQ') && !e.repeat) this.commandQueued = true;
      this.keys.add(e.code);
      this.markActed();
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
  }

  /** 接上手機的搖桿與號令鈕（M1 的 HUD） */
  attachTouch(ui: { stickBase: HTMLElement; stickKnob: HTMLElement; commandButton: HTMLElement }) {
    const { stickBase, stickKnob, commandButton } = ui;
    let stickId = -1;
    const updateStick = (e: PointerEvent) => {
      const rect = stickBase.getBoundingClientRect();
      const max = rect.width * 0.38;
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      stickKnob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      this.stickX = (dx * k) / max;
      this.stickY = (dy * k) / max;
    };
    stickBase.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      stickId = e.pointerId;
      try {
        stickBase.setPointerCapture(e.pointerId);
      } catch {
        /* 合成事件沒有可抓的指標：不影響 */
      }
      this.stickActive = true;
      updateStick(e);
      this.markActed();
    });
    stickBase.addEventListener('pointermove', (e) => {
      if (e.pointerId === stickId) updateStick(e);
    });
    const stickUp = (e: PointerEvent) => {
      if (e.pointerId !== stickId) return;
      stickId = -1;
      this.stickActive = false;
      this.stickX = 0;
      this.stickY = 0;
      stickKnob.style.transform = '';
    };
    stickBase.addEventListener('pointerup', stickUp);
    stickBase.addEventListener('pointercancel', stickUp);
    commandButton.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.commandQueued = true;
      this.markActed();
    });
  }

  /** 每個模擬步開頭呼叫 */
  poll() {
    if (!this.enabled) {
      this.moveX = 0;
      this.moveZ = 0;
      return;
    }
    if (this.stickActive) {
      this.moveX = this.stickX;
      this.moveZ = this.stickY;
      return;
    }
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const z = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    const len = Math.hypot(x, z);
    this.moveX = len > 1 ? x / len : x;
    this.moveZ = len > 1 ? z / len : z;
  }

  consumeCommand() {
    const v = this.commandQueued;
    this.commandQueued = false;
    return v;
  }

  reset() {
    this.keys.clear();
    this.commandQueued = false;
    this.stickActive = false;
    this.stickX = 0;
    this.stickY = 0;
  }

  private markActed() {
    if (this.acted) return;
    this.acted = true;
    this.onFirstAction?.();
  }
}
