-- 322_capsule_auto_fill_inventory_block.sql
-- 인벤토리 빈칸이 모자라 캡슐을 열 수 없으면 보관하지 않고 멈추도록, 자동 채움에서 소멸·단계 올림을 없앤다 (티켓 20261105_0103 T3, 상위 20261105_0100)
--
-- 이 파일은 «같은 시그니처 교체»다(db-migration-rules.md 1·3절). capsule_auto_fill(uuid)의 시그니처와 반환 타입(JSONB)이 302와 같아 DROP이 필요 없다.
--   - 없애는 것: 보류 수 읽기(v_pending), «보류 2개면 지갑 잼 전액 소멸(capsule_forfeit)» 분기, «보류 1개일 때 alert_stage 올림» 블록.
--   - 그대로 두는 것: 정지 확인, 캡슐 행 잠금, filled=0일 때 필요량 v2 맞춤, 잔액 읽기, 남은 양과 잔액 중 작은 만큼 채움, 챕터 횟수 +1과 오름 판정.
--   - 응답 키는 모두 유지하고 값만 고정한다: forfeited = 0, pendingCount = 0, alertStage = null. 키 제거는 T6(축소)에서 한다.
--     배포 구간에 옛 코드가 같은 키를 읽어도 깨지지 않게 하기 위해서다.
--   - 건드리지 않는 것: capsule_hold_reward·capsule_claim_pending(T4가 정리한다), 표 capsule_pending_rewards, 원장 사유 capsule_forfeit, 뷰 jam_forfeit_weekly,
--     user_capsules.alert_stage 칸, capsule_open_counted.
--
-- 시작 확인: 보류 표에 행이 있으면 예외로 중단한다. 이 함수는 더는 보류를 읽지 않으므로, 행이 남은 채 적용하면 보류가 조용히 무시된다.
--   티켓이 적은 읽은 값: capsule_pending_rewards 0행, jam_transactions의 reason='capsule_forfeit' 0줄, user_capsules.alert_stage <> 0 0행.
--
-- 🚨 적용 순서: 이 DDL → 새 코드 배포. 적용 뒤 새 코드 배포 전까지 옛 코드가 capsule_hold_reward로 보관을 만들 수 있으나,
--    이 함수는 보류를 읽지 않으므로 소멸은 일어나지 않는다(보류 행은 T4가 정리한다).
--
-- 적용 후 확인(읽기 전용)
--   SELECT pg_get_functiondef('public.capsule_auto_fill(uuid)'::regprocedure) NOT LIKE '%capsule_forfeit%';       -- true
--   SELECT count(*) FROM public.jam_transactions WHERE reason = 'capsule_forfeit' AND created_at > now() - interval '1 day'; -- 0
-- 롤백 실측: DO 블록에서 적용 → 막힌 상황의 호출(잔액·원장 불변) → 되돌림 → 본문 해시 대조 → RAISE EXCEPTION으로 전부 취소.
-- 되돌림: 같은 번호의 322_capsule_auto_fill_inventory_block_down.sql

DO $$
DECLARE
  v_pending BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_pending FROM public.capsule_pending_rewards;
  IF v_pending <> 0 THEN
    RAISE EXCEPTION 'capsule_pending_rewards에 % 행이 남아 있어 적용을 중단한다(보류를 먼저 정리해야 한다)', v_pending;
  END IF;
END
$$;

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
