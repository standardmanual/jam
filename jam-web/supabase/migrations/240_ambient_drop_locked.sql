-- 240_ambient_drop_locked.sql
-- JAM 2.0 시스템 드랍이 잠김으로 만든 배지를 잠긴 채 놓는다 (티켓 20261018_1813, 운영 로직 9.4절·7.2절)
--
-- 새 함수 하나(mint_and_place_ambient_drop_locked)만 더한다. 옛 mint_and_place_ambient_drop(108)은 바꾸지 않는다(옛 프로덕션 코드가 이 함수를 쓴다).
-- 옛 함수와 같은 일을 하되 개체를 «잠긴 채» 만든다: locked = true, lock_reason, unlock_required(놓을 때 고정), unlock_filled = 0.
-- 어떤 배지를 잠긴 채 놓을지와 필요한 양은 앱 코드가 정한다(배지의 always_locked, 필요한 양은 배지의 값, 없으면 등급 최소값 — 3-1과 같은 규칙).
-- 이 함수는 «정해진 결과»를 한 번에 만든다. 잠긴 개체를 만드는 두 칸 조합이 제약(inventory_items_lock_consistent)을 지키도록 검사한 뒤 insert한다.
--
-- 규칙
--   - 개체: inventory_id NULL, obtained_by 'ambient_drop'(옛 함수와 같음), locked true, lock_reason(badge_locked 등), unlock_required 양수, unlock_filled 0.
--   - 놓기: poi_drops(source 'system', dropper_user_id NULL, expires_at NULL)와 custody_events 'Minted'(옛 함수와 같음).
--   - 입력 검사: 잠긴 까닭은 badge_locked·rolled·designated 중 하나, 필요한 양은 양수. 아니면 {ok:false, error:'invalid_lock_args'}.
--   - 서버(service_role)만 실행한다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'mint_and_place_ambient_drop_locked';                                         -- 1행, true
--   SELECT has_function_privilege('authenticated', 'public.mint_and_place_ambient_drop_locked(uuid, uuid, text, integer)', 'EXECUTE');   -- false

CREATE OR REPLACE FUNCTION public.mint_and_place_ambient_drop_locked(
  p_poi_id UUID,
  p_badge_id UUID,
  p_lock_reason TEXT,
  p_unlock_required INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item_id UUID;
  v_drop_id UUID;
BEGIN
  IF p_lock_reason IS NULL OR p_lock_reason NOT IN ('badge_locked', 'rolled', 'designated')
     OR p_unlock_required IS NULL OR p_unlock_required <= 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_lock_args');
  END IF;

  INSERT INTO public.inventory_items (inventory_id, badge_id, obtained_by, locked, lock_reason, unlock_required, unlock_filled)
  VALUES (NULL, p_badge_id, 'ambient_drop', TRUE, p_lock_reason, p_unlock_required, 0)
  RETURNING id INTO v_item_id;

  INSERT INTO public.poi_drops (poi_id, badge_id, inventory_item_id, source, dropper_user_id, expires_at)
  VALUES (p_poi_id, p_badge_id, v_item_id, 'system', NULL, NULL)
  RETURNING id INTO v_drop_id;

  -- Minted 이벤트 — 배치 시점에 InventoryItem이 확정된 순간을 기록한다(to_user 없음 — AtPoi로 배치).
  INSERT INTO public.custody_events (inventory_item_id, event_type, poi_id)
  VALUES (v_item_id, 'Minted', p_poi_id);

  RETURN jsonb_build_object('ok', TRUE, 'drop_id', v_drop_id, 'inventory_item_id', v_item_id);
END;
$function$;

COMMENT ON FUNCTION public.mint_and_place_ambient_drop_locked(UUID, UUID, TEXT, INTEGER) IS
  '시스템 드랍을 잠긴 개체로 놓는다(잠김으로 만든 배지용). 옛 mint_and_place_ambient_drop과 같은 일을 하되 잠김 칸을 채워 만든다. service_role 전용.';

REVOKE ALL ON FUNCTION public.mint_and_place_ambient_drop_locked(UUID, UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mint_and_place_ambient_drop_locked(UUID, UUID, TEXT, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_and_place_ambient_drop_locked(UUID, UUID, TEXT, INTEGER) TO service_role;

-- 되돌림 SQL
-- 새 함수만 지운다. 이미 잠긴 채 놓인 시스템 드랍과 개체는 남는다(줍힐 수 있다). 이 함수를 쓰는 새 코드(시스템 드랍 엔진의 잠긴 채 놓기)는 같은 시점에 되돌려야 한다.
-- DROP FUNCTION IF EXISTS public.mint_and_place_ambient_drop_locked(UUID, UUID, TEXT, INTEGER);
