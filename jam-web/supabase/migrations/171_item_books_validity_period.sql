-- item_books(컬렉션) 테이블에 유효 기간 컬럼 추가 (티켓 20260914_1729)
-- badges.valid_from/valid_until(마이그레이션 025)과 동일한 패턴.
-- valid_from: null이면 처음부터 노출, 값이 있으면 해당 일시 이후부터만 노출
-- valid_until: null이면 종료 없음, 값이 있으면 해당 일시까지만 노출
--
-- 이 기간은 컬렉션 자체의 노출 여부만 결정한다 — 소속 아이템배지의 활성 여부(badges.deleted_at)와는
-- 완전히 독립적이다(같은 티켓에서 cascadeDeactivateItemBookBadges/cascadeActivateItemBookBadges
-- 캐스케이드 로직을 제거).

ALTER TABLE public.item_books
  ADD COLUMN IF NOT EXISTS valid_from  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
