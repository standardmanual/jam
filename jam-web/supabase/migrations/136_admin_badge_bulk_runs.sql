-- 136: 배지 일괄 작업 실행 로그 테이블 (티켓 20260905_0034, 마스터 20260905_0026)
--
-- 배경:
--   배지 카탈로그 일괄 도구는 service_role 전권으로 «207종 폐기»·«획득 이력 삭제» 같은
--   되돌리기 어려운 일을 한 번에 처리한다. 티켓의 안전장치 항목이 «실행 로그 — 무엇을 몇 건
--   처리했는지 기록»을 요구하는데, 이 저장소에는 어드민 행위를 남기는 테이블이 하나도 없다
--   (`abusing_logs`는 유저 어뷰징 판정 기록이고, `engine_decision_log`는 발급 판정 기록이다).
--   서버 콘솔 로그만으로는 «누가 언제 무엇을 몇 건 처리했는가»를 나중에 조회할 수 없다.
--
-- 범위: 새 테이블 1개. 기존 테이블·트리거·CHECK를 한 줄도 건드리지 않는다.
--   130~135의 변경분(badges v5 스키마·조건키 CHECK·계열 정합성 트리거·미션 게이트 축)을
--   되돌리지 않는다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: **코드 배포보다 먼저 실행하는 것이 좋다.** 다만 배포가 먼저여도 서비스는
--   깨지지 않는다 — 일괄 도구의 로그 기록은 실패해도 작업 자체를 실패시키지 않고 콘솔
--   경고만 남기도록 구현했고(`api/admin/badges/bulk/route.ts`), 화면의 최근 실행 목록은
--   조회 실패 시 안내 문구로 대체된다.
--
-- 재실행 가능(idempotent): CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_badge_bulk_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 실행한 어드민. `auth.users`가 아니라 `public.users`를 참조한다(이 저장소의 기존 관례 —
  -- 069_strava_activities.sql·099_mission_rank_snapshots.sql·128_user_family_progress).
  -- 계정이 지워져도 «무엇이 몇 건 처리됐는가»는 남아야 하므로 SET NULL이다.
  admin_user_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  admin_email     TEXT,
  -- 'deactivate'(폐기) · 'restore'(되살리기) · 'purge_earns'(획득 이력 삭제) ·
  -- 'detach_reference'(참조 개별 해제). 코드의 BulkAction + 참조 해제와 1:1이다.
  action          TEXT NOT NULL CHECK (action IN ('deactivate', 'restore', 'purge_earns', 'detach_reference')),
  target_count    INTEGER NOT NULL DEFAULT 0,
  affected_count  INTEGER NOT NULL DEFAULT 0,
  -- 대상 배지 id 앞부분·필터·참조 건수 스냅샷 등. 전량을 넣지 않는다(수백 건이면 로그가
  -- 원본만큼 커진다) — 재현에 필요한 «무엇을»만 담는다.
  detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.admin_badge_bulk_runs IS
  '배지 카탈로그 일괄 작업 실행 로그(어드민 전용). 티켓 20260905_0034';

CREATE INDEX IF NOT EXISTS idx_admin_badge_bulk_runs_created_at
  ON public.admin_badge_bulk_runs (created_at DESC);

-- RLS — 유저 화면에서 읽을 일이 없는 어드민 전용 테이블이다.
-- engine_decision_log(074)·poi_views(096)·mission_rank_snapshots(099)와 동일하게
-- "RLS 켜고 정책 없음" = service_role 전용.
-- (RLS 자체를 끄면 anon 키로 전체 조회·수정이 가능해진다 — 074 인시던트 참고)
ALTER TABLE public.admin_badge_bulk_runs ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ── 검증 쿼리 (실행 후 확인) ────────────────────────────────────────────────
--
-- 1) 테이블·컬럼 생성 확인 (8행: id/admin_user_id/admin_email/action/target_count/
--    affected_count/detail/created_at)
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'admin_badge_bulk_runs'
--    ORDER BY ordinal_position;
--
-- 2) RLS 켜짐 + 정책 없음 확인 (rowsecurity = true, policy 0건)
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'admin_badge_bulk_runs';
--   SELECT count(*) FROM pg_policies WHERE tablename = 'admin_badge_bulk_runs';
--
-- 3) 인덱스 확인
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'admin_badge_bulk_runs';
--
-- ── 롤백 스모크 (MCP엔 트랜잭션이 없으므로 DO 블록 안에서 넣고 되돌린다) ──────
--
--   DO $$
--   DECLARE v_id UUID;
--   BEGIN
--     INSERT INTO public.admin_badge_bulk_runs (action, target_count, affected_count, detail)
--     VALUES ('deactivate', 3, 3, '{"smoke": true}'::jsonb)
--     RETURNING id INTO v_id;
--     RAISE NOTICE '삽입 성공: %', v_id;
--     -- CHECK 제약이 실제로 막는지 확인
--     BEGIN
--       INSERT INTO public.admin_badge_bulk_runs (action) VALUES ('hard_delete');
--       RAISE EXCEPTION '스모크 실패: 허용되지 않는 action이 통과했습니다';
--     EXCEPTION WHEN check_violation THEN
--       RAISE NOTICE 'CHECK 정상 동작';
--     END;
--     RAISE EXCEPTION '스모크 종료 — 전부 롤백합니다';
--   END $$;
--
-- ── 되돌리기 (필요 시) ─────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS public.admin_badge_bulk_runs;
