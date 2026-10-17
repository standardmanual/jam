-- 229_sync_pending_items.sql
-- 동기화 중 인벤토리가 가득 찼을 때의 아이템 배지 보류와 고르기 (티켓 20261017_1425, 운영 로직 6.4·6.6절)
--
-- 새 테이블 1개(sync_pending_items)와 새 함수 1개(resolve_sync_pending_items)만 더한다. 옛 인벤토리 테이블·함수
-- (inventory, inventory_items, grant_inventory_item)와 item_issue_log(227)는 바꾸지 않는다. 옛 프로덕션 코드는 새 객체를 쓰지 않는다.
--
-- 규칙(운영 로직 6.4절 «동기화»)
--   - 받을 아이템 배지가 빈칸보다 많으면 지급하지 않고 모두 보류(status='pending')로 기록한다(앱 코드가 만든다).
--   - 유저는 보류된 것 가운데 빈칸만큼 고른다. 고르지 않은 것은 받지 못하고 다시 받을 수 없다(status='discarded').
--   - 고르기는 resolve_sync_pending_items 한 번의 호출로 끝난다: 인벤토리 행을 잠그고 → 고른 개수가 LEAST(빈칸, 보류 수)와
--     정확히 같은지 확인하고 → 고른 것을 grant_inventory_item으로 지급하고(status='claimed') → 나머지 보류를 'discarded'로 닫고
--     → 지급마다 item_issue_log에 한 줄을 남긴다. 한 단계라도 실패하면 전체가 되돌려진다(같은 보류를 두 번 지급하지 않는다).
--   - 고르기를 마치기 전에 닫으면 보류가 그대로 남는다. 동기화는 보류가 있는 동안 막힌다(앱 코드).
--   - 공개 기간이 끝난 아이템 배지도 발급이 정해진 때가 공개 기간 안이었으므로 보류에서 받을 수 있다(6.5절).
--   - sync_pending_items는 클라이언트 정책 없음(RLS만 켠다). 서버(service_role)만 읽고 쓴다. 함수도 service_role만 실행한다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sync_pending_items'::regclass;                  -- true
--   SELECT count(*) FROM public.sync_pending_items;                                                          -- 0
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'resolve_sync_pending_items';                      -- 1행, true
--   SELECT has_function_privilege('authenticated', 'public.resolve_sync_pending_items(uuid, uuid[])', 'EXECUTE');  -- false

CREATE TABLE IF NOT EXISTS public.sync_pending_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_activity_id UUID,
  badge_id UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  rarity public.badge_rarity NOT NULL,
  rolled_rarity public.badge_rarity,
  locked BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'discarded')),
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_pending_items_user_pending
  ON public.sync_pending_items (user_id, created_at) WHERE status = 'pending';

-- 클라이언트 정책 없음(RLS만 켠다) = service_role만 접근 가능
ALTER TABLE public.sync_pending_items ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.sync_pending_items IS
  '동기화 중 인벤토리가 가득 차 보류한 아이템 배지. pending(고르기 대기)·claimed(받음)·discarded(고르지 않음). 운영 로직 6.4절. service_role 전용.';
COMMENT ON COLUMN public.sync_pending_items.source_activity_id IS '대상 활동(strava_activities.id). 외래키 없음.';
COMMENT ON COLUMN public.sync_pending_items.status IS 'pending=고르기 대기, claimed=고르기로 받음, discarded=고르지 않아 받지 못함(다시 받을 수 없음).';
COMMENT ON COLUMN public.sync_pending_items.resolved_at IS '받거나 고르지 않기로 닫힌 시각. pending이면 NULL.';

CREATE OR REPLACE FUNCTION public.resolve_sync_pending_items(
  p_user_id UUID,
  p_chosen_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_chosen UUID[];
  v_free INTEGER;
  v_pending INTEGER;
  v_expected INTEGER;
  v_valid INTEGER;
  v_row RECORD;
  v_grant JSONB;
  v_item_id UUID;
  v_serial INTEGER;
  v_granted INTEGER := 0;
  v_discarded INTEGER := 0;
  v_item_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  -- 인벤토리 행을 잠가 같은 유저의 동시 고르기·지급을 한 줄로 세운다
  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;

  SELECT count(*) INTO v_pending
    FROM public.sync_pending_items WHERE user_id = p_user_id AND status = 'pending';
  IF v_pending = 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'no_pending');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT c), ARRAY[]::UUID[]) INTO v_chosen
    FROM unnest(COALESCE(p_chosen_ids, ARRAY[]::UUID[])) AS c;

  v_free := GREATEST(0, v_inv.max_slots - v_inv.used_slots);
  v_expected := LEAST(v_free, v_pending);

  -- 고른 것은 모두 이 유저의 대기 중 보류여야 한다
  SELECT count(*) INTO v_valid
    FROM public.sync_pending_items
   WHERE user_id = p_user_id AND status = 'pending' AND id = ANY(v_chosen);
  IF v_valid <> cardinality(v_chosen) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_selection');
  END IF;

  -- 빈칸만큼 정확히 골라야 한다(덜 고르면 받을 수 있는 것을 잃고, 더 고르면 칸이 모자란다)
  IF cardinality(v_chosen) <> v_expected THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'wrong_count', 'expected', v_expected);
  END IF;

  FOR v_row IN
    SELECT * FROM public.sync_pending_items
     WHERE user_id = p_user_id AND status = 'pending' AND id = ANY(v_chosen)
     ORDER BY created_at, id
  LOOP
    v_grant := public.grant_inventory_item(v_inv.id, v_row.badge_id, 'drop', NULL);
    IF NOT COALESCE((v_grant->>'ok')::BOOLEAN, FALSE) THEN
      -- 잠금을 잡은 뒤라 일어나지 않아야 한다. 일어나면 전체를 되돌린다.
      RAISE EXCEPTION 'sync_pending_grant_failed: %', COALESCE(v_grant->>'reason', 'unknown');
    END IF;

    v_item_id := (v_grant->>'itemId')::UUID;
    SELECT serial_number INTO v_serial FROM public.inventory_items WHERE id = v_item_id;

    UPDATE public.sync_pending_items
       SET status = 'claimed', resolved_at = now(), inventory_item_id = v_item_id
     WHERE id = v_row.id;

    INSERT INTO public.item_issue_log
      (user_id, inventory_item_id, route, source_activity_id, badge_id, rarity, rolled_rarity, locked, serial_number)
    VALUES
      (p_user_id, v_item_id, 'sync', v_row.source_activity_id, v_row.badge_id, v_row.rarity, v_row.rolled_rarity, v_row.locked, v_serial);

    v_granted := v_granted + 1;
    v_item_ids := array_append(v_item_ids, v_item_id);
  END LOOP;

  -- 고르지 않은 보류는 받지 못하고 다시 받을 수 없다
  UPDATE public.sync_pending_items
     SET status = 'discarded', resolved_at = now()
   WHERE user_id = p_user_id AND status = 'pending';
  GET DIAGNOSTICS v_discarded = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'granted', v_granted,
    'discarded', v_discarded,
    'itemIds', to_jsonb(v_item_ids)
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_sync_pending_items(UUID, UUID[]) IS
  '동기화 보류 고르기. 인벤토리 행을 잠그고 고른 개수가 LEAST(빈칸, 보류 수)와 같은지 확인한 뒤 고른 것을 지급하고 나머지를 고르지 않음으로 닫는다. 실패하면 전체 롤백. service_role 전용.';

-- 클라이언트(anon/authenticated)가 RPC로 호출하지 못하도록 실행 권한 회수. service_role만 호출 가능.
REVOKE ALL ON FUNCTION public.resolve_sync_pending_items(UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_sync_pending_items(UUID, UUID[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_sync_pending_items(UUID, UUID[]) TO service_role;

-- 되돌림 SQL
-- 새로 만든 객체만 지운다. 보류 중이던 아이템 배지 기록(pending·claimed·discarded)이 함께 사라지므로 운영 데이터가 생긴 뒤에는 백업 후 실행한다.
-- 이 객체를 쓰는 새 코드(동기화 보류 저장, 고르기 API)는 같은 시점에 되돌려야 한다.
-- DROP FUNCTION IF EXISTS public.resolve_sync_pending_items(UUID, UUID[]);
-- DROP TABLE IF EXISTS public.sync_pending_items;
