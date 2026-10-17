-- 232_capsule_storage_and_fill.sql
-- JAM 2.0 캡슐의 저장, 설정, 채우기 (티켓 20261018_0052 1회, 운영 로직 5.2·5.4절)
--
-- 전부 덧붙이기다. 새 테이블 셋(user_capsules, capsule_opens, capsule_chapter_costs), 새 설정 표 하나(capsule_policy 한 행),
-- user_drop_state의 새 칸 하나, 새 함수 둘(capsule_get_or_create, capsule_fill)이다. 옛 테이블·옛 함수·옛 칸의 뜻은 바꾸지 않는다.
-- 옛 프로덕션 코드는 새 객체를 쓰지 않는다. 열기(추첨 결과 지급, 다음 캡슐 생성, 기록)는 2회 마이그레이션이 만든다.
--
-- 규칙(운영 로직 5.2절)
--   - 유저마다 캡슐은 하나이고 언제나 있다(처음 필요할 때 만든다). 필요량은 캡슐이 생길 때 정해 고정한다.
--     챕터가 있으면 그 챕터의 양(capsule_chapter_costs), 챕터가 없으면(퀘스트 전) capsule_policy.pre_quest_fill_amount(5)다.
--     챕터가 표의 마지막보다 높으면 마지막 행의 양을 쓴다.
--   - 채우기: 기본값은 남은 양이다. 가진 잼이 모자라면 가진 만큼 전부 채운다. 남은 양보다 많이 채울 수 없다. 채운 잼은 꺼낼 수 없다.
--     채울 때마다 jam_apply(capsule_fill, 음수) 한 줄과 캡슐 갱신이 한 트랜잭션이다. 이용 정지 중에는 채울 수 없다(함수가 한 번 더 막는다).
--   - capsule_policy: 개수·확률·보정·퀘스트 전 값은 한 행의 설정이다. 등급 확률의 합계는 100이다. Common 연속 보정(10번)과 잠길 확률은
--     jam_policy(226·227·231)의 값을 동기화와 함께 쓰므로 여기서 중복하지 않는다.
--   - capsule_opens: 열 때마다 한 줄(연 시각, 그때의 챕터, 채운 양, 나온 개체 목록). 2회의 열기 함수가 쓴다.
--   - user_drop_state.capsule_epic_miss: Epic 이상이 나오지 않은 채 연 횟수(보정 1). 2회의 열기 함수가 갱신한다.
--   - 클라이언트 정책 없음(RLS만 켠다). 서버(service_role)만 읽고 쓴다. 함수도 service_role만 실행한다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT count(*) FROM public.user_capsules;                                                -- 0
--   SELECT count(*) FROM public.capsule_chapter_costs;                                        -- 10
--   SELECT * FROM public.capsule_policy;                                                      -- 1행
--   SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('capsule_get_or_create','capsule_fill');   -- 2행, true
--   SELECT has_function_privilege('authenticated', 'public.capsule_fill(uuid, integer)', 'EXECUTE');    -- false

-- (1) 설정 행
CREATE TABLE IF NOT EXISTS public.capsule_policy (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  guaranteed_count INTEGER NOT NULL DEFAULT 1 CHECK (guaranteed_count >= 0),
  bonus_count INTEGER NOT NULL DEFAULT 1 CHECK (bonus_count >= 0),
  bonus_probability NUMERIC(4, 3) NOT NULL DEFAULT 0.2 CHECK (bonus_probability >= 0 AND bonus_probability <= 1),
  other_tribe_probability NUMERIC(4, 3) NOT NULL DEFAULT 0.2 CHECK (other_tribe_probability >= 0 AND other_tribe_probability <= 1),
  rarity_common NUMERIC(6, 3) NOT NULL DEFAULT 70 CHECK (rarity_common >= 0),
  rarity_rare NUMERIC(6, 3) NOT NULL DEFAULT 22 CHECK (rarity_rare >= 0),
  rarity_epic NUMERIC(6, 3) NOT NULL DEFAULT 6 CHECK (rarity_epic >= 0),
  rarity_mystic NUMERIC(6, 3) NOT NULL DEFAULT 2 CHECK (rarity_mystic >= 0),
  pity_epic_threshold INTEGER NOT NULL DEFAULT 15 CHECK (pity_epic_threshold >= 1),
  pre_quest_fill_amount INTEGER NOT NULL DEFAULT 5 CHECK (pre_quest_fill_amount >= 1),
  pre_quest_unlock_required INTEGER NOT NULL DEFAULT 5 CHECK (pre_quest_unlock_required >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT capsule_policy_rarity_sum_100
    CHECK (abs(rarity_common + rarity_rare + rarity_epic + rarity_mystic - 100) < 0.001)
);

ALTER TABLE public.capsule_policy ENABLE ROW LEVEL SECURITY;
INSERT INTO public.capsule_policy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.capsule_policy IS
  '캡슐의 조정 값(한 행 싱글톤). 개수, 다른 트라이브 확률, 등급 확률, Epic 보정, 퀘스트 전 값. Common 연속 보정과 잠길 확률은 jam_policy를 쓴다. service_role 전용. 설정 화면은 묶음 7.';
COMMENT ON COLUMN public.capsule_policy.guaranteed_count IS '열 때 확정으로 나오는 개수. 기본 1.';
COMMENT ON COLUMN public.capsule_policy.bonus_count IS '확률로 더 나올 수 있는 개수. 기본 1(최대 2개).';
COMMENT ON COLUMN public.capsule_policy.bonus_probability IS '보너스 개수가 나올 확률(0~1). 기본 0.2.';
COMMENT ON COLUMN public.capsule_policy.other_tribe_probability IS '나온 개체마다 다른 트라이브의 것일 확률(0~1, 나머지 넷 가운데 고르게). 기본 0.2.';
COMMENT ON COLUMN public.capsule_policy.rarity_common IS '캡슐 등급 확률 Common(퍼센트). 네 등급 합계 100. 기본 70.';
COMMENT ON COLUMN public.capsule_policy.rarity_rare IS '캡슐 등급 확률 Rare. 기본 22.';
COMMENT ON COLUMN public.capsule_policy.rarity_epic IS '캡슐 등급 확률 Epic. 기본 6.';
COMMENT ON COLUMN public.capsule_policy.rarity_mystic IS '캡슐 등급 확률 Mystic. 기본 2.';
COMMENT ON COLUMN public.capsule_policy.pity_epic_threshold IS '이 횟수만큼 열 동안 Epic 이상이 없으면 다음 캡슐은 Epic 이상(보정 1). 기본 15.';
COMMENT ON COLUMN public.capsule_policy.pre_quest_fill_amount IS '챕터가 없는 유저(퀘스트 전) 캡슐의 채울 양. 기본 5.';
COMMENT ON COLUMN public.capsule_policy.pre_quest_unlock_required IS '퀘스트 전 첫 캡슐에서 반드시 나오는 잠긴 아이템 배지를 여는 데 필요한 양. 기본 5.';

-- (2) 챕터별 채울 양
CREATE TABLE IF NOT EXISTS public.capsule_chapter_costs (
  chapter_no INTEGER PRIMARY KEY CHECK (chapter_no >= 1),
  fill_amount INTEGER NOT NULL CHECK (fill_amount >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.capsule_chapter_costs ENABLE ROW LEVEL SECURITY;

INSERT INTO public.capsule_chapter_costs (chapter_no, fill_amount) VALUES
  (1, 90), (2, 100), (3, 110), (4, 120), (5, 135), (6, 150), (7, 165), (8, 180), (9, 200), (10, 220)
ON CONFLICT (chapter_no) DO NOTHING;

COMMENT ON TABLE public.capsule_chapter_costs IS
  '챕터별 캡슐 채울 양(운영 로직 5.4절). 챕터가 표의 마지막보다 높으면 마지막 행의 양을 쓴다. service_role 전용. 설정 화면은 묶음 7.';

-- (3) 유저의 캡슐
CREATE TABLE IF NOT EXISTS public.user_capsules (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  required INTEGER NOT NULL CHECK (required >= 1),
  filled INTEGER NOT NULL DEFAULT 0,
  chapter_no INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_capsules_filled_range CHECK (filled >= 0 AND filled <= required)
);

ALTER TABLE public.user_capsules ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_capsules IS
  '유저의 지금 캡슐(유저당 하나, 언제나 있음). required는 캡슐이 생길 때 고정한다. chapter_no가 NULL이면 퀘스트 전에 만든 캡슐이다. service_role 전용.';

-- (4) 열 때마다의 기록 (2회의 열기 함수가 쓴다)
CREATE TABLE IF NOT EXISTS public.capsule_opens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  chapter_no INTEGER,
  required INTEGER NOT NULL,
  filled INTEGER NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_capsule_opens_user_opened ON public.capsule_opens (user_id, opened_at DESC);
ALTER TABLE public.capsule_opens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.capsule_opens IS
  '캡슐을 열 때마다 한 줄(append-only): 연 시각, 그때의 챕터, 채운 양, 나온 개체 목록(items). 연 횟수는 이 표로 센다. service_role 전용.';

-- (5) 보정 1의 카운터
ALTER TABLE public.user_drop_state
  ADD COLUMN IF NOT EXISTS capsule_epic_miss INTEGER NOT NULL DEFAULT 0 CHECK (capsule_epic_miss >= 0);

COMMENT ON COLUMN public.user_drop_state.capsule_epic_miss IS
  '캡슐을 열었는데 Epic 이상이 나오지 않은 연속 횟수(보정 1). capsule_policy.pity_epic_threshold 이상이면 다음 캡슐은 Epic 이상. Epic 이상이 나오면 0.';

-- (6) 캡슐 가져오기(없으면 만든다)
CREATE OR REPLACE FUNCTION public.capsule_get_or_create(p_user_id UUID)
RETURNS public.user_capsules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.user_capsules;
  v_chapter INTEGER;
  v_required INTEGER;
BEGIN
  SELECT * INTO v_row FROM public.user_capsules WHERE user_id = p_user_id;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT chapter_no INTO v_chapter FROM public.user_chapters WHERE user_id = p_user_id;
  IF v_chapter IS NULL THEN
    SELECT pre_quest_fill_amount INTO v_required FROM public.capsule_policy WHERE id = 1;
  ELSE
    SELECT fill_amount INTO v_required FROM public.capsule_chapter_costs WHERE chapter_no = v_chapter;
    IF v_required IS NULL THEN
      SELECT fill_amount INTO v_required FROM public.capsule_chapter_costs ORDER BY chapter_no DESC LIMIT 1;
    END IF;
  END IF;

  INSERT INTO public.user_capsules (user_id, required, filled, chapter_no)
    VALUES (p_user_id, v_required, 0, v_chapter)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.user_capsules WHERE user_id = p_user_id;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.capsule_get_or_create(UUID) IS
  '유저의 캡슐을 돌려준다. 없으면 그때의 챕터로 필요량을 정해 만든다(필요량은 이후 고정). service_role 전용.';

-- (7) 채우기
CREATE OR REPLACE FUNCTION public.capsule_fill(p_user_id UUID, p_amount INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap public.user_capsules;
  v_remaining INTEGER;
  v_balance BIGINT;
  v_amount INTEGER;
BEGIN
  -- 이용 정지 중에는 채울 수 없다(앱 코드도 먼저 막는다. 여기는 한 번 더 막는 방어선)
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  PERFORM public.capsule_get_or_create(p_user_id);
  SELECT * INTO v_cap FROM public.user_capsules WHERE user_id = p_user_id FOR UPDATE;

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

  -- 기본값은 남은 양, 가진 잼이 모자라면 가진 만큼 전부
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
$$;

COMMENT ON FUNCTION public.capsule_fill(UUID, INTEGER) IS
  '캡슐 채우기. 기본값은 남은 양, 가진 잼이 모자라면 가진 만큼 전부, 남은 양보다 많이는 거부. jam_apply(capsule_fill) 한 줄과 캡슐 갱신이 한 트랜잭션. 이용 정지 중 거부. service_role 전용.';

REVOKE ALL ON FUNCTION public.capsule_get_or_create(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capsule_get_or_create(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capsule_get_or_create(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.capsule_fill(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capsule_fill(UUID, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capsule_fill(UUID, INTEGER) TO service_role;

-- 되돌림 SQL
-- 새로 만든 객체만 지운다. 채운 잼은 원장(jam_transactions)에 이미 남아 있으므로 되돌리면 그 잼이 지갑으로 돌아오지 않는다.
-- 운영 데이터가 생긴 뒤에는 채운 양을 지갑에 되돌리는 보정(admin_grant)을 먼저 한다.
-- 이 객체를 쓰는 새 코드(캡슐 조회·채우기 API)는 같은 시점에 되돌려야 한다.
-- DROP FUNCTION IF EXISTS public.capsule_fill(UUID, INTEGER);
-- DROP FUNCTION IF EXISTS public.capsule_get_or_create(UUID);
-- ALTER TABLE public.user_drop_state DROP COLUMN IF EXISTS capsule_epic_miss;
-- DROP TABLE IF EXISTS public.capsule_opens;
-- DROP TABLE IF EXISTS public.user_capsules;
-- DROP TABLE IF EXISTS public.capsule_chapter_costs;
-- DROP TABLE IF EXISTS public.capsule_policy;
