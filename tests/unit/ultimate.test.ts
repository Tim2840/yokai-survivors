import { describe, it, expect } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning } from '../../src/data/tuning';
import { ITEM_POOL, itemById } from '../../src/data/items';
import { ULT, ULT_RECIPES, ULT_CARD_PREFIX, ultHints, recipeProgress } from '../../src/data/ultimates';
import { CHEST_HOLD_SECONDS } from '../../src/data/elements';
import type { CardOffer } from '../../src/systems/cards';
import { kindIndex } from '../../src/systems/enemies';
import { YOKAI } from '../../src/data/yokai';

const DT = 1 / 60;
function make(seed = 3) {
  tuning.stageSeconds = 600;
  const bus = new EventBus();
  const run = new Run({ seed, bus });
  run.god = false;
  return { run, bus };
}
/** 主武器到 Lv4 會跳出招式變化三選一：選狐火分裂（照樣會發射） */
function resolveVariant(run: Run) {
  while (run.awaitingPick && run.offerKind === 'variant') {
    const i = run.offer!.findIndex((c) => c.cardId === 'variant:kitsunebi');
    run.chooseCard(Math.max(0, i));
  }
}
/** 把配方需要的材料全部升到需要的等級（主武器起始就是 Lv1） */
function giveAll(run: Run, id: string) {
  const r = ULT_RECIPES.find((x) => x.id === id)!;
  for (const [card, n] of Object.entries(r.requires)) {
    while ((run.cardCounts.get(card) ?? 0) < n) {
      run.give(card, 'common');
      resolveVariant(run);
    }
  }
}
/** 在腳邊放一個寶箱、站上去按住，回傳寶箱開出來的卡（升級選卡先選掉） */
function openChest(run: Run): CardOffer[] {
  const s = run.elements.devForce('chest', 'common', run.px, run.pz)!;
  expect(s).toBeTruthy();
  run.devTeleport(s.x, s.z);
  run.setMove(0, 0);
  for (let i = 0; i < 60 * (CHEST_HOLD_SECONDS + 1) && !(run.awaitingPick && run.offerKind === 'chest'); i++) {
    if (run.awaitingPick) run.chooseCard(0);
    run.step(DT);
  }
  expect(run.offerKind).toBe('chest');
  return [...run.offer!];
}
/** 湊齊材料、開寶箱、選融合卡 */
function fuse(run: Run, id: string) {
  giveAll(run, id);
  const o = openChest(run);
  const i = o.findIndex((c) => c.cardId === ULT_CARD_PREFIX + id);
  expect(i, `${id} 的融合卡`).toBeGreaterThanOrEqual(0);
  run.chooseCard(i);
  while (run.awaitingPick) run.chooseCard(0);
  expect(run.fused).toContain(id);
}
/** 在玩家身邊指定位置放一隻村人（回傳編號）；把玩家放在原點附近的平地 */
function placeEnemy(run: Run, dx: number, dz: number): number {
  const i = run.enemies.spawn(kindIndex('villager'), run.px + dx, run.pz + dz, 1, 0, 0);
  expect(i).toBeGreaterThanOrEqual(0);
  run.enemies.hp[i] = run.enemies.maxHp[i] = 1; // 一擊就死，只看有沒有被打到
  return i;
}
/** 空間雜湊要更新過才查得到剛放的敵人（遊戲裡每步 enemies.update 會做） */
function settle(run: Run) {
  run.enemies.update(0, run.px, run.pz, run.flow, 0, 0);
}

describe('大招配方（資料全掃）', () => {
  it('每個配方都是這隻妖怪的、材料都在卡池裡拿得到、主武器要滿級（進化式）、其他材料總等級 ≤ 8、id 唯一、每隻可玩妖怪至少 3 個', () => {
    expect(new Set(ULT_RECIPES.map((r) => r.id)).size).toBe(ULT_RECIPES.length);
    for (const r of ULT_RECIPES) {
      expect(YOKAI[r.yokai], r.id).toBeTruthy();
      let total = 0;
      for (const [card, n] of Object.entries(r.requires)) {
        expect(ITEM_POOL, `${r.id} 的材料 ${card} 不在卡池`).toContain(card);
        expect(n, `${r.id} 要 ${card} ${n} 級，超過最高等級`).toBeLessThanOrEqual(itemById(card).maxLevel);
        expect(n).toBeGreaterThan(0);
        if (itemById(card).kind === 'weapon') expect(n, `${r.id}：主武器要滿級`).toBe(itemById(card).maxLevel);
        else total += n;
      }
      expect(Object.keys(r.requires).some((c) => itemById(c).kind === 'weapon'), `${r.id} 沒有要求主武器`).toBe(true);
      expect(total, r.id).toBeLessThanOrEqual(8);
    }
    expect(ULT_RECIPES.filter((r) => r.yokai === 'chochin-kozo').length).toBeGreaterThanOrEqual(3);
  });
  it('配方彼此不同（不會一組材料同時湊成兩個大招造成混淆）', () => {
    const key = (r: (typeof ULT_RECIPES)[number]) => JSON.stringify(Object.entries(r.requires).sort());
    expect(new Set(ULT_RECIPES.map(key)).size).toBe(ULT_RECIPES.length);
  });
});

describe('融合', () => {
  it('全掃：每個配方——少一級時寶箱沒有融合卡；湊齊不會自動融合，提示一次；開寶箱選融合卡才融合、只融合一次', () => {
    for (const r of ULT_RECIPES) {
      const { run, bus } = make(5);
      run.god = true;
      const got: string[] = [];
      const ready: string[] = [];
      bus.on('fusion', (e) => got.push(e.id));
      bus.on('fusionReady', (e) => ready.push(e.id));
      // 每種材料都少一級的版本：最後一個材料停在 need-1
      const entries = Object.entries(r.requires);
      const [lastCard, lastNeed] = entries[entries.length - 1];
      for (const [card, n] of entries.slice(0, -1)) while ((run.cardCounts.get(card) ?? 0) < n) { run.give(card, 'common'); resolveVariant(run); }
      while ((run.cardCounts.get(lastCard) ?? 0) < lastNeed - 1) { run.give(lastCard, 'common'); resolveVariant(run); }
      expect(run.fusable, `${r.id} 少一級`).not.toContain(r.id);
      const o1 = openChest(run);
      expect(o1.some((c) => c.cardId === ULT_CARD_PREFIX + r.id), `${r.id} 少一級時寶箱不該有融合卡`).toBe(false);
      run.chooseCard(0);
      while (run.awaitingPick) run.chooseCard(0);
      giveAll(run, r.id);
      expect(run.fused, `${r.id} 湊齊不會自動融合`).not.toContain(r.id);
      expect(run.fusable).toContain(r.id);
      expect(ready.filter((x) => x === r.id)).toHaveLength(1);
      expect(run.lastReady?.id).toBe(r.id);
      const o2 = openChest(run);
      expect(o2[0].cardId, '融合卡排第一張').toBe(ULT_CARD_PREFIX + r.id);
      run.chooseCard(0);
      expect(run.fused).toContain(r.id);
      expect(got).toEqual([r.id]);
      while (run.awaitingPick) run.chooseCard(0);
      // 融合過的不會再出現
      const o3 = openChest(run);
      expect(o3.some((c) => c.cardId === ULT_CARD_PREFIX + r.id)).toBe(false);
    }
  });
  it('一局可以融合多個大招（不只一個）：材料都齊時，一個寶箱列出多張融合卡，一次選一張', () => {
    const { run } = make(6);
    run.god = true;
    for (const r of ULT_RECIPES) giveAll(run, r.id);
    expect(run.fused).toEqual([]);
    const o = openChest(run);
    expect(o.filter((c) => c.cardId.startsWith(ULT_CARD_PREFIX)).length).toBe(Math.min(o.length, ULT_RECIPES.length));
    for (let k = 0; k < ULT_RECIPES.length; k++) {
      const offer = k === 0 ? o : openChest(run);
      const i = offer.findIndex((c) => c.cardId.startsWith(ULT_CARD_PREFIX));
      run.chooseCard(i);
      while (run.awaitingPick) run.chooseCard(0);
    }
    expect([...run.fused].sort()).toEqual(ULT_RECIPES.map((r) => r.id).sort());
  });
  it('寶箱以外（升級、賽錢箱）不會出現融合卡', () => {
    const { run } = make(14);
    run.god = true;
    giveAll(run, 'thunderSpear');
    run.addXp(500);
    expect(run.offerKind).toBe('levelup');
    for (let g = 0; run.awaitingPick && g < 50; g++) {
      expect(run.offer!.some((c) => c.cardId.startsWith(ULT_CARD_PREFIX))).toBe(false);
      run.chooseCard(0);
    }
    const s = run.elements.devForce('offering', 'common', run.px, run.pz)!;
    run.devTeleport(s.x, s.z);
    for (let i = 0; i < 60 * 4 && !(run.awaitingPick && run.offerKind === 'offering'); i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.offerKind).toBe('offering');
    expect(run.offer!.some((c) => c.cardId.startsWith(ULT_CARD_PREFIX))).toBe(false);
  });
  it('選卡提示：材料已經夠了（配方湊齊、等開寶箱）就不提示（舊版會紅：寫「選了就湊齊」）', () => {
    const done = new Map<string, number>([['ghostfire', 8], ['splash', 2], ['area', 2], ['power', 1]]);
    for (const c of ['ghostfire', 'splash', 'area', 'power']) expect(ultHints(c, 'chochin-kozo', done, []).find((x) => x.id === 'infernoLantern'), c).toBeUndefined();
  });
  it('選卡提示：材料進度、選了就湊齊', () => {
    const counts = new Map<string, number>([['ghostfire', 8], ['splash', 1], ['area', 2], ['power', 1]]);
    const h = ultHints('splash', 'chochin-kozo', counts, []).find((x) => x.id === 'infernoLantern')!;
    expect(h).toMatchObject({ have: 1, need: 2, completes: true });
    const h2 = ultHints('splash', 'chochin-kozo', new Map(), []).find((x) => x.id === 'infernoLantern')!;
    expect(h2.completes).toBe(false);
    expect(ultHints('splash', 'chochin-kozo', counts, ['infernoLantern']).find((x) => x.id === 'infernoLantern')).toBeUndefined();
    expect(recipeProgress(ULT_RECIPES[0], counts).every((p) => p.have <= p.need)).toBe(true);
  });
});

describe('充能與發動', () => {
  it('擊殺與時間充能；沒融合或量表沒滿不能發動；發動後歸零', () => {
    const { run } = make(7);
    expect(run.castUltimate()).toBe(false);
    run.devChargeUlt();
    expect(run.castUltimate(), '沒有融合不能發動').toBe(false);
    fuse(run, 'thunderSpear');
    run.ultCharge = 0;
    for (let i = 0; i < 60; i++) run.step(DT);
    expect(run.ultCharge).toBeGreaterThan(ULT.perSecond * 0.9);
    expect(run.castUltimate(), '量表沒滿').toBe(false);
    run.devChargeUlt();
    expect(run.castUltimate()).toBe(true);
    expect(run.ultCharge).toBe(0);
    expect(run.lastCast?.ids).toContain('thunderSpear');
  });
  it('擊殺敵人會充能：充能量 = 擊殺數 × perKill + 時間 × perSecond', () => {
    const { run } = make(8);
    run.god = true;
    run.ultCharge = 0;
    placeEnemy(run, 3, 0);
    settle(run);
    let t = 0;
    for (let i = 0; i < 60 * 5 && run.kills === 0; i++) {
      run.step(DT);
      t += DT;
    }
    expect(run.kills).toBeGreaterThan(0);
    // 場上別的敵人可能也被打死：用實際擊殺數推算（一般敵人 perKill）
    expect(run.ultCharge).toBeGreaterThanOrEqual(ULT.perKill * run.kills - 1e-9);
    expect(run.ultCharge).toBeLessThanOrEqual(ULT.perElite * run.kills + ULT.perSecond * t + 1e-6);
  });
});

describe('各大招的效果', () => {
  it('炎獄燈（範圍爆發）：範圍內的敵人被打死、範圍外的沒事', () => {
    const { run } = make(9);
    fuse(run, 'infernoLantern');
    const near = placeEnemy(run, 4, 0);
    const far = placeEnemy(run, 20, 0);
    settle(run);
    run.devChargeUlt();
    run.castUltimate();
    expect(run.enemies.alive[near]).toBe(0);
    expect(run.enemies.alive[far]).toBe(1);
  });
  it('雷火槍（貫穿光束）：射線上的全部被打到（含遠處），線外的沒事', () => {
    const { run } = make(10);
    fuse(run, 'thunderSpear');
    // 最近的敵人決定瞄準方向：放在 +x 方向 3 公尺
    const a = placeEnemy(run, 3, 0);
    const b = placeEnemy(run, 12, 0.3);
    const c = placeEnemy(run, 18, -0.4);
    const off = placeEnemy(run, 8, 6);
    const behind = placeEnemy(run, -5, 0);
    settle(run);
    run.devChargeUlt();
    run.castUltimate();
    for (const i of [a, b, c]) expect(run.enemies.alive[i], '射線上').toBe(0);
    expect(run.enemies.alive[off], '射線外').toBe(1);
    expect(run.enemies.alive[behind], '身後').toBe(1);
  });
  it('鬼火亂舞（狂亂）：攻擊力、攻速、鬼火數量暫時提高，時間到恢復', () => {
    const { run } = make(11);
    fuse(run, 'ghostfireDance');
    const p0 = run.stats.value.power;
    const a0 = run.stats.value.atkSpeed;
    settle(run);
    run.devChargeUlt();
    run.castUltimate();
    expect(run.stats.value.power).toBeGreaterThan(p0);
    expect(run.stats.value.atkSpeed).toBeGreaterThan(a0);
    for (let i = 0; i < 60 * 8; i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.stats.value.power).toBeCloseTo(p0, 5);
    expect(run.stats.value.atkSpeed).toBeCloseTo(a0, 5);
  });
  it('守燈結界：無敵、回血、周圍敵人被震開受傷', () => {
    const { run } = make(12);
    fuse(run, 'bulwarkLantern');
    run.hp = run.maxHp * 0.3;
    const near = placeEnemy(run, 3, 0);
    settle(run);
    run.devChargeUlt();
    run.castUltimate();
    expect(run.hp).toBeGreaterThan(run.maxHp * 0.6);
    expect(run.invul).toBeGreaterThan(3);
    expect(run.enemies.alive[near]).toBe(0);
    // 無敵期間不會被打
    const hp = run.hp;
    for (let i = 0; i < 120; i++) run.step(DT);
    expect(run.hp).toBeGreaterThanOrEqual(hp - 1e-6);
  });
  it('一次發動全部已融合的大招', () => {
    const { run } = make(13);
    for (const r of ULT_RECIPES) fuse(run, r.id);
    settle(run);
    run.devChargeUlt();
    run.castUltimate();
    expect(run.lastCast!.ids.sort()).toEqual(ULT_RECIPES.map((r) => r.id).sort());
  });
});
