import { FIRE_FX } from '../data/vfx';
import { FEEL } from '../data/feel';
import { feel } from '../core/feel';
import type { Run } from '../game/run';
import { GLOW_GROUND, GLOW_HALO, type FireFx } from './fireFx';

/**
 * 火打到人類、燒倒人類的樣子（D91，docs/30）：讀 Run.feed（命中）與 Run.deathLog（打倒），每幀最多處理幾筆，
 * 落後太多就跳到最新的（只是少畫幾個，不影響模擬）。只動畫面。
 * - 直接命中：一朵往外炸的短火＋往外噴的火星＋一圈光；暴擊更大、加金色閃光。
 * - 持續傷害的一跳（燒傷、燃燒地）：身上竄一下的小火苗＋一顆火星。
 * - 打倒：竄起的一團火＋飛出去的小火團＋火星＋煙＋地上的火光；精英、頭目再加金色閃光與一圈倒下的火舌。
 */
export class FireReact {
  private seenHit: number;
  private seenDeath: number;
  private time = 0;
  /** 最近幾次打倒效果的時間（開發介面：手感回歸 f1 用「打倒有沒有效果」） */
  private readonly killAt = new Float32Array(16).fill(-99);
  private killNext = 0;

  constructor(private readonly run: Run, private readonly fire: FireFx) {
    this.seenHit = run.feed.head;
    this.seenDeath = run.deathHead;
  }

  /** 現在畫面上還在的打倒效果有幾個（竄起的火還沒熄的） */
  get activeKills(): number {
    let n = 0;
    for (let i = 0; i < this.killAt.length; i++) if (this.time - this.killAt[i] < FIRE_FX.kill.puffLife) n++;
    return n;
  }

  update(dt: number): void {
    this.time += dt;
    const run = this.run;
    const fire = this.fire;
    const H = FIRE_FX.hit;
    const feed = run.feed;
    // 命中
    if (feed.head - this.seenHit > H.perFrame) this.seenHit = feed.head - H.perFrame;
    while (this.seenHit < feed.head) {
      const i = this.seenHit % feed.cap;
      this.seenHit++;
      const x = feed.x[i] + (fire.rand() - 0.5) * 0.3;
      const z = feed.z[i] + (fire.rand() - 0.5) * 0.3;
      const y = run.map.heightAt(x, z) + H.y;
      if (feed.dot[i]) {
        // 減少特效時持續傷害的一跳只畫一半
        if (feel.pops < 1 && fire.rand() > feel.pops) continue;
        const D = H.dot;
        fire.flare(x, y - 0.35, z, D.w, D.h, D.life, 0.3);
        fire.emit(x, y, z, D.sparks, 0.6);
        continue;
      }
      if (feel.pops <= 0) continue;
      const crit = feed.crit[i] === 1;
      const m = crit ? H.crit.mult : 1;
      fire.flare(x, y - 0.4, z, H.flare.w * m, H.flare.h * m, H.flare.life * m, H.flare.grow);
      fire.emit(x, y, z, crit ? H.crit.sparks : H.sparks, 0.5, H.sparkSpeed * m);
      fire.flash(x, y, z, H.halo.r * m, 1, H.halo.life * m, GLOW_HALO);
      if (crit) fire.glints(x, y, z, H.crit.glints, 0.6);
    }
    // 打倒
    const K = FIRE_FX.kill;
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
      const s = C.puff * sc;
      // 一團竄起的火（先長大再縮成紅色的小火）
      fire.flare(x, gy, z, 0.9 * s, 1.5 * s, K.puffLife * (v === 2 ? 1.6 : 1), 0.35);
      fire.blobs(x, gy + 0.6 * s, z, C.blobs, K.blobSpeed * (0.7 + 0.3 * s), 0.38 * Math.sqrt(s), K.blobLife);
      fire.emit(x, gy + 0.8 * s, z, C.sparks, 1.2, 1.5 * s);
      fire.smoke(x, gy + 1.0 * s, z, C.smoke, 0.55 * Math.sqrt(s));
      fire.flash(x, gy + 0.06, z, C.glow, 1.4, 0.5, GLOW_GROUND);
      fire.flash(x, gy + 0.9 * s, z, C.glow * 0.7, 1.2, 0.3, GLOW_HALO);
      if (C.glints > 0) fire.glints(x, gy + 0.6, z, C.glints, 0.8 * s);
      // 精英、頭目：一圈往外倒的火舌（短暫的火焰，排成一圈）
      for (let j = 0; j < C.ring; j++) {
        const a = (j / C.ring) * Math.PI * 2 + fire.rand();
        const r = 0.9 * s;
        fire.part(0, x + Math.cos(a) * r * 0.5, gy, z + Math.sin(a) * r * 0.5, Math.cos(a) * 2.6 * s, 0, Math.sin(a) * 2.6 * s, 0.6 * s, 1.0 * s, 0.5, 0, 3.5, -0.3);
      }
    }
  }
}
