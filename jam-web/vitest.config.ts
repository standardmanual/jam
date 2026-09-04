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
        // 20260831_1327 — 실제 Supabase 자격증명이 유닛 테스트에 새어 들어가지 않도록
        // 매 테스트 파일 실행 전 관련 env를 비운다 (모킹 누락 시 조용한 실 DB 접속 방지)
        setupFiles: ['./vitest.setup.ts'],
        // node:assert + 자체 러너로 작성된 파일이라 vitest 러너로는 못 돈다 — 여기서 제외하되,
        // package.json의 `test:node`가 tsx로 전부 실행하고 `npm test`가 이를 이어서 호출한다.
        // (제외만 하고 방치하면 회귀 방어가 CI에서 빠진다 — 티켓 20260825_028)
        // today-calendar.test.ts는 admin/__tests__ 폴더 안에 badge-validation.test.ts(진짜
        // vitest 스위트)와 공존하므로 폴더째 제외할 수 없다 — 파일 단위로 제외한다.
        exclude: [
          '**/node_modules/**',
          '**/today/__tests__/**',
          '**/missions/__tests__/**',
          '**/admin/__tests__/today-calendar.test.ts'
        ]
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