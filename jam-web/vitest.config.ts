import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // node:assert + 자체 러너로 작성된 파일은 npx tsx로 직접 실행 (vitest 제외)
    exclude: [
      '**/node_modules/**',
      '**/today/__tests__/**',
      '**/missions/__tests__/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
