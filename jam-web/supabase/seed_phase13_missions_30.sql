-- Phase 13 mission seed: 30 missions, varied conditions/rewards.
-- Run in Supabase SQL Editor. Each mission is a separate INSERT statement
-- so a partial paste/run still executes the ones that made it through.
--
-- Notes:
--   - item_collect / reward_badge_ids look up badges by name (from
--     migration 012_item_badges_100.sql). If a name was changed since,
--     that lookup returns NULL and the field stays empty for that row.
--   - poi_visit missions pick a random row from public.poi. If that
--     table is empty, poi_id ends up NULL and the mission can never be
--     completed. Check with: SELECT count(*) FROM public.poi;
--   - All ends_at values are 2026-12-30 23:59:59+09 (KST).

-- 1
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('이번 시즌 러닝 50km 달성', '러닝으로 누적 50km를 채워보세요.', 'distance', '{"distance_km":50,"activity_type":"running"}'::jsonb, 100, '{}'::uuid[], 'ranking', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 2
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('러닝 마스터: 100km 완주', '러닝 누적 100km. 완주자에게 특별 배지 지급.', 'distance', '{"distance_km":100,"activity_type":"running"}'::jsonb, 300, ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '레트로 스타' LIMIT 1)]::uuid[], 'ranking', 10, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 3
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('자전거 라이딩 200km', '자전거로 누적 200km 라이딩.', 'distance', '{"distance_km":200,"activity_type":"cycling"}'::jsonb, 150, '{}'::uuid[], 'ranking', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 4
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('자전거 500km 챌린지', '자전거 누적 500km. 상위 5명만 랭킹 공개.', 'distance', '{"distance_km":500,"activity_type":"cycling"}'::jsonb, 500, ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '익스플로어' LIMIT 1)]::uuid[], 'ranking', 5, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 5
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('트레일러닝 30km 도전', '트레일러닝 누적 30km.', 'distance', '{"distance_km":30,"activity_type":"trail_running"}'::jsonb, 200, ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '어썸 오벌' LIMIT 1)]::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 6
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('하이킹 누적 20km', '하이킹으로 누적 20km 완주.', 'distance', '{"distance_km":20,"activity_type":"hiking"}'::jsonb, 120, '{}'::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 7
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('걷기 누적 50km', '걷기 활동으로 누적 50km 달성.', 'distance', '{"distance_km":50,"activity_type":"walking"}'::jsonb, 100, '{}'::uuid[], 'ranking', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 8
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('전체 활동 누적 300km', '종목 무관 전체 활동 누적 300km.', 'distance', '{"distance_km":300}'::jsonb, 400, ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '구글리 아이' LIMIT 1)]::uuid[], 'ranking', 20, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 9
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('러닝 10km 완주 (초보 환영)', '가볍게 러닝 10km부터 시작해보세요.', 'distance', '{"distance_km":10,"activity_type":"running"}'::jsonb, 50, ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '스마일 써클' LIMIT 1)]::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 10
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('자전거 50km 완주', '자전거로 한 시즌 누적 50km 완주.', 'distance', '{"distance_km":50,"activity_type":"cycling"}'::jsonb, 80, '{}'::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 11
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('이번 시즌 5회 이상 운동', '종목 무관 활동 5회 이상.', 'activity_count', '{"count":5}'::jsonb, 100, '{}'::uuid[], 'ranking', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 12
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('이번 시즌 10회 이상 운동', '종목 무관 활동 10회 이상. 상위 10명 랭킹 공개.', 'activity_count', '{"count":10}'::jsonb, 250, ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '웨이브스' LIMIT 1)]::uuid[], 'ranking', 10, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 13
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('러닝 8회 완주', '러닝 활동 8회 기록.', 'activity_count', '{"count":8,"activity_type":"running"}'::jsonb, 150, '{}'::uuid[], 'ranking', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 14
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('자전거 5회 라이딩', '자전거 활동 5회 기록.', 'activity_count', '{"count":5,"activity_type":"cycling"}'::jsonb, 120, '{}'::uuid[], 'ranking', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 15
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('트레일러닝 3회 완주', '트레일러닝 활동 3회 기록.', 'activity_count', '{"count":3,"activity_type":"trail_running"}'::jsonb, 180, ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '버터플라이' LIMIT 1)]::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 16
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('하이킹 4회 완주', '하이킹 활동 4회 기록.', 'activity_count', '{"count":4,"activity_type":"hiking"}'::jsonb, 150, '{}'::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 17
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('걷기 15회 완주', '걷기 활동 15회 기록.', 'activity_count', '{"count":15,"activity_type":"walking"}'::jsonb, 130, '{}'::uuid[], 'ranking', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 18
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('전체 활동 20회 달성', '종목 무관 활동 20회. 상위 15명 랭킹 공개.', 'activity_count', '{"count":20}'::jsonb, 300, ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '피스 사인' LIMIT 1)]::uuid[], 'ranking', 15, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 19
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('꾸준함 챌린지: 3회 운동 습관', '종목 무관 활동 3회로 가볍게 시작.', 'activity_count', '{"count":3}'::jsonb, 60, '{}'::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 20
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('선착순 100명! 7회 운동 챌린지', '종목 무관 활동 7회, 선착순 100명 한정 보상.', 'activity_count', '{"count":7}'::jsonb, 200, ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '픽셀 써클' LIMIT 1)]::uuid[], 'ranking', NULL, NOW(), '2026-12-30 23:59:59+09', 100);

-- 21
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('지정 스팟 방문 챌린지 A', '지정된 장소를 방문해보세요.', 'poi_visit', jsonb_build_object('poi_id', (SELECT id FROM public.poi ORDER BY random() LIMIT 1)), 80, '{}'::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 22
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('지정 스팟 방문 챌린지 B', '지정된 장소를 방문해보세요.', 'poi_visit', jsonb_build_object('poi_id', (SELECT id FROM public.poi ORDER BY random() LIMIT 1)), 80, ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '타겟 하트' LIMIT 1)]::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 23
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('지정 스팟 방문 챌린지 C', '지정된 장소를 방문해보세요.', 'poi_visit', jsonb_build_object('poi_id', (SELECT id FROM public.poi ORDER BY random() LIMIT 1)), 100, '{}'::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 24
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('지정 스팟 방문 챌린지 D', '지정된 장소를 방문해보세요.', 'poi_visit', jsonb_build_object('poi_id', (SELECT id FROM public.poi ORDER BY random() LIMIT 1)), 100, ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '더블 스마일 하트' LIMIT 1)]::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 25
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('다운 애로우 배지 획득하기', '아이템배지 다운 애로우를 보유해보세요.', 'item_collect', jsonb_build_object('badge_id', (SELECT id FROM public.badges WHERE type = 'item' AND name = '다운 애로우' LIMIT 1)), 30, '{}'::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 26
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('레인보우 하트 배지 획득하기', '아이템배지 레인보우 하트를 보유해보세요.', 'item_collect', jsonb_build_object('badge_id', (SELECT id FROM public.badges WHERE type = 'item' AND name = '레인보우 하트' LIMIT 1)), 50, '{}'::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 27
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('오픈 키 배지 획득하기', '아이템배지 오픈 키를 보유해보세요.', 'item_collect', jsonb_build_object('badge_id', (SELECT id FROM public.badges WHERE type = 'item' AND name = '오픈 키' LIMIT 1)), 40, '{}'::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 28
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('아이 오브 더 선 신화 배지 획득하기', '희귀도 mythic 아이템배지 아이 오브 더 선을 보유해보세요.', 'item_collect', jsonb_build_object('badge_id', (SELECT id FROM public.badges WHERE type = 'item' AND name = '아이 오브 더 선' LIMIT 1)), 500, ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '레인보우 하트' LIMIT 1)]::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 29
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('굿 바이브스 온리 레전더리 배지 획득하기', '희귀도 legendary 아이템배지 굿 바이브스 온리를 보유해보세요. 완료 시 추가 배지 2개 지급.', 'item_collect', jsonb_build_object('badge_id', (SELECT id FROM public.badges WHERE type = 'item' AND name = '굿 바이브스 온리' LIMIT 1)), 300, ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '슈퍼 옐로우' LIMIT 1), (SELECT id FROM public.badges WHERE type = 'item' AND name = '스파클 스마일' LIMIT 1)]::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- 30
INSERT INTO public.missions (title, description, mission_type, condition_json, reward_points, reward_badge_ids, status_display_type, visible_rank_count, starts_at, ends_at, max_completions)
VALUES ('러브 세이브 신화 배지 획득하기', '희귀도 mythic 아이템배지 러브 세이브를 보유해보세요. 완료 시 추가 배지 3개 지급.', 'item_collect', jsonb_build_object('badge_id', (SELECT id FROM public.badges WHERE type = 'item' AND name = '러브 세이브' LIMIT 1)), 500, ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '레트로 선 아치' LIMIT 1), (SELECT id FROM public.badges WHERE type = 'item' AND name = '더블 오벌' LIMIT 1), (SELECT id FROM public.badges WHERE type = 'item' AND name = '베스트 스타 배너' LIMIT 1)]::uuid[], 'achievement', NULL, NOW(), '2026-12-30 23:59:59+09', NULL);

-- Verify afterwards:
-- SELECT title, mission_type, status_display_type, reward_points, array_length(reward_badge_ids, 1) AS badge_reward_count, ends_at FROM public.missions ORDER BY created_at DESC LIMIT 30;
