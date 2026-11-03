import { Rng } from '../lib/random';
import { Music, type MusicState } from './music';
import { THEMES } from './themes';
import { AUDIO } from '../data/audio';

/**
 * 音效與背景音樂（Web Audio，全部即時合成，沒有外部音檔）。
 * 引擎（unlock、匯流排、tone／noise／chime 零件）從燈落之境的 audio.ts 搬來（docs/10 第 2 節）；音效清單重寫。
 * - 瀏覽器規定要有使用者操作之後才能出聲，第一次點擊／按鍵時才建立 AudioContext（unlock）。
 * - 節流（docs/08 第 3 節）：同一種音效同時最多 AUDIO.maxConcurrent 個；標成「高頻」的音效最短間隔 AUDIO.minIntervalMs。
 * - 音量來自存檔的 settings（由外部呼叫 setVolumes），這裡不自己讀寫 localStorage。
 */
export type SfxName =
  | 'click'
  | 'confirm'
  | 'error'
  | 'cardFlip'
  | 'levelUp'
  | 'pickup'
  | 'hit'
  | 'enemyDown'
  | 'hurt'
  | 'waveStart'
  | 'waveEnd'
  | 'death';

/** 高頻音效：最短間隔節流 */
const HIGH_FREQ: ReadonlySet<SfxName> = new Set(['hit', 'enemyDown', 'pickup']);

/** 都節音階的鈴音頻率（E5 F5 A5 B5 C6 E6），音效的音高從這裡取，和音樂不打架 */
const BELL = [659.25, 698.46, 880, 987.77, 1046.5, 1318.51];

/** 節流判斷（純函式，單元測試）：給目前時間、上次播放時間、目前同時在響的數量，回傳能不能播 */
export function canPlay(nowMs: number, lastMs: number, playing: number, highFreq: boolean): boolean {
  if (playing >= AUDIO.maxConcurrent) return false;
  if (highFreq && nowMs - lastMs < AUDIO.minIntervalMs) return false;
  return true;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private music: Music | null = null;
  private noiseBuf!: AudioBuffer;
  private volumes = { sfx: 0.8, music: 0.6 };
  private wantTheme = 'title';
  private readonly last = new Map<SfxName, number>();
  private readonly playing = new Map<SfxName, number>();
  private pickupChain = 0;
  private pickupAt = 0;

  constructor() {
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.ctx.state === 'suspended') void this.ctx.resume();
    });
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** 除錯：音樂目前放哪首 */
  debug() {
    return { ready: this.ready, theme: this.music?.theme ?? null };
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      this.master = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.master.connect(comp);
      comp.connect(ctx.destination);
      this.applyVolumes();

      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      const rng = new Rng(AUDIO.noiseSeed);
      for (let i = 0; i < len; i++) d[i] = rng.next() * 2 - 1;

      const mobile = matchMedia?.('(pointer: coarse)').matches;
      this.music = new Music(ctx, this.musicBus, THEMES, { reverbSeconds: mobile ? 1.7 : 2.8 });
      this.music.setState({ theme: this.wantTheme });
      this.music.start();
    } catch {
      this.ctx = null;
    }
  }

  setVolumes(v: { sfx: number; music: number }) {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  /** 換曲（title／battle／intermission）與音樂狀態 */
  setMusic(state: Partial<MusicState> & { theme: string }) {
    this.wantTheme = state.theme;
    this.music?.setState(state);
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(1, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music, t, 0.08);
  }

  // ── 合成用的小零件（燈落之境原樣） ───────────────────────────────
  private tone(o: { freq: number; freq2?: number; dur: number; type?: OscillatorType; gain?: number; attack?: number; delay?: number; vib?: number }) {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.freq2) osc.frequency.exponentialRampToValueAtTime(o.freq2, t0 + o.dur);
    const g = ctx.createGain();
    const peak = o.gain ?? 0.1;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g).connect(this.sfxBus);
    if (o.vib) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 7;
      const depth = ctx.createGain();
      depth.gain.value = o.vib;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + o.dur + 0.05);
    }
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
    return t0 + o.dur;
  }

  private noise(o: { dur: number; type: BiquadFilterType; freq: number; freq2?: number; q?: number; gain?: number; delay?: number }) {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.freq, t0);
    if (o.freq2) f.frequency.exponentialRampToValueAtTime(o.freq2, t0 + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.1, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0, (t0 * 7.31) % 1.5);
    src.stop(t0 + o.dur + 0.05);
    return t0 + o.dur;
  }

  private chime(freq: number, delay = 0, gain = 0.09, dur = 0.9) {
    this.tone({ freq, dur, gain, delay });
    this.tone({ freq: freq * 2.005, dur: dur * 0.6, gain: gain * 0.35, delay });
    return this.tone({ freq: freq * 3.01, dur: dur * 0.3, gain: gain * 0.15, delay });
  }

  // ── 音效 ────────────────────────────────────────────────────────
  /** arg：cardFlip 是稀有度階（0～3）；其他忽略 */
  sfx(name: SfxName, arg = 0) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime * 1000;
    const playing = this.playing.get(name) ?? 0;
    if (!canPlay(now, this.last.get(name) ?? -Infinity, playing, HIGH_FREQ.has(name))) return;
    this.last.set(name, now);
    let end = ctx.currentTime;
    switch (name) {
      case 'click':
        end = this.tone({ freq: 640, freq2: 880, dur: 0.06, gain: 0.07, type: 'triangle' });
        break;
      case 'confirm':
        this.tone({ freq: BELL[0], dur: 0.12, gain: 0.06, type: 'triangle' });
        end = this.tone({ freq: BELL[3], dur: 0.18, gain: 0.06, type: 'triangle', delay: 0.07 });
        break;
      case 'error':
        end = this.tone({ freq: 220, freq2: 180, dur: 0.18, gain: 0.07, type: 'square' });
        break;
      case 'cardFlip':
        end = this.chime(BELL[Math.min(BELL.length - 1, 1 + Math.max(0, arg))], 0, 0.06, 0.5);
        break;
      case 'levelUp':
        for (let i = 0; i < 4; i++) end = this.chime(BELL[i + 1], i * 0.07, 0.07, 0.7);
        break;
      case 'pickup': {
        // 連續拾取音高往上，最多一個八度（docs/08 第 3 節）
        this.pickupChain = now - this.pickupAt < 400 ? Math.min(BELL.length - 1, this.pickupChain + 1) : 0;
        this.pickupAt = now;
        end = this.tone({ freq: BELL[this.pickupChain], dur: 0.09, gain: 0.04 });
        break;
      }
      case 'hit':
        end = this.noise({ dur: 0.06, type: 'bandpass', freq: 1800, q: 1.2, gain: 0.05 });
        break;
      case 'enemyDown':
        end = this.tone({ freq: 300, freq2: 120, dur: 0.12, gain: 0.06, type: 'triangle' });
        break;
      case 'hurt':
        end = this.tone({ freq: 180, freq2: 90, dur: 0.22, gain: 0.1, type: 'sawtooth' });
        break;
      case 'waveStart':
        // 鑼：低頻加噪音
        this.noise({ dur: 1.2, type: 'bandpass', freq: 420, freq2: 300, q: 2, gain: 0.08 });
        end = this.tone({ freq: 110, dur: 1.6, gain: 0.12, vib: 2 });
        break;
      case 'waveEnd':
        end = this.chime(BELL[0], 0, 0.08, 1.2);
        break;
      case 'death':
        this.tone({ freq: 330, freq2: 110, dur: 1.0, gain: 0.1, type: 'triangle' });
        end = this.chime(BELL[1] / 2, 0.3, 0.06, 1.4);
        break;
    }
    this.playing.set(name, playing + 1);
    const ms = Math.max(0, (end - ctx.currentTime) * 1000);
    window.setTimeout(() => this.playing.set(name, Math.max(0, (this.playing.get(name) ?? 1) - 1)), ms);
  }
}
