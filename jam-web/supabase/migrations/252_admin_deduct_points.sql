-- 252_admin_deduct_points.sql
-- JAM 2.0 포인트: 어드민 회수가 잔액을 0 아래로 내리지 못하게 하는 새 회수 함수 (티켓 20261019_1314, 상위 20261019_1310, 운영 로직 14.2절, 비교표 4.1절 문제 ③)
--
-- 새 함수 1개만 덧붙인다. 옛 테이블(point_wallets, point_transactions, point_treasury)과 옛 함수(award_points)는 바꾸지 않는다.
-- 옛 프로덕션 코드는 이 함수를 모르고 계속 award_points로 회수하므로, 그 경로는 이 함수로 막히지 않는다(새 앱이 배포되고 옛 코드가 사라질 때까지).
-- 모든 경로를 막는 지갑 잔액 제약(point_wallets.balance >= 0 CHECK)은 옛 코드를 정리하는 묶음 6에서 더한다(사용자 결정 2026-10-20).
--
-- 규칙
--   - admin_deduct_points(p_user_id, p_amount, p_admin_reason_label, p_admin_reason_note) → JSONB. p_amount는 회수할 양(양수)이다.
--     지갑 행을 FOR UPDATE로 잠근 뒤 잔액을 읽는다(같은 지갑에 동시에 들어온 회수·지급을 직렬화한다). 잔액이 모자라면 아무것도 바꾸지 않고 거절을 돌려준다.
--     통과하면 award_points(음수 금액, 'admin_deduct')를 불러 원장 기록·지갑 갱신·금고 집계를 기존 방식 그대로 처리한다(원장·지갑·금고 로직을 복제하지 않아 합계 불변식이 유지된다).
--       {ok:true, transactionId, balance}                                  -- balance는 회수 뒤 잔액
--       {ok:false, error:'invalid_amount'}                                 -- p_amount가 비었거나 0 이하
--       {ok:false, error:'insufficient_balance', balance, requested}       -- 잔액이 요청 금액보다 적음. 지갑이 없는 유저는 잔액 0으로 본다(빈 지갑 행도 만들지 않는다)
--   - 사유 라벨 검증(ADMIN_REASONS 6가지)은 앱이 한다. 이 함수는 라벨과 메모를 원장에 그대로 남긴다(기존 admin_deduct와 같다).
--   - service_role만 실행한다(서버 전용). anon·authenticated·PUBLIC 권한은 회수한다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT proname, prosecdef FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'admin_deduct_points';   -- 1행, prosecdef = true
--   SELECT has_function_privilege('authenticated','public.admin_deduct_points(uuid,integer,text,text)','EXECUTE'),
--          has_function_privilege('anon','public.admin_deduct_points(uuid,integer,text,text)','EXECUTE'),
--          has_function_privilege('service_role','public.admin_deduct_points(uuid,integer,text,text)','EXECUTE');            -- false, false, true
--   SELECT count(*) FROM public.point_wallets WHERE balance < 0;                                                                -- 0 (옛 경로로 생길 수 있으니 오픈 때도 다시 본다)

CREATE OR REPLACE FUNCTION public.admin_deduct_points(
  p_user_id UUID,
  p_amount INTEGER,
  p_admin_reason_label TEXT DEFAULT NULL,
  p_admin_reason_note TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
  v_tx public.point_transactions;
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- 지갑 행을 잠그고 잔액을 읽는다. 행이 없으면 잔액 0으로 보고 거절한다(INSERT하지 않는다).
  SELECT balance INTO v_balance FROM public.point_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    v_balance := 0;
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', v_balance, 'requested', p_amount);
  END IF;

  v_tx := public.award_points(
    p_user_id, -p_amount, 'admin_deduct',
    NULL, NULL, p_admin_reason_label, p_admin_reason_note, NULL
  );

  RETURN jsonb_build_object('ok', true, 'transactionId', v_tx.id, 'balance', v_balance - p_amount);
END;
$$;

COMMENT ON FUNCTION public.admin_deduct_points IS
  '어드민 포인트 회수. 지갑 행 잠금 + 잔액 검사 뒤 award_points(admin_deduct)로 처리하고 잔액이 모자라면 아무것도 바꾸지 않고 거절을 돌려준다. 서버(service role)에서만 호출. 티켓 20261019_1314.';

REVOKE ALL ON FUNCTION public.admin_deduct_points(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_deduct_points(UUID, INTEGER, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_deduct_points(UUID, INTEGER, TEXT, TEXT) TO service_role;

-- 되돌림 SQL
-- 앱이 이 함수를 부르는 코드를 되돌린 뒤에 지운다(앱이 먼저 남아 있으면 어드민 회수가 전부 실패한다).
-- DROP FUNCTION IF EXISTS public.admin_deduct_points(UUID, INTEGER, TEXT, TEXT);
