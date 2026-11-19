-- 347 되돌림: 배지 대표색 칸과 낡은 색 방지 트리거를 지운다(티켓 20261119_1651).
-- 칸에 저장된 색은 사라진다. 일괄 계산 스크립트로 다시 만들 수 있다.
BEGIN;

DROP TRIGGER IF EXISTS badges_bg_colors_stale_guard ON public.badges;
DROP FUNCTION IF EXISTS public.badges_bg_colors_stale_guard();
ALTER TABLE public.badges DROP COLUMN IF EXISTS bg_colors;

COMMIT;
