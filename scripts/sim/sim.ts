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
import { ultHints } from '../../src/data/ultimates';
import { PROGRESSION } from '../../src/data/progression';
import { WAVES } from '../../src/data/waves';
import { STAGE } from '../../src/data/stage';
import { ELEMENT_WEIGHTS } from '../../src/data/elements';
import type { TerrainMap } from '../../src/world/terrainMap';

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
const ONLY = arg('only', 'random,dps,survive,ult').split(',');
/** --summonAt 0.5：機器人在關卡進行到這個比例之後才去開召喚祭壇（D34；越晚頭目越強） */
const SUMMON_AT = Number(arg('summonAt', '0.5'));
const ELEMENTS = arg('elements', 'both'); // on | off | both
const JSON_OUT = arg('json', '');
/** --cast on|off：機器人要不要發動大招（比較大招的影響） */
const CAST = arg('cast', 'on') === 'on';
/** --variant kitsunebi|lanternRing|hellfire|auto：主武器到變化等級時選哪一種（auto = 依策略：dps 分裂、survive 燈籠環、ult 業火、random 亂選） */
const VARIANT = arg('variant', 'auto');
const VARIANT_BY_STRATEGY: Record<string, string> = { dps: 'kitsunebi', survive: 'lanternRing', ult: 'hellfire' };
/** --tune countScale=3,hpScale=1.2,xp.needPerLevel=4,w.hpPerWave=0.2：臨時改旋鈕比較（不改檔案）；xp. 開頭是 PROGRESSION、w. 開頭是 WAVES */
const TUNE = arg('tune', '');
function applyTune(): void {
  // --noTrade：不出狐面商（取捨道具只在狐面商拿得到，D38；對照組）
  if (process.argv.includes('--noTrade')) (ELEMENT_WEIGHTS as Record<string, number>).fox = 0;
  for (const kv of TUNE.split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    if (k.startsWith('summon.')) (STAGE.summon as unknown as Record<string, number>)[k.slice(7)] = Number(v);
    else if (k.startsWith('drops.')) (STAGE.drops as unknown as Record<string, number>)[k.slice(6)] = Number(v);
    else if (k.startsWith('w.')) (WAVES as unknown as Record<string, number>)[k.slice(2)] = Number(v);
    else if (k.startsWith('xp.')) (PROGRESSION as unknown as Record<string, number>)[k.slice(3)] = Number(v);
    else (tuning as unknown as Record<string, number>)[k] = Number(v);
  }
}

// ── 選卡策略：每張卡的分數（越高越想拿）；random 不看分數 ──
const SCORES: Record<string, Record<string, number>> = {
  dps: { ghostfire: 3.4, heal: 0.2, meritBag: 0.1, cursedBlade: 2.6, wildLantern: 2.6, diamondBody: 0.6, volley: 3, splash: 2.6, pierce: 2.2, power: 2.4, atkSpeed: 2.4, area: 1.6, hp: 1, speed: 0.6, armor: 0.8, regen: 0.6, dodge: 0.6 },
  // 防禦優先但不放棄輸出（純防禦沒有輸出就殺不掉敵人、升級也慢，哪個類型的遊戲都玩不下去）
  survive: { ghostfire: 2.8, heal: 0.4, meritBag: 0.1, diamondBody: 2.6, cursedBlade: 0.5, wildLantern: 0.8, hp: 3, armor: 3, regen: 2.8, dodge: 2.4, volley: 2.6, splash: 2.4, pierce: 1.6, speed: 1.5, area: 1.4, atkSpeed: 1, power: 1 },
};
const RARITY_SCORE: Record<string, number> = { common: 1, rare: 1.6, epic: 2.4, legend: 3.5 };

function choose(run: Run, strategy: string, rnd: () => number): number {
  const offer = run.offer!;
  if (run.offerKind === 'variant') {
    const want = VARIANT === 'auto' ? VARIANT_BY_STRATEGY[strategy] : VARIANT;
    const i = offer.findIndex((o) => o.cardId === 'variant:' + want);
    return i >= 0 ? i : Math.floor(rnd() * offer.length);
  }
  if (strategy === 'random') return Math.floor(rnd() * offer.length);
  // 寶箱裡的融合卡（D30 第二步）：會玩的人一定拿
  const fuse = offer.findIndex((o) => o.cardId.startsWith('ult:'));
  if (fuse >= 0) return fuse;
  const sc = SCORES[strategy === 'ult' ? 'dps' : strategy];
  let best = 0;
  let bestV = -1;
  offer.forEach((o, i) => {
    let v = (sc[o.cardId] ?? 1) * RARITY_SCORE[o.rarity];
    // 「ult」策略：追大招配方——這張卡是還沒融合的大招的材料就加分，選了就融合加更多
    if (strategy === 'ult') {
      for (const h of ultHints(o.cardId, run.yokai.id, run.cardCounts, run.fused)) v += h.completes ? 12 : h.have < h.need ? 3 : 0;
    }
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
  fused: number;
  casts: number;
  variant: string;
  summonedAt: number;
  /** 第一個聯動到「初」「極」的時間（秒；沒到 = -1） */
  /** 撿到幾個補給品 */
  pickups: number;
  synT1: number;
  synT2: number;
  /** 死在召喚之後幾秒（沒死或沒召喚 = -1） */
  diedAfterSummon: number;
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
  let casts = 0;
  let summonedAt = -1;
  let synT1 = -1;
  let pickups = 0;
  bus.on('pickup', () => pickups++);
  let synT2 = -1;
  bus.on('synergy', (e) => {
    if (e.tier >= 1 && synT1 < 0) synT1 = totalTime + run.time;
    if (e.tier >= 2 && synT2 < 0) synT2 = totalTime + run.time;
  });
  bus.on('summonBoss', () => { if (summonedAt < 0) summonedAt = run.time; });
  const scratch = new Int32Array(512);
  while (run.phase !== 'ended' && guard++ < 5e7) {
    // 結果卡（D36）：機器人看完就關
    if (run.elementResult) {
      run.dismissResult();
      continue;
    }
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
    const altar = run.elements.summonSlot;
    const chest = nearestChest(run);
    if (chest) {
      // 寶箱（小頭目、精英掉的，或地圖上的）：先開再走
      [mx, mz] = steer(run, chest.x, chest.z);
    } else if (run.elements.fuseSlot && run.elements.fuseSlot.announce <= 0 && strategy !== 'random') {
      // 合魂祠：大招材料齊了就去融合（亂選的機器人不特別去）
      const f = run.elements.fuseSlot;
      [mx, mz] = steer(run, f.x, f.z);
    } else if (run.portal.active) {
      [mx, mz] = steer(run, run.portal.x, run.portal.z);
    } else if (altar && altar.announce <= 0 && run.time >= SUMMON_AT * run.director.duration) {
      // 召喚祭壇：時間到了就去開（站上去按住）
      [mx, mz] = steer(run, altar.x, altar.z);
      if (summonedAt < 0 && run.director.bossSpawned) summonedAt = run.time;
    } else if (n >= 0) {
      const dx = run.px - e.x[n];
      const dz = run.pz - e.z[n];
      const d = Math.hypot(dx, dz) || 1;
      mx = dx / d + Math.cos(t) * 0.4;
      mz = dz / d + Math.sin(t) * 0.4;
    } else {
      // 附近沒有敵人：12 公尺內有補給品就去撿（D39），其次想用要素就走過去（站著按住），否則繞圈
      const target = nearestPickup(run, 12) ?? (useElements ? nearestElement(run, strategy) : null);
      if (target) {
        [mx, mz] = steer(run, target.x, target.z);
      } else {
        mx = Math.cos(t * 0.5);
        mz = Math.sin(t * 0.5);
      }
    }
    run.setMove(mx, mz);
    // 大招：量表滿了、附近敵人多（或頭目在場）才發動
    if (CAST && run.ultReady && (n >= 0 && run.enemies.within(run.px, run.pz, 7, scratch) >= 12 || (run.director.bossIndex >= 0 && run.enemies.alive[run.director.bossIndex] === 1))) {
      run.castUltimate();
      casts++;
    }
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
    fused: run.fused.length,
    variant: run.variant?.id ?? '-',
    casts,
    summonedAt,
    pickups,
    synT1,
    synT2,
    diedAfterSummon: run.phase === 'ended' && run.result === 'death' && summonedAt >= 0 && run.director.bossSpawned ? run.time - summonedAt : -1,
    curseTotal: run.curse.enemyHp + run.curse.enemySpeed + run.curse.enemyDamage + run.curse.spawnRate,
  };
}

/** 40 公尺內還沒開的寶箱 */
// ── 尋路：目標不在直線上走得到時（岩石、深水擋住），用細格 BFS 找路（真人會繞過去，機器人以前只會直走而卡住） ──
let pathMap: TerrainMap | null = null;
let par: Int32Array = new Int32Array(0);
let que: Int32Array = new Int32Array(0);
const pathCache = { at: -1, tx: NaN, tz: NaN, dx: 0, dz: 0 };
function steer(run: Run, tx: number, tz: number): [number, number] {
  const dx0 = tx - run.px;
  const dz0 = tz - run.pz;
  const d0 = Math.hypot(dx0, dz0);
  if (d0 < 0.6) return [0, 0];
  if (pathCache.at >= 0 && run.clock - pathCache.at < 0.25 && pathCache.tx === tx && pathCache.tz === tz) return [pathCache.dx, pathCache.dz];
  const m = run.map;
  if (pathMap !== m) {
    pathMap = m;
    par = new Int32Array(m.cols * m.rows);
    que = new Int32Array(m.cols * m.rows);
  }
  par.fill(-2);
  const start = m.cellIndex(run.px, run.pz);
  const goal = m.cellIndex(tx, tz);
  const cx = (i: number) => m.minX + ((i % m.cols) + 0.5) * m.cell;
  const cz = (i: number) => m.minZ + (Math.floor(i / m.cols) + 0.5) * m.cell;
  let h = 0;
  let tl = 0;
  par[start] = -1;
  que[tl++] = start;
  while (h < tl && par[goal] === -2) {
    const i = que[h++];
    const x = i % m.cols;
    const z = (i - x) / m.cols;
    for (let k = 0; k < 8; k++) {
      const nx = x + [1, -1, 0, 0, 1, 1, -1, -1][k];
      const nz = z + [0, 0, 1, -1, 1, -1, 1, -1][k];
      if (nx < 0 || nz < 0 || nx >= m.cols || nz >= m.rows) continue;
      const j = nz * m.cols + nx;
      if (par[j] !== -2 || m.stepBlocked(cx(i), cz(i), cx(j), cz(j))) continue;
      par[j] = i;
      que[tl++] = j;
    }
  }
  let dx = dx0;
  let dz = dz0;
  if (par[goal] !== -2) {
    // 往回追到「從起點看出去 3 格」的那一格當方向
    const chain: number[] = [];
    for (let c = goal; c !== -1 && c !== start; c = par[c]) chain.push(c);
    const nxt = chain[Math.max(0, chain.length - 3)] ?? goal;
    dx = cx(nxt) - run.px;
    dz = cz(nxt) - run.pz;
  }
  Object.assign(pathCache, { at: run.clock, tx, tz, dx, dz });
  return [dx, dz];
}

function nearestChest(run: Run): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null;
  let bd = 40;
  for (const s of run.elements.slots) {
    if (!s.active || s.kind !== 'chest' || s.usedAge >= 0 || s.announce > 0) continue;
    const d = Math.hypot(s.x - run.px, s.z - run.pz);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

/** within 公尺內最近的補給品 */
function nearestPickup(run: Run, within: number): { x: number; z: number } | null {
  const p = run.pickups;
  let best: { x: number; z: number } | null = null;
  let bd = within;
  for (let i = 0; i < p.capacity; i++) {
    if (!p.alive[i]) continue;
    const d = Math.hypot(p.x[i] - run.px, p.z[i] - run.pz);
    if (d < bd) {
      bd = d;
      best = { x: p.x[i], z: p.z[i] };
    }
  }
  return best;
}

function nearestElement(run: Run, strategy: string): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null;
  let bd = 40;
  for (const s of run.elements.slots) {
    if (!s.active || s.usedAge >= 0 || s.announce > 0 || s.blocked) continue;
    if (s.kind === 'summon') continue; // 召喚祭壇由 --summonAt 控制什麼時候去
    if (s.kind === 'barrier') continue; // 結界石要站在圈內戰鬥，機器人不會這樣玩；單獨看
    let tx = s.x;
    let tz = s.z;
    if (s.kind === 'fox') {
      // 狐面商（D38）：依策略挑一個圈（亂選：看位置決定），收不下或不想要就不去
      const k = foxChoice(run, s.offers, s.ringBlocked, strategy, s.x + s.z);
      if (k < 0) continue;
      tx = s.ringX[k];
      tz = s.ringZ[k];
    }
    const d = Math.hypot(tx - run.px, tz - run.pz);
    if (d < bd) {
      bd = d;
      best = { x: tx, z: tz };
    }
  }
  return best;
}

/** 機器人在狐面商選哪個圈：分數表裡最想要的；分數太低（不合策略）就不拿；-1 = 不去 */
function foxChoice(run: Run, offers: readonly string[], blocked: readonly boolean[], strategy: string, salt: number): number {
  const ok = offers.map((_, k) => k).filter((k) => !blocked[k]);
  if (ok.length === 0) return -1;
  if (strategy === 'random') return ok[Math.abs(Math.floor(salt * 7)) % ok.length];
  const sc = SCORES[strategy === 'ult' ? 'dps' : strategy];
  let best = -1;
  let bv = 1.5;
  for (const k of ok) {
    const v = sc[offers[k]] ?? 1;
    if (v > bv) {
      bv = v;
      best = k;
    }
  }
  void run;
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
    `融合大招 ${avg(rs.map((r) => r.fused)).toFixed(1)} 個、發動 ${avg(rs.map((r) => r.casts)).toFixed(1)} 次`,
    `變化 ${[...new Set(rs.map((r) => r.variant))].join('/')}`,
    `補給品 ${avg(rs.map((r) => r.pickups)).toFixed(1)} 個`,
    `聯動初 ${((rs.filter((r) => r.synT1 >= 0).length / rs.length) * 100).toFixed(0)}%（中位第 ${pct(rs.filter((r) => r.synT1 >= 0).map((r) => r.synT1), 50)?.toFixed(0) ?? '-'} 秒）、極 ${((rs.filter((r) => r.synT2 >= 0).length / rs.length) * 100).toFixed(0)}%（中位第 ${pct(rs.filter((r) => r.synT2 >= 0).map((r) => r.synT2), 50)?.toFixed(0) ?? '-'} 秒）`,
    `死在召喚後 ${rs.filter((r) => r.diedAfterSummon >= 0).length} 局（中位 ${pct(rs.filter((r) => r.diedAfterSummon >= 0).map((r) => r.diedAfterSummon), 50)?.toFixed(0) ?? '-'} 秒）`,
    `召喚頭目 ${((rs.filter((r) => r.summonedAt >= 0).length / rs.length) * 100).toFixed(0)}%（平均第 ${avg(rs.filter((r) => r.summonedAt >= 0).map((r) => r.summonedAt)).toFixed(0)} 秒）`,
  ].join('；');
}

// ── 主程式 ──
const all: Result[] = [];
const modes = ELEMENTS === 'both' ? [false, true] : [ELEMENTS === 'on'];
const t0 = Date.now();
console.log(`# 平衡模擬 v1（召喚祭壇：${SUMMON_AT * 100}% 之後去開）\n\n參數：${RUNS} 局／組合、關卡 ${SECONDS} 秒、${STAGES} 關、種子 ${SEED0}…${SEED0 + RUNS - 1}；機器人（風箏＋選卡策略＋可選去用要素）。數量×${tuning.countScale}、鬼火起步 ${tuning.volley} 顆。${TUNE ? ' 臨時旋鈕：' + TUNE : ''}\n`);
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
