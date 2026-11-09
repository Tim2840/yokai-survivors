import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { DOSOJIN } from '../../src/data/elements';
import { TECH_KEEP, TECH_SWAP_PREFIX } from '../../src/data/techniques';
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
/** 前進 sec 秒（升級選卡選第一張、結果卡關掉；技法面板不自動選） */
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
/** 站上去按住到技法面板打開 */
function holdOn(run: Run) {
  const s = run.elements.dosojinSlot!;
  run.devTeleport(s.x, s.z);
  run.setMove(0, 0);
  for (let i = 0; i < (DOSOJIN.holdSeconds + 1) / DT && run.offerKind !== 'tech'; i++) {
    if (run.awaitingPick && run.offerKind === 'levelup') run.chooseCard(0);
    run.step(DT);
  }
  return s;
}

describe('道祖神（D47；D48 起換的是技法）', () => {
  it('還沒有技法：一直不會出現；拿了技法之後 appearDelay 秒才出現、在走得到的地方、發一次事件', () => {
    const { run, bus } = make(61);
    let ev = 0;
    bus.on('dosojin', () => ev++);
    step(run, DOSOJIN.appearDelay + 10);
    expect(run.elements.dosojinSlot, '沒有技法就出現').toBeNull();
    run.devAddTech('ring');
    step(run, DOSOJIN.appearDelay - 1);
    expect(run.elements.dosojinSlot, '太早出現').toBeNull();
    const s = waitDosojin(run)!;
    expect(s).toBeTruthy();
    expect(ev).toBe(1);
    const reach = new PlayerReach(run.map);
    reach.compute(run.px, run.pz);
    expect(reach.ok(s.x, s.z), '放在走不到的地方').toBe(true);
  });

  it('按住 → 技法面板（最多兩個「換掉 X → Y」＋「維持現狀」）→ 換掉：效果換掉、舊技法留下的燃燒地清掉、發事件；這一關不再出現', () => {
    const { run, bus } = make(62);
    const changes: string[] = [];
    bus.on('techChanged', (e) => changes.push(`${e.from}>${e.to}`));
    run.devAddTech('hellfire', 'kitsunebi');
    waitDosojin(run);
    // 站在道祖神旁，先讓業火燒出燃燒地，再按住到面板打開（面板開著時模擬停，燃燒地還在）
    const s = run.elements.dosojinSlot!;
    run.devTeleport(s.x + 3, s.z);
    for (let i = 0; i < 60 * 4 && run.tech.zoneCount === 0; i++) {
      if (i % 20 === 0) run.enemies.spawn(0, run.px + 4, run.pz, 1, 0, 0);
      step(run, DT);
    }
    holdOn(run);
    expect(run.offerKind).toBe('tech');
    expect(run.techMode).toBe('swap');
    expect(run.zoneCount, '對照：換之前要有燃燒地').toBeGreaterThan(0);
    const ids = run.offer!.map((c) => c.cardId);
    expect(ids[ids.length - 1]).toBe(TECH_KEEP);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(ids.length).toBeLessThanOrEqual(3);
    const swapIdx = run.offer!.findIndex((c) => c.cardId.startsWith(TECH_SWAP_PREFIX + 'hellfire>'));
    if (swapIdx < 0) {
      // 提案隨機挑哪個舊的；沒抽到業火就換個種子重測（這個種子該抽到，抽不到就是亂數流程變了）
      throw new Error(`沒有「換掉業火」的提案：${ids.join(',')}`);
    }
    const to = ids[swapIdx].slice((TECH_SWAP_PREFIX + 'hellfire>').length);
    run.chooseCard(swapIdx);
    expect(run.awaitingPick).toBe(false);
    expect(run.tech.has('hellfire')).toBe(false);
    expect(run.tech.has(to)).toBe(true);
    expect(run.tech.owned).toHaveLength(2);
    expect(run.zoneCount, '業火的燃燒地沒清掉').toBe(0);
    expect(changes).toEqual([`hellfire>${to}`]);
    expect(run.lastTechChange?.to).toBe(to);
    expect(s.usedAge).toBeGreaterThanOrEqual(0);
    step(run, DOSOJIN.appearDelay * 2 + 5);
    expect(run.elements.dosojinSlot, '同一關又出現').toBeNull();
  });

  it('維持現狀：技法不變、不發事件', () => {
    const { run, bus } = make(63);
    let n = 0;
    bus.on('techChanged', () => n++);
    run.devAddTech('kitsunebi', 'lamp');
    const before = [...run.tech.owned];
    waitDosojin(run);
    holdOn(run);
    run.chooseCard(run.offer!.findIndex((c) => c.cardId === TECH_KEEP));
    expect(run.tech.owned).toEqual(before);
    expect(n).toBe(0);
    expect(run.lastTechChange).toBeNull();
    expect(run.awaitingPick).toBe(false);
  });

  it('換的新技法不會和留下的互斥（燈籠環在身上時不會提案彈跳、歸巢）；提案的新技法互不相同', () => {
    for (let seed = 70; seed < 90; seed++) {
      const { run } = make(seed);
      run.devAddTech('ring', 'hellfire');
      waitDosojin(run);
      holdOn(run);
      const swaps = run.offer!.filter((c) => c.cardId.startsWith(TECH_SWAP_PREFIX)).map((c) => c.cardId.slice(TECH_SWAP_PREFIX.length).split('>'));
      expect(new Set(swaps.map(([, b]) => b)).size, `種子 ${seed} 的提案新技法重複`).toBe(swaps.length);
      for (const [old, nw] of swaps) {
        if (old === 'hellfire') expect(['bounce', 'homing'], `種子 ${seed}：留著燈籠環卻提案 ${nw}`).not.toContain(nw);
        expect(run.tech.has(nw), `提案了已經有的 ${nw}`).toBe(false);
      }
    }
  });

  it('下一關開始 appearDelay 秒後再出現一座', () => {
    const { run } = make(64);
    run.devAddTech('kitsunebi');
    waitDosojin(run);
    holdOn(run);
    run.chooseCard(run.offer!.findIndex((c) => c.cardId === TECH_KEEP));
    run.devClearStage();
    while (run.offer) run.chooseCard(0);
    run.continueFromIntermission();
    expect(run.elements.dosojinSlot).toBeNull();
    step(run, DOSOJIN.appearDelay - 1);
    expect(run.elements.dosojinSlot, '太早出現').toBeNull();
    expect(waitDosojin(run)).toBeTruthy();
  });
});
