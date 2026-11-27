-- 367_chapter_jam_backfill_prepare_down.sql
-- 367_chapter_jam_backfill_prepare.sql의 되돌림 (티켓 20261127_1728)
--
-- 이관을 실행한 뒤에는 chapter_jam_backfill이 되돌림의 근거이므로,
-- 먼저 C1b의 되돌림 SQL로 user_chapters·chapter_ups·chapter_jam_events를 복원한 다음에만 지운다.
-- 이관을 실행하기 전이면 표가 비어 있어 지금 지워도 서비스 데이터를 잃지 않는다.
-- 다시 실행해도 같은 결과가 나온다(IF EXISTS).

DROP FUNCTION IF EXISTS public.chapter_jam_backfill_chunk(INTEGER, BOOLEAN);
DROP TABLE IF EXISTS public.chapter_jam_backfill;
