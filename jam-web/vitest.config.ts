import { defineConfig } from 'vitest/config';
import path from 'path';

// 20260906_1348 — storybook 프로젝트(스토리 파일을 테스트로 변환해 브라우저에서 렌더 스모크를
// 돌리는 @storybook/addon-vitest 연동)를 제거했다. 44개 스토리 파일이 전부
// 「No test suite found」로 실패해 `npx vitest run`이 항상 레드였는데, 원인은 addon 미설치나
// include 설정 누락이 아니라 addon-vitest 자체의 버그였다: 스토리를 테스트로 등록하는
// `if (isRunningFromThisFile) { test(...) }` 가드가 `import.meta.url`을 파일 경로와 비교할 때
// `convertToFilePath()`(node_modules/@storybook/addon-vitest/dist/vitest-plugin/test-utils.js)가
// `%20`(공백)만 디코딩하고 나머지는 `decodeURIComponent`를 쓰지 않는다. 이 저장소의 절대경로
// (`/Volumes/뚝섬하드/시현/JAM!/...`)에 한글이 포함돼 있어 URL 인코딩된 경로와 실제 파일 경로가
// 영원히 일치하지 않고, 가드가 항상 false → test()가 한 번도 호출되지 않아 모든 스토리가 예외
// 없이 실패했다(decodeURIComponent로 패치해 재현 확인함). 저장소 경로에 한글을 쓰는 것은
// 프로젝트 운영 규칙(CLAUDE.md)이 못 박은 것이라 우리 쪽에서 바꿀 수 없고, addon-vitest 쪽
// 업스트림 버그를 patch-package로 얹는 것은 스토리 렌더 스모크 하나를 위해 들이기엔 비용이 크다.
// 스토리북은 이미 Vercel 배포에서도 제외됐다(티켓 20260906_1142) — 스토리에 테스트 인프라를
// 더 태울 이유가 약해 여기서도 뺀다. `npm run storybook`(로컬 :6006)으로 눈으로 보는 용도는
// 이 변경과 무관하게 그대로 동작한다.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 20260906_2140 — `badgeProgressText.ts`가 MODULAR의 진행 램프 임계값
      // (`NEAR_THRESHOLD`)을 단일 출처로 재수출한다. 서비스 tsconfig에는 이미 있던
      // 별칭인데 vitest에는 없어서 그 테스트가 해석 실패로 죽는다.
      '@ds': path.resolve(__dirname, './design-system')
    }
  },
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
      '**/admin/__tests__/today-calendar.test.ts',
      // 스토리 파일은 테스트가 아니다 — storybook 프로젝트 제거 이후에도 vitest 기본
      // include(`**/*.{test,spec}.*`)에는 안 걸리지만, 명시적으로 남겨 재발을 막는다.
      '**/*.stories.@(js|jsx|mjs|ts|tsx)'
    ]
  }
});