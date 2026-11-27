-- 366_chapter_reward_down.sql
-- 366_chapter_reward.sql의 되돌림 (티켓 20261127_1726)
--
-- C3b 이후에는 chapter_reward_grants에 지급 기록이 쌓이므로 백업한 뒤에 되돌린다.
-- chapter_reward_policy는 어드민에서 바꾼 값이 있으면 백업한다.
-- 다시 실행해도 같은 결과가 나온다(IF EXISTS).

DROP TABLE IF EXISTS public.chapter_reward_grants;
DROP TABLE IF EXISTS public.chapter_reward_policy;
ALTER TABLE public.chapter_definitions DROP COLUMN IF EXISTS reward_count;
