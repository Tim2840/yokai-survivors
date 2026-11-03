import './ui/theme.css';
import { AudioEngine } from './core/audio';
import { bus } from './core/bus';
import { FixedLoop } from './core/loop';
import { Renderer } from './core/renderer';
import { loadSave, writeSave } from './core/save';
import { GameStateMachine } from './game/stateMachine';
import { SIMULATED_STATES } from './game/states';
import { t } from './i18n';
import { buildMenu, toast } from './ui/menu';
import { buildStage } from './world/stage';

/** 開發工具（__game）只在開發模式與測試頁（build:single）帶上；主網址與正式 build 不帶 */
const DEV_TOOLS = import.meta.env.DEV || import.meta.env.MODE === 'single';

function pickSeed(): number {
  const q = new URLSearchParams(location.search).get('seed');
  if (q && /^\d+$/.test(q)) return Number(q) >>> 0;
  return Date.now() >>> 0;
}

function boot(): void {
  const app = document.getElementById('app')!;
  const ui = document.getElementById('ui')!;
  const seed = pickSeed();
  const save = loadSave();

  const fsm = new GameStateMachine(bus);
  // 測試頁可用 ?q=0～4 固定畫質等級（截圖穩定）；主網址不吃這個參數
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
  const { lantern } = buildStage(renderer.scene);

  let time = 0;
  const loop = new FixedLoop(
    (dt) => {
      time += dt;
      fsm.update(dt);
      lantern.position.y = Math.sin(time * 2) * 0.08;
      renderer.follow(lantern.position.x, lantern.position.z, dt);
    },
    () => renderer.render(),
  );

  bus.on('saveFailed', () => toast(t('save.failed')));

  // 分頁失焦：只在模擬中的狀態自動暫停（docs/06 第 5 節）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && SIMULATED_STATES.includes(fsm.state) && !loop.paused) {
      loop.paused = true;
      bus.emit('paused', { paused: true, reason: 'hidden' });
    }
  });

  const notReady = () => {
    audio.sfx('click');
    toast(t('menu.notReady'));
  };
  buildMenu(ui, notReady, notReady);

  if (DEV_TOOLS) {
    void import('./dev/devApi').then((m) => m.installDevApi({ loop, fsm, seed, audio, renderer }));
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
