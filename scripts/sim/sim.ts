/**
 * 平衡模擬 v1（docs/07 第 4 節）：無頭跑真正的 `Run`（和遊戲同一份邏輯），用簡單的機器人玩很多局，
 * 輸出存活時間、過關率、擊殺、等級的分佈，以及不同選卡策略、有沒有去用地圖要素的差別。
 *
 * 用法：npm run sim -- [--runs 24] [--seconds 600] [--stages 1] [--seeds 1] [--only random,dps] [--elements both] [--json out.json]
 *
 * 限制（要誠實）：機器人只會「風箏＋選分數最高的卡＋走去用要素」，比真人笨；結果看「相對差異」比看絕對值可靠。
 * 模擬器不能取代真人試玩（docs/07 第 4 節）。
 */
import { writeFileSync } from 'node:fs';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { resetTuning, tuning } from '../../src/data/tuning';
import { PROGRESSION } from '../../src/data/progression';
import { WAVES } from '../../src/data/waves';

const DT = 1 / 60;

// ── 參數 ──
const argv = process.argv.slice(2);
const arg = (name: string, def: string): string => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const RUNS = Number(arg('runs', '24'));
const SECONDS = Number(arg('seconds', '600'));
const STAGES = Number(arg('stages', '1'));
const SEED0 = Number(arg('seeds', '1'));
const ONLY = arg('only', 'random,dps,survive').split(',');
const ELEMENTS = arg('elements', 'both'); // on | off | both
const JSON_OUT = arg('json', '');
/** --tune countScale=3,hpScale=1.2,xp.needPerLevel=4,w.hpPerWave=0.2：臨時改旋鈕比較（不改檔案）；xp. 開頭是 PROGRESSION、w. 開頭是 WAVES */
const TUNE = arg('tune', '');
function applyTune(): void {
  for (const kv of TUNE.split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    if (k.startsWith('w.')) (WAVES as unknown as Record<string, number>)[k.slice(2)] = Number(v);
    else if (k.startsWith('xp.')) (PROGRESSION as unknown as Record<string, number>)[k.slice(3)] = Number(v);
    else (tuning as unknown as Record<string, number>)[k] = Number(v);
  }
}

// ── 選卡策略：每張卡的分數（越高越想拿）；random 不看分數 ──
const SCORES: Record<string, Record<string, number>> = {
  dps: { volley: 3, splash: 2.6, pierce: 2.2, power: 2.4, atkSpeed: 2.4, area: 1.6, hp: 1, speed: 0.6 },
  survive: { hp: 3, speed: 2.4, area: 1.8, atkSpeed: 1.4, power: 1.2, volley: 1, splash: 1, pierce: 0.8 },
};
const RARITY_SCORE: Record<string, number> = { common: 1, rare: 1.6, epic: 2.4, legend: 3.5 };

function choose(run: Run, strategy: string, rnd: () => number): number {
  const offer = run.offer!;
  if (strategy === 'random') return Math.floor(rnd() * offer.length);
  const sc = SCORES[strategy];
  let best = 0;
  let bestV = -1;
  offer.forEach((o, i) => {
    const v = (sc[o.cardId] ?? 1) * RARITY_SCORE[o.rarity];
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  });
  return best;
}

/** 簡單的確定性亂數（只給「random」策略用，不影響遊戲本身的 Rng） */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

interface Result {
  seed: number;
  strategy: string;
  elements: boolean;
  /** 活了幾秒（所有關卡累計，打到最後算滿） */
  survived: number;
  stagesCleared: number;
  bossSeen: boolean;
  bossKilled: boolean;
  kills: number;
  level: number;
  elementsUsed: number;
  cards: Record<string, number>;
  curseTotal: number;
}

function play(seed: number, strategy: string, useElements: boolean): Result {
  resetTuning();
  applyTune();
  const rnd = lcg(seed * 7919);
  tuning.stageSeconds = SECONDS;
  const run = new Run({ seed, bus: new EventBus(), mapNumber: 1 });
  // 要測的關卡數：STAGES 關（超過一般地圖的關數就以地圖為準）
  let used = 0;
  const bus = (run as unknown as { bus: EventBus }).bus;
  bus.on('elementUsed', () => used++);
  let t = 0;
  let totalTime = 0;
  let cleared = 0;
  let bossSeen = false;
  const cards: Record<string, number> = {};
  const maxStage = Math.min(STAGES, run.stageCount);
  let guard = 0;
  while (run.phase !== 'ended' && guard++ < 5e7) {
    if (run.awaitingPick) {
      const i = choose(run, strategy, rnd);
      const c = run.offer![i].cardId;
      cards[c] = (cards[c] ?? 0) + 1;
      run.chooseCard(i);
      continue;
    }
    if (run.phase === 'intermission') {
      cleared++;
      totalTime += run.time;
      if (cleared >= maxStage) break;
      run.continueFromIntermission();
      continue;
    }
    const e = run.enemies;
    const n = e.nearest(run.px, run.pz, 5);
    let mx: number;
    let mz: number;
    if (run.portal.active) {
      mx = run.portal.x - run.px;
      mz = run.portal.z - run.pz;
    } else if (n >= 0) {
      const dx = run.px - e.x[n];
      const dz = run.pz - e.z[n];
      const d = Math.hypot(dx, dz) || 1;
      mx = dx / d + Math.cos(t) * 0.4;
      mz = dz / d + Math.sin(t) * 0.4;
    } else {
      // 附近沒有敵人：想用要素就走過去（站著按住），否則繞圈
      const target = useElements ? nearestElement(run) : null;
      if (target) {
        const dx = target.x - run.px;
        const dz = target.z - run.pz;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) {
          mx = 0;
          mz = 0;
        } else {
          mx = dx;
          mz = dz;
        }
      } else {
        mx = Math.cos(t * 0.5);
        mz = Math.sin(t * 0.5);
      }
    }
    run.setMove(mx, mz);
    if (run.director.bossIndex >= 0) bossSeen = true;
    run.step(DT);
    t += DT;
    if (run.time > SECONDS + 150) break;
  }
  if (run.phase === 'ended' && run.result === 'victory') {
    cleared = maxStage;
  }
  // 走進傳送門過關時，這一關的時間已經加進 totalTime；其餘（死亡、時間到）才要加上目前這關的時間
  const survived = run.phase === 'intermission' ? totalTime : totalTime + run.time;
  return {
    seed,
    strategy,
    elements: useElements,
    survived,
    stagesCleared: cleared,
    bossSeen: bossSeen || run.bossesDefeated > 0,
    bossKilled: run.bossesDefeated > 0,
    kills: run.kills,
    level: run.level,
    elementsUsed: used,
    cards,
    curseTotal: run.curse.enemyHp + run.curse.enemySpeed + run.curse.enemyDamage + run.curse.spawnRate,
  };
}

function nearestElement(run: Run): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null;
  let bd = 40;
  for (const s of run.elements.slots) {
    if (!s.active || s.usedAge >= 0 || s.announce > 0 || s.blocked) continue;
    if (s.kind === 'barrier') continue; // 結界石要站在圈內戰鬥，機器人不會這樣玩；單獨看
    const d = Math.hypot(s.x - run.px, s.z - run.pz);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

const pct = (a: number[], p: number): number => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const avg = (a: number[]): number => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

function summarize(rs: Result[]): string {
  const surv = rs.map((r) => r.survived);
  const clear = rs.filter((r) => r.stagesCleared >= Math.min(STAGES, 99)).length / rs.length;
  return [
    `存活 P10/P50/P90 ${pct(surv, 10).toFixed(0)}/${pct(surv, 50).toFixed(0)}/${pct(surv, 90).toFixed(0)} 秒`,
    `過關 ${(clear * 100).toFixed(0)}%`,
    `見頭目 ${((rs.filter((r) => r.bossSeen).length / rs.length) * 100).toFixed(0)}%`,
    `打倒頭目 ${((rs.filter((r) => r.bossKilled).length / rs.length) * 100).toFixed(0)}%`,
    `擊殺 ${avg(rs.map((r) => r.kills)).toFixed(0)}`,
    `等級 ${avg(rs.map((r) => r.level)).toFixed(1)}`,
    `用掉要素 ${avg(rs.map((r) => r.elementsUsed)).toFixed(1)}`,
  ].join('；');
}

// ── 主程式 ──
const all: Result[] = [];
const modes = ELEMENTS === 'both' ? [false, true] : [ELEMENTS === 'on'];
const t0 = Date.now();
console.log(`# 平衡模擬 v1\n\n參數：${RUNS} 局／組合、關卡 ${SECONDS} 秒、${STAGES} 關、種子 ${SEED0}…${SEED0 + RUNS - 1}；機器人（風箏＋選卡策略＋可選去用要素）。數量×${tuning.countScale}、鬼火起步 ${tuning.volley} 顆。${TUNE ? ' 臨時旋鈕：' + TUNE : ''}\n`);
for (const strategy of ONLY) {
  for (const useEl of modes) {
    const rs: Result[] = [];
    for (let i = 0; i < RUNS; i++) rs.push(play(SEED0 + i, strategy, useEl));
    all.push(...rs);
    console.log(`- **${strategy}／${useEl ? '用要素' : '不理要素'}**：${summarize(rs)}`);
  }
}

// 註：不輸出「拿某張卡的局 vs 沒拿的局」的比較——活得久的局本來就拿到更多卡（存活者偏誤），會誤導；單張卡的價值用 tests/unit/card-dps-probe.test.ts。

console.log(`\n（耗時 ${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(all, null, 1));
