import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { ELEMENT_KINDS, KANAME, KANAME_PREFIX } from '../../src/data/elements';
import { RARITIES } from '../../src/data/rarity';
import { t } from '../../src/i18n';
import type { I18nKey } from '../../src/i18n/zh-TW';
import type { StatId } from '../../src/data/stats';

// 要石（D99，使用者：「站圈內（範圍可以很小）撐一段時間就能領取能力值加成」）
const DT = 1 / 60;
afterEach(() => resetTuning());
function make(seed = 3) {
  tuning.stageSeconds = 600;
  const run = new Run({ seed, bus: new EventBus() });
  run.god = true;
  run.director.active = false;
  return run;
}
function standFor(run: Run, x: number, z: number, sec: number) {
  run.devTeleport(x, z);
  run.setMove(0, 0);
  for (let i = 0; i < Math.round(sec / DT) && run.offerKind !== 'kaname'; i++) {
    if (run.awaitingPick) run.chooseCard(0);
    if (run.elementResult) run.dismissResult();
    run.step(DT);
  }
}

describe('要石（D99）', () => {
  it('資料：在要素名單裡；圈很小；越稀有加越多；有名稱與說明', () => {
    expect(ELEMENT_KINDS).toContain('kaname');
    expect(KANAME.radius).toBeLessThanOrEqual(2.5);
    for (let k = 1; k < RARITIES.length; k++) expect(KANAME.bonus[RARITIES[k]]).toBeGreaterThan(KANAME.bonus[RARITIES[k - 1]]);
    for (const key of ['element.kaname', 'element.kaname.desc', 'element.kaname.act', 'levelup.kaname', 'card.kanameTag']) expect(t(key as I18nKey), key).not.toBe(key);
  });

  it('站在圈裡撐滿 seconds 秒 → 三選一（三項不同的能力值）→ 選了整場 +bonus；要石收掉', () => {
    for (const r of RARITIES) {
      const run = make(41);
      const s = run.elements.devForce('kaname', r, run.px, run.pz)!;
      standFor(run, s.x, s.z, KANAME.seconds * 0.5);
      expect(run.offerKind, `${r} 撐一半還沒好`).not.toBe('kaname');
      standFor(run, s.x, s.z, KANAME.seconds * 0.6);
      expect(run.offerKind, r).toBe('kaname');
      const ids = run.offer!.map((o) => o.cardId);
      expect(new Set(ids).size).toBe(3);
      for (const id of ids) expect(KANAME.stats).toContain(id.slice(KANAME_PREFIX.length) as StatId);
      const stat = ids[0].slice(KANAME_PREFIX.length) as StatId;
      const before = run.stats.value[stat];
      run.chooseCard(0);
      expect(run.stats.value[stat], `${r} ${stat}`).toBeCloseTo(before * (1 + KANAME.bonus[r]) / 1, 0);
      expect(run.stats.value[stat]).toBeGreaterThan(before);
      expect(s.usedAge).toBeGreaterThanOrEqual(0);
    }
  });

  it('走出圈外進度慢慢退；按互動沒有用（要石要撐，不是按）', () => {
    const run = make(42);
    const s = run.elements.devForce('kaname', 'rare', run.px, run.pz)!;
    standFor(run, s.x, s.z, KANAME.seconds * 0.6);
    const p0 = s.progress;
    expect(p0).toBeGreaterThan(0.5);
    standFor(run, s.x + KANAME.radius + 4, s.z, 2);
    expect(s.progress).toBeLessThan(p0);
    expect(s.progress).toBeGreaterThan(0);
    run.devTeleport(s.x, s.z);
    run.step(DT);
    expect(run.elements.canInteract, '要石不用按').toBe(false);
  });

  it('站在圈裡時人類從近處湧來（舊版沒有近距離湧出會紅）', () => {
    const run = make(43);
    const s = run.elements.devForce('kaname', 'common', run.px, run.pz)!;
    run.devTeleport(s.x, s.z);
    run.director.active = true;
    const en = run.enemies;
    for (let i = 0; i < en.high; i++) if (en.alive[i]) en.kill(i);
    const seen = new Uint8Array(4096);
    let near = 0;
    let all = 0;
    for (let k = 0; k < 60 * 8 && run.offerKind !== 'kaname'; k++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.setMove(0, 0);
      run.step(DT);
      for (let i = 0; i < en.high; i++) {
        if (!en.alive[i]) {
          seen[i] = 0;
          continue;
        }
        if (seen[i] || en.variant[i] === 2) continue;
        seen[i] = 1;
        all++;
        if (Math.hypot(en.x[i] - s.x, en.z[i] - s.z) <= KANAME.near.max + 1) near++;
      }
    }
    expect(all).toBeGreaterThan(5);
    expect(near / all, `${near}/${all}`).toBeGreaterThan(KANAME.near.frac * 0.6);
  });
});
