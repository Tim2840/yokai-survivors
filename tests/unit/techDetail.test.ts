import { describe, it, expect } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { TECHS } from '../../src/data/techniques';
import { TECH_DETAIL } from '../../src/data/techDetail';
import { summarizeBuild } from '../../src/game/buildSummary';
import { zhTW } from '../../src/i18n/zh-TW';

/** 能力面板的技法欄位（2026-11-17）：每個技法都要列得出數值，文字都有 i18n */
describe('能力面板：技法欄位', () => {
  it('每個技法拿到後都列出傷害或效果、暴擊，標籤都有中文', () => {
    for (const d of TECHS) {
      const run = new Run({ seed: 4, bus: new EventBus(), yokaiId: d.weapon === 'waterdisc' ? 'kappa' : 'chochin-kozo' });
      run.devAddTech(d.id);
      if (!run.tech.has(d.id)) continue; // 化身限定或互斥的，devAddTech 會照規則擋下
      const det = summarizeBuild(run).techDetails.find((x) => x.id === d.id)!;
      expect(det, d.id).toBeTruthy();
      expect(det.rows.length, d.id).toBeGreaterThanOrEqual(2);
      for (const r of det.rows) {
        expect(Number.isFinite(r.value), `${d.id}.${r.label}`).toBe(true);
        expect((zhTW as Record<string, string>)[`tdet.${r.label}`], r.label).toBeTruthy();
      }
      expect((zhTW as Record<string, string>)[`pause.techTrigger.${det.kind}`]).toBeTruthy();
    }
  });
  it('每種機制都有欄位設定', () => {
    for (const d of TECHS) expect(TECH_DETAIL[d.mech ?? (d.id as keyof typeof TECH_DETAIL)], d.id).toBeTruthy();
  });
  it('傷害 = 主武器一發 × 比例 × 效果倍率；攻擊力詞條會反映', () => {
    const run = new Run({ seed: 4, bus: new EventBus() });
    run.devAddTech('bounce');
    const a = summarizeBuild(run).techDetails[0].rows.find((r) => r.label === 'jumpDamage')!;
    expect(a.value).toBeCloseTo(run.shotDamage(false) * 0.6, 5);
    run.tech.addAffixes('bounce', [{ stat: 'power', value: 0.5 }]);
    const b = summarizeBuild(run).techDetails[0].rows.find((r) => r.label === 'jumpDamage')!;
    expect(b.value).toBeCloseTo(a.value * 1.5, 5);
  });
});
