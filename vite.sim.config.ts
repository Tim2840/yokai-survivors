import { defineConfig } from 'vite';

/** `npm run sim` 用：把 scripts/sim/sim.ts（連同 src 的純邏輯）打包成 Node 可跑的單一檔案 dist-sim/sim.mjs */
export default defineConfig({
  build: {
    ssr: 'scripts/sim/sim.ts',
    outDir: 'dist-sim',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'sim.mjs', format: 'es' } },
    minify: false,
  },
});
