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

/**
 * 배지/미션/컬렉션 대표이미지로 "적용"할 때 목표로 삼는 용량(티켓 20260915 후속) — 허용
 * 용량의 70%. 여유를 둬서 재인코딩 오차나 이후 메타데이터 추가로 허용치를 넘지 않게 한다.
 * 일반 PNG 다운로드(`ShaderLabExportPanel`의 `downloadPng`)에는 적용하지 않는다 — 사용자가
 * 직접 내려받는 파일은 원본 화질을 그대로 유지해야 한다.
 */
export const TARGET_APPLY_IMAGE_BYTES = Math.round(MAX_APPLY_IMAGE_BYTES * 0.7)

export type ApplyGeneratedImageTable = 'badges' | 'missions' | 'item_books'
