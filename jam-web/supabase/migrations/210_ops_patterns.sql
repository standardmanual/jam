-- 210: ops_patterns · ops_pattern_taste_signals · ops_pattern_common_rules 신규 — 운영툴의 패턴 사전 (티켓 20261001_2056, 상위 20260930_1503 ①)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 민지 판정과 사용자 승인 뒤 오케스트레이터(카리나)가 처리한다.
--    Supabase는 staging·프로덕션 공용 단일 DB라 실행 즉시 프로덕션에 생긴다.
--
-- 배경:
--   운영 패턴 사전의 원천은 툴(DB)이다(docs/service/prd/ops-tool/PRD.md §10.1, 07 블루프린트 4.7).
--   에이전트는 읽기 API로 패턴을 가져오고, 사용자는 S5에서 패턴을 만들고 고친다.
--   패턴 제안은 받은 기획함에서 승인하고, 승인하는 순간 이 사전에 들어간다.
--
-- 설계:
--   - 새 테이블 3개만 만든다. 기존 테이블은 바꾸지 않는다(추가만 하는 확장 마이그레이션,
--     `db-migration-rules.md` §1). 백필·시드는 없다(첫 패턴 입력은 티켓 1503 ③의 212).
--   - 이 파일을 읽거나 쓰는 코드는 이 조각에 없다. 코드가 DB보다 먼저 나가도 동작이 바뀌지 않는다.
--   - `ops_patterns.pattern_no`: `P01`~. 번호는 재사용하지 않고 지우지 않는다(보관만).
--   - `status`: `active`(사용 중) · `paused`(쉬는 중, 이유 필수) · `archived`(보관).
--   - `card_shapes[].shape` 값은 앱이 `CARD_SHAPES`로 검사한다. 모양 목록이 늘어도 쌓인 패턴이
--     제약에 막히지 않게 DB CHECK를 두지 않는다.
--   - `updated_by`·`confirmed_by`는 관리자 ID라 읽기 API 응답에 싣지 않는다.
--   - `updated_at`은 앱이 직접 갱신한다(트리거 없음).
--   - RLS: 켜되 정책은 만들지 않는다(198·207과 같은 방식). anon/authenticated는 전부 거부되고
--     service_role(어드민 API·서버 화면)만 접근한다.
--
-- 재실행 가능(idempotent): CREATE TABLE IF NOT EXISTS · CREATE INDEX IF NOT EXISTS로 작성했다.
-- 이미 있는 테이블과 행은 건드리지 않는다.

BEGIN;

-- ── ops_patterns ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ops_patterns (
  pattern_no      TEXT        PRIMARY KEY,
  name            TEXT        NOT NULL,
  principle       TEXT        NOT NULL,
  user_experience TEXT        NOT NULL,
  menus           TEXT[]      NOT NULL DEFAULT '{}',
  samples         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  card_shapes     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  knobs           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  pitfalls        TEXT        NOT NULL DEFAULT '',
  status          TEXT        NOT NULL DEFAULT 'active',
  pause_reason    TEXT        NULL,
  origin          TEXT        NOT NULL DEFAULT 'manual',
  origin_item_id  UUID        NULL REFERENCES public.ops_bundle_items(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT        NULL,
  CONSTRAINT ops_patterns_pattern_no_check CHECK (pattern_no ~ '^P[0-9]{2,}$'),
  CONSTRAINT ops_patterns_samples_check CHECK (jsonb_typeof(samples) = 'array'),
  CONSTRAINT ops_patterns_card_shapes_check CHECK (jsonb_typeof(card_shapes) = 'array'),
  CONSTRAINT ops_patterns_knobs_check CHECK (jsonb_typeof(knobs) = 'object'),
  CONSTRAINT ops_patterns_status_check CHECK (status IN ('active', 'paused', 'archived')),
  CONSTRAINT ops_patterns_pause_reason_check CHECK (
    status <> 'paused' OR (pause_reason IS NOT NULL AND btrim(pause_reason) <> '')
  ),
  CONSTRAINT ops_patterns_origin_check CHECK (origin IN ('seed', 'manual', 'proposal'))
);

-- 같은 패턴 제안 항목이 패턴을 두 번 만들지 못하게 한다(값이 있는 행끼리만 유일).
CREATE UNIQUE INDEX IF NOT EXISTS ops_patterns_origin_item_id_key
  ON public.ops_patterns (origin_item_id)
  WHERE origin_item_id IS NOT NULL;

-- ── ops_pattern_taste_signals ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ops_pattern_taste_signals (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_no           TEXT        NULL REFERENCES public.ops_patterns(pattern_no),
  name                 TEXT        NOT NULL,
  reason               TEXT        NOT NULL,
  basis                TEXT        NOT NULL DEFAULT 'estimate',
  evidence_decision_id UUID        NULL REFERENCES public.ops_decisions(id) ON DELETE SET NULL,
  confirmed_at         TIMESTAMPTZ NULL,
  confirmed_by         TEXT        NULL,
  sort_order           INTEGER     NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ops_pattern_taste_signals_basis_check CHECK (basis IN ('estimate', 'confirmed')),
  CONSTRAINT ops_pattern_taste_signals_evidence_check CHECK (
    evidence_decision_id IS NULL OR basis = 'confirmed'
  ),
  CONSTRAINT ops_pattern_taste_signals_confirmed_at_check CHECK (
    basis = 'estimate' OR confirmed_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_ops_pattern_taste_signals_pattern_no
  ON public.ops_pattern_taste_signals (pattern_no);

-- 시드(티켓 1503 ③)를 다시 돌려도 같은 취향 신호가 겹쳐 쌓이지 않게 한다. 공통(NULL)은 빈 문자열로 묶는다.
CREATE UNIQUE INDEX IF NOT EXISTS ops_pattern_taste_signals_pattern_name_key
  ON public.ops_pattern_taste_signals ((COALESCE(pattern_no, '')), name);

-- ── ops_pattern_common_rules ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ops_pattern_common_rules (
  rule_no    INTEGER     PRIMARY KEY,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT        NULL,
  CONSTRAINT ops_pattern_common_rules_rule_no_check CHECK (rule_no > 0)
);

-- RLS: 정책을 만들지 않는다 = anon/authenticated 전부 거부, service_role만 접근.
ALTER TABLE public.ops_patterns              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_pattern_taste_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_pattern_common_rules  ENABLE ROW LEVEL SECURITY;

-- ── 설명 ────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.ops_patterns IS
  '운영툴의 패턴 사전(티켓 20261001_2056, 상위 20260930_1503). 에이전트가 읽기 API로 가져오고 사용자는 S5에서 만들고 고친다. 어드민 API·서버 화면 전용(service_role만 접근).';
COMMENT ON COLUMN public.ops_patterns.pattern_no IS '패턴 번호(P01~). 재사용하지 않고 지우지 않는다(보관만). 홈피드 유형 번호 T01과 구분한다.';
COMMENT ON COLUMN public.ops_patterns.principle IS '작동 원리.';
COMMENT ON COLUMN public.ops_patterns.user_experience IS '유저가 겪는 것.';
COMMENT ON COLUMN public.ops_patterns.menus IS '이 패턴이 쓰는 메뉴·옵션.';
COMMENT ON COLUMN public.ops_patterns.samples IS '샘플 배열 [{ no, name, role, impl }]. role은 main(주)·aux(보조 장치)·related(걸침). impl은 샘플별 구현.';
COMMENT ON COLUMN public.ops_patterns.card_shapes IS '쓰는 카드 모양 배열 [{ shape, note }]. shape 값은 앱이 CARD_SHAPES로 검사하고 DB CHECK는 없다.';
COMMENT ON COLUMN public.ops_patterns.knobs IS '손잡이 5종 { condition·place·time·reward: { open, closed }, tribe: { rule, example } }. open은 열 수 있는 값, closed는 닫은 값.';
COMMENT ON COLUMN public.ops_patterns.pitfalls IS '주의점.';
COMMENT ON COLUMN public.ops_patterns.status IS 'active(사용 중, 조합 뽑기에 나온다) · paused(쉬는 중, 조합 뽑기에서만 빠진다) · archived(보관, 읽기 응답 기본 제외).';
COMMENT ON COLUMN public.ops_patterns.pause_reason IS '쉬는 중인 이유 한 줄. status가 paused이면 공백 아닌 값이 필수다.';
COMMENT ON COLUMN public.ops_patterns.origin IS '들어온 경로. seed(첫 입력) · manual(S5에서 직접) · proposal(패턴 제안 승인).';
COMMENT ON COLUMN public.ops_patterns.origin_item_id IS '패턴 제안 승인으로 들어왔다면 그 묶음 항목. 값이 있는 행끼리 유일하다.';
COMMENT ON COLUMN public.ops_patterns.updated_by IS '마지막으로 고친 관리자 ID. API 응답에 싣지 않는다.';

COMMENT ON TABLE public.ops_pattern_taste_signals IS
  '패턴의 취향 신호(티켓 20261001_2056). pattern_no가 NULL이면 공통 취향 신호다. 폐기한 방향의 이유는 처음에 추정(estimate)이고 운영자가 확정(confirmed)한다. service_role만 접근.';
COMMENT ON COLUMN public.ops_pattern_taste_signals.pattern_no IS '패턴 번호. NULL이면 모든 패턴에 걸치는 공통 취향 신호.';
COMMENT ON COLUMN public.ops_pattern_taste_signals.name IS '방향 이름.';
COMMENT ON COLUMN public.ops_pattern_taste_signals.reason IS '이유.';
COMMENT ON COLUMN public.ops_pattern_taste_signals.basis IS 'estimate(추정) · confirmed(확정). 읽기 응답은 둘을 구분해 싣는다.';
COMMENT ON COLUMN public.ops_pattern_taste_signals.evidence_decision_id IS '근거로 붙인 반려 기록(결정 기록 1건). confirmed일 때만 값이 있을 수 있다.';
COMMENT ON COLUMN public.ops_pattern_taste_signals.confirmed_at IS '확정한 시각. confirmed이면 값이 필수다.';
COMMENT ON COLUMN public.ops_pattern_taste_signals.confirmed_by IS '확정한 관리자 ID. API 응답에 싣지 않는다.';

COMMENT ON TABLE public.ops_pattern_common_rules IS
  '모든 패턴에 적용하는 공통 규칙(티켓 20261001_2056). service_role만 접근.';
COMMENT ON COLUMN public.ops_pattern_common_rules.rule_no IS '공통 규칙 번호(1~).';
COMMENT ON COLUMN public.ops_pattern_common_rules.updated_by IS '마지막으로 고친 관리자 ID. API 응답에 싣지 않는다.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 세 테이블 모두 RLS가 켜졌는지(3행, rowsecurity = true)
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename IN ('ops_patterns', 'ops_pattern_taste_signals', 'ops_pattern_common_rules')
--   ORDER BY tablename;
--
-- -- ② 정책이 없는지(0이어야 정상)
-- SELECT count(*) FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('ops_patterns', 'ops_pattern_taste_signals', 'ops_pattern_common_rules');
--
-- -- ③ 상태·출처·근거 CHECK 정의(status: active·paused·archived / origin: seed·manual·proposal / basis: estimate·confirmed)
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname IN ('ops_patterns_status_check', 'ops_patterns_origin_check',
--                     'ops_patterns_pause_reason_check', 'ops_pattern_taste_signals_basis_check',
--                     'ops_pattern_taste_signals_evidence_check', 'ops_pattern_taste_signals_confirmed_at_check')
--   ORDER BY conname;
--
-- -- ④ 행 수(세 값 모두 0이어야 정상 — 이 마이그레이션은 시드를 넣지 않는다)
-- SELECT (SELECT count(*) FROM public.ops_patterns) AS patterns,
--        (SELECT count(*) FROM public.ops_pattern_taste_signals) AS taste_signals,
--        (SELECT count(*) FROM public.ops_pattern_common_rules) AS common_rules;

-- 되돌림 SQL
-- 되돌리기 전에 사람이 쓴 내용이 있는지 확인한다. 아래 두 값이 0이 아니면 되돌리는 순간 사람이 쓴 패턴과 확정한 취향 신호가 사라진다.
--   SELECT count(*) FROM public.ops_patterns WHERE origin <> 'seed';
--   SELECT count(*) FROM public.ops_pattern_taste_signals WHERE basis = 'confirmed';
-- 순서는 취향 신호(→ 패턴을 가리킨다) → 패턴 → 공통 규칙이다.
-- DROP TABLE IF EXISTS public.ops_pattern_taste_signals;
-- DROP TABLE IF EXISTS public.ops_patterns;
-- DROP TABLE IF EXISTS public.ops_pattern_common_rules;
