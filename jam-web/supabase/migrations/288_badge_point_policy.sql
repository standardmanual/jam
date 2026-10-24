-- 288_badge_point_policy.sql
-- JAM 2.0 어드민 «밸런스 설정» 화면의 «배지와 포인트» 구역이 저장하는 배지 포인트 일괄 값 표 (티켓 20261022_1135 1회, 상위 20261022_1131, 운영 로직 10.5·11.4·14.1·19.1절)
--
-- 새 표 1개만 덧붙인다. 기존 표·열·함수는 바꾸지 않는다(추가만). 기존 배지의 `badges.point_reward`도 이 파일은 건드리지 않는다.
-- 기존 배지에 일괄 값을 적용하는 일은 별도 SQL(2회, 289·290)이 맡고, 사용자 승인 뒤에 따로 실행한다.
-- 번호 288: 285(변경 이력 표)·286·287 다음 빈 번호다. staging 최대 번호가 287인 것을 확인하고 정했다.
--
-- 배경
--   - 운영 로직은 배지가 주는 포인트를 한 세트로 정했다: 액티비티(등급형·반복형)·체크인·아이템 배지가 모두 Common 10·Rare 20·Epic 50·Mystic 100이고,
--     레벨형 액티비티는 레벨마다 10, 숨김 배지는 0이다(10.5·11.4·14.1절). 이 값은 마이그레이션 253이 아이템·체크인 행에 한 번 넣었을 뿐,
--     저장하는 자리와 설정 화면과 배지 양식의 기본값이 없다. 이 표가 «저장하는 자리»다.
--   - 지급 코드는 모두 배지를 받는 때 `badges.point_reward`를 읽어 한 번 지급한다. 이 표를 바꿔도 이미 있는 배지의 포인트는 자동으로 바뀌지 않고,
--     이미 받은 배지에는 소급되지 않는다. 이 표의 값은 새 배지 양식의 기본값과 배지 생성 API가 포인트를 생략했을 때 채우는 값으로만 읽힌다.
--
-- 규칙
--   - badge_point_policy: id=1 한 행짜리 싱글톤(inventory_policy·combine_policy와 같은 패턴). 5칸 모두 0 이상 정수다.
--       common_points   Common 배지의 포인트 (기본 10)
--       rare_points     Rare 배지의 포인트 (기본 20)
--       epic_points     Epic 배지의 포인트 (기본 50)
--       mystic_points   Mystic 배지의 포인트 (기본 100)
--       leveled_points  레벨형 액티비티 배지의 레벨마다 포인트 (기본 10)
--       updated_at      마지막으로 저장한 시각. 갱신 트리거가 없어 저장 API가 직접 올리고, 화면은 이 값으로 동시 수정을 가른다
--     숨김 배지는 마이그레이션 243의 badges_hidden_no_points 제약으로 항상 0이라 이 표에 칸이 없다.
--   - RLS를 켜고 정책을 두지 않는다. anon·authenticated 권한은 회수한다. 서버(service_role)만 읽고 쓴다.
--   - 읽는 코드가 표나 행이 없거나 값이 비정상이면 코드 기본값(10·20·50·100·10)으로 대체한다. 그래서 코드가 표보다 먼저 나가도 배지 양식과 생성 API는 멈추지 않는다.
--
-- 적용 전 확인 쿼리(읽기 전용 SELECT):
--   SELECT to_regclass('public.badge_point_policy');                                                                       -- NULL (아직 없음)
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT to_regclass('public.badge_point_policy');                                                                       -- badge_point_policy
--   SELECT relname, relrowsecurity FROM pg_class WHERE oid = 'public.badge_point_policy'::regclass;                        -- badge_point_policy, true
--   SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'badge_point_policy';                     -- 0 (정책 없음)
--   SELECT has_table_privilege('authenticated','public.badge_point_policy','SELECT'),
--          has_table_privilege('anon','public.badge_point_policy','SELECT'),
--          has_table_privilege('service_role','public.badge_point_policy','SELECT');                                       -- false, false, true
--   SELECT count(*) FROM public.badge_point_policy;                                                                         -- 1
--   SELECT id, common_points, rare_points, epic_points, mystic_points, leveled_points FROM public.badge_point_policy;      -- 1, 10, 20, 50, 100, 10
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.badge_point_policy'::regclass AND contype = 'c' ORDER BY conname;                             -- CHECK 6개(id = 1, 포인트 5칸 >= 0)

CREATE TABLE IF NOT EXISTS public.badge_point_policy (
  id             INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  common_points  INTEGER NOT NULL DEFAULT 10  CHECK (common_points >= 0),
  rare_points    INTEGER NOT NULL DEFAULT 20  CHECK (rare_points >= 0),
  epic_points    INTEGER NOT NULL DEFAULT 50  CHECK (epic_points >= 0),
  mystic_points  INTEGER NOT NULL DEFAULT 100 CHECK (mystic_points >= 0),
  leveled_points INTEGER NOT NULL DEFAULT 10  CHECK (leveled_points >= 0),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.badge_point_policy IS
  '배지 포인트 일괄 값(id=1 한 행). 새 배지 양식의 포인트 기본값과, 배지 생성 API가 point_reward를 생략했을 때 채우는 값이다. 이미 있는 배지의 point_reward는 바꾸지 않는다. 서버(service_role)만 읽고 쓴다. 티켓 20261022_1135.';
COMMENT ON COLUMN public.badge_point_policy.common_points IS 'Common 배지의 포인트 기본값 (0 이상 정수, 기본 10).';
COMMENT ON COLUMN public.badge_point_policy.rare_points IS 'Rare 배지의 포인트 기본값 (0 이상 정수, 기본 20).';
COMMENT ON COLUMN public.badge_point_policy.epic_points IS 'Epic 배지의 포인트 기본값 (0 이상 정수, 기본 50).';
COMMENT ON COLUMN public.badge_point_policy.mystic_points IS 'Mystic 배지의 포인트 기본값 (0 이상 정수, 기본 100).';
COMMENT ON COLUMN public.badge_point_policy.leveled_points IS '레벨형 액티비티 배지의 레벨마다 포인트 기본값 (0 이상 정수, 기본 10). 숨김 배지는 제약상 항상 0이라 칸이 없다.';
COMMENT ON COLUMN public.badge_point_policy.updated_at IS '마지막 저장 시각. 갱신 트리거가 없어 저장 API가 직접 올린다.';

ALTER TABLE public.badge_point_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.badge_point_policy FROM anon, authenticated;

INSERT INTO public.badge_point_policy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 되돌림 SQL
-- 새 표만 지운다. 기존 객체는 바꾸지 않았으므로 다른 되돌림은 없다.
-- 이 표의 값은 저장된 일괄 값 5개뿐이다(되돌리기 전에 필요하면 SELECT로 적어 둔다). 새 앱 코드(lib/badge/pointPolicy.ts, lib/admin/balance/badgepoints.ts)가 먼저 나가 있어도
-- 읽기는 표가 없으면 코드 기본값으로 대체하고 구역 저장만 실패하므로, 적용은 DB 먼저·코드 push는 나중이 안전하다.
-- DROP TABLE IF EXISTS public.badge_point_policy;
