-- 302_capsule_pending_forfeit.sql
-- 인벤토리가 차면 보상이 보류되고, 둘째 가득 참부터 잼이 사라지며, 알림 단계를 판정하는 DB 함수 (티켓 20261028_1734 1회, 상위 20261028_1730, 결정 D9·D10)
--
-- 이 파일은 «확장 + 같은 시그니처 교체»다(db-migration-rules.md 1·3절).
--   - 덧붙이는 것: 알림 종류 값 2개, user_capsules.alert_stage, 뷰 jam_forfeit_weekly, 새 함수 capsule_hold_reward·capsule_claim_pending
--   - 교체하는 것: capsule_auto_fill(uuid)·capsule_open_counted(uuid, jsonb). 시그니처와 반환 타입(JSONB)이 301과 같아 DROP이 필요 없다.
--     301의 반환 키는 모두 그대로 두고 키만 더한다(옛 호출부가 이름으로 읽으므로 영향 없음).
--   - 건드리지 않는 것: capsule_open·capsule_fill·capsule_next_required·capsule_get_or_create·jam_apply 등 옛 함수(프로덕션 main이 쓴다),
--     capsule_next_required_v2(301 그대로 부른다), 표 capsule_pending_rewards·CHECK 제약(300이 이미 만들었다).
--   - 이 파일만 적용해도 옛 코드는 그대로 동작한다. 새 함수를 부르는 서버 코드는 2~3회차 티켓이다.
--
-- ⚠️ 새 enum 값은 같은 트랜잭션에서 쓸 수 없다(55P04, 270번 선례). 이 파일은 새 알림 값을 쓰지 않는다(함수도 알림 행을 만들지 않고 단계만 돌려준다).
--    알림 행을 만드는 곳은 3회차 앱 코드다. 🚨 적용 순서: 이 DDL 먼저 → 3회차 코드 배포.
--
-- ⚠️ jam_apply로 capsule_forfeit을 못 쓴다(조사 결과): 220의 jam_apply는 사유를 5개(activity_settlement·admin_grant·capsule_fill·locked_item_badge_fill·admin_deduct)로
--    하드코딩해 그 밖의 사유에 «알 수 없는 사유» 예외를 낸다. 300은 jam_transactions의 CHECK만 넓혔고 jam_apply는 그대로다.
--    그래서 capsule_auto_fill은 소멸을 jam_apply가 아니라 같은 일을 하는 직접 쓰기(지갑 행 FOR UPDATE → 원장 한 줄 INSERT → 지갑 balance 차감)로 한다.
--    total_earned는 줄이지 않는다(jam_apply도 활동 정산만 total_earned를 바꾼다). jam_apply는 건드리지 않는다.
--
-- 함수
--   capsule_auto_fill(uuid) -> jsonb  (301에서 교체)
--     {ok, applied, required, filled, full, balance, chapterNo,           -- 301과 같은 키
--      forfeited, pendingCount, alertStage, reachedChapters, chapterCount} -- 새 키
--     정지 확인 → 캡슐 행 잠금 → filled=0이면 필요량 v2로 맞춤(301 그대로) → 보류 수를 센다.
--     · 보류 2개: 채우지 않는다. 지갑 잔액 전액을 capsule_forfeit(음수)으로 소멸 기록하고 forfeited로 돌려준다(잔액 0이면 forfeited 0, 원장 줄 없음).
--     · 보류 0~1개: 301처럼 «남은 양과 잔액 중 작은 만큼» jam_apply(-n,'capsule_fill')로 채운다. 이번 호출로 filled가 required에 처음 닿으면
--       (applied>0이고 닿았을 때) 챕터 횟수 +1과 오름 판정을 한다(퀘스트 전 캡슐 chapter_no NULL이면 세지 않음, advance_count NULL이거나 다음 챕터가 없으면 횟수만 올리고 멈춤,
--       오르면 횟수 0·chapter_ups 한 줄). 오른 챕터를 reachedChapters(빈 배열 또는 1개)로 돌려준다.
--     · 알림 단계: 보류가 정확히 1개이고 이번 호출에서 채웠을 때만, 채움 비율이 70·80·90%에 닿은 가장 높은 단계가 저장된 alert_stage보다 높으면
--       행(이미 잠겼다)의 alert_stage를 올리고 alertStage로 돌려준다. 올리지 않았으면 alertStage는 null이다(0이 아니라 null: 알릴 것이 없다).
--       보류가 0개이면 단계를 올리지 않는다. «받을 수 없게 된 순간»의 알림은 capsule_hold_reward의 blockedNow가 맡는다.
--     · pendingCount = 이 호출이 본 보류 수. chapterCount = 호출이 끝난 시점의 user_chapters.capsule_full_count(챕터 행이 없으면 null).
--       chapterNo(301부터 있던 키) = 지금 캡슐의 chapter_no. 301과 의미가 같다.
--   capsule_open_counted(uuid, jsonb) -> jsonb  (301에서 교체)
--     capsule_open을 같은 트랜잭션에서 부른 뒤 다음 캡슐을 v2로 덮어쓰고 alert_stage를 0으로 돌린다. 더는 챕터 횟수를 세지 않는다
--     (횟수는 capsule_auto_fill이 100%에 닿는 시점에 센다, D9). ok=false면 capsule_open 결과를 그대로 돌려준다.
--     반환 키는 301과 모양을 맞춘다: chapterNo = null, reachedChapters = [], chapterCount = 지금 값(세지 않았을 뿐 값은 있다).
--     키를 지우지 않는 이유: 이 함수를 부르는 TS(lib/capsule/open.ts)가 세 키를 읽는다. 지우면 2회차 전까지 undefined가 되어 타입이 깨진다.
--   capsule_hold_reward(uuid) -> jsonb  (새 함수)
--     정지 확인 → 캡슐 행 잠금 → 가득 차지 않았으면 not_full → 보류가 이미 2개면 pending_full →
--     가득 찬 캡슐을 capsule_pending_rewards의 가장 낮은 빈 slot으로 옮기고(chapter_no, fill_amount=required, reached_at=now())
--     캡슐을 v2의 새 캡슐로 바꾼다(filled=0, alert_stage=0). 반환 {ok, slot, pendingCount, blockedNow, next{required, filled, chapterNo}}.
--     blockedNow = 이 호출 전 보류 1개 → 호출 뒤 2개가 된 경우만 true («받을 수 없게 된 순간» 알림 표식).
--   capsule_claim_pending(uuid, uuid, jsonb) -> jsonb  (새 함수)
--     보류 한 줄을 받는다. 정지 확인 → 아이템 목록 검사(invalid_items, capsule_open과 같다) → 캡슐 행 잠금(보류를 바꾸는 모든 경로가 이 행으로 직렬화된다) →
--     보류 줄 잠금(없으면 pending_not_found) → 인벤토리 잠금 → 빈칸 < guaranteed_count+bonus_count이면 아무것도 바꾸지 않고
--     {ok:false, error:'insufficient_slots', free, needed}. 충분하면 capsule_open과 같은 방식으로 지급하고 item_issue_log·user_drop_state·
--     capsule_opens(chapter_no=보류의 챕터, required=filled=보류의 fill_amount)를 기록한 뒤 그 보류 줄을 지운다.
--     반환 {ok, openId, itemIds, items, pendingCount(남은 보류 수)}. 캡슐 자체(filled·alert_stage)는 바꾸지 않는다.
--     «오래된 순서로 받기»는 호출하는 서버 코드(2회차)가 정한다. 이 함수는 넘겨받은 줄을 받는다.
--
-- 규칙 해석
--   - 잠금 순서는 캡슐 행 → (지갑 행 | 보류 줄) → 인벤토리 행이다. capsule_open도 캡슐 → 인벤토리 순이라 교차 교착이 없다.
--   - 알림 단계 비교는 정수 연산이다: filled*100 >= 70*required. 소수 반올림 없음.
--   - 이 마이그레이션 적용 시점에 이미 가득 찬 채 열리지 않은 캡슐은 챕터 횟수에 잡히지 않는다(301은 열 때 세었고 302는 닿을 때 센다).
--     출시 전이라 영향 없음(300 적용 시점 실측: 챕터 횟수·캡슐 열기 0건). 적용 전 확인 쿼리로 다시 센다.
--
-- 실행 주의
--   - 한 트랜잭션으로 실행한다. ALTER TYPE ... ADD VALUE는 트랜잭션 안에서 가능하지만 새 값은 쓰지 않는다.
--   - user_capsules의 새 열은 상수 DEFAULT라 표를 다시 쓰지 않는다. 백필 없음. 새 함수·교체 함수·뷰는 모두 service_role만 쓴다.
--
-- 적용 전 확인(읽기 전용 SELECT)
--   SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'notification_type' AND e.enumlabel IN ('capsule_nearly_full', 'capsule_jam_blocked');         -- 0
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'user_capsules' AND column_name = 'alert_stage';                   -- 0행
--   SELECT proname FROM pg_proc WHERE proname IN ('capsule_hold_reward', 'capsule_claim_pending');                      -- 0행
--   SELECT to_regclass('public.jam_forfeit_weekly');                                                                    -- NULL
--   SELECT count(*) FROM public.user_capsules WHERE filled >= required;                                                 -- 가득 찬 채 남은 캡슐 수(위 «규칙 해석» 참고)
--   SELECT count(*) FROM public.capsule_pending_rewards;                                                                -- 0
--
-- 적용 후 확인(읽기 전용 SELECT)
--   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'notification_type' AND e.enumlabel IN ('capsule_nearly_full', 'capsule_jam_blocked');         -- 2행
--   SELECT column_default, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'user_capsules' AND column_name = 'alert_stage';                   -- 0, NO
--   SELECT proname, prosecdef FROM pg_proc
--    WHERE proname IN ('capsule_auto_fill', 'capsule_open_counted', 'capsule_hold_reward', 'capsule_claim_pending');  -- 4행, 모두 true
--   SELECT has_function_privilege('authenticated', 'public.capsule_hold_reward(uuid)', 'EXECUTE');                      -- false
--   SELECT has_function_privilege('service_role', 'public.capsule_claim_pending(uuid, uuid, jsonb)', 'EXECUTE');       -- true
--   SELECT has_table_privilege('authenticated', 'public.jam_forfeit_weekly', 'SELECT');                                -- false
--   SELECT has_table_privilege('service_role', 'public.jam_forfeit_weekly', 'SELECT');                                 -- true
--   SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc
--    WHERE proname IN ('capsule_fill', 'capsule_open', 'capsule_next_required', 'capsule_next_required_v2', 'jam_apply'); -- 적용 전과 같은 행
--
-- 적용 직후 롤백 실측 권장(DO 블록 + RAISE EXCEPTION으로 되돌림, 시험 계정 사용)
--   a) 보류 0 + 잼 적립 → auto_fill이 채움, 닿는 호출에서만 횟수 +1·reachedChapters(advance_count 번째에 오름·횟수 0·chapter_ups 한 줄), 이미 가득이면 다시 세지 않음
--   b) 가득 → hold_reward → slot 1, pendingCount 1, blockedNow false, 새 캡슐 filled 0·alert_stage 0 / 다시 채워 가득 → hold_reward → slot 2, blockedNow true / 또 가득 → pending_full
--   c) 보류 1 + 채움이 70·80·90%에 닿음 → alertStage가 단계마다 한 번, 한 번에 건너뛰면 가장 높은 단계 하나, 같은 단계 재호출은 null / 보류 0이면 null
--   d) 보류 2 + 지갑 잔액 n → auto_fill이 capsule_forfeit -n 한 줄·잔액 0·forfeited n / 잔액 0이면 forfeited 0·원장 줄 없음 / 정지 중에는 user_suspended
--   e) claim_pending: 빈칸 모자람 → insufficient_slots(아무것도 안 바뀜) / 충분 → 지급·item_issue_log·capsule_opens 한 줄·보류 줄 삭제·pendingCount 감소
--   f) 원장 등식: 받은 잼 = 캡슐에 채운 양 + 소멸한 양 + 지갑 잔액 / 뷰 jam_forfeit_weekly가 KST 월요일 주 단위로 합친다

-- ----------------------------------------------------------------
-- 1. 알림 종류 값 2개 (DDL을 코드 배포보다 먼저)
--    capsule_nearly_full: 다음 캡슐의 채움이 70·80·90%에 닿았다(단계 payload). capsule_jam_blocked: 잼을 받을 수 없게 된 순간.
-- ----------------------------------------------------------------
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'capsule_nearly_full';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'capsule_jam_blocked';

-- ----------------------------------------------------------------
-- 2. user_capsules.alert_stage — 이 캡슐에서 마지막으로 알린 채움 단계
--    캡슐이 바뀌면(열림·보류) 0으로 돌린다. 단계마다 최대 1회 알리게 하는 잠금이다(237번 방식).
-- ----------------------------------------------------------------
ALTER TABLE public.user_capsules
  ADD COLUMN IF NOT EXISTS alert_stage SMALLINT NOT NULL DEFAULT 0 CHECK (alert_stage IN (0, 70, 80, 90));

COMMENT ON COLUMN public.user_capsules.alert_stage IS
  '지금 캡슐에서 마지막으로 알린 채움 단계: 0(알리지 않음), 70, 80, 90. 보류가 하나 있는 동안 채움이 단계에 처음 닿을 때만 올리고, 캡슐이 열리거나 보류로 옮겨지면 0으로 돌린다.';

-- ----------------------------------------------------------------
-- 3. jam_forfeit_weekly — 주(KST 월~일)별 소멸한 유저 수와 양 (읽기 전용)
--    capsule_forfeit 줄만 센다. 목표 수치는 두지 않는다(오픈 뒤 4주 관찰).
--    security_invoker: 보는 사람의 권한으로 jam_transactions를 읽는다. 클라이언트 역할에는 권한을 주지 않으므로 service_role만 읽는다.
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW public.jam_forfeit_weekly
WITH (security_invoker = true) AS
SELECT
  date_trunc('week', t.created_at AT TIME ZONE 'Asia/Seoul')::date AS week_start_kst,   -- 그 주 월요일(KST)
  COUNT(DISTINCT t.user_id)::INTEGER AS user_count,                                       -- 그 주에 잼이 소멸한 유저 수
  SUM(-t.amount)::BIGINT AS forfeited_amount                                               -- 소멸한 잼의 합(양수)
FROM public.jam_transactions t
WHERE t.reason = 'capsule_forfeit'
GROUP BY 1;

COMMENT ON VIEW public.jam_forfeit_weekly IS
  '받을 수 없는 동안 사라진 잼(capsule_forfeit)의 주(KST 월~일)별 유저 수와 양. 읽기 전용, service_role 전용.';

REVOKE ALL ON public.jam_forfeit_weekly FROM PUBLIC;
REVOKE ALL ON public.jam_forfeit_weekly FROM anon, authenticated;
GRANT SELECT ON public.jam_forfeit_weekly TO service_role;

-- ----------------------------------------------------------------
-- 4. capsule_auto_fill 교체 — 닿는 시점의 챕터 횟수·오름, 보류 2개면 지갑 소멸, 알림 단계
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
  v_forfeited INTEGER := 0;
  v_alert_stage INTEGER := NULL;
  v_new_stage INTEGER;
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

  -- 아직 채우지 않은 캡슐은 필요량·챕터를 v2 기준으로 맞춘다(옛 함수가 만든 캡슐 포함). 301과 같다.
  IF v_cap.filled = 0 THEN
    SELECT * INTO v_next FROM public.capsule_next_required_v2(p_user_id);
    IF v_cap.required IS DISTINCT FROM v_next.required OR v_cap.chapter_no IS DISTINCT FROM v_next.chapter_no THEN
      UPDATE public.user_capsules
         SET required = v_next.required, chapter_no = v_next.chapter_no, updated_at = now()
       WHERE user_id = p_user_id
       RETURNING * INTO v_cap;
    END IF;
  END IF;

  -- 보류 수. 보류를 바꾸는 모든 경로가 위의 캡슐 행 잠금으로 직렬화되므로 이 값은 호출 동안 변하지 않는다.
  SELECT COUNT(*)::INTEGER INTO v_pending FROM public.capsule_pending_rewards WHERE user_id = p_user_id;

  IF v_pending >= 2 THEN
    -- 잼을 받을 수 없는 상태: 채우지 않고 지갑 잔액 전액을 소멸 기록한다.
    -- jam_apply는 capsule_forfeit 사유를 모르므로(파일 머리말) 같은 일을 직접 쓴다: 지갑 잠금 → 원장 한 줄 → 잔액 차감.
    SELECT w.balance INTO v_balance FROM public.jam_wallets w WHERE w.user_id = p_user_id FOR UPDATE;
    v_balance := COALESCE(v_balance, 0);
    IF v_balance > 0 THEN
      v_forfeited := LEAST(v_balance, 2147483647)::INTEGER;
      INSERT INTO public.jam_transactions (user_id, amount, reason)
        VALUES (p_user_id, -v_forfeited, 'capsule_forfeit');
      UPDATE public.jam_wallets
         SET balance = balance - v_forfeited, updated_at = now()
       WHERE user_id = p_user_id;
      v_balance := v_balance - v_forfeited;
    END IF;
  ELSE
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

      -- 알림 단계: 보류가 정확히 하나일 때만. 닿은 가장 높은 단계 하나가 저장된 단계보다 높으면 올리고 돌려준다.
      IF v_pending = 1 THEN
        v_new_stage := CASE
          WHEN v_cap.filled * 100 >= 90 * v_cap.required THEN 90
          WHEN v_cap.filled * 100 >= 80 * v_cap.required THEN 80
          WHEN v_cap.filled * 100 >= 70 * v_cap.required THEN 70
          ELSE 0
        END;
        IF v_new_stage > v_cap.alert_stage THEN
          UPDATE public.user_capsules
             SET alert_stage = v_new_stage, updated_at = now()
           WHERE user_id = p_user_id
           RETURNING * INTO v_cap;
          v_alert_stage := v_new_stage;
        END IF;
      END IF;
    END IF;
  END IF;

  SELECT uc.capsule_full_count INTO v_chapter_count FROM public.user_chapters uc WHERE uc.user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'applied', v_amount,
    'required', v_cap.required,
    'filled', v_cap.filled,
    'full', v_cap.filled >= v_cap.required,
    'balance', v_balance,
    'chapterNo', v_cap.chapter_no,
    'forfeited', v_forfeited,
    'pendingCount', v_pending,
    'alertStage', v_alert_stage,
    'reachedChapters', to_jsonb(v_reached),
    'chapterCount', v_chapter_count
  );
END;
$$;

COMMENT ON FUNCTION public.capsule_auto_fill(UUID) IS
  '지갑 잼으로 지금 캡슐 하나를 채운다. 보류 2개면 채우지 않고 지갑 잔액 전액을 capsule_forfeit으로 소멸 기록한다(forfeited). 채움이 required에 처음 닿는 호출에서 챕터 횟수 +1과 오름 판정(reachedChapters). 보류가 하나일 때 채움이 70·80·90%에 처음 닿으면 alert_stage를 올리고 alertStage로 돌려준다(없으면 null). 정지 중이면 user_suspended. service_role 전용.';

-- ----------------------------------------------------------------
-- 5. capsule_open_counted 교체 — 횟수 세기 제거, 다음 캡슐 v2·alert_stage 0
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capsule_open_counted(p_user_id UUID, p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap public.user_capsules;
  v_open JSONB;
  v_next RECORD;
  v_chapter_count INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  -- 캡슐 행 잠금은 capsule_open이 같은 트랜잭션에서 다시 잡는다(301과 같은 순서).
  PERFORM public.capsule_get_or_create(p_user_id);
  SELECT * INTO v_cap FROM public.user_capsules WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'capsule_changed');
  END IF;

  v_open := public.capsule_open(p_user_id, p_items);
  IF NOT COALESCE((v_open->>'ok')::BOOLEAN, FALSE) THEN
    RETURN v_open;
  END IF;

  -- 열린 직후의 다음 캡슐: v2 기준으로 덮어쓰고 알림 단계를 0으로 돌린다(capsule_open은 옛 fill_amount로 정했고 alert_stage를 모른다).
  SELECT * INTO v_next FROM public.capsule_next_required_v2(p_user_id);
  UPDATE public.user_capsules
     SET required = v_next.required, filled = 0, chapter_no = v_next.chapter_no, alert_stage = 0, updated_at = now()
   WHERE user_id = p_user_id;

  -- 챕터 횟수는 더는 여기서 세지 않는다(capsule_auto_fill이 100%에 닿는 시점에 센다).
  -- 반환 키는 301과 모양을 맞춘다: TS(lib/capsule/open.ts)가 chapterNo·reachedChapters·chapterCount를 읽으므로 키를 지우면 2회차 전까지 깨진다.
  -- 세지 않았으므로 chapterNo는 null, reachedChapters는 빈 배열, chapterCount는 지금 값이다.
  SELECT uc.capsule_full_count INTO v_chapter_count FROM public.user_chapters uc WHERE uc.user_id = p_user_id;

  RETURN v_open || jsonb_build_object(
    'next', jsonb_build_object('required', v_next.required, 'filled', 0),
    'chapterNo', NULL,
    'reachedChapters', '[]'::jsonb,
    'chapterCount', v_chapter_count
  );
END;
$$;

COMMENT ON FUNCTION public.capsule_open_counted(UUID, JSONB) IS
  'capsule_open 뒤 같은 트랜잭션에서 다음 캡슐 필요량을 v2로 덮어쓰고 alert_stage를 0으로 돌린다. 챕터 횟수는 세지 않는다(capsule_auto_fill이 닿는 시점에 센다). 반환의 chapterNo는 null, reachedChapters는 [], chapterCount는 지금 값. ok=false면 capsule_open 결과 그대로. service_role 전용.';

-- ----------------------------------------------------------------
-- 6. capsule_hold_reward — 가득 찬 캡슐을 보류로 옮기고 새 캡슐을 만든다
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capsule_hold_reward(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap public.user_capsules;
  v_before INTEGER;
  v_slot SMALLINT;
  v_next RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  PERFORM public.capsule_get_or_create(p_user_id);
  SELECT * INTO v_cap FROM public.user_capsules WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'capsule_changed');
  END IF;
  IF v_cap.filled < v_cap.required THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_full', 'required', v_cap.required, 'filled', v_cap.filled);
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_before FROM public.capsule_pending_rewards WHERE user_id = p_user_id;
  IF v_before >= 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'pending_full', 'pendingCount', v_before);
  END IF;

  -- 가장 낮은 빈 slot(1 → 2). 보류는 이 캡슐 행 잠금 아래에서만 바뀌므로 UNIQUE(user_id, slot) 충돌은 나지 않는다.
  IF EXISTS (SELECT 1 FROM public.capsule_pending_rewards WHERE user_id = p_user_id AND slot = 1) THEN
    v_slot := 2;
  ELSE
    v_slot := 1;
  END IF;

  INSERT INTO public.capsule_pending_rewards (user_id, slot, chapter_no, fill_amount, reached_at)
    VALUES (p_user_id, v_slot, v_cap.chapter_no, v_cap.required, now());

  -- 새 캡슐: 같은 행을 초기화한다(capsule_open과 같다). 필요량·챕터는 v2, 알림 단계 0.
  SELECT * INTO v_next FROM public.capsule_next_required_v2(p_user_id);
  UPDATE public.user_capsules
     SET required = v_next.required, filled = 0, chapter_no = v_next.chapter_no, alert_stage = 0,
         created_at = now(), updated_at = now()
   WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'slot', v_slot,
    'pendingCount', v_before + 1,
    'blockedNow', (v_before = 1),
    'next', jsonb_build_object('required', v_next.required, 'filled', 0, 'chapterNo', v_next.chapter_no)
  );
END;
$$;

COMMENT ON FUNCTION public.capsule_hold_reward(UUID) IS
  '가득 찬 캡슐을 capsule_pending_rewards의 가장 낮은 빈 slot으로 옮기고 새 캡슐(v2, alert_stage 0)을 만든다. 가득 아니면 not_full, 보류가 이미 2개면 pending_full. blockedNow는 보류가 1개에서 2개가 된 호출만 true. service_role 전용.';

-- ----------------------------------------------------------------
-- 7. capsule_claim_pending — 보류 보상 한 줄을 받는다
--    추첨은 서버 코드가 받는 시점에 하고 p_items로 넘긴다(capsule_open과 같은 모양).
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

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_items');
  END IF;
  v_n := jsonb_array_length(p_items);
  IF v_n > v_max_items THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_items', 'max', v_max_items);
  END IF;

  -- 캡슐 행을 먼저 잠근다: 보류를 만들거나(hold) 소멸시키는(auto_fill) 호출과 직렬화한다. 캡슐 자체는 바꾸지 않는다.
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

  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;
  v_free := GREATEST(0, v_inv.max_slots - v_inv.used_slots);
  IF v_free < v_max_items THEN
    -- 아무것도 바꾸지 않는다. 보류는 그대로 남는다.
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
  '보류 보상 한 줄을 받는다: 정지 확인, 캡슐·보류·인벤토리 잠금, 빈칸이 guaranteed_count+bonus_count보다 적으면 아무것도 바꾸지 않고 insufficient_slots(free, needed). 충분하면 capsule_open과 같은 방식으로 지급·기록하고 그 보류 줄을 지운다. 반환의 pendingCount는 남은 보류 수. service_role 전용.';

-- ----------------------------------------------------------------
-- 8. 실행 권한 — service_role만
-- ----------------------------------------------------------------
REVOKE ALL ON FUNCTION public.capsule_auto_fill(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capsule_auto_fill(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capsule_auto_fill(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.capsule_open_counted(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capsule_open_counted(UUID, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capsule_open_counted(UUID, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.capsule_hold_reward(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capsule_hold_reward(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capsule_hold_reward(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.capsule_claim_pending(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capsule_claim_pending(UUID, UUID, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capsule_claim_pending(UUID, UUID, JSONB) TO service_role;

-- 되돌림 SQL
-- 이 함수·뷰·열을 쓰는 새 코드(2~3회차)를 먼저 되돌린다. 순서: 새 함수·뷰 삭제 → 교체한 두 함수를 301의 정의로 복원 → 열 삭제.
-- 알림 종류 값(capsule_nearly_full, capsule_jam_blocked)은 PostgreSQL이 enum 값 삭제를 지원하지 않아 남는다(쓰는 코드가 없으면 무해하다).
-- 이미 만들어진 알림 행이 있으면 필요에 따라 먼저 지운다(DELETE FROM public.notifications WHERE type IN ('capsule_nearly_full', 'capsule_jam_blocked')).
-- 이미 일어난 일은 남는다: capsule_forfeit 원장 줄(원장은 지우지 않는다. 300의 CHECK도 그대로라 문제없다), capsule_pending_rewards 줄(복원 전에
-- 보류를 받게 하거나 남은 줄의 처리를 정한다: 복원한 301에는 보류를 받는 길이 없다), 이 버전이 닿는 시점에 센 챕터 횟수(복원한 301은 열 때 다시 세므로,
-- 가득 찬 채 열리지 않은 캡슐은 한 번 더 세어진다).
-- DROP FUNCTION IF EXISTS public.capsule_claim_pending(UUID, UUID, JSONB);
-- DROP FUNCTION IF EXISTS public.capsule_hold_reward(UUID);
-- DROP VIEW IF EXISTS public.jam_forfeit_weekly;
-- 교체한 두 함수를 301로 복원한다: jam-web/supabase/migrations/301_capsule_auto_fill.sql의 «2. capsule_auto_fill»과 «3. capsule_open_counted»
-- CREATE OR REPLACE FUNCTION 블록(COMMENT ON FUNCTION 포함)을 그대로 다시 실행한다. 시그니처가 같아 DROP은 필요 없고, 권한(REVOKE/GRANT)은 CREATE OR REPLACE가 유지한다.
-- 복원 뒤에 열을 지운다(복원한 301 본문은 alert_stage를 쓰지 않는다):
-- ALTER TABLE public.user_capsules DROP COLUMN IF EXISTS alert_stage;
