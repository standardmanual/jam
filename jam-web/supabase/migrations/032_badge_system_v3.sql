-- Migration 032: Badge System v3
-- - users 테이블에 initial_sync_done 컬럼 추가
--   (첫 싱크 시 Common 배지만 발급하고, 이후에는 정상 평가)
-- - badges.condition_json의 prerequisite_badge_names는 타입 레벨 변경이므로 스키마 마이그레이션 불필요

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS initial_sync_done BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.initial_sync_done IS
  '첫 Strava 싱크 완료 여부. false인 동안 배지 엔진은 Common 등급만 발급한다.';
