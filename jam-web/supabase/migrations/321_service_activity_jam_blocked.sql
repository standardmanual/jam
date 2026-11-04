-- 321_service_activity_jam_blocked.sql
-- 막혀 있는 동안 서비스 활동 잼을 지급하지 않는다 (티켓 20261105_0102 T2, 상위 20261105_0100, 사용자 승인 Q2: 거절)
--
-- jam_apply_service_activity(uuid, text, text)를 같은 시그니처로 교체한다(303 본문 기준). 시그니처가 같아 옛 시그니처 DROP은 필요 없다(db-migration-rules.md 3절).
-- 변경은 한 곳이다: 6단계에서 지급량(v_granted)이 0보다 크다고 확정된 직후, 7단계(원장 쓰기) 앞에 막힘 검사를 끼운다.
--   · capsule_receive_blocked(p_user_id)(320)의 blocked가 참이면 {ok:true, granted:0, blocked:true, ruleAmount, duplicate:false, dailyUsed, weeklyUsed, balance}를
--     돌려주고 아무것도 쓰지 않는다(원장·jam_service_daily·지갑 모두 그대로, 값은 호출 전 값).
--   · 판정을 복제하지 않고 T1의 함수를 부른다. 읽기 전용(STABLE)이라 새 잠금이 없다. 잠금은 지갑 행 하나뿐이다(303 머리말의 잠금 설명 그대로).
--   · 검사 위치 때문에 이벤트 키 재전송은 여전히 duplicate, 규칙값 0은 rule_zero, 상한 도달은 capped로 돌아간다. blocked는 «막혀서 못 받은 경우»만 뜻한다.
--   · 막혀서 거절한 지급은 나중에 보충하지 않는다. 같은 키로 막힘이 풀린 뒤 다시 보내면 그때는 정상 지급된다(원장 줄이 없어 duplicate가 아니다).
--   · 운영자 지급·회수는 jam_apply(admin_grant·admin_deduct)라 이 함수를 지나지 않아 막히지 않는다.
-- 건드리지 않는 것: 303 외 다른 함수·표·정책 값, 권한(CREATE OR REPLACE가 유지하지만 303과 같은 REVOKE·GRANT를 다시 적어 둔다).
--
-- 실행 주의: 한 트랜잭션. 함수 하나 교체라 표를 잠그거나 다시 쓰지 않는다. 백필 없음. 선행: 320(capsule_receive_blocked).
--
-- 적용 전 확인(읽기 전용)
--   SELECT proname FROM pg_proc WHERE proname = 'capsule_receive_blocked';                       -- 1행(320 적용됨)
--   SELECT pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname = 'jam_apply_service_activity'; -- 1행: p_user_id uuid, p_kind text, p_event_key text
-- 적용 후 확인(읽기 전용)
--   SELECT count(*) FROM pg_proc WHERE proname = 'jam_apply_service_activity';                     -- 1
--   SELECT prosrc LIKE '%capsule_receive_blocked%' FROM pg_proc WHERE proname = 'jam_apply_service_activity'; -- true
--   SELECT has_function_privilege('authenticated', 'public.jam_apply_service_activity(uuid, text, text)', 'EXECUTE'); -- false
--   SELECT has_function_privilege('service_role', 'public.jam_apply_service_activity(uuid, text, text)', 'EXECUTE');  -- true
-- 적용 직후 롤백 실측 권장(DO 블록 + RAISE EXCEPTION, 시험 계정)
--   a) 막히지 않은 상태: 303 실측 a~h와 같은 결과(중복 키·상한 포함)
--   b) 막힌 상태(user_capsules.filled = required, inventory.used_slots = max_slots): {granted 0, blocked true}, 원장 줄·jam_service_daily 행 없음, 지갑 그대로
--   c) 막힌 상태에서 이미 지급한 키 재전송: duplicate true(blocked 키 없음) / 규칙값 0: rule_zero / 상한 도달: capped
--   d) 막힘을 푼 뒤(빈칸 확보) 같은 키 재전송: 정상 지급
-- 되돌림: 같은 번호의 321_service_activity_jam_blocked_down.sql(303 본문 복원)

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

  -- 6.5. 막힘 검사: 캡슐이 가득 차고 인벤토리 빈칸이 모자라면 지급하지 않는다(거절, 나중에 보충하지 않음). 판정은 capsule_receive_blocked(320)가 한다.
  IF COALESCE((public.capsule_receive_blocked(p_user_id) ->> 'blocked')::boolean, FALSE) THEN
    RETURN jsonb_build_object(
      'ok', TRUE, 'granted', 0, 'blocked', TRUE, 'ruleAmount', v_rule, 'duplicate', FALSE,
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
  '서비스 활동(종류 p_kind, 중복 방지 키 p_event_key)으로 고정 잼을 지급한다. 정지 중이면 user_suspended, 모르는 종류·빈 키는 invalid_input. 같은 키는 다시 쓰지 않고 duplicate. 규칙값 0이면 rule_zero. 지급량은 LEAST(규칙값, 하루 상한 남은 양, 주간(월~일 KST) 상한 남은 양)이고 0이면 capped로 아무것도 쓰지 않는다. 지급할 양이 있어도 capsule_receive_blocked가 참(캡슐 가득 + 인벤토리 빈칸 부족)이면 blocked:true, granted:0으로 거절하고 아무것도 쓰지 않는다(나중에 보충하지 않음). 원장 service_activity 한 줄 + 지갑 balance 증가(total_earned 그대로) + jam_service_daily 가산. 캡슐은 채우지 않는다. service_role 전용.';

REVOKE ALL ON FUNCTION public.jam_apply_service_activity(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jam_apply_service_activity(UUID, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jam_apply_service_activity(UUID, TEXT, TEXT) TO service_role;

-- 되돌림 SQL
-- 같은 번호의 321_service_activity_jam_blocked_down.sql이 303 본문을 복원한다.
