-- 티켓 20260818_002: 배지 상세화면 배경테마 기반 구조 개편 (1차 — 시각 결과 무변경)
-- 향후 배지별 배경색·쉐이더 적용 기능([20260818_001])을 위한 선행 컬럼 추가.
-- nullable + 기본값 NULL이므로 기존 쿼리·렌더링에 영향 없음. 쉐이더 기술 스택은 아직 미정(보류).

ALTER TABLE badges
  ADD COLUMN IF NOT EXISTS background_color TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS background_shader_id TEXT DEFAULT NULL;

COMMENT ON COLUMN badges.background_color IS '배지 상세화면 배경 테마 컬러값. NULL이면 기본 배경 유지 (20260818_002 선행 구조, 아직 UI 미반영).';
COMMENT ON COLUMN badges.background_shader_id IS '배지 상세화면 배경 쉐이더 식별자. NULL이면 쉐이더 없음 (20260818_002 선행 구조, 쉐이더 스택 미정).';
