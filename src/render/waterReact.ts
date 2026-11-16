import { WATER_FX } from '../data/vfx';
import { FEEL } from '../data/feel';
import { feel } from '../core/feel';
import type { Run } from '../game/run';
import { GLOW_HALO, type ElementFx } from './elementFx';

/**
 * 水打到人類、打倒人類的樣子（docs/30 第 ⑪ 節）：和 FireReact 同一套讀法（Run.feed、Run.deathLog，每幀有上限），只動畫面。
 * - 直接命中：一圈往外濺的小浪（王冠）＋水珠（會掉下來）＋地上一圈漣漪；暴擊更大、加閃光。
 * - 持續傷害的一跳：小水花＋一顆水珠。
 * - 打倒：沖起的水柱＋四散的水珠＋白沫＋大漣漪；精英、頭目再加閃光與一圈往外倒的浪。
 */
export class WaterReact {
  private seenHit: number;
  private seenDeath: number;
  private time = 0;
  private readonly killAt = new Float32Array(16).fill(-99);
  private killNext = 0;

  constructor(private readonly run: Run, private readonly fx: ElementFx) {
    this.seenHit = run.feed.head;
    this.seenDeath = run.deathHead;
  }

  /** 現在畫面上還在的打倒效果有幾個（手感回歸 f1） */
  get activeKills(): number {
    let n = 0;
    for (let i = 0; i < this.killAt.length; i++) if (this.time - this.killAt[i] < WATER_FX.kill.colLife) n++;
    return n;
  }

  /** 一圈往外濺的小浪（命中、爆開共用） */
  private crown(x: number, y: number, z: number, n: number, w: number, h: number, life: number, speed: number): void {
    const fx = this.fx;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + fx.rand() * 1.2;
      fx.part(0, x, y, z, Math.cos(a) * speed, 0, Math.sin(a) * speed, w, h, life, 0, 5, -0.2);
    }
  }

  update(dt: number): void {
    this.time += dt;
    const run = this.run;
    const fx = this.fx;
    const H = WATER_FX.hit;
    const R = WATER_FX.ripple;
    const feed = run.feed;
    if (feed.head - this.seenHit > H.perFrame) this.seenHit = feed.head - H.perFrame;
    while (this.seenHit < feed.head) {
      const i = this.seenHit % feed.cap;
      this.seenHit++;
      const x = feed.x[i] + (fx.rand() - 0.5) * 0.3;
      const z = feed.z[i] + (fx.rand() - 0.5) * 0.3;
      const gy = run.map.heightAt(x, z);
      if (feed.dot[i]) {
        if (feel.pops < 1 && fx.rand() > feel.pops) continue;
        fx.flare(x, gy + 0.3, z, 0.3, 0.45, 0.28, 0.2);
        fx.emit(x, gy + H.y, z, 1, 0.8);
        continue;
      }
      if (feel.pops <= 0) continue;
      const crit = feed.crit[i] === 1;
      const m = crit ? H.crit.mult : 1;
      const C = H.crown;
      this.crown(x, gy + 0.25, z, C.tongues, C.w * m, C.h * m, C.life * m, C.speed * m);
      fx.emit(x, gy + H.y, z, crit ? H.crit.drops : H.drops, 0.6, H.dropSpeed * m);
      fx.ripple(x, gy + 0.06, z, R.r * m, R.life);
      fx.flash(x, gy + H.y, z, 0.8 * m, 0.8, 0.15, GLOW_HALO);
      if (crit) fx.glints(x, gy + H.y, z, H.crit.glints, 0.6);
    }
    const K = WATER_FX.kill;
    if (run.deathHead - this.seenDeath > K.perFrame) this.seenDeath = run.deathHead - K.perFrame;
    while (this.seenDeath < run.deathHead) {
      const di = (this.seenDeath % FEEL.deathLog) * 4;
      this.seenDeath++;
      if (feel.pops <= 0) continue;
      const x = run.deathLog[di];
      const z = run.deathLog[di + 1];
      const v = run.deathLog[di + 2];
      const sc = Math.max(0.8, run.deathLog[di + 3]);
      const C = v === 2 ? K.boss : v === 1 ? K.elite : K.normal;
      this.killAt[this.killNext++ % this.killAt.length] = this.time;
      const gy = run.map.heightAt(x, z);
      const s = C.col * sc;
      // 沖起的水柱（往上長再垮下來）、水珠四散、白沫、大漣漪
      fx.flare(x, gy, z, K.colW * s, K.colH * s, K.colLife * (v === 2 ? 1.6 : 1), 0.25, true);
      fx.emit(x, gy + 0.9 * s, z, C.drops, 1.4, 2.2 * s);
      fx.smoke(x, gy + 0.5 * s, z, C.foam, 0.5 * Math.sqrt(s), 0.5);
      fx.ripple(x, gy + 0.06, z, C.ripple, R.life * 1.4);
      if (v > 0) fx.ripple(x, gy + 0.06, z, C.ripple * 0.6, R.life);
      if (C.glints > 0) fx.glints(x, gy + 0.7, z, C.glints, 0.8 * s);
      for (let j = 0; j < C.ring; j++) {
        const a = (j / C.ring) * Math.PI * 2 + fx.rand();
        fx.part(0, x + Math.cos(a) * 0.4 * s, gy, z + Math.sin(a) * 0.4 * s, Math.cos(a) * 2.8 * s, 0, Math.sin(a) * 2.8 * s, K.ringW * s, K.ringH * s, 0.55, 0, 3.5, -0.3);
      }
    }
  }
}
