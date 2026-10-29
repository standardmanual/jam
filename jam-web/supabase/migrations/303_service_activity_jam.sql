-- 303_service_activity_jam.sql
-- 서비스 활동이 잼을 주는 DB 함수 jam_apply_service_activity (티켓 20261028_1735 1회, 상위 20261028_1730, 결정 D5)
--
-- 이 파일은 «확장»이다(db-migration-rules.md 1절): 새 함수 한 개만 덧붙인다. 표·열·CHECK는 300이 이미 만들었고, 이 파일은 바꾸지 않는다.
--   - 덧붙이는 것: 함수 jam_apply_service_activity(uuid, text, text) -> jsonb
--   - 건드리지 않는 것: jam_apply(프로덕션 main이 쓴다), service_jam_rules·jam_policy의 값, capsule_* 함수, chapter_add_score
--   - 이 파일만 적용해도 옛 코드는 그대로 동작한다. 이 함수를 부르는 서버 코드(awardServiceJam)는 2~3회차 티켓이다.
--
-- ⚠️ jam_apply로 service_activity를 못 쓴다: 220의 jam_apply는 사유를 5개로 하드코딩하고 source_event_key 인자가 없다.
--    그래서 302의 capsule_auto_fill 소멸과 같은 방식으로 직접 쓴다(지갑 행 FOR UPDATE → 원장 한 줄 INSERT → 지갑 balance 증가).
--
-- 함수
--   jam_apply_service_activity(p_user_id UUID, p_kind TEXT, p_event_key TEXT) -> jsonb
--     순서(앞 단계에서 끝나면 뒤는 하지 않는다):
--       1. 이용 정지 확인(맨 앞): {ok:false, error:'user_suspended'}. 아무것도 쓰지 않는다.
--       2. p_kind가 service_jam_rules에 없거나 p_event_key가 비었으면(NULL·공백뿐): {ok:false, error:'invalid_input'}.
--       3. 지갑 행이 없으면 만들고(ON CONFLICT DO NOTHING) FOR UPDATE로 잠근다. 같은 유저의 동시 호출을 직렬화한다.
--       4. 같은 (user_id, p_event_key) 원장 줄이 이미 있으면 새로 쓰지 않고 {ok:true, granted:<기존 amount>, duplicate:true}.
--       5. 규칙값(service_jam_rules.amount)이 0이면 {ok:true, granted:0, reason:'rule_zero', ...}. 원장 줄도 날짜별 합도 쓰지 않는다.
--       6. 오늘(KST)의 jam_service_daily 합과 이번 주(월~일 KST, 그 주 월요일부터 오늘까지) 합을 읽는다.
--          지급량 = LEAST(규칙값, 하루 상한 − 오늘 받은 양, 주간 상한 − 이번 주 받은 양).
--          0 이하이면 {ok:true, granted:0, capped:true, ...}로 아무것도 쓰지 않는다. 상한 값 0은 «그날은 지급 0»으로 읽는다.
--       7. 지급량이 양수이면 원장 한 줄(reason='service_activity', source_event_key=p_event_key), 지갑 balance 증가,
--          jam_service_daily 오늘 행 upsert 가산. 지갑 total_earned는 바꾸지 않는다(활동 잼과 서비스 활동 잼을 합산할지는 후속 티켓 U5b가 정한다).
--       8. {ok:true, granted, ruleAmount, capped, duplicate:false, dailyUsed, weeklyUsed, balance}
--          capped = 지급량이 규칙값보다 작으면 true(일부 지급 포함). dailyUsed·weeklyUsed·balance는 이번 지급을 반영한 값이다.
--          5·6단계 응답도 ruleAmount·duplicate:false·dailyUsed·weeklyUsed·balance를 갖는다(이번 호출은 아무것도 쓰지 않았으므로 호출 전 값).
--     · 캡슐은 이 함수가 채우지 않는다. 서버 래퍼가 지급(granted > 0) 뒤에 자동 채움(capsule_auto_fill)을 잇는다.
--     · 잠금 순서: 지갑 행 하나뿐이다. 캡슐 행(user_capsules)은 잡지 않는다.
--       capsule_auto_fill은 캡슐 행 → (보류 2개일 때) 지갑 행 순서, jam_apply(채움)는 지갑 행만 잡는다. 이 함수는 지갑 행만 잡으므로
--       «지갑을 쥔 채 캡슐을 기다리는» 쪽이 없어 교차 교착이 생기지 않는다. 이 함수가 기다리는 상대는 지갑 행을 쥔 호출뿐이고,
--       그 호출은 지갑 행을 쥔 채 다른 행 잠금을 새로 요구하지 않는다(jam_service_daily·jam_transactions 쓰기는 자기 행 INSERT/UPSERT뿐이다).
--     · 잼의 단위는 정수다(규칙값·상한 INTEGER). jam_wallets.balance는 BIGINT.
--
-- 실행 주의
--   - 한 트랜잭션으로 실행한다. 새 함수 하나라 표를 잠그거나 다시 쓰지 않는다. 백필 없음.
--   - 함수는 service_role만 실행한다(PUBLIC·anon·authenticated 회수). 함수 EXECUTE는 기본으로 PUBLIC에 열려 있으므로 REVOKE ALL FROM PUBLIC이 필수다.
--
-- 적용 전 확인(읽기 전용 SELECT)
--   SELECT proname FROM pg_proc WHERE proname = 'jam_apply_service_activity';                                           -- 0행
--   SELECT kind, amount FROM public.service_jam_rules ORDER BY kind;                                                    -- 7행: badge_earned 5, collection_complete 30, combine_success 5, drop 0, locked_unlock 5, mission_complete 20, pickup 0
--   SELECT service_jam_daily_cap, service_jam_weekly_cap FROM public.jam_policy WHERE id = 1;                            -- 40, 100
--   SELECT to_regclass('public.jam_service_daily');                                                                     -- 값 있음(300)
--   SELECT count(*) FROM pg_indexes WHERE indexname = 'jam_transactions_service_event_uniq';                            -- 1
--   SELECT count(*) FROM public.jam_transactions WHERE reason = 'service_activity';                                     -- 0
--   SELECT count(*) FROM public.jam_service_daily;                                                                      -- 0
--
-- 적용 후 확인(읽기 전용 SELECT)
--   SELECT proname, prosecdef, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname = 'jam_apply_service_activity'; -- 1행, true, p_user_id uuid, p_kind text, p_event_key text
--   SELECT has_function_privilege('authenticated', 'public.jam_apply_service_activity(uuid, text, text)', 'EXECUTE');   -- false
--   SELECT has_function_privilege('anon', 'public.jam_apply_service_activity(uuid, text, text)', 'EXECUTE');            -- false
--   SELECT has_function_privilege('service_role', 'public.jam_apply_service_activity(uuid, text, text)', 'EXECUTE');    -- true
--   SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname = 'jam_apply';                    -- 적용 전과 같은 행(8인자)
--   SELECT kind, amount FROM public.service_jam_rules ORDER BY kind;                                                    -- 적용 전과 같은 값
--
-- 적용 직후 롤백 실측 권장(DO 블록 + RAISE EXCEPTION으로 되돌림, 시험 계정 사용.
--   날짜는 호출 사이에 jam_service_daily.kst_date를 UPDATE해 옮기거나 미리 행을 INSERT해 모사한다)
--   a) 같은 키 재전송: 첫 호출 granted n·duplicate false / 두 번째 {granted n, duplicate true}. 원장 줄 1·지갑 증가 1회분·daily 합 1회분
--   b) 규칙값 0(drop·pickup 기본): {granted 0, reason 'rule_zero'}. 원장 줄·daily 행 없음·지갑 그대로
--   c) 하루 상한 경계: 오늘 받은 양이 상한−k일 때 규칙값 > k이면 k만 지급(capped true) / 이후 같은 날 다른 키는 granted 0·capped true·줄 없음 / 상한 값 0이면 지급 0
--   d) 주간 상한 경계(월요일 시작): 월~일 KST 날짜에 하루 40씩 쌓아 100에서 멈춘다(40·40·20 지급 뒤 0). 월요일에는 지난주 일요일 몫이 합산되지 않고 다시 40부터 시작
--   e) 정지 중 지급 없음: user_suspensions에 정지 줄이 있으면 {ok:false, error:'user_suspended'}, 원장·daily·지갑 변화 없음 / 없는 kind·빈 키는 invalid_input
--   f) 서로 다른 키의 반복 지급은 상한까지만(드랍·픽업 값을 5로 올린 상태 모사: UPDATE service_jam_rules 후 롤백): 드랍→줍기를 키를 바꿔 수십 번 반복해도 하루 합이 하루 상한, 주간 합이 주간 상한을 넘지 않는다
--   g) 원장 등식: 원장 service_activity 합 = jam_service_daily 합 = 지갑 balance 증가분(total_earned는 그대로)
--   h) 권한: authenticated 역할로 호출하면 permission denied

-- ----------------------------------------------------------------
-- 1. jam_apply_service_activity
-- ----------------------------------------------------------------
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

-- 되돌림 SQL
-- 이 함수를 부르는 새 코드(2~3회차)를 먼저 되돌린 뒤 함수를 지운다.
-- 이미 일어난 일은 남는다: 원장 service_activity 줄과 jam_service_daily 합, 지갑 잔액(원장은 지우지 않는다. 300의 CHECK도 그대로라 문제없다).
-- DROP FUNCTION IF EXISTS public.jam_apply_service_activity(UUID, TEXT, TEXT);
