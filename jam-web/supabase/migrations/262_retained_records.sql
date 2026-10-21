-- 262_retained_records.sql
-- JAM 2.0 퇴장: 계정을 지워도 법이 보관을 요구하는 기록을 남기는 보관 표 (티켓 20261021_1249 1회, 상위 20261021_1246, 운영 로직 17장)
--
-- 새 표 1개만 덧붙인다. 옛 표와 외래키·제약은 바꾸지 않는다. 표를 채우는 함수는 263_prepare_account_deletion.sql이 만든다(이 파일만 적용하면 표는 비어 있다).
--
-- 규칙
--   - 계정을 지우는 순간에만 복사한다. 평소에는 이 표에 아무것도 쓰지 않는다.
--   - 복사 대상은 위치정보 확인자료(체크인 배지 획득, 장소 열람, 드랍과 픽업)와 부정 이용 탐지 기록이다. 확인자료는 식별자와 시각만 담고 좌표·활동 이름·거리는 담지 않는다.
--     부정 이용 탐지 기록만 방침대로 탐지 시점 좌표가 든 detail을 그대로 담는다.
--   - 기간은 확인자료 6개월(위치정보 이용약관 제5조), 부정 이용 탐지 기록 3개월(개인정보 처리방침)이다. retained_until은 기록 시각 + 기간이다.
--     법무 확인(티켓 20260929_1303)에서 기간이 바뀌면 263의 함수와 앱 상수(lib/account/retention.ts)를 함께 맞춘다.
--   - subject_user_id는 지운 유저의 id를 적어 두기만 한다. 외래키를 걸지 않는다(유저가 지워져도 행이 남아야 한다).
--   - source_id는 원본 행의 id다. 원본 행은 유저를 지울 때 함께 지워지므로 외래키가 없다. (kind, source_id)가 유일해서 같은 유저로 준비 함수를 다시 불러도 두 번 복사되지 않는다.
--   - RLS를 켜고 정책을 두지 않으며 anon·authenticated 권한을 회수한다 = service_role 전용(수사 등 요청이 오면 SQL로 조회한다). 어드민 화면은 없다.
--   - 만료된 행은 하루 한 번 크론이 지운다(purge_expired_retained_records, 263).
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT to_regclass('public.retained_records');                                                                  -- NOT NULL
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.retained_records'::regclass;                             -- true
--   SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retained_records';                 -- 0
--   SELECT has_table_privilege('anon','public.retained_records','SELECT'),
--          has_table_privilege('authenticated','public.retained_records','SELECT'),
--          has_table_privilege('service_role','public.retained_records','SELECT');                                  -- false, false, true
--   SELECT count(*) FROM public.retained_records;                                                                    -- 0 (263을 부르기 전까지 비어 있다)

CREATE TABLE IF NOT EXISTS public.retained_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL CHECK (kind IN ('checkin_earn', 'poi_view', 'poi_drop', 'poi_pickup', 'abuse_log')),
  source_id       UUID NOT NULL,
  subject_user_id UUID NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL,
  detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
  retained_until  TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT retained_records_kind_source_key UNIQUE (kind, source_id)
);

CREATE INDEX IF NOT EXISTS idx_retained_records_retained_until
  ON public.retained_records (retained_until);

ALTER TABLE public.retained_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.retained_records FROM PUBLIC;
REVOKE ALL ON TABLE public.retained_records FROM anon, authenticated;

COMMENT ON TABLE public.retained_records IS
  '계정을 지울 때 법이 보관을 요구하는 기록(위치정보 확인자료 6개월, 부정 이용 탐지 기록 3개월)을 복사해 두는 표. 지울 때만 쓰고 만료되면 크론이 지운다. subject_user_id에는 외래키가 없다. RLS 켬 + 정책 없음 = service_role 전용. 티켓 20261021_1249.';

-- 되돌림 SQL
-- 263(prepare_account_deletion, purge_expired_retained_records)을 먼저 되돌린다. 이 표를 쓰는 앱 코드(lib/account/delete-account.ts)도 같은 시점에 되돌린다(앱이 남아 있으면 준비 단계가 실패해 계정을 지울 수 없다).
-- 행이 있으면 법정 보관 의무 기록을 잃으므로 마이그레이션 257처럼 행이 있을 때는 예외로 멈춘다. 행이 있는데 지워야 하면 먼저 따로 내보낸다.
-- DO $$
-- DECLARE
--   v_rows BIGINT;
-- BEGIN
--   IF to_regclass('public.retained_records') IS NOT NULL THEN
--     EXECUTE 'SELECT count(*) FROM public.retained_records' INTO v_rows;
--     IF v_rows > 0 THEN
--       RAISE EXCEPTION 'retained_records에 행이 % 개 있어 삭제를 멈춥니다. 보관 의무 기록을 먼저 내보내세요.', v_rows;
--     END IF;
--   END IF;
-- END
-- $$;
--
-- DROP TABLE IF EXISTS public.retained_records;
