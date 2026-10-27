-- 297: ops_dev_requests 신규 — 어드민에서 만든 개발 요청 저장소 (티켓 20261026_2027 1회차, 어드민 상황판 PRD §8)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 오케스트레이터(카리나)가 처리한다. Supabase는 staging·프로덕션 공용 단일 DB다.
--
-- 동기:
--   생태계 상황판의 정책 패널([개발 요청])과 운영 상황판에서 만든 요청을 DB에 쌓는다. 어드민이 티켓 파일을 직접 만들지 않고,
--   카리나가 세션을 시작할 때 `requested` 요청을 읽어 티켓으로 바꾼다(티켓 frontmatter origin 기록 후 이 행을 ticketed로 갱신).
--   개발·배포 상황판(티켓 20261026_2028)은 같은 테이블을 읽어 보드 「대기」 칸에 「요청」으로 보인다.
--
-- 변경 (확장만 한다. 기존 테이블·컬럼은 건드리지 않는다):
--   - `ops_dev_requests`: `no`는 요청 번호(자동 증가, 유일)다. 행은 지우지 않고 status로 닫는다(삭제 경로 없음).
--   - `status`의 `ticketed`는 카리나가 SQL로만 정한다(API의 PATCH는 requested·dismissed만 받는다).
--   - 같은 정책(policy_id)의 열린(requested) 요청 중복은 API(store.ts)가 막는다. DB 유일 색인은 두지 않는다.
--   - RLS는 켜고 정책은 만들지 않는다(295·296과 같은 패턴): service_role만 접근한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_dev_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  no          INTEGER     GENERATED ALWAYS AS IDENTITY UNIQUE,
  title       TEXT        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  detail      TEXT        NOT NULL DEFAULT '' CHECK (char_length(detail) <= 2000),
  origin      TEXT        NOT NULL CHECK (origin IN ('ops', 'eco', 'other')),
  policy_id   TEXT        NULL CHECK (char_length(policy_id) <= 100),
  status      TEXT        NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'ticketed', 'dismissed')),
  ticket_id   TEXT        NULL CHECK (char_length(ticket_id) <= 40),
  created_by  UUID        NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_dev_requests_status_created ON public.ops_dev_requests (status, created_at DESC);

ALTER TABLE public.ops_dev_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ops_dev_requests IS
  '어드민 상황판에서 만든 개발 요청(티켓 20261026_2027). GET/POST /api/admin/dev-requests, PATCH /api/admin/dev-requests/[id]가 읽고 쓴다. 삭제하지 않고 status로 닫는다. 어드민 API 전용(service_role만 접근).';
COMMENT ON COLUMN public.ops_dev_requests.no IS '요청 번호(자동 증가, 유일). 화면의 「요청 N」이 이 번호를 쓴다.';
COMMENT ON COLUMN public.ops_dev_requests.title IS '요청 제목(앞뒤 공백 제외 1~80자).';
COMMENT ON COLUMN public.ops_dev_requests.detail IS '요청 내용(2000자 이내). 비워도 된다.';
COMMENT ON COLUMN public.ops_dev_requests.origin IS '어디서 만든 요청인지: ops(운영 상황판) · eco(생태계 상황판) · other(그 밖).';
COMMENT ON COLUMN public.ops_dev_requests.policy_id IS '생태계 정책 패널에서 만든 요청이면 policiesData.ts 항목의 id(100자 이내). 없으면 NULL.';
COMMENT ON COLUMN public.ops_dev_requests.status IS 'requested(요청됨, 기본) · ticketed(티켓으로 바꿈, 카리나가 SQL로 정함) · dismissed(접음).';
COMMENT ON COLUMN public.ops_dev_requests.ticket_id IS '티켓으로 바꾼 뒤 그 티켓 ID(40자 이내). status가 ticketed일 때 카리나가 채운다.';
COMMENT ON COLUMN public.ops_dev_requests.created_by IS '요청한 관리자 사용자 id. 외래 키는 두지 않는다. API 응답에 싣지 않는다.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relnamespace = 'public'::regnamespace AND relname = 'ops_dev_requests'; -- 1행, true
-- SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_dev_requests'; -- 0이어야 정상
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'ops_dev_requests'; -- pkey, no 유일, idx_ops_dev_requests_status_created

-- 되돌림 SQL
-- DROP TABLE IF EXISTS public.ops_dev_requests;
