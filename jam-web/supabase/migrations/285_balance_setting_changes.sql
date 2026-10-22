-- 285_balance_setting_changes.sql
-- JAM 2.0 어드민 «밸런스 설정» 화면의 변경 이력 표 (티켓 20261022_1132, 상위 20261022_1131, 운영 로직 19.1절)
--
-- 새 표 1개만 덧붙인다. 옛 표·옛 칸·옛 함수는 바꾸지 않는다. 설정 표(jam_policy·capsule_policy·capsule_chapter_costs)에는 트리거를 달지 않는다.
-- 설정 표를 바꾸는 저장 API(PUT /api/admin/balance/[section])가 같은 요청 안에서 이 표에 한 줄을 쓴다. 옛 프로덕션 코드는 이 표를 모르고 계속 동작한다.
-- 번호 285: 7-6 브랜치(미푸시)가 275·276을 쓰고 277 이후도 더 쓸 수 있어 넉넉히 떼어 두었다. 번호는 이름일 뿐 서로 의존하지 않는다.
--
-- 배경
--   - 운영 로직 19.1절은 밸런스 수치를 어드민 설정으로 두고 코드 수정 없이 바꾸라고 정했다. 바꾼 사람·시각·값(이전 → 새)을 남겨야 하는데
--     설정 값 변경 이력 표가 없다(user_tribe_changes·ops_decisions·engine_decision_log·item_issue_log는 모두 용도 전용이다).
--   - 구역 키(section_key)로 잼·동기화·캡슐(7-1)과 뒤따르는 구역(7-2~7-4)이 이 표 하나를 함께 쓴다. 구역 목록을 바꿀 때 마이그레이션이 필요 없도록
--     section_key에 값 목록 CHECK를 두지 않는다.
--
-- 규칙
--   - balance_setting_changes: 저장 한 번에 한 행. 쓰는 곳은 저장 API 하나다.
--       section_key         구역 키(앱 상수. 예: jam). 값 목록 CHECK 없음
--       changes             바뀐 칸 목록. JSON 배열이고 한 줄 이상이다. 한 줄은 { "field": 칸 이름, "from": 이전 값, "to": 새 값 }.
--                           행 단위 설정(챕터별 채울 양)은 칸 이름을 'chapter:3'처럼 쓴다
--       note                변경 메모(선택, 200자 이하)
--       affects_disclosure  확률 안내 페이지에 반영되는 칸이 바뀐 저장인지
--       changed_by          바꾼 어드민. 어드민 계정이 지워지면 NULL이다(이력은 남는다). 화면에는 표시 이름(username)만 보이고 ID·이메일은 싣지 않는다
--   - RLS를 켜고 정책을 두지 않는다. anon·authenticated 권한은 회수한다. 서버(service_role)만 읽고 쓴다.
--   - 쌓인 행은 지우거나 고치지 않는다(추가만). 앱도 insert와 select만 한다.
--
-- 적용 전 확인 쿼리(읽기 전용 SELECT):
--   SELECT to_regclass('public.balance_setting_changes');                                                                  -- NULL (아직 없음)
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT to_regclass('public.balance_setting_changes');                                                                  -- balance_setting_changes
--   SELECT relname, relrowsecurity FROM pg_class WHERE oid = 'public.balance_setting_changes'::regclass;                   -- balance_setting_changes, true
--   SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'balance_setting_changes';                -- 0 (정책 없음)
--   SELECT has_table_privilege('authenticated','public.balance_setting_changes','SELECT'),
--          has_table_privilege('anon','public.balance_setting_changes','SELECT'),
--          has_table_privilege('service_role','public.balance_setting_changes','SELECT');                                  -- false, false, true
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.balance_setting_changes'::regclass AND contype IN ('f','c') ORDER BY conname;                -- 외래 키 1개(changed_by SET NULL), CHECK 3개
--   SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'balance_setting_changes' ORDER BY indexname;
--                                                                                                                          -- balance_setting_changes_pkey, idx_balance_setting_changes_section
--   SELECT count(*) FROM public.balance_setting_changes;                                                                    -- 0

CREATE TABLE IF NOT EXISTS public.balance_setting_changes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key        TEXT NOT NULL CHECK (char_length(section_key) BETWEEN 1 AND 50),
  changes            JSONB NOT NULL CHECK (jsonb_typeof(changes) = 'array' AND jsonb_array_length(changes) >= 1),
  note               TEXT CHECK (note IS NULL OR char_length(note) <= 200),
  affects_disclosure BOOLEAN NOT NULL DEFAULT false,
  changed_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.balance_setting_changes IS
  '어드민 밸런스 설정 화면의 변경 이력(누가·언제·어느 구역의 어떤 칸을 어떤 값에서 어떤 값으로·메모). 저장 API가 설정 표를 바꾸는 같은 요청에서 한 줄을 쓴다. 서버(service_role)만 읽고 쓴다. 티켓 20261022_1132.';
COMMENT ON COLUMN public.balance_setting_changes.section_key IS
  '구역 키(앱 상수). 구역을 더할 때 마이그레이션이 필요 없도록 CHECK로 값을 제한하지 않는다.';
COMMENT ON COLUMN public.balance_setting_changes.changes IS
  '바뀐 칸 목록. JSON 배열의 한 줄은 {field, from, to}. 챕터별 채울 양은 field를 chapter:3처럼 쓴다.';
COMMENT ON COLUMN public.balance_setting_changes.affects_disclosure IS
  '확률 안내 페이지에 반영되는 칸이 포함된 저장인지.';
COMMENT ON COLUMN public.balance_setting_changes.changed_by IS
  '바꾼 어드민. users에서 지워지면 NULL.';

-- 구역 화면의 «최근 변경»이 구역 하나의 이력을 최신순으로 읽는다
CREATE INDEX IF NOT EXISTS idx_balance_setting_changes_section
  ON public.balance_setting_changes (section_key, created_at DESC);

ALTER TABLE public.balance_setting_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.balance_setting_changes FROM anon, authenticated;

-- 되돌림 SQL
-- 새 표만 지운다. 옛 객체는 바꾸지 않았으므로 다른 되돌림은 없다.
-- 쌓인 변경 이력은 표를 지울 때 함께 사라진다(되돌리기 전에 필요하면 백업한다). 새 앱 코드(lib/admin/balance/, /api/admin/balance/, /admin/balance)도 같은 시점에 되돌려야 한다.
-- 코드가 먼저 나가고 표가 없으면 이력 쓰기가 실패해 저장이 막히므로, 적용은 DB 먼저·코드 push는 나중이다.
-- DROP TABLE IF EXISTS public.balance_setting_changes;
