-- 294: ops_bundles에 title · trends 칸 추가 — 기획 묶음의 기획 제목과 읽은 트렌드 (티켓 20261026_2021)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 오케스트레이터(카리나)가 처리한다. Supabase는 staging·프로덕션 공용 단일 DB라
--    실행 즉시 프로덕션에 반영된다.
--
-- 배경:
--   제출 묶음에 `title`(기획 제목)·`trends[]`(읽은 트렌드)를 선택 필드로 더한다
--   (docs/service/prd/admin-boards/PRD.md §5.1·5.4). 항목의 `rationale`·`highlight`는 기존
--   `ops_bundle_items.original`에, `routine_run.stages`는 기존 `ops_bundles.routine_run`(JSONB)에 둔다.
--   그래서 새 칸은 이 두 개뿐이다.
--
-- 설계:
--   - 확장(Expand) 마이그레이션이다. nullable 칸 두 개를 덧붙이기만 하고 옛 모양은 그대로 동작한다
--     (`db-migration-rules.md` §1). 기본값이 없는 nullable 칸이라 기존 행을 다시 쓰지 않으며 백필도 없다.
--   - 옛 코드(이 칸을 모르는 배포본)와 새 코드가 함께 돌아도 안전하다: 옛 코드는 이 칸을 읽지도 쓰지도 않는다.
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS로 작성했다.

BEGIN;

ALTER TABLE public.ops_bundles
  ADD COLUMN IF NOT EXISTS title  TEXT  NULL,
  ADD COLUMN IF NOT EXISTS trends JSONB NULL;

COMMENT ON COLUMN public.ops_bundles.title IS
  '그 주 기획을 한 줄로 부르는 이름(30자 이내, 티켓 20261026_2021). 없으면 NULL.';
COMMENT ON COLUMN public.ops_bundles.trends IS
  '에이전트가 읽은 트렌드 목록 [{ label, source_ids, summary, series?, outcome, outcome_reason? }] (티켓 20261026_2021). 형식이 틀리면 저장하지 않고 NULL이며 원본은 raw에 남는다.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'ops_bundles' AND column_name IN ('title', 'trends');
-- 기대: 2행(text YES, jsonb YES).

-- 되돌림 SQL
-- 먼저 새 칸에 값이 들어온 행이 있는지 확인한다(있으면 지우기 전에 보존이 필요한지 판단한다. 같은 값은 raw에도 남아 있다):
-- SELECT count(*) FROM public.ops_bundles WHERE title IS NOT NULL OR trends IS NOT NULL;
-- ALTER TABLE public.ops_bundles DROP COLUMN IF EXISTS trends, DROP COLUMN IF EXISTS title;
