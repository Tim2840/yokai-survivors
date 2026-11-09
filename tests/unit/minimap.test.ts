import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { ELEMENT_KINDS } from '../../src/data/elements';
import { ELEMENT_MARKERS, MINIMAP } from '../../src/data/minimap';
import { palette } from '../../src/art/palette';
import { collectMarkers, markers } from '../../src/game/minimapMarkers';
import { worldToMap } from '../../src/ui/minimap';
import { kindIndex } from '../../src/systems/enemies';

/** 小地圖（D66，docs/21） */
afterEach(() => resetTuning());
function make(seed = 3): Run {
  tuning.stageSeconds = 600;
  const run = new Run({ seed, bus: new EventBus() });
  run.god = true;
  run.director.active = false;
  return run;
}

describe('小地圖資料', () => {
  it('全掃：每一種地圖要素都有符號；形狀＋功能色的組合不重複（色盲也分得出來）；功能色都在色票裡', () => {
    const seen = new Set<string>();
    for (const k of ELEMENT_KINDS) {
      const st = ELEMENT_MARKERS[k];
      expect(st, `${k} 沒有小地圖符號`).toBeTruthy();
      expect((palette.minimap as Record<string, string>)[st.group], `${k} 的色組 ${st.group} 不在色票`).toBeTruthy();
      const key = `${st.shape}/${st.group}`;
      expect(seen.has(key), `${k} 的符號和別種要素重複：${key}`).toBe(false);
      seen.add(key);
    }
  });
  it('尺寸：直式＜桌面、放大倍率 > 1、更新頻率大於 0', () => {
    expect(MINIMAP.size.portrait).toBeLessThan(MINIMAP.size.desktop);
    expect(MINIMAP.bigScale).toBeGreaterThan(1);
    expect(MINIMAP.hz).toBeGreaterThan(0);
  });
});

describe('座標轉換', () => {
  const map = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
  it('北在上：−z 在上、+x 在右；地圖四角對到小地圖四角；中心在中央', () => {
    expect(worldToMap(map, 0, 0, 100)).toEqual({ px: 50, py: 50 });
    expect(worldToMap(map, -60, -60, 100)).toEqual({ px: 0, py: 0 });
    expect(worldToMap(map, 60, 60, 100)).toEqual({ px: 100, py: 100 });
    expect(worldToMap(map, 30, -30, 100).px).toBeGreaterThan(50);
    expect(worldToMap(map, 30, -30, 100).py).toBeLessThan(50);
  });
  it('不寫死 120：不同大小的地圖一樣對得上', () => {
    expect(worldToMap({ minX: -100, maxX: 100, minZ: -50, maxZ: 50 }, 0, 0, 80)).toEqual({ px: 40, py: 40 });
  });
});

describe('標記清單', () => {
  it('地圖要素預告結束才出現、用掉就消失；符號和資料一致', () => {
    const run = make(5);
    const base = collectMarkers(run);
    const s = run.elements.devForce('jizo', 'common', run.px + 5, run.pz)!;
    s.announce = 2;
    expect(collectMarkers(run), '預告中不該出現').toBe(base);
    s.announce = 0;
    expect(collectMarkers(run)).toBe(base + 1);
    const m = markers.slice(0, base + 1).find((x) => Math.abs(x.x - s.x) < 1e-6 && Math.abs(x.z - s.z) < 1e-6)!;
    expect(m.shape).toBe(ELEMENT_MARKERS.jizo.shape);
    expect(m.group).toBe(ELEMENT_MARKERS.jizo.group);
    s.usedAge = 0.1;
    expect(collectMarkers(run), '用掉之後該消失').toBe(base);
  });
  it('全掃：每一種要素強制生出來之後，都會出現在小地圖上（沒有漏的種類）', () => {
    for (const k of ELEMENT_KINDS) {
      const run = make(7);
      const before = collectMarkers(run);
      const s = run.elements.devForce(k, 'common', run.px + 6, run.pz + 2);
      if (!s) continue;
      s.announce = 0;
      expect(collectMarkers(run), `${k} 沒有出現在小地圖`).toBeGreaterThan(before);
    }
  });
  it('一般敵人不畫；精英畫；頭目畫；傳送門畫', () => {
    const run = make(9);
    const none = collectMarkers(run);
    for (let i = 0; i < 20; i++) run.enemies.spawn(kindIndex('villager'), run.px + 8 + i * 0.3, run.pz, 1, 0, 0);
    expect(collectMarkers(run), '一般敵人不該畫').toBe(none);
    run.enemies.spawn(kindIndex('villager'), run.px + 9, run.pz + 3, 1, 0, 0, 1);
    expect(collectMarkers(run), '精英要畫').toBe(none + 1);
    const b = run.enemies.spawn(kindIndex('villager'), run.px + 12, run.pz - 3, 1, 0, 0, 2);
    run.director.bossIndex = b;
    expect(collectMarkers(run), '頭目要畫').toBe(none + 2);
    run.portal.active = true;
    expect(collectMarkers(run), '傳送門要畫').toBe(none + 3);
  });
});
