-- 258_user_tribe_changes.sql
-- JAM 2.0 입장: 어드민이 유저의 트라이브를 바꾼 기록 표 (티켓 20261021_1247 2회, 상위 20261021_1246, 운영 로직 2.4절)
--
-- 새 표 1개만 덧붙인다. 옛 표·옛 칸·옛 함수는 바꾸지 않는다. 옛 프로덕션 코드는 이 표를 모르고 계속 동작한다.
--
-- 배경
--   - 운영 로직 2.4절은 트라이브를 운영자가 바꿀 때 «누가·언제·어느 트라이브에서 어느 트라이브로·왜»를 남기라고 정했다.
--     지금은 변경 이력을 남길 표가 없다(공통 어드민 변경 기록 표도 없다). 사용자 결정 8(2026-10-21): 트라이브 변경 전용 표를 새로 만든다.
--     포인트·권한 등 다른 어드민 조치의 기록과 공통 기록 표는 이 티켓 범위 밖이다.
--   - 사유는 앱의 고정 목록(코드)과 «기타» 메모로 받는다(사용자 결정 9). 목록을 바꿀 때 마이그레이션이 필요 없도록 reason_code에 CHECK를 두지 않는다.
--
-- 규칙
--   - user_tribe_changes: 변경 한 번에 한 행. 쓰는 곳은 259의 admin_change_user_tribe 하나다(트라이브 갱신·참가 취소와 같은 트랜잭션).
--       user_id                  바뀐 유저. 유저를 지우면 기록도 함께 지워진다(탈퇴, mission_participation_cancellations와 같다)
--       from_tribe_id            바뀌기 전 트라이브. 트라이브가 없는 유저는 바꿀 수 없으므로(no_tribe) 항상 있다
--       to_tribe_id              바뀐 트라이브
--       reason_code, memo        사유 코드(앱 상수)와 메모. 메모는 «기타»일 때 필수(앱이 검사)
--       changed_by               바꾼 어드민. 어드민 계정이 users에 없거나 지워지면 NULL이다(변경 자체는 실패하지 않는다)
--       cancelled_mission_count  이 변경으로 취소된 미션 참가 수
--     from_tribe_id·to_tribe_id는 ON DELETE 미지정(NO ACTION)이다. 변경 이력이 있는 트라이브를 지우면 이력이 «어디서 어디로»를 잃으므로
--     DELETE 자체가 실패하게 둔다. 앱의 트라이브 삭제 가드(lib/admin/reference-guards.ts)도 이 참조를 막는 참조로 등록한다.
--   - RLS를 켜고 정책을 두지 않는다. anon·authenticated 권한은 회수한다. 서버(service_role)만 읽고 쓴다.
--
-- 적용 전 확인 쿼리(읽기 전용 SELECT):
--   SELECT to_regclass('public.user_tribe_changes');                                                                     -- NULL (아직 없음)
--   SELECT count(*) FROM public.users WHERE tribe_id IS NULL;                                                             -- 참고용: 트라이브를 고르지 않은 유저 수
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT to_regclass('public.user_tribe_changes');                                                                     -- user_tribe_changes
--   SELECT relname, relrowsecurity FROM pg_class WHERE oid = 'public.user_tribe_changes'::regclass;                      -- user_tribe_changes, true
--   SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_tribe_changes';                   -- 0 (정책 없음)
--   SELECT has_table_privilege('authenticated','public.user_tribe_changes','SELECT'),
--          has_table_privilege('anon','public.user_tribe_changes','SELECT'),
--          has_table_privilege('service_role','public.user_tribe_changes','SELECT');                                     -- false, false, true
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.user_tribe_changes'::regclass AND contype = 'f' ORDER BY conname;                          -- 외래 키 4개(user_id CASCADE, from/to_tribe_id NO ACTION, changed_by SET NULL)
--   SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'user_tribe_changes' ORDER BY indexname; -- idx_user_tribe_changes_user, user_tribe_changes_pkey
--   SELECT count(*) FROM public.user_tribe_changes;                                                                       -- 0

CREATE TABLE IF NOT EXISTS public.user_tribe_changes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  from_tribe_id           UUID NOT NULL REFERENCES public.tribes(id),
  to_tribe_id             UUID NOT NULL REFERENCES public.tribes(id),
  reason_code             TEXT NOT NULL,
  memo                    TEXT,
  changed_by              UUID REFERENCES public.users(id) ON DELETE SET NULL,
  cancelled_mission_count INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_tribe_changes IS
  '어드민이 유저의 트라이브를 바꾼 기록(누가·언제·어디서 어디로·왜·취소된 미션 수). admin_change_user_tribe가 트라이브 갱신·참가 취소와 한 트랜잭션으로 쓴다. 서버(service_role)만 읽고 쓴다. 티켓 20261021_1247.';
COMMENT ON COLUMN public.user_tribe_changes.reason_code IS
  '사유 코드(앱 상수). 목록을 바꿀 때 마이그레이션이 필요 없도록 CHECK를 두지 않는다.';
COMMENT ON COLUMN public.user_tribe_changes.changed_by IS
  '바꾼 어드민. users에 없거나 지워지면 NULL.';

-- 유저 상세의 «최근 변경 이력»이 유저 한 명의 기록을 최신순으로 읽는다
CREATE INDEX IF NOT EXISTS idx_user_tribe_changes_user
  ON public.user_tribe_changes (user_id, created_at DESC);

ALTER TABLE public.user_tribe_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_tribe_changes FROM anon, authenticated;

-- 되돌림 SQL
-- 새 표만 지운다. 옛 객체는 바꾸지 않았으므로 다른 되돌림은 없다. 259의 함수를 먼저 지우고(DROP FUNCTION IF EXISTS public.admin_change_user_tribe(UUID, UUID, UUID, TEXT, TEXT)) 표를 지운다.
-- 쌓인 변경 기록은 표를 지울 때 함께 사라진다(되돌리기 전에 필요하면 백업한다). 새 앱 코드(user-tribe.ts, /api/admin/users/[id]/tribe, 삭제 가드의 user_tribe_changes)도 같은 시점에 되돌려야 한다.
-- DROP TABLE IF EXISTS public.user_tribe_changes;
