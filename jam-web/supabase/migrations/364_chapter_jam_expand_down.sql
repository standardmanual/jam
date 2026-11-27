-- 364_chapter_jam_expand_down.sql
-- 364_chapter_jam_expand.sql의 되돌림 (티켓 20261127_1724)
--
-- 두 열의 데이터는 다른 곳에 쓰지 않으므로 지금 되돌려도 서비스 데이터를 잃지 않는다.
-- 단 B2 이후에는 user_chapters.chapter_jam에 운영 값이 쌓이므로, 그때는 백업한 뒤에 되돌린다.
-- 다시 실행해도 같은 결과가 나온다(IF EXISTS).

ALTER TABLE public.user_chapters DROP COLUMN IF EXISTS chapter_jam;
ALTER TABLE public.chapter_definitions DROP COLUMN IF EXISTS required_jam;
