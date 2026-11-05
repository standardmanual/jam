-- 323_capsule_pending_drawn_items_down.sql
-- 323_capsule_pending_drawn_items.sql의 되돌림 — 교체한 세 함수를 이전 정의로 복원하고, 새 함수와 새 열을 지운다.
-- 먼저 jam-web이 capsule_hold_rolled·capsule_receive_blocked의 새 키(pending·shortfall)·auto-fill의 pendingCount 처리를 모르는 코드로 돌아가 있어야 한다
-- (새 함수를 지우면 보류를 만드는 코드가 실패한다).
-- 순서: 교체한 함수 복원(시그니처가 같아 DROP 불필요, 권한은 CREATE OR REPLACE가 유지한다) → capsule_hold_rolled 삭제 → drawn_items 열 삭제.
--   - capsule_receive_blocked: 320 본문 그대로
--   - capsule_auto_fill: 322 본문 그대로
--   - capsule_open: 234 본문 그대로(빈칸 검사가 다시 «최대 개수»), 233의 COMMENT도 복원한다
-- 이미 일어난 일은 남는다: drawn_items가 들어 있는 보류 줄(열을 지우면 먼저 뽑은 결과를 잃는다). 되돌리기 전에 보류 줄을 정리하거나 받게 한다.
--   복원한 capsule_receive_blocked는 보류 줄을 보지 않는다.

-- 1. capsule_receive_blocked — 320
CREATE OR REPLACE FUNCTION public.capsule_receive_blocked(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_needed INTEGER;
  v_free INTEGER;
  v_full BOOLEAN;
  v_cap_found BOOLEAN;
  v_inv_found BOOLEAN;
  v_policy_found BOOLEAN;
BEGIN
  SELECT guaranteed_count + bonus_count INTO v_needed FROM public.capsule_policy WHERE id = 1;
  v_policy_found := FOUND;

  SELECT (filled >= required) INTO v_full FROM public.user_capsules WHERE user_id = p_user_id;
  v_cap_found := FOUND;

  SELECT GREATEST(0, max_slots - used_slots) INTO v_free FROM public.inventory WHERE user_id = p_user_id;
  v_inv_found := FOUND;

  RETURN jsonb_build_object(
    'blocked', (v_policy_found AND v_cap_found AND v_inv_found AND v_full AND v_free < v_needed),
    'free', COALESCE(v_free, 0),
    'needed', COALESCE(v_needed, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.capsule_receive_blocked(UUID) IS
  '캡슐이 가득(filled >= required)이고 인벤토리 빈칸이 guaranteed_count+bonus_count보다 적으면 blocked=true. {blocked, free, needed}를 돌려준다. 캡슐·인벤토리·정책 행이 없으면 막지 않는다. 읽기 전용. service_role 전용.';

-- 2. capsule_auto_fill — 322
CREATE OR REPLACE FUNCTION public.capsule_auto_fill(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap public.user_capsules;
  v_next RECORD;
  v_balance BIGINT;
  v_remaining INTEGER;
  v_amount INTEGER := 0;
  v_reached INTEGER[] := ARRAY[]::INTEGER[];
  v_chapter INTEGER;
  v_count INTEGER;
  v_advance INTEGER;
  v_next_chapter INTEGER;
  v_chapter_count INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  PERFORM public.capsule_get_or_create(p_user_id);
  SELECT * INTO v_cap FROM public.user_capsules WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'capsule_changed');
  END IF;

  -- 아직 채우지 않은 캡슐은 필요량·챕터를 v2 기준으로 맞춘다(옛 함수가 만든 캡슐 포함). 301·302와 같다.
  IF v_cap.filled = 0 THEN
    SELECT * INTO v_next FROM public.capsule_next_required_v2(p_user_id);
    IF v_cap.required IS DISTINCT FROM v_next.required OR v_cap.chapter_no IS DISTINCT FROM v_next.chapter_no THEN
      UPDATE public.user_capsules
         SET required = v_next.required, chapter_no = v_next.chapter_no, updated_at = now()
       WHERE user_id = p_user_id
       RETURNING * INTO v_cap;
    END IF;
  END IF;

  SELECT COALESCE(w.balance, 0) INTO v_balance FROM public.jam_wallets w WHERE w.user_id = p_user_id;
  v_balance := COALESCE(v_balance, 0);

  v_remaining := v_cap.required - v_cap.filled;
  IF v_remaining > 0 AND v_balance > 0 THEN
    v_amount := LEAST(v_remaining::BIGINT, v_balance)::INTEGER;
    PERFORM public.jam_apply(p_user_id, -v_amount, 'capsule_fill');
    UPDATE public.user_capsules
       SET filled = filled + v_amount, updated_at = now()
     WHERE user_id = p_user_id
     RETURNING * INTO v_cap;
    v_balance := v_balance - v_amount;

    -- 이번 호출로 filled가 required에 처음 닿았다(v_amount > 0이면 호출 전에는 가득이 아니었다): 챕터 횟수 +1과 오름 판정.
    -- 퀘스트 전 캡슐(chapter_no NULL)이거나 유저에 챕터가 없으면 세지 않는다(B5).
    IF v_cap.filled >= v_cap.required AND v_cap.chapter_no IS NOT NULL THEN
      SELECT uc.chapter_no, uc.capsule_full_count INTO v_chapter, v_count
        FROM public.user_chapters uc WHERE uc.user_id = p_user_id FOR UPDATE;
      IF FOUND AND v_chapter IS NOT NULL THEN
        v_count := v_count + 1;

        SELECT c.advance_count INTO v_advance FROM public.capsule_chapter_costs c WHERE c.chapter_no = v_chapter;
        IF v_advance IS NOT NULL AND v_count >= v_advance THEN
          SELECT d.chapter_no INTO v_next_chapter
            FROM public.chapter_definitions d
           WHERE d.chapter_no > v_chapter
           ORDER BY d.chapter_no
           LIMIT 1;
          IF v_next_chapter IS NOT NULL THEN
            INSERT INTO public.chapter_ups (user_id, chapter_no) VALUES (p_user_id, v_next_chapter)
              ON CONFLICT (user_id, chapter_no) DO NOTHING;
            v_reached := ARRAY[v_next_chapter];
            v_chapter := v_next_chapter;
            v_count := 0;
          END IF;
        END IF;

        UPDATE public.user_chapters
           SET chapter_no = v_chapter, capsule_full_count = v_count, updated_at = now()
         WHERE user_id = p_user_id;
      END IF;
    END IF;
  END IF;

  SELECT uc.capsule_full_count INTO v_chapter_count FROM public.user_chapters uc WHERE uc.user_id = p_user_id;

  -- forfeited·pendingCount·alertStage는 옛 호출부가 이름으로 읽으므로 키를 남기고 값만 고정한다(키 제거는 T6).
  RETURN jsonb_build_object(
    'ok', TRUE,
    'applied', v_amount,
    'required', v_cap.required,
    'filled', v_cap.filled,
    'full', v_cap.filled >= v_cap.required,
    'balance', v_balance,
    'chapterNo', v_cap.chapter_no,
    'forfeited', 0,
    'pendingCount', 0,
    'alertStage', NULL,
    'reachedChapters', to_jsonb(v_reached),
    'chapterCount', v_chapter_count
  );
END;
$$;

COMMENT ON FUNCTION public.capsule_auto_fill(UUID) IS
  '지갑 잼으로 지금 캡슐 하나를 채운다. 채움이 required에 처음 닿는 호출에서 챕터 횟수 +1과 오름 판정(reachedChapters). 보류·소멸·알림 단계는 더는 없다(forfeited=0, pendingCount=0, alertStage=null은 옛 호출부를 위한 고정값). 정지 중이면 user_suspended. service_role 전용.';

-- 3. capsule_open — 234 (빈칸 검사 «최대 개수»)
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

COMMENT ON FUNCTION public.capsule_open(UUID, JSONB) IS
  '캡슐 열기 확정. 정해진 결과(p_items)를 한 트랜잭션으로 지급·기록하고 보정 카운터를 갱신하고 다음 캡슐을 만든다. 빈칸이 최대 개수보다 적거나 가득 차지 않았거나 이용 정지 중이면 거절. service_role 전용.';

-- 4. 새 함수와 새 열을 지운다
DROP FUNCTION IF EXISTS public.capsule_hold_rolled(UUID, JSONB);
ALTER TABLE public.capsule_pending_rewards DROP COLUMN IF EXISTS drawn_items;
