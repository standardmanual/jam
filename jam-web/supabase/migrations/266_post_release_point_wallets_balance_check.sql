-- 266_post_release_point_wallets_balance_check.sql
-- JAM 2.0 출시 뒤 정리: 지갑 잔액이 0 아래로 내려가지 못하게 하는 제약을 더한다 (티켓 20261021_1250 = 6-4 4회, 상위 20261021_1246)
--
-- **작성만 하고 실행하지 않았다. 출시(main 승격) 뒤 사용자 승인으로 실행한다.**
--
-- ⚠️ 공용 DB 영향: Supabase는 staging과 프로덕션이 한 DB를 쓰므로, 적용하는 순간 옛 프로덕션 코드에도 바로 반영된다.
--    그래서 옛 프로덕션 코드가 사라지는 출시(main 승격) 뒤에만 실행한다. 출시 전에 실행하면 옛 코드의 음수 회수(award_points에 음수 금액)가
--    제약 위반 오류(23514)로 실패한다. award_points 함수 안의 원장 기록·지갑 갱신은 한 트랜잭션이라 그 호출의 원장 기록도 함께 취소된다.
--
-- 선행 조건
--   ① 출시(main 승격)로 옛 프로덕션 코드가 사라진 뒤. 옛 코드는 어드민 회수가 잔액을 확인하지 않고 음수 금액으로 award_points를 부른다
--      (티켓 조사 기준 main의 lib/points/admin-grant.ts 76줄). 새 코드는 admin_deduct_points(마이그레이션 252)가 잔액이 모자라면 거절한다.
--   ② 아래 «적용 전 확인» 첫 쿼리가 0행이어야 한다. 음수 잔액 지갑이 있으면 이 제약이 만들어지지 않고 오류로 멈춘다(표는 그대로다).
--
-- 실행 순서: 이 묶음은 266(제약) → 267(함수) → 268(표) → 269(열) 순서로 실행한다. 네 파일은 서로 의존하지 않아 하나가 멈춰도 나머지에 영향이 없다.
--
-- 하는 일: public.point_wallets에 point_wallets_balance_nonneg CHECK (balance >= 0)를 더한다. 이미 있으면 지우고 같은 정의로 다시 만든다(다시 실행해도 안전하다).
-- 바꾸지 않는 것: 열·기본키·외래키·행의 값. 행을 지우거나 고치지 않는다.
-- 데이터 손실: 없다. 되돌림은 제약만 지운다.
-- 잠금: ALTER TABLE은 이 표에 ACCESS EXCLUSIVE 잠금을 요구한다. 지갑은 2행이라 검사가 바로 끝나지만, 진행 중인 쿼리 뒤에서 기다리는 동안 뒤따르는 쿼리를 막는다.
--   실행하는 쪽에서 같은 트랜잭션 안에 SET LOCAL lock_timeout = '3s'를 두어 오래 막지 않게 한다(본문에는 넣지 않았다).
-- 생성 타입: CHECK 제약은 database.generated.ts·database.ts의 모양을 바꾸지 않는다. 고칠 것이 없다.
--
-- 적용 전 확인(읽기 전용 SELECT):
--   SELECT count(*) AS 음수_지갑 FROM public.point_wallets WHERE balance < 0;                            -- 0 (0이 아니면 멈추고 보고한다)
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.point_wallets'::regclass ORDER BY conname;                                 -- point_wallets_pkey, point_wallets_user_id_fkey 둘뿐(잔액 제약 없음)
--   SELECT count(*) FROM public.point_wallets;                                                           -- 2 (2026-10-22 조회 기준. 적용 후와 같으면 된다)
--
-- 적용 후 확인(읽기 전용 SELECT):
--   SELECT conname, pg_get_constraintdef(oid), convalidated FROM pg_constraint
--    WHERE conrelid = 'public.point_wallets'::regclass AND conname = 'point_wallets_balance_nonneg';     -- 1행: CHECK ((balance >= 0)), convalidated = true
--   SELECT count(*) FROM public.point_wallets;                                                           -- 적용 전과 같다
--   SELECT count(*) AS 음수_지갑 FROM public.point_wallets WHERE balance < 0;                            -- 0

ALTER TABLE public.point_wallets
  DROP CONSTRAINT IF EXISTS point_wallets_balance_nonneg,
  ADD CONSTRAINT point_wallets_balance_nonneg CHECK (balance >= 0);

-- 되돌림 SQL
-- 제약만 지운다. 행의 값은 이 파일이 바꾸지 않았으므로 복원할 데이터가 없다. 한 번 실행하면 적용 전 상태(기본키·외래키만 있는 상태)가 된다.
--
-- ALTER TABLE public.point_wallets DROP CONSTRAINT IF EXISTS point_wallets_balance_nonneg;
--
-- 되돌린 뒤 확인(읽기 전용 SELECT):
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.point_wallets'::regclass ORDER BY conname;  -- point_wallets_pkey, point_wallets_user_id_fkey 둘뿐
--   SELECT count(*) FROM public.point_wallets;                                                             -- 적용 전과 같다(2)
