-- 198: ops_bundles · ops_bundle_items · ops_decisions 신규 — 운영툴의 받은 기획함 (티켓 20260930_1816)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터(또는 사용자가 SQL 편집기에서 직접)가 처리한다.
--    Supabase는 staging·프로덕션 공용 단일 DB라 실행 즉시 프로덕션에 생긴다.
--
-- 배경:
--   에이전트가 정기 루틴으로 제출한 한 주치 운영 묶음을 툴이 받아 저장한다
--   (docs/specs/prd/ops-tool/PRD.md §3·§10, 상위 티켓 20260930_1455 가정 4~8).
--   제출 경로는 `POST /api/admin/ops-inbox`이고, 이 마이그레이션은 그 경로가 쓰는 테이블 3개만 연다.
--
-- 설계:
--   - 새 테이블 3개만 만든다. 기존 테이블은 바꾸지 않는다(추가만 하는 확장 마이그레이션,
--     `db-migration-rules.md` §1). 백필은 없다.
--   - `ops_bundles`: 묶음 한 건. `bundle_id`는 제출자가 정한 값이고 유일하다(재제출 판정·동시 제출 방어).
--     `raw`는 제출 본문 전체, `raw_hash`는 키 순서를 정렬한 JSON의 SHA-256(같은 본문 재제출 판정용)이다.
--     `format_errors`는 「경로: 사유」 문자열 배열이다. 묶음 상태는 저장하지 않는다 — 항목 상태에서 계산한다
--     (PRD §7, 상위 티켓 가정 7).
--   - `ops_bundle_items`: 묶음 안의 항목 한 건. 조회·정렬에 쓰는 공통 필드만 열로 두고 나머지는
--     `original`(제출 항목 원본, 바꾸지 않는다)에 둔다. `edited`는 직접 수정본(티켓 1818이 쓴다),
--     `created_resource`는 승인 뒤 만들어진 자원의 ID(티켓 1500이 채운다).
--     `item_key` 중복과 종류 허용값 밖 값은 「형식 오류」로 저장해야 하므로 (묶음, item_key) 유일 제약과
--     `kind` CHECK를 두지 않는다. `status`만 서버가 정하는 값이라 CHECK로 막는다.
--   - `ops_decisions`: 결정 기록. 추가만 한다(수정·삭제 API 없음). `action`은 이 티켓이 `submit`만 쓰고
--     뒤 티켓이 값을 더하므로 CHECK를 두지 않는다. `actor`는 관리자 ID 또는 `token:<에이전트 이름>`이다.
--     `batch_id`는 일괄 승인을 한 처리 번호로 묶는 자리, `slack_result`는 슬랙 알림 결과다.
--   - RLS: 켜되 정책은 만들지 않는다(185_asset_presets.sql과 같은 패턴). RLS만 켜면 anon/authenticated
--     전체 조회·수정이 막히고 service_role(어드민 API 라우트)만 접근할 수 있다.
--
-- 재실행 가능(idempotent): CREATE TABLE IF NOT EXISTS · CREATE INDEX IF NOT EXISTS로 작성했다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_bundles (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id            TEXT        NOT NULL UNIQUE,
  week                 TEXT        NULL,
  hypothesis           TEXT        NULL,
  author               TEXT        NOT NULL,
  routine_run          JSONB       NULL,
  color_rationale_link TEXT        NULL,
  is_sample            BOOLEAN     NOT NULL DEFAULT false,
  raw                  JSONB       NOT NULL,
  raw_hash             TEXT        NOT NULL,
  format_errors        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  received_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ops_bundle_items (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id        UUID        NOT NULL REFERENCES public.ops_bundles(id) ON DELETE CASCADE,
  position         INTEGER     NOT NULL,
  item_key         TEXT        NULL,
  kind             TEXT        NULL,
  pattern_no       TEXT        NULL,
  starts_at        TIMESTAMPTZ NULL,
  ends_at          TIMESTAMPTZ NULL,
  status           TEXT        NOT NULL DEFAULT 'arrived',
  original         JSONB       NOT NULL,
  edited           JSONB       NULL,
  created_resource JSONB       NULL,
  format_errors    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ops_bundle_items_status_check CHECK (
    status IN (
      'arrived', 'reviewing', 'approved', 'preparing', 'scheduled',
      'live', 'ended', 'rejected', 'cancelled', 'failed'
    )
  )
);

CREATE TABLE IF NOT EXISTS public.ops_decisions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id     UUID        NOT NULL REFERENCES public.ops_bundles(id) ON DELETE CASCADE,
  item_id       UUID        NULL REFERENCES public.ops_bundle_items(id) ON DELETE CASCADE,
  action        TEXT        NOT NULL,
  actor         TEXT        NOT NULL,
  batch_id      UUID        NULL,
  diff          JSONB       NULL,
  reason        TEXT        NULL,
  slack_result  JSONB       NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_bundle_items_bundle_id ON public.ops_bundle_items (bundle_id);
CREATE INDEX IF NOT EXISTS idx_ops_decisions_bundle_id    ON public.ops_decisions (bundle_id);
CREATE INDEX IF NOT EXISTS idx_ops_bundles_received_at    ON public.ops_bundles (received_at DESC);

-- RLS: 정책을 만들지 않는다 = anon/authenticated 전부 거부, service_role만 접근.
ALTER TABLE public.ops_bundles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_bundle_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_decisions    ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ops_bundles IS
  '운영툴의 운영 묶음(티켓 20260930_1816). 에이전트가 POST /api/admin/ops-inbox로 제출한 한 주치 묶음이다. 묶음 상태는 저장하지 않고 항목 상태에서 계산한다. 어드민 API 전용(service_role만 접근).';
COMMENT ON COLUMN public.ops_bundles.bundle_id IS
  '제출자가 정한 묶음 식별자(유일). 같은 값을 다시 제출하면 본문이 같을 때 200, 다르면 409다.';
COMMENT ON COLUMN public.ops_bundles.raw IS '제출 본문 전체(불변).';
COMMENT ON COLUMN public.ops_bundles.raw_hash IS '제출 본문을 키 순서 정렬 JSON으로 만든 SHA-256(재제출 비교용).';
COMMENT ON COLUMN public.ops_bundles.format_errors IS '공통 필드 형식 오류 목록(「경로: 사유」 문자열 배열).';
COMMENT ON COLUMN public.ops_bundles.is_sample IS '시험 묶음 표시. 시험 묶음은 신호·결과·학습용 읽기에서 뺀다.';

COMMENT ON TABLE public.ops_bundle_items IS
  '운영 묶음의 항목(티켓 20260930_1816). 상태는 항목마다 갖는다. 어드민 API 전용(service_role만 접근).';
COMMENT ON COLUMN public.ops_bundle_items.original IS '제출 항목 원본(바꾸지 않는다).';
COMMENT ON COLUMN public.ops_bundle_items.edited IS '직접 수정본(티켓 20260930_1818이 채운다).';
COMMENT ON COLUMN public.ops_bundle_items.created_resource IS '승인 뒤 만들어진 자원의 ID(티켓 20260930_1500이 채운다).';
COMMENT ON COLUMN public.ops_bundle_items.status IS
  'arrived·reviewing·approved·preparing·scheduled·live·ended·rejected·cancelled·failed (PRD §7).';

COMMENT ON TABLE public.ops_decisions IS
  '운영툴 결정 기록(티켓 20260930_1816). 추가만 한다(수정·삭제 API 없음). 에이전트의 학습 재료라 시험 묶음이 아니면 지우지 않는다. 어드민 API 전용(service_role만 접근).';
COMMENT ON COLUMN public.ops_decisions.action IS '결정 종류. 이 티켓은 submit만 쓴다(뒤 티켓이 값을 더하므로 CHECK 없음).';
COMMENT ON COLUMN public.ops_decisions.actor IS '관리자 ID 또는 token:<에이전트 이름>(토큰 제출의 author는 자기 신고라 신뢰하지 않는다).';
COMMENT ON COLUMN public.ops_decisions.slack_result IS '슬랙 알림 결과({ ok, error? }). 알림 실패는 요청을 실패시키지 않고 여기에 남긴다.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename IN ('ops_bundles', 'ops_bundle_items', 'ops_decisions'); -- 3행, 모두 true
-- SELECT count(*) FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN ('ops_bundles', 'ops_bundle_items', 'ops_decisions'); -- 0이어야 정상

-- 되돌림 SQL
-- DROP TABLE IF EXISTS public.ops_decisions;
-- DROP TABLE IF EXISTS public.ops_bundle_items;
-- DROP TABLE IF EXISTS public.ops_bundles;
