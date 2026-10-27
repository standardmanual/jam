-- 296: ops_trend_sources 신규 — 운영자가 등록하는 트렌드 출처 목록 (티켓 20261026_2033 1회차, 어드민 상황판 PRD §6.4)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 오케스트레이터(카리나)가 처리한다. Supabase는 staging·프로덕션 공용 단일 DB다.
--
-- 동기:
--   트렌드 출처(해시태그·채널·검색어 추이·직접 올린 자료)를 저장소 문서가 아니라 DB에 둔다(PRD Q2, 2026-10-27 결정).
--   어드민에서 켜고 끄면 즉시 반영되고, 루틴은 읽기 토큰으로 매번 최신 목록을 읽는다.
--   「마지막으로 읽은 시각」은 칸을 두지 않는다. 읽을 때 ops_bundles.trends[].source_ids에서 계산한다.
--
-- 변경 (확장만 한다. 기존 테이블·컬럼은 건드리지 않는다):
--   - `ops_trend_sources`: `no`는 출처 번호(자동 증가, 유일)다. 묶음의 `trends[].source_ids`가 이 번호를 가리키므로
--     행은 지우지 않고 `enabled = false`로 끈다(삭제 경로 없음).
--   - 같은 이름(앞뒤 공백·대소문자 무시) 두 번 등록은 유일 색인으로 막는다.
--   - RLS는 켜고 정책은 만들지 않는다(295와 같은 패턴): service_role만 접근한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_trend_sources (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  no          INTEGER     GENERATED ALWAYS AS IDENTITY UNIQUE,
  name        TEXT        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  kind        TEXT        NOT NULL CHECK (kind IN ('hashtag', 'channel', 'search_trend', 'manual_upload')),
  location    TEXT        NOT NULL DEFAULT '' CHECK (char_length(location) <= 300),
  enabled     BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID        NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ops_trend_sources_name ON public.ops_trend_sources (lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_ops_trend_sources_enabled ON public.ops_trend_sources (enabled);

ALTER TABLE public.ops_trend_sources ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ops_trend_sources IS
  '운영자가 등록한 트렌드 출처(티켓 20261026_2033). GET/POST /api/admin/ops-trend-sources, PATCH /api/admin/ops-trend-sources/[id]가 읽고 쓴다. 삭제하지 않고 enabled로 끈다. 어드민 API 전용(service_role만 접근).';
COMMENT ON COLUMN public.ops_trend_sources.no IS '출처 번호(자동 증가, 유일). 묶음의 trends[].source_ids와 화면의 「출처 N」이 이 번호를 쓴다.';
COMMENT ON COLUMN public.ops_trend_sources.name IS '출처 이름(앞뒤 공백 제외 1~60자). 앞뒤 공백·대소문자를 무시하고 유일하다.';
COMMENT ON COLUMN public.ops_trend_sources.kind IS '출처 종류: hashtag(해시태그) · channel(채널) · search_trend(검색어 추이) · manual_upload(직접 올린 자료).';
COMMENT ON COLUMN public.ops_trend_sources.location IS '주소·해시태그·검색어(300자 이내). 직접 올린 자료는 비워도 된다.';
COMMENT ON COLUMN public.ops_trend_sources.enabled IS 'false면 루틴용 읽기 API가 돌려주지 않는다. 행은 지우지 않는다.';
COMMENT ON COLUMN public.ops_trend_sources.created_by IS '등록한 관리자 사용자 id. 외래 키는 두지 않는다. API 응답에 싣지 않는다.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relnamespace = 'public'::regnamespace AND relname = 'ops_trend_sources'; -- 1행, true
-- SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_trend_sources'; -- 0이어야 정상
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'ops_trend_sources'; -- pkey, no 유일, uq_ops_trend_sources_name, idx_ops_trend_sources_enabled

-- 되돌림 SQL
-- DROP TABLE IF EXISTS public.ops_trend_sources;
