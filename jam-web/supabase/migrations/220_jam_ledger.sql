-- 220_jam_ledger.sql
-- JAM 2.0 잼 원장과 지갑 (티켓 20261016_2338, 운영 로직 4.2절 "원장과 기록")
--
-- 새 테이블 3개(jam_wallets, jam_daily_earned, jam_transactions)와 새 함수 1개(jam_apply)만 추가한다.
-- 기존 객체(point_*, award_points 포함)는 건드리지 않는다. 포인트 원장(080)의 구조를 본떴다.
--
-- 원칙
--   - 가진 양(balance)은 jam_apply() 안에서만 바뀐다. 원장 한 줄과 지갑·집계 갱신이 한 트랜잭션이다.
--   - balance는 0 아래로 내려가지 않는다(CHECK 제약 + 함수 검사). 포인트(080)에는 없던 제약이다.
--   - 「모은 양」(total_earned, jam_daily_earned)은 활동 정산(activity_settlement)만 늘린다.
--     운영자 지급·회수와 캡슐·아이템 배지 채움은 가진 양만 바꾼다(운영 로직 4.5절).
--   - 같은 활동 식별자의 활동 정산은 DB에서 한 번만 일어난다. 두 번째 호출은 오류가 아니라
--     기존 원장 줄을 그대로 돌려준다(동기화가 안전하게 다시 호출될 수 있어야 하므로).
--   - 활동 식별자(source_activity_id)는 strava_activities.id 값을 담지만 외래키로 묶지 않는다.
--     원장은 지워지지 않는 기록이라 활동 행이 지워져도 남아야 한다.
--   - 날짜별 모은 양의 날짜는 정산 시각의 KST 날짜다.
--   - 이용 정지 중 동작 차단은 이 파일의 범위가 아니다(묶음 2 어뷰징·제재).

-- ----------------------------------------------------------------
-- 1. jam_wallets — 유저별 가진 양과 지금까지 모은 총량
--    lazy 생성(첫 지급·차감 때 jam_apply가 만든다). 기존 유저 백필 없음.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jam_wallets (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_earned BIGINT NOT NULL DEFAULT 0 CHECK (total_earned >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.jam_wallets ENABLE ROW LEVEL SECURITY;

-- 본인 지갑만 읽기. 쓰기 정책 없음(jam_apply의 SECURITY DEFINER로만 변경).
DROP POLICY IF EXISTS jam_wallets_select_own ON public.jam_wallets;
CREATE POLICY jam_wallets_select_own ON public.jam_wallets
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.jam_wallets IS
  '잼 지갑. balance=지금 가진 양(0 이상), total_earned=활동 정산으로 모은 총량. jam_apply()로만 변경.';

-- ----------------------------------------------------------------
-- 2. jam_daily_earned — 날짜(KST)별 모은 양. 활동 정산 때만 늘어난다.
--    이번 주·이번 달 등 기간별 모은 양은 이 테이블을 합산해 읽는다.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jam_daily_earned (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  earned_on DATE NOT NULL,                                  -- KST 날짜
  amount BIGINT NOT NULL DEFAULT 0 CHECK (amount >= 0),
  PRIMARY KEY (user_id, earned_on)
);

ALTER TABLE public.jam_daily_earned ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jam_daily_earned_select_own ON public.jam_daily_earned;
CREATE POLICY jam_daily_earned_select_own ON public.jam_daily_earned
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.jam_daily_earned IS
  '유저·KST 날짜별 모은 잼. 활동 정산(activity_settlement)만 늘린다. jam_apply()로만 변경.';

-- ----------------------------------------------------------------
-- 3. jam_transactions — 원장 (append-only)
--    amount: 늘어난 양은 양수, 쓴 양은 음수, 0 불가.
--    reason은 TEXT + CHECK (ENUM 아님 — 값 추가가 쉽다). 사유별 부호·필수 칸도 CHECK로 건다.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jam_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount <> 0),
  reason TEXT NOT NULL CHECK (reason IN (
    'activity_settlement',        -- 활동 정산 (+)
    'capsule_fill',               -- 캡슐 채움 (-)
    'locked_item_badge_fill',     -- 잠긴 아이템 배지 채움 (-)
    'admin_grant',                -- 운영자 지급 (+)
    'admin_deduct'                -- 운영자 회수 (-)
  )),
  source_activity_id UUID,                  -- reason='activity_settlement'일 때만. strava_activities.id (FK 없음)
  admin_user_id UUID,                       -- reason='admin_grant'/'admin_deduct'일 때만. 처리한 운영자 (FK 없음)
  admin_reason_label TEXT,                  -- 운영자 지급·회수 사유 값
  admin_reason_note TEXT,                   -- 사유 문구(자유 입력, 선택)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT jam_transactions_sign_by_reason CHECK (
    (reason IN ('activity_settlement', 'admin_grant') AND amount > 0)
    OR (reason IN ('capsule_fill', 'locked_item_badge_fill', 'admin_deduct') AND amount < 0)
  ),
  CONSTRAINT jam_transactions_source_by_reason CHECK (
    (reason = 'activity_settlement' AND source_activity_id IS NOT NULL
       AND admin_user_id IS NULL AND admin_reason_label IS NULL AND admin_reason_note IS NULL)
    OR (reason IN ('admin_grant', 'admin_deduct') AND source_activity_id IS NULL
       AND admin_user_id IS NOT NULL AND admin_reason_label IS NOT NULL)
    OR (reason IN ('capsule_fill', 'locked_item_badge_fill') AND source_activity_id IS NULL
       AND admin_user_id IS NULL AND admin_reason_label IS NULL AND admin_reason_note IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS jam_transactions_user_created_idx
  ON public.jam_transactions (user_id, created_at DESC);

-- 같은 활동은 DB에서 한 번만 정산된다.
CREATE UNIQUE INDEX IF NOT EXISTS jam_transactions_activity_settlement_uniq
  ON public.jam_transactions (source_activity_id)
  WHERE reason = 'activity_settlement';

ALTER TABLE public.jam_transactions ENABLE ROW LEVEL SECURITY;

-- 본인 내역만 읽기. 수정·삭제·삽입 정책 없음(불변 원장). 쓰기는 jam_apply()로만.
DROP POLICY IF EXISTS jam_transactions_select_own ON public.jam_transactions;
CREATE POLICY jam_transactions_select_own ON public.jam_transactions
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.jam_transactions IS
  '잼 원장(append-only). 늘어난 양 +, 쓴 양 -. 활동 정산은 source_activity_id당 한 줄(부분 유일 인덱스).';

-- 클라이언트 역할의 직접 쓰기 권한도 회수한다(RLS 정책 부재에 더한 이중 차단).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.jam_wallets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.jam_daily_earned FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.jam_transactions FROM anon, authenticated;

-- ----------------------------------------------------------------
-- 4. jam_apply() — 잼 가진 양 변경의 유일한 경로 (지급·차감 공용)
--    ①지갑 행 확보·잠금 ②사유별 부호 검사 ③(활동 정산) 원장 삽입 — 이미 있으면 기존 줄 반환
--    ④가진 양 검사 ⑤지갑 갱신 ⑥(활동 정산) total_earned·날짜별 모은 양 갱신.
--    시그니처는 확정이다. 인자 수를 바꾸려면 옛 시그니처를 먼저 DROP해야 한다(db-migration-rules.md 3절).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jam_apply(
  p_user_id UUID,
  p_amount INTEGER,                     -- 늘어난 양 +, 쓴 양 -
  p_reason TEXT,
  p_source_activity_id UUID DEFAULT NULL,
  p_admin_user_id UUID DEFAULT NULL,
  p_admin_reason_label TEXT DEFAULT NULL,
  p_admin_reason_note TEXT DEFAULT NULL
) RETURNS public.jam_transactions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.jam_transactions;
  v_balance BIGINT;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'jam_apply: amount는 0이 아니어야 합니다' USING ERRCODE = 'check_violation';
  END IF;

  -- 사유별 허용 부호: 활동 정산·운영자 지급은 양수, 채움 둘·운영자 회수는 음수.
  IF p_reason IN ('activity_settlement', 'admin_grant') THEN
    IF p_amount < 0 THEN
      RAISE EXCEPTION 'jam_apply: % 는 양수만 허용합니다', p_reason USING ERRCODE = 'check_violation';
    END IF;
  ELSIF p_reason IN ('capsule_fill', 'locked_item_badge_fill', 'admin_deduct') THEN
    IF p_amount > 0 THEN
      RAISE EXCEPTION 'jam_apply: % 는 음수만 허용합니다', p_reason USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'jam_apply: 알 수 없는 사유 %', p_reason USING ERRCODE = 'check_violation';
  END IF;

  -- 지갑 행 확보 후 잠금(같은 유저의 동시 호출을 직렬화한다).
  INSERT INTO public.jam_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM public.jam_wallets WHERE user_id = p_user_id FOR UPDATE;

  -- 가진 양보다 큰 차감은 거절한다(원장·지갑 모두 바뀌지 않는다).
  IF v_balance + p_amount < 0 THEN
    RAISE EXCEPTION 'jam_apply: 가진 양이 부족합니다 (보유 %, 차감 %)', v_balance, -p_amount
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_reason = 'activity_settlement' THEN
    INSERT INTO public.jam_transactions (user_id, amount, reason, source_activity_id)
    VALUES (p_user_id, p_amount, p_reason, p_source_activity_id)
    ON CONFLICT (source_activity_id) WHERE reason = 'activity_settlement' DO NOTHING
    RETURNING * INTO v_tx;

    IF NOT FOUND THEN
      -- 이미 정산된 활동: 아무것도 바꾸지 않고 기존 원장 줄을 돌려준다.
      SELECT * INTO v_tx FROM public.jam_transactions
       WHERE reason = 'activity_settlement' AND source_activity_id = p_source_activity_id;
      RETURN v_tx;
    END IF;
  ELSE
    INSERT INTO public.jam_transactions
      (user_id, amount, reason, source_activity_id, admin_user_id, admin_reason_label, admin_reason_note)
    VALUES
      (p_user_id, p_amount, p_reason, p_source_activity_id, p_admin_user_id, p_admin_reason_label, p_admin_reason_note)
    RETURNING * INTO v_tx;
  END IF;

  UPDATE public.jam_wallets
     SET balance = balance + p_amount,
         total_earned = total_earned + CASE WHEN p_reason = 'activity_settlement' THEN p_amount ELSE 0 END,
         updated_at = now()
   WHERE user_id = p_user_id;

  IF p_reason = 'activity_settlement' THEN
    INSERT INTO public.jam_daily_earned (user_id, earned_on, amount)
    VALUES (p_user_id, (now() AT TIME ZONE 'Asia/Seoul')::date, p_amount)
    ON CONFLICT (user_id, earned_on) DO UPDATE
      SET amount = public.jam_daily_earned.amount + EXCLUDED.amount;
  END IF;

  RETURN v_tx;
END;
$$;

COMMENT ON FUNCTION public.jam_apply IS
  '잼 가진 양 변경의 유일한 경로. 원장 삽입 + 지갑 갱신(+활동 정산이면 모은 양 집계)을 원자 처리. 가진 양을 넘는 차감 거절, 사유별 부호 검사, 같은 활동 재정산은 기존 줄 반환. 서버(service role)에서만 호출.';

-- 클라이언트(anon/authenticated)가 RPC로 잔액을 조작하지 못하도록 실행 권한 회수. service_role만 호출 가능.
REVOKE ALL ON FUNCTION public.jam_apply(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jam_apply(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jam_apply(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT) TO service_role;

-- 되돌림 SQL
-- 새로 만든 객체만 지운다. 원장에 쌓인 잼 기록이 함께 사라지므로, 운영 데이터가 생긴 뒤에는 백업 후 실행한다.
-- DROP FUNCTION IF EXISTS public.jam_apply(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT);
-- DROP TABLE IF EXISTS public.jam_transactions;
-- DROP TABLE IF EXISTS public.jam_daily_earned;
-- DROP TABLE IF EXISTS public.jam_wallets;
