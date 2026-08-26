-- 티켓 20260826_016 — 소프트 삭제된 배지를 가리키는 잔존 월드 드랍 4건 소각
--
-- 배경: 배지를 소프트 삭제(badges.deleted_at)해도 그 배지를 가리키는 아직 안 주워진
-- poi_drops(is_available=true, picked_up_at IS NULL)는 무효화되지 않는 버그가 있었다
-- (근본 원인은 admin/badges/[id]/route.ts + cron/poi-cleanup/route.ts 수정으로 차단).
-- 이 파일은 그 버그로 인해 2026-08-26 시점 프로덕션 DB에 이미 남아있던 4건을 정리하는
-- 1회성 데이터 작업이다. 대상 4건은 전부 "삭제된 지 며칠 지났고 아직 픽업되지 않은" 상태로,
-- 티켓 문서의 DB 실측 결과와 동일하다.
--
-- ⚠️ Claude는 플랫폼 안전 규칙상 이 파일을 직접 실행하지 않습니다 — 사용자 승인 후
--    오케스트레이터(또는 Supabase SQL 편집기)에서 직접 실행해 주세요.

-- =====================================================================
-- STEP 0. 실행 전 확인 — 대상 4건이 실제로 존재하고 조건에 맞는지 먼저 확인하세요.
--         (기대: 4행, 전부 is_available=true, picked_up_at IS NULL, badges.deleted_at IS NOT NULL)
-- =====================================================================

SELECT
  pd.id,
  pd.badge_id,
  b.name AS badge_name,
  pd.is_available,
  pd.picked_up_at,
  b.deleted_at AS badge_deleted_at
FROM poi_drops pd
JOIN badges b ON b.id = pd.badge_id
WHERE pd.id IN (
  'd663f223-8e16-4c38-a2fe-56a8b8220219',
  'b545f5e5-2716-4232-99f7-0259e5f75850',
  'd742eebc-c8fb-4523-abaf-a3cd0fb29abe',
  'a04d66a0-5c4f-4c21-bee4-dc01b864a8ba'
)
ORDER BY pd.id;

-- =====================================================================
-- STEP 1. 실제 소각 — 안전장치로 4건이 정확히 일치할 때만 UPDATE한다.
--         (조건에 안 맞는 행이 섞여 있으면(이미 픽업됨 등) 전체 중단)
-- =====================================================================

DO $$
DECLARE
  target_ids UUID[] := ARRAY[
    'd663f223-8e16-4c38-a2fe-56a8b8220219',
    'b545f5e5-2716-4232-99f7-0259e5f75850',
    'd742eebc-c8fb-4523-abaf-a3cd0fb29abe',
    'a04d66a0-5c4f-4c21-bee4-dc01b864a8ba'
  ]::UUID[];
  eligible_count INT;
  updated_count  INT;
BEGIN
  -- 1-a. 소각 대상 자격 확인 — is_available=true AND picked_up_at IS NULL인 행만 카운트
  SELECT count(*) INTO eligible_count
  FROM poi_drops
  WHERE id = ANY(target_ids)
    AND is_available = true
    AND picked_up_at IS NULL;

  IF eligible_count <> 4 THEN
    RAISE EXCEPTION '소각 대상이 4건이 아닙니다 (실제 %건) — 중단. 이미 픽업됐거나 소각됐을 수 있습니다.', eligible_count;
  END IF;

  -- 1-b. 소각 — is_available만 false로 (picked_up_at 등 다른 필드는 그대로 유지)
  UPDATE poi_drops
  SET is_available = false
  WHERE id = ANY(target_ids)
    AND is_available = true
    AND picked_up_at IS NULL;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RAISE NOTICE '소각 완료 — %건', updated_count;
END $$;

-- =====================================================================
-- STEP 2. 실행 후 확인 — 4건 모두 is_available=false여야 합니다.
-- =====================================================================

-- SELECT id, badge_id, is_available, picked_up_at
-- FROM poi_drops
-- WHERE id IN (
--   'd663f223-8e16-4c38-a2fe-56a8b8220219',
--   'b545f5e5-2716-4232-99f7-0259e5f75850',
--   'd742eebc-c8fb-4523-abaf-a3cd0fb29abe',
--   'a04d66a0-5c4f-4c21-bee4-dc01b864a8ba'
-- )
-- ORDER BY id;
