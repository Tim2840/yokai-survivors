import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';

describe('i18n', () => {
  it('取字串並代入參數', () => {
    expect(t('game.title')).toBe('百鬼陣');
    expect(t('menu.version', { version: 3 })).toBe('版本 3');
  });
});
