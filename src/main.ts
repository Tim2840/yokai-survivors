import './ui/theme.css';
import { AudioEngine } from './core/audio';
import { bus } from './core/bus';
import { Input } from './core/input';
import { FixedLoop } from './core/loop';
import { Renderer } from './core/renderer';
import { loadSave, writeSave } from './core/save';
import { applyTuningFromQuery, loadTuning } from './data/tuning';
import { Game } from './game/game';
import { GameStateMachine } from './game/stateMachine';
import { t } from './i18n';
import { toast } from './ui/menu';
import { buildTuningPanel } from './ui/tuningPanel';
import { buildStage } from './world/stage';

/** 開發工具（__game）與網址參數（?q、?seed、?count…）只在開發模式與測試頁（build:single）帶上；主網址與正式 build 不帶 */
const DEV_TOOLS = import.meta.env.DEV || import.meta.env.MODE === 'single';

function pickSeed(): number {
  const q = DEV_TOOLS ? new URLSearchParams(location.search).get('seed') : null;
  if (q && /^\d+$/.test(q)) return Number(q) >>> 0;
  return Date.now() >>> 0;
}

function boot(): void {
  const app = document.getElementById('app')!;
  const ui = document.getElementById('ui')!;
  if (DEV_TOOLS) {
    loadTuning();
    applyTuningFromQuery(location.search);
  }
  const seed = pickSeed();
  const save = loadSave();
  const mobile = matchMedia('(pointer: coarse)').matches;

  const fsm = new GameStateMachine(bus);
  const q = DEV_TOOLS ? new URLSearchParams(location.search).get('q') : null;
  const renderer = new Renderer(app, {
    mode: save.settings.quality,
    onModeChange: (m) => {
      save.settings.quality = m;
      writeSave(save);
    },
    fixedLevel: q !== null && /^[0-4]$/.test(q) ? Number(q) : undefined,
  });
  const audio = new AudioEngine();
  audio.setVolumes({ sfx: save.settings.sfx, music: save.settings.music });
  audio.setMusic({ theme: 'title' });
  const input = new Input();
  const stage = buildStage(renderer.scene);

  let menuTime = 0;
  let game: Game;
  const loop = new FixedLoop(
    (dt) => fsm.update(dt),
    () => {
      game.frame();
      if (!game.run) {
        menuTime += 1 / 60;
        stage.lantern.position.y = Math.sin(menuTime * 2) * 0.08;
        renderer.follow(0, 0, 1 / 60);
      }
      renderer.render();
    },
  );
  game = new Game({ fsm, loop, renderer, audio, input, save, ui, seed, mobile, tuneUi: DEV_TOOLS ? buildTuningPanel : undefined, backdrop: stage.group });

  bus.on('saveFailed', () => toast(t('save.failed')));

  if (DEV_TOOLS) {
    void import('./dev/devApi').then((m) => m.installDevApi({ loop, fsm, seed, audio, renderer, game }));
  }

  writeSave(save);
  renderer.precompile();
  fsm.go('MENU');
  const tick = (now: number) => {
    loop.frame(now);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

boot();

// 離線與安裝（PWA）：只有正式網頁版（npm run build 的 dist/）註冊；開發、單檔分享頁、嵌在框架裡都不註冊
if ('serviceWorker' in navigator && import.meta.env.MODE === 'production' && import.meta.env.PROD && window.self === window.top) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* 註冊失敗：遊戲照常，只是不能離線 */
    });
  });
}
