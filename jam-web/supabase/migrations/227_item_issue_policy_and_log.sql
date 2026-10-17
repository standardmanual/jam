-- 227_item_issue_policy_and_log.sql
-- JAM 2.0 동기화 아이템 배지 발급의 조정 값과 발급 기록 (티켓 20261017_1424, 운영 로직 6.2·6.6·6.7절)
--
-- (1) jam_policy(226, 한 행 싱글톤)에 동기화 아이템 배지 발급 칸을 더한다. 전부 NOT NULL DEFAULT라 기존 행에는 기본값이
--     채워지고, 칸 이름을 모르는 코드는 영향을 받지 않는다.
-- (2) 새 테이블 1개(item_issue_log): 아이템 배지를 줄 때마다 한 줄씩 남기는 기록. 옛 인벤토리 테이블·함수
--     (inventory_items, grant_inventory_item)은 건드리지 않는다.
-- 기존 객체와 옛 drop_policy 행은 바꾸지 않는다. 옛 프로덕션 코드는 새 칸·새 테이블을 읽지 않는다.
--
-- 규칙(운영 로직 6.2절)
--   - 개수: 인정되는 활동마다 sync_item_guaranteed개 확정(등산은 sync_item_guaranteed_hiking개), 보너스를
--     sync_item_bonus_rolls번 굴린다. 한 번마다 확률은 그 활동의 잼 ÷ sync_item_bonus_jam_divisor이고 sync_item_bonus_max_probability가
--     상한이다. 확정 개수를 0으로 두면 드랍이 없는 경우도 둘 수 있다.
--   - 등급: sync_rarity_*(퍼센트, 합계 100) 확률로 정한다. 보정은 «Common이 common_streak_threshold번 연속이면
--     다음은 Rare 이상» 하나다(user_drop_state.common_streak를 동기화와 캡슐이 함께 쓴다).
--   - 기본값은 src/lib/jam/policy.ts의 DEFAULT_JAM_POLICY와 반드시 같은 값을 유지한다.
--
-- item_issue_log(운영 로직 6.6절 «경로, 대상 활동, 등급, 잠김 여부, 일련번호»)
--   - route: 어떤 경로로 줬는가(예: sync). 값의 목록은 코드가 정하고 CHECK 제약을 두지 않는다(캡슐·미션·믹스가 이어서 쓴다).
--   - source_activity_id: 동기화 경로의 대상 활동(strava_activities.id 값). 외래키로 묶지 않는다(활동 행이 지워져도 기록은 남는다).
--   - inventory_item_id: 만들어진 개체. 개체가 믹스·탈퇴로 지워져도 기록은 남도록 ON DELETE SET NULL이다.
--   - locked: 잠긴 채 배정했는가. 잠김 구조는 묶음 3이라 지금은 항상 false다.
--   - 클라이언트 정책 없음(RLS만 켠다). 서버(service_role)만 읽고 쓴다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT sync_item_guaranteed, sync_item_guaranteed_hiking, sync_item_bonus_rolls, sync_item_bonus_jam_divisor,
--          sync_item_bonus_max_probability, sync_rarity_common, sync_rarity_rare, sync_rarity_epic, sync_rarity_mystic,
--          common_streak_threshold FROM public.jam_policy;     -- 1, 2, 2, 600, 0.25, 84, 13, 2.5, 0.5, 10
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.item_issue_log'::regclass;   -- true
--   SELECT count(*) FROM public.item_issue_log;                                           -- 0

ALTER TABLE public.jam_policy
  ADD COLUMN IF NOT EXISTS sync_item_guaranteed INTEGER NOT NULL DEFAULT 1 CHECK (sync_item_guaranteed >= 0),
  ADD COLUMN IF NOT EXISTS sync_item_guaranteed_hiking INTEGER NOT NULL DEFAULT 2 CHECK (sync_item_guaranteed_hiking >= 0),
  ADD COLUMN IF NOT EXISTS sync_item_bonus_rolls INTEGER NOT NULL DEFAULT 2 CHECK (sync_item_bonus_rolls >= 0),
  ADD COLUMN IF NOT EXISTS sync_item_bonus_jam_divisor INTEGER NOT NULL DEFAULT 600 CHECK (sync_item_bonus_jam_divisor >= 1),
  ADD COLUMN IF NOT EXISTS sync_item_bonus_max_probability NUMERIC(4, 3) NOT NULL DEFAULT 0.25 CHECK (sync_item_bonus_max_probability >= 0 AND sync_item_bonus_max_probability <= 1),
  ADD COLUMN IF NOT EXISTS sync_rarity_common NUMERIC(6, 3) NOT NULL DEFAULT 84 CHECK (sync_rarity_common >= 0),
  ADD COLUMN IF NOT EXISTS sync_rarity_rare NUMERIC(6, 3) NOT NULL DEFAULT 13 CHECK (sync_rarity_rare >= 0),
  ADD COLUMN IF NOT EXISTS sync_rarity_epic NUMERIC(6, 3) NOT NULL DEFAULT 2.5 CHECK (sync_rarity_epic >= 0),
  ADD COLUMN IF NOT EXISTS sync_rarity_mystic NUMERIC(6, 3) NOT NULL DEFAULT 0.5 CHECK (sync_rarity_mystic >= 0),
  ADD COLUMN IF NOT EXISTS common_streak_threshold INTEGER NOT NULL DEFAULT 10 CHECK (common_streak_threshold >= 1);

-- 등급 확률의 합계는 100이어야 한다(운영자가 일부만 고쳐서 합계가 어긋나는 것을 막는다)
ALTER TABLE public.jam_policy DROP CONSTRAINT IF EXISTS jam_policy_sync_rarity_sum_100;
ALTER TABLE public.jam_policy ADD CONSTRAINT jam_policy_sync_rarity_sum_100
  CHECK (abs(sync_rarity_common + sync_rarity_rare + sync_rarity_epic + sync_rarity_mystic - 100) < 0.001);

COMMENT ON COLUMN public.jam_policy.sync_item_guaranteed IS '동기화 활동마다 확정으로 받는 아이템 배지 개수(등산 제외). 0이면 드랍 없음. 기본 1.';
COMMENT ON COLUMN public.jam_policy.sync_item_guaranteed_hiking IS '등산 활동의 확정 개수. 기본 2.';
COMMENT ON COLUMN public.jam_policy.sync_item_bonus_rolls IS '보너스 개수를 굴리는 횟수. 기본 2.';
COMMENT ON COLUMN public.jam_policy.sync_item_bonus_jam_divisor IS '보너스 한 번마다 확률 = 그 활동의 잼 ÷ 이 값. 기본 600.';
COMMENT ON COLUMN public.jam_policy.sync_item_bonus_max_probability IS '보너스 한 번마다 확률의 상한(0~1). 기본 0.25.';
COMMENT ON COLUMN public.jam_policy.sync_rarity_common IS '동기화 등급 확률 Common(퍼센트). 네 등급 합계 100. 기본 84.';
COMMENT ON COLUMN public.jam_policy.sync_rarity_rare IS '동기화 등급 확률 Rare(퍼센트). 기본 13.';
COMMENT ON COLUMN public.jam_policy.sync_rarity_epic IS '동기화 등급 확률 Epic(퍼센트). 기본 2.5.';
COMMENT ON COLUMN public.jam_policy.sync_rarity_mystic IS '동기화 등급 확률 Mystic(퍼센트). 기본 0.5.';
COMMENT ON COLUMN public.jam_policy.common_streak_threshold IS 'Common이 이 횟수만큼 연속이면 다음은 Rare 이상(동기화와 캡슐 합산, user_drop_state.common_streak). 기본 10.';

CREATE TABLE IF NOT EXISTS public.item_issue_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  route TEXT NOT NULL,
  source_activity_id UUID,
  badge_id UUID REFERENCES public.badges(id) ON DELETE SET NULL,
  rarity public.badge_rarity,
  locked BOOLEAN NOT NULL DEFAULT false,
  serial_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_issue_log_user_created ON public.item_issue_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_issue_log_activity ON public.item_issue_log (source_activity_id) WHERE source_activity_id IS NOT NULL;

-- 클라이언트 정책 없음(RLS만 켠다) = service_role만 접근 가능
ALTER TABLE public.item_issue_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.item_issue_log IS
  '아이템 배지 발급 기록(append-only). 경로, 대상 활동, 등급, 잠김 여부, 일련번호. 운영 로직 6.6절. service_role 전용.';
COMMENT ON COLUMN public.item_issue_log.route IS '발급 경로(sync 등). 값의 목록은 코드가 정한다.';
COMMENT ON COLUMN public.item_issue_log.source_activity_id IS '동기화 경로의 대상 활동(strava_activities.id). 외래키 없음.';
COMMENT ON COLUMN public.item_issue_log.locked IS '잠긴 채 배정했는가. 잠김 구조는 묶음 3이라 지금은 항상 false.';

-- 되돌림 SQL
-- 새로 만든 객체만 지운다. 이 칸과 테이블을 읽는 새 코드(src/lib/jam/ 정책 로더, 동기화 아이템 배지 발급)는 같은 시점에 되돌려야 한다.
-- DROP TABLE IF EXISTS public.item_issue_log;
-- ALTER TABLE public.jam_policy DROP CONSTRAINT IF EXISTS jam_policy_sync_rarity_sum_100;
-- ALTER TABLE public.jam_policy
--   DROP COLUMN IF EXISTS common_streak_threshold,
--   DROP COLUMN IF EXISTS sync_rarity_mystic,
--   DROP COLUMN IF EXISTS sync_rarity_epic,
--   DROP COLUMN IF EXISTS sync_rarity_rare,
--   DROP COLUMN IF EXISTS sync_rarity_common,
--   DROP COLUMN IF EXISTS sync_item_bonus_max_probability,
--   DROP COLUMN IF EXISTS sync_item_bonus_jam_divisor,
--   DROP COLUMN IF EXISTS sync_item_bonus_rolls,
--   DROP COLUMN IF EXISTS sync_item_guaranteed_hiking,
--   DROP COLUMN IF EXISTS sync_item_guaranteed;
