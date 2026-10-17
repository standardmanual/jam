-- 222_item_book_tiers.sql
-- JAM 2.0 컬렉션 4등급 구조의 저장 구조 (티켓 20261016_2340, 운영 로직 8.3절)
--
-- 칸 1개(item_books.tier_mode), 새 테이블 3개(item_book_tier_rewards, item_book_tier_default_rewards,
-- user_item_book_tier_completions), 새 함수 2개(slot_item_into_book_tiered, swap_item_in_book_tiered)만 추가한다.
-- 기존 객체(slot_item_into_book, swap_item_in_book, unslot_item_from_book, user_item_book_completions,
-- item_books.reward_points·reward_badge_id)는 건드리지 않는다. 옛 것을 지우는 축소는 묶음 6의 전환 단계에서 한다.
-- 완성 판정 모듈 통일(회차 2), 새 장착 경로와 API 호환(회차 3), 컬렉션 화면·잠금·등급 올리기 레시피(묶음 3),
-- 챕터 점수 연결(묶음 5), 어드민 화면(묶음 7)은 이 파일의 범위가 아니다.
--
-- 규칙
--   - 같은 컬렉션(badges.item_book_id) 안에서 이름(badges.name)이 같은 아이템 배지 4장(등급 4개)을 한 칸으로 본다. 새 테이블 없음.
--   - 컬렉션 등급은 저장하지 않는다. 그 유저가 그 컬렉션에 지금 꽂아 둔 배지의 등급(badges.rarity)이 곧 컬렉션 등급이고,
--     다 빼면 저절로 풀린다.
--   - 새 규칙은 item_books.tier_mode = true인 컬렉션에만 적용한다. 꺼진 컬렉션은 새 함수가 거절하고(tier_mode_off)
--     옛 함수는 이전과 같이 동작한다. 프로덕션 코드는 지금 옛 함수를 부르므로 옛 함수는 바꾸지 않는다.
--   - 등급별 완성 기록과 보상은 새 테이블에 둔다. 완성은 (유저, 컬렉션, 등급)마다 한 번만 기록하고 보상도 한 번만 나간다.
--   - 장착을 풀어도 완성 기록은 남고, 다시 채워도 같은 등급 보상은 나가지 않는다(기록의 키가 막는다).
--   - 장착 해제는 옛 unslot_item_from_book을 그대로 쓴다(슬롯 행만 지우고 완성 기록은 건드리지 않아 새 구조와도 맞는다).
--
-- 가정 (카리나가 정했고 SQL 실행 승인 전에 다시 확인한다)
--   - 등급별 보상 기본값: 컬렉션·등급 행이 없거나 reward_points가 비어 있으면 item_book_tier_default_rewards를 쓴다
--     (커먼 100, 레어 200, 에픽 400, 미스틱 800, 운영 로직 8.6절). 0이면 지급을 생략한다. 보상 배지는 컬렉션·등급마다 정하며
--     없으면 주지 않는다.
--   - 보상 배지 지급: 옛 장착 함수는 SQL 안에서 보상 배지를 주지 않고(완성 포인트까지만) 앱 코드가 완성 기록을 보고
--     issueItemBookRewardBadges로 따로 준다. 새 함수도 같은 방식이라 보상 배지는 item_book_tier_rewards에 정해 두기만 하고,
--     실제 지급은 회차 3의 코드가 한다. 그래서 반환값에 새로 완성된 등급(completed_tier)을 싣는다.
--   - 등급별 완성의 분모: 그 컬렉션에서 그 등급의 아이템 배지가 있는 이름 수. 옛 함수(179)와 같은 방식으로 드랍 제외
--     (drop_excluded)·소프트 삭제(deleted_at) 배지를 뺀다. 그 등급의 배지가 전부 드랍 제외이면 제외 여부와 무관하게
--     소프트 삭제되지 않은 배지 전체를 센다(179의 예외와 같다). 코드에 9를 박지 않는다.
--   - 교환(swap_item_in_book_tiered): 새 구조 컬렉션에서는 같은 등급끼리만 바꿀 수 있다(다른 등급이면 tier_mismatch).
--     옛 함수처럼 같은 배지의 다른 개체로만 바꾸므로(wrong_badge) 이름 칸은 그대로고 완성에는 영향이 없다.
--     정책 문서에 없어 이 방식으로 정했다.
--   - 잠긴 아이템 배지는 꽂을 수 없다. 잠김 자체는 묶음 3이라 지금은 검사 자리(주석)만 둔다.
--
-- 시그니처는 확정이다. 인자 수를 바꾸려면 옛 시그니처를 먼저 DROP해야 한다(db-migration-rules.md 3절).
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT proname, pronargs, prosecdef FROM pg_proc
--    WHERE proname IN ('slot_item_into_book_tiered', 'swap_item_in_book_tiered');   -- 각 1행
--   SELECT tier, reward_points FROM public.item_book_tier_default_rewards ORDER BY reward_points;   -- 4행
--   SELECT count(*) FILTER (WHERE tier_mode) FROM public.item_books;                                -- 0

-- ----------------------------------------------------------------
-- 1. item_books.tier_mode — 새 구조를 켜는 컬렉션의 표시 칸 (기본 false)
-- ----------------------------------------------------------------
ALTER TABLE public.item_books
  ADD COLUMN IF NOT EXISTS tier_mode BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.item_books.tier_mode IS
  '4등급 구조(같은 이름 4등급 한 칸, 등급별 완성·보상)를 쓰는 컬렉션이면 true. 기본 false는 옛 규칙. slot_item_into_book_tiered/swap_item_in_book_tiered는 true인 컬렉션에서만 동작한다.';

-- ----------------------------------------------------------------
-- 2. item_book_tier_rewards — 컬렉션·등급별 보상. 행이 없거나 reward_points가 NULL이면 기본값을 쓴다. 서버 전용.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_book_tier_rewards (
  item_book_id UUID NOT NULL REFERENCES public.item_books(id) ON DELETE CASCADE,
  tier public.badge_rarity NOT NULL,
  reward_points INTEGER CHECK (reward_points IS NULL OR reward_points >= 0),   -- NULL이면 기본값
  reward_badge_id UUID REFERENCES public.badges(id) ON DELETE SET NULL,        -- NULL이면 보상 배지 없음
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_book_id, tier)
);

ALTER TABLE public.item_book_tier_rewards ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.item_book_tier_rewards IS
  '컬렉션·등급별 완성 보상. (item_book_id, tier)가 키. reward_points가 NULL이면 item_book_tier_default_rewards, reward_badge_id가 NULL이면 보상 배지 없음. 서버(service role)만 읽고 쓴다.';

-- ----------------------------------------------------------------
-- 3. item_book_tier_default_rewards — 등급별 기본 보상 포인트(설정 행). 서버 전용.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_book_tier_default_rewards (
  tier public.badge_rarity PRIMARY KEY,
  reward_points INTEGER NOT NULL CHECK (reward_points >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.item_book_tier_default_rewards ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.item_book_tier_default_rewards IS
  '등급별 기본 완성 보상 포인트. item_book_tier_rewards에 행이 없거나 reward_points가 NULL인 컬렉션이 쓴다. 값 변경에 마이그레이션이 필요 없다. 서버(service role)만 읽고 쓴다.';

-- ----------------------------------------------------------------
-- 4. user_item_book_tier_completions — 등급별 완성 기록 (장착을 풀어도 남는다)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_item_book_tier_completions (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_book_id UUID NOT NULL REFERENCES public.item_books(id) ON DELETE CASCADE,
  tier public.badge_rarity NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_book_id, tier)
);

ALTER TABLE public.user_item_book_tier_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_item_book_tier_completions_select_own ON public.user_item_book_tier_completions;
CREATE POLICY user_item_book_tier_completions_select_own ON public.user_item_book_tier_completions
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_item_book_tier_completions IS
  '등급별 컬렉션 완성 기록. (user_id, item_book_id, tier)가 키라 같은 등급은 한 번만 기록되고 보상도 한 번만 나간다. 장착 해제로 지우지 않는다. slot_item_into_book_tiered()로만 쓴다.';

-- 클라이언트 역할의 직접 쓰기 권한도 회수한다(RLS 정책 부재에 더한 이중 차단).
REVOKE ALL ON public.item_book_tier_rewards FROM anon, authenticated;
REVOKE ALL ON public.item_book_tier_default_rewards FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_item_book_tier_completions FROM anon, authenticated;

-- ----------------------------------------------------------------
-- 5. 초기값 (운영 로직 8.6절). 다시 실행해도 중복이 생기지 않는다.
-- ----------------------------------------------------------------
INSERT INTO public.item_book_tier_default_rewards (tier, reward_points) VALUES
  ('common', 100),
  ('rare',   200),
  ('epic',   400),
  ('mystic', 800)
ON CONFLICT (tier) DO NOTHING;

-- ----------------------------------------------------------------
-- 6. slot_item_into_book_tiered() — 새 구조 컬렉션 장착
--    179의 검사·반환 모양·부수 효과(칸 반환, custody 기록)를 그대로 따르고 새 규칙만 더한다:
--    ①tier_mode가 꺼져 있으면 거절(tier_mode_off) ②이미 꽂힌 배지와 등급이 다르면 거절(tier_mismatch)
--    ③완성은 그 등급의 이름 칸을 모두 채웠는지로 판정해 user_item_book_tier_completions에 한 번만 기록하고 포인트도 한 번만 준다.
--    반환: ok, slot, tier(꽂은 배지의 등급), completed_tier(이번 장착으로 새로 완성한 등급, 아니면 NULL).
--    새 에러 코드: item_book_not_found, tier_mode_off, tier_mismatch.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.slot_item_into_book_tiered(
  p_user_id           UUID,
  p_item_book_id      UUID,
  p_inventory_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier_mode        BOOLEAN;
  v_inv              RECORD;
  v_item             RECORD;
  v_badge            RECORD;
  v_slot             RECORD;
  v_username         TEXT;
  v_total_names      INTEGER;
  v_slotted_names    INTEGER;
  v_reward_points    INTEGER;
  v_newly_completed  INTEGER;
  v_completed_tier   public.badge_rarity := NULL;
BEGIN
  SELECT tier_mode INTO v_tier_mode FROM public.item_books WHERE id = p_item_book_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_book_not_found');
  END IF;
  IF NOT v_tier_mode THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'tier_mode_off');
  END IF;

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

  -- 개체 정체성 모델(108): 드랍됨 = inventory_id가 NULL
  IF v_item.inventory_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_dropped');
  END IF;

  IF v_item.inventory_id IS DISTINCT FROM v_inv.id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_owner');
  END IF;

  IF v_item.slotted_in IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_slotted');
  END IF;

  SELECT id, item_book_id, name, rarity INTO v_badge FROM public.badges WHERE id = v_item.badge_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'badge_not_found');
  END IF;

  IF v_badge.item_book_id IS DISTINCT FROM p_item_book_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'wrong_item_book');
  END IF;

  -- (자리만) 잠긴 아이템 배지는 꽂을 수 없다. 잠김 상태는 묶음 3에서 만들며, 그때 여기에 검사를 넣는다.

  -- 컬렉션 등급은 저장하지 않는다: 이미 꽂힌 배지 중 하나라도 등급이 다르면 거절한다.
  -- 다 비어 있으면 이 배지의 등급이 컬렉션 등급이 된다. 유저 인벤토리 행을 이미 잠갔으므로 같은 유저의 동시 장착은 순서대로 처리된다.
  IF EXISTS (
    SELECT 1
    FROM public.user_item_book_slots s
    JOIN public.badges sb ON sb.id = s.badge_id
    WHERE s.user_id = p_user_id AND s.item_book_id = p_item_book_id
      AND sb.rarity IS DISTINCT FROM v_badge.rarity
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'tier_mismatch');
  END IF;

  BEGIN
    INSERT INTO public.user_item_book_slots (user_id, item_book_id, badge_id, inventory_item_id)
    VALUES (p_user_id, p_item_book_id, v_item.badge_id, p_inventory_item_id)
    RETURNING * INTO v_slot;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'slot_insert_failed');
  END;

  UPDATE public.inventory_items SET slotted_in = v_slot.id WHERE id = p_inventory_item_id;

  -- 컬렉션에 들어간 아이템은 인벤토리 칸을 차지하지 않음 — 칸 반환
  UPDATE public.inventory SET used_slots = GREATEST(0, v_inv.used_slots - 1) WHERE id = v_inv.id;

  SELECT username INTO v_username FROM public.users WHERE id = p_user_id;
  INSERT INTO public.custody_events (inventory_item_id, event_type, actor_user_id, actor_username)
  VALUES (p_inventory_item_id, 'Slot', p_user_id, v_username);

  -- 완성 체크: 이 등급(v_badge.rarity)의 이름 칸 수가 분모, 이 유저가 꽂은 같은 등급의 서로 다른 이름 수가 분자.
  -- 분모에서 소프트 삭제·드랍 제외 배지를 뺀다. 그 등급 배지가 전부 드랍 제외이면 제외 여부와 무관하게 센다(179와 같은 예외).
  SELECT COUNT(DISTINCT name) INTO v_total_names
  FROM public.badges
  WHERE item_book_id = p_item_book_id AND rarity = v_badge.rarity
    AND deleted_at IS NULL AND drop_excluded = false;

  IF v_total_names > 0 THEN
    SELECT COUNT(DISTINCT b.name) INTO v_slotted_names
    FROM public.user_item_book_slots s
    JOIN public.badges b ON b.id = s.badge_id
    WHERE s.user_id = p_user_id AND s.item_book_id = p_item_book_id
      AND b.item_book_id = p_item_book_id AND b.rarity = v_badge.rarity
      AND b.deleted_at IS NULL AND b.drop_excluded = false;
  ELSE
    SELECT COUNT(DISTINCT name) INTO v_total_names
    FROM public.badges
    WHERE item_book_id = p_item_book_id AND rarity = v_badge.rarity AND deleted_at IS NULL;

    SELECT COUNT(DISTINCT b.name) INTO v_slotted_names
    FROM public.user_item_book_slots s
    JOIN public.badges b ON b.id = s.badge_id
    WHERE s.user_id = p_user_id AND s.item_book_id = p_item_book_id
      AND b.item_book_id = p_item_book_id AND b.rarity = v_badge.rarity AND b.deleted_at IS NULL;
  END IF;

  IF v_total_names > 0 AND v_slotted_names >= v_total_names THEN
    INSERT INTO public.user_item_book_tier_completions (user_id, item_book_id, tier)
    VALUES (p_user_id, p_item_book_id, v_badge.rarity)
    ON CONFLICT (user_id, item_book_id, tier) DO NOTHING;

    -- 실제로 새 행이 들어간 경우(그 등급의 최초 완성)에만 지급한다. 풀었다 다시 채운 경우는 지급하지 않는다.
    GET DIAGNOSTICS v_newly_completed = ROW_COUNT;

    IF v_newly_completed > 0 THEN
      v_completed_tier := v_badge.rarity;

      SELECT COALESCE(r.reward_points, d.reward_points) INTO v_reward_points
      FROM (SELECT 1) AS one
      LEFT JOIN public.item_book_tier_rewards r
        ON r.item_book_id = p_item_book_id AND r.tier = v_badge.rarity
      LEFT JOIN public.item_book_tier_default_rewards d
        ON d.tier = v_badge.rarity;

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

  RETURN jsonb_build_object(
    'ok', TRUE,
    'slot', to_jsonb(v_slot),
    'tier', v_badge.rarity,
    'completed_tier', v_completed_tier
  );
END;
$$;

COMMENT ON FUNCTION public.slot_item_into_book_tiered IS
  '4등급 구조(tier_mode=true) 컬렉션 장착. 179의 검사에 tier_mode_off·tier_mismatch를 더하고, 그 등급의 이름 칸을 모두 채우면 등급별 완성 기록과 포인트를 한 번만 준다. 반환: ok, slot, tier, completed_tier. 보상 배지는 주지 않는다(앱 코드가 지급). 서버(service role)에서만 호출.';

-- ----------------------------------------------------------------
-- 7. swap_item_in_book_tiered() — 새 구조 컬렉션 교환
--    151의 검사·반환 모양을 그대로 따르고 ①tier_mode가 꺼져 있으면 거절(tier_mode_off)
--    ②새 개체의 등급이 슬롯 배지의 등급과 다르면 거절(tier_mismatch, wrong_badge보다 먼저 판정)을 더한다.
--    같은 배지의 다른 개체로만 바꾸므로 슬롯 구성·완성 기록은 달라지지 않는다.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swap_item_in_book_tiered(
  p_user_id               UUID,
  p_item_book_id          UUID,
  p_slot_id               UUID,
  p_new_inventory_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier_mode  BOOLEAN;
  v_slot       RECORD;
  v_new_item   RECORD;
  v_old_item   RECORD;
  v_slot_tier  public.badge_rarity;
  v_new_tier   public.badge_rarity;
  v_username   TEXT;
BEGIN
  SELECT tier_mode INTO v_tier_mode FROM public.item_books WHERE id = p_item_book_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_book_not_found');
  END IF;
  IF NOT v_tier_mode THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'tier_mode_off');
  END IF;

  SELECT * INTO v_slot
  FROM public.user_item_book_slots
  WHERE id = p_slot_id AND user_id = p_user_id AND item_book_id = p_item_book_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'slot_not_found');
  END IF;

  SELECT * INTO v_new_item FROM public.inventory_items WHERE id = p_new_inventory_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  IF v_new_item.destroyed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  IF v_new_item.inventory_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_dropped');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory
    WHERE id = v_new_item.inventory_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_owner');
  END IF;

  IF v_new_item.slotted_in IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_slotted');
  END IF;

  -- 새 구조에서는 같은 등급끼리만 바꾼다. 등급을 바꾸려면 빼고 다시 꽂는다.
  SELECT rarity INTO v_slot_tier FROM public.badges WHERE id = v_slot.badge_id;
  SELECT rarity INTO v_new_tier FROM public.badges WHERE id = v_new_item.badge_id;
  IF v_new_tier IS DISTINCT FROM v_slot_tier THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'tier_mismatch');
  END IF;

  -- 교체는 같은 배지의 다른 개체로만 허용한다 — 슬롯의 badge_id 자체를 바꾸지 않는다.
  IF v_new_item.badge_id IS DISTINCT FROM v_slot.badge_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'wrong_badge');
  END IF;

  IF v_new_item.id = v_slot.inventory_item_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'same_item');
  END IF;

  SELECT * INTO v_old_item FROM public.inventory_items WHERE id = v_slot.inventory_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  UPDATE public.inventory_items SET slotted_in = NULL WHERE id = v_old_item.id;
  UPDATE public.inventory_items SET slotted_in = p_slot_id WHERE id = p_new_inventory_item_id;

  UPDATE public.user_item_book_slots
  SET inventory_item_id = p_new_inventory_item_id, slotted_at = NOW()
  WHERE id = p_slot_id
  RETURNING * INTO v_slot;

  SELECT username INTO v_username FROM public.users WHERE id = p_user_id;
  INSERT INTO public.custody_events (inventory_item_id, event_type, actor_user_id, actor_username)
  VALUES (v_old_item.id, 'Unslot', p_user_id, v_username);
  INSERT INTO public.custody_events (inventory_item_id, event_type, actor_user_id, actor_username)
  VALUES (p_new_inventory_item_id, 'Slot', p_user_id, v_username);

  RETURN jsonb_build_object('ok', TRUE, 'slot', to_jsonb(v_slot));
END;
$$;

COMMENT ON FUNCTION public.swap_item_in_book_tiered IS
  '4등급 구조(tier_mode=true) 컬렉션 교환. 151의 검사에 tier_mode_off·tier_mismatch를 더했다. 같은 배지의 다른 개체로만 바꾸므로 완성 기록은 달라지지 않는다. 서버(service role)에서만 호출.';

-- 클라이언트(anon/authenticated)가 RPC로 장착·교환을 조작하지 못하도록 실행 권한 회수. service_role만 호출 가능.
REVOKE ALL ON FUNCTION public.slot_item_into_book_tiered(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.slot_item_into_book_tiered(UUID, UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.slot_item_into_book_tiered(UUID, UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.swap_item_in_book_tiered(UUID, UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.swap_item_in_book_tiered(UUID, UUID, UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.swap_item_in_book_tiered(UUID, UUID, UUID, UUID) TO service_role;

-- 되돌림 SQL
-- 새로 만든 객체만 지운다. 등급별 완성 기록이 함께 사라지므로, 운영 데이터가 생긴 뒤에는 백업 후 실행한다.
-- DROP FUNCTION IF EXISTS public.swap_item_in_book_tiered(UUID, UUID, UUID, UUID);
-- DROP FUNCTION IF EXISTS public.slot_item_into_book_tiered(UUID, UUID, UUID);
-- DROP TABLE IF EXISTS public.user_item_book_tier_completions;
-- DROP TABLE IF EXISTS public.item_book_tier_default_rewards;
-- DROP TABLE IF EXISTS public.item_book_tier_rewards;
-- ALTER TABLE public.item_books DROP COLUMN IF EXISTS tier_mode;
