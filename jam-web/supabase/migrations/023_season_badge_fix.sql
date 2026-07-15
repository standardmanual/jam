-- ============================================================
-- 023: 계절 배지 condition_json에 season 필드 추가
--      + 시뮬레이션 버그로 잘못 발급된 배지 정리
-- 계절 기준: 봄 3-5월, 여름 6-8월, 가을 9-11월, 겨울 12-2월
-- ============================================================

-- 봄 (3, 4, 5월)
UPDATE public.badges
SET condition_json = condition_json || '{"season": "spring"}'::jsonb
WHERE name IN ('봄바람의 추적자', '춘분의 온기')
  AND type = 'activity';

-- 여름 (6, 7, 8월)
UPDATE public.badges
SET condition_json = condition_json || '{"season": "summer"}'::jsonb
WHERE name IN ('여름비의 무희', '하지의 열정')
  AND type = 'activity';

-- 가을 (9, 10, 11월)
UPDATE public.badges
SET condition_json = condition_json || '{"season": "fall"}'::jsonb
WHERE name IN ('가을 단풍의 방랑자', '추분의 고독')
  AND type = 'activity';

-- 겨울 (12, 1, 2월)
UPDATE public.badges
SET condition_json = condition_json || '{"season": "winter"}'::jsonb
WHERE name IN ('겨울눈의 파수꾼', '동지의 심연')
  AND type = 'activity';

-- 사계절의 정복자: 계절 무관 전체 활동 합산
UPDATE public.badges
SET condition_json = condition_json || '{"season": "all"}'::jsonb
WHERE name = '사계절의 정복자'
  AND type = 'activity';

-- 시뮬레이션 버그로 잘못 발급된 배지 삭제
DELETE FROM public.user_activity_badges
WHERE triggered_by = 'admin_simulate';
