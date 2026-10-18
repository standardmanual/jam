-- 239_drop_pickup_locked_suspension_inactive.sql
-- JAM 2.0 드랍·픽업 DB 함수: 잠긴 채 드랍, 이용 정지 거절, 꺼진 장소 픽업 거절 (티켓 20261018_1812, 운영 로직 9.3절·7.2절)
--
-- 같은 이름의 두 함수(create_user_drop, pickup_drop)를 CREATE OR REPLACE로 바꾼다. 서명·반환 형식·권한(service_role만)은 그대로이고
-- 새 테이블·새 칸은 없다(inventory_item_events의 기존 종류 'dropped'를 쓴다). 열린 개체의 드랍·픽업, 이용 정지가 아닌 유저, 켜진 장소의 동작은 그대로다.
-- 옛 프로덕션 코드가 이 함수를 부를 때 달라지는 경우는 둘뿐이고 둘 다 옛 코드에는 없는 개념이다: (a) 이용 정지(user_suspensions)는 새 어드민만 만든다.
-- (b) 꺼진 장소의 픽업 거절은 비교표 4.1절이 «고칠 문제»로 정한 동작이다(옛 코드는 꺼진 장소의 드랍도 픽업하게 두었다).
--
-- 규칙
--   - create_user_drop: 238의 «잠긴 개체면 locked_item으로 거절»을 «잠긴 개체도 드랍한다»로 바꾼다. 드랍하면 채운 양(unlock_filled)은 0이 되고 돌려주지 않는다
--     (7.2절: 유저 사이에 잼을 옮기는 길을 막는다). 필요한 양(unlock_required)·잠긴 까닭·일련번호는 그대로다. 사라진 양이 있으면(0보다 큼)
--     개체 이력(inventory_item_events, event_type 'dropped', amount=사라진 양, filled_after=0)에 남긴다. 드랍 자체는 지금처럼 custody_events에 남는다.
--     이용 정지 중이면 {ok:false, error:'user_suspended'}로 거절한다(앱 코드가 먼저 막고 여기는 한 번 더 막는 방어선).
--   - pickup_drop: 이용 정지 중이면 user_suspended, 드랍이 놓인 장소가 꺼져 있으면(poi.is_active = false) poi_inactive로 거절한다. 거절은 아무것도 바꾸지 않는다.
--     잠긴 개체를 줍는 것은 지금과 같다(소유자만 옮기고 잠김 칸은 건드리지 않음, 일련번호 불변). 픽업한 유저는 채운 양 0으로 시작한다(드랍 때 이미 0이 됨).
--     인벤토리가 가득 차면 지금처럼 inventory_full로 거절한다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('create_user_drop','pickup_drop') AND pronamespace = 'public'::regnamespace;   -- 2행, true
--   SELECT position('user_suspended' IN pg_get_functiondef('public.create_user_drop(uuid,uuid,uuid)'::regprocedure)) > 0,
--          position('poi_inactive'   IN pg_get_functiondef('public.pickup_drop(uuid,uuid,uuid)'::regprocedure)) > 0;                       -- true, true
--   SELECT has_function_privilege('authenticated','public.create_user_drop(uuid,uuid,uuid)','EXECUTE'),
--          has_function_privilege('authenticated','public.pickup_drop(uuid,uuid,uuid)','EXECUTE');                                          -- false, false

CREATE OR REPLACE FUNCTION public.create_user_drop(
  p_dropper_id UUID,
  p_poi_id UUID,
  p_inventory_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv       RECORD;
  v_item      RECORD;
  v_drop_id   UUID;
  v_username  TEXT;
  v_lost      INTEGER := 0;
BEGIN
  -- 이용 정지 중에는 드랍할 수 없다(앱 코드도 먼저 막는다. 여기는 한 번 더 막는 방어선)
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_dropper_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_dropper_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;

  SELECT * INTO v_item FROM public.inventory_items WHERE id = p_inventory_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  IF v_item.destroyed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  IF v_item.inventory_id IS DISTINCT FROM v_inv.id THEN
    -- 게이트 리뷰 지적(2026-08-29): 개체 정체성 모델에서 "이미 드랍됨"은 더 이상
    -- inventory_items의 자체 컬럼(dropped_at 등)으로 판별할 수 없다 — 드랍되는 순간
    -- inventory_id가 NULL로 비워지므로, 소유권 불일치(위 조건)에 already_dropped와
    -- item_not_found(존재하지 않거나 남의 아이템)가 함께 걸려 already_dropped 분기가
    -- 도달 불가능했다. 여기서 "내가 드랍해 지금 poi_drops에 활성 상태로 걸려있는
    -- 아이템인지"를 직접 확인해 두 경우를 다시 구분한다(기존 에러 코드 매핑 유지).
    IF EXISTS (
      SELECT 1 FROM public.poi_drops
      WHERE inventory_item_id = v_item.id AND dropper_user_id = p_dropper_id AND is_available = TRUE
    ) THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'already_dropped');
    END IF;
    -- 존재하지 않거나 내 소유가 아닌 아이템 — 둘을 구분해 돌려주지 않는다
    -- (남의 아이템 id 존재 여부를 알려주는 셈이 된다. 기존 route.ts와 동일한 원칙).
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  IF v_item.slotted_in IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_slotted');
  END IF;

  INSERT INTO public.poi_drops (dropper_user_id, poi_id, badge_id, inventory_item_id, source)
  VALUES (p_dropper_id, p_poi_id, v_item.badge_id, v_item.id, 'user')
  RETURNING id INTO v_drop_id;

  -- 잠긴 개체를 드랍하면 채운 양은 사라지고 돌려주지 않는다(티켓 20261018_1812, 운영 로직 7.2절). 필요한 양·잠긴 까닭·일련번호는 그대로다.
  IF v_item.locked AND v_item.unlock_filled > 0 THEN
    v_lost := v_item.unlock_filled;
    UPDATE public.inventory_items SET unlock_filled = 0 WHERE id = v_item.id;
  END IF;

  UPDATE public.inventory_items SET inventory_id = NULL WHERE id = v_item.id;
  UPDATE public.inventory SET used_slots = GREATEST(0, used_slots - 1) WHERE id = v_inv.id;

  SELECT username INTO v_username FROM public.users WHERE id = p_dropper_id;

  INSERT INTO public.custody_events (inventory_item_id, event_type, from_user_id, from_username, poi_id)
  VALUES (v_item.id, 'UserDrop', p_dropper_id, v_username, p_poi_id);

  IF v_lost > 0 THEN
    INSERT INTO public.inventory_item_events (inventory_item_id, badge_id, serial_number, user_id, event_type, amount, filled_after)
    VALUES (v_item.id, v_item.badge_id, v_item.serial_number, p_dropper_id, 'dropped', v_lost, 0);
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'drop_id', v_drop_id, 'lost_fill', v_lost);
END;
$function$;

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

-- 되돌림 SQL
-- 두 함수를 239 이전의 본문으로 되돌린다. create_user_drop은 238의 본문(잠긴 개체면 locked_item으로 거절, 이용 정지 확인 없음, 반환에 lost_fill 없음),
-- pickup_drop은 181의 본문(이용 정지·꺼진 장소 확인 없음)이다. 잠긴 채 드랍된 개체가 poi_drops에 남아 있는 동안 되돌리면 그 개체는 계속 줍힐 수 있고
-- 새 코드의 «잠긴 채 드랍» 화면이 거절을 받게 되므로, 새 코드(드랍·픽업 라우트의 이용 정지·꺼진 장소·잠긴 채 드랍 처리)는 같은 시점에 되돌려야 한다.
