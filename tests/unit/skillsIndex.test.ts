import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 專案 skill（.claude/skills）的索引檢查：每個 skill 的資料夾名＝ name、有 description，
 * 而且列在 CLAUDE.md 的「專案 skill」表裡（沒列就等於之後的 session 不知道有它）。
 * 加了 skill 忘了登記、或改了名字沒同步，這裡會紅。
 */
describe('專案 skill 索引', () => {
  const root = '.claude/skills';
  const claude = readFileSync('CLAUDE.md', 'utf8');
  const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  it('至少有一個 skill', () => expect(dirs.length).toBeGreaterThan(0));
  for (const dir of dirs) {
    it(dir, () => {
      const f = `${root}/${dir}/SKILL.md`;
      expect(existsSync(f), `${f} 不存在`).toBe(true);
      const head = readFileSync(f, 'utf8').split('---')[1] ?? '';
      expect(head).toMatch(new RegExp(`^name: ${dir}$`, 'm'));
      expect(/^description: .{30,}$/m.test(head), 'description 太短或沒有').toBe(true);
      expect(claude.includes(`\`${dir}\``), `CLAUDE.md 的專案 skill 表沒有列 ${dir}`).toBe(true);
    });
  }
});
