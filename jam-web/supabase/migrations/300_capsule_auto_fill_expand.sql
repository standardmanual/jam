-- 300_capsule_auto_fill_expand.sql
-- 잼 자동 채움·포인트 열기 구조 개편의 DB 확장 (티켓 20261028_1732, 상위 20261028_1730, 결정 D4·D5·D6·D9·D12)
--
-- 새 표 4개와 새 열·사유만 덧붙인다(확장 단계, db-migration-rules.md 1절).
-- 옛 함수(capsule_fill·capsule_open·locked_item_*·jam_apply)의 시그니처, 옛 열(capsule_chapter_costs.fill_amount 등),
-- 옛 값은 건드리지 않는다. 옛 코드는 이 파일 적용 뒤에도 그대로 동작한다.
-- 바뀌는 CHECK 제약 넷(jam_transactions 3개, point_transactions_reason_check)은 지금 정의의 상위집합이다.
-- 포인트 잔액 0 미만 방지 제약은 넣지 않는다(266_post_release_point_wallets_balance_check.sql, 출시 뒤 실행).
-- 서버 함수(자동 채움·보류 받기·포인트 열기·서비스 잼 적립)는 U3~U6 티켓이다.
--
-- 실행 주의
--   - 한 트랜잭션으로 실행한다(CHECK 제약을 DROP 후 ADD하는 사이에 제약 없는 틈이 생기지 않게).
--   - ALTER TABLE ... ADD CONSTRAINT / DROP CONSTRAINT는 해당 표에 ACCESS EXCLUSIVE 잠금을 건다.
--     대상(jam_transactions, point_transactions)은 행이 많지 않으나, 쓰기가 몰리는 시간대를 피한다.
--   - 제약 교체 때 전체 행을 다시 검사한다. 상위집합이라 기존 행은 모두 통과해야 한다.
--   - 새 열은 모두 NULL 허용 또는 상수 DEFAULT라 표를 다시 쓰지 않는다. 백필 없음(챕터·잼 거래·캡슐 열기 0건, 2026-10-28 실측).
--   - jam_transactions에 열이 늘면 RETURNS public.jam_transactions인 jam_apply의 반환 행에 새 열이 붙는다(옛 호출부는 이름으로 읽어 영향 없음).
--
-- 적용 전 확인(읽기 전용 SELECT)
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.jam_transactions'::regclass AND contype = 'c';           -- reason_check, sign_by_reason, source_by_reason가 220 정의와 같은지
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'point_transactions_reason_check';  -- 157의 7개 사유
--   SELECT count(*) FROM public.jam_transactions;                                      -- 0
--   SELECT count(*) FROM public.capsule_chapter_costs;                                 -- 10
--   SELECT to_regclass('public.service_jam_rules'), to_regclass('public.jam_service_daily'),
--          to_regclass('public.capsule_pending_rewards'), to_regclass('public.capsule_unseen_results');  -- 모두 NULL
--
-- 적용 후 확인(읽기 전용 SELECT)
--   SELECT chapter_no, fill_amount, fill_amount_v2, advance_count FROM public.capsule_chapter_costs ORDER BY chapter_no;
--        -- fill_amount 90..220 그대로, fill_amount_v2 145,160,180,200,220,245,270,300,330,365, advance_count 6,7,7,8,9,9,10,11,12,NULL
--   SELECT service_jam_daily_cap, service_jam_weekly_cap, locked_points_common, locked_points_rare, locked_points_epic, locked_points_mystic
--     FROM public.jam_policy;                                                          -- 40, 100, 50, 100, 200, 400
--   SELECT kind, amount FROM public.service_jam_rules ORDER BY kind;                   -- 7행: locked_unlock 5, badge_earned 5, combine_success 5, mission_complete 20, collection_complete 30, drop 0, pickup 0
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('service_jam_rules','jam_service_daily','capsule_pending_rewards','capsule_unseen_results');  -- 모두 true
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname IN ('jam_transactions_reason_check','jam_transactions_sign_by_reason','jam_transactions_source_by_reason','point_transactions_reason_check');
--        -- service_activity·capsule_forfeit·locked_unlock_cost가 보인다
--   SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc
--    WHERE proname IN ('capsule_fill','capsule_open','jam_apply','locked_item_fill','locked_item_open');  -- 적용 전과 같은 행

-- ----------------------------------------------------------------
-- 1. capsule_chapter_costs — 챕터별 횟수와 새 채울 양 (D4)
--    advance_count: 이 챕터에서 캡슐이 가득 찬 횟수가 이만큼이면 다음 챕터로 간다. 마지막 챕터(10)는 NULL.
--    fill_amount_v2: 새 함수가 읽을 채울 양. 옛 fill_amount(90~220)는 지금의 수동 채우기가 읽으므로 그대로 둔다.
-- ----------------------------------------------------------------
ALTER TABLE public.capsule_chapter_costs
  ADD COLUMN IF NOT EXISTS advance_count INTEGER CHECK (advance_count IS NULL OR advance_count >= 1),
  ADD COLUMN IF NOT EXISTS fill_amount_v2 INTEGER CHECK (fill_amount_v2 IS NULL OR fill_amount_v2 >= 1);

UPDATE public.capsule_chapter_costs AS c
   SET advance_count = v.advance_count,
       fill_amount_v2 = v.fill_amount_v2
  FROM (VALUES
    (1, 6, 145), (2, 7, 160), (3, 7, 180), (4, 8, 200), (5, 9, 220),
    (6, 9, 245), (7, 10, 270), (8, 11, 300), (9, 12, 330), (10, NULL::INTEGER, 365)
  ) AS v(chapter_no, advance_count, fill_amount_v2)
 WHERE c.chapter_no = v.chapter_no;

COMMENT ON COLUMN public.capsule_chapter_costs.advance_count IS
  '이 챕터에서 캡슐이 가득 찬 횟수가 이만큼이 되면 다음 챕터로 간다(user_chapters.capsule_full_count). 마지막 챕터는 NULL.';
COMMENT ON COLUMN public.capsule_chapter_costs.fill_amount_v2 IS
  '자동 채움 구조의 챕터별 캡슐 채울 양(145~365). 옛 fill_amount는 옛 수동 채우기용으로 U11(축소)까지 둔다.';

-- ----------------------------------------------------------------
-- 2. user_chapters.capsule_full_count — 지금 챕터에서 100%에 닿은 횟수
-- ----------------------------------------------------------------
ALTER TABLE public.user_chapters
  ADD COLUMN IF NOT EXISTS capsule_full_count INTEGER NOT NULL DEFAULT 0 CHECK (capsule_full_count >= 0);

COMMENT ON COLUMN public.user_chapters.capsule_full_count IS
  '지금 챕터에서 캡슐이 100%에 닿은 횟수. 챕터가 오르면 0으로 돌아간다. capsule_chapter_costs.advance_count와 비교한다.';

-- ----------------------------------------------------------------
-- 3. jam_policy — 서비스 활동 잼 상한, 잠긴 배지 포인트 비용 (D5, D6)
-- ----------------------------------------------------------------
ALTER TABLE public.jam_policy
  ADD COLUMN IF NOT EXISTS service_jam_daily_cap INTEGER NOT NULL DEFAULT 40 CHECK (service_jam_daily_cap >= 0),
  ADD COLUMN IF NOT EXISTS service_jam_weekly_cap INTEGER NOT NULL DEFAULT 100 CHECK (service_jam_weekly_cap >= 0),
  ADD COLUMN IF NOT EXISTS locked_points_common INTEGER NOT NULL DEFAULT 50 CHECK (locked_points_common >= 0),
  ADD COLUMN IF NOT EXISTS locked_points_rare INTEGER NOT NULL DEFAULT 100 CHECK (locked_points_rare >= 0),
  ADD COLUMN IF NOT EXISTS locked_points_epic INTEGER NOT NULL DEFAULT 200 CHECK (locked_points_epic >= 0),
  ADD COLUMN IF NOT EXISTS locked_points_mystic INTEGER NOT NULL DEFAULT 400 CHECK (locked_points_mystic >= 0);

COMMENT ON COLUMN public.jam_policy.service_jam_daily_cap IS '서비스 활동으로 받는 잼의 하루(KST) 상한. 기본 40.';
COMMENT ON COLUMN public.jam_policy.service_jam_weekly_cap IS '서비스 활동으로 받는 잼의 주간(월~일, KST) 상한. 기본 100.';
COMMENT ON COLUMN public.jam_policy.locked_points_common IS '잠긴 Common 아이템 배지를 포인트로 여는 비용. 기본 50.';
COMMENT ON COLUMN public.jam_policy.locked_points_rare IS '잠긴 Rare 아이템 배지를 포인트로 여는 비용. 기본 100.';
COMMENT ON COLUMN public.jam_policy.locked_points_epic IS '잠긴 Epic 아이템 배지를 포인트로 여는 비용. 기본 200.';
COMMENT ON COLUMN public.jam_policy.locked_points_mystic IS '잠긴 Mystic 아이템 배지를 포인트로 여는 비용. 기본 400.';

-- ----------------------------------------------------------------
-- 4. service_jam_rules — 서비스 활동 종류별 잼 (D5). 캡슐 가득 참은 종류에 넣지 않는다.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_jam_rules (
  kind TEXT PRIMARY KEY CHECK (kind IN (
    'locked_unlock', 'badge_earned', 'combine_success', 'mission_complete', 'collection_complete', 'drop', 'pickup'
  )),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.service_jam_rules ENABLE ROW LEVEL SECURITY;

INSERT INTO public.service_jam_rules (kind, amount) VALUES
  ('locked_unlock', 5), ('badge_earned', 5), ('combine_success', 5),
  ('mission_complete', 20), ('collection_complete', 30), ('drop', 0), ('pickup', 0)
ON CONFLICT (kind) DO NOTHING;

COMMENT ON TABLE public.service_jam_rules IS
  '서비스 활동 종류별 고정 잼. 0이면 주지 않는다. 캡슐이 가득 찬 것은 종류에 넣지 않는다(잼의 재귀 방지). service_role 전용.';

-- ----------------------------------------------------------------
-- 5. jam_service_daily — 서비스 활동 잼의 날짜(KST)별 합. 하루·주간 상한 집계용(주간은 월~일 합)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jam_service_daily (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kst_date DATE NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  PRIMARY KEY (user_id, kst_date)
);

ALTER TABLE public.jam_service_daily ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.jam_service_daily IS
  '유저·KST 날짜별로 서비스 활동에서 받은 잼의 합. 하루·주간 상한 판정에 쓴다. service_role 전용.';

-- ----------------------------------------------------------------
-- 6. jam_transactions — 서비스 활동 잼(+), 사라진 잼(-) 사유와 중복 방지 키
--    CHECK 셋은 220 정의의 상위집합이다. 옛 사유의 조건은 글자 그대로 둔다.
-- ----------------------------------------------------------------
ALTER TABLE public.jam_transactions
  ADD COLUMN IF NOT EXISTS source_event_key TEXT;

COMMENT ON COLUMN public.jam_transactions.source_event_key IS
  'reason=service_activity일 때 필수인 활동 식별 키. 같은 키는 한 유저에 한 번만 적립된다(부분 유일 인덱스).';

CREATE UNIQUE INDEX IF NOT EXISTS jam_transactions_service_event_uniq
  ON public.jam_transactions (user_id, source_event_key)
  WHERE source_event_key IS NOT NULL;

ALTER TABLE public.jam_transactions DROP CONSTRAINT IF EXISTS jam_transactions_reason_check;
ALTER TABLE public.jam_transactions ADD CONSTRAINT jam_transactions_reason_check CHECK (reason IN (
  'activity_settlement',
  'capsule_fill',
  'locked_item_badge_fill',
  'admin_grant',
  'admin_deduct',
  'service_activity',           -- 서비스 활동 잼 (+)
  'capsule_forfeit'             -- 받을 수 없는 동안 사라진 잼 (-)
));

ALTER TABLE public.jam_transactions DROP CONSTRAINT IF EXISTS jam_transactions_sign_by_reason;
ALTER TABLE public.jam_transactions ADD CONSTRAINT jam_transactions_sign_by_reason CHECK (
  (reason IN ('activity_settlement', 'admin_grant', 'service_activity') AND amount > 0)
  OR (reason IN ('capsule_fill', 'locked_item_badge_fill', 'admin_deduct', 'capsule_forfeit') AND amount < 0)
);

ALTER TABLE public.jam_transactions DROP CONSTRAINT IF EXISTS jam_transactions_source_by_reason;
ALTER TABLE public.jam_transactions ADD CONSTRAINT jam_transactions_source_by_reason CHECK (
  (reason = 'activity_settlement' AND source_activity_id IS NOT NULL
     AND admin_user_id IS NULL AND admin_reason_label IS NULL AND admin_reason_note IS NULL)
  OR (reason IN ('admin_grant', 'admin_deduct') AND source_activity_id IS NULL
     AND admin_user_id IS NOT NULL AND admin_reason_label IS NOT NULL)
  OR (reason IN ('capsule_fill', 'locked_item_badge_fill') AND source_activity_id IS NULL
     AND admin_user_id IS NULL AND admin_reason_label IS NULL AND admin_reason_note IS NULL)
  OR (reason = 'service_activity' AND source_event_key IS NOT NULL AND source_activity_id IS NULL
     AND admin_user_id IS NULL AND admin_reason_label IS NULL AND admin_reason_note IS NULL)
  OR (reason = 'capsule_forfeit' AND source_activity_id IS NULL
     AND admin_user_id IS NULL AND admin_reason_label IS NULL AND admin_reason_note IS NULL)
);

-- ----------------------------------------------------------------
-- 7. capsule_pending_rewards — 보류 보상 (최대 2개, D9)
--    보상은 받을 때 추첨하므로 아이템 칸은 두지 않는다.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.capsule_pending_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  slot SMALLINT NOT NULL CHECK (slot IN (1, 2)),
  chapter_no INTEGER,
  fill_amount INTEGER NOT NULL CHECK (fill_amount >= 1),
  reached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT capsule_pending_rewards_user_slot_uniq UNIQUE (user_id, slot)
);

ALTER TABLE public.capsule_pending_rewards ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.capsule_pending_rewards IS
  '인벤토리가 가득 차서 보류된 캡슐 보상. 유저당 최대 2개(slot 1·2). 받을 때 그때 공개 중인 것에서 추첨한다. service_role 전용.';

-- ----------------------------------------------------------------
-- 8. capsule_unseen_results — 아직 보지 않은 캡슐 결과 (D12)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.capsule_unseen_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS capsule_unseen_results_user_unseen_idx
  ON public.capsule_unseen_results (user_id)
  WHERE seen_at IS NULL;

ALTER TABLE public.capsule_unseen_results ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.capsule_unseen_results IS
  '동기화 중 저절로 열린 캡슐 결과 중 유저가 아직 보지 않은 것(seen_at NULL). service_role 전용.';

-- ----------------------------------------------------------------
-- 9. inventory_items.unlock_points_required — 잠긴 개체를 여는 포인트 (배정할 때 고정)
-- ----------------------------------------------------------------
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS unlock_points_required INTEGER CHECK (unlock_points_required IS NULL OR unlock_points_required >= 0);

COMMENT ON COLUMN public.inventory_items.unlock_points_required IS
  '잠긴 개체를 포인트로 여는 데 필요한 양. 개체를 배정할 때 고정한다(이후 정책이 바뀌어도 변하지 않음). NULL이면 아직 고정 전.';

-- ----------------------------------------------------------------
-- 10. point_transactions — 잠긴 열기 차감 사유와 개체 연결
-- ----------------------------------------------------------------
ALTER TABLE public.point_transactions
  ADD COLUMN IF NOT EXISTS source_inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.point_transactions.source_inventory_item_id IS
  'reason=locked_unlock_cost일 때 열린 개체. 개체가 지워지면 NULL로 남는다.';

-- 한 개체에 한 번만 차감한다. (개체가 지워져 NULL이 된 줄은 인덱스에서 서로 다른 값으로 취급된다.)
CREATE UNIQUE INDEX IF NOT EXISTS point_transactions_locked_unlock_cost_uniq
  ON public.point_transactions (source_inventory_item_id)
  WHERE reason = 'locked_unlock_cost';

ALTER TABLE public.point_transactions DROP CONSTRAINT IF EXISTS point_transactions_reason_check;
ALTER TABLE public.point_transactions ADD CONSTRAINT point_transactions_reason_check CHECK (reason IN (
  'badge_point_reward',
  'mission_point_reward',
  'admin_grant',
  'admin_deduct',
  'combine_fail_reward',
  'combine_recipe_reward',
  'item_book_completion_point_reward',
  'locked_unlock_cost'          -- 잠긴 아이템 배지 열기 차감 (-)
));

-- ----------------------------------------------------------------
-- 11. 새 표 4개는 RLS만 켜고 클라이언트 정책을 두지 않는다(service_role만 읽고 쓴다).
--     클라이언트 역할의 직접 권한도 회수한다.
-- ----------------------------------------------------------------
REVOKE ALL ON public.service_jam_rules FROM anon, authenticated;
REVOKE ALL ON public.jam_service_daily FROM anon, authenticated;
REVOKE ALL ON public.capsule_pending_rewards FROM anon, authenticated;
REVOKE ALL ON public.capsule_unseen_results FROM anon, authenticated;

-- 되돌림 SQL
-- 새로 만든 객체만 지운다. 이 구조를 읽는 새 코드(U3~U6)는 같은 시점에 되돌려야 한다.
-- 서비스 활동 잼(service_activity)·사라진 잼(capsule_forfeit)·locked_unlock_cost 줄이 이미 생겼다면
-- CHECK를 옛 정의로 되돌리는 문장이 실패한다. 그 줄의 처리(보정 또는 보관)를 먼저 정한다.
-- DROP TABLE IF EXISTS public.capsule_unseen_results;
-- DROP TABLE IF EXISTS public.capsule_pending_rewards;
-- DROP TABLE IF EXISTS public.jam_service_daily;
-- DROP TABLE IF EXISTS public.service_jam_rules;
-- DROP INDEX IF EXISTS public.point_transactions_locked_unlock_cost_uniq;
-- ALTER TABLE public.point_transactions DROP CONSTRAINT IF EXISTS point_transactions_reason_check;
-- ALTER TABLE public.point_transactions ADD CONSTRAINT point_transactions_reason_check CHECK (reason IN (
--   'badge_point_reward', 'mission_point_reward', 'admin_grant', 'admin_deduct',
--   'combine_fail_reward', 'combine_recipe_reward', 'item_book_completion_point_reward'));
-- ALTER TABLE public.point_transactions DROP COLUMN IF EXISTS source_inventory_item_id;
-- ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS unlock_points_required;
-- DROP INDEX IF EXISTS public.jam_transactions_service_event_uniq;
-- ALTER TABLE public.jam_transactions DROP CONSTRAINT IF EXISTS jam_transactions_source_by_reason;
-- ALTER TABLE public.jam_transactions DROP CONSTRAINT IF EXISTS jam_transactions_sign_by_reason;
-- ALTER TABLE public.jam_transactions DROP CONSTRAINT IF EXISTS jam_transactions_reason_check;
-- ALTER TABLE public.jam_transactions ADD CONSTRAINT jam_transactions_reason_check CHECK (reason IN (
--   'activity_settlement', 'capsule_fill', 'locked_item_badge_fill', 'admin_grant', 'admin_deduct'));
-- ALTER TABLE public.jam_transactions ADD CONSTRAINT jam_transactions_sign_by_reason CHECK (
--   (reason IN ('activity_settlement', 'admin_grant') AND amount > 0)
--   OR (reason IN ('capsule_fill', 'locked_item_badge_fill', 'admin_deduct') AND amount < 0));
-- ALTER TABLE public.jam_transactions ADD CONSTRAINT jam_transactions_source_by_reason CHECK (
--   (reason = 'activity_settlement' AND source_activity_id IS NOT NULL
--      AND admin_user_id IS NULL AND admin_reason_label IS NULL AND admin_reason_note IS NULL)
--   OR (reason IN ('admin_grant', 'admin_deduct') AND source_activity_id IS NULL
--      AND admin_user_id IS NOT NULL AND admin_reason_label IS NOT NULL)
--   OR (reason IN ('capsule_fill', 'locked_item_badge_fill') AND source_activity_id IS NULL
--      AND admin_user_id IS NULL AND admin_reason_label IS NULL AND admin_reason_note IS NULL));
-- ALTER TABLE public.jam_transactions DROP COLUMN IF EXISTS source_event_key;
-- ALTER TABLE public.jam_policy
--   DROP COLUMN IF EXISTS service_jam_daily_cap, DROP COLUMN IF EXISTS service_jam_weekly_cap,
--   DROP COLUMN IF EXISTS locked_points_common, DROP COLUMN IF EXISTS locked_points_rare,
--   DROP COLUMN IF EXISTS locked_points_epic, DROP COLUMN IF EXISTS locked_points_mystic;
-- ALTER TABLE public.user_chapters DROP COLUMN IF EXISTS capsule_full_count;
-- ALTER TABLE public.capsule_chapter_costs DROP COLUMN IF EXISTS advance_count, DROP COLUMN IF EXISTS fill_amount_v2;
