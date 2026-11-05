-- 323_capsule_pending_drawn_items.sql
-- 빈칸이 모자라면 먼저 추첨해 결과를 대기 보상(capsule_pending_rewards)으로 저장하고 멈추도록 DB를 바꾼다 (티켓 20261105_1437 R1, 상위 20261105_0100, 사용자 결정 Q10)
--
-- 이 파일은 «확장 + 같은 시그니처 교체»다(db-migration-rules.md 1·3절). 옛 모양은 그대로 동작한다.
--   - 덧붙이는 것: capsule_pending_rewards.drawn_items(NULL 허용), 새 함수 capsule_hold_rolled(uuid, jsonb)
--   - 같은 시그니처로 교체하는 것: capsule_receive_blocked(uuid)(320), capsule_auto_fill(uuid)(322), capsule_open(uuid, jsonb)(234). 시그니처·반환 타입(JSONB)이 같아 DROP이 필요 없다.
--   - 건드리지 않는 것: capsule_hold_reward(302, 시그니처 그대로), capsule_claim_pending(302, 받기 쪽은 R2가 바꾼다), capsule_open_counted(302, capsule_open을 부를 뿐이다),
--     원장 사유 capsule_forfeit·뷰 jam_forfeit_weekly·user_capsules.alert_stage(T6 축소 몫). 소멸(잼 전액)과 단계 올림은 되살리지 않는다.
--
-- 확인한 사실(233·234·302 정의를 읽었다)
--   - capsule_open(234)은 빈칸을 «나올 수 있는 최대 개수»(guaranteed_count + bonus_count)로 본다(v_free < v_max_items → insufficient_slots).
--     그대로 두면 1개만 뽑혔고 빈칸이 1개인 유저도 열리지 않는다. 그래서 이번에 «뽑힌 개수»(jsonb_array_length(p_items))로 낮춰 교체한다.
--     최대 개수 상한 검사(invalid_items)는 그대로다. 옛 코드가 최대 개수만큼 비어 있을 때만 열던 것은 뽑힌 개수가 최대 이하라 여전히 열린다(완화일 뿐 조이지 않는다).
--   - capsule_hold_reward(302)는 가득 찬 캡슐을 보류 표로 옮기고 새 캡슐(v2, filled 0, alert_stage 0)을 만든다. 추첨 결과는 담지 않는다. 챕터 횟수는 세지 않는다
--     (횟수는 capsule_auto_fill이 100%에 닿는 시점에 센다). capsule_open도 횟수를 세지 않으므로 새 함수도 같다.
--   - 열기 기록(capsule_opens)·발급 기록(item_issue_log)·보정 카운터(user_drop_state)는 «지급하는 시점»에 남는다(capsule_open·capsule_claim_pending). 보류를 만드는 시점에는 남기지 않는다.
--
-- 함수
--   capsule_hold_rolled(p_user_id uuid, p_items jsonb) -> jsonb  (새 함수)
--     정지 확인 → 항목 검사(배열이고 1개 이상 최대 개수 이하, 아니면 invalid_items) → 캡슐 행 잠금 → 가득 아니면 not_full → 보류가 이미 있으면 pending_exists
--     (대기는 한 캡슐분만) → 보류 줄 1건(slot 1, chapter_no, fill_amount=required, reached_at=now(), drawn_items=p_items) → 새 캡슐(v2, filled 0, alert_stage 0).
--     반환 {ok, pendingItemCount, next{required, filled, chapterNo}}. 지갑은 건드리지 않는다. 인벤토리 행은 읽지도 잠그지도 않는다.
--   capsule_receive_blocked(uuid) -> jsonb  (320에서 교체)
--     {blocked, pending, free, needed, shortfall}. blocked = 이 유저의 보류 줄이 1건 이상. pending = needed = 보류의 drawn_items 길이 합
--     (drawn_items가 NULL인 옛 줄은 guaranteed_count + bonus_count). shortfall = max(0, needed - free). free = max(0, max_slots - used_slots).
--     정책·캡슐·인벤토리 행이 없으면 막지 않는다(blocked=false, 못 읽은 값은 0). 읽기 전용(STABLE).
--   capsule_auto_fill(uuid) -> jsonb  (322에서 교체)
--     보류가 1건 이상이면 지갑을 건드리지 않고 채우지 않는다: {ok, applied 0, required, filled, full, balance, chapterNo, forfeited 0, pendingCount N, alertStage null,
--     reachedChapters [], chapterCount}. 서버 코드가 pendingCount > 0이면 inventory_blocked로 멈춘다. 보류가 없으면 322와 같고 pendingCount는 0이다.
--   capsule_open(uuid, jsonb) -> jsonb  (234에서 교체)
--     빈칸 검사만 «최대 개수 → 뽑힌 개수»로 바뀐다. 나머지(검사 순서·잠금 순서·지급·기록·다음 캡슐)는 234와 같다.
--
-- 규칙 해석
--   - 잠금 순서는 캡슐 행 → (보류 줄) → 인벤토리 행이다. capsule_hold_rolled는 캡슐 행만 잠그고 보류를 만든다(capsule_hold_reward와 같다).
--   - 보류 줄은 UNIQUE(user_id, slot)이고 대기는 한 캡슐분만 쌓이므로 slot은 항상 1이다. 옛 보류(slot 2까지)가 남아 있으면 pending_exists로 거절한다.
--   - 옛 보류 줄(drawn_items NULL)은 현재 0건이다(322 적용 전 확인). 있어도 최대 개수로 다뤄 안전한 쪽(더 많이 비우도록)으로 기운다.
--
-- 🚨 적용 순서: 이 DDL 먼저 → 새 코드 배포. 새 코드가 capsule_hold_rolled와 새 capsule_receive_blocked 반환 키(pending·shortfall)를 쓴다.
--    이 파일만 적용해도 옛 코드는 동작한다(capsule_open은 완화, 새 키는 덧붙임). 단 옛 auto-fill.ts는 pendingCount를 읽지 않으므로 보류가 생기지 않는 동안만 안전하다.
--
-- 적용 전 확인(읽기 전용 SELECT)
--   SELECT count(*) FROM public.capsule_pending_rewards;                                                                  -- 0
--   SELECT proname FROM pg_proc WHERE proname = 'capsule_hold_rolled';                                                    -- 0행
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'capsule_pending_rewards' AND column_name = 'drawn_items';             -- 0행
-- 적용 후 확인(읽기 전용 SELECT)
--   SELECT column_name, is_nullable, data_type FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'capsule_pending_rewards' AND column_name = 'drawn_items';             -- 1행, YES, jsonb
--   SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('capsule_hold_rolled','capsule_receive_blocked','capsule_auto_fill','capsule_open'); -- 4행, 모두 true
--   SELECT has_function_privilege('authenticated', 'public.capsule_hold_rolled(uuid, jsonb)', 'EXECUTE');                  -- false
--   SELECT has_function_privilege('service_role', 'public.capsule_hold_rolled(uuid, jsonb)', 'EXECUTE');                   -- true
--   SELECT pg_get_functiondef('public.capsule_open(uuid, jsonb)'::regprocedure) LIKE '%v_free < v_n%';                    -- true
--   SELECT public.capsule_receive_blocked('<유저 id>');                                                                   -- {blocked, pending, free, needed, shortfall}
-- 롤백 실측(DO 블록 + RAISE EXCEPTION, 시험 계정)
--   a) 빈칸 충분: capsule_open_counted가 그대로 지급, 보류 줄 없음
--   b) 빈칸 부족(가득 캡슐, 뽑힌 1개/2개, 빈칸 0): capsule_hold_rolled → 보류 1줄(drawn_items 길이 1/2), 캡슐 filled 0·새 필요량, 지갑 잔액·원장 불변, jam_forfeit 줄 0
--   c) 보류가 있을 때 capsule_hold_rolled → pending_exists / capsule_auto_fill → applied 0·pendingCount 1·지갑 불변
--   d) capsule_receive_blocked: 보류 없음 → blocked=false / 보류 있음 → blocked=true, pending=drawn_items 길이, shortfall=max(0,pending-free)
--   e) 빈칸 1 + 뽑힌 1개 capsule_open_counted → 지급됨(최대 개수 2 기준이었다면 거절됐을 경우)
--   f) 되돌림 파일 적용 뒤 네 함수의 본문 해시가 적용 전과 같은지 대조
-- 되돌림: 같은 번호의 323_capsule_pending_drawn_items_down.sql

-- ----------------------------------------------------------------
-- 1. capsule_pending_rewards.drawn_items — 먼저 뽑은 결과 (toRpcItems 모양: badge_id·rarity·rolled_rarity·locked·lock_reason·unlock_required)
-- ----------------------------------------------------------------
ALTER TABLE public.capsule_pending_rewards
  ADD COLUMN IF NOT EXISTS drawn_items JSONB;

COMMENT ON COLUMN public.capsule_pending_rewards.drawn_items IS
  '빈칸이 모자라 보류될 때 먼저 뽑아 둔 결과(배열, 항목마다 badge_id·rarity·rolled_rarity·locked·lock_reason·unlock_required). NULL은 옛 보류로, 받을 때 추첨하고 최대 개수만큼의 빈칸이 필요하다.';

-- ----------------------------------------------------------------
-- 2. capsule_hold_rolled — 뽑은 결과를 보류 줄에 저장하고 새 캡슐을 만든다
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capsule_hold_rolled(p_user_id UUID, p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy RECORD;
  v_cap public.user_capsules;
  v_max_items INTEGER;
  v_n INTEGER;
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
  IF v_n < 1 OR v_n > v_max_items THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_items', 'max', v_max_items);
  END IF;

  -- 잠금은 capsule_hold_reward와 같다: 캡슐 행 잠금. 보류를 만드는 모든 경로가 이 행으로 직렬화된다.
  PERFORM public.capsule_get_or_create(p_user_id);
  SELECT * INTO v_cap FROM public.user_capsules WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'capsule_changed');
  END IF;
  IF v_cap.filled < v_cap.required THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_full', 'required', v_cap.required, 'filled', v_cap.filled);
  END IF;

  -- 대기는 한 캡슐분만 쌓인다.
  IF EXISTS (SELECT 1 FROM public.capsule_pending_rewards WHERE user_id = p_user_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'pending_exists');
  END IF;

  INSERT INTO public.capsule_pending_rewards (user_id, slot, chapter_no, fill_amount, reached_at, drawn_items)
    VALUES (p_user_id, 1, v_cap.chapter_no, v_cap.required, now(), p_items);

  -- 새 캡슐: 같은 행을 초기화한다(capsule_hold_reward와 같다). 필요량·챕터는 v2, 알림 단계 0.
  SELECT * INTO v_next FROM public.capsule_next_required_v2(p_user_id);
  UPDATE public.user_capsules
     SET required = v_next.required, filled = 0, chapter_no = v_next.chapter_no, alert_stage = 0,
         created_at = now(), updated_at = now()
   WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'pendingItemCount', v_n,
    'next', jsonb_build_object('required', v_next.required, 'filled', 0, 'chapterNo', v_next.chapter_no)
  );
END;
$$;

COMMENT ON FUNCTION public.capsule_hold_rolled(UUID, JSONB) IS
  '빈칸이 모자라 열 수 없는 가득 찬 캡슐을, 먼저 뽑은 결과(p_items)와 함께 capsule_pending_rewards에 저장하고 새 캡슐(v2, alert_stage 0)을 만든다. 가득 아니면 not_full, 보류가 이미 있으면 pending_exists(대기는 한 캡슐분만), 항목이 배열이 아니거나 0개·최대 개수 초과면 invalid_items. 지갑은 건드리지 않는다. service_role 전용.';

REVOKE ALL ON FUNCTION public.capsule_hold_rolled(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capsule_hold_rolled(UUID, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capsule_hold_rolled(UUID, JSONB) TO service_role;

-- ----------------------------------------------------------------
-- 3. capsule_receive_blocked 교체 — 막힘 = 대기 보상이 있음 (320의 «가득 && 빈칸 < 최대 개수»를 대체)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capsule_receive_blocked(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max INTEGER;
  v_rows INTEGER;
  v_pending INTEGER;
  v_free INTEGER;
  v_cap_found BOOLEAN;
  v_inv_found BOOLEAN;
  v_policy_found BOOLEAN;
BEGIN
  SELECT guaranteed_count + bonus_count INTO v_max FROM public.capsule_policy WHERE id = 1;
  v_policy_found := FOUND;

  -- 대기 개수: 먼저 뽑은 결과의 길이 합. drawn_items가 없는(NULL) 옛 줄은 최대 개수로 센다.
  SELECT COUNT(*)::INTEGER,
         COALESCE(SUM(CASE WHEN jsonb_typeof(drawn_items) = 'array' THEN jsonb_array_length(drawn_items) ELSE COALESCE(v_max, 0) END), 0)::INTEGER
    INTO v_rows, v_pending
    FROM public.capsule_pending_rewards WHERE user_id = p_user_id;

  PERFORM 1 FROM public.user_capsules WHERE user_id = p_user_id;
  v_cap_found := FOUND;

  SELECT GREATEST(0, max_slots - used_slots) INTO v_free FROM public.inventory WHERE user_id = p_user_id;
  v_inv_found := FOUND;

  RETURN jsonb_build_object(
    'blocked', (v_policy_found AND v_cap_found AND v_inv_found AND v_rows > 0),
    'pending', v_pending,
    'free', COALESCE(v_free, 0),
    'needed', v_pending,
    'shortfall', GREATEST(0, v_pending - COALESCE(v_free, 0))
  );
END;
$$;

COMMENT ON FUNCTION public.capsule_receive_blocked(UUID) IS
  '대기 보상(capsule_pending_rewards)이 있으면 blocked=true. {blocked, pending(대기 개수), free(빈칸), needed(= pending), shortfall(max(0, pending - free))}를 돌려준다. 캡슐·인벤토리·정책 행이 없으면 막지 않는다. 읽기 전용. service_role 전용.';

-- ----------------------------------------------------------------
-- 4. capsule_auto_fill 교체 — 대기 보상이 있으면 채우지 않는다 (322 본문 + 보류 확인)
-- ----------------------------------------------------------------
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
  v_pending INTEGER;
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

  SELECT COALESCE(w.balance, 0) INTO v_balance FROM public.jam_wallets w WHERE w.user_id = p_user_id;
  v_balance := COALESCE(v_balance, 0);

  -- 대기 보상이 있으면 채우지 않는다: 지갑 잔액·캡슐·챕터 횟수를 바꾸지 않고 pendingCount만 알린다(서버 코드가 inventory_blocked로 멈춘다).
  SELECT COUNT(*)::INTEGER INTO v_pending FROM public.capsule_pending_rewards WHERE user_id = p_user_id;
  IF v_pending > 0 THEN
    SELECT uc.capsule_full_count INTO v_chapter_count FROM public.user_chapters uc WHERE uc.user_id = p_user_id;
    RETURN jsonb_build_object(
      'ok', TRUE,
      'applied', 0,
      'required', v_cap.required,
      'filled', v_cap.filled,
      'full', v_cap.filled >= v_cap.required,
      'balance', v_balance,
      'chapterNo', v_cap.chapter_no,
      'forfeited', 0,
      'pendingCount', v_pending,
      'alertStage', NULL,
      'reachedChapters', '[]'::jsonb,
      'chapterCount', v_chapter_count
    );
  END IF;

  -- 아직 채우지 않은 캡슐은 필요량·챕터를 v2 기준으로 맞춘다(옛 함수가 만든 캡슐 포함). 301·302·322와 같다.
  IF v_cap.filled = 0 THEN
    SELECT * INTO v_next FROM public.capsule_next_required_v2(p_user_id);
    IF v_cap.required IS DISTINCT FROM v_next.required OR v_cap.chapter_no IS DISTINCT FROM v_next.chapter_no THEN
      UPDATE public.user_capsules
         SET required = v_next.required, chapter_no = v_next.chapter_no, updated_at = now()
       WHERE user_id = p_user_id
       RETURNING * INTO v_cap;
    END IF;
  END IF;

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

  -- forfeited·alertStage는 옛 호출부가 이름으로 읽으므로 키를 남기고 값만 고정한다(키 제거는 T6). pendingCount는 보류가 없는 이 갈래에서 0이다.
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
  '지갑 잼으로 지금 캡슐 하나를 채운다. 대기 보상(capsule_pending_rewards)이 있으면 채우지 않고 지갑·캡슐을 그대로 둔 채 pendingCount만 돌려준다. 없으면 채움이 required에 처음 닿는 호출에서 챕터 횟수 +1과 오름 판정(reachedChapters). 소멸·알림 단계는 없다(forfeited=0, alertStage=null은 옛 호출부를 위한 고정값). 정지 중이면 user_suspended. service_role 전용.';

-- ----------------------------------------------------------------
-- 5. capsule_open 교체 — 빈칸 검사를 «최대 개수»에서 «뽑힌 개수»로 낮춘다 (234 본문, 바뀐 곳은 v_free < v_n 한 곳)
--    최대 개수 상한 검사(invalid_items)는 그대로다. 빈칸이 뽑힌 개수 이상이면 지급한다.
-- ----------------------------------------------------------------
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
  IF v_free < v_n THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'insufficient_slots', 'free', v_free, 'needed', v_n);
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
  '캡슐 열기 확정. 정해진 결과(p_items)를 한 트랜잭션으로 지급·기록하고 보정 카운터를 갱신하고 다음 캡슐을 만든다. 빈칸이 뽑힌 개수(p_items 길이)보다 적거나 가득 차지 않았거나 이용 정지 중이면 거절. service_role 전용.';
