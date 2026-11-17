import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { EVO, SOUL_GEM } from '../../src/data/techniques';
import { kindIndex } from '../../src/systems/enemies';

// D93（docs/32 D）：進化 = 技法 EVO.minLevel 級 ＋ 1 顆魂玉；魂玉從精英、頭目、山頂神社、試煉碑拿
afterEach(() => resetTuning());

function make(seed = 5) {
  tuning.stageSeconds = 600;
  const run = new Run({ seed, bus: new EventBus() });
  run.god = true;
  run.director.active = false;
  return run;
}
/** 在身邊生一隻精英／頭目，直接打死（走正常的 onKill） */
function killVariant(run: Run, variant: 1 | 2): void {
  const i = run.enemies.spawn(kindIndex('villager'), run.px + 3, run.pz, 1, 0, 0, variant);
  run.enemies.hp[i] = 1;
  run.weaponHit(i, 999, 0, 0, 0, false);
}

describe('魂玉與進化', () => {
  it('沒有魂玉不能進化；技法差一級不行；有魂玉＋技法到門檻就可以（主武器幾級都行）；進化用掉一顆', () => {
    const run = make();
    run.devAddTech('kitsunebi');
    run.devTechLevel('kitsunebi', EVO.minLevel);
    expect(run.weaponLevel).toBe(1);
    expect(run.tech.evolvable, '沒有魂玉').toHaveLength(0);
    run.addGem(1);
    expect(run.tech.evolvable.map((e) => e.id)).toEqual(['evoSplit']);
    const r2 = make(6);
    r2.devAddTech('ring');
    r2.devTechLevel('ring', EVO.minLevel - 1);
    r2.addGem(1);
    expect(r2.tech.evolvable, '技法差一級').toHaveLength(0);
    expect(run.tech.evolve('evoSplit')).toBe(true);
    // 走選卡的進化（寶箱、合魂祠）才扣魂玉：直接呼叫 tech.evolve 是開發用；這裡量 Run 的路徑
    const r3 = make(7);
    r3.devAddTech('ring');
    r3.devTechLevel('ring', EVO.minLevel);
    r3.addGem(1);
    r3.elements.dropChest(r3.px, r3.pz, 'rare');
    (r3 as unknown as { openBonusPick: (r: string, n: number, k: string) => void }).openBonusPick('rare', 1, 'chest');
    expect(r3.offer?.[0].cardId).toMatch(/^evo:/);
    r3.chooseCard(0);
    expect(r3.tech.isEvolved('ring')).toBe(true);
    expect(r3.soulGems).toBe(0);
  });

  it('每關第一隻精英給一顆，第二隻不給；下一關又給（舊版沒有魂玉會紅）', () => {
    const run = make();
    killVariant(run, 1);
    expect(run.soulGems).toBe(SOUL_GEM.firstElitePerStage);
    killVariant(run, 1);
    expect(run.soulGems).toBe(SOUL_GEM.firstElitePerStage);
    run.startNextStage();
    run.director.active = false;
    killVariant(run, 1);
    expect(run.soulGems).toBe(2 * SOUL_GEM.firstElitePerStage);
  });

  it('頭目給一顆；山頂神社啟動過再多一顆', () => {
    const run = make();
    killVariant(run, 2);
    expect(run.soulGems).toBe(SOUL_GEM.boss);
    const r2 = make(8);
    r2.summitChests = 1;
    killVariant(r2, 2);
    expect(r2.soulGems).toBe(SOUL_GEM.boss + SOUL_GEM.summitExtra);
  });

  it('拿到魂玉有 HUD 提示；能力面板顯示手上幾顆', async () => {
    const run = make();
    killVariant(run, 1);
    expect(run.gemNote && run.gemNote.until > run.clock).toBe(true);
    const { summarizeBuild } = await import('../../src/game/buildSummary');
    expect(summarizeBuild(run).gems).toBe(1);
  });
});
