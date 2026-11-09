import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { FEEL, hurtStrength } from '../../src/data/feel';
import { HitStop, Shake, feel, initFeel } from '../../src/core/feel';
import { kindIndex } from '../../src/systems/enemies';

/** 手感（D69）：震動、頓幀、受傷暈邊、擊殺紀錄；減少特效開關 */
beforeEach(() => {
  initFeel('', false);
  resetTuning();
});

describe('螢幕震動', () => {
  it('疊加到 1 封頂；位移 ∝ trauma²；隨時間衰減到 0；停了之後位移為 0', () => {
    const s = new Shake();
    s.add(0.6);
    s.add(0.9);
    expect(s.trauma).toBe(FEEL.shake.max);
    let maxOff = 0;
    for (let i = 0; i < 12; i++) {
      s.update(1 / 60);
      maxOff = Math.max(maxOff, Math.abs(s.ox), Math.abs(s.oy));
    }
    expect(maxOff, '大震要看得出來').toBeGreaterThan(FEEL.shake.amplitude * 0.15);
    expect(maxOff, '位移不超過最大幅度').toBeLessThanOrEqual(FEEL.shake.amplitude + 1e-6);
    for (let i = 0; i < 60 * 3; i++) s.update(1 / 60);
    expect(s.trauma).toBe(0);
    expect(s.ox).toBeCloseTo(0, 9);
    expect(s.oy).toBeCloseTo(0, 9);
  });
  it('小震幾乎看不到（二次方）：trauma 0.1 的位移小於 trauma 1 的 2%', () => {
    const small = new Shake();
    const big = new Shake();
    small.add(0.1);
    big.add(1);
    let a = 0;
    let b = 0;
    for (let i = 0; i < 30; i++) {
      small.trauma = 0.1;
      big.trauma = 1;
      small.update(1 / 60);
      big.update(1 / 60);
      a = Math.max(a, Math.abs(small.ox));
      b = Math.max(b, Math.abs(big.ox));
    }
    expect(a).toBeLessThan(b * 0.05);
  });
});

describe('頓幀', () => {
  it('取最長、不疊加；consume 在凍住時回傳 true 並扣時間，時間到就恢復', () => {
    const h = new HitStop();
    h.add(0.05);
    h.add(0.14);
    h.add(0.07);
    expect(h.left).toBeCloseTo(0.14);
    let frozen = 0;
    while (h.consume(1 / 60)) frozen++;
    expect(frozen).toBeGreaterThanOrEqual(8);
    expect(frozen).toBeLessThanOrEqual(9);
    expect(h.consume(1 / 60)).toBe(false);
  });
});

describe('受傷暈邊', () => {
  it('傷害越大越強，夾在上限；0 傷害也有基礎強度', () => {
    expect(hurtStrength(0, 100)).toBeCloseTo(FEEL.vignette.base);
    expect(hurtStrength(30, 100)).toBeGreaterThan(hurtStrength(5, 100));
    expect(hurtStrength(1000, 100)).toBe(FEEL.vignette.max);
  });
});

describe('減少特效', () => {
  it('?fx=off 全關：震動與頓幀不會累積；?fx=low 頓幀關、其他減半；prefers-reduced-motion 關震動與頓幀（舊版沒有開關會紅）', () => {
    initFeel('?fx=off', false);
    const s = new Shake();
    s.add(1);
    expect(s.trauma).toBe(0);
    const h = new HitStop();
    h.add(0.2);
    expect(h.left).toBe(0);
    expect(feel.vignette).toBe(0);
    initFeel('?fx=low', false);
    expect(feel.hitStop).toBe(0);
    expect(feel.shake).toBe(0.5);
    initFeel('', true);
    expect(feel.shake).toBe(0);
    expect(feel.hitStop).toBe(0);
    expect(feel.vignette).toBe(0.5);
    initFeel('', false);
    expect(feel.shake).toBe(1);
  });
});

describe('擊殺紀錄（給爆圈用）', () => {
  it('每次擊殺寫一筆（位置、種類）；精英另外計數；環形緩衝不爆', () => {
    tuning.stageSeconds = 600;
    const run = new Run({ seed: 5, bus: new EventBus() });
    run.god = true;
    run.director.active = false;
    const a = run.enemies.spawn(kindIndex('villager'), run.px + 3, run.pz, 1, 0, 0);
    const e = run.enemies.spawn(kindIndex('villager'), run.px + 4, run.pz + 1, 1, 0, 0, 1);
    run.enemies.hp[a] = 1;
    run.enemies.hp[e] = 1;
    for (let i = 0; i < 120 && run.deathHead < 2; i++) run.step(1 / 60);
    expect(run.deathHead).toBeGreaterThanOrEqual(2);
    expect(run.eliteKills).toBe(1);
    const kinds = [0, 1].map((i) => run.deathLog[(i % FEEL.deathLog) * 4 + 2]).sort();
    expect(kinds).toEqual([0, 1]);
    // 寫超過緩衝長度也不出錯
    for (let i = 0; i < FEEL.deathLog * 2; i++) {
      const v = run.enemies.spawn(kindIndex('villager'), run.px + 5, run.pz, 1, 0, 0);
      if (v >= 0) run.weaponHit(v, 1e9, 0, 0, 0, false, true);
    }
    expect(run.deathHead).toBeGreaterThan(FEEL.deathLog);
  });
});
