-- 368_chapter_reward_grant.sql
-- 챕터 오름 보상을 인벤토리에 넣는 함수 2개를 더한다: chapter_reward_issue, chapter_reward_claim (티켓 20261127_1751, 상위 20261127_1720)
--
-- 확장 단계다(db-migration-rules.md 1절). 새 함수 2개만 더하고 표·데이터·옛 함수(capsule_*, grant_inventory_item*)는 바꾸지 않는다.
-- 이 함수를 부르는 곳은 아직 없다. C3b(챕터 오름 보상 지급)가 부른다.
--
-- 동작 요약
--   - chapter_reward_claim(유저, 챕터): pending 행에 저장된 drawn_items를 «다시 뽑지 않고» 그대로 인벤토리에 넣고 claimed로 바꾼다.
--     순서는 capsule_claim_pending(324)을 따른다: 이용 정지 확인 → 지급 행 잠금 → 인벤토리 행 잠금 → 빈칸 확인(모자라면 아무것도 바꾸지 않음)
--     → 항목마다 grant_inventory_item_locked('drop') + item_issue_log(route = 'chapter_reward') → 같은 등급 연속·에픽 보정 카운터 갱신 → 지급 행 claimed.
--   - chapter_reward_issue(유저, 챕터, 추첨 결과): 추첨 결과를 chapter_reward_grants에 pending으로 한 번만 기록하고 곧바로 claim을 불러 빈칸이 충분하면 지급한다. 모자라면 pending으로 남긴다.
--   - capsule_opens는 건드리지 않는다. 포인트 지급·칸 부족 알림은 TS 후속 처리가 한다.
--
-- 적용 대상: Supabase는 staging·프로덕션 공용 단일 DB라 적용 즉시 프로덕션에 반영된다.
-- 모든 문장은 다시 실행해도 같은 결과가 나온다(CREATE OR REPLACE, REVOKE/GRANT).
-- 되돌림은 368_chapter_reward_grant_down.sql.
--
-- 🚨 활동 피드 제외 규칙이 item_issue_log.route = 'capsule'을 직접 읽는다(capsuleItems.ts, lockedItemFill.ts). 새 경로 값 'chapter_reward'도
--    같은 규칙으로 다루도록 C3b가 고쳐야 한다. 이 함수로 지급이 일어나기 전에 C3b가 배포되어 있어야 한다.

-- ----------------------------------------------------------------
-- 1. chapter_reward_claim — pending 행을 저장된 항목 그대로 지급한다
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chapter_reward_claim(p_user_id UUID, p_chapter_no INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_grant_row public.chapter_reward_grants;
  v_inv RECORD;
  v_items JSONB;
  v_n INTEGER;
  v_free INTEGER;
  v_item JSONB;
  v_grant JSONB;
  v_item_id UUID;
  v_serial INTEGER;
  v_locked BOOLEAN;
  v_rarity TEXT;
  v_result JSONB := '[]'::jsonb;
  v_streak INTEGER;
  v_epic_miss INTEGER;
  v_has_epic BOOLEAN := FALSE;
  v_remaining INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_chapter_no IS NULL OR p_chapter_no < 1 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_input');
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  -- 지급 행을 잠근다: 같은 유저·챕터를 동시에 받으려는 호출을 직렬화한다.
  SELECT * INTO v_grant_row FROM public.chapter_reward_grants
   WHERE user_id = p_user_id AND chapter_no = p_chapter_no FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'grant_not_found');
  END IF;
  IF v_grant_row.status = 'claimed' THEN
    RETURN jsonb_build_object('ok', TRUE, 'duplicate', TRUE, 'status', 'claimed', 'chapterNo', p_chapter_no);
  END IF;

  v_items := v_grant_row.drawn_items;
  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) < 1 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_items');
  END IF;
  v_n := jsonb_array_length(v_items);

  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;
  v_free := GREATEST(0, v_inv.max_slots - v_inv.used_slots);
  IF v_free < v_n THEN
    -- 아무것도 바꾸지 않는다. 지급 행은 pending으로 남는다.
    RETURN jsonb_build_object('ok', FALSE, 'error', 'insufficient_slots', 'free', v_free, 'needed', v_n);
  END IF;

  SELECT COALESCE(common_streak, 0), COALESCE(capsule_epic_miss, 0) INTO v_streak, v_epic_miss
    FROM public.user_drop_state WHERE user_id = p_user_id;
  v_streak := COALESCE(v_streak, 0);
  v_epic_miss := COALESCE(v_epic_miss, 0);

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
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
      -- 예외로 트랜잭션 전체를 취소한다(부분 지급 없음).
      RAISE EXCEPTION 'chapter_reward_claim_grant_failed: %', COALESCE(v_grant->>'reason', 'unknown');
    END IF;

    v_item_id := (v_grant->>'itemId')::UUID;
    SELECT serial_number INTO v_serial FROM public.inventory_items WHERE id = v_item_id;

    INSERT INTO public.item_issue_log
      (user_id, inventory_item_id, route, source_activity_id, badge_id, rarity, rolled_rarity, locked, serial_number)
    VALUES
      (p_user_id, v_item_id, 'chapter_reward', NULL, (v_item->>'badge_id')::UUID, v_rarity::public.badge_rarity,
       NULLIF(v_item->>'rolled_rarity', '')::public.badge_rarity, v_locked, v_serial);

    IF v_rarity = 'common' THEN
      v_streak := v_streak + 1;
    ELSE
      v_streak := 0;
    END IF;
    IF v_rarity IN ('epic', 'mystic') THEN
      v_has_epic := TRUE;
    END IF;

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

  UPDATE public.chapter_reward_grants
     SET status = 'claimed', claimed_at = now()
   WHERE user_id = p_user_id AND chapter_no = p_chapter_no;

  SELECT COUNT(*)::INTEGER INTO v_remaining
    FROM public.chapter_reward_grants WHERE user_id = p_user_id AND status = 'pending';

  RETURN jsonb_build_object(
    'ok', TRUE,
    'duplicate', FALSE,
    'chapterNo', p_chapter_no,
    'items', v_result,
    'pendingCount', v_remaining
  );
END;
$$;

COMMENT ON FUNCTION public.chapter_reward_claim(UUID, INTEGER) IS
  '챕터 보상 지급 행(chapter_reward_grants)의 pending을 받는다: 정지 확인, 지급 행·인벤토리 잠금. 저장된 drawn_items를 다시 뽑지 않고 그대로 지급한다. 빈칸이 항목 수보다 적으면 아무것도 바꾸지 않고 insufficient_slots(free, needed). 충분하면 항목마다 grant_inventory_item_locked(drop)와 item_issue_log(route = chapter_reward)를 기록하고 같은 등급 연속·에픽 보정 카운터를 갱신한 뒤 claimed로 바꾼다. 이미 claimed면 duplicate. 반환의 pendingCount는 남은 pending 행 수. C3b가 부른다. service_role 전용.';

REVOKE ALL ON FUNCTION public.chapter_reward_claim(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chapter_reward_claim(UUID, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chapter_reward_claim(UUID, INTEGER) TO service_role;

-- ----------------------------------------------------------------
-- 2. chapter_reward_issue — 추첨 결과를 한 번만 기록하고 빈칸이 충분하면 곧바로 지급한다
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chapter_reward_issue(p_user_id UUID, p_chapter_no INTEGER, p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_elem JSONB;
  v_rows INTEGER;
  v_status TEXT;
  v_claim JSONB;
BEGIN
  IF p_user_id IS NULL OR p_chapter_no IS NULL OR p_chapter_no < 1 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_input');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 50 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_items');
  END IF;
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object'
       OR COALESCE(v_elem->>'badge_id', '') = ''
       OR COALESCE(v_elem->>'rarity', '') = '' THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_items');
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.chapter_definitions WHERE chapter_no = p_chapter_no) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'chapter_not_found');
  END IF;

  -- (유저, 챕터)당 한 번만 기록한다. 이미 있으면 다시 지급하지 않는다.
  INSERT INTO public.chapter_reward_grants (user_id, chapter_no, reward_count, drawn_items, status)
  VALUES (p_user_id, p_chapter_no, jsonb_array_length(p_items), p_items, 'pending')
  ON CONFLICT (user_id, chapter_no) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    SELECT status INTO v_status FROM public.chapter_reward_grants
     WHERE user_id = p_user_id AND chapter_no = p_chapter_no;
    RETURN jsonb_build_object('ok', TRUE, 'duplicate', TRUE, 'status', v_status, 'chapterNo', p_chapter_no);
  END IF;

  v_claim := public.chapter_reward_claim(p_user_id, p_chapter_no);

  IF COALESCE((v_claim->>'ok')::BOOLEAN, FALSE) THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'duplicate', FALSE,
      'status', 'claimed',
      'chapterNo', p_chapter_no,
      'items', v_claim->'items'
    );
  END IF;

  IF v_claim->>'error' = 'insufficient_slots' THEN
    -- 행은 pending으로 남긴다. 나중에 chapter_reward_claim으로 받는다.
    RETURN jsonb_build_object(
      'ok', TRUE,
      'duplicate', FALSE,
      'status', 'pending',
      'chapterNo', p_chapter_no,
      'free', v_claim->'free',
      'needed', v_claim->'needed'
    );
  END IF;

  -- 그 밖의 오류: 오류를 반환하면 트랜잭션이 취소되지 않으므로 방금 넣은 pending 행을 직접 지운다.
  DELETE FROM public.chapter_reward_grants
   WHERE user_id = p_user_id AND chapter_no = p_chapter_no AND status = 'pending';
  RETURN v_claim;
END;
$$;

COMMENT ON FUNCTION public.chapter_reward_issue(UUID, INTEGER, JSONB) IS
  '챕터 보상 추첨 결과를 기록하고 지급한다: 입력 검사(항목 1~50개, 각 항목에 badge_id·rarity), 정지 확인, 챕터 존재 확인. 같은 (유저, 챕터)는 chapter_reward_grants에 pending으로 한 번만 기록하고(이미 있으면 duplicate, 다시 지급하지 않음) 곧바로 chapter_reward_claim을 부른다. 빈칸이 충분하면 claimed로 지급, 모자라면 pending으로 남기고 free·needed를 돌려준다. 그 밖의 오류는 방금 넣은 pending 행을 지우고 그 오류를 돌려준다. 발급 기록 경로 값은 chapter_reward. C3b가 부른다. service_role 전용.';

REVOKE ALL ON FUNCTION public.chapter_reward_issue(UUID, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chapter_reward_issue(UUID, INTEGER, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chapter_reward_issue(UUID, INTEGER, JSONB) TO service_role;
