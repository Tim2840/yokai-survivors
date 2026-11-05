import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { DOSOJIN } from '../../src/data/elements';
import { VARIANT_LEVEL } from '../../src/data/variants';
import { PlayerReach } from '../../src/systems/reach';

const DT = 1 / 60;
afterEach(() => resetTuning());

function make(seed = 3) {
  tuning.stageSeconds = 600;
  const bus = new EventBus();
  const run = new Run({ seed, bus });
  run.god = true;
  return { run, bus };
}
/** 主武器升到變化等級，走真的三選一面板選 id */
function pickVariant(run: Run, id: string) {
  while ((run.cardCounts.get('ghostfire') ?? 1) < VARIANT_LEVEL) run.give('ghostfire', 'common');
  expect(run.offerKind).toBe('variant');
  run.chooseCard(run.offer!.findIndex((c) => c.cardId === 'variant:' + id));
  expect(run.variant?.id).toBe(id);
}
/** 前進 sec 秒（升級選卡選第一張、結果卡關掉；變化面板不自動選） */
function step(run: Run, sec: number) {
  for (let i = 0; i < sec / DT; i++) {
    if (run.elementResult) run.dismissResult();
    if (run.awaitingPick && run.offerKind === 'levelup') run.chooseCard(0);
    if (run.awaitingPick) break;
    run.step(DT);
  }
}
/** 等道祖神出現（含預告光柱） */
function waitDosojin(run: Run) {
  for (let i = 0; i < 60 / DT && !(run.elements.dosojinSlot && run.elements.dosojinSlot.announce <= 0); i++) step(run, DT);
  return run.elements.dosojinSlot;
}
/** 站上去按住到面板打開 */
function holdOn(run: Run) {
  const s = run.elements.dosojinSlot!;
  run.devTeleport(s.x, s.z);
  run.setMove(0, 0);
  for (let i = 0; i < (DOSOJIN.holdSeconds + 1) / DT && run.offerKind !== 'variant'; i++) {
    if (run.awaitingPick && run.offerKind === 'levelup') run.chooseCard(0);
    run.step(DT);
  }
  return s;
}

describe('道祖神（D47：選了變化之後可以換）', () => {
  it('還沒選變化：一直不會出現；選了之後 appearDelay 秒才出現、在走得到的地方、發一次事件', () => {
    const { run, bus } = make(61);
    let ev = 0;
    bus.on('dosojin', () => ev++);
    step(run, DOSOJIN.appearDelay + 10);
    expect(run.elements.dosojinSlot, '沒選變化就出現').toBeNull();
    pickVariant(run, 'lanternRing');
    step(run, DOSOJIN.appearDelay - 1);
    expect(run.elements.dosojinSlot, '太早出現').toBeNull();
    const s = waitDosojin(run)!;
    expect(s).toBeTruthy();
    expect(ev).toBe(1);
    const reach = new PlayerReach(run.map);
    reach.compute(run.px, run.pz);
    expect(reach.ok(s.x, s.z), '放在走不到的地方').toBe(true);
  });

  it('按住 → 變化三選一（三種都在、標記目前那張）→ 換成別的：效果換掉、上一種的燃燒地清掉、發事件；這一關不再出現', () => {
    const { run, bus } = make(62);
    const changes: string[] = [];
    bus.on('variantChanged', (e) => changes.push(`${e.from}>${e.to}`));
    pickVariant(run, 'hellfire');
    waitDosojin(run);
    // 站在道祖神上，先讓業火在旁邊燒出燃燒地，再按住到面板打開（面板開著時模擬停，燃燒地還在）
    const s = run.elements.dosojinSlot!;
    run.devTeleport(s.x + 3, s.z);
    for (let i = 0; i < 60 * 4 && run.zoneCount === 0; i++) {
      if (i % 20 === 0) run.enemies.spawn(0, run.px + 4, run.pz, 1, 0, 0);
      step(run, DT);
    }
    holdOn(run);
    expect(run.offerKind).toBe('variant');
    expect(run.zoneCount, '對照：換之前要有燃燒地').toBeGreaterThan(0);
    expect(run.variantRechoose).toBe(true);
    expect(run.offer!.map((c) => c.cardId).sort()).toEqual(['variant:hellfire', 'variant:kitsunebi', 'variant:lanternRing']);
    run.chooseCard(run.offer!.findIndex((c) => c.cardId === 'variant:lanternRing'));
    expect(run.awaitingPick).toBe(false);
    expect(run.variant?.id).toBe('lanternRing');
    expect(run.variantRechoose).toBe(false);
    expect(run.zoneCount, '業火的燃燒地沒清掉').toBe(0);
    expect(changes).toEqual(['hellfire>lanternRing']);
    expect(run.lastVariantChange?.to).toBe('lanternRing');
    expect(s.usedAge).toBeGreaterThanOrEqual(0);
    step(run, DOSOJIN.appearDelay * 2 + 5);
    expect(run.elements.dosojinSlot, '同一關又出現').toBeNull();
  });

  it('選回原本的：變化不變、不發事件', () => {
    const { run, bus } = make(63);
    let n = 0;
    bus.on('variantChanged', () => n++);
    pickVariant(run, 'kitsunebi');
    waitDosojin(run);
    holdOn(run);
    run.chooseCard(run.offer!.findIndex((c) => c.cardId === 'variant:kitsunebi'));
    expect(run.variant?.id).toBe('kitsunebi');
    expect(n).toBe(0);
    expect(run.lastVariantChange).toBeNull();
  });

  it('下一關開始 appearDelay 秒後再出現一座', () => {
    const { run } = make(64);
    pickVariant(run, 'kitsunebi');
    waitDosojin(run);
    holdOn(run);
    run.chooseCard(0);
    run.devClearStage();
    run.continueFromIntermission();
    expect(run.elements.dosojinSlot).toBeNull();
    step(run, DOSOJIN.appearDelay - 1);
    expect(run.elements.dosojinSlot, '太早出現').toBeNull();
    expect(waitDosojin(run)).toBeTruthy();
  });
});
