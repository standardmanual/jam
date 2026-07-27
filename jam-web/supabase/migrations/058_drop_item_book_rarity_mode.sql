-- ============================================================
-- Migration 058: item_books 등급 정책 기능 롤백
--
-- 배경: 055에서 도입한 rarity_mode/uniform_rarity("등급무관"/"동일한 등급" 강제)를
--  다시 검토한 결과, 실제로는 배지 목록에서 개별 배지를 직접 골라 아이템북을
--  구성하는 기존 방식(등급 제약 없음)을 그대로 쓰기로 결정 — 미사용 컬럼 제거.
-- ============================================================

ALTER TABLE public.item_books
  DROP COLUMN IF EXISTS rarity_mode,
  DROP COLUMN IF EXISTS uniform_rarity;
