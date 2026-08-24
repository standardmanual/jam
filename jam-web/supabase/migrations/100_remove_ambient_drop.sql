-- ============================================================
-- Migration 100: 앰비언트(시스템) 드랍 기능 제거
--
-- 티켓: 20260825_004
--
-- 배경 — 오해 방지를 위해 남긴다:
--   이 제거는 "기능이 미완성이라서"가 아니다. poi_drops에 source='system' 행이
--   0건인 것이 발견의 계기였으나, 원인은 미들웨어가 /api/cron/*를 307로 가로채
--   cron 자체가 실행되지 않았던 것이다(티켓 20260825_003에서 수정, 프로덕션에서
--   307 → 401 전환으로 확정). 정책 테이블은 튜닝돼 있었고 어드민 화면도 있었다.
--   사용자가 관측과 무관하게 이 기능을 쓰지 않기로 결정했다(2026-08-25).
--
--   복원이 필요하면 044_ambient_poi_drop.sql을 되돌리면 되고,
--   마지막 운영 정책값은 티켓 문서에 기록해 두었다.
--   (common 0.86 / rare 0.12 / legend 0.02, coverage 0.15, POI당 1개, 보충 30개)
--
-- 이 마이그레이션이 하는 일:
--   1. 잔여 앰비언트 드랍(픽업되지 않은 source='system') 정리
--   2. 앰비언트 전용 부분 인덱스 제거
--   3. ambient_drop_policy 테이블 DROP
--   4. poi_drops.source 컬럼 레거시 표기 (컬럼 자체는 유지 — 아래 사유)
--
-- poi_drops.source를 남기는 이유 (티켓 §2 판단):
--   - assign_random_serial() 트리거(044)가 이 컬럼을 조회한다. 이 트리거는
--     inventory_items INSERT 전부(픽업·드랍엔진·믹스·미션보상)에 걸린다.
--   - poi_drops_source_consistency CHECK가 유저 드랍의 dropper_user_id·expires_at
--     NOT NULL을 보장한다. 컬럼을 지우면 이 무결성 장치를 다시 설계해야 한다.
--   - 전 행이 'user'이고 DEFAULT도 'user'라 남겨도 실해가 없다.
--   → 픽업(핵심 유저 경로) 회귀 위험 > 컬럼 제거 이득. 컬럼은 유지하고 주석으로 표기한다.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. 잔여 앰비언트 드랍 정리
--    생성 경로(cron)가 사라졌으므로 더 이상 보충되지 않는다. 게다가 앰비언트 드랍은
--    expires_at IS NULL이라 poi-cleanup(만료 기준 정리)이 회수하지 못해 영구히 남는다.
--    픽업이 끝난 행(is_available = FALSE)은 inventory_items.drop_id가 참조하므로 보존한다.
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.poi_drops
  WHERE source = 'system' AND is_available = TRUE;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE '[100] 잔여 앰비언트 드랍 삭제: % 건', v_deleted;
END $$;

-- ----------------------------------------------------------------
-- 2. 앰비언트 전용 부분 인덱스 제거 (044에서 생성)
-- ----------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_poi_drops_system_available;

-- ----------------------------------------------------------------
-- 3. ambient_drop_policy DROP (싱글톤 정책 테이블 — 참조하는 코드가 모두 삭제됨)
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS public.ambient_drop_policy;

-- ----------------------------------------------------------------
-- 4. poi_drops.source 레거시 표기
-- ----------------------------------------------------------------
COMMENT ON COLUMN public.poi_drops.source IS
  '레거시 — 전 행 ''user''. 앰비언트(시스템) 드랍 제거(티켓 20260825_004)로 ''system''은 더 이상 생성되지 않는다. assign_random_serial() 트리거와 poi_drops_source_consistency CHECK가 참조 중이라 컬럼은 유지한다.';
