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

describe('進化（D53：兩招都 8 級、不限次數）', () => {
  it('材料沒到 8 級不能進化；到了才出現在 evolvable；鬼火要主武器滿級', () => {
    const run = make(21);
    run.devAddTech('kitsunebi');
    expect(run.tech.evolvable).toHaveLength(0);
    run.devTechLevel('kitsunebi', TECH_LEVELS.max);
    expect(run.tech.evolvable.map((e) => e.id), '鬼火還沒滿級').toEqual([]);
    run.devTechLevel(BASE_TECH_ID, TECH_LEVELS.max);
    expect(run.tech.evolvable.map((e) => e.id)).toEqual(['evoSplit']);
  });

  it('進化：兩個技法併成一格、效果 × EVO.power、參數換成進化後的值；只能進化一次', () => {
    const run = make(22);
    run.devAddTech('ring', 'satellite');
    const used0 = run.tech.slotsUsed;
    run.devTechLevel('ring', TECH_LEVELS.max);
    run.devTechLevel('satellite', TECH_LEVELS.max);
    const pr0 = run.tech.powerOf('ring');
    const cnt0 = run.tech.satCount;
    expect(run.tech.evolve('evoArray')).toBe(true);
    expect(run.tech.evolve('evoArray'), '不能再進化一次').toBe(false);
    expect(run.tech.slotsUsed).toBe(used0 - 1);
    expect(run.tech.powerOf('ring')).toBeCloseTo(pr0 * EVO.power);
    expect(run.tech.satCount).toBeGreaterThan(cnt0);
    expect(run.tech.act.ring!.orbit!.baseOrbs).toBe(evoById('evoArray').set.ring.orbit.baseOrbs);
    expect(run.tech.isEvolved('ring') && run.tech.isEvolved('satellite')).toBe(true);
  });

  it('不限次數：進化省下的欄位可以再拿新技法、再進化；鬼火可以和不同技法各進化一次；用過的技法不能再當材料', () => {
    const run = make(23);
    expect(TECH_MAX).toBe(3);
    run.devAddTech('ring', 'satellite', 'ward');
    run.devTechLevel('ring', 8);
    run.devTechLevel('satellite', 8);
    run.tech.evolve('evoArray');
    expect(run.tech.slotsUsed).toBe(2);
    run.devAddTech('lamp');
    expect(run.tech.owned).toContain('lamp');
    expect(run.tech.slotsUsed).toBe(3);
    run.devTechLevel('ward', 8);
    run.devTechLevel('lamp', 8);
    run.devTechLevel(BASE_TECH_ID, 8);
    expect(run.tech.evolvable.map((e) => e.id)).toContain('evoWatch');
    run.tech.evolve('evoWatch');
    expect(run.tech.slotsUsed).toBe(2);
    expect(run.tech.evolved).toEqual(['evoArray', 'evoWatch']);
    // 鬼火＋狐火分裂、鬼火＋火種：鬼火不會被用掉，兩個都能進化（不省格）
    run.devAddTech('kitsunebi');
    run.devTechLevel('kitsunebi', 8);
    expect(run.tech.evolve('evoSplit')).toBe(true);
    expect(run.tech.isEvolved(BASE_TECH_ID)).toBe(false);
    expect(run.tech.evolve('evoSoul'), '火種沒拿到').toBe(false);
    // 用過的技法不能再當別的進化的材料
    expect(run.tech.evolvable.every((e) => e.from.every((m) => !run.tech.isEvolved(m)))).toBe(true);
  });

  it('進化給主武器加成（鬼火＋狐火分裂：傷害 +15%、穿透 +1）', () => {
    const run = make(24);
    run.devAddTech('kitsunebi');
    const d0 = run.shotDamage(false);
    run.devTechLevel('kitsunebi', 8);
    run.devTechLevel(BASE_TECH_ID, 8);
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
    run.devTechLevel('ring', 8);
    run.devTechLevel('satellite', 8);
    run.tech.evolve('evoArray');
    run.tech.replace('ring', 'ward');
    expect(run.tech.evolved).toEqual([]);
    expect(run.tech.isEvolved('satellite')).toBe(false);
  });

  it('寶箱：可以進化的排在最前面，選了真的進化；合魂祠：可以進化後 appearDelay 秒出現、站上去按住 → 面板只列進化 → 進化後收掉', () => {
    const run = make(26);
    run.director.active = false;
    run.devAddTech('ring', 'satellite');
    run.devTechLevel('ring', 8);
    run.devTechLevel('satellite', 8);
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
    expect(run.offer!.map((c) => c.cardId)).toEqual(['evo:evoArray']);
    run.chooseCard(0);
    expect(run.tech.evolved).toEqual(['evoArray']);
    run.step(DT);
    expect(run.elements.fuseSlot, '進化後合魂祠要收掉').toBeNull();

    // 寶箱：再湊一組（燃燒系），寶箱第一張是進化卡
    run.devAddTech('hellfire', 'oil');
    run.devTechLevel('hellfire', 8);
    run.devTechLevel('oil', 8);
    const s = run.elements.devForce('chest', 'common', run.px, run.pz)!;
    run.devTeleport(s.x, s.z);
    for (let i = 0; i < 60 * (CHEST_HOLD_SECONDS + 1) && !(run.awaitingPick && run.offerKind === 'chest'); i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.offerKind).toBe('chest');
    expect(run.offer![0].cardId).toBe('evo:evoInferno');
  });

  it('可以進化時提示一次（evolveReady）', () => {
    const run = make(27);
    const bus = (run as unknown as { bus: EventBus }).bus;
    const events: string[] = [];
    bus.on('evolveReady', (e) => events.push(e.id));
    run.devAddTech('ring', 'satellite');
    run.devTechLevel('ring', 8);
    run.devTechLevel('satellite', 8);
    run.devTechLevel('ring', 8);
    expect(events).toEqual(['evoArray']);
  });
});
