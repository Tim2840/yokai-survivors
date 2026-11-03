import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:single`：單一 HTML（測試頁，帶測試工具）；`build:single:main`：主網址版（不含測試工具）。
// 一般 `npm run build` 輸出 dist/。PWA 外掛在 M0 再加（見 docs/10）。
export default defineConfig(({ mode }) => {
  const single = mode === 'single' || mode === 'single-main';
  return {
    base: './',
    plugins: single ? [viteSingleFile()] : [],
    build: { outDir: single ? 'dist-single' : 'dist', chunkSizeWarningLimit: 1500 },
  };
});
