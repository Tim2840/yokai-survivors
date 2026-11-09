import { FEEL } from '../data/feel';

/**
 * 手感的總開關（減少特效）：shake／hitStop／vignette／pops 各一個倍率，0 = 關。
 * 來源：網址 `?fx=off`（全關）、`?fx=low`（減半）、系統的 prefers-reduced-motion（全關震動與頓幀，暈邊與爆圈減半）；
 * 之後設定畫面會寫同一組數字（並存進存檔）。
 */
export const feel = { shake: 1, hitStop: 1, vignette: 1, pops: 1 };

export function initFeel(search: string, reducedMotion: boolean): void {
  feel.shake = feel.hitStop = feel.vignette = feel.pops = 1;
  if (reducedMotion) {
    feel.shake = 0;
    feel.hitStop = 0;
    feel.vignette = 0.5;
    feel.pops = 0.5;
  }
  const fx = new URLSearchParams(search).get('fx');
  if (fx === 'off') feel.shake = feel.hitStop = feel.vignette = feel.pops = 0;
  else if (fx === 'low') {
    feel.shake = Math.min(feel.shake, 0.5);
    feel.hitStop = 0;
    feel.vignette = Math.min(feel.vignette, 0.5);
    feel.pops = Math.min(feel.pops, 0.5);
  }
}

/** 螢幕震動（trauma 模型）：add 疊加到 1 封頂；update 衰減；位移 ∝ trauma²，用兩個不同頻率的正弦當隨機抖動（不用亂數，可重現） */
export class Shake {
  trauma = 0;
  ox = 0;
  oy = 0;
  private t = 0;
  add(amount: number): void {
    this.trauma = Math.min(FEEL.shake.max, this.trauma + amount * feel.shake);
  }
  update(dt: number): void {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - FEEL.shake.decay * dt);
    const a = this.trauma * this.trauma * FEEL.shake.amplitude;
    const w = this.t * FEEL.shake.frequency * Math.PI * 2;
    this.ox = a * Math.sin(w * 1.0 + 1.3) * Math.cos(w * 0.37);
    this.oy = a * Math.sin(w * 1.27 + 0.4) * Math.cos(w * 0.53);
  }
  reset(): void {
    this.trauma = this.ox = this.oy = 0;
  }
}

/** 頓幀：add(秒) 取最長；consume(dt) 在被凍住時回傳 true 並扣時間 */
export class HitStop {
  left = 0;
  add(seconds: number): void {
    this.left = Math.max(this.left, seconds * feel.hitStop);
  }
  /** 這一步要不要停（要停就扣掉 dt） */
  consume(dt: number): boolean {
    if (this.left <= 0) return false;
    this.left = Math.max(0, this.left - dt);
    return true;
  }
  reset(): void {
    this.left = 0;
  }
}
