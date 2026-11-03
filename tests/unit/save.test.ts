import { describe, expect, it, vi } from 'vitest';
import { storage } from './setup';
import { bus } from '../../src/core/bus';
import { SAVE_KEY, defaultSave, loadSave, merge, resetSaveWarning, writeSave } from '../../src/core/save';

describe('存檔', () => {
  it('沒有存檔 → 預設值；三隻初始妖怪已解鎖', () => {
    const s = loadSave();
    expect(s).toEqual(defaultSave());
    expect(s.unlocked.yokai).toEqual(['chochin-kozo', 'kappa', 'aka-oni']);
  });

  it('存 → 讀 → 還在（每個欄位都改過一次）', () => {
    const s = defaultSave();
    s.merit = 123;
    s.training = { hp: 3 };
    s.unlocked.cards.push('regen');
    s.codex.humans.villager = 42;
    s.maxNightDepth = 2;
    s.settings.quality = 'low';
    s.stats.runs = 7;
    s.seenContentVersion = 1;
    expect(writeSave(s)).toBe(true);
    expect(loadSave()).toEqual(s);
  });

  it('舊存檔少了新欄位 → 自動補預設；多餘的未知欄位丟掉', () => {
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, merit: 50, junk: true, settings: { sfx: 0.1 } }));
    const s = loadSave();
    expect(s.merit).toBe(50);
    expect(s.settings.sfx).toBe(0.1);
    expect(s.settings.music).toBe(defaultSave().settings.music);
    expect(s.unlocked.yokai.length).toBe(3);
    expect((s as unknown as Record<string, unknown>).junk).toBeUndefined();
  });

  it('型別錯的欄位用預設（壞資料不擴散）；字典欄位保留所有鍵', () => {
    storage.setItem(SAVE_KEY, JSON.stringify({ merit: 'lots', training: { hp: 2, power: 5 }, unlocked: { cards: 'x' } }));
    const s = loadSave();
    expect(s.merit).toBe(0);
    expect(s.training).toEqual({ hp: 2, power: 5 });
    expect(s.unlocked.cards).toEqual([]);
  });

  it('損毀的 JSON → 預設值，不丟錯', () => {
    storage.setItem(SAVE_KEY, '{not json');
    expect(loadSave()).toEqual(defaultSave());
  });

  it('寫入失敗（隱私模式）→ 回傳 false、只提示一次、不丟錯', () => {
    resetSaveWarning();
    const fn = vi.fn();
    const off = bus.on('saveFailed', fn);
    storage.failWrites = true;
    expect(writeSave(defaultSave())).toBe(false);
    expect(writeSave(defaultSave())).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });

  it('merge 不改動傳入的預設值', () => {
    const base = defaultSave();
    const copy = JSON.parse(JSON.stringify(base));
    merge(base, { merit: 9, settings: { sfx: 0 } });
    expect(base).toEqual(copy);
  });
});
