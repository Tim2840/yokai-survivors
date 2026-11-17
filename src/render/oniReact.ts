import { ONI_FX } from '../data/vfx';
import { FEEL } from '../data/feel';
import { feel } from '../core/feel';
import type { Run } from '../game/run';
import { GLOW_GROUND, GLOW_HALO, type ElementFx } from './elementFx';

/**
 * 鬼氣與雷打到人類、打倒人類的樣子（赤鬼，docs/30 第 ⑫ 節）：和 FireReact、WaterReact 同一套讀法（Run.feed、Run.deathLog，每幀有上限），只動畫面。
 * - 直接命中：一道短短的電光（細長的焰）＋往四面炸開的金色碎片＋一圈紫光；暴擊更大、加閃光。
 * - 持續傷害的一跳：小電光＋兩顆碎片。
 * - 打倒：地上一圈震波（擴散的細圈）＋竄起的鬼氣＋碎片＋一朵紫煙；精英、頭目加金色閃光、震波更大。
 */
export class OniReact {
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
    for (let i = 0; i < this.killAt.length; i++) if (this.time - this.killAt[i] < ONI_FX.burst.puffLife) n++;
    return n;
  }

  update(dt: number): void {
    this.time += dt;
    const run = this.run;
    const fx = this.fx;
    const Z = ONI_FX.zap;
    const feed = run.feed;
    if (feed.head - this.seenHit > Z.perFrame) this.seenHit = feed.head - Z.perFrame;
    while (this.seenHit < feed.head) {
      const i = this.seenHit % feed.cap;
      this.seenHit++;
      const x = feed.x[i] + (fx.rand() - 0.5) * 0.3;
      const z = feed.z[i] + (fx.rand() - 0.5) * 0.3;
      const y = run.map.heightAt(x, z) + Z.y;
      if (feed.dot[i]) {
        if (feel.pops < 1 && fx.rand() > feel.pops) continue;
        const D = Z.dot;
        fx.flare(x, y - 0.4, z, D.w, D.h, D.life, 0.2);
        fx.emit(x, y, z, D.sparks, 0.5, Z.sparkSpeed * 0.6);
        continue;
      }
      if (feel.pops <= 0) continue;
      const crit = feed.crit[i] === 1;
      const m = crit ? Z.crit.mult : 1;
      // 電光：一道細長的焰（偏一點角度看起來像劈下來）＋往外炸的金色碎片
      fx.flare(x, y - 0.6, z, Z.bolt.w * m, Z.bolt.h * m, Z.bolt.life * m, 0.1);
      fx.emit(x, y, z, crit ? Z.crit.sparks : Z.sparks, 0.4, Z.sparkSpeed * m);
      fx.flash(x, y, z, Z.halo.r * m, 1, Z.halo.life * m, GLOW_HALO);
      if (crit) fx.glints(x, y, z, Z.crit.glints, 0.6);
    }
    const B = ONI_FX.burst;
    if (run.deathHead - this.seenDeath > B.perFrame) this.seenDeath = run.deathHead - B.perFrame;
    while (this.seenDeath < run.deathHead) {
      const di = (this.seenDeath % FEEL.deathLog) * 4;
      this.seenDeath++;
      if (feel.pops <= 0) continue;
      const x = run.deathLog[di];
      const z = run.deathLog[di + 1];
      const v = run.deathLog[di + 2];
      const sc = Math.max(0.8, run.deathLog[di + 3]);
      const C = v === 2 ? B.boss : v === 1 ? B.elite : B.normal;
      this.killAt[this.killNext++ % this.killAt.length] = this.time;
      const gy = run.map.heightAt(x, z);
      const s = C.puff * sc;
      // 地上一圈震波（擴散的細圈），竄起一團鬼氣，碎片往外炸，冒一朵紫煙
      fx.ripple(x, gy + 0.06, z, C.ring * sc, B.ringLife, 1.2);
      fx.flare(x, gy, z, 0.7 * s, 1.6 * s, B.puffLife * (v === 2 ? 1.6 : 1), 0.3);
      fx.emit(x, gy + 0.7 * s, z, C.sparks, 0.6, ONI_FX.zap.sparkSpeed * (0.8 + 0.3 * s));
      fx.smoke(x, gy + 1.0 * s, z, C.smoke, 0.5 * Math.sqrt(s));
      fx.flash(x, gy + 0.06, z, C.glow, 1.3, 0.4, GLOW_GROUND);
      if (C.glints > 0) fx.glints(x, gy + 0.6, z, C.glints, 0.8 * s);
    }
  }
}
