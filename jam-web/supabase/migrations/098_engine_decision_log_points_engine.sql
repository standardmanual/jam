-- engine_decision_log.engine CHECK 제약에 'points' 추가
-- 티켓 20260824_023 (Infra — 엔진 판정 로그 points CHECK 제약 누락)
--
-- 073에서 만든 제약은 CHECK (engine IN ('badge', 'drop'))이라 포인트 지급 실패 로그
-- (logEngineDecision('points', 'point_award_failed', ...))가 전량 거절돼 왔다.
-- TS 시그니처는 'points'를 허용하고 있어 타입과 스키마가 갈라진 상태였고,
-- insert 결과의 error를 검사하지 않아 거절이 무성으로 사라졌다(같은 티켓에서 함께 수정).
--
-- 값을 더 추가하려면 여기(제약)와 src/lib/engine-log/index.ts의 EngineKind를
-- 반드시 함께 고친다. 한쪽만 고치면 이번과 동일하게 조용히 유실된다.
--
-- 기존 행은 전부 badge/drop이라 재검증에 걸리는 행이 없다(2026-08-24 실측 140건).
--
-- 번호 주의: 티켓에는 097로 지정돼 있었으나 작업 중 staging에 097_train_subway_poi_category.sql이
-- 먼저 병합·적용돼 098로 재배정했다.

ALTER TABLE public.engine_decision_log
  DROP CONSTRAINT IF EXISTS engine_decision_log_engine_check;

ALTER TABLE public.engine_decision_log
  ADD CONSTRAINT engine_decision_log_engine_check
  CHECK (engine IN ('badge', 'drop', 'points'));
