-- 티켓 20260818_004: 세계관·컬렉션 배경테마 일괄 적용 (Phase 2 — 20260818_001 원 요청 2번 항목)
-- factions/item_books에도 배지와 동일한 배경 테마 컬럼을 추가해, 어드민에서 값을 설정하고
-- "하위 배지에 일괄 적용" 버튼으로 소속 배지들의 background_color/background_shader_id에
-- 1회성으로 복사할 수 있게 한다. nullable + 기본값 NULL이므로 기존 쿼리·렌더링에 영향 없음.

ALTER TABLE factions
  ADD COLUMN IF NOT EXISTS background_color TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS background_shader_id TEXT DEFAULT NULL;

ALTER TABLE item_books
  ADD COLUMN IF NOT EXISTS background_color TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS background_shader_id TEXT DEFAULT NULL;

COMMENT ON COLUMN factions.background_color IS '이 세계관에 속한 배지에 "하위 배지에 일괄 적용" 버튼으로 복사할 배경색(hex). 세계관 자체에는 렌더링되지 않는다 (20260818_004).';
COMMENT ON COLUMN factions.background_shader_id IS '이 세계관에 속한 배지에 일괄 적용할 배경 쉐이더 식별자(임시, 쉐이더 스택 미정) (20260818_004).';
COMMENT ON COLUMN item_books.background_color IS '이 컬렉션에 속한 배지에 "하위 배지에 일괄 적용" 버튼으로 복사할 배경색(hex). 컬렉션 자체에는 렌더링되지 않는다 (20260818_004).';
COMMENT ON COLUMN item_books.background_shader_id IS '이 컬렉션에 속한 배지에 일괄 적용할 배경 쉐이더 식별자(임시, 쉐이더 스택 미정) (20260818_004).';
