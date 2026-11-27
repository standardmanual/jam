-- 365_chapter_jam_apply_down.sql
-- 365_chapter_jam_apply.sql의 되돌림 (티켓 20261127_1725)
--
-- B4 이후에는 chapter_jam_events에 멱등 기록이 쌓이므로 백업한 뒤에 되돌린다.
-- 이 함수를 부르는 코드(B4, C2)를 먼저 되돌린 뒤 실행한다.
-- user_chapters.chapter_jam에 이미 더해진 값과 chapter_ups에 들어간 줄은 되돌리지 않는다.
-- 다시 실행해도 같은 결과가 나온다(IF EXISTS).

DROP FUNCTION IF EXISTS public.chapter_jam_apply(UUID, INTEGER, TEXT, BOOLEAN);
DROP TABLE IF EXISTS public.chapter_jam_events;
