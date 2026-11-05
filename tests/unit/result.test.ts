import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { RARITIES } from '../../src/data/rarity';
import { JIZO, JIZO_ARMOR_SECONDS, OMIKUJI_RESULTS, OMIKUJI_EFFECT, ELEMENT_KINDS } from '../../src/data/elements';
import { resultLineText } from '../../src/ui/overlays';
import type { ResultLine } from '../../src/systems/elementResult';

const DT = 1 / 60;
afterEach(() => resetTuning());

function make(seed = 3) {
  tuning.stageSeconds = 600;
  const bus = new EventBus();
  const run = new Run({ seed, bus });
  run.god = true;
  return { run, bus };
}
/** 站在要素上直到結果卡出現（或超時）；升級選卡先選掉 */
function standUntilResult(run: Run, x: number, z: number, maxSec = 4) {
  run.devTeleport(x, z);
  run.setMove(0, 0);
  for (let i = 0; i < maxSec / DT && !run.elementResult; i++) {
    if (run.awaitingPick) run.chooseCard(0);
    run.step(DT);
  }
  return run.elementResult;
}

describe('要素結果卡（D36）', () => {
  it('石地藏（全掃四個稀有度）：集滿 → 結果卡列出回復量與護甲（含秒數），模擬凍結直到關掉', () => {
    for (const r of RARITIES) {
      const { run, bus } = make(4);
      let events = 0;
      bus.on('elementResult', () => events++);
      run.hp = 10;
      const s = run.elements.devForce('jizo', r, run.px, run.pz)!;
      const res = standUntilResult(run, s.x, s.z)!;
      expect(res, r).toBeTruthy();
      expect(events).toBe(1);
      expect(res.kind).toBe('jizo');
      expect(res.rarity).toBe(r);
      const heal = res.lines.find((l) => l.t === 'heal') as Extract<ResultLine, { t: 'heal' }>;
      // 回復量 = 最大生命 × frac（從 10 點開始站，中間的自然回復不算進結果卡）
      // 極階回滿：上限是「還缺多少」（站的時候自然回復了一點點）
      expect(heal.v).toBeGreaterThan(Math.min(run.maxHp * JIZO[r].healFrac, run.maxHp - 11) - 1e-6);
      expect(heal.v).toBeLessThanOrEqual(run.maxHp * JIZO[r].healFrac + 1e-6);
      expect(res.lines).toContainEqual({ t: 'stat', stat: 'armor', flat: JIZO[r].armor, seconds: JIZO_ARMOR_SECONDS });
      // 凍結：時間不走、結果卡還在
      const t0 = run.time;
      for (let i = 0; i < 60; i++) run.step(DT);
      expect(run.time).toBe(t0);
      expect(run.frozen).toBe(true);
      run.dismissResult();
      run.step(DT);
      expect(run.time).toBeGreaterThan(t0);
    }
  });

  it('詛咒祭壇：每個抽到的效果一行（好處是 stat、詛咒是 curse），數字和祭壇上的一樣', () => {
    for (const r of RARITIES) {
      const { run } = make(11);
      const s = run.elements.devForce('altar', r, run.px, run.pz)!;
      const fx = s.effects.slice(0, s.effectCount).map((f) => ({ ...f }));
      const res = standUntilResult(run, s.x, s.z)!;
      expect(res.lines).toHaveLength(fx.length);
      for (const f of fx) {
        if (f.curse) expect(res.lines).toContainEqual({ t: 'curse', id: f.id, v: f.v });
        else expect(res.lines).toContainEqual({ t: 'stat', stat: f.id, pct: f.v });
      }
    }
  });

  it('石地藏極階解除詛咒時，結果卡寫出解除了哪一個', () => {
    const { run } = make(12);
    const a = run.elements.devForce('altar', 'legend', run.px, run.pz)!;
    const curse = a.effects.slice(0, a.effectCount).find((f) => f.curse)!;
    standUntilResult(run, a.x, a.z);
    run.dismissResult();
    run.devTeleport(run.px + 8, run.pz);
    const j = run.elements.devForce('jizo', 'legend', run.px, run.pz)!;
    const res = standUntilResult(run, j.x, j.z)!;
    expect(res.lines).toContainEqual({ t: 'uncurse', id: curse.id });
  });

  it('神籤（全掃六種結果）：第一行是籤名，後面是效果、秒數、功德', () => {
    for (const id of OMIKUJI_RESULTS) {
      const { run } = make(13);
      const lines = run.elements.applyOmikuji(id);
      expect(lines[0]).toEqual({ t: 'omikuji', id });
      const f = OMIKUJI_EFFECT[id];
      const n = Object.keys(f.pct ?? {}).length + Object.keys(f.flat ?? {}).length + Object.keys(f.curse ?? {}).length + (f.merit ? 1 : 0);
      expect(lines.length, id).toBe(1 + n);
    }
    // 走真的流程：站上神籤 → 結果卡
    const { run } = make(14);
    const s = run.elements.devForce('omikuji', 'rare', run.px, run.pz)!;
    const res = standUntilResult(run, s.x, s.z)!;
    expect(res.kind).toBe('omikuji');
    expect(res.lines[0].t).toBe('omikuji');
  });

  it('召喚祭壇：結果卡寫出小頭目的生命倍率', () => {
    tuning.stageSeconds = 60;
    const run = new Run({ seed: 21, bus: new EventBus() });
    run.god = true;
    run.devSetTime(30);
    for (let i = 0; i < 60 * 4 && !run.elements.summonSlot; i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    const a = run.elements.summonSlot!;
    for (let i = 0; i < 60 * 3; i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    const res = standUntilResult(run, a.x, a.z, 5)!;
    expect(res.kind).toBe('summon');
    const l = res.lines[0] as Extract<ResultLine, { t: 'summon' }>;
    expect(l.t).toBe('summon');
    expect(l.mult).toBeCloseTo(run.director.summonMult, 5);
  });

  it('賽錢箱、寶箱不跳結果卡（本來就開三選一面板）；結界石不跳', () => {
    for (const kind of ['offering', 'chest', 'barrier'] as const) {
      const { run } = make(15);
      const s = run.elements.devForce(kind, 'common', run.px, run.pz)!;
      run.devTeleport(s.x, s.z);
      run.setMove(0, 0);
      for (let i = 0; i < 60 * 3 && !run.awaitingPick; i++) run.step(DT);
      expect(run.elementResult, kind).toBeNull();
    }
  });

  it('結果卡與升級同時：兩個都在時凍結；關掉結果卡後還在等選卡', () => {
    const { run } = make(16);
    const s = run.elements.devForce('jizo', 'common', run.px, run.pz)!;
    standUntilResult(run, s.x, s.z);
    run.addXp(500);
    expect(run.awaitingPick && run.elementResult !== null).toBe(true);
    run.dismissResult();
    expect(run.frozen).toBe(true);
    while (run.awaitingPick) run.chooseCard(0);
    expect(run.frozen).toBe(false);
  });

  it('放棄這一局時結果卡清掉', () => {
    const { run } = make(17);
    const s = run.elements.devForce('jizo', 'common', run.px, run.pz)!;
    standUntilResult(run, s.x, s.z);
    run.abandon();
    expect(run.elementResult).toBeNull();
  });

  it('全掃每種結果行：文字不空、沒有沒填的 {參數}', () => {
    const samples: ResultLine[] = [
      { t: 'heal', v: 25.4 },
      { t: 'stat', stat: 'armor', flat: 3, seconds: 60 },
      { t: 'stat', stat: 'regen', flat: 2, seconds: 60 },
      { t: 'stat', stat: 'power', pct: 0.32 },
      { t: 'curse', id: 'enemyHp', v: 0.15 },
      { t: 'curse', id: 'enemySpeed', v: 0.15, seconds: 45 },
      { t: 'uncurse', id: 'enemyDamage' },
      ...OMIKUJI_RESULTS.map((id) => ({ t: 'omikuji', id }) as ResultLine),
      { t: 'merit', v: 5 },
      { t: 'summon', mult: 1.62 },
      { t: 'item', cardId: 'cursedBlade', rarity: 'rare', level: 1 },
    ];
    const kinds = new Set(samples.map((l) => l.t));
    expect(kinds.size).toBe(8);
    for (const l of samples) {
      const s = resultLineText(l);
      expect(s.length, JSON.stringify(l)).toBeGreaterThan(1);
      expect(s, JSON.stringify(l)).not.toMatch(/[{}]/);
    }
    expect(resultLineText({ t: 'stat', stat: 'armor', flat: 3, seconds: 60 })).toBe('護甲 +3（60 秒）');
    expect(resultLineText({ t: 'stat', stat: 'power', pct: 0.32 })).toBe('攻擊力 +32%');
    expect(resultLineText({ t: 'heal', v: 25.4 })).toBe('回復 25 生命');
    void ELEMENT_KINDS;
  });
});
