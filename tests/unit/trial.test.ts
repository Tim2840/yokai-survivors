import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { ELEMENT_KINDS, TRIAL, trialNeeds } from '../../src/data/elements';
import { RARITIES, type Rarity } from '../../src/data/rarity';
import { kindIndex } from '../../src/systems/enemies';
import { TECH_OFFER, isTechCard } from '../../src/data/techniques';
import { t } from '../../src/i18n';
import type { I18nKey } from '../../src/i18n/zh-TW';

const DT = 1 / 60;
afterEach(() => resetTuning());

function make(seed = 3) {
  tuning.stageSeconds = 600;
  const run = new Run({ seed, bus: new EventBus() });
  run.god = true;
  run.director.active = false;
  return run;
}
/** 在腳邊放一座指定稀有度的試煉碑、站上去按住到試煉開始 */
function startTrial(run: Run, rarity: Rarity = 'common') {
  const s = run.elements.devForce('trial', rarity, run.px, run.pz)!;
  expect(s).toBeTruthy();
  run.devTeleport(s.x, s.z);
  run.setMove(0, 0);
  for (let i = 0; i < 60 * (TRIAL.holdSeconds + 2) && !run.elements.trial.active; i++) {
    if (run.awaitingPick) run.chooseCard(0);
    run.requestInteract();
    run.step(DT);
  }
  expect(run.elements.trial.active, '按住之後試煉沒有開始').toBe(true);
  return s;
}
/** 跑完整場試煉（模擬時間走完），回傳結果卡 */
function finishTrial(run: Run) {
  for (let i = 0; i < 60 * (TRIAL.seconds + 3) && run.elements.trial.active; i++) {
    if (run.awaitingPick) run.chooseCard(0);
    run.step(DT);
  }
  expect(run.elements.trial.active).toBe(false);
  return run.elementResult;
}

describe('百鬼試煉碑（E1）', () => {
  it('圈內加成（D97，原結界石）：試煉中站在圈內 攻擊力、攻擊速度 +zoneBuff；走出圈外就沒有；試煉結束清掉', () => {
    for (const r of RARITIES) {
      const run = make(31);
      const p0 = run.stats.value.power;
      const a0 = run.stats.value.atkSpeed;
      const s = startTrial(run, r);
      run.step(DT);
      expect(run.stats.value.power, r).toBeCloseTo(p0 * (1 + TRIAL.zoneBuff[r]));
      expect(run.stats.value.atkSpeed, r).toBeCloseTo(a0 * (1 + TRIAL.zoneBuff[r]));
      expect(run.elements.inTrialZone).toBe(true);
      run.devTeleport(s.x + TRIAL.radius + 3, s.z);
      run.step(DT);
      expect(run.stats.value.power, `${r} 走出圈外`).toBeCloseTo(p0);
      expect(run.elements.inTrialZone).toBe(false);
      run.devTeleport(s.x, s.z);
      finishTrial(run);
      expect(run.stats.value.power, `${r} 試煉結束`).toBeCloseTo(p0);
    }
  });

  it('圈內升級必出技法卡（D97，原結界石 D93）；圈外不一定（20 次裡至少一次沒有）', () => {
    const count = (inside: boolean) => {
      let withTech = 0;
      for (let k = 0; k < 20; k++) {
        const run = make(100 + k);
        while (run.level < TECH_OFFER.minLevel) {
          run.addXp(run.xpNeeded);
          while (run.offer) run.chooseCard(0);
        }
        const s = startTrial(run);
        if (!inside) run.devTeleport(s.x + TRIAL.radius + 3, s.z);
        run.step(DT);
        while (run.offer) run.chooseCard(0);
        run.addXp(run.xpNeeded);
        if (run.offer?.some((o) => isTechCard(o.cardId))) withTech++;
      }
      return withTech;
    };
    expect(count(true)).toBe(20);
    expect(count(false)).toBeLessThan(20);
  });

  it('站在圈內時過關 → 加成不會留到下一關（拿掉 endStage 會紅）', () => {
    const run = make(32);
    const p0 = run.stats.value.power;
    startTrial(run, 'legend');
    run.step(DT);
    expect(run.stats.value.power).toBeGreaterThan(p0);
    run.devClearStage();
    expect(run.phase, '應該已經過關').not.toBe('combat');
    expect(run.stats.value.power).toBeCloseTo(p0);
  });

  it('近距離湧出（D97）：試煉中大部分人類生在碑周圍 near.min～max 公尺，不是 18～24 公尺外（舊版會紅）', () => {
    const run = make(33);
    const s = startTrial(run);
    run.director.active = true;
    const en = run.enemies;
    for (let i = 0; i < en.high; i++) if (en.alive[i]) en.kill(i);
    // 每一步記下「剛生出來」那一隻的位置（人類會走過來，不能看最後的位置——第一版這樣量，拿掉近距離湧出也會過）
    const seen = new Uint8Array(4096);
    let near = 0;
    let all = 0;
    for (let k = 0; k < 60 * 12; k++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
      for (let i = 0; i < en.high; i++) {
        if (!en.alive[i]) {
          seen[i] = 0;
          continue;
        }
        if (seen[i] || en.variant[i] === 2) continue;
        seen[i] = 1;
        all++;
        if (Math.hypot(en.x[i] - s.x, en.z[i] - s.z) <= TRIAL.near.max + 1) near++;
      }
    }
    expect(all).toBeGreaterThan(8);
    expect(near / all, `${near}/${all} 隻在碑附近`).toBeGreaterThan(TRIAL.near.frac * 0.6);
  });

  it('資料全掃：四種稀有度×各個進度都有三段遞增的門檻；越稀有、越後面門檻越高；三階寶箱不降、越稀有最高階越好；有名稱與說明', () => {
    expect(ELEMENT_KINDS).toContain('trial');
    let prevTop = -1;
    for (const r of RARITIES) {
      for (const p of [0, 0.25, 0.5, 1]) {
        const n = trialNeeds(r, p);
        expect(n[0]).toBeLessThan(n[1]);
        expect(n[1]).toBeLessThan(n[2]);
      }
      expect(trialNeeds(r, 0.5)[0], `${r} 越後面門檻越高`).toBeGreaterThan(trialNeeds(r, 0)[0]);
      const rank = TRIAL.rewards[r].map((x) => RARITIES.indexOf(x));
      expect(rank[0]).toBeLessThanOrEqual(rank[1]);
      expect(rank[1]).toBeLessThanOrEqual(rank[2]);
      expect(rank[2], `${r} 最高階寶箱`).toBeGreaterThanOrEqual(prevTop);
      prevTop = rank[2];
    }
    for (let k = 1; k < RARITIES.length; k++) expect(trialNeeds(RARITIES[k], 0.3)[0], `${RARITIES[k]} 比 ${RARITIES[k - 1]} 難`).toBeGreaterThan(trialNeeds(RARITIES[k - 1], 0.3)[0]);
    for (const k of ['element.trial', 'element.trial.desc', 'element.trial.hint', 'element.trial.zone', 'hud.trial', 'result.trial.win', 'result.trial.lose'] as const) expect(t(k as I18nKey), k).not.toBe(k);
  });

  it('按住啟動：試煉開始、碑留在原地、剩 TRIAL.seconds 秒、敵人湧出變快；時間到才收掉', () => {
    const run = make(11);
    const s = startTrial(run);
    expect(run.elements.trial.left).toBeGreaterThan(TRIAL.seconds - 1);
    const p = run.time / run.director.duration;
    expect(run.elements.trial.needs).toEqual(trialNeeds('common', p)); // 門檻跟著關卡進度算
    expect(run.elements.trial.needs[0]).toBeGreaterThanOrEqual(TRIAL.baseNeeds[0]);
    run.step(DT);
    expect(run.elements.spawnMult).toBeGreaterThanOrEqual(TRIAL.spawnMult);
    expect(s.active && s.usedAge < 0, '試煉中碑要留著').toBe(true);
    finishTrial(run);
    run.dismissResult(); // 結果卡開著模擬是停住的
    for (let i = 0; i < 60; i++) run.step(DT);
    expect(run.elements.spawnMult).toBe(1);
    expect(s.active, '試煉結束碑要收掉').toBe(false);
  });

  it('只算倒在圈內的人類：圈內 +1、圈外不算；試煉沒開始也不算', () => {
    const run = make(12);
    run.elements.noteKill(run.px, run.pz);
    expect(run.elements.trial.kills).toBe(0);
    startTrial(run);
    const { x, z } = run.elements.trial;
    run.elements.noteKill(x + TRIAL.radius - 0.5, z);
    run.elements.noteKill(x, z - TRIAL.radius + 0.5);
    expect(run.elements.trial.kills).toBe(2);
    run.elements.noteKill(x + TRIAL.radius + 0.5, z);
    run.elements.noteKill(x + 40, z);
    expect(run.elements.trial.kills).toBe(2);
  });

  it('真的打倒人類會計入（Run.onKill 接上了；舊版沒接會紅）：圈內放 6 隻、放大招全打倒 → 6', () => {
    const run = make(13);
    startTrial(run);
    const { x, z } = run.elements.trial;
    run.devTeleport(x, z);
    for (let k = 0; k < 6; k++) {
      const i = run.enemies.spawn(kindIndex('villager'), x + 2 + k * 0.4, z + (k % 2 ? 1 : -1), 1, 0, 0);
      run.enemies.hp[i] = run.enemies.maxHp[i] = 1;
    }
    run.enemies.update(0, run.px, run.pz, run.flow, 0, 0);
    run.devChargeUlt();
    run.castUltimate();
    expect(run.elements.trial.kills).toBeGreaterThanOrEqual(6);
  });

  it('全掃：每種稀有度的碑、每一段成績——寶箱的稀有度對、掉在碑附近；沒達到第 1 段什麼都沒有（沒有寶箱）、結果卡寫出成績', () => {
    for (const r of RARITIES) {
      for (const want of [-1, 0, 1, 2]) {
        const run = make(20 + RARITIES.indexOf(r) * 4 + want + 1);
        startTrial(run, r);
        const chestsBefore = run.elements.slots.filter((s) => s.active && s.kind === 'chest').length;
        const needs = run.elements.trial.needs;
        expect(needs).toEqual(trialNeeds(r, run.time / run.director.duration));
        run.elements.trial.kills = want < 0 ? needs[0] - 1 : needs[want];
        const res = finishTrial(run);
        expect(res, `${r}／${want} 沒有結果卡`).toBeTruthy();
        expect(res!.kind).toBe('trial');
        const line = res!.lines[0];
        expect(line.t).toBe('trial');
        if (line.t !== 'trial') continue;
        expect(line.tier).toBe(want);
        const chests = run.elements.slots.filter((s) => s.active && s.kind === 'chest');
        if (want < 0) {
          expect(chests.length, `${r} 失敗不該有寶箱`).toBe(chestsBefore);
        } else {
          expect(chests.length).toBe(chestsBefore + 1);
          const c = chests.find((s) => s.rarity === TRIAL.rewards[r][want]);
          expect(c, `${r}／第 ${want + 1} 段應給 ${TRIAL.rewards[r][want]} 寶箱`).toBeTruthy();
          expect(Math.hypot(c!.x - run.elements.trial.x, c!.z - run.elements.trial.z)).toBeLessThan(12);
          expect(line.reward).toBe(TRIAL.rewards[r][want]);
        }
      }
    }
  });

  it('結果卡出來時模擬停住、關掉才繼續；過關（endStage）時進行中的試煉會取消', () => {
    const run = make(31);
    startTrial(run);
    run.elements.trial.kills = run.elements.trial.needs[0];
    finishTrial(run);
    expect(run.elementResult).toBeTruthy();
    const t0 = run.time;
    run.step(DT);
    expect(run.time, '結果卡開著模擬要停住').toBe(t0);
    run.dismissResult();
    run.step(DT);
    expect(run.time).toBeGreaterThan(t0);
    const run2 = make(32);
    startTrial(run2);
    run2.elements.endStage();
    expect(run2.elements.trial.active).toBe(false);
    expect(run2.elements.spawnMult).toBe(1);
  });
});
