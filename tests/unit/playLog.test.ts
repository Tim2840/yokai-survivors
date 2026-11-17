import { describe, it, expect } from 'vitest';
import { PlayLog } from '../../src/game/playLog';
import { PLAY_LOG } from '../../src/data/playLog';

describe('試玩紀錄', () => {
  it('前段受傷只算門檻秒數以內的', () => {
    const l = new PlayLog();
    l.hurt(10);
    l.hurt(PLAY_LOG.earlySeconds);
    l.hurt(PLAY_LOG.earlySeconds + 1);
    expect(l.summary().earlyHurts).toBe(2);
  });
  it('選卡秒數：中位、最長；連續選卡各自計時；前幾次不算「選太久」', () => {
    const l = new PlayLog();
    let t = 0;
    const secs = [9, 9, 9, 9, 9, 1, 6, 2];
    for (const s of secs) {
      l.pickOpened(t);
      t += s;
      l.pickChosen(t);
      l.pickClosed();
      t += 30;
    }
    const s = l.summary();
    expect(s.picks).toBe(8);
    expect(s.pickMax).toBe(9);
    expect(s.pickMedian).toBe(9);
    expect(s.slowPicks).toBe(1);
    // 一次升兩級：第二張從選完第一張起算
    const m = new PlayLog();
    m.pickOpened(0);
    m.pickChosen(2);
    m.pickChosen(5);
    expect(m.summary().pickMax).toBe(3);
  });
  it('沒選過卡不會出現 NaN；到達等級的時間只記第一次', () => {
    const l = new PlayLog();
    expect(l.summary().pickMedian).toBe(0);
    l.level(PLAY_LOG.marks[0], 100);
    l.level(PLAY_LOG.marks[0] + 1, 130);
    expect(l.summary().markAt).toEqual([100, -1]);
    l.level(PLAY_LOG.marks[1] + 3, 300);
    expect(l.summary().markAt).toEqual([100, 300]);
  });
});
