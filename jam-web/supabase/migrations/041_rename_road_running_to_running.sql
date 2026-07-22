-- road_running → running 리네임
-- 배경: 과거 'running'(세분화 이전)과 'road_running'(세분화 이후) 두 값이 공존했으나
-- 'running'은 실제로 어디에도 쓰이지 않는 죽은 값이었음. 이번에 'road_running'을
-- 'running'으로 개명해 하나로 통합한다 (트레일 러닝은 별도로 trail_running 유지).

-- badges.activity_types 배열 컬럼
UPDATE public.badges
SET activity_types = array_replace(activity_types, 'road_running', 'running')
WHERE 'road_running' = ANY(activity_types);

-- badges.condition_json JSONB의 activity_type 필드
UPDATE public.badges
SET condition_json = jsonb_set(condition_json, '{activity_type}', '"running"')
WHERE condition_json->>'activity_type' = 'road_running';

-- users.activity_types 배열 컬럼 (유저 선호 활동 종류)
UPDATE public.users
SET activity_types = array_replace(activity_types, 'road_running', 'running')
WHERE 'road_running' = ANY(activity_types);

COMMENT ON COLUMN public.users.activity_types IS
  '허용값: cycling, running, trail_running, hiking, walking';

COMMENT ON COLUMN public.badges.activity_types IS
  '허용값: cycling, running, trail_running, hiking, walking';
