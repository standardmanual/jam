-- ============================================================
-- Migration 157: 컬렉션(아이템북) 완성 시 포인트 지급
--
-- 티켓: 20260911_1259
--
-- 배경(요약 — 티켓 문서 참고):
--   잼 포인트는 지금까지 ①배지 발급(badges.point_reward) ②미션 완료
--   (missions.reward_points) ③운영자 수동 지급/회수, 세 경로로만 지급됐다
--   (Service Plan/Specs/PRD/PointSystem/OBJECT_MODEL.md). 컬렉션(아이템북) 완성은
--   지급 트리거 목록에 없었다 — slot_item_into_book() RPC(마이그레이션 111)가
--   완성 판정 시 user_item_book_completions에 완성 기록만 INSERT할 뿐
--   award_points() 호출이 없었다.
--
-- 이 마이그레이션이 하는 일:
--   1. item_books.reward_points 컬럼 추가 — badges.point_reward와 동일한
--      명명·기본값·CHECK 규칙(0이면 지급 없음, DEFAULT 0이라 소급 지급 없음).
--   2. point_transactions.source_item_book_id 컬럼 추가 — source_badge_id/
--      source_mission_id와 동일한 출처 추적 패턴.
--   3. point_transactions_reason_check에 'item_book_completion_point_reward' 추가
--      (마이그레이션 153이 combine_* 사유를 추가한 것과 동일한 패턴).
--   4. award_points() RPC에 p_source_item_book_id UUID DEFAULT NULL 파라미터 추가
--      (기존 파라미터 순서 뒤에 추가 — Postgres CREATE OR REPLACE FUNCTION은 기존
--      파라미터를 그대로 두고 DEFAULT 있는 신규 파라미터를 끝에 추가하는 것을
--      허용하므로 기존 호출부(배지·미션·믹스 지급 경로)는 그대로 동작한다).
--   5. slot_item_into_book() RPC 재정의 — 완성 판정 INSERT ... ON CONFLICT DO NOTHING이
--      실제로 새로 완성된 순간(row가 삽입된 경우)에만 GET DIAGNOSTICS로 판별해
--      award_points()를 호출한다. 이미 완성된 컬렉션에 재슬롯 등으로 재진입해
--      ON CONFLICT가 아무 것도 하지 않은 경우에는 중복 지급하지 않는다.
--      item_books.reward_points가 0이면 지급 자체를 생략한다(배지 패턴과 동일).
--
--   소급 지급 없음 — 이 마이그레이션 배포 전에 이미 user_item_book_completions에
--   쌓여 있는 기존 완성 기록에는 소급 지급하지 않는다(OBJECT_MODEL.md 원칙과 동일).
-- ============================================================

-- ----------------------------------------------------------------
-- 1. item_books.reward_points 컬럼 추가
--    이미 완성된 기록은 소급 지급 없음(ALTER 시 DEFAULT 0으로 채워짐).
-- ----------------------------------------------------------------
ALTER TABLE public.item_books
  ADD COLUMN IF NOT EXISTS reward_points INTEGER NOT NULL DEFAULT 0 CHECK (reward_points >= 0);

COMMENT ON COLUMN public.item_books.reward_points IS
  '이 컬렉션이 완성될 때 함께 지급하는 잼 포인트. 0이면 포인트 없음. 완성 후 값이 바뀌어도 이미 지급된 포인트는 소급 변경되지 않음(완성 시점 값으로 1회 지급).';

-- ----------------------------------------------------------------
-- 2. point_transactions.source_item_book_id 컬럼 추가
-- ----------------------------------------------------------------
ALTER TABLE public.point_transactions
  ADD COLUMN IF NOT EXISTS source_item_book_id UUID REFERENCES public.item_books(id);

-- ----------------------------------------------------------------
-- 3. reason CHECK 제약에 'item_book_completion_point_reward' 추가
-- ----------------------------------------------------------------
ALTER TABLE public.point_transactions DROP CONSTRAINT IF EXISTS point_transactions_reason_check;
ALTER TABLE public.point_transactions ADD CONSTRAINT point_transactions_reason_check CHECK (reason IN (
  'badge_point_reward',
  'mission_point_reward',
  'admin_grant',
  'admin_deduct',
  'combine_fail_reward',
  'combine_recipe_reward',
  'item_book_completion_point_reward'
));

-- ----------------------------------------------------------------
-- 4. award_points() — p_source_item_book_id 파라미터 추가(기존 파라미터 뒤,
--    DEFAULT NULL) — 기존 호출부(배지·미션·믹스 지급)는 그대로 동작한다.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_points(
  p_user_id UUID,
  p_amount INTEGER,              -- 양수=적립, 음수=차감
  p_reason TEXT,
  p_source_badge_id UUID DEFAULT NULL,
  p_source_mission_id UUID DEFAULT NULL,
  p_admin_reason_label TEXT DEFAULT NULL,
  p_admin_reason_note TEXT DEFAULT NULL,
  p_source_item_book_id UUID DEFAULT NULL
) RETURNS public.point_transactions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.point_transactions;
BEGIN
  INSERT INTO public.point_transactions
    (user_id, amount, reason, source_badge_id, source_mission_id, admin_reason_label, admin_reason_note, source_item_book_id)
  VALUES
    (p_user_id, p_amount, p_reason, p_source_badge_id, p_source_mission_id, p_admin_reason_label, p_admin_reason_note, p_source_item_book_id)
  RETURNING * INTO v_tx;

  INSERT INTO public.point_wallets (user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.point_wallets.balance + p_amount, updated_at = now();

  IF p_amount > 0 THEN
    UPDATE public.point_treasury SET total_minted = total_minted + p_amount, updated_at = now() WHERE id = 1;
  ELSE
    UPDATE public.point_treasury SET total_reclaimed = total_reclaimed + (-p_amount), updated_at = now() WHERE id = 1;
  END IF;

  RETURN v_tx;
END;
$$;

COMMENT ON FUNCTION public.award_points IS
  '잼 포인트 잔액 변경의 유일한 경로. 원장 삽입 + 잔액 갱신 + treasury 집계를 원자적으로 처리. 서버(service role)에서만 호출.';

-- 신규 시그니처(8개 인자)에 대한 실행 권한 — service_role만 호출 가능(서버 경로 전용).
REVOKE ALL ON FUNCTION public.award_points(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_points(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_points(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT, UUID) TO service_role;

-- ----------------------------------------------------------------
-- 5. slot_item_into_book() 재정의 — 완성 최초 판정 시에만 award_points() 호출
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.slot_item_into_book(
  p_user_id           UUID,
  p_item_book_id      UUID,
  p_inventory_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inv              RECORD;
  v_item             RECORD;
  v_badge            RECORD;
  v_slot             RECORD;
  v_username         TEXT;
  v_total_badges     INTEGER;
  v_slotted_count    INTEGER;
  v_reward_points    INTEGER;
  v_newly_completed  INTEGER;
BEGIN
  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;

  SELECT * INTO v_item FROM public.inventory_items WHERE id = p_inventory_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  IF v_item.destroyed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  -- 개체 정체성 모델(108)에서 "드랍됨"은 inventory_id가 NULL로 비는 것으로 표현된다.
  -- NULL이면 현재 아무도 소유하지 않은(드랍된) 개체 — "본인 소유 아님"과는 구분해
  -- 기존 409 "이미 드랍된 아이템입니다." 응답을 정확히 복원한다.
  IF v_item.inventory_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_dropped');
  END IF;

  IF v_item.inventory_id IS DISTINCT FROM v_inv.id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_owner');
  END IF;

  IF v_item.slotted_in IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_slotted');
  END IF;

  SELECT id, item_book_id INTO v_badge FROM public.badges WHERE id = v_item.badge_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'badge_not_found');
  END IF;

  IF v_badge.item_book_id IS DISTINCT FROM p_item_book_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'wrong_item_book');
  END IF;

  BEGIN
    INSERT INTO public.user_item_book_slots (user_id, item_book_id, badge_id, inventory_item_id)
    VALUES (p_user_id, p_item_book_id, v_item.badge_id, p_inventory_item_id)
    RETURNING * INTO v_slot;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'slot_insert_failed');
  END;

  UPDATE public.inventory_items SET slotted_in = v_slot.id WHERE id = p_inventory_item_id;

  -- 아이템북에 들어간 아이템은 인벤토리 칸을 더 이상 차지하지 않음 — 칸 반환
  UPDATE public.inventory SET used_slots = GREATEST(0, v_inv.used_slots - 1) WHERE id = v_inv.id;

  SELECT username INTO v_username FROM public.users WHERE id = p_user_id;
  INSERT INTO public.custody_events (inventory_item_id, event_type, actor_user_id, actor_username)
  VALUES (p_inventory_item_id, 'Slot', p_user_id, v_username);

  -- 완성 체크: 이 아이템북에 필요한 배지 수 vs 현재 슬롯 수 (기존 route.ts와 동일 기준 —
  -- item_books.is_active 여부와 무관하게 badges.item_book_id + deleted_at IS NULL만 본다)
  SELECT COUNT(*) INTO v_total_badges
  FROM public.badges WHERE item_book_id = p_item_book_id AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_slotted_count
  FROM public.user_item_book_slots WHERE user_id = p_user_id AND item_book_id = p_item_book_id;

  IF v_total_badges > 0 AND v_slotted_count >= v_total_badges THEN
    INSERT INTO public.user_item_book_completions (user_id, item_book_id)
    VALUES (p_user_id, p_item_book_id)
    ON CONFLICT (user_id, item_book_id) DO NOTHING;

    -- ON CONFLICT DO NOTHING이 실제로 새 행을 삽입한 경우(최초 완성)에만 지급한다.
    -- 이미 완성돼 있던 컬렉션에 재슬롯 등으로 재진입해 아무 것도 삽입되지 않은 경우는
    -- 중복 지급하지 않는다.
    GET DIAGNOSTICS v_newly_completed = ROW_COUNT;

    IF v_newly_completed > 0 THEN
      SELECT reward_points INTO v_reward_points FROM public.item_books WHERE id = p_item_book_id;

      IF v_reward_points IS NOT NULL AND v_reward_points > 0 THEN
        PERFORM public.award_points(
          p_user_id,
          v_reward_points,
          'item_book_completion_point_reward',
          NULL,
          NULL,
          NULL,
          NULL,
          p_item_book_id
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'slot', to_jsonb(v_slot));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.slot_item_into_book(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.slot_item_into_book(uuid, uuid, uuid) TO service_role;
