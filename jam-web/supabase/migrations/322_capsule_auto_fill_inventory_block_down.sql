-- 322_capsule_auto_fill_inventory_block_down.sql
-- 322_capsule_auto_fill_inventory_block.sql의 되돌림 — capsule_auto_fill(uuid)을 302 본문(136~280줄)으로 그대로 복원한다.
-- 먼저 jam-web의 auto-fill.ts가 보관(capsule_hold_reward)을 부르는 옛 코드로 돌아가 있어야 한다.
-- 시그니처·반환 타입이 같으므로 DROP은 필요 없다(CREATE OR REPLACE, 권한은 유지된다).

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
