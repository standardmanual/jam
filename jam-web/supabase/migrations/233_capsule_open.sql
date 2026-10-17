-- 233_capsule_open.sql
-- JAM 2.0 캡슐 열기 (티켓 20261018_0052 2회, 운영 로직 5.2·6.6절)
--
-- 새 함수 하나(capsule_open)만 더한다. 232가 만든 표와 함수, 옛 객체는 바꾸지 않는다. 옛 프로덕션 코드는 이 함수를 쓰지 않는다.
--
-- 추첨(개수, 트라이브, 등급, 후보, 잠김)은 앱 코드가 하고, 이 함수는 «정해진 결과»를 한 번에 확정한다. 한 트랜잭션 안에서
--   1) 이용 정지 확인  2) 캡슐 행 잠금과 가득 참 확인  3) 인벤토리 행 잠금과 빈칸 확인  4) 개체 지급(잠김 포함) + 발급 기록(item_issue_log, route 'capsule')
--   5) 열기 기록(capsule_opens)  6) 보정 카운터 갱신(common_streak, capsule_epic_miss)  7) 다음 캡슐 생성(그때의 챕터로 필요량 고정)
-- 을 한다. 한 단계라도 실패하면 전체가 되돌려져 «채운 잼이 사라지고 개체가 안 나오는» 상태가 생기지 않는다. 같은 캡슐을 동시에 두 번 열어도
-- 캡슐 행 잠금 때문에 한 번만 열린다(두 번째는 가득 차지 않은 새 캡슐을 만나 not_full로 거절된다).
--
-- 입력 p_items: JSON 배열. 항목마다 {badge_id, rarity, rolled_rarity(선택), locked(기본 false), lock_reason, unlock_required}.
--   항목 수는 0 이상 capsule_policy.guaranteed_count + bonus_count 이하다.
-- 빈칸 규칙: 빈칸이 «나올 수 있는 최대 개수»(guaranteed_count + bonus_count)보다 적으면 열 수 없다(insufficient_slots, 지금 빈칸과 필요한 빈칸을 돌려준다).
--   채운 잼은 그대로 남고 다음 캡슐은 생기지 않는다.
-- 오류 코드: user_suspended / not_full / insufficient_slots / invalid_items / inventory_not_found
-- 성공: {ok, openId, itemIds, items:[{inventoryItemId, badgeId, rarity, locked, serialNumber}], next:{required, filled}}
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'capsule_open';                          -- 1행, true
--   SELECT has_function_privilege('authenticated', 'public.capsule_open(uuid, jsonb)', 'EXECUTE');   -- false

CREATE OR REPLACE FUNCTION public.capsule_open(p_user_id UUID, p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy RECORD;
  v_cap public.user_capsules;
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
  v_next public.user_capsules;
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

  PERFORM public.capsule_get_or_create(p_user_id);
  SELECT * INTO v_cap FROM public.user_capsules WHERE user_id = p_user_id FOR UPDATE;
  IF v_cap.filled < v_cap.required THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_full', 'required', v_cap.required, 'filled', v_cap.filled);
  END IF;

  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;
  v_free := GREATEST(0, v_inv.max_slots - v_inv.used_slots);
  IF v_free < v_max_items THEN
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
      RAISE EXCEPTION 'capsule_open_grant_failed: %', COALESCE(v_grant->>'reason', 'unknown');
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

  -- 보정 카운터: Epic 이상이 나오면 0, 아니면 +1. common_streak는 동기화와 합산해 센다(나온 순서대로).
  v_epic_miss := CASE WHEN v_has_epic THEN 0 ELSE v_epic_miss + 1 END;
  INSERT INTO public.user_drop_state (user_id, common_streak, capsule_epic_miss)
    VALUES (p_user_id, v_streak, v_epic_miss)
    ON CONFLICT (user_id) DO UPDATE
      SET common_streak = EXCLUDED.common_streak, capsule_epic_miss = EXCLUDED.capsule_epic_miss, updated_at = now();

  INSERT INTO public.capsule_opens (user_id, chapter_no, required, filled, items)
    VALUES (p_user_id, v_cap.chapter_no, v_cap.required, v_cap.filled, v_result)
    RETURNING id INTO v_open_id;

  -- 다음 캡슐: 지금의 챕터로 필요량을 새로 정한다
  DELETE FROM public.user_capsules WHERE user_id = p_user_id;
  SELECT * INTO v_next FROM public.capsule_get_or_create(p_user_id);

  RETURN jsonb_build_object(
    'ok', TRUE,
    'openId', v_open_id,
    'itemIds', to_jsonb(v_item_ids),
    'items', v_result,
    'next', jsonb_build_object('required', v_next.required, 'filled', v_next.filled)
  );
END;
$$;

COMMENT ON FUNCTION public.capsule_open(UUID, JSONB) IS
  '캡슐 열기 확정. 정해진 결과(p_items)를 한 트랜잭션으로 지급·기록하고 보정 카운터를 갱신하고 다음 캡슐을 만든다. 빈칸이 최대 개수보다 적거나 가득 차지 않았거나 이용 정지 중이면 거절. service_role 전용.';

REVOKE ALL ON FUNCTION public.capsule_open(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capsule_open(UUID, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capsule_open(UUID, JSONB) TO service_role;

-- 되돌림 SQL
-- 새 함수만 지운다. 이미 연 캡슐의 기록(capsule_opens, item_issue_log)과 지급된 개체는 남는다.
-- 이 함수를 쓰는 새 코드(캡슐 열기 API)는 같은 시점에 되돌려야 한다.
-- DROP FUNCTION IF EXISTS public.capsule_open(UUID, JSONB);
