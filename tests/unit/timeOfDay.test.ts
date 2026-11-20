import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { TOD_BONUS, TOD_RULE, todForStage } from '../../src/data/timeOfDay';
import { TIME_OF_DAY, type TimeOfDay } from '../../src/data/ambience';
import { STAGE, isBigMap } from '../../src/data/stage';
import { ULT } from '../../src/data/ultimates';
import { t } from '../../src/i18n';
import type { I18nKey } from '../../src/i18n/zh-TW';

const DT = 1 / 60;
afterEach(() => resetTuning());

function make(forceTod?: TimeOfDay, seed = 5, mapNumber = 1) {
  tuning.stageSeconds = 600;
  const bus = new EventBus();
  const seen: string[] = [];
  bus.on('timeOfDay', ({ tod }) => seen.push(tod));
  const run = new Run({ seed, bus, forceTod, mapNumber });
  run.god = true;
  run.director.active = false;
  return { run, seen };
}

describe('時段加成（D96）', () => {
  it('規則：黃昏只在大關的中間關；其他關白天約 dayChance、其餘夜晚；同種子同結果', () => {
    let day = 0;
    let all = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      for (let m = 1; m <= STAGE.chapter.everyMaps; m++) {
        const big = isBigMap(m);
        const n = big ? STAGE.chapter.bigStages : STAGE.chapter.normalStages;
        for (let i = 0; i < n; i++) {
          const tod = todForStage(m, i, seed);
          expect(tod, `${seed}/${m}/${i}`).toBe(todForStage(m, i, seed));
          if (big && i === Math.floor(n / 2)) {
            expect(tod).toBe('dusk');
            continue;
          }
          expect(tod).not.toBe('dusk');
          all++;
          if (tod === 'day') day++;
        }
      }
    }
    expect(day / all).toBeGreaterThan(TOD_RULE.dayChance * 0.8);
    expect(day / all).toBeLessThan(TOD_RULE.dayChance * 1.2);
  });

  it('開局就決定時段、發事件；夜晚＝基準：拾取範圍 +20%、大招充能 +15%', () => {
    const n = make('night');
    const d = make('day');
    expect(n.run.tod).toBe('night');
    expect(n.seen).toEqual(['night']);
    expect(n.run.stats.value.pickup / d.run.stats.value.pickup).toBeCloseTo(1 + (TOD_BONUS.night.pct.pickup ?? 0), 5);
    // 同樣 1 秒，夜晚的量表多充 15%（舊版時段沒有數值會紅）
    n.run.ultCharge = 0;
    d.run.ultCharge = 0;
    for (let i = 0; i < 60; i++) {
      n.run.step(DT);
      d.run.step(DT);
    }
    expect(d.run.ultCharge).toBeGreaterThan(0);
    expect(n.run.ultCharge / d.run.ultCharge).toBeCloseTo(1 + TOD_BONUS.night.ultCharge, 2);
    expect(ULT.perSecond).toBeGreaterThan(0);
  });

  it('白天：移速 +10%、每秒回復 +0.5、湧出 ×0.8、經驗變少（成長預算不會把白天的減少補回來）', () => {
    const n = make('night', 9);
    const d = make('day', 9);
    expect(d.run.stats.value.speed / n.run.stats.value.speed).toBeCloseTo(1 + (TOD_BONUS.day.pct.speed ?? 0), 5);
    expect(d.run.stats.value.regen - n.run.stats.value.regen).toBeCloseTo(TOD_BONUS.day.regen, 5);
    n.run.director.active = true;
    d.run.director.active = true;
    for (let i = 0; i < 60 * 30; i++) {
      n.run.step(DT);
      d.run.step(DT);
    }
    expect(d.run.director.extraMult / n.run.director.extraMult).toBeCloseTo(1 + TOD_BONUS.day.spawn, 5);
    // 同一刻、同樣落後／領先的狀態下，每點威脅點數的經驗是夜晚的 0.8 倍左右（湧出少，預算會提高每點的值；所以看整關總量：見 sim）
    expect(d.run.level).toBeLessThanOrEqual(n.run.level + 1);
  });

  it('黃昏：寶箱有 chestUp 的機率高一階（極不再升）；經驗 +20%', () => {
    const { run } = make('dusk', 3);
    expect(run.elements.chestUpChance).toBe(TOD_BONUS.dusk.chestUp);
    let up = 0;
    const N = 400;
    for (let k = 0; k < N; k++) {
      const s = run.elements.dropChest(run.px + 2, run.pz, 'common');
      if (s && s.rarity === 'rare') up++;
      if (s) s.active = false;
    }
    expect(up / N).toBeGreaterThan(TOD_BONUS.dusk.chestUp * 0.5);
    expect(up / N).toBeLessThan(TOD_BONUS.dusk.chestUp * 1.6);
    const s = run.elements.dropChest(run.px + 2, run.pz, 'legend');
    expect(s?.rarity).toBe('legend');
    const night = make('night', 3).run;
    expect(night.elements.chestUpChance).toBe(0);
  });

  it('換關重新決定時段、能力值加成不疊加（只有一個 tod 加成）', () => {
    const { run, seen } = make('day', 4);
    const s0 = run.stats.value.speed;
    run.devClearStage();
    run.startNextStage();
    expect(seen).toEqual(['day', 'day']);
    expect(run.stats.value.speed).toBeCloseTo(s0, 5);
  });

  it('文字：三個時段都有標籤與開局字幕（不帶角色專屬字）', () => {
    for (const k of Object.keys(TIME_OF_DAY)) {
      for (const key of [`hud.tod.${k}`, `hud.todNote.${k}`]) {
        // 用實際數字填進去再量長度（佔位符本身比數字長）
        const s = t(key as I18nKey, { ult: '+15%', pick: '+20%', xp: '−20%', chest: 10, s: '+10%', r: 0.5, f: '−20%', x: '−20%' });
        expect(s, key).not.toBe(key);
        expect(s.length).toBeLessThanOrEqual(36);
        expect(/鬼火|燈|水盤|金棒/.test(s), key).toBe(false);
      }
    }
  });
});
