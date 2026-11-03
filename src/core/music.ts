/**
 * 背景音樂引擎（從燈落之境搬來，docs/10；改動：音階改由每首曲子的 scale 決定）。
 * （Web Audio，全部即時合成，沒有任何音檔）。設計與研究見 docs/06-music-plan.md。
 *
 * - 一首曲子是一份資料 `Theme`（調、速度、和弦進行、旋律樂句、音色）；新島只要寫一份新的 Theme。
 * - 垂直分層：墊底 pad、撥奏 pluck、旋律 melody、低音 bass、心跳 pulse。各層音量由遊戲狀態
 *   （時段、霧、危險）連續調整，不換曲子也會有變化。
 * - 換曲（換島）：新曲在下一個小節線開始，舊曲淡出、新曲淡入，共用一個殘響。
 * - 排程器：每小節把該小節的音符一次排進 AudioContext（往前看一點點），所以主執行緒卡一下也不會亂拍。
 *   離線渲染（OfflineAudioContext，驗證用）直接呼叫 scheduleUntil()。
 * - 音階固定用五聲音階（C D E G A），和弦全部由五聲音階內的音疊成，怎麼疊都不會刺耳。
 */

/** 五聲音階各級距離根音的半音數（燈落之境的預設） */
export const PENTA = [0, 2, 4, 7, 9];
/** 都節音階（miyako-bushi，陰旋法）：E F A B C 的半音距離。百鬼陣的曲子用這個（docs/08 第 4 節） */
export const MIYAKO = [0, 1, 5, 7, 8];

/** 音階級數（可以是負數或超過音階長度，每 N 級一個八度）轉成相對根音的半音數 */
export function degreeToSemitones(d: number, scale: readonly number[] = PENTA) {
  const n = scale.length;
  const oct = Math.floor(d / n);
  const i = ((d % n) + n) % n;
  return scale[i] + oct * 12;
}

export type Timbre = 'box' | 'bell' | 'glass' | 'flute';

/** 旋律樂句裡的一個音：第幾拍開始（0～7.99，一個和弦 = 2 小節 = 8 拍）、音階級數（0 = C5，1 = D5，2 = E5，3 = G5，4 = A5，5 = C6；負數往下）、長度（拍） */
export type Note = [beat: number, degree: number, len: number];

export interface Theme {
  id: string;
  /** 音階（每個音距離根音的半音數）；沒給就是五聲音階 */
  scale?: readonly number[];
  /** 每分鐘幾拍 */
  bpm: number;
  /** 根音的半音數，0 = C4（261.63 Hz） */
  root: number;
  /** 和弦進行：每個和弦 2 小節，內容是音階級數（墊底的音） */
  chords: number[][];
  /** 每個和弦對應的低音（音階級數，會降一個八度） */
  bass: number[];
  /** 每個和弦對應的旋律樂句（跟和弦同長，8 拍） */
  phrases: Note[][];
  /** 旋律與撥奏的音色 */
  timbre: Timbre;
  /** 旋律與撥奏整體移幾個八度（0 = 旋律的 0 級是 C5） */
  melodyOctave: number;
  /** 撥奏用的節奏：一小節內的拍點（0～3.99），依順序循環使用和弦音 */
  pluckBeats: number[];
  /** 這首曲子各層的基準音量（0～1） */
  mix: { pad: number; pluck: number; melody: number; bass: number };
}

/** 遊戲狀態：由世界場景每幀餵進來 */
export interface MusicState {
  /** 現在要放哪首曲子（Theme.id） */
  theme: string;
  /** 夜晚程度 0..1：越晚越慢、越稀疏 */
  night: number;
  /** 霧的程度 0..1：旋律與撥奏淡出，墊底變空洞 */
  mist: number;
  /** 危險 0..1：霧影靠近時淡入心跳 */
  danger: number;
  /** 整體音量倍率 0..1（對話、選單降低） */
  level: number;
}

const midiHz = (semi: number) => 261.6256 * Math.pow(2, semi / 12);

/** 簡單的固定種子亂數（旋律的變奏要每次播都一樣） */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** 程式產生的殘響衝激響應：指數衰減的雙聲道噪音，越後面越暗 */
export function makeImpulse(ctx: BaseAudioContext, seconds: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const r = rng(12345);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const white = r() * 2 - 1;
      // 一階低通，濾掉越後面越多的高頻
      const a = 0.55 - 0.4 * t;
      lp += (white - lp) * a;
      d[i] = lp * Math.pow(1 - t, 2.6);
    }
  }
  return buf;
}

interface Layers {
  pad: GainNode;
  pluck: GainNode;
  melody: GainNode;
  bass: GainNode;
  pulse: GainNode;
  /** 旋律與撥奏共用的低通：霧裡往下拉 */
  brightness: BiquadFilterNode;
  /** 墊底的低通 */
  padFilter: BiquadFilterNode;
}

/** 一首正在放的曲子（換曲時新舊兩個會同時存在一小段時間） */
class Voice {
  readonly mix: GainNode;
  readonly layers: Layers;
  /** 下一個要排程的小節開始時間 */
  nextBar: number;
  /** 已經排了幾小節 */
  bar = 0;
  fading = false;
  /** 各層排了幾個音（驗證用） */
  readonly count = { pad: 0, pluck: 0, melody: 0, bass: 0, pulse: 0 };
  private rand: () => number;

  constructor(
    private ctx: BaseAudioContext,
    readonly theme: Theme,
    dry: AudioNode,
    send: AudioNode,
    start: number,
    seed: number,
  ) {
    this.nextBar = start;
    this.rand = rng(seed);
    this.mix = ctx.createGain();
    this.mix.gain.value = 0;
    this.mix.connect(dry);
    const sendGain = ctx.createGain();
    sendGain.gain.value = 0.55;
    this.mix.connect(sendGain).connect(send);
    const mk = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      return g;
    };
    const brightness = ctx.createBiquadFilter();
    brightness.type = 'lowpass';
    brightness.frequency.value = 6000;
    brightness.Q.value = 0.4;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 1400;
    padFilter.Q.value = 0.3;
    this.layers = { pad: mk(), pluck: mk(), melody: mk(), bass: mk(), pulse: mk(), brightness, padFilter };
    this.layers.pad.connect(padFilter).connect(this.mix);
    this.layers.pluck.connect(brightness);
    this.layers.melody.connect(brightness);
    brightness.connect(this.mix);
    this.layers.bass.connect(this.mix);
    this.layers.pulse.connect(this.mix);
  }

  // ── 音色 ──────────────────────────────────────────────────────
  private osc(type: OscillatorType, freq: number, t0: number, dur: number, out: AudioNode, peak: number, attack: number, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  /** 撥奏／旋律的一個音：依音色疊幾個泛音，起音快、尾音長 */
  private pluckNote(t0: number, freq: number, dur: number, peak: number, out: AudioNode) {
    switch (this.theme.timbre) {
      case 'box': // 音樂盒：基音加二倍頻，很乾淨
        this.osc('sine', freq, t0, dur, out, peak, 0.004);
        this.osc('sine', freq * 2, t0, dur * 0.55, out, peak * 0.28, 0.004);
        this.osc('sine', freq * 4.01, t0, dur * 0.2, out, peak * 0.07, 0.004);
        break;
      case 'bell': // 鈴：帶一點非整數倍頻
        this.osc('sine', freq, t0, dur * 1.15, out, peak, 0.004);
        this.osc('sine', freq * 2.76, t0, dur * 0.45, out, peak * 0.16, 0.004);
        this.osc('sine', freq * 5.4, t0, dur * 0.2, out, peak * 0.06, 0.004);
        break;
      case 'glass': // 玻璃琴：三角波加三倍頻，圓潤一點
        this.osc('triangle', freq, t0, dur, out, peak * 0.8, 0.006);
        this.osc('sine', freq * 3, t0, dur * 0.4, out, peak * 0.12, 0.006);
        break;
      case 'flute': // 笛：慢一點的起音，帶淡淡的顫音
        this.osc('sine', freq, t0, dur, out, peak * 0.85, 0.09);
        this.osc('triangle', freq * 2, t0, dur * 0.8, out, peak * 0.1, 0.12);
        break;
    }
  }

  private padNote(t0: number, freq: number, dur: number, peak: number) {
    // 兩個略微失諧的三角波加一個正弦，起音與收尾都很慢
    const out = this.layers.pad;
    const attack = Math.min(1.6, dur * 0.3);
    const hold = t0 + dur;
    for (const [type, detune, k] of [['triangle', -7, 0.5], ['triangle', 6, 0.5], ['sine', 0, 0.6]] as const) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak * k, t0 + attack);
      g.gain.setValueAtTime(peak * k, hold - 1.4);
      g.gain.linearRampToValueAtTime(0.0001, hold + 0.6);
      o.connect(g).connect(out);
      o.start(t0);
      o.stop(hold + 0.7);
    }
  }

  private bassNote(t0: number, freq: number, dur: number, peak: number) {
    this.osc('sine', freq, t0, dur, this.layers.bass, peak, 0.05);
    this.osc('triangle', freq * 2, t0, dur * 0.5, this.layers.bass, peak * 0.15, 0.05);
  }

  private pulseNote(t0: number, peak: number) {
    // 很輕的一下「咚」：低頻正弦的快速下滑
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t0);
    o.frequency.exponentialRampToValueAtTime(48, t0 + 0.14);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o.connect(g).connect(this.layers.pulse);
    o.start(t0);
    o.stop(t0 + 0.3);
  }

  /** 排一個和弦（2 小節 = 8 拍）：墊底、低音、撥奏、旋律、心跳 */
  scheduleChord(t0: number, beat: number, night: number) {
    const th = this.theme;
    const ci = Math.floor(this.bar / 2) % th.chords.length;
    const chord = th.chords[ci];
    const rand = this.rand;
    // 墊底：整個和弦一起長音（晚上稍微往下沉一點）
    this.count.pad += chord.length;
    for (const d of chord) this.padNote(t0, midiHz(th.root + degreeToSemitones(d, th.scale) - 12 * (night > 0.6 ? 1 : 0)), beat * 8 + 0.4, 0.05);
    // 低音：和弦根音，降兩個八度，只在和弦第一拍
    this.count.bass++;
    this.bassNote(t0, midiHz(th.root + degreeToSemitones(th.bass[ci], th.scale) - 12), beat * 6, 0.11);
    // 撥奏：每小節依節奏拍點輪流彈和弦音；夜晚變稀疏
    const density = 1 - night * 0.45;
    let k = 0;
    for (let bar = 0; bar < 2; bar++) {
      for (const pb of th.pluckBeats) {
        if (rand() > density) continue;
        const d = chord[k++ % chord.length] + 5 * (1 + th.melodyOctave);
        this.count.pluck++;
        this.pluckNote(t0 + (bar * 4 + pb) * beat, midiHz(th.root + degreeToSemitones(d, th.scale)), beat * 2.6, 0.045, this.layers.pluck);
      }
    }
    // 旋律：這個和弦的樂句；每輪偶爾少彈一個音，夜晚少更多（留白）
    const phrase = th.phrases[ci % th.phrases.length];
    const keep = 1 - night * 0.5;
    const lap = Math.floor(this.bar / (th.chords.length * 2));
    for (const [b, deg, len] of phrase) {
      if (rand() > keep) continue;
      // 第二輪起，長音之後的短音偶爾升一個音階級數做變奏
      const d = deg + 5 * (1 + th.melodyOctave) + (lap % 2 === 1 && len < 1.2 && rand() < 0.3 ? 1 : 0);
      this.count.melody++;
      this.pluckNote(t0 + b * beat, midiHz(th.root + degreeToSemitones(d, th.scale)), Math.max(1.2, len * beat * 1.6), 0.085, this.layers.melody);
    }
    // 心跳：每拍一下（音量由 pulse 層的增益決定，平常是 0）
    this.count.pulse += 8;
    for (let i = 0; i < 8; i++) this.pulseNote(t0 + i * beat, 0.5);
    this.bar += 2;
  }
}

export interface MusicOptions {
  /** 殘響長度（秒），手機用短一點 */
  reverbSeconds?: number;
  /** 淡入淡出秒數 */
  fadeSeconds?: number;
}

export class Music {
  private voices: Voice[] = [];
  private dry: GainNode;
  private send: ConvolverNode;
  private themes = new Map<string, Theme>();
  private state: MusicState = { theme: '', night: 0, mist: 0, danger: 0, level: 1 };
  private timer = 0;
  private fade: number;
  /** 排程游標：排到這個時間為止已經排好了 */
  private cursor = 0;
  private started = false;

  constructor(
    private ctx: BaseAudioContext,
    out: AudioNode,
    themes: Theme[],
    opts: MusicOptions = {},
  ) {
    this.fade = opts.fadeSeconds ?? 4;
    for (const t of themes) this.themes.set(t.id, t);
    this.dry = ctx.createGain();
    this.dry.gain.value = 0.8;
    this.dry.connect(out);
    this.send = ctx.createConvolver();
    this.send.buffer = makeImpulse(ctx, opts.reverbSeconds ?? 2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.7;
    this.send.connect(wet).connect(out);
  }

  /** 換曲、改狀態；同一首曲子不會重播 */
  setState(s: Partial<MusicState>) {
    const prevTheme = this.state.theme;
    this.state = { ...this.state, ...s };
    if (this.state.theme && this.state.theme !== prevTheme) this.switchTheme(this.state.theme);
    this.applyLevels();
  }

  get theme() {
    return this.state.theme;
  }

  private current() {
    return this.voices.find((v) => !v.fading) ?? null;
  }

  private switchTheme(id: string) {
    const th = this.themes.get(id);
    if (!th) return;
    const now = this.ctx.currentTime;
    const old = this.current();
    // 新曲從舊曲的下一個小節線開始（沒有舊曲就馬上）
    const start = old ? Math.max(now + 0.05, old.nextBar) : Math.max(now + 0.1, this.cursor);
    const v = new Voice(this.ctx, th, this.dry, this.send, start, 7 + this.voices.length * 31);
    this.voices.push(v);
    v.mix.gain.setValueAtTime(0, start);
    v.mix.gain.linearRampToValueAtTime(1, start + this.fade);
    if (old) {
      old.fading = true;
      old.mix.gain.cancelScheduledValues(start);
      old.mix.gain.setValueAtTime(old.mix.gain.value, start);
      old.mix.gain.linearRampToValueAtTime(0, start + this.fade);
    }
    this.applyLevels(true);
  }

  /** 依狀態把各層音量、低通調到位（連續，不會突然跳） */
  private applyLevels(immediate = false) {
    const s = this.state;
    const t = this.ctx.currentTime;
    const k = immediate ? 0.01 : 0.9;
    for (const v of this.voices) {
      const m = v.theme.mix;
      const { layers: L } = v;
      const clear = 1 - s.mist * 0.85; // 霧裡旋律與撥奏淡出
      L.pad.gain.setTargetAtTime(m.pad * (1 + s.mist * 0.08) * s.level, t, k);
      L.pluck.gain.setTargetAtTime(m.pluck * clear * s.level, t, k);
      L.melody.gain.setTargetAtTime(m.melody * clear * (1 - s.night * 0.25) * s.level, t, k);
      L.bass.gain.setTargetAtTime(m.bass * (1 + s.mist * 0.1) * s.level, t, k);
      L.pulse.gain.setTargetAtTime(s.danger * 0.55 * s.level, t, 0.4);
      L.brightness.frequency.setTargetAtTime(6000 - s.mist * 4200 - s.night * 1500, t, 1.2);
      L.padFilter.frequency.setTargetAtTime(1400 - s.mist * 800, t, 1.2);
    }
  }

  private beatSeconds() {
    const th = this.current()?.theme;
    const bpm = (th?.bpm ?? 72) * (1 - this.state.night * 0.12);
    return 60 / bpm;
  }

  /** 把 t 秒以前的音符都排進去（每個和弦 2 小節排一次） */
  scheduleUntil(t: number) {
    for (const v of [...this.voices]) {
      const beat = 60 / (v.theme.bpm * (1 - this.state.night * 0.12));
      while (v.nextBar < t) {
        v.scheduleChord(v.nextBar, beat, this.state.night);
        v.nextBar += beat * 8;
      }
      // 淡出完成的舊曲收掉
      if (v.fading && this.ctx.currentTime > v.nextBar + this.fade + 4) this.dispose(v);
    }
    this.cursor = Math.max(this.cursor, t);
  }

  private dispose(v: Voice) {
    v.mix.disconnect();
    this.voices = this.voices.filter((x) => x !== v);
  }

  /** 即時播放：每 80 毫秒排一次，往前看 0.5 秒 */
  start() {
    if (this.started) return;
    this.started = true;
    const tick = () => this.scheduleUntil(this.ctx.currentTime + 0.5);
    tick();
    this.timer = window.setInterval(tick, 80);
  }

  stop() {
    window.clearInterval(this.timer);
    this.started = false;
  }

  /** 各首曲子累計排了幾個音（驗證用） */
  get stats() {
    return this.voices.map((v) => ({ theme: v.theme.id, ...v.count, bars: v.bar }));
  }

  /** 目前每拍幾秒（給測試用） */
  get beat() {
    return this.beatSeconds();
  }
}
