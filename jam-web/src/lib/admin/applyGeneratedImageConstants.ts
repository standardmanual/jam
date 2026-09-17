/**
 * applyGeneratedImage.ts의 상수만 분리한 파일 (티켓 20260913_0414 빌드 오류 수정).
 *
 * `ShaderLabApplyTab.tsx`('use client')가 `MAX_APPLY_IMAGE_BYTES` 하나만 쓰려고
 * `applyGeneratedImage.ts`를 직접 import했는데, 그 파일이 `@/lib/supabase/server`
 * (내부에서 `next/headers` import)를 함께 갖고 있어 클라이언트 번들에 서버 전용 모듈이
 * 딸려 들어가 Turbopack 빌드가 실패했다("You're importing a module that depends on
 * 'next/headers'..."). 순수 상수만 이 파일로 분리해 클라이언트 컴포넌트는 이 파일만
 * import하게 하고, 서버 전용 로직(`applyGeneratedImage.ts`)은 이 상수를 재수출한다.
 */

export const APPLY_GENERATED_IMAGE_BUCKET = 'images'
export const MAX_APPLY_IMAGE_BYTES = 5 * 1024 * 1024

export type ApplyGeneratedImageTable = 'badges' | 'missions' | 'item_books'
