import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { FUSE } from '../../src/data/elements';
import { ULT, ULT_RECIPES, ULT_CARD_PREFIX } from '../../src/data/ultimates';
import { PlayerReach } from '../../src/systems/reach';
import { kindIndex } from '../../src/systems/enemies';

const DT = 1 / 60;
afterEach(() => resetTuning());

function make(seed = 3) {
  tuning.stageSeconds = 600;
  const bus = new EventBus();
  const run = new Run({ seed, bus });
  run.god = true;
  return { run, bus };
}
function resolve(run: Run) {
  while (run.awaitingPick && run.offerKind === 'variant') {
    const i = run.offer!.findIndex((c) => c.cardId === 'variant:kitsunebi');
    run.chooseCard(Math.max(0, i));
  }
}
function giveAll(run: Run, id: string) {
  const r = ULT_RECIPES.find((x) => x.id === id)!;
  for (const [card, n] of Object.entries(r.requires)) {
    while ((run.cardCounts.get(card) ?? 0) < n) {
      run.give(card, 'common');
      resolve(run);
    }
  }
}
function step(run: Run, sec: number) {
  for (let i = 0; i < sec / DT; i++) {
    if (run.elementResult) run.dismissResult();
    if (run.awaitingPick && run.offerKind === 'levelup') run.chooseCard(0);
    if (run.awaitingPick) break;
    run.step(DT);
  }
}

describe('合魂祠（地圖上的融合要素）', () => {
  it('材料湊齊前沒有；湊齊後 appearDelay 秒出現在玩家走得到的地方、發事件；HUD 用的 fuseSlot 指向它', () => {
    const { run, bus } = make(51);
    let ev = 0;
    bus.on('fuseShrine', () => ev++);
    step(run, FUSE.appearDelay + 1);
    expect(run.elements.fuseSlot).toBeNull();
    giveAll(run, 'thunderSpear');
    step(run, FUSE.appearDelay - 0.5);
    expect(run.elements.fuseSlot, '太早出現').toBeNull();
    step(run, 1 + 2.6); // 延遲＋預告光柱
    const s = run.elements.fuseSlot!;
    expect(s).toBeTruthy();
    expect(ev).toBe(1);
    const reach = new PlayerReach(run.map);
    reach.compute(run.px, run.pz);
    expect(reach.ok(s.x, s.z)).toBe(true);
  });

  it('站上去按住 holdSeconds 秒 → 融合面板只列出湊齊的大招 → 選了就融合、合魂祠收掉', () => {
    const { run } = make(52);
    giveAll(run, 'thunderSpear');
    giveAll(run, 'ghostfireDance');
    step(run, FUSE.appearDelay + 3);
    const s = run.elements.fuseSlot!;
    run.devTeleport(s.x, s.z);
    run.setMove(0, 0);
    for (let i = 0; i < (FUSE.holdSeconds + 0.5) / DT && run.offerKind !== 'fusion'; i++) {
      if (run.awaitingPick && run.offerKind === 'levelup') run.chooseCard(0);
      run.step(DT);
    }
    expect(run.offerKind).toBe('fusion');
    const ids = run.offer!.map((c) => c.cardId).sort();
    expect(ids).toEqual([ULT_CARD_PREFIX + 'ghostfireDance', ULT_CARD_PREFIX + 'thunderSpear'].sort());
    run.chooseCard(run.offer!.findIndex((c) => c.cardId === ULT_CARD_PREFIX + 'thunderSpear'));
    expect(run.fused).toContain('thunderSpear');
    expect(run.awaitingPick).toBe(false);
    expect(s.usedAge).toBeGreaterThanOrEqual(0);
    // 還有一個湊齊的（鬼火亂舞）→ 之後會再出現一座
    step(run, FUSE.appearDelay + 4);
    expect(run.elements.fuseSlot).not.toBeNull();
  });

  it('先開寶箱融合掉了：沒有可以融合的了 → 合魂祠收掉（寶箱照樣能融合）', () => {
    const { run } = make(53);
    giveAll(run, 'thunderSpear');
    step(run, FUSE.appearDelay + 3);
    expect(run.elements.fuseSlot).not.toBeNull();
    const c = run.elements.devForce('chest', 'common', run.px, run.pz)!;
    run.devTeleport(c.x, c.z);
    for (let i = 0; i < 3 / DT && run.offerKind !== 'chest'; i++) {
      if (run.awaitingPick && run.offerKind === 'levelup') run.chooseCard(0);
      run.step(DT);
    }
    run.chooseCard(run.offer!.findIndex((x) => x.cardId.startsWith(ULT_CARD_PREFIX)));
    expect(run.fused).toContain('thunderSpear');
    expect(run.elements.fuseSlot).toBeNull();
  });
});

describe('大招冷卻（使用者 2026-11-05）', () => {
  it('發動後 cooldown 秒內量表不充能（時間、殺敵都不算）、不能再放；冷卻結束後恢復充能（舊版會紅）', () => {
    const { run } = make(54);
    giveAll(run, 'thunderSpear');
    run.devChargeUlt();
    (run as unknown as { fuse(id: string): void }).fuse('thunderSpear');
    expect(run.castUltimate()).toBe(true);
    expect(run.ultCooling).toBe(true);
    // 冷卻中：時間與殺敵都不充能
    step(run, 5);
    for (let k = 0; k < 20; k++) {
      const i = run.enemies.spawn(kindIndex('villager'), run.px + 30, run.pz, 1, 0, 0, 0, 1);
      (run as unknown as { onKill(i: number): void }).onKill(i);
    }
    expect(run.ultCharge).toBe(0);
    expect(run.castUltimate()).toBe(false);
    expect(run.ultCooldownLeft).toBeGreaterThan(ULT.cooldown - 6);
    step(run, ULT.cooldown);
    expect(run.ultCooling).toBe(false);
    step(run, 2);
    expect(run.ultCharge).toBeGreaterThan(0);
  });
});
