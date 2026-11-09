import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { AFFIX_BASE, AFFIX_COUNT, AFFIX_STATS, TECH_STATS, rollAffixes, emptyAffixes } from '../../src/data/affixes';
import { ITEM_RARITY_MULT } from '../../src/data/items';
import { RARITIES } from '../../src/data/rarity';
import { TECHS, mechOf, techsFor, type TechMechanic } from '../../src/data/techniques';
import { Rng } from '../../src/lib/random';
import { zhTW } from '../../src/i18n/zh-TW';

afterEach(() => resetTuning());

const MECHS = Object.keys(AFFIX_STATS) as TechMechanic[];

describe('詞條（D53；2026-11-09 改：只強化技法本身，每張至少 2 條）', () => {
  it('每種機制都有詞條候選，至少 2 種；候選只有 威力／範圍／頻率／連鎖（沒有最大生命、護甲這類全身能力值）；每種詞條都有名稱', () => {
    for (const t of TECHS) expect(MECHS, `技法 ${t.id} 的機制 ${mechOf(t)} 沒有詞條設定`).toContain(mechOf(t));
    for (const m of MECHS) {
      expect(AFFIX_STATS[m].length, m).toBeGreaterThanOrEqual(2);
      for (const s of AFFIX_STATS[m]) expect(TECH_STATS, `${m}/${s}`).toContain(s);
    }
    expect([...TECH_STATS]).toEqual(['power', 'area', 'rate', 'chain']);
    for (const s of TECH_STATS) expect(zhTW[`affix.${s}` as keyof typeof zhTW], s).toBeTruthy();
    expect(RARITIES.map((r) => AFFIX_COUNT[r])).toEqual([2, 2, 3, 3]);
  });

  it('全掃：每種機制、每個稀有度、很多種子——條數 = min(稀有度條數, 候選數)、不重複、都在候選裡、數值 = 基準 × 稀有度倍率', () => {
    for (const m of MECHS) {
      for (const r of RARITIES) {
        for (let seed = 1; seed <= 40; seed++) {
          const a = rollAffixes(new Rng(seed), r, m);
          expect(a, `${m}／${r}／${seed} 條數`).toHaveLength(Math.min(AFFIX_COUNT[r], AFFIX_STATS[m].length));
          expect(new Set(a.map((x) => x.stat)).size).toBe(a.length);
          for (const x of a) {
            expect(AFFIX_STATS[m]).toContain(x.stat);
            expect(x.value).toBeCloseTo(AFFIX_BASE[x.stat] * ITEM_RARITY_MULT[r]);
          }
        }
      }
    }
    // 越稀有越大
    const v = (r: (typeof RARITIES)[number]) => rollAffixes(new Rng(1), r, 'ring').find((x) => x.stat === 'power')?.value ?? AFFIX_BASE.power * ITEM_RARITY_MULT[r];
    expect(v('legend')).toBeGreaterThan(v('common'));
  });

  it('固定種子可以重現；不同種子不全一樣', () => {
    expect(rollAffixes(new Rng(9), 'epic', 'ring')).toEqual(rollAffixes(new Rng(9), 'epic', 'ring'));
    const sets = new Set<string>();
    for (let s = 1; s <= 30; s++) sets.add(rollAffixes(new Rng(s), 'rare', 'ring').map((x) => x.stat).join(','));
    expect(sets.size).toBeGreaterThan(2);
  });

  it('發牌：升級卡裡的每一張技法卡都帶詞條，條數與詞條種類符合那個技法的機制（舊版沒有或不分技法會紅）', () => {
    tuning.stageSeconds = 600;
    let seen = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const run = new Run({ seed, bus: new EventBus() });
      run.god = true;
      run.devTechNext();
      for (let g = 0; g < 60 && !run.awaitingPick; g++) run.addXp(10);
      const tech = run.offer?.find((c) => c.cardId.startsWith('tech:'));
      if (!tech) continue;
      const id = tech.cardId.slice('tech:'.length);
      const m = mechOf(TECHS.find((t) => t.id === id)!);
      expect(tech.affixes, `seed ${seed}`).toBeTruthy();
      expect(tech.affixes!.length).toBeGreaterThanOrEqual(2);
      for (const a of tech.affixes!) expect(AFFIX_STATS[m]).toContain(a.stat);
      seen++;
    }
    expect(seen).toBeGreaterThan(20);
  }, 30000);

  it('選了技法卡：詞條只加在那個技法身上，全身的能力值（最大生命、護甲、攻擊力…）一點都沒變', () => {
    tuning.stageSeconds = 600;
    let checked = 0;
    for (const seed of [3, 4, 5, 6, 7, 8, 9]) {
      const a = new Run({ seed, bus: new EventBus() });
      a.god = true;
      a.devTechNext();
      for (let g = 0; g < 60 && !a.awaitingPick; g++) a.addXp(10);
      const i = a.offer!.findIndex((c) => c.cardId.startsWith('tech:'));
      if (i < 0) continue;
      const card = a.offer![i];
      const id = card.cardId.slice('tech:'.length);
      const b = new Run({ seed, bus: new EventBus() });
      a.chooseCard(i);
      const sa = a.stats.value;
      const sb = b.stats.value;
      for (const k of Object.keys(sb) as (keyof typeof sb)[]) if (k !== 'maxHp') expect(sa[k], `${seed}／${String(k)}`).toBeCloseTo(sb[k] as number);
      expect(sa.maxHp).toBeCloseTo(sb.maxHp);
      const got = a.tech.affixesOf(id);
      for (const x of card.affixes!) expect(got[x.stat]).toBeCloseTo(x.value);
      checked++;
    }
    expect(checked).toBeGreaterThan(2);
  });

  it('再拿同一個技法的卡：詞條累加；換掉技法（道祖神）詞條跟著清掉', () => {
    tuning.stageSeconds = 600;
    const run = new Run({ seed: 5, bus: new EventBus() });
    run.tech.add('ring', 1);
    run.tech.addAffixes('ring', [{ stat: 'area', value: 0.1 }]);
    run.tech.addAffixes('ring', [{ stat: 'area', value: 0.2 }, { stat: 'power', value: 0.1 }]);
    expect(run.tech.affixesOf('ring').area).toBeCloseTo(0.3);
    expect(run.tech.affixesOf('ring').power).toBeCloseTo(0.1);
    run.tech.replace('ring', 'ward');
    expect(run.tech.affixesOf('ward')).toEqual(emptyAffixes());
  });

  it('每個技法的每種詞條都「真的有作用」：威力 → 效果倍率變大；範圍／頻率 → 作用中的參數變了；連鎖 → 連鎖數增加（全掃 15 個技法）', () => {
    tuning.stageSeconds = 600;
    for (const t of TECHS) {
      const m = mechOf(t);
      for (const stat of AFFIX_STATS[m]) {
        const run = new Run({ seed: 1, bus: new EventBus(), yokaiId: t.weapon === 'waterdisc' ? 'kappa' : 'chochin-kozo' });
        run.tech.add(t.id, 1);
        const before = JSON.stringify(run.tech.act[m]);
        const pw0 = run.tech.powerOf(t.id);
        const hr0 = run.projectiles.homeReturnDamage;
        run.tech.addAffixes(t.id, [{ stat, value: 0.5 }]);
        if (stat === 'power') {
          const changed = run.tech.powerOf(t.id) > pw0 + 1e-9 || run.projectiles.homeReturnDamage > hr0 + 1e-9;
          expect(changed, `${t.id}／威力沒有作用`).toBe(true);
        } else if (stat === 'chain') {
          const ex = (run.tech as unknown as { chainExtra(x: TechMechanic): number }).chainExtra(m);
          // 0.5 = 一半機率多 1：多抽幾次一定看得到
          let max = ex;
          for (let k = 0; k < 40; k++) max = Math.max(max, (run.tech as unknown as { chainExtra(x: TechMechanic): number }).chainExtra(m));
          expect(max, `${t.id}／連鎖沒有作用`).toBeGreaterThanOrEqual(1);
        } else {
          expect(JSON.stringify(run.tech.act[m]), `${t.id}／${stat} 沒有改變任何參數`).not.toBe(before);
        }
      }
    }
  });
});
