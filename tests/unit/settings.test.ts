import { describe, it, expect } from 'vitest';
import { defaultSave, merge } from '../../src/core/save';
import { feel, initFeel } from '../../src/core/feel';
import { FX_CHOICES, FX_LEVELS, QUALITY_CHOICES, TEXT_CHOICES, TEXT_SCALE } from '../../src/data/settings';
import { t } from '../../src/i18n';
import type { I18nKey } from '../../src/i18n/zh-TW';

describe('設定（D103）', () => {
  it('存檔預設：特效完整、字級標準、小地圖不轉；舊存檔（沒有這些欄位）讀回來補上預設、保留原本的音量', () => {
    const d = defaultSave();
    expect(d.settings.fx).toBe('full');
    expect(d.settings.text).toBe('normal');
    expect(d.settings.minimapRotate).toBe(false);
    const old = { ...defaultSave(), settings: { sfx: 0.3, music: 0.1, quality: 'low', lang: 'zh-TW' } };
    const m = merge(defaultSave(), JSON.parse(JSON.stringify(old)));
    expect(m.settings.sfx).toBe(0.3);
    expect(m.settings.quality).toBe('low');
    expect(m.settings.fx).toBe('full');
    expect(m.settings.minimapRotate).toBe(false);
  });

  it('特效三段：完整 > 減少 > 關閉；系統「減少動態效果」與網址 ?fx= 只會再往下壓，不會把「關閉」打開', () => {
    const sum = () => feel.shake + feel.hitStop + feel.vignette + feel.pops;
    const v = FX_CHOICES.map((l) => (initFeel('', false, l), sum()));
    expect(v[0]).toBeGreaterThan(v[1]);
    expect(v[1]).toBeGreaterThan(v[2]);
    initFeel('', false, 'off');
    expect(sum()).toBe(0);
    initFeel('', true, 'off');
    expect(sum(), '減少動態效果不會打開').toBe(0);
    initFeel('?fx=low', false, 'full');
    expect(feel.hitStop).toBe(0);
    initFeel('', false, 'garbage');
    expect(feel.shake).toBe(FX_LEVELS.full.shake);
  });

  it('每個選項都有文字（≤ 36 字、不帶角色專屬字）；字級大於標準', () => {
    const keys: string[] = ['settings.open', 'settings.title', 'settings.close', 'settings.sfx', 'settings.music', 'settings.quality', 'settings.fx', 'settings.text', 'settings.minimap', 'settings.hint'];
    for (const c of QUALITY_CHOICES) keys.push(`settings.quality.${c}`);
    for (const c of FX_CHOICES) keys.push(`settings.fx.${c}`);
    for (const c of TEXT_CHOICES) keys.push(`settings.text.${c}`);
    keys.push('settings.minimap.on', 'settings.minimap.off');
    for (const k of keys) {
      const s = t(k as I18nKey);
      expect(s, k).not.toBe(k);
      expect([...s].length).toBeLessThanOrEqual(36);
      expect(/鬼火|燈|水盤|金棒/.test(s), k).toBe(false);
    }
    expect(TEXT_SCALE.large).toBeGreaterThan(TEXT_SCALE.normal);
  });
});
