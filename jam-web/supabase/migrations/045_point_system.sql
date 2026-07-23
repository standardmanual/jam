-- ============================================================
-- Migration 045: 잼 포인트 시스템 (Phase 12, 1a단계 — 체계만)
--
-- 포인트를 "언제 주고, 어디에 쌓이는지"까지만 만든다. 쓰는 곳(포인트 상점)은
-- 이번 범위가 아니다. (설계 원천: PRD/Phase12_02_DATA_MODEL.md)
--
-- 1. badges.point_reward 컬럼 추가 (발급 시 함께 지급하는 포인트, 0이면 없음)
-- 2. point_wallets   — 유저별 잔액 캐시 (PK=user_id, lazy 생성)
-- 3. point_transactions — 불변 원장 (append-only, 수정/삭제 없음)
-- 4. point_treasury  — 서비스 전체 발행 장부 (싱글톤 1행, 어드민 전용)
-- 5. award_points()  — 잔액 변경의 유일한 경로 (원장 삽입 + 잔액 갱신 +
--    treasury 집계를 하나의 트랜잭션으로 처리하는 SECURITY DEFINER RPC)
--
-- 정합성 불변식(운영 감시용):
--   Σ point_wallets.balance = treasury.total_minted − treasury.total_reclaimed
--                           = Σ point_transactions.amount
--
-- 절대 하지 마: point_wallets.balance 직접 UPDATE 금지, point_transactions
--   행 UPDATE/DELETE 금지. 정정은 반대 부호의 새 행을 award_points()로 추가.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. badges.point_reward 컬럼 추가
--    이미 발급된 배지는 소급 지급 없음(ALTER 시 DEFAULT 0으로 채워짐).
--    발급 후 값이 바뀌어도 이미 지급된 포인트는 소급 변경되지 않음.
-- ----------------------------------------------------------------
ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS point_reward INTEGER NOT NULL DEFAULT 0 CHECK (point_reward >= 0);

COMMENT ON COLUMN public.badges.point_reward IS
  '이 배지가 발급될 때 함께 지급하는 잼 포인트. 0이면 포인트 없음. 배지 발급 후 값이 바뀌어도 이미 지급된 포인트는 소급 변경되지 않음(발급 시점 값으로 1회 지급).';

-- ----------------------------------------------------------------
-- 2. point_wallets — 유저별 잔액 (캐시)
--    기존 유저 마이그레이션 없음 — lazy 생성 (첫 포인트 지급 시 upsert)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_wallets (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.point_wallets ENABLE ROW LEVEL SECURITY;

-- 본인 잔액만 읽기 가능. 쓰기 경로는 없음(award_points RPC의 SECURITY DEFINER로만 변경).
DROP POLICY IF EXISTS point_wallets_select_own ON public.point_wallets;
CREATE POLICY point_wallets_select_own ON public.point_wallets
  FOR SELECT USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 3. point_transactions — 원장 (append-only)
--    reason은 TEXT + CHECK (Postgres ENUM 아님 — 1b/2단계 값 추가 시 유연).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount <> 0),           -- 양수=적립, 음수=차감
  reason TEXT NOT NULL CHECK (reason IN (
    'badge_point_reward',
    'mission_point_reward',
    'admin_grant',
    'admin_deduct'
    -- 1b단계 예약(이번엔 발급 안 함): 'sink_redemption'
    -- 2단계 예약(이번엔 발급 안 함): 'trade_sell', 'trade_buy'
  )),
  source_badge_id UUID REFERENCES public.badges(id),           -- reason='badge_point_reward'일 때만
  source_mission_id UUID REFERENCES public.missions(id),       -- reason='mission_point_reward'일 때만
  admin_reason_label TEXT,                                     -- reason='admin_grant'/'admin_deduct'일 때: 사유 목록 값 또는 'other'
  admin_reason_note TEXT,                                      -- admin_reason_label='other'일 때만 자유 입력 텍스트
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS point_transactions_user_created_idx
  ON public.point_transactions (user_id, created_at DESC);

ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;

-- 본인 내역만 읽기 가능. 수정/삭제 정책 없음(불변 원장). 쓰기는 RPC(SECURITY DEFINER)로만.
DROP POLICY IF EXISTS point_transactions_select_own ON public.point_transactions;
CREATE POLICY point_transactions_select_own ON public.point_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 4. point_treasury — 발행 장부 (싱글톤, 어드민 전용)
--    drop_policy/abusing_policy와 동일한 싱글톤 패턴.
--    상한 없음 — 마이너스로 내려가도 됨("지금까지 얼마 찍었는지 세는 계산기").
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_treasury (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_minted BIGINT NOT NULL DEFAULT 0,       -- 누계, 감소하지 않음
  total_reclaimed BIGINT NOT NULL DEFAULT 0,    -- 누계, 감소하지 않음
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.point_treasury (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.point_treasury ENABLE ROW LEVEL SECURITY;
-- RLS 정책 없음 = 일반 유저(anon/authenticated) 접근 불가. service_role은 RLS 우회.

-- ----------------------------------------------------------------
-- 5. award_points() — 잔액 변경의 유일한 경로
--    ①원장 삽입 ②잔액 갱신 ③(적립계열)total_minted / (회수계열)total_reclaimed
--    를 하나의 트랜잭션(함수 본문)으로 원자 처리.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_points(
  p_user_id UUID,
  p_amount INTEGER,              -- 양수=적립, 음수=차감
  p_reason TEXT,
  p_source_badge_id UUID DEFAULT NULL,
  p_source_mission_id UUID DEFAULT NULL,
  p_admin_reason_label TEXT DEFAULT NULL,
  p_admin_reason_note TEXT DEFAULT NULL
) RETURNS public.point_transactions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.point_transactions;
BEGIN
  INSERT INTO public.point_transactions
    (user_id, amount, reason, source_badge_id, source_mission_id, admin_reason_label, admin_reason_note)
  VALUES
    (p_user_id, p_amount, p_reason, p_source_badge_id, p_source_mission_id, p_admin_reason_label, p_admin_reason_note)
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

-- 클라이언트(anon/authenticated)가 직접 RPC를 호출해 잔액을 조작하지 못하도록 실행 권한 회수.
-- service_role만 호출 가능(서버 경로 전용).
REVOKE ALL ON FUNCTION public.award_points(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_points(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_points(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT) TO service_role;
