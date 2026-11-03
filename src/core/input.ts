import { CAMERA } from '../data/camera';

/**
 * 玩家輸入（D23、D24）：移動、轉視角、跳躍、號令（M2）。熱路徑不配置記憶體。
 * - 電腦：WASD／方向鍵移動；按住滑鼠左鍵或右鍵拖曳、或 Q／E 轉視角；空白鍵跳躍；F 號令。
 * - 手機：左下虛擬搖桿；在畫面右側（搖桿以外）拖曳轉視角；右下跳躍鈕。
 * moveX／moveZ 是「螢幕座標」（x 往右、z 往後，W = −1）；換成世界座標在 cameraRig.worldMove。
 */
export class Input {
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
  private jumpQueued = false;
  private acted = false;
  /** 累積的轉視角量（像素，已乘靈敏度之前）：每個畫面幀取走 */
  private lookYaw = 0;
  private lookPitch = 0;
  private lookPointer = -1;
  private lastX = 0;
  private lastY = 0;
  private lookSens: number = CAMERA.mouseSens;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'Space' && !e.repeat) this.jumpQueued = true;
      if (e.code === 'KeyF' && !e.repeat) this.commandQueued = true;
      this.keys.add(e.code);
      this.markActed();
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => {
      this.keys.clear();
      this.lookPointer = -1;
    });
  }

  /** 在畫布上拖曳轉視角（滑鼠左／右鍵；觸控從螢幕右側開始） */
  attachLook(el: HTMLElement): void {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.lookPointer !== -1) return;
      if (e.pointerType === 'mouse') {
        if (e.button !== 0 && e.button !== 2) return;
        this.lookSens = CAMERA.mouseSens;
      } else {
        if (e.clientX < innerWidth * CAMERA.touchLookFromX) return;
        this.lookSens = CAMERA.touchSens;
      }
      this.lookPointer = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* 合成事件沒有可抓的指標：不影響拖曳 */
      }
      this.markActed();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookPointer || !this.enabled) return;
      this.lookYaw -= (e.clientX - this.lastX) * this.lookSens;
      this.lookPitch += (e.clientY - this.lastY) * this.lookSens;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.lookPointer) this.lookPointer = -1;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  /** 接上手機的搖桿、跳躍鈕（與號令鈕，M2 的 HUD） */
  attachTouch(ui: { stickBase: HTMLElement; stickKnob: HTMLElement; jumpButton: HTMLElement; commandButton?: HTMLElement }) {
    const { stickBase, stickKnob, jumpButton, commandButton } = ui;
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
    jumpButton.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.jumpQueued = true;
      this.markActed();
    });
    commandButton?.addEventListener('pointerdown', (e) => {
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

  /** Q／E 鍵轉視角：Q = 往左轉（yaw 增加）、E = 往右轉，回傳 −1／0／+1 */
  get rotateKey(): number {
    if (!this.enabled) return 0;
    return (this.keys.has('KeyQ') ? 1 : 0) - (this.keys.has('KeyE') ? 1 : 0);
  }

  /** 取走累積的拖曳轉視角量（弧度）。寫進 out[0]（yaw）、out[1]（pitch） */
  consumeLook(out: Float32Array | number[]): void {
    out[0] = this.lookYaw;
    out[1] = this.lookPitch;
    this.lookYaw = 0;
    this.lookPitch = 0;
  }

  consumeJump(): boolean {
    const v = this.jumpQueued;
    this.jumpQueued = false;
    return v;
  }

  consumeCommand(): boolean {
    const v = this.commandQueued;
    this.commandQueued = false;
    return v;
  }

  reset() {
    this.keys.clear();
    this.commandQueued = false;
    this.jumpQueued = false;
    this.stickActive = false;
    this.stickX = 0;
    this.stickY = 0;
    this.lookPointer = -1;
    this.lookYaw = 0;
    this.lookPitch = 0;
  }

  private markActed() {
    if (this.acted) return;
    this.acted = true;
    this.onFirstAction?.();
  }
}
