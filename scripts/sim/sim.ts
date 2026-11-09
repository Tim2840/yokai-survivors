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
import { TECHS, TECH_OFFER } from '../../src/data/techniques';
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
const ONLY = arg('only', 'random,dps,survive').split(',');
/** --ult infernoLantern|ghostfireDance、--ultLevel 0～5：這一局裝配的大招與局外升級等級（D52；沒給 = 一開始就有的那一招 Lv0） */
const ULT_ID = arg('ult', '');
const ULT_LV = Number(arg('ultLevel', '0'));
/** --summonAt 0.5：機器人在關卡進行到這個比例之後才去開召喚祭壇（D34；越晚頭目越強） */
const SUMMON_AT = Number(arg('summonAt', '0.5'));
const ELEMENTS = arg('elements', 'both'); // on | off | both
const JSON_OUT = arg('json', '');
/** --cast on|off：機器人要不要發動大招（比較大招的影響） */
const CAST = arg('cast', 'on') === 'on';
/** --techs a,b,c：技法面板優先選這幾個（沒給 = 依策略的偏好；random 亂選） */
const TECH_PREF = arg('techs', '');
/** --give a,b：開局直接給這幾個技法；--techMax N：一局最多 N 個（給 2 個再 --techMax 2 = 只測這一對，不會再抽到別的） */
const GIVE = arg('give', '');
const TECH_MAX_ARG = arg('techMax', '');
/** --giveSets N：每局隨機（固定種子）給一組 TECH_MAX 個合法技法，用來全掃「真的一局會拿到的組合」；報告各技法的平均過關率 */
const GIVE_SETS = Number(arg('giveSets', '0'));
/** --mobile：用手機的敵人上限（WAVES.maxEnemiesMobile） */
const MOBILE = process.argv.includes('--mobile');
const TECH_BY_STRATEGY: Record<string, string[]> = {
  dps: ['kitsunebi', 'bounce', 'pillar', 'seed', 'hellfire', 'lamp', 'homing', 'ring', 'ward'],
  survive: ['ring', 'ward', 'lamp', 'hellfire', 'pillar', 'seed', 'kitsunebi', 'bounce', 'homing'],
};
/** --tune countScale=3,hpScale=1.2,xp.needPerLevel=4,w.hpPerWave=0.2,tech.levelGap=2：臨時改旋鈕比較（不改檔案）；xp. 開頭是 PROGRESSION、w. 開頭是 WAVES、tech. 開頭是 TECH_OFFER、chapter. 開頭是 STAGE.chapter（例：chapter.normalStages=3） */
const TUNE = arg('tune', '');
function applyTune(): void {
  // --noTrade：不出狐面商（取捨道具只在狐面商拿得到，D38；對照組）
  if (process.argv.includes('--noTrade')) (ELEMENT_WEIGHTS as Record<string, number>).fox = 0;
  for (const kv of TUNE.split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    if (k.startsWith('chapter.')) (STAGE.chapter as unknown as Record<string, number>)[k.slice(8)] = Number(v);
    else if (k.startsWith('summon.')) (STAGE.summon as unknown as Record<string, number>)[k.slice(7)] = Number(v);
    else if (k.startsWith('drops.')) (STAGE.drops as unknown as Record<string, number>)[k.slice(6)] = Number(v);
    else if (k.startsWith('w.')) (WAVES as unknown as Record<string, number>)[k.slice(2)] = Number(v);
    else if (k.startsWith('tech.')) (TECH_OFFER as unknown as Record<string, number>)[k.slice(5)] = Number(v);
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
  // 道祖神的技法面板：機器人不換（維持現狀）
  if (run.offerKind === 'tech') return Math.max(0, offer.findIndex((o) => o.cardId === 'tech-keep'));
  if (strategy === 'random') return Math.floor(rnd() * offer.length);
  // 寶箱／合魂祠裡的進化卡（D53）：會玩的人一定拿
  const evo = offer.findIndex((o) => o.cardId.startsWith('evo:'));
  if (evo >= 0) return evo;
  const sc = SCORES[strategy];
  let best = 0;
  let bestV = -1;
  const pref = TECH_PREF ? TECH_PREF.split(',') : TECH_BY_STRATEGY[strategy] ?? [];
  offer.forEach((o, i) => {
    let v = (sc[o.cardId] ?? 1) * RARITY_SCORE[o.rarity];
    // 技法卡（D49：機率混在升級卡裡）：會玩的人看到想要的技法幾乎都會拿；已有的下一級也很有價值
    if (o.cardId.startsWith('tech:')) {
      const id = o.cardId.slice(5);
      const rank = pref.indexOf(id);
      v = (run.tech.has(id) ? 3 : rank < 0 ? 2 : 4 - rank * 0.15) * RARITY_SCORE[o.rarity];
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
  casts: number;
  evolved: number;
  variant: string;
  summonedAt: number;
  /** 撿到幾個補給品 */
  pickups: number;
  /** 主武器滿級（8 級）的時間（秒；沒到 = -1）、結束時主武器等級、技法等級總和、場上敵人數（每秒取樣的平均與最大） */
  weaponMaxAt: number;
  weaponLv: number;
  weapon4At: number;
  techLvSum: number;
  aliveAvg: number;
  alivePeak: number;
  /** 死在召喚之後幾秒（沒死或沒召喚 = -1） */
  diedAfterSummon: number;
}

function play(seed: number, strategy: string, useElements: boolean): Result {
  resetTuning();
  applyTune();
  const rnd = lcg(seed * 7919);
  tuning.stageSeconds = SECONDS;
  const run = new Run({ seed, bus: new EventBus(), mapNumber: 1, mobile: MOBILE, ults: ULT_ID ? [ULT_ID] : undefined, ultLevels: ULT_ID ? { [ULT_ID]: ULT_LV } : undefined });
  if (TECH_MAX_ARG) run.tech.max = Number(TECH_MAX_ARG);
  if (GIVE) run.devAddTech(...GIVE.split(','));
  if (GIVE_SETS > 0) {
    // 這一局的技法：用種子隨機排列，依序加進去（跳過互斥的）
    const order = TECHS.map((x) => x.id);
    const r2 = lcg(seed * 104729);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(r2() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const id of order) if (run.tech.owned.length < run.tech.max && run.tech.canOffer(id)) run.devAddTech(id);
  }
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
  let pickups = 0;
  let weaponMaxAt = -1;
  let weapon4At = -1;
  let aliveSum = 0;
  let aliveN = 0;
  let alivePeak = 0;
  let sampleT = 0;
  bus.on('pickup', () => pickups++);
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
      // 合魂祠：技法進化的材料齊了就去進化（亂選的機器人不特別去）
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
    if (weapon4At < 0 && run.weaponLevel >= 4) weapon4At = totalTime + run.time;
    if (weaponMaxAt < 0 && run.weaponMaxed) weaponMaxAt = totalTime + run.time;
    sampleT += DT;
    if (sampleT >= 1) {
      sampleT -= 1;
      aliveSum += run.enemies.aliveCount;
      aliveN++;
      alivePeak = Math.max(alivePeak, run.enemies.aliveCount);
    }
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
    variant: run.tech.owned.join('+') || '-',
    casts,
    evolved: run.tech.evolved.length,
    summonedAt,
    pickups,
    weaponMaxAt,
    weapon4At,
    weaponLv: run.weaponLevel,
    techLvSum: run.tech.levels.reduce((a, b) => a + b, 0),
    aliveAvg: aliveN ? aliveSum / aliveN : 0,
    alivePeak,
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
  const sc = SCORES[strategy];
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
    `大招 ${ULT_ID || '預設'} Lv${ULT_LV}、發動 ${avg(rs.map((r) => r.casts)).toFixed(1)} 次、技法進化 ${avg(rs.map((r) => r.evolved)).toFixed(2)} 次`,
    `技法平均 ${avg(rs.map((r) => (r.variant === '-' ? 0 : r.variant.split('+').length))).toFixed(1)} 個（${[...new Set(rs.map((r) => r.variant))].slice(0, 4).join('/')}…）`,
    `補給品 ${avg(rs.map((r) => r.pickups)).toFixed(1)} 個`,
    `主武器 4 級中位第 ${pct(rs.filter((r) => r.weapon4At >= 0).map((r) => r.weapon4At), 50)?.toFixed(0) ?? '-'} 秒、滿級 ${((rs.filter((r) => r.weaponMaxAt >= 0).length / rs.length) * 100).toFixed(0)}%（中位第 ${pct(rs.filter((r) => r.weaponMaxAt >= 0).map((r) => r.weaponMaxAt), 50)?.toFixed(0) ?? '-'} 秒）、結束時平均 ${avg(rs.map((r) => r.weaponLv)).toFixed(1)} 級`,
    `技法等級合計 ${avg(rs.map((r) => r.techLvSum)).toFixed(1)}`,
    `場上敵人 平均 ${avg(rs.map((r) => r.aliveAvg)).toFixed(0)}、最多 ${avg(rs.map((r) => r.alivePeak)).toFixed(0)}`,
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

if (GIVE_SETS > 0) {
  // 各技法的平均過關率（每個技法出現在大約 1/3 的組合裡）：差距太大就是某個技法太強／太弱
  const by: Record<string, { n: number; clear: number; surv: number }> = {};
  for (const r of all) {
    for (const id of r.variant.split('+')) {
      const e = (by[id] ??= { n: 0, clear: 0, surv: 0 });
      e.n++;
      e.clear += r.stagesCleared >= Math.min(STAGES, 99) ? 1 : 0;
      e.surv += r.survived;
    }
  }
  console.log('\n各技法（出現在哪些局，就用那些局的結果平均）：\n');
  for (const [id, e] of Object.entries(by).sort((a, b) => b[1].clear / b[1].n - a[1].clear / a[1].n)) console.log(`- ${id}：${e.n} 局，過關 ${((e.clear / e.n) * 100).toFixed(0)}%，平均存活 ${(e.surv / e.n).toFixed(0)} 秒`);
}

// 註：不輸出「拿某張卡的局 vs 沒拿的局」的比較——活得久的局本來就拿到更多卡（存活者偏誤），會誤導；單張卡的價值用 tests/unit/card-dps-probe.test.ts。

console.log(`\n（耗時 ${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(all, null, 1));
