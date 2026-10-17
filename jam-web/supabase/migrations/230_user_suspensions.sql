-- 230_user_suspensions.sql
-- JAM 2.0 이용 정지의 상태와 이력 (티켓 20261017_1426, 운영 로직 16.1·16.4·16.7절)
--
-- 새 테이블 1개(user_suspensions)만 더한다. 옛 섀도우밴(user_shadow_bans)과 옛 어드민·옛 API는 건드리지 않는다.
-- 옛 프로덕션 코드는 새 테이블을 읽지 않는다. 옛 테이블 삭제(축소)는 묶음 6의 전환 단계에서 한다.
--
-- 규칙
--   - 정지는 운영자만 걸고 푼다. 걸 때 까닭(reason)이 필수다(빈 문자열·공백만은 안 된다).
--   - 정지를 걸 때마다 한 줄이 생기고, 풀면 그 줄의 lifted_at을 채운다. 줄은 지우지 않는다(이력이다).
--     한 유저의 진행 중 정지(lifted_at IS NULL)는 하나뿐이다(부분 유니크 인덱스). 다시 걸려면 먼저 풀어야 한다.
--   - 정지 기간은 [suspended_at, lifted_at)다. 그 사이에 «시작한» 활동은 풀린 뒤에 동기화해도 정산하지 않는다(앱 코드가 판정).
--     lifted_at이 NULL이면 끝나지 않은 정지다(끝나는 날 없이 걸고 고객센터에서 이야기한 결과로 푼다, 16.7절).
--   - suspended_by / lifted_by는 TEXT다(어드민 이메일 등). user_shadow_bans.created_by와 같은 방식이다.
--   - 클라이언트 정책 없음(RLS만 켠다). 서버(service_role)만 읽고 쓴다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_suspensions'::regclass;                       -- true
--   SELECT count(*) FROM public.user_suspensions;                                                                -- 0
--   SELECT indexname FROM pg_indexes WHERE tablename = 'user_suspensions' ORDER BY indexname;                    -- 3행(pk 포함)
--   (표 권한은 Supabase 기본값으로 열려 있지만 RLS 정책이 없어 클라이언트는 한 줄도 읽지 못한다. 다른 service_role 전용 표와 같다)

CREATE TABLE IF NOT EXISTS public.user_suspensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspended_by TEXT NOT NULL,
  lifted_at TIMESTAMPTZ,
  lifted_by TEXT,
  lift_note TEXT,
  CONSTRAINT user_suspensions_lift_after_suspend CHECK (lifted_at IS NULL OR lifted_at >= suspended_at)
);

-- 유저당 진행 중인 정지는 하나뿐이다
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_suspensions_active
  ON public.user_suspensions (user_id) WHERE lifted_at IS NULL;

-- 한 유저의 정지 이력을 시각순으로 읽는다(정지 기간 판정, 어드민 이력)
CREATE INDEX IF NOT EXISTS idx_user_suspensions_user_suspended
  ON public.user_suspensions (user_id, suspended_at DESC);

-- 클라이언트 정책 없음(RLS만 켠다) = service_role만 접근 가능
ALTER TABLE public.user_suspensions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_suspensions IS
  '이용 정지 상태와 이력. 정지를 걸 때마다 한 줄, 풀면 lifted_at을 채운다. 운영 로직 16.1·16.4절. service_role 전용.';
COMMENT ON COLUMN public.user_suspensions.reason IS '정지 까닭(필수). 유저에게 안내로 보여 준다.';
COMMENT ON COLUMN public.user_suspensions.suspended_at IS '정지를 건 시각. 이 시각부터 풀린 시각까지 시작한 활동은 풀린 뒤에도 정산하지 않는다.';
COMMENT ON COLUMN public.user_suspensions.lifted_at IS '정지를 푼 시각. NULL이면 진행 중인 정지다.';
COMMENT ON COLUMN public.user_suspensions.lift_note IS '정지를 푼 까닭이나 고객센터 상담 결과 메모(선택).';

-- 되돌림 SQL
-- 새로 만든 테이블만 지운다. 정지 이력(걸고 푼 기록)이 함께 사라지므로 운영 데이터가 생긴 뒤에는 백업 후 실행한다.
-- 이 테이블을 읽는 새 코드(정지 검사, 정지 기간 활동 미정산, 어드민 제재 탭)는 같은 시점에 되돌려야 한다.
-- DROP TABLE IF EXISTS public.user_suspensions;
