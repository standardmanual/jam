-- badges 테이블에 유효 기간 컬럼 추가
-- valid_from: null이면 즉시 드랍 가능, 값이 있으면 해당 일시 이후부터만 드랍
-- valid_until: null이면 만료 없음, 값이 있으면 해당 일시까지만 드랍 + inventory_items.expires_at으로 사용

ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS valid_from  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
