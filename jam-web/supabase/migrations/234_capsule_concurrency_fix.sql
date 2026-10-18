-- 234_capsule_concurrency_fix.sql
-- 캡슐 채우기·열기의 동시 호출 보정 (티켓 20261018_0052 2회 게이트 발견물, 232·233의 함수를 고친다)
--
-- 232·233은 아직 쓰는 곳이 없는 새 함수라 CREATE OR REPLACE로 본문만 바꾼다. 새 테이블·새 칸은 없고 옛 객체는 건드리지 않는다.
--
-- 문제(READ COMMITTED에서의 행 잠금)
--   capsule_open이 끝에서 캡슐 행을 DELETE하고 새로 INSERT하므로, 같은 유저의 두 번째 호출(열기 또는 채우기)이 `SELECT ... FOR UPDATE`에서
--   기다리다 첫 호출이 커밋하면 «기다리던 행이 지워졌다»는 이유로 0행을 받는다(새로 생긴 행은 이미 잡은 스냅샷에 없다). 그러면 캡슐 변수의
--   칸이 전부 NULL이 되고 `filled < required`, `remaining <= 0` 같은 비교가 NULL이라 거절 검사를 지나친다.
--     - 열기: 두 번째 호출이 계속 진행하다 capsule_opens의 NOT NULL 칸에서 실패해 전체가 되돌려진다(지급은 남지 않지만 오류 응답이 거칠다).
--     - 채우기: 남은 양이 NULL이라 `LEAST(COALESCE(p_amount, NULL), 잔액)`이 잔액이 되어 jam_apply로 잼을 차감하는데 캡슐 갱신은 0행이다
--       → 잼이 사라진다(열기와 채우기가 동시에 올 때만 생기는 드문 경우지만 잼이 사라지므로 막는다).
--
-- 고침
--   1) 다음 캡슐을 DELETE+INSERT가 아니라 같은 행의 UPDATE로 초기화한다. 행이 사라지지 않으므로 기다리던 호출이 커밋 뒤 갱신된 행을 다시 읽는다
--      (열기는 not_full로 거절되고 채우기는 새 캡슐에 정상으로 채운다).
--   2) 필요량 계산을 capsule_next_required로 빼서 capsule_get_or_create와 capsule_open이 같은 규칙을 쓴다.
--   3) 두 함수 모두 `FOR UPDATE` 직후 행이 없으면(NOT FOUND) 방어적으로 거절한다(capsule_changed, 다시 시도하면 된다).
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT proname FROM pg_proc WHERE proname IN ('capsule_next_required','capsule_get_or_create','capsule_fill','capsule_open') ORDER BY proname;   -- 4행
--   SELECT has_function_privilege('authenticated', 'public.capsule_next_required(uuid)', 'EXECUTE');                                              -- false

CREATE OR REPLACE FUNCTION public.capsule_next_required(p_user_id UUID, OUT required INTEGER, OUT chapter_no INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chapter INTEGER;
  v_required INTEGER;
BEGIN
  SELECT uc.chapter_no INTO v_chapter FROM public.user_chapters uc WHERE uc.user_id = p_user_id;
  IF v_chapter IS NULL THEN
    SELECT pre_quest_fill_amount INTO v_required FROM public.capsule_policy WHERE id = 1;
  ELSE
    SELECT fill_amount INTO v_required FROM public.capsule_chapter_costs c WHERE c.chapter_no = v_chapter;
    IF v_required IS NULL THEN
      SELECT fill_amount INTO v_required FROM public.capsule_chapter_costs ORDER BY capsule_chapter_costs.chapter_no DESC LIMIT 1;
    END IF;
  END IF;
  required := v_required;
  chapter_no := v_chapter;
END;
$$;

COMMENT ON FUNCTION public.capsule_next_required(UUID) IS
  '지금의 챕터로 새 캡슐의 필요량과 챕터를 정한다(챕터가 없으면 퀘스트 전 값, 표의 마지막보다 높으면 마지막 양). service_role 전용.';

CREATE OR REPLACE FUNCTION public.capsule_get_or_create(p_user_id UUID)
RETURNS public.user_capsules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.user_capsules;
  v_next RECORD;
BEGIN
  SELECT * INTO v_row FROM public.user_capsules WHERE user_id = p_user_id;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT * INTO v_next FROM public.capsule_next_required(p_user_id);

  INSERT INTO public.user_capsules (user_id, required, filled, chapter_no)
    VALUES (p_user_id, v_next.required, 0, v_next.chapter_no)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.user_capsules WHERE user_id = p_user_id;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.capsule_fill(p_user_id UUID, p_amount INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap public.user_capsules;
  v_remaining INTEGER;
  v_balance BIGINT;
  v_amount INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  PERFORM public.capsule_get_or_create(p_user_id);
  SELECT * INTO v_cap FROM public.user_capsules WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'capsule_changed');
  END IF;

  v_remaining := v_cap.required - v_cap.filled;
  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_full', 'required', v_cap.required, 'filled', v_cap.filled);
  END IF;

  IF p_amount IS NOT NULL AND p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_amount');
  END IF;
  IF p_amount IS NOT NULL AND p_amount > v_remaining THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'exceeds_remaining', 'remaining', v_remaining);
  END IF;

  SELECT COALESCE(balance, 0) INTO v_balance FROM public.jam_wallets WHERE user_id = p_user_id;
  v_balance := COALESCE(v_balance, 0);
  IF v_balance <= 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'insufficient_jam', 'balance', 0);
  END IF;

  v_amount := LEAST(COALESCE(p_amount, v_remaining), v_balance)::INTEGER;

  PERFORM public.jam_apply(p_user_id, -v_amount, 'capsule_fill');
  UPDATE public.user_capsules SET filled = filled + v_amount, updated_at = now() WHERE user_id = p_user_id;

  SELECT * INTO v_cap FROM public.user_capsules WHERE user_id = p_user_id;
  SELECT COALESCE(balance, 0) INTO v_balance FROM public.jam_wallets WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'applied', v_amount,
    'required', v_cap.required,
    'filled', v_cap.filled,
    'remaining', v_cap.required - v_cap.filled,
    'balance', COALESCE(v_balance, 0)
  );
END;
$$;

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
  v_next RECORD;
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
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'capsule_changed');
  END IF;
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

  v_epic_miss := CASE WHEN v_has_epic THEN 0 ELSE v_epic_miss + 1 END;
  INSERT INTO public.user_drop_state (user_id, common_streak, capsule_epic_miss)
    VALUES (p_user_id, v_streak, v_epic_miss)
    ON CONFLICT (user_id) DO UPDATE
      SET common_streak = EXCLUDED.common_streak, capsule_epic_miss = EXCLUDED.capsule_epic_miss, updated_at = now();

  INSERT INTO public.capsule_opens (user_id, chapter_no, required, filled, items)
    VALUES (p_user_id, v_cap.chapter_no, v_cap.required, v_cap.filled, v_result)
    RETURNING id INTO v_open_id;

  -- 다음 캡슐: 같은 행을 초기화한다(행을 지우지 않아야 기다리던 호출이 갱신된 행을 다시 읽는다)
  SELECT * INTO v_next FROM public.capsule_next_required(p_user_id);
  UPDATE public.user_capsules
     SET required = v_next.required, filled = 0, chapter_no = v_next.chapter_no, created_at = now(), updated_at = now()
   WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'openId', v_open_id,
    'itemIds', to_jsonb(v_item_ids),
    'items', v_result,
    'next', jsonb_build_object('required', v_next.required, 'filled', 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.capsule_next_required(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capsule_next_required(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capsule_next_required(UUID) TO service_role;

-- 되돌림 SQL
-- 232·233의 본문으로 되돌린다(capsule_get_or_create는 232, capsule_fill은 232, capsule_open은 233의 본문). 되돌리면 위의 동시 호출 문제가 다시 생긴다.
-- DROP FUNCTION IF EXISTS public.capsule_next_required(UUID)는 되돌린 capsule_get_or_create가 더는 쓰지 않을 때 지운다.
