import { defineConfig } from 'vitest/config';

// 單元測試（第一層）：純邏輯、不開瀏覽器。`npm test` 跑一次；`npx vitest` 是監看模式。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
  },
});
