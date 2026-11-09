import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { BASE_TECH_ID, EVO, EVOS, TECHS, TECH_LEVELS, TECH_MAX, evoById, techById } from '../../src/data/techniques';
import { ITEMS } from '../../src/data/items';
import { FUSE } from '../../src/data/elements';
import { CHEST_HOLD_SECONDS } from '../../src/data/elements';
import { t } from '../../src/i18n';
import type { I18nKey } from '../../src/i18n/zh-TW';
import { CardDealer } from '../../src/systems/cards';
import { Rng } from '../../src/lib/random';
import { RARITIES } from '../../src/data/rarity';
import { ITEM_POOL } from '../../src/data/items';

const DT = 1 / 60;
afterEach(() => resetTuning());
function make(seed = 3) {
  tuning.stageSeconds = 600;
  const run = new Run({ seed, bus: new EventBus() });
  run.god = true;
  return run;
}

describe('技法進化資料（D53）', () => {
  it('技法一局最多 3 個（使用者 2026-11-06）', () => {
    expect(TECH_MAX).toBe(3);
  });
  it('全掃：每個進化的材料是真的技法（或鬼火）、id 不重複、換參數的區塊與欄位真的存在、有名稱與說明；每個技法都在至少一個進化裡', () => {
    expect(new Set(EVOS.map((e) => e.id)).size).toBe(EVOS.length);
    const inEvo = new Set<string>();
    for (const e of EVOS) {
      expect(e.from[0]).not.toBe(e.from[1]);
      for (const m of e.from) {
        if (m !== BASE_TECH_ID) expect(() => techById(m), `${e.id} 的材料 ${m}`).not.toThrow();
        inEvo.add(m);
      }
      for (const [tid, blocks] of Object.entries(e.set)) {
        expect(e.from, `${e.id} 換了不是材料的技法 ${tid}`).toContain(tid);
        const d = techById(tid) as unknown as Record<string, Record<string, number>>;
        for (const [block, vals] of Object.entries(blocks)) {
          expect(d[block], `${tid} 沒有區塊 ${block}`).toBeTruthy();
          for (const k of Object.keys(vals)) expect(k in d[block], `${tid}.${block} 沒有欄位 ${k}`).toBe(true);
        }
      }
      if (e.from.includes(BASE_TECH_ID)) expect(e.weapon, `${e.id} 有鬼火但沒有主武器加成`).toBeTruthy();
      for (const key of [`evo.${e.id}`, `evo.${e.id}.desc`] as const) expect(t(key as I18nKey), key).not.toBe(key);
      // 兩個材料不能互斥（不然一局拿不到）
      const [a, b] = e.from;
      if (a !== BASE_TECH_ID && b !== BASE_TECH_ID) {
        expect(techById(a).excludes).not.toContain(b);
        expect(techById(b).excludes).not.toContain(a);
      }
    }
    for (const x of TECHS) expect(inEvo.has(x.id), `${x.id} 不在任何進化裡`).toBe(true);
  });
  it('D56：每個進化的材料都是「鬼火 + 一個技法」，每個技法剛好一個進化（舊版兩個技法配對會紅）', () => {
    for (const e of EVOS) expect(e.from[0], e.id).toBe(BASE_TECH_ID);
    expect(EVOS).toHaveLength(TECHS.length);
    expect(new Set(EVOS.map((e) => e.from[1]))).toEqual(new Set(TECHS.map((x) => x.id)));
  });
});

describe('適合沒有加成（使用者 2026-11-06：「不要再有適合加成」）', () => {
  it('法具練到高等級也不會讓技法或主鬼火變強（舊版有適合加成會紅）', () => {
    const a = make(11);
    const b = make(11);
    a.devAddTech('kitsunebi');
    b.devAddTech('kitsunebi');
    const p0 = a.tech.powerOf('kitsunebi');
    const d0 = a.shotDamage(false);
    for (const id of ['atkSpeed', 'volley']) for (let k = 0; k < 3; k++) a.give(id, 'common');
    // 力量以外的屬性不影響鬼火傷害；技法的效果倍率只看技法等級
    expect(a.tech.powerOf('kitsunebi')).toBeCloseTo(p0);
    expect(a.shotDamage(false)).toBeCloseTo(d0 + 0, 6);
    expect(b.tech.powerOf('kitsunebi')).toBeCloseTo(p0);
  });
});

describe('每一次升級卡都有稀有度（D53）', () => {
  it('全掃：卡池裡每個法具都吃稀有度（包含主武器、多重、穿透、備用獎勵）', () => {
    for (const id of [...ITEM_POOL, 'heal', 'meritBag']) expect(ITEMS.find((x) => x.id === id)!.rarityScales, id).toBe(true);
  });
  it('發牌：主武器、多重、穿透也會抽到良／珍／極（舊版一律標成凡會紅）', () => {
    const d = new CardDealer(new Rng(5), ITEM_POOL, RARITIES);
    d.playerLevel = 30;
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const o of d.deal(30, 0, new Map([['volley', 1], ['pierce', 1], ['power', 1]]))) if (['ghostfire', 'volley', 'pierce'].includes(o.cardId) && o.rarity !== 'common') seen.add(o.cardId);
    expect([...seen].sort()).toEqual(['ghostfire', 'pierce', 'volley']);
  });
  it('主武器每一級加的東西 × 稀有度：極階的鬼火 Lv2 傷害加成是凡階的 2 倍', () => {
    const a = make(13);
    const b = make(13);
    a.give('ghostfire', 'common');
    b.give('ghostfire', 'legend');
    expect(b.weaponDamageBonus).toBeCloseTo(a.weaponDamageBonus * 2);
  });
  it('備用獎勵「療傷」也吃稀有度', () => {
    const a = make(14);
    const b = make(14);
    a.hp = b.hp = 1;
    a.give('heal', 'common');
    b.give('heal', 'legend');
    expect(b.hp - 1).toBeGreaterThan((a.hp - 1) * 1.9);
  });
});

describe('進化（D53；D54 起材料 5 級、不限次數）', () => {
  it('材料要到 EVO.minLevel（5）級才能進化：差一級不行、到了才出現在 evolvable；鬼火要主武器到 5 級（舊版 8 級會紅）', () => {
    expect(EVO.minLevel).toBe(5);
    const run = make(21);
    run.devAddTech('kitsunebi');
    expect(run.tech.evolvable).toHaveLength(0);
    run.devTechLevel('kitsunebi', EVO.minLevel);
    run.devTechLevel(BASE_TECH_ID, EVO.minLevel - 1);
    expect(run.tech.evolvable.map((e) => e.id), '鬼火差一級').toEqual([]);
    run.devTechLevel(BASE_TECH_ID, EVO.minLevel);
    expect(run.tech.evolvable.map((e) => e.id)).toEqual(['evoSplit']);
    // 技法差一級也不行（鬼火已經 5 級）
    const r2 = make(22);
    r2.devAddTech('ring');
    r2.devTechLevel(BASE_TECH_ID, EVO.minLevel);
    r2.devTechLevel('ring', EVO.minLevel - 1);
    expect(r2.tech.evolvable).toHaveLength(0);
    r2.devTechLevel('ring', EVO.minLevel);
    expect(r2.tech.evolvable.map((e) => e.id)).toEqual(['evoRing']);
  });

  it('進化：技法效果 × EVO.power、參數換成進化後的值、鬼火加成；有鬼火不省格；只能進化一次', () => {
    const run = make(22);
    run.devAddTech('ring', 'satellite');
    const used0 = run.tech.slotsUsed;
    run.devTechLevel('ring', TECH_LEVELS.max);
    run.devTechLevel(BASE_TECH_ID, TECH_LEVELS.max);
    const pr0 = run.tech.powerOf('ring');
    const ps0 = run.tech.powerOf('satellite');
    expect(run.tech.evolve('evoRing')).toBe(true);
    expect(run.tech.evolve('evoRing'), '不能再進化一次').toBe(false);
    expect(run.tech.slotsUsed, '有鬼火的進化不省格').toBe(used0);
    expect(run.tech.powerOf('ring')).toBeCloseTo(pr0 * EVO.power);
    expect(run.tech.powerOf('satellite'), '另一個技法不受影響').toBeCloseTo(ps0);
    expect(run.tech.act.ring!.orbit!.baseOrbs).toBe(evoById('evoRing').set.ring.orbit.baseOrbs);
    expect(run.tech.isEvolved('ring')).toBe(true);
    expect(run.tech.isEvolved('satellite')).toBe(false);
  });

  it('不限次數：鬼火可以和不同技法各進化一次（最多跟著手上的技法數）；進化過的技法不能再進化；鬼火不會被用掉', () => {
    const run = make(23);
    expect(TECH_MAX).toBe(3);
    run.devAddTech('ring', 'satellite', 'ward');
    for (const id of ['ring', 'satellite', 'ward']) run.devTechLevel(id, EVO.minLevel);
    run.devTechLevel(BASE_TECH_ID, EVO.minLevel);
    expect(run.tech.evolvable.map((e) => e.id)).toEqual(['evoRing', 'evoSatellite', 'evoWard']);
    for (const id of ['evoRing', 'evoSatellite', 'evoWard']) expect(run.tech.evolve(id), id).toBe(true);
    expect(run.tech.evolved).toEqual(['evoRing', 'evoSatellite', 'evoWard']);
    expect(run.tech.isEvolved(BASE_TECH_ID)).toBe(false);
    expect(run.tech.evolvable, '都進化完了').toEqual([]);
    expect(run.tech.evolve('evoRing')).toBe(false);
    expect(run.tech.evolve('evoSplit'), '狐火分裂沒拿到').toBe(false);
  });

  it('進化給主武器加成（鬼火＋狐火分裂：傷害 +15%、穿透 +1）', () => {
    const run = make(24);
    run.devAddTech('kitsunebi');
    const d0 = run.shotDamage(false);
    run.devTechLevel('kitsunebi', EVO.minLevel);
    run.devTechLevel(BASE_TECH_ID, EVO.minLevel);
    const d1 = run.shotDamage(false);
    run.tech.evolve('evoSplit');
    const w = evoById('evoSplit').weapon!;
    expect(run.shotDamage(false)).toBeCloseTo(d1 * (1 + w.damage));
    expect(d1).toBeGreaterThan(d0);
    expect(run.tech.evoPierce).toBe(w.pierce);
  });

  it('道祖神換掉進化過的技法：進化跟著拆掉', () => {
    const run = make(25);
    run.devAddTech('ring', 'satellite');
    run.devTechLevel('ring', EVO.minLevel);
    run.devTechLevel(BASE_TECH_ID, EVO.minLevel);
    run.tech.evolve('evoRing');
    run.tech.replace('ring', 'ward');
    expect(run.tech.evolved).toEqual([]);
    expect(run.tech.isEvolved('ring')).toBe(false);
  });

  it('寶箱：可以進化的排在最前面，選了真的進化；合魂祠：可以進化後 appearDelay 秒出現、站上去按住 → 面板只列進化 → 進化後收掉', () => {
    const run = make(26);
    run.director.active = false;
    run.devAddTech('ring');
    run.devTechLevel('ring', EVO.minLevel);
    run.devTechLevel(BASE_TECH_ID, EVO.minLevel);
    expect(run.tech.evolvable).toHaveLength(1);
    // 合魂祠
    for (let i = 0; i < 60 * (FUSE.appearDelay + 2) && !run.elements.fuseSlot; i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    const slot = run.elements.fuseSlot;
    expect(slot, '合魂祠沒有出現').toBeTruthy();
    run.devTeleport(slot!.x, slot!.z);
    run.setMove(0, 0);
    for (let i = 0; i < 60 * (FUSE.holdSeconds + 3) && !(run.awaitingPick && run.offerKind === 'fusion'); i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.offerKind).toBe('fusion');
    expect(run.offer!.map((c) => c.cardId)).toEqual(['evo:evoRing']);
    run.chooseCard(0);
    expect(run.tech.evolved).toEqual(['evoRing']);
    run.step(DT);
    expect(run.elements.fuseSlot, '進化後合魂祠要收掉').toBeNull();

    // 寶箱：再湊一組（燃燒系），寶箱第一張是進化卡
    run.devAddTech('hellfire');
    run.devTechLevel('hellfire', EVO.minLevel);
    const s = run.elements.devForce('chest', 'common', run.px, run.pz)!;
    run.devTeleport(s.x, s.z);
    for (let i = 0; i < 60 * (CHEST_HOLD_SECONDS + 1) && !(run.awaitingPick && run.offerKind === 'chest'); i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.offerKind).toBe('chest');
    expect(run.offer![0].cardId).toBe('evo:evoHellfire');
  });

  it('可以進化時提示一次（evolveReady）', () => {
    const run = make(27);
    const bus = (run as unknown as { bus: EventBus }).bus;
    const events: string[] = [];
    bus.on('evolveReady', (e) => events.push(e.id));
    run.devAddTech('ring');
    run.devTechLevel(BASE_TECH_ID, EVO.minLevel);
    run.devTechLevel('ring', EVO.minLevel);
    expect(events).toEqual(['evoRing']);
  });
});
