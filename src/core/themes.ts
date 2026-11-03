import { MIYAKO, type Theme } from './music';

/**
 * 百鬼陣的曲子（資料）。全部用都節音階（MIYAKO：根音、小二度、完全四度、完全五度、小六度），根音 E。
 * 旋律的音階級數：0 = 根音（E5 附近，依 melodyOctave），1 = F，2 = A，3 = B，4 = C，5 = 高八度的 E；負數往下。
 * 和弦是同一音階內的音疊成（都節音階本身就有和風的「陰」味道，不用另外加不協和音）。
 * docs/08 第 4 節：標題慢、留白；戰鬥較快；整備放慢。三味線、尺八的音色在 M2 補（現在先用引擎既有的 bell／flute／box）。
 */
const ROOT_E = 4; // E4

// 常用和弦（音階級數）
const I = [0, 2, 3]; // E A B
const II = [1, 3, 4]; // F B C
const IV = [-1, 0, 2]; // C E A
const V = [-2, 0, 3]; // B E B

export const THEMES: Theme[] = [
  {
    id: 'title',
    scale: MIYAKO,
    bpm: 62,
    root: ROOT_E,
    chords: [I, IV, II, I],
    bass: [0, -1, 1, 0],
    phrases: [
      [[0, 0, 2], [2, 2, 1.5], [4, 3, 3]],
      [[0, 4, 2], [3, 3, 1], [4, 2, 3]],
      [[0, 1, 1.5], [2, 3, 1], [4, 2, 1], [5, 1, 2.5]],
      [[0, 0, 3], [4, -1, 1], [5, 0, 3]],
    ],
    timbre: 'bell',
    melodyOctave: 0,
    pluckBeats: [0, 2],
    mix: { pad: 0.9, pluck: 0.5, melody: 1.0, bass: 0.6 },
  },
  {
    id: 'battle',
    scale: MIYAKO,
    bpm: 112,
    root: ROOT_E,
    chords: [I, II, IV, V],
    bass: [0, 1, -1, -2],
    phrases: [
      [[0, 0, 0.5], [0.5, 2, 0.5], [1, 3, 1], [2.5, 4, 0.5], [3, 3, 1], [4, 2, 0.5], [4.5, 1, 0.5], [5, 0, 2]],
      [[0, 1, 0.5], [0.5, 3, 0.5], [1, 4, 1.5], [3, 5, 1], [4, 4, 0.5], [4.5, 3, 0.5], [5, 1, 2]],
      [[0, -1, 1], [1, 0, 0.5], [1.5, 2, 0.5], [2, 3, 1], [4, 2, 1], [5, 0, 2]],
      [[0, -2, 0.5], [0.5, 0, 0.5], [1, 3, 1], [2, 2, 1], [3, 0, 1], [4, -2, 3]],
    ],
    timbre: 'box',
    melodyOctave: 0,
    pluckBeats: [0, 0.5, 1.5, 2, 3, 3.5],
    mix: { pad: 0.6, pluck: 0.9, melody: 0.9, bass: 0.9 },
  },
  {
    id: 'intermission',
    scale: MIYAKO,
    bpm: 56,
    root: ROOT_E,
    chords: [IV, I, II, I],
    bass: [-1, 0, 1, 0],
    phrases: [
      [[0, 2, 3], [5, 3, 2]],
      [[0, 0, 4]],
      [[0, 1, 2], [3, 3, 3]],
      [[0, 2, 1.5], [2, 0, 5]],
    ],
    timbre: 'flute',
    melodyOctave: 0,
    pluckBeats: [0],
    mix: { pad: 1.0, pluck: 0.35, melody: 0.8, bass: 0.5 },
  },
];
