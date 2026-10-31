-- 306_pickup_drop_refix_free_unlock_points_down.sql
-- 306의 되돌림: pickup_drop을 239의 본문(줍는 순간 필요 포인트를 다시 정하지 않음)으로 되돌린다 (티켓 20261030_0947)
--
-- 되돌린 뒤에는 0으로 고정된 잠긴 개체가 다시 드랍·픽업을 거쳐 0 그대로 따라간다. 306 적용 동안 정책값으로 고쳐 쓴 개체의 값은 되돌리지 않는다.
-- 서명·반환 형식·권한은 같으므로 권한 문장은 다시 쓰지 않는다.

CREATE OR REPLACE FUNCTION public.pickup_drop(
  p_drop_id UUID,
  p_picker_id UUID,
  p_inventory_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_drop          RECORD;
  v_item          RECORD;
  v_inv           RECORD;
  v_poi_active    BOOLEAN;
  v_from_username TEXT;
  v_to_username   TEXT;
BEGIN
  -- 이용 정지 중에는 픽업할 수 없다(앱 코드도 먼저 막는다. 여기는 한 번 더 막는 방어선)
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_picker_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  SELECT * INTO v_drop
  FROM public.poi_drops
  WHERE id = p_drop_id AND is_available = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_picked_up');
  END IF;

  IF v_drop.inventory_item_id IS NULL THEN
    -- 이론상 도달하지 않아야 함(백필로 전부 채움) — 방어적 처리.
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  -- 꺼진 장소의 드랍은 줍지 못한다(운영 로직 9.3절). 드랍은 그대로 남고 장소를 다시 켜면 돌아온다.
  SELECT is_active INTO v_poi_active FROM public.poi WHERE id = v_drop.poi_id;
  IF NOT FOUND OR NOT v_poi_active THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'poi_inactive');
  END IF;

  SELECT * INTO v_item FROM public.inventory_items WHERE id = v_drop.inventory_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  SELECT * INTO v_inv
  FROM public.inventory
  WHERE id = p_inventory_id AND user_id = p_picker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;

  IF v_inv.used_slots >= v_inv.max_slots THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_full');
  END IF;

  UPDATE public.poi_drops
  SET picked_up_by  = p_picker_id,
      picked_up_at  = NOW(),
      is_available  = FALSE
  WHERE id = p_drop_id;

  -- 신규 row INSERT 없음 — 기존 개체의 소유자만 옮긴다(일련번호 불변). 게이트 리뷰
  -- 지적(2026-08-29): obtained_at은 "최초 발급(Minted) 시각"이 아니라 "현재 소유자가
  -- 이 개체를 얻은 시각"으로 코드베이스 전반(ItemEarnHistory 획득일 표시, 인벤토리/조합/
  -- 컬렉션 페이지의 obtained_at 정렬, following/collections 알림 배치의 obtained_at>=since
  -- 24시간 필터)이 이미 가정하고 있다 — 소유권 이전 시 반드시 함께 갱신해야 한다.
  UPDATE public.inventory_items
  SET inventory_id = p_inventory_id,
      obtained_at  = NOW()
  WHERE id = v_item.id;

  UPDATE public.inventory
  SET used_slots = used_slots + 1
  WHERE id = p_inventory_id;

  IF v_drop.dropper_user_id IS NOT NULL THEN
    SELECT username INTO v_from_username FROM public.users WHERE id = v_drop.dropper_user_id;
  END IF;
  SELECT username INTO v_to_username FROM public.users WHERE id = p_picker_id;

  INSERT INTO public.custody_events (
    inventory_item_id, event_type, from_user_id, from_username, to_user_id, to_username, poi_id
  )
  VALUES (
    v_item.id, 'Pickup', v_drop.dropper_user_id, v_from_username, p_picker_id, v_to_username, v_drop.poi_id
  );

  RETURN jsonb_build_object('ok', TRUE, 'inventory_item_id', v_item.id);
END;
$function$;
