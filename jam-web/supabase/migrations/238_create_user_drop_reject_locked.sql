-- 238_create_user_drop_reject_locked.sql
-- JAM 2.0 잠긴 개체의 유저 드랍을 DB 함수에서도 거부한다 (티켓 20261018_0657, 운영 로직 7.2절)
--
-- 마이그레이션 231의 «잠긴 개체 보호» 트리거는 inventory_items.dropped_at 갱신만 막는데, 유저 드랍 함수 create_user_drop(108·181)은
-- inventory_id만 비우고 dropped_at을 갱신하지 않는다. 그래서 잠긴 개체의 유저 드랍을 막는 방어선이 /api/drops의 사전 확인 하나뿐이었다.
-- 이 마이그레이션은 같은 이름의 함수를 CREATE OR REPLACE로 바꾸되 본문에 «잠긴 개체면 locked_item으로 거절» 한 단계만 더한다.
--
-- 왜 새 함수가 아니라 기존 함수에 더하는가: 잠긴 개체는 새 코드(동기화·캡슐·믹스·미션 보상)만 만들고(inventory_items.locked 기본값이 false),
-- 옛 프로덕션 코드는 잠긴 개체를 만들지 못한다. 그래서 옛 코드가 이 함수를 부르는 모든 경우(열린 개체)에는 동작이 그대로이고, 새 코드가 사전 확인을
-- 빠뜨려도 DB가 막는다. 서명(p_dropper_id, p_poi_id, p_inventory_item_id)·반환 형식·권한(service_role만)은 그대로다.
--   - 추가한 단계: 소유권·장착 확인을 지난 뒤, poi_drops에 넣기 전에 v_item.locked이면 {ok:false, error:'locked_item'}을 돌려준다(아무것도 바꾸지 않는다).
--   - 묶음 4가 잠긴 채 드랍을 열 때(채운 양이 사라진다는 규칙 포함) 이 함수를 다시 고친다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT prosecdef, position('locked_item' IN pg_get_functiondef(oid)) > 0 AS has_locked_check
--     FROM pg_proc WHERE proname = 'create_user_drop' AND pronamespace = 'public'::regnamespace;               -- true, true
--   SELECT has_function_privilege('authenticated', 'public.create_user_drop(uuid, uuid, uuid)', 'EXECUTE');    -- false

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
BEGIN
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

  -- 잠긴 개체는 드랍할 수 없다(티켓 20261018_0657, 운영 로직 7.2절). 묶음 4가 잠긴 채 드랍을 열 때 이 단계를 고친다.
  IF v_item.locked THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'locked_item');
  END IF;

  INSERT INTO public.poi_drops (dropper_user_id, poi_id, badge_id, inventory_item_id, source)
  VALUES (p_dropper_id, p_poi_id, v_item.badge_id, v_item.id, 'user')
  RETURNING id INTO v_drop_id;

  UPDATE public.inventory_items SET inventory_id = NULL WHERE id = v_item.id;
  UPDATE public.inventory SET used_slots = GREATEST(0, used_slots - 1) WHERE id = v_inv.id;

  SELECT username INTO v_username FROM public.users WHERE id = p_dropper_id;

  INSERT INTO public.custody_events (inventory_item_id, event_type, from_user_id, from_username, poi_id)
  VALUES (v_item.id, 'UserDrop', p_dropper_id, v_username, p_poi_id);

  RETURN jsonb_build_object('ok', TRUE, 'drop_id', v_drop_id);
END;
$function$;

-- 되돌림 SQL
-- 함수를 238 이전의 본문(잠긴 개체 거부 단계가 없는 181의 본문)으로 되돌린다. 위 함수 본문에서 «IF v_item.locked THEN … END IF;» 블록만 지우고
-- 같은 CREATE OR REPLACE를 다시 실행하면 된다. 잠긴 개체가 있는 동안 되돌리면 /api/drops 사전 확인이 유일한 방어선이 되므로 새 코드의 사전 확인을 먼저 확인한다.
