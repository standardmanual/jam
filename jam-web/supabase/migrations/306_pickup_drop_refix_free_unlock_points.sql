-- 306_pickup_drop_refix_free_unlock_points.sql
-- 잠긴 개체를 줍는 순간 «필요 포인트 0»이면 등급별 정책값으로 다시 정한다 (티켓 20261030_0947 결정 A, 2026-10-31 사용자)
--
-- 배경: 239가 잠긴 개체의 드랍 거절을 없앴다. 퀘스트 전 유저가 처음 받는 잠긴 배지는 304 트리거가 unlock_points_required = 0으로 고정하는데,
-- pickup_drop은 소유자만 옮기므로 0이 그대로 따라가 다른 계정에서 무료로 열렸다. 이 파일은 pickup_drop 하나만 CREATE OR REPLACE로 바꾼다.
--
-- 바뀌는 것(한 구간): 소유자를 옮긴 직후 v_item.locked AND unlock_points_required = 0이면 배지 등급별 jam_policy.locked_points_*로 고쳐 쓴다.
--   - 0보다 큰 값과 NULL은 그대로 둔다. 열린 개체(locked = false)도 건드리지 않는다.
--   - 정책 행이나 배지가 없으면 NULL로 둔다(열 때 locked_item_open_points가 정책값을 다시 읽는다).
--   - UPDATE가 locked 칸을 건드리지 않으므로 304 트리거(BEFORE INSERT OR UPDATE OF locked)는 작동하지 않는다.
-- 나머지 본문·서명·반환 형식·권한(service_role만)은 239의 pickup_drop과 같다(공용 DB의 pg_get_functiondef와 대조한 값). CREATE OR REPLACE는 권한을 그대로 둔다.
--
-- 알려진 한계(이번에 고치지 않는다): 줍는 사람의 인벤토리에 lock_reason이 있는 개체가 들어오므로, 퀘스트 전 유저가 잠긴 개체를 주우면
--   그 유저 자신의 «첫 무료» 판정(304 트리거가 센다)이 사라진다. 또 드랍하면 inventory_id가 NULL이 되어 세어지지 않으므로 첫 무료 개체를 드랍한 뒤 받는
--   다음 잠긴 개체가 0이 될 수 있다. 두 경우는 후속에서 정한다.
-- 이미 줍힌 개체: 공용 DB에 잠긴 개체가 0개라 되돌려 고칠 행이 없다(2026-10-31 실측). 따로 백필하지 않는다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT position('locked_points_mystic' IN pg_get_functiondef('public.pickup_drop(uuid,uuid,uuid)'::regprocedure)) > 0;   -- true
--   SELECT prosecdef FROM pg_proc WHERE proname = 'pickup_drop' AND pronamespace = 'public'::regnamespace;                    -- 1행, true
--   SELECT has_function_privilege('authenticated','public.pickup_drop(uuid,uuid,uuid)','EXECUTE'),
--          has_function_privilege('anon','public.pickup_drop(uuid,uuid,uuid)','EXECUTE'),
--          has_function_privilege('service_role','public.pickup_drop(uuid,uuid,uuid)','EXECUTE');                              -- false, false, true
--
-- 적용 전 롤백 드라이런에서 확인할 시나리오(DO 블록 끝에서 RAISE EXCEPTION으로 전체를 되돌린다):
--   1. 0으로 고정된 잠긴 개체를 줍는다 → 줍은 뒤 unlock_points_required가 그 배지 등급의 정책값(50/100/200/400)이 된다.
--   2. 0보다 큰 값으로 고정된 잠긴 개체를 줍는다 → 값 그대로. 열린 개체를 줍는다 → 값 그대로(건드리지 않음).
--   3. 정책 행이 없는 상태(트랜잭션 안에서 흉내)에서 0 개체를 줍는다 → NULL.
--   4. 줍힌 0 개체를 locked_item_open_points로 열면 정책값만큼 차감되고, 잔액이 모자라면 insufficient_points.
--   5. 이용 정지·꺼진 장소·가득 찬 인벤토리 거절은 239와 같다.

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
  v_points        INTEGER;
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

  -- 필요 포인트가 0으로 고정된 잠긴 개체(퀘스트 전 첫 무료 배지)를 줍는 순간, 그 배지 등급의 정책값으로 다시 정한다(티켓 20261030_0947 결정 A).
  -- 무료 혜택은 시스템이 직접 준 첫 개체에만 남는다. 0보다 큰 값과 NULL은 그대로 둔다. 정책 행이나 배지가 없으면 NULL로 둔다
  -- (열 때 locked_item_open_points가 정책값을 다시 읽는다). 이 UPDATE는 locked 칸을 건드리지 않으므로 304 트리거(UPDATE OF locked)는 작동하지 않는다.
  IF v_item.locked AND v_item.unlock_points_required = 0 THEN
    SELECT CASE COALESCE(b.rarity::TEXT, 'common')
             WHEN 'rare' THEN p.locked_points_rare
             WHEN 'epic' THEN p.locked_points_epic
             WHEN 'mystic' THEN p.locked_points_mystic
             ELSE p.locked_points_common
           END
      INTO v_points
      FROM public.badges b
      CROSS JOIN public.jam_policy p
     WHERE b.id = v_item.badge_id AND p.id = 1;

    UPDATE public.inventory_items
    SET unlock_points_required = v_points
    WHERE id = v_item.id;
  END IF;

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
-- 짝 파일 306_pickup_drop_refix_free_unlock_points_down.sql이 pickup_drop을 239 본문으로 되돌린다. 이미 정책값으로 고쳐 쓴 개체의 unlock_points_required는 되돌리지 않는다.
