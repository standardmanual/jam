-- 324_capsule_claim_pending_stored_items_down.sql
-- 324_capsule_claim_pending_stored_items.sql의 되돌림 — capsule_claim_pending을 302의 정의로 복원한다.
-- 먼저 jam-web이 저장된 항목(drawn_items)으로 지급하는 새 claim.ts·settle-pending.ts를 모르는 코드로 돌아가 있어야 한다.
-- 시그니처가 같아 DROP이 필요 없고 권한은 CREATE OR REPLACE가 유지한다.
-- 이미 일어난 일은 남는다: 새 함수로 이미 지급된 개체·item_issue_log·capsule_opens 줄.
-- 복원한 302 본문은 빈칸이 «최대 개수»보다 적으면 거절하므로, drawn_items가 1개인 보류는 빈칸이 최대 개수 이상이 될 때까지 받지 못한다.

CREATE OR REPLACE FUNCTION public.capsule_claim_pending(p_user_id UUID, p_pending_id UUID, p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy RECORD;
  v_cap public.user_capsules;
  v_pending public.capsule_pending_rewards;
  v_inv RECORD;
  v_max_items INTEGER;
  v_n INTEGER;
  v_free INTEGER;
  v_item JSONB;
  v_grant JSONB;
  v_item_id UUID;
  v_serial INTEGER;
  v_locked BOOLEAN;
  v_rarity TEXT;
  v_result JSONB := '[]'::jsonb;
  v_item_ids UUID[] := ARRAY[]::UUID[];
  v_streak INTEGER;
  v_epic_miss INTEGER;
  v_has_epic BOOLEAN := FALSE;
  v_open_id UUID;
  v_remaining INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  SELECT * INTO v_policy FROM public.capsule_policy WHERE id = 1;
  v_max_items := v_policy.guaranteed_count + v_policy.bonus_count;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_items');
  END IF;
  v_n := jsonb_array_length(p_items);
  IF v_n > v_max_items THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_items', 'max', v_max_items);
  END IF;

  -- 캡슐 행을 먼저 잠근다: 보류를 만들거나(hold) 소멸시키는(auto_fill) 호출과 직렬화한다. 캡슐 자체는 바꾸지 않는다.
  PERFORM public.capsule_get_or_create(p_user_id);
  SELECT * INTO v_cap FROM public.user_capsules WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'capsule_changed');
  END IF;

  SELECT * INTO v_pending FROM public.capsule_pending_rewards
   WHERE id = p_pending_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'pending_not_found');
  END IF;

  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;
  v_free := GREATEST(0, v_inv.max_slots - v_inv.used_slots);
  IF v_free < v_max_items THEN
    -- 아무것도 바꾸지 않는다. 보류는 그대로 남는다.
    RETURN jsonb_build_object('ok', FALSE, 'error', 'insufficient_slots', 'free', v_free, 'needed', v_max_items);
  END IF;

  SELECT COALESCE(common_streak, 0), COALESCE(capsule_epic_miss, 0) INTO v_streak, v_epic_miss
    FROM public.user_drop_state WHERE user_id = p_user_id;
  v_streak := COALESCE(v_streak, 0);
  v_epic_miss := COALESCE(v_epic_miss, 0);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_locked := COALESCE((v_item->>'locked')::BOOLEAN, FALSE);
    v_rarity := v_item->>'rarity';

    v_grant := public.grant_inventory_item_locked(
      v_inv.id,
      (v_item->>'badge_id')::UUID,
      'drop',
      NULL,
      v_locked,
      v_item->>'lock_reason',
      (v_item->>'unlock_required')::INTEGER
    );
    IF NOT COALESCE((v_grant->>'ok')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'capsule_claim_pending_grant_failed: %', COALESCE(v_grant->>'reason', 'unknown');
    END IF;

    v_item_id := (v_grant->>'itemId')::UUID;
    SELECT serial_number INTO v_serial FROM public.inventory_items WHERE id = v_item_id;

    INSERT INTO public.item_issue_log
      (user_id, inventory_item_id, route, source_activity_id, badge_id, rarity, rolled_rarity, locked, serial_number)
    VALUES
      (p_user_id, v_item_id, 'capsule', NULL, (v_item->>'badge_id')::UUID, v_rarity::public.badge_rarity,
       NULLIF(v_item->>'rolled_rarity', '')::public.badge_rarity, v_locked, v_serial);

    IF v_rarity = 'common' THEN
      v_streak := v_streak + 1;
    ELSE
      v_streak := 0;
    END IF;
    IF v_rarity IN ('epic', 'mystic') THEN
      v_has_epic := TRUE;
    END IF;

    v_item_ids := array_append(v_item_ids, v_item_id);
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'inventoryItemId', v_item_id,
      'badgeId', v_item->>'badge_id',
      'rarity', v_rarity,
      'locked', v_locked,
      'serialNumber', v_serial
    ));
  END LOOP;

  v_epic_miss := CASE WHEN v_has_epic THEN 0 ELSE v_epic_miss + 1 END;
  INSERT INTO public.user_drop_state (user_id, common_streak, capsule_epic_miss)
    VALUES (p_user_id, v_streak, v_epic_miss)
    ON CONFLICT (user_id) DO UPDATE
      SET common_streak = EXCLUDED.common_streak, capsule_epic_miss = EXCLUDED.capsule_epic_miss, updated_at = now();

  -- 연 기록: 보류가 만들어질 때의 챕터와 채운 양을 남긴다(required = filled = 보류의 fill_amount).
  INSERT INTO public.capsule_opens (user_id, chapter_no, required, filled, items)
    VALUES (p_user_id, v_pending.chapter_no, v_pending.fill_amount, v_pending.fill_amount, v_result)
    RETURNING id INTO v_open_id;

  DELETE FROM public.capsule_pending_rewards WHERE id = v_pending.id;
  SELECT COUNT(*)::INTEGER INTO v_remaining FROM public.capsule_pending_rewards WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'openId', v_open_id,
    'itemIds', to_jsonb(v_item_ids),
    'items', v_result,
    'pendingCount', v_remaining
  );
END;
$$;

COMMENT ON FUNCTION public.capsule_claim_pending(UUID, UUID, JSONB) IS
  '보류 보상 한 줄을 받는다: 정지 확인, 캡슐·보류·인벤토리 잠금, 빈칸이 guaranteed_count+bonus_count보다 적으면 아무것도 바꾸지 않고 insufficient_slots(free, needed). 충분하면 capsule_open과 같은 방식으로 지급·기록하고 그 보류 줄을 지운다. 반환의 pendingCount는 남은 보류 수. service_role 전용.';
