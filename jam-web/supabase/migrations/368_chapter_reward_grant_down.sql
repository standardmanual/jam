-- 368_chapter_reward_grant_down.sql
-- 368_chapter_reward_grant.sql 되돌림: 챕터 보상 지급 함수 2개를 지운다 (티켓 20261127_1751)
--
-- issue가 claim을 부르므로 issue를 먼저 지운다. IF EXISTS라 여러 번 실행해도 같은 결과다.
-- 🚨 이 함수로 지급한 아이템과 발급 기록(item_issue_log.route = 'chapter_reward')은 되돌림이 지우지 않는다.
--    지급이 일어난 뒤에는 함수만 지운다고 데이터가 원상이 되지 않는다.
--    chapter_reward_grants 행과 user_drop_state 카운터도 그대로 남는다.

DROP FUNCTION IF EXISTS public.chapter_reward_issue(UUID, INTEGER, JSONB);
DROP FUNCTION IF EXISTS public.chapter_reward_claim(UUID, INTEGER);
