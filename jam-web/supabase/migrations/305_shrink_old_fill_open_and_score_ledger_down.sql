-- 305_shrink_old_fill_open_and_score_ledger_down.sql
-- 305의 되돌림: 지운 함수·표를 지우기 직전 상태(2026-10-31 라이브 DB의 pg_get_functiondef·표 정의)로 다시 만든다 (티켓 20261028_1742 3회)
--
-- 순서: 표(규칙 → 기록)와 12행 → 옛 함수 → capsule_get_or_create를 옛 v1 호출로 되돌림 → 권한.
-- 되돌린 뒤 chapter_score_events는 비어 있다(지우기 전에도 0건이었다). 되돌림 정확도는 305 적용 전 드라이런에서 md5 대조로 실측한다.

-- 1) 표 chapter_score_rules(12행)
CREATE TABLE public.chapter_score_rules (
  activity_kind text NOT NULL,
  points_per_unit numeric(10,2) NOT NULL,
  weekly_cap integer,
  over_cap_ratio numeric(4,3) NOT NULL DEFAULT 0.5,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chapter_score_rules_pkey PRIMARY KEY (activity_kind),
  CONSTRAINT chapter_score_rules_over_cap_ratio_check CHECK (((over_cap_ratio >= (0)::numeric) AND (over_cap_ratio <= (1)::numeric))),
  CONSTRAINT chapter_score_rules_points_per_unit_check CHECK ((points_per_unit >= (0)::numeric)),
  CONSTRAINT chapter_score_rules_weekly_cap_check CHECK (((weekly_cap IS NULL) OR (weekly_cap >= 0)))
);
ALTER TABLE public.chapter_score_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chapter_score_rules FROM anon, authenticated;
COMMENT ON TABLE public.chapter_score_rules IS '활동별 점수 규칙. points_per_unit=단위당 점수, weekly_cap=주간 상한(NULL=없음), over_cap_ratio=상한 초과분을 세는 비율. 서버(service role)만 읽는다.';

INSERT INTO public.chapter_score_rules (activity_kind, points_per_unit, weekly_cap, over_cap_ratio, updated_at) VALUES
  ('jam_earned', 1, 300, 0.5, '2026-10-17T01:44:13.887273+00:00'),
  ('capsule_open', 20, NULL, 0.5, '2026-10-17T01:44:13.887273+00:00'),
  ('locked_item_badge_open', 10, NULL, 0.5, '2026-10-17T01:44:13.887273+00:00'),
  ('badge_receive', 10, NULL, 0.5, '2026-10-17T01:44:13.887273+00:00'),
  ('collection_complete_common', 100, NULL, 0.5, '2026-10-17T01:44:13.887273+00:00'),
  ('collection_complete_rare', 200, NULL, 0.5, '2026-10-17T01:44:13.887273+00:00'),
  ('collection_complete_epic', 400, NULL, 0.5, '2026-10-17T01:44:13.887273+00:00'),
  ('collection_complete_mystic', 800, NULL, 0.5, '2026-10-17T01:44:13.887273+00:00'),
  ('mix_success', 20, NULL, 0.5, '2026-10-17T01:44:13.887273+00:00'),
  ('mission_complete', 50, NULL, 0.5, '2026-10-17T01:44:13.887273+00:00'),
  ('drop', 5, NULL, 0.5, '2026-10-17T01:44:13.887273+00:00'),
  ('pickup', 5, NULL, 0.5, '2026-10-17T01:44:13.887273+00:00');

-- 2) 표 chapter_score_events(0행)
CREATE TABLE public.chapter_score_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activity_kind text NOT NULL,
  source_id uuid NOT NULL,
  occurred_on date NOT NULL,
  unit_amount integer NOT NULL,
  raw_score integer NOT NULL,
  counted_score integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chapter_score_events_pkey PRIMARY KEY (id),
  CONSTRAINT chapter_score_events_kind_source_uniq UNIQUE (activity_kind, source_id),
  CONSTRAINT chapter_score_events_activity_kind_fkey FOREIGN KEY (activity_kind) REFERENCES public.chapter_score_rules(activity_kind),
  CONSTRAINT chapter_score_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT chapter_score_events_check CHECK (((counted_score >= 0) AND (counted_score <= raw_score))),
  CONSTRAINT chapter_score_events_raw_score_check CHECK ((raw_score >= 0)),
  CONSTRAINT chapter_score_events_unit_amount_check CHECK ((unit_amount > 0))
);
CREATE INDEX chapter_score_events_user_kind_day_idx ON public.chapter_score_events USING btree (user_id, activity_kind, occurred_on);
ALTER TABLE public.chapter_score_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY chapter_score_events_select_own ON public.chapter_score_events FOR SELECT USING ((auth.uid() = user_id));
-- 새 표에는 Supabase 기본 권한(전체)이 붙으므로, 지우기 전 상태(읽기·참조·트리거·유지보수만)로 줄인다
REVOKE ALL ON public.chapter_score_events FROM anon, authenticated;
GRANT SELECT, REFERENCES, TRIGGER, MAINTAIN ON public.chapter_score_events TO anon, authenticated;
COMMENT ON TABLE public.chapter_score_events IS '점수 기록(append-only). raw_score=상한 적용 전, counted_score=실제로 센 점수. (activity_kind, source_id)당 한 줄.';

-- 3) 옛 함수
CREATE OR REPLACE FUNCTION public.capsule_next_required(p_user_id uuid, OUT required integer, OUT chapter_no integer)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.capsule_get_or_create(p_user_id uuid)
 RETURNS user_capsules
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.jam_fill_decide(p_remaining integer, p_balance bigint, p_amount integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_remaining IS NULL OR p_remaining <= 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_full');
  END IF;
  IF p_amount IS NOT NULL AND p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_amount');
  END IF;
  IF p_amount IS NOT NULL AND p_amount > p_remaining THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'exceeds_remaining', 'remaining', p_remaining);
  END IF;
  IF COALESCE(p_balance, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'insufficient_jam', 'balance', 0);
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'amount', LEAST(COALESCE(p_amount, p_remaining), p_balance)::INTEGER);
END;
$function$;

CREATE OR REPLACE FUNCTION public.capsule_fill(p_user_id uuid, p_amount integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.capsule_open(p_user_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.locked_item_fill(p_user_id uuid, p_item_id uuid, p_amount integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_balance BIGINT;
  v_decide JSONB;
  v_amount INTEGER;
  v_filled INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  SELECT ii.id, ii.badge_id, ii.serial_number, ii.locked, ii.unlock_required, ii.unlock_filled
    INTO v_item
    FROM public.inventory_items ii
    JOIN public.inventory inv ON inv.id = ii.inventory_id
   WHERE ii.id = p_item_id AND inv.user_id = p_user_id
     AND ii.destroyed_at IS NULL AND ii.dropped_at IS NULL
   FOR UPDATE OF ii;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;
  IF NOT v_item.locked THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_locked');
  END IF;

  SELECT COALESCE(balance, 0) INTO v_balance FROM public.jam_wallets WHERE user_id = p_user_id;
  v_balance := COALESCE(v_balance, 0);

  v_decide := public.jam_fill_decide(v_item.unlock_required - v_item.unlock_filled, v_balance, p_amount);
  IF NOT COALESCE((v_decide->>'ok')::BOOLEAN, FALSE) THEN
    IF v_decide->>'error' = 'already_full' THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'already_full',
        'required', v_item.unlock_required, 'filled', v_item.unlock_filled);
    END IF;
    RETURN v_decide;
  END IF;
  v_amount := (v_decide->>'amount')::INTEGER;

  PERFORM public.jam_apply(p_user_id, -v_amount, 'locked_item_badge_fill');
  UPDATE public.inventory_items SET unlock_filled = unlock_filled + v_amount
   WHERE id = p_item_id
   RETURNING unlock_filled INTO v_filled;

  INSERT INTO public.inventory_item_events (inventory_item_id, badge_id, serial_number, user_id, event_type, amount, filled_after)
    VALUES (p_item_id, v_item.badge_id, v_item.serial_number, p_user_id, 'filled', v_amount, v_filled);

  SELECT COALESCE(balance, 0) INTO v_balance FROM public.jam_wallets WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'applied', v_amount,
    'required', v_item.unlock_required,
    'filled', v_filled,
    'remaining', v_item.unlock_required - v_filled,
    'balance', COALESCE(v_balance, 0)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.locked_item_open(p_user_id uuid, p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_points INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  SELECT ii.id, ii.badge_id, ii.serial_number, ii.locked, ii.unlock_required, ii.unlock_filled,
         ii.point_awarded_at, COALESCE(b.point_reward, 0) AS point_reward
    INTO v_item
    FROM public.inventory_items ii
    JOIN public.inventory inv ON inv.id = ii.inventory_id
    JOIN public.badges b ON b.id = ii.badge_id
   WHERE ii.id = p_item_id AND inv.user_id = p_user_id
     AND ii.destroyed_at IS NULL AND ii.dropped_at IS NULL
   FOR UPDATE OF ii;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;
  IF NOT v_item.locked THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_locked');
  END IF;
  IF v_item.unlock_filled < v_item.unlock_required THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_full',
      'required', v_item.unlock_required, 'filled', v_item.unlock_filled);
  END IF;

  UPDATE public.inventory_items SET locked = FALSE, unlocked_at = now() WHERE id = p_item_id;

  IF v_item.point_reward > 0 AND v_item.point_awarded_at IS NULL THEN
    PERFORM public.award_points(p_user_id, v_item.point_reward, 'badge_point_reward', v_item.badge_id);
    UPDATE public.inventory_items SET point_awarded_at = now() WHERE id = p_item_id;
    v_points := v_item.point_reward;
  END IF;

  INSERT INTO public.inventory_item_events (inventory_item_id, badge_id, serial_number, user_id, event_type, points_awarded)
    VALUES (p_item_id, v_item.badge_id, v_item.serial_number, p_user_id, 'unlocked', NULLIF(v_points, 0));

  RETURN jsonb_build_object(
    'ok', TRUE,
    'itemId', p_item_id,
    'badgeId', v_item.badge_id,
    'serialNumber', v_item.serial_number,
    'pointsAwarded', v_points
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.chapter_add_score(p_user_id uuid, p_activity_kind text, p_source_id uuid, p_amount integer, p_occurred_on date DEFAULT NULL::date)
 RETURNS TABLE(score_added integer, current_chapter integer, reached_chapters integer[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rule public.chapter_score_rules;
  v_event public.chapter_score_events;
  v_today_kst DATE := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_occurred_on DATE;
  v_week_start DATE;
  v_chapter INTEGER;
  v_total BIGINT;
  v_prior BIGINT;
  v_raw INTEGER;
  v_room BIGINT;
  v_within BIGINT;
  v_counted INTEGER;
  v_next_no INTEGER;
  v_next_required BIGINT;
  v_reached INTEGER[] := ARRAY[]::INTEGER[];
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'chapter_add_score: amount는 1 이상이어야 합니다' USING ERRCODE = 'check_violation';
  END IF;
  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'chapter_add_score: source_id가 필요합니다' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_rule FROM public.chapter_score_rules WHERE activity_kind = p_activity_kind;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chapter_add_score: 알 수 없는 활동 종류 %', p_activity_kind USING ERRCODE = 'check_violation';
  END IF;

  v_occurred_on := COALESCE(p_occurred_on, v_today_kst);
  IF v_occurred_on > v_today_kst THEN
    RAISE EXCEPTION 'chapter_add_score: 활동한 날이 미래입니다 (%)', v_occurred_on USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.user_chapters (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT uc.chapter_no, uc.total_score INTO v_chapter, v_total
    FROM public.user_chapters uc WHERE uc.user_id = p_user_id FOR UPDATE;

  SELECT * INTO v_event FROM public.chapter_score_events e
   WHERE e.activity_kind = p_activity_kind AND e.source_id = p_source_id;
  IF FOUND THEN
    IF v_event.user_id <> p_user_id THEN
      RAISE EXCEPTION 'chapter_add_score: 이 (활동 종류, 원천)은 다른 유저의 점수로 이미 기록되어 있습니다'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN QUERY SELECT v_event.counted_score, v_chapter, ARRAY[]::INTEGER[];
    RETURN;
  END IF;

  v_raw := floor(p_amount * v_rule.points_per_unit)::INTEGER;
  IF v_rule.weekly_cap IS NULL THEN
    v_counted := v_raw;
  ELSE
    v_week_start := date_trunc('week', v_occurred_on::timestamp)::date;
    SELECT COALESCE(SUM(e.raw_score), 0) INTO v_prior
      FROM public.chapter_score_events e
     WHERE e.user_id = p_user_id
       AND e.activity_kind = p_activity_kind
       AND e.occurred_on >= v_week_start
       AND e.occurred_on < v_week_start + 7;
    v_room := GREATEST(v_rule.weekly_cap - v_prior, 0);
    v_within := LEAST(v_raw, v_room);
    v_counted := v_within::INTEGER + floor((v_raw - v_within) * v_rule.over_cap_ratio)::INTEGER;
  END IF;

  INSERT INTO public.chapter_score_events
    (user_id, activity_kind, source_id, occurred_on, unit_amount, raw_score, counted_score)
  VALUES
    (p_user_id, p_activity_kind, p_source_id, v_occurred_on, p_amount, v_raw, v_counted);

  v_total := v_total + v_counted;

  IF v_chapter IS NOT NULL THEN
    LOOP
      SELECT d.chapter_no, d.required_score INTO v_next_no, v_next_required
        FROM public.chapter_definitions d
       WHERE d.chapter_no > v_chapter
       ORDER BY d.chapter_no
       LIMIT 1;
      EXIT WHEN NOT FOUND OR v_next_required > v_total;
      v_chapter := v_next_no;
      v_reached := v_reached || v_next_no;
      INSERT INTO public.chapter_ups (user_id, chapter_no) VALUES (p_user_id, v_next_no)
        ON CONFLICT (user_id, chapter_no) DO NOTHING;
    END LOOP;
  END IF;

  UPDATE public.user_chapters
     SET total_score = v_total,
         chapter_no = v_chapter,
         updated_at = now()
   WHERE user_id = p_user_id;

  RETURN QUERY SELECT v_counted, v_chapter, v_reached;
END;
$function$;

-- 4) 권한: service_role만 실행한다
REVOKE ALL ON FUNCTION public.capsule_next_required(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jam_fill_decide(integer, bigint, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capsule_fill(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capsule_open(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.locked_item_fill(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.locked_item_open(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chapter_add_score(uuid, text, uuid, integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capsule_next_required(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.jam_fill_decide(integer, bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.capsule_fill(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.capsule_open(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.locked_item_fill(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.locked_item_open(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.chapter_add_score(uuid, text, uuid, integer, date) TO service_role;
