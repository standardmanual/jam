-- 티켓 20260902_2213: 미션 reward_badge_ids null 오염 정리
--
-- 원인: seed_phase13_missions_30.sql이 아래 패턴으로 reward_badge_ids를 채웠는데
--   ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '...' LIMIT 1)]::uuid[]
-- 참조한 배지 이름이 migrations/012_item_badges_100.sql에 존재하지 않아(오타 또는 미생성)
-- 서브쿼리가 NULL을 반환했다. Postgres에서 ARRAY[NULL]은 빈 배열({})이 아니라
-- NULL 원소 1개짜리 배열({NULL})이 되므로, 스크립트 주석의 "안 맞으면 비어있게 된다"는
-- 가정은 틀렸다. 결과적으로 missions.reward_badge_ids에 {NULL}이 섞여 저장됐고,
-- /rest/v1/badges?id=in.(null,...) 질의가 PostgREST 400(22P02)을 유발했다.
--
-- 조치: 이미 badges 테이블에 존재하지 않는 배지를 가리키던 슬롯이므로 "복구"가 아니라
-- "잘못 채워진 null 슬롯 정리"다. 정리 후에도 해당 미션들은 배지 보상 없이 포인트만
-- 지급되는 게 맞는 동작이다(운영자가 나중에 정식으로 배지를 재지정할 수 있음).
--
-- 실행 전 확인 쿼리 (영향 범위 — 14건 예상):
--   SELECT id, title, reward_badge_ids FROM public.missions
--   WHERE EXISTS (SELECT 1 FROM unnest(reward_badge_ids) x WHERE x IS NULL);

UPDATE public.missions
SET reward_badge_ids = array_remove(reward_badge_ids, NULL)
WHERE EXISTS (
  SELECT 1 FROM unnest(reward_badge_ids) x WHERE x IS NULL
);
