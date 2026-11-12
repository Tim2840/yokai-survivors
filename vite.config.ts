import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * PWA（可以「加到主畫面」安裝）：只在一般的 `npm run build`（輸出 dist/，放在自己的網址上）才加。從燈落之境搬來（docs/10）。
 * 單一檔案的版本（build:single、build:single:main）給 Artifact 分享頁用，裡面不能有 manifest 與 Service Worker，所以不加。
 */
function pwa(): Plugin {
  return {
    name: 'yokai-pwa',
    apply: 'build',
    transformIndexHtml() {
      return [
        { tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#1b2040' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: '百鬼陣' }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: './icons/apple-touch-icon.png' }, injectTo: 'head' },
      ];
    },
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).map((f) => './' + f);
      const files = ['./', './index.html', ...built.filter((f) => f !== './index.html'), './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
      const source = readFileSync('src/pwa/sw.template.js', 'utf8').replaceAll('__BUILD_ID__', Date.now().toString(36)).replaceAll('__FILES__', JSON.stringify([...new Set(files)]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// `npm run build:single`：單一 HTML（測試頁，帶測試工具）；`build:single:main`：主網址版（不含測試工具）。
export default defineConfig(({ mode }) => {
  const single = mode === 'single' || mode === 'single-main';
  return {
    base: './',
    // Blender 試作（docs/26）：.glb 當成資源，`?inline` 內嵌成 data URL（單一檔案的測試頁也帶得走）
    assetsInclude: ['**/*.glb'],
    plugins: single ? [viteSingleFile()] : [pwa()],
    build: { outDir: single ? 'dist-single' : 'dist', chunkSizeWarningLimit: 1500, copyPublicDir: !single },
  };
});
