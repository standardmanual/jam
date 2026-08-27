// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 스토리북 빌드 산출물(.gitignore 45~46행과 같은 대상). eslint-config-next의 기본
    // 무시 목록에는 없어서, npm run build를 한 번이라도 돌린 머신에서는 여기서만
    // 에러 996건이 나와 lint가 다시 레드가 된다 — 그린이 "빌드 안 한 상태"에서만
    // 성립하면 회귀 방지 장치로 쓸 수 없으므로 명시적으로 제외한다(20260827_022).
    "storybook-static/**",
    "public/storybook/**",
    // 서드파티 번들: guidelines/loader.html·badge-frames.html이 <script src>로 읽는
    // React·ReactDOM·Babel standalone 미니파이 파일. 우리가 고칠 수 없는 코드다.
    "design-system/_vendor/**",
    // 빌드 생성물: 1행에 "GENERATED from dc-runtime/src/*.ts — do not edit"가 명시돼 있어
    // 파일에 예외 주석을 넣어도 재생성 시 사라진다.
    "design-system/support.js",
  ]),
  {
    // scripts/는 전부 #!/usr/bin/env node 로 실행되는 CommonJS 1회성 스크립트라
    // require가 정답이다. no-require-imports만 끄고 나머지 규칙(오타·미사용 변수 등)은
    // 계속 적용되도록 globalIgnores가 아닌 override로 처리한다.
    // 확장자를 .js/.cjs로 한정한다 — .mjs는 ESM이라 require가 오히려 오류이므로
    // 규칙이 유효하고, 일부러 이 예외에서 뺀다.
    files: ["scripts/**/*.{js,cjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  ...storybook.configs["flat/recommended"]
]);

export default eslintConfig;
