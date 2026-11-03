import { WAVES } from './waves';

/**
 * 可調的旋鈕（D18：敵人數量先做成可調）。預設值取自資料表；只有開發模式與測試頁會用網址參數覆寫
 * （?count=2.5&hp=0.6&dmg=2），主網址不吃。程式讀這個物件，不直接讀 WAVES 的數量與 HP 倍率。
 */
/**
 * M1 試玩預設（G1 用手感決定）：不是 docs/02 的數字。依據：2026-11-03 無頭機器人探針（tests/unit/m1-balance-probe.test.ts，
 * 5 個種子）——照 docs 原值（數量 ×1、單發）機器人只撐到第 4～5 波；數量 ×2.5、一次 3 顆、濺射 1.2 公尺 → 平均第 15 波、約 1,600 擊殺；
 * 再強（4 顆、1.5 公尺、傷害 ×1.5）5 局全通關。M2 有小妖與 sim 之後移除，改回資料表。
 */
export const M1_PLAYTEST = { countScale: 2.5, hpScale: WAVES.hpScale as number, damageScale: 1, volley: 3, splash: 1.2 };

export const tuning = {
  /** 敵人數量倍率（見 WAVES.countScale） */
  countScale: M1_PLAYTEST.countScale as number,
  /** 單隻敵人 HP 倍率 */
  hpScale: M1_PLAYTEST.hpScale as number,
  /** 玩家輸出傷害倍率（M1 試玩手感用；sim 之後移除，見 docs/02 第 8 節警告） */
  damageScale: M1_PLAYTEST.damageScale as number,
  /** 領頭武器一次發幾顆／濺射半徑（公尺）；0 = 用 yokai.ts 的原值。M1 沒有小妖，領頭火力不夠，試玩用 */
  volley: M1_PLAYTEST.volley as number,
  splash: M1_PLAYTEST.splash as number,
};

const STORE_KEY = 'yokai-survivors-tuning';

/** 測試頁的調整面板：存在這個瀏覽器（Artifact 網址不能帶查詢參數，所以不能靠 ?count=）。壞資料、讀不到就用預設 */
export function loadTuning(): void {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const o = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(M1_PLAYTEST) as (keyof typeof M1_PLAYTEST)[]) {
      const v = o[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) tuning[k] = v;
    }
  } catch {
    /* 讀不到就用預設 */
  }
}

export function saveTuning(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(tuning));
  } catch {
    /* 存不了也沒關係 */
  }
}

/** 測試用：恢復預設 */
export function resetTuning(): void {
  Object.assign(tuning, M1_PLAYTEST);
}

export function applyTuningFromQuery(search: string): void {
  const q = new URLSearchParams(search);
  const num = (k: string): number | null => {
    const v = q.get(k);
    if (v === null || !/^\d+(\.\d+)?$/.test(v)) return null;
    const n = Number(v);
    return n > 0 && n <= 100 ? n : null;
  };
  const c = num('count');
  const h = num('hp');
  const d = num('dmg');
  const v = num('volley');
  const sp = num('splash');
  if (c !== null) tuning.countScale = c;
  if (h !== null) tuning.hpScale = h;
  if (d !== null) tuning.damageScale = d;
  if (v !== null) tuning.volley = Math.floor(v);
  if (sp !== null) tuning.splash = sp;
}
