-- 321_service_activity_jam_blocked_down.sql
-- 321의 되돌림: jam_apply_service_activity를 303 본문 그대로 복원한다(막힘 검사 제거).
-- 아래 함수 본문은 303_service_activity_jam.sql의 70~177줄(CREATE OR REPLACE ~ GRANT)과 글자 그대로 같다. 바꾸지 않는다(롤백 실측 때 정규화 해시로 대조).
-- 이미 일어난 일은 남는다: 막혀서 거절된 호출은 아무것도 쓰지 않았으므로 되돌릴 데이터가 없다.

CREATE OR REPLACE FUNCTION public.jam_apply_service_activity(
  p_user_id UUID,
  p_kind TEXT,
  p_event_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule INTEGER;
  v_daily_cap INTEGER;
  v_weekly_cap INTEGER;
  v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_week_start DATE;
  v_daily_used INTEGER;
  v_weekly_used INTEGER;
  v_granted INTEGER;
  v_existing INTEGER;
  v_balance BIGINT;
BEGIN
  -- 1. 이용 정지 확인(맨 앞, 아무것도 쓰지 않는다)
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  -- 2. 입력 확인
  IF p_user_id IS NULL OR p_kind IS NULL OR p_event_key IS NULL OR btrim(p_event_key) = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_input');
  END IF;
  SELECT r.amount INTO v_rule FROM public.service_jam_rules r WHERE r.kind = p_kind;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_input');
  END IF;

  -- 3. 지갑 행 확보 후 잠금(같은 유저의 동시 호출을 직렬화한다). 이 함수가 잡는 잠금은 이 행 하나뿐이다.
  INSERT INTO public.jam_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT w.balance INTO v_balance FROM public.jam_wallets w WHERE w.user_id = p_user_id FOR UPDATE;

  -- 4. 같은 이벤트 키가 이미 지급됐으면 새로 쓰지 않고 기존 양을 돌려준다.
  SELECT t.amount INTO v_existing
    FROM public.jam_transactions t
   WHERE t.user_id = p_user_id AND t.source_event_key = p_event_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', TRUE, 'granted', v_existing, 'duplicate', TRUE);
  END IF;

  -- 상한과 날짜별 합(읽기만 한다). 정책 행이 없으면 기본값(40·100).
  SELECT p.service_jam_daily_cap, p.service_jam_weekly_cap
    INTO v_daily_cap, v_weekly_cap
    FROM public.jam_policy p WHERE p.id = 1;
  IF NOT FOUND THEN
    v_daily_cap := 40;
    v_weekly_cap := 100;
  END IF;

  v_week_start := date_trunc('week', v_today::timestamp)::date;   -- 그 주 월요일(timestamp 없는 시간대 계산이라 세션 시간대 영향 없음)
  SELECT COALESCE(SUM(d.amount) FILTER (WHERE d.kst_date = v_today), 0)::INTEGER,
         COALESCE(SUM(d.amount), 0)::INTEGER
    INTO v_daily_used, v_weekly_used
    FROM public.jam_service_daily d
   WHERE d.user_id = p_user_id AND d.kst_date BETWEEN v_week_start AND v_today;

  -- 5. 규칙값 0: 아무것도 쓰지 않는다.
  IF v_rule <= 0 THEN
    RETURN jsonb_build_object(
      'ok', TRUE, 'granted', 0, 'reason', 'rule_zero', 'ruleAmount', v_rule, 'capped', FALSE, 'duplicate', FALSE,
      'dailyUsed', v_daily_used, 'weeklyUsed', v_weekly_used, 'balance', v_balance
    );
  END IF;

  -- 6. 지급량 = 규칙값·하루 남은 양·주간 남은 양 중 가장 작은 값. 0 이하이면 아무것도 쓰지 않는다.
  v_granted := LEAST(v_rule, v_daily_cap - v_daily_used, v_weekly_cap - v_weekly_used);
  IF v_granted <= 0 THEN
    RETURN jsonb_build_object(
      'ok', TRUE, 'granted', 0, 'capped', TRUE, 'ruleAmount', v_rule, 'duplicate', FALSE,
      'dailyUsed', v_daily_used, 'weeklyUsed', v_weekly_used, 'balance', v_balance
    );
  END IF;

  -- 7. 원장 한 줄 + 지갑 증가(total_earned는 그대로) + 오늘 날짜 합 가산
  INSERT INTO public.jam_transactions (user_id, amount, reason, source_event_key)
    VALUES (p_user_id, v_granted, 'service_activity', p_event_key);

  UPDATE public.jam_wallets
     SET balance = balance + v_granted, updated_at = now()
   WHERE user_id = p_user_id
   RETURNING balance INTO v_balance;

  INSERT INTO public.jam_service_daily (user_id, kst_date, amount)
    VALUES (p_user_id, v_today, v_granted)
  ON CONFLICT (user_id, kst_date) DO UPDATE
    SET amount = public.jam_service_daily.amount + EXCLUDED.amount;

  -- 8. 지급 결과
  RETURN jsonb_build_object(
    'ok', TRUE, 'granted', v_granted, 'ruleAmount', v_rule, 'capped', v_granted < v_rule, 'duplicate', FALSE,
    'dailyUsed', v_daily_used + v_granted, 'weeklyUsed', v_weekly_used + v_granted, 'balance', v_balance
  );
END;
$$;

COMMENT ON FUNCTION public.jam_apply_service_activity(UUID, TEXT, TEXT) IS
  '서비스 활동(종류 p_kind, 중복 방지 키 p_event_key)으로 고정 잼을 지급한다. 정지 중이면 user_suspended, 모르는 종류·빈 키는 invalid_input. 같은 키는 다시 쓰지 않고 duplicate. 규칙값 0이면 rule_zero. 지급량은 LEAST(규칙값, 하루 상한 남은 양, 주간(월~일 KST) 상한 남은 양)이고 0이면 capped로 아무것도 쓰지 않는다. 원장 service_activity 한 줄 + 지갑 balance 증가(total_earned 그대로) + jam_service_daily 가산. 캡슐은 채우지 않는다. service_role 전용.';

REVOKE ALL ON FUNCTION public.jam_apply_service_activity(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jam_apply_service_activity(UUID, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jam_apply_service_activity(UUID, TEXT, TEXT) TO service_role;
