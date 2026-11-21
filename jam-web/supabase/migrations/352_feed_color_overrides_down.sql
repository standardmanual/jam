-- 352 되돌림: 컬러셋 덮어쓰기 표를 지운다 (티켓 20261121_2145)
-- 표가 사라지면 홈피드 카드 색은 모두 기본값(colors.css)으로 돌아간다. 읽는 코드가 표 없음 오류를 내지 않는지 먼저 확인한다
-- (읽는 코드는 실패하면 기본값으로 그린다).
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다.

BEGIN;

DROP POLICY IF EXISTS feed_color_overrides_read ON public.feed_color_overrides;
DROP TABLE IF EXISTS public.feed_color_overrides;

COMMIT;
