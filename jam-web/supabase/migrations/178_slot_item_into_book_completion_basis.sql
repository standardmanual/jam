-- ============================================================
-- Migration 178: slot_item_into_book() 완성 분모·분자에서 드랍 제외 배지 제외
--
-- 티켓: 20260921_1111 (상위 20260914_1130, 정책 근거 20260911_2236)
--
-- 157의 정의에서 바뀐 곳은 "완성 체크" 두 쿼리(분모 v_total_badges, 분자 v_slotted_count)뿐이다.
-- 시그니처·중복 방지(ON CONFLICT, ROW_COUNT)·포인트 지급·GRANT는 그대로다.
-- 이미 쌓인 완성 기록·보상은 건드리지 않는다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT) — 제외 배지가 있는 컬렉션에서 분모가 줄어드는지:
--   SELECT item_book_id,
--          COUNT(*) FILTER (WHERE deleted_at IS NULL) AS 이전_분모,
--          COUNT(*) FILTER (WHERE deleted_at IS NULL AND drop_excluded = false) AS 새_분모
--   FROM public.badges WHERE item_book_id IS NOT NULL
--   GROUP BY item_book_id
--   HAVING COUNT(*) FILTER (WHERE drop_excluded = true) > 0;
-- ============================================================

CREATE OR REPLACE FUNCTION public.slot_item_into_book(
  p_user_id           UUID,
  p_item_book_id      UUID,
  p_inventory_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inv              RECORD;
  v_item             RECORD;
  v_badge            RECORD;
  v_slot             RECORD;
  v_username         TEXT;
  v_total_badges     INTEGER;
  v_slotted_count    INTEGER;
  v_reward_points    INTEGER;
  v_newly_completed  INTEGER;
BEGIN
  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
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

  -- 개체 정체성 모델(108)에서 "드랍됨"은 inventory_id가 NULL로 비는 것으로 표현된다.
  -- NULL이면 현재 아무도 소유하지 않은(드랍된) 개체 — "본인 소유 아님"과는 구분해
  -- 기존 409 "이미 드랍된 아이템입니다." 응답을 정확히 복원한다.
  IF v_item.inventory_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_dropped');
  END IF;

  IF v_item.inventory_id IS DISTINCT FROM v_inv.id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_owner');
  END IF;

  IF v_item.slotted_in IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_slotted');
  END IF;

  SELECT id, item_book_id INTO v_badge FROM public.badges WHERE id = v_item.badge_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'badge_not_found');
  END IF;

  IF v_badge.item_book_id IS DISTINCT FROM p_item_book_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'wrong_item_book');
  END IF;

  BEGIN
    INSERT INTO public.user_item_book_slots (user_id, item_book_id, badge_id, inventory_item_id)
    VALUES (p_user_id, p_item_book_id, v_item.badge_id, p_inventory_item_id)
    RETURNING * INTO v_slot;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'slot_insert_failed');
  END;

  UPDATE public.inventory_items SET slotted_in = v_slot.id WHERE id = p_inventory_item_id;

  -- 아이템북에 들어간 아이템은 인벤토리 칸을 더 이상 차지하지 않음 — 칸 반환
  UPDATE public.inventory SET used_slots = GREATEST(0, v_inv.used_slots - 1) WHERE id = v_inv.id;

  SELECT username INTO v_username FROM public.users WHERE id = p_user_id;
  INSERT INTO public.custody_events (inventory_item_id, event_type, actor_user_id, actor_username)
  VALUES (p_inventory_item_id, 'Slot', p_user_id, v_username);

  -- 완성 체크 (티켓 20260921_1111): 분모는 드랍 제외 배지(drop_excluded = true)를 뺀 배지 수,
  -- 분자는 슬롯 중 분모에 속한 배지만 센 수(교집합). 슬롯 개수를 그대로 쓰지 않아
  -- 제외 배지를 이미 장착한 사용자가 조기 완성되지 않게 한다.
  -- 소프트 삭제 배지(deleted_at)는 기존대로 분모에서 제외한다(통일은 티켓 20260921_1114).
  SELECT COUNT(*) INTO v_total_badges
  FROM public.badges
  WHERE item_book_id = p_item_book_id AND deleted_at IS NULL AND drop_excluded = false;

  SELECT COUNT(DISTINCT s.badge_id) INTO v_slotted_count
  FROM public.user_item_book_slots s
  JOIN public.badges b ON b.id = s.badge_id
  WHERE s.user_id = p_user_id AND s.item_book_id = p_item_book_id
    AND b.item_book_id = p_item_book_id AND b.deleted_at IS NULL AND b.drop_excluded = false;

  IF v_total_badges > 0 AND v_slotted_count >= v_total_badges THEN
    INSERT INTO public.user_item_book_completions (user_id, item_book_id)
    VALUES (p_user_id, p_item_book_id)
    ON CONFLICT (user_id, item_book_id) DO NOTHING;

    -- ON CONFLICT DO NOTHING이 실제로 새 행을 삽입한 경우(최초 완성)에만 지급한다.
    -- 이미 완성돼 있던 컬렉션에 재슬롯 등으로 재진입해 아무 것도 삽입되지 않은 경우는
    -- 중복 지급하지 않는다.
    GET DIAGNOSTICS v_newly_completed = ROW_COUNT;

    IF v_newly_completed > 0 THEN
      SELECT reward_points INTO v_reward_points FROM public.item_books WHERE id = p_item_book_id;

      IF v_reward_points IS NOT NULL AND v_reward_points > 0 THEN
        PERFORM public.award_points(
          p_user_id,
          v_reward_points,
          'item_book_completion_point_reward',
          NULL,
          NULL,
          NULL,
          NULL,
          p_item_book_id
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'slot', to_jsonb(v_slot));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.slot_item_into_book(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.slot_item_into_book(uuid, uuid, uuid) TO service_role;
