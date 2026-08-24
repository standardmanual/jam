/// <reference types="@vitest/browser-playwright" />
// vitest globals(describe/it/expect/vi)를 tsc가 인식하도록 참조를 등록한다.
// vitest.config.ts의 test.globals가 true이므로 테스트 파일은 import 없이 이 전역들을 쓴다.
// tsconfig의 compilerOptions.types를 지정하면 @types/* 자동 포함이 끊기므로 여기서 참조만 더한다.
/// <reference types="vitest/globals" />
