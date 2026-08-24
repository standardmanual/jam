-- ============================================================
-- Migration 095: 떠돌이 신화(wandering mythic) 기능 전면 제거
--
-- 티켓 20260824_017. 011_phases_15_18.sql(Phase 17)에서 만든 스키마를 되돌린다.
-- Cron(/api/cron/wandering)과 스키마만 존재했을 뿐 컨텐츠가 한 번도 붙지 않은
-- 미완성 기능이라 사용자 결정으로 제거한다.
--
-- 프로덕션 실사용 0건 확인 (service_role 조회, 2026-08-24)
--   badges WHERE is_wandering AND deleted_at IS NULL         → 0건
--   wandering_mythic_state                                    → 0건
--   user_activity_badges JOIN badges WHERE is_wandering       → 0건
--   inventory_items JOIN badges WHERE is_wandering            → 0건
-- → 데이터 마이그레이션 이슈 없음, 유저 영향 없음.
--
-- ⚠️ 되돌릴 수 없는 DDL이다. 실행 전 위 4개 조회가 여전히 0건인지 재확인할 것.
-- ============================================================

-- ① 떠돌이 아이템 상태 테이블 제거
--    (badges / poi / users 를 참조만 하므로 이 테이블이 다른 객체의 의존 대상은 아니다)
DROP TABLE IF EXISTS public.wandering_mythic_state;

-- ② badges.is_wandering 컬럼 제거
ALTER TABLE public.badges DROP COLUMN IF EXISTS is_wandering;

-- 검증:
--   SELECT to_regclass('public.wandering_mythic_state');  -- NULL 이어야 함
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='badges' AND column_name='is_wandering';  -- 0행
