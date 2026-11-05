-- 324_capsule_claim_pending_stored_items.sql
-- 대기 보상(capsule_pending_rewards)을 «저장된 추첨 결과»로 지급하고 빈칸 검사를 «지급할 개수»로 낮추도록 capsule_claim_pending을 바꾼다 (티켓 20261105_1438 R2, 상위 20261105_0100, 사용자 결정 Q10)
--
-- 이 파일은 «같은 시그니처 교체» 하나다(db-migration-rules.md 3절). 인자 타입(uuid, uuid, jsonb)·반환 타입(JSONB)이 같아 DROP이 필요 없다. 새 열·새 함수는 없다.
--   - 바뀌는 것: capsule_claim_pending(uuid, uuid, jsonb)(302 7절)
--       ① 보류 줄의 drawn_items(323)가 1개 이상의 배열이면 그것을 지급 항목으로 쓴다(p_items는 무시). NULL이거나 빈 배열인 옛 줄은 p_items를 쓴다.
--       ② 빈칸 검사를 «최대 개수(guaranteed_count + bonus_count)»에서 «지급할 항목 수(v_n)»로 낮춘다.
--       ③ p_items 검사(배열·최대 개수 이하, 아니면 invalid_items)는 옛 줄 갈래에서만, 보류 줄을 읽은 뒤에 한다. 저장된 항목 갈래는 p_items를 보지 않는다.
--   - 같은 것(302와 같다): 정지 확인 → 캡슐 행 잠금 → 보류 줄 잠금 → 인벤토리 행 잠금, 지급(grant_inventory_item_locked), item_issue_log·user_drop_state·capsule_opens 기록, 보류 줄 삭제, 반환 모양.
--   - 건드리지 않는 것: capsule_hold_rolled·capsule_receive_blocked·capsule_auto_fill·capsule_open(323), 표 capsule_pending_rewards, 권한(CREATE OR REPLACE가 유지하며 아래에서 한 번 더 명시한다).
--
-- 확인한 사실(302·323 정의를 읽었다)
--   - 302의 capsule_claim_pending은 p_items 길이를 최대 개수와 비교하고, 빈칸이 «최대 개수»보다 적으면 insufficient_slots로 거절한다.
--     323 이후 보류는 먼저 뽑은 결과(drawn_items)를 들고 있고 개수가 1~2개라, 그대로 두면 빈칸이 1개인 유저가 1개짜리 보류를 받지 못한다.
--   - 같은 보류를 두 요청이 동시에 지급하려 하면 둘 다 캡슐 행을 먼저 잠그므로 직렬화된다(302와 같은 잠금 순서). 뒤 요청은 보류 줄이 이미 지워져 pending_not_found를 받는다. 이중 지급이 없다.
--   - 옛 줄(drawn_items NULL)은 현재 0건이다(323 적용 전 확인). 그래도 옛 줄 경로(p_items·최대 개수 상한)는 남긴다. 옛 줄의 빈칸 검사는 p_items 길이(= 최대 이하)를 쓴다 —
--     TS는 옛 줄에 최대 개수만큼 비어 있기를 미리 요구하므로(claim.ts) 조이지 않고 완화일 뿐이다.
--
-- 🚨 적용 순서: 이 DDL 먼저 → 새 코드 배포. 이 파일만 적용해도 옛 코드는 동작한다(옛 코드는 p_items를 넘기고, 저장된 항목이 있어도 TS가 같은 길이를 넘기므로 충돌이 없다.
--    단 옛 TS는 추첨을 다시 해 p_items를 만들지만 DB는 저장된 항목을 쓰므로 화면에 보이는 개체와 지급된 개체가 달라질 수 있다 — 보류가 생기는 것은 323 이후이므로 새 코드를 같은 배포로 낸다).
--
-- 적용 전 확인(읽기 전용 SELECT)
--   SELECT count(*) FROM public.capsule_pending_rewards;                                                                              -- 현재 건수(0 기대)
--   SELECT pg_get_functiondef('public.capsule_claim_pending(uuid, uuid, jsonb)'::regprocedure) LIKE '%v_free < v_max_items%';        -- true (302 정의)
-- 적용 후 확인(읽기 전용 SELECT)
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'capsule_claim_pending';                                                   -- 1행, true (오버로드가 생기지 않았다)
--   SELECT pg_get_functiondef('public.capsule_claim_pending(uuid, uuid, jsonb)'::regprocedure) LIKE '%v_free < v_n%';                -- true
--   SELECT has_function_privilege('authenticated', 'public.capsule_claim_pending(uuid, uuid, jsonb)', 'EXECUTE');                     -- false
--   SELECT has_function_privilege('service_role', 'public.capsule_claim_pending(uuid, uuid, jsonb)', 'EXECUTE');                      -- true
-- 롤백 실측(DO 블록 + RAISE EXCEPTION, 시험 계정)
--   a) 저장된 항목(1개) + 빈칸 1: capsule_claim_pending(p_items = '[]') → ok, items 1개, 보류 줄 0건, item_issue_log·capsule_opens 각 1건
--   b) 저장된 항목(2개) + 빈칸 1 → insufficient_slots(free 1, needed 2), 보류 줄 그대로, 인벤토리 불변
--   c) 같은 보류를 두 번 연속 호출 → 두 번째는 pending_not_found, 인벤토리 증가는 한 번뿐
--   d) 이용 정지 유저 → user_suspended, 보류 줄 그대로
--   e) 옛 줄(drawn_items NULL) + p_items 1개 + 빈칸 1 → ok / p_items가 배열이 아니면 invalid_items
--   f) 되돌림 파일 적용 뒤 함수 본문 해시가 적용 전(302)과 같은지 대조
-- 되돌림: 같은 번호의 324_capsule_claim_pending_stored_items_down.sql

-- ----------------------------------------------------------------
-- capsule_claim_pending 교체 — 저장된 항목으로 지급, 빈칸 ≥ 지급할 개수이면 지급
-- ----------------------------------------------------------------
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

  -- 캡슐 행을 먼저 잠근다: 보류를 만들거나(hold) 소멸시키는(auto_fill) 호출, 같은 보류를 받는 다른 호출과 직렬화한다. 캡슐 자체는 바꾸지 않는다.
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

  -- 지급 항목: 보류 줄에 저장된 추첨 결과(drawn_items)가 있으면 그것을 쓰고 p_items는 무시한다. 없는(옛) 줄은 p_items를 쓴다.
  IF v_pending.drawn_items IS NOT NULL
     AND jsonb_typeof(v_pending.drawn_items) = 'array'
     AND jsonb_array_length(v_pending.drawn_items) > 0 THEN
    v_items := v_pending.drawn_items;
    v_n := jsonb_array_length(v_items);
  ELSE
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_items');
    END IF;
    v_items := p_items;
    v_n := jsonb_array_length(v_items);
    IF v_n > v_max_items THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_items', 'max', v_max_items);
    END IF;
  END IF;

  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;
  v_free := GREATEST(0, v_inv.max_slots - v_inv.used_slots);
  IF v_free < v_n THEN
    -- 아무것도 바꾸지 않는다. 보류는 그대로 남는다.
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
  '대기 보상 한 줄을 받는다: 정지 확인, 캡슐·보류·인벤토리 잠금. 보류 줄에 저장된 추첨 결과(drawn_items)가 있으면 그것으로 지급하고 p_items는 무시, 없는 옛 줄은 p_items로 지급(최대 개수 이하 아니면 invalid_items). 빈칸이 지급할 개수보다 적으면 아무것도 바꾸지 않고 insufficient_slots(free, needed). 충분하면 capsule_open과 같은 방식으로 지급·기록하고 그 보류 줄을 지운다. 같은 보류를 동시에 받으면 캡슐 행 잠금이 직렬화해 뒤 호출은 pending_not_found. 반환의 pendingCount는 남은 보류 수. service_role 전용.';

-- 실행 권한 — service_role만 (CREATE OR REPLACE가 유지하지만 명시한다)
REVOKE ALL ON FUNCTION public.capsule_claim_pending(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capsule_claim_pending(UUID, UUID, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capsule_claim_pending(UUID, UUID, JSONB) TO service_role;
