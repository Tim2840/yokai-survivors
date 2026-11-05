import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { STAGE, isBigBossStage } from '../../src/data/stage';
import { DIFFICULTY } from '../../src/data/difficulty';
import { ITEMS, itemById, itemValue } from '../../src/data/items';
import { kindIndex } from '../../src/systems/enemies';
import { PlayerReach } from '../../src/systems/reach';

const DT = 1 / 60;
afterEach(() => resetTuning());

function make(seed = 3, mapNumber = 1) {
  tuning.stageSeconds = 60;
  const bus = new EventBus();
  const run = new Run({ seed, bus, mapNumber });
  run.god = true;
  return { run, bus };
}
function step(run: Run, sec: number) {
  for (let i = 0; i < Math.round(sec / DT); i++) {
    if (run.awaitingPick) run.chooseCard(0);
    run.step(DT);
  }
}
/** 走正常的擊殺流程（測掉落用） */
const killNow = (run: Run, i: number) => (run as unknown as { onKill(i: number): void }).onKill(i);

describe('召喚祭壇（D34）', () => {
  it('一般關在 appearAt 顯現、離玩家 ringMin 以上；站上去按住 holdSeconds → 小頭目出現、祭壇收掉；發事件', () => {
    const { run, bus } = make(21);
    const log: string[] = [];
    bus.on('summonAltar', () => log.push('altar'));
    bus.on('summonBoss', () => log.push('boss'));
    expect(run.summonStage).toBe(true);
    run.devSetTime(STAGE.summon.appearAt * 60 - 0.5);
    step(run, 0.3);
    expect(run.elements.summonSlot).toBeNull();
    step(run, 0.5);
    const s = run.elements.summonSlot!;
    expect(s).toBeTruthy();
    expect(Math.hypot(s.x - run.px, s.z - run.pz)).toBeGreaterThanOrEqual(STAGE.summon.ringMin * 0.6 - 1e-6);
    expect(run.map.isBlocked(s.x, s.z)).toBe(false);
    expect(log).toEqual(['altar']);
    // 預告結束後才能用；站上去按住
    step(run, 3);
    run.devTeleport(s.x, s.z);
    run.setMove(0, 0);
    step(run, STAGE.summon.holdSeconds - 0.5);
    expect(run.director.bossSpawned, '還沒按滿').toBe(false);
    step(run, 1.5);
    expect(run.director.bossSpawned).toBe(true);
    expect(log).toEqual(['altar', 'boss']);
    step(run, 1);
    expect(run.director.bossIndex).toBeGreaterThanOrEqual(0);
    expect(run.enemies.variant[run.director.bossIndex]).toBe(2);
    expect(run.elements.summonSlot).toBeNull();
  });

  it('越晚召喚越強：HP 倍率 = 1 + hpGrowth × 經過比例（不看玩家等級），時間到之後就是最強', () => {
    const hpAt = (t: number, level: number) => {
      const { run } = make(22);
      for (let k = 1; k < level; k++) run.addXp(run.xpNeeded);
      while (run.awaitingPick) run.chooseCard(0);
      run.devSetTime(t);
      run.devSummonBoss();
      step(run, 0.5);
      return run.enemies.maxHp[run.director.bossIndex];
    };
    const h0 = hpAt(0, 1);
    expect(hpAt(30, 1) / h0).toBeCloseTo(1 + STAGE.summon.hpGrowth * 0.5, 2);
    expect(hpAt(60, 1) / h0).toBeCloseTo(1 + STAGE.summon.hpGrowth, 2);
    expect(hpAt(90, 1) / h0, '超過時間不再變強').toBeCloseTo(1 + STAGE.summon.hpGrowth, 2);
    expect(hpAt(30, 15) / hpAt(30, 1), '跟玩家等級無關').toBeCloseTo(1, 5);
  });

  it('祭壇不會消失：一直不開，到最終蜂群也還在；傳送門不開', () => {
    const { run } = make(23);
    run.devSetTime(STAGE.summon.appearAt * 60 + 0.1);
    step(run, 0.2);
    expect(run.elements.summonSlot).not.toBeNull();
    run.devSetTime(60);
    step(run, 5);
    expect(run.director.swarm).toBe(true);
    expect(run.elements.summonSlot).not.toBeNull();
    expect(run.portal.active).toBe(false);
  });

  it('全掃地圖 1～9 的每一關：大頭目那一關沒有祭壇、頭目在 bossAt 自己出來；其他關有祭壇、頭目不會自己出來', () => {
    for (let m = 1; m <= 9; m++) {
      const { run } = make(30 + m, m);
      for (let k = 0; k < run.stageCount; k++) {
        if (k > 0) run.startNextStage();
        const big = isBigBossStage(m, k);
        expect(run.summonStage, `地圖 ${m} 第 ${k + 1} 關`).toBe(!big);
        run.devSetTime(STAGE.bossAt * 60 + 0.5);
        step(run, 1);
        expect(run.director.bossSpawned, `地圖 ${m} 第 ${k + 1} 關頭目自己出來`).toBe(big);
        expect(run.elements.summonSlot !== null, `地圖 ${m} 第 ${k + 1} 關的祭壇`).toBe(!big);
      }
    }
  });
});

describe('寶箱掉落（D30 第二步）', () => {
  it('小頭目必掉 bossChest 稀有度的寶箱（就在倒下處附近）', () => {
    const { run } = make(24);
    run.devSummonBoss();
    step(run, 0.5);
    const b = run.director.bossIndex;
    const x = run.enemies.x[b];
    const z = run.enemies.z[b];
    run.devKillBoss();
    const c = run.elements.slots.find((s) => s.active && s.kind === 'chest')!;
    expect(c).toBeTruthy();
    expect(c.rarity).toBe(STAGE.drops.bossChest);
    expect(Math.hypot(c.x - x, c.z - z)).toBeLessThan(9);
  });

  it('全掃 10 個種子：小頭目倒在玩家走不到的地方（岩石圍住的小島等）→ 傳送門與寶箱都放在走得到的地方，寶箱離傳送門夠遠（舊版會紅：放在倒下處）', () => {
    let tested = 0;
    for (let seed = 40; seed < 70 && tested < 10; seed++) {
      const { run } = make(seed);
      const reach = new PlayerReach(run.map);
      reach.compute(run.px, run.pz);
      // 找一個「本身不擋路、但玩家走不到」的點
      let hole: [number, number] | null = null;
      const m = run.map;
      for (let x = m.minX + 2; x < m.maxX - 2 && !hole; x += 1) for (let z = m.minZ + 2; z < m.maxZ - 2 && !hole; z += 1) if (!m.isBlocked(x, z) && !reach.ok(x, z)) hole = [x, z];
      if (!hole) continue;
      tested++;
      run.devSummonBoss();
      step(run, 0.5);
      const b = run.director.bossIndex;
      run.enemies.x[b] = hole[0];
      run.enemies.z[b] = hole[1];
      run.devKillBoss();
      reach.compute(run.px, run.pz);
      expect(reach.ok(run.portal.x, run.portal.z), `種子 ${seed} 傳送門`).toBe(true);
      const c = run.elements.slots.find((s) => s.active && s.kind === 'chest')!;
      expect(reach.ok(c.x, c.z), `種子 ${seed} 寶箱`).toBe(true);
      expect(Math.hypot(c.x - run.portal.x, c.z - run.portal.z), `種子 ${seed} 寶箱離傳送門`).toBeGreaterThanOrEqual(STAGE.portalRadius + 1.8);
    }
    expect(tested, '找得到走不到的點的種子').toBeGreaterThanOrEqual(3);
  });

  it('PlayerReach：玩家走路規則——擋路格不能進、陡坡上不去、往下可以；出生點附近走得到', () => {
    const { run } = make(41);
    const reach = new PlayerReach(run.map);
    reach.compute(run.px, run.pz);
    expect(reach.ok(run.px, run.pz)).toBe(true);
    expect(reach.ok(run.px + 2, run.pz)).toBe(true);
    const m = run.map;
    for (let x = m.minX + 0.5; x < m.maxX; x += 3) for (let z = m.minZ + 0.5; z < m.maxZ; z += 3) if (m.isBlocked(x, z)) expect(reach.ok(x, z)).toBe(false);
  });

  it('精英大約 eliteChestChance 的機率掉 eliteChest 寶箱；一般敵人不掉', () => {
    const { run } = make(25);
    let drops = 0;
    const N = 400;
    const count = () => run.elements.slots.filter((s) => s.active && s.kind === 'chest').length;
    for (let k = 0; k < N; k++) {
      for (const s of run.elements.slots) if (s.kind === 'chest') s.active = false;
      const i = run.enemies.spawn(kindIndex('villager'), run.px + 6, run.pz, 1, 0, 0, 1, 1);
      killNow(run, i);
      if (count() > 0) {
        drops++;
        expect(run.elements.slots.find((s) => s.active && s.kind === 'chest')!.rarity).toBe(STAGE.drops.eliteChest);
      }
    }
    const p = STAGE.drops.eliteChestChance;
    expect(drops / N).toBeGreaterThan(p * 0.5);
    expect(drops / N).toBeLessThan(p * 1.6);
    for (const s of run.elements.slots) if (s.kind === 'chest') s.active = false;
    for (let k = 0; k < 200; k++) killNow(run, run.enemies.spawn(kindIndex('villager'), run.px + 6, run.pz, 1, 0, 0, 0, 1));
    expect(count(), '一般敵人不掉寶箱').toBe(0);
  });
});

describe('難度 %（D30 第二步）', () => {
  it('難度 = perStage × 第幾關（0 起）+ perMap × (地圖 − 1)；生命、傷害、湧出照比例變多', () => {
    const { run } = make(26, 4);
    expect(run.difficulty).toBeCloseTo(DIFFICULTY.perMap * 3);
    run.startNextStage();
    const D = DIFFICULTY.perStage + DIFFICULTY.perMap * 3;
    expect(run.difficulty).toBeCloseTo(D);
    // 湧出：Run 每步把難度乘進 director.extraMult
    step(run, DT);
    expect(run.director.extraMult).toBeCloseTo(run.elements.spawnMult * (1 + D * DIFFICULTY.spawn));
    // 傷害：站著被一隻敵人碰一下，扣的血 = 接觸傷害 × (1 + D × damage)
    run.god = false;
    run.invul = 0;
    for (let k = 0; k < run.enemies.capacity; k++) if (run.enemies.alive[k]) run.enemies.kill(k);
    const i = run.enemies.spawn(kindIndex('villager'), run.px + 0.3, run.pz, 1, 0, 0, 0, 1);
    const hp0 = run.hp;
    const contact = run.enemies.damage[i];
    run.stats.value.dodge = 0;
    run.setMove(0, 0);
    run.step(DT);
    const lost = hp0 - run.hp + run.stats.value.regen * DT;
    expect(lost).toBeCloseTo(contact * (1 + D * DIFFICULTY.damage), 1);
  });
});

describe('取捨道具（D30 第二步）', () => {
  it('全掃每個取捨道具：每級好處吃稀有度、壞處固定；滿級後不再加', () => {
    const trade = ITEMS.filter((d) => d.down);
    expect(trade.length).toBeGreaterThanOrEqual(3);
    for (const d of trade) {
      const { run } = make(27);
      const up0 = run.stats.value[d.stat!];
      const dn0 = run.stats.value[d.down!.stat];
      run.give(d.id, 'epic');
      const up1 = run.stats.value[d.stat!];
      const dn1 = run.stats.value[d.down!.stat];
      expect(up1, `${d.id} 好處`).toBeGreaterThan(up0);
      expect(dn1, `${d.id} 壞處`).toBeLessThan(dn0);
      // 壞處不吃稀有度：極階一級扣的和凡階一樣
      const { run: r2 } = make(27);
      r2.give(d.id, 'common');
      expect(dn0 - r2.stats.value[d.down!.stat], `${d.id} 壞處固定`).toBeCloseTo(dn0 - dn1, 5);
      expect(itemValue(itemById(d.id), 'epic')).toBeGreaterThan(itemValue(itemById(d.id), 'common'));
      for (let k = 0; k < d.maxLevel + 2; k++) run.give(d.id, 'common');
      expect(run.cardCounts.get(d.id)).toBe(d.maxLevel);
    }
  });
});

import { describeCard } from '../../src/ui/overlays';

describe('取捨道具的卡片文字', () => {
  it('全掃：每個取捨道具的卡片寫出好處（吃稀有度）與「，但」代價（固定）', () => {
    for (const d of ITEMS.filter((x) => x.down)) {
      const c = describeCard({ cardId: d.id, rarity: 'rare' });
      expect(c.desc, d.id).toMatch(/^.+ \+[\d.]+%?.*，但.+ -[\d.]+%?/);
      expect(c.desc, d.id).toContain(`-${d.down!.perLevel}`);
    }
    expect(describeCard({ cardId: 'cursedBlade', rarity: 'rare' }).desc).toBe('攻擊力 +24%，但最大生命 -10');
  });
});
