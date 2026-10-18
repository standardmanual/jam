-- 235_locked_item_fill_and_open.sql
-- JAM 2.0 잠긴 아이템 배지의 채우기와 열기, 개체 이력 (티켓 20261018_0053, 운영 로직 7.2·8.5절)
--
-- 전부 덧붙이기다. 새 테이블 하나(inventory_item_events), 새 칸 하나(inventory_items.point_awarded_at), 새 함수 셋
-- (jam_fill_decide, locked_item_fill, locked_item_open)이다. 옛 테이블·옛 함수·옛 칸의 뜻은 바꾸지 않고, 232·234의 캡슐 함수도 건드리지 않는다.
-- 옛 프로덕션 코드는 새 객체를 쓰지 않는다.
--
-- 규칙(운영 로직 7.2절)
--   - 채우기는 캡슐과 같다. 기본값은 남은 양, 가진 잼이 모자라면 가진 만큼 전부, 남은 양보다 많이는 거부, 채운 잼은 꺼낼 수 없다.
--     «얼마를 채울지» 판정은 jam_fill_decide 한 곳에 두고 잠긴 개체 채우기가 쓴다. 캡슐 채우기(capsule_fill)와 판정이 같은지는
--     롤백 실측이 같은 표로 비교해서 확인한다.
--   - 채울 때마다 jam_apply(locked_item_badge_fill, 음수) 한 줄, 개체의 채운 양 갱신, 이력(filled) 한 줄이 한 트랜잭션이다.
--   - 열기: 채운 양이 필요한 양에 닿으면 연다. 같은 개체가 열린 상태가 되고(locked=false, unlocked_at 기록, 일련번호 그대로) 새로 뽑지 않는다.
--     이미 칸을 차지하므로 인벤토리가 가득 차 있어도 열 수 있다. 동시에 두 번 열어도 개체 행 잠금 때문에 한 번만 열린다(두 번째는 not_locked).
--   - 포인트: 배지에 point_reward가 있으면 연 유저에게 award_points(badge_point_reward)로 한 번만 준다. 개체의 point_awarded_at이 «이미 줬다»는 기록이고,
--     열기와 같은 트랜잭션에서 채운다. 포인트 지급이 실패하면 열기 전체가 되돌려진다.
--   - 이용 정지 중에는 채우기도 열기도 거부한다(user_suspended). 채운 양은 그대로 남는다.
--   - 개체는 지금 이 유저의 것이고 버려지거나 드랍된 상태가 아니어야 한다(아니면 item_not_found).
--   - inventory_item_events: 8.5절의 개체 이력(받음, 장착, 드랍, 픽업, 소모, 잠김과 열림, 채움)을 쌓는 표다. 이번에는 filled와 unlocked만 쓰고,
--     나머지 종류는 묶음 4(드랍·픽업)와 이후가 같은 표에 이어 쓴다. 지우지 않는 이력(append-only)이다.
--     잠긴 아이템 배지를 연 횟수는 event_type='unlocked'를 세어 얻는다.
--   - 클라이언트 정책 없음(RLS만 켠다). 서버(service_role)만 읽고 쓴다. 함수도 service_role만 실행한다.
--
-- 오류 코드(함수가 돌려주는 error):
--   채우기: user_suspended / item_not_found / not_locked / already_full / invalid_amount / exceeds_remaining / insufficient_jam
--   열기:   user_suspended / item_not_found / not_locked / not_full
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT count(*) FROM public.inventory_item_events;                                                        -- 0
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.inventory_item_events'::regclass;                 -- true
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='inventory_items' AND column_name='point_awarded_at';         -- 1행
--   SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('jam_fill_decide','locked_item_fill','locked_item_open'); -- 3행(jam_fill_decide는 false)
--   SELECT has_function_privilege('authenticated', 'public.locked_item_fill(uuid, uuid, integer)', 'EXECUTE');         -- false
--   SELECT has_function_privilege('authenticated', 'public.locked_item_open(uuid, uuid)', 'EXECUTE');                  -- false

-- (1) 개체의 포인트 지급 기록
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS point_awarded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.inventory_items.point_awarded_at IS
  '잠긴 개체를 열 때 배지의 포인트를 준 시각. NULL이면 이 경로로 준 적 없다. 한 일련번호에 한 번만 주도록 지키는 기록이다. 열린 채 받아 지급한 개체는 이 칸을 쓰지 않는다.';

-- (2) 개체 이력
CREATE TABLE IF NOT EXISTS public.inventory_item_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  badge_id UUID REFERENCES public.badges(id) ON DELETE SET NULL,
  serial_number INTEGER,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'received', 'slotted', 'unslotted', 'dropped', 'picked_up', 'consumed', 'locked', 'filled', 'unlocked'
  )),
  amount INTEGER CHECK (amount IS NULL OR amount > 0),
  filled_after INTEGER CHECK (filled_after IS NULL OR filled_after >= 0),
  points_awarded INTEGER CHECK (points_awarded IS NULL OR points_awarded > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_item_events_item_created
  ON public.inventory_item_events (inventory_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_item_events_user_type
  ON public.inventory_item_events (user_id, event_type, created_at DESC);

ALTER TABLE public.inventory_item_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.inventory_item_events IS
  '아이템 배지 개체가 거쳐 간 이력(append-only, 운영 로직 8.5절). 지금은 채움(filled)과 열림(unlocked)만 쓰고 나머지는 묶음 4 이후가 이어 쓴다. service_role 전용.';
COMMENT ON COLUMN public.inventory_item_events.user_id IS '그 일을 한 유저(채운 유저, 연 유저, 픽업한 유저 등).';
COMMENT ON COLUMN public.inventory_item_events.amount IS 'filled일 때 그 번에 채운 잼의 양.';
COMMENT ON COLUMN public.inventory_item_events.filled_after IS 'filled일 때 채운 뒤의 누적 채운 양.';
COMMENT ON COLUMN public.inventory_item_events.points_awarded IS 'unlocked일 때 그때 준 포인트(없으면 NULL).';

-- (3) 얼마를 채울지 판정(캡슐 채우기와 같은 규칙, 읽기 전용 순수 함수)
CREATE OR REPLACE FUNCTION public.jam_fill_decide(p_remaining INTEGER, p_balance BIGINT, p_amount INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_remaining IS NULL OR p_remaining <= 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_full');
  END IF;
  IF p_amount IS NOT NULL AND p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_amount');
  END IF;
  IF p_amount IS NOT NULL AND p_amount > p_remaining THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'exceeds_remaining', 'remaining', p_remaining);
  END IF;
  IF COALESCE(p_balance, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'insufficient_jam', 'balance', 0);
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'amount', LEAST(COALESCE(p_amount, p_remaining), p_balance)::INTEGER);
END;
$$;

COMMENT ON FUNCTION public.jam_fill_decide(INTEGER, BIGINT, INTEGER) IS
  '채우기 판정(남은 양, 가진 잼, 요청 양). 기본값은 남은 양, 가진 잼이 모자라면 가진 만큼, 남은 양보다 많이는 거부. 잠긴 개체 채우기가 쓰고 capsule_fill과 같은 규칙이다.';

-- (4) 잠긴 개체 채우기
CREATE OR REPLACE FUNCTION public.locked_item_fill(p_user_id UUID, p_item_id UUID, p_amount INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_balance BIGINT;
  v_decide JSONB;
  v_amount INTEGER;
  v_filled INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  SELECT ii.id, ii.badge_id, ii.serial_number, ii.locked, ii.unlock_required, ii.unlock_filled
    INTO v_item
    FROM public.inventory_items ii
    JOIN public.inventory inv ON inv.id = ii.inventory_id
   WHERE ii.id = p_item_id AND inv.user_id = p_user_id
     AND ii.destroyed_at IS NULL AND ii.dropped_at IS NULL
   FOR UPDATE OF ii;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;
  IF NOT v_item.locked THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_locked');
  END IF;

  SELECT COALESCE(balance, 0) INTO v_balance FROM public.jam_wallets WHERE user_id = p_user_id;
  v_balance := COALESCE(v_balance, 0);

  v_decide := public.jam_fill_decide(v_item.unlock_required - v_item.unlock_filled, v_balance, p_amount);
  IF NOT COALESCE((v_decide->>'ok')::BOOLEAN, FALSE) THEN
    IF v_decide->>'error' = 'already_full' THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'already_full',
        'required', v_item.unlock_required, 'filled', v_item.unlock_filled);
    END IF;
    RETURN v_decide;
  END IF;
  v_amount := (v_decide->>'amount')::INTEGER;

  PERFORM public.jam_apply(p_user_id, -v_amount, 'locked_item_badge_fill');
  UPDATE public.inventory_items SET unlock_filled = unlock_filled + v_amount
   WHERE id = p_item_id
   RETURNING unlock_filled INTO v_filled;

  INSERT INTO public.inventory_item_events (inventory_item_id, badge_id, serial_number, user_id, event_type, amount, filled_after)
    VALUES (p_item_id, v_item.badge_id, v_item.serial_number, p_user_id, 'filled', v_amount, v_filled);

  SELECT COALESCE(balance, 0) INTO v_balance FROM public.jam_wallets WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'applied', v_amount,
    'required', v_item.unlock_required,
    'filled', v_filled,
    'remaining', v_item.unlock_required - v_filled,
    'balance', COALESCE(v_balance, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.locked_item_fill(UUID, UUID, INTEGER) IS
  '잠긴 개체 채우기. 캡슐과 같은 규칙(jam_fill_decide). jam_apply(locked_item_badge_fill) 한 줄, 개체 갱신, 이력 한 줄이 한 트랜잭션. 이용 정지 중 거부. service_role 전용.';

-- (5) 잠긴 개체 열기
CREATE OR REPLACE FUNCTION public.locked_item_open(p_user_id UUID, p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_points INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  SELECT ii.id, ii.badge_id, ii.serial_number, ii.locked, ii.unlock_required, ii.unlock_filled,
         ii.point_awarded_at, COALESCE(b.point_reward, 0) AS point_reward
    INTO v_item
    FROM public.inventory_items ii
    JOIN public.inventory inv ON inv.id = ii.inventory_id
    JOIN public.badges b ON b.id = ii.badge_id
   WHERE ii.id = p_item_id AND inv.user_id = p_user_id
     AND ii.destroyed_at IS NULL AND ii.dropped_at IS NULL
   FOR UPDATE OF ii;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;
  IF NOT v_item.locked THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_locked');
  END IF;
  IF v_item.unlock_filled < v_item.unlock_required THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_full',
      'required', v_item.unlock_required, 'filled', v_item.unlock_filled);
  END IF;

  UPDATE public.inventory_items SET locked = FALSE, unlocked_at = now() WHERE id = p_item_id;

  IF v_item.point_reward > 0 AND v_item.point_awarded_at IS NULL THEN
    PERFORM public.award_points(p_user_id, v_item.point_reward, 'badge_point_reward', v_item.badge_id);
    UPDATE public.inventory_items SET point_awarded_at = now() WHERE id = p_item_id;
    v_points := v_item.point_reward;
  END IF;

  INSERT INTO public.inventory_item_events (inventory_item_id, badge_id, serial_number, user_id, event_type, points_awarded)
    VALUES (p_item_id, v_item.badge_id, v_item.serial_number, p_user_id, 'unlocked', NULLIF(v_points, 0));

  RETURN jsonb_build_object(
    'ok', TRUE,
    'itemId', p_item_id,
    'badgeId', v_item.badge_id,
    'serialNumber', v_item.serial_number,
    'pointsAwarded', v_points
  );
END;
$$;

COMMENT ON FUNCTION public.locked_item_open(UUID, UUID) IS
  '잠긴 개체 열기. 가득 찼으면 같은 개체를 열린 상태로 바꾸고(일련번호 그대로) 배지 포인트를 연 유저에게 한 번만 주고 이력을 남긴다. 인벤토리 빈칸이 필요 없다. 이용 정지 중 거부. service_role 전용.';

REVOKE ALL ON FUNCTION public.jam_fill_decide(INTEGER, BIGINT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jam_fill_decide(INTEGER, BIGINT, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jam_fill_decide(INTEGER, BIGINT, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.locked_item_fill(UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.locked_item_fill(UUID, UUID, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.locked_item_fill(UUID, UUID, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.locked_item_open(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.locked_item_open(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.locked_item_open(UUID, UUID) TO service_role;

-- 되돌림 SQL
-- 새로 만든 객체만 지운다. 채운 잼은 원장(jam_transactions)에 이미 남아 있으므로 되돌려도 지갑으로 돌아오지 않고, 열어서 준 포인트도 회수되지 않는다.
-- 운영 데이터가 생긴 뒤에는 개체 이력(inventory_item_events)을 백업하고, 채운 양은 보정(admin_grant)으로 되돌린다.
-- 이 객체를 쓰는 새 코드(잠긴 개체 채우기·열기 API)는 같은 시점에 되돌려야 한다.
-- DROP FUNCTION IF EXISTS public.locked_item_open(UUID, UUID);
-- DROP FUNCTION IF EXISTS public.locked_item_fill(UUID, UUID, INTEGER);
-- DROP FUNCTION IF EXISTS public.jam_fill_decide(INTEGER, BIGINT, INTEGER);
-- DROP TABLE IF EXISTS public.inventory_item_events;
-- ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS point_awarded_at;
