import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { kindIndex } from '../../src/systems/enemies';

const DT = 1 / 60;
afterEach(() => resetTuning());

/** 開局、清場，把 n 隻村人放在玩家四周不同方向（都在射程內），回傳編號 */
function setup(volleyExtra: number, n: number, dist = 4) {
  tuning.stageSeconds = 600;
  const run = new Run({ seed: 81, bus: new EventBus() });
  run.god = true;
  for (let k = 0; k < volleyExtra; k++) run.give('volley', 'common');
  const en = run.enemies;
  for (let i = 0; i < en.capacity; i++) if (en.alive[i]) en.kill(i);
  const ids: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const i = en.spawn(kindIndex('villager'), run.px + Math.cos(a) * (dist + k * 0.3), run.pz + Math.sin(a) * (dist + k * 0.3), 5, 0, 0, 0, 1);
    en.hp[i] = en.maxHp[i] = 1e6; // 打不死，只看瞄準
    ids.push(i);
  }
  en.update(0, run.px, run.pz, run.flow, 0, 0);
  run.director.active = false; // 不再湧出
  return { run, ids };
}
/** 跑到第一發射出來，回傳這一發的投射物（目標與飛行方向） */
function firstVolley(run: Run) {
  const pr = run.projectiles;
  for (let i = 0; i < 120; i++) {
    run.setMove(0, 0);
    run.step(DT);
    let n = 0;
    for (let k = 0; k < pr.capacity; k++) if (pr.alive[k] && pr.gen[k] === 0) n++;
    if (n > 0) break;
  }
  const out: { target: number; vx: number; vz: number; x: number; z: number }[] = [];
  for (let k = 0; k < pr.capacity; k++) if (pr.alive[k] && pr.gen[k] === 0) out.push({ target: pr.target[k], vx: pr.vx[k], vz: pr.vz[k], x: pr.x[k], z: pr.z[k] });
  return out;
}

describe('鬼火 +N（使用者回報：加了還是看起來只有一顆）', () => {
  it('敵人夠多時：一發 N 顆各打不同的敵人（舊版會紅：全部瞄最近的那一隻，疊成一顆）', () => {
    const { run, ids } = setup(2, 6);
    const shots = firstVolley(run);
    const want = Math.floor(run.volleyExact);
    expect(want).toBeGreaterThanOrEqual(3);
    expect(shots.length).toBe(want);
    const targets = new Set(shots.map((s) => s.target));
    expect(targets.size, `目標 ${[...targets]}`).toBe(want);
    for (const t of targets) expect(ids).toContain(t);
  });

  it('飛行 0.15 秒後彼此分開（看得出是好幾顆，不會疊在一起）', () => {
    const { run } = setup(2, 6, 7);
    firstVolley(run);
    for (let i = 0; i < 9; i++) run.step(DT);
    const pr = run.projectiles;
    const pos: [number, number][] = [];
    for (let k = 0; k < pr.capacity; k++) if (pr.alive[k] && pr.gen[k] === 0) pos.push([pr.x[k], pr.z[k]]);
    expect(pos.length).toBeGreaterThanOrEqual(2);
    let minGap = Infinity;
    for (let a = 0; a < pos.length; a++) for (let b = a + 1; b < pos.length; b++) minGap = Math.min(minGap, Math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1]));
    expect(minGap).toBeGreaterThan(0.8);
  });

  it('只有一隻敵人時：N 顆都打牠，但出手方向錯開', () => {
    const { run, ids } = setup(2, 1);
    const shots = firstVolley(run);
    expect(shots.length).toBe(Math.floor(run.volleyExact));
    for (const s of shots) expect(s.target).toBe(ids[0]);
    const angles = new Set(shots.map((s) => Math.atan2(s.vz, s.vx).toFixed(2)));
    expect(angles.size).toBe(shots.length);
  });
});
