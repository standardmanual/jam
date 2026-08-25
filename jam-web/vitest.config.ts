import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    projects: [{
      extends: true,
      test: {
        globals: true,
        environment: 'node',
        // node:assert + 자체 러너로 작성된 파일이라 vitest 러너로는 못 돈다 — 여기서 제외하되,
        // package.json의 `test:node`가 tsx로 전부 실행하고 `npm test`가 이를 이어서 호출한다.
        // (제외만 하고 방치하면 회귀 방어가 CI에서 빠진다 — 티켓 20260825_028)
        exclude: ['**/node_modules/**', '**/today/__tests__/**', '**/missions/__tests__/**']
      }
    }, {
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});