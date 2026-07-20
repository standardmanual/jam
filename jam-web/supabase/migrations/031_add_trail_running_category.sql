-- ============================================================
-- Migration 031: trail_running 액티비티 카테고리 정식 등록
--
-- 배경:
--   activity_types 컬럼은 TEXT[]로 저장되며 DB enum/check constraint가
--   없다. 허용값은 001_initial_schema.sql의 라인 주석으로만 명시되어 있었고
--   'cycling, running, hiking, walking'까지만 문서화되어 있었다.
--   실제 시드 데이터(022/029)와 badge-engine은 이미 road_running /
--   trail_running 을 사용 중이므로, 컬럼 코멘트를 실제 허용값과 일치시킨다.
--
-- 변경 내용:
--   - users.activity_types, badges.activity_types 컬럼에 COMMENT 추가
--   - 허용값에 road_running, trail_running 포함하여 정식 문서화
--
-- 주의:
--   trail_running 배지 데이터는 029에서 이미 시드 완료되어 있으므로
--   본 마이그레이션은 데이터 변경 없이 스키마 문서(코멘트)만 갱신한다.
-- ============================================================

COMMENT ON COLUMN public.users.activity_types IS
  '허용값: cycling, running, road_running, trail_running, hiking, walking';

COMMENT ON COLUMN public.badges.activity_types IS
  '허용값: cycling, running, road_running, trail_running, hiking, walking';
