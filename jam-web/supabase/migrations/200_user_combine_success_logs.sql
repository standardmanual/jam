-- 200: user_combine_success_logs 신규 테이블 + record_combine_success RPC + 실패 로그 CHECK 보정
--      (티켓 20261001_0631, 상위 20260930_1456 ① — JAM! 카테고리 믹스 행동 지표)
--      (실패 로그 CHECK 보정은 티켓 20261001_0636을 함께 처리한다)
--
-- 배경:
--   믹스 실패는 `user_combine_fail_logs`(153)에 남지만 **성공은 어디에도 기록되지 않는다.**
--   믹스 시도·성공 횟수와 "레시피 최초 성공"을 조건으로 쓰려면 성공 기록 테이블부터 있어야 한다.
--   과거 성공은 되살릴 수 없어 백필하지 않는다(시도·성공은 이 기록을 시작한 날부터 센다).
--
--   ① user_combine_success_logs — 믹스 성공 1건 = 1행. 실패 로그(153)와 같은 결이다.
--      `recipe_id`에는 **FK를 걸지 않는다.** 레시피를 지워도 그 유저의 성공 횟수와 최초 성공
--      기록이 남아야 하고, 레시피 삭제 가드가 "이 레시피를 참조하는 행이 없다"는 전제
--      (`src/lib/admin/recipe-references.ts`)를 유지해야 한다.
--   ② 레시피마다 최초 표시 행은 정확히 1개다 — `(recipe_id) WHERE is_recipe_first` 부분 유니크
--      인덱스를 DB가 강제한다. 두 유저가 동시에 같은 레시피를 처음 성공해도 한 명만 표시된다.
--   ③ record_combine_success() — 성공 기록과 최초 표시를 한 번의 호출로 원자적으로 만든다.
--      먼저 `is_recipe_first = true`로 넣어 보고(`ON CONFLICT ... DO NOTHING`), 이미 최초 표시가
--      있으면 `is_recipe_first = false`로 한 번 더 넣는다. 반환값은 "이 호출이 최초 성공인가".
--   ④ user_combine_fail_logs_reason_check 보정 — 코드는 `recipe_not_found`를 기록하지만
--      (`src/lib/combine/index.ts`) 153의 CHECK에 그 값이 없어 저장이 조용히 실패했다
--      (티켓 20261001_0636, 라이브 DB 확인). 허용 값에 `recipe_not_found`를 더한다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: **코드 배포보다 먼저 실행하는 것이 안전하다.** 새 테이블·함수를 더하고 CHECK를
--    넓히기만 하므로 옛 코드는 그대로 동작한다. 코드가 먼저 배포되면 성공 기록 RPC가 없어
--    기록이 실패한다(오류는 삼켜지고 믹스 응답은 그대로지만 그 사이의 성공은 기록되지 않는다).
--    199(condition_json CHECK 확장)와는 서로 독립이다.
--
-- 재실행 가능(idempotent): CREATE TABLE/INDEX IF NOT EXISTS + DROP FUNCTION IF EXISTS +
--    DROP CONSTRAINT IF EXISTS로 작성했다.

BEGIN;

-- ── ① user_combine_success_logs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_combine_success_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- FK를 걸지 않는다: 레시피를 지워도 성공 횟수가 남는다. 삭제 가드의 「참조 없음」 전제 유지.
  recipe_id UUID NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ingredient_badge_ids UUID[] NOT NULL DEFAULT '{}',
  result_badge_ids UUID[] NOT NULL DEFAULT '{}',
  points_awarded INTEGER NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  -- 이 행이 그 레시피를 전체 유저 중 처음 성공한 기록인가. 레시피마다 true는 최대 1행.
  is_recipe_first BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS user_combine_success_logs_user_idx
  ON public.user_combine_success_logs (user_id, attempted_at DESC);

-- 레시피마다 최초 표시 1행을 DB가 강제한다(동시 최초 성공에서도 정확히 1명).
CREATE UNIQUE INDEX IF NOT EXISTS user_combine_success_logs_recipe_first_uidx
  ON public.user_combine_success_logs (recipe_id)
  WHERE is_recipe_first;

-- RLS: service_role 전용. service_role은 RLS를 우회하므로 정책을 만들지 않는다 =
-- anon/authenticated에는 전부 거부된다(유저 화면 비노출, 153 실패 로그와 같은 방식).
ALTER TABLE public.user_combine_success_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_combine_success_logs IS
  '믹스 성공 이력(티켓 20261001_0631). 믹스 시도·성공 횟수와 레시피 최초 성공 배지 조건의 원천이다. recipe_id에 FK가 없는 것은 의도다(레시피 삭제 뒤에도 기록 유지). 과거 성공은 백필하지 않는다.';
COMMENT ON COLUMN public.user_combine_success_logs.is_recipe_first IS
  '그 레시피를 전체 유저 중 처음 성공한 기록이면 true. (recipe_id) WHERE is_recipe_first 부분 유니크 인덱스가 레시피당 1행을 강제한다.';

-- ── ② record_combine_success() — 성공 기록 + 최초 표시를 원자적으로 ─────────
--
-- 1) is_recipe_first = true로 넣어 본다. 이미 그 레시피의 최초 행이 있으면 부분 유니크 인덱스
--    충돌이라 아무것도 넣지 않는다(DO NOTHING). 동시에 두 트랜잭션이 들어오면 뒤쪽은 앞쪽이
--    커밋될 때까지 기다린 뒤 충돌로 처리돼, 최초 표시는 정확히 1행이다.
-- 2) 넣지 못했으면 is_recipe_first = false로 한 번 더 넣는다.
-- 반환: 이 호출이 그 레시피의 최초 성공이면 true.
DROP FUNCTION IF EXISTS public.record_combine_success(uuid, uuid, uuid[], uuid[], integer);

CREATE FUNCTION public.record_combine_success(
  p_user_id              uuid,
  p_recipe_id            uuid,
  p_ingredient_badge_ids uuid[],
  p_result_badge_ids     uuid[],
  p_points_awarded       integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.user_combine_success_logs
    (user_id, recipe_id, ingredient_badge_ids, result_badge_ids, points_awarded, is_recipe_first)
  VALUES
    (p_user_id, p_recipe_id, COALESCE(p_ingredient_badge_ids, '{}'), COALESCE(p_result_badge_ids, '{}'),
     GREATEST(COALESCE(p_points_awarded, 0), 0), true)
  ON CONFLICT (recipe_id) WHERE is_recipe_first DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN true;
  END IF;

  INSERT INTO public.user_combine_success_logs
    (user_id, recipe_id, ingredient_badge_ids, result_badge_ids, points_awarded, is_recipe_first)
  VALUES
    (p_user_id, p_recipe_id, COALESCE(p_ingredient_badge_ids, '{}'), COALESCE(p_result_badge_ids, '{}'),
     GREATEST(COALESCE(p_points_awarded, 0), 0), false);

  RETURN false;
END;
$$;

-- anon/authenticated의 EXECUTE 권한을 회수하고 service_role에만 남긴다 — 이 함수는 호출자 검증
-- 없이 p_user_id를 신뢰하므로 anon 키로 직접 호출되면 임의 유저의 성공 기록을 만들 수 있다.
REVOKE EXECUTE ON FUNCTION public.record_combine_success(uuid, uuid, uuid[], uuid[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_combine_success(uuid, uuid, uuid[], uuid[], integer) TO service_role;

-- ── ③ 실패 로그 CHECK 보정 — recipe_not_found 추가 (티켓 20261001_0636) ─────
ALTER TABLE public.user_combine_fail_logs DROP CONSTRAINT IF EXISTS user_combine_fail_logs_reason_check;
ALTER TABLE public.user_combine_fail_logs ADD CONSTRAINT user_combine_fail_logs_reason_check
  CHECK (fail_reason IN ('no_recipe_match', 'items_not_found', 'invalid_count', 'recipe_not_found'));

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① RLS가 켜졌고 정책이 0개인지
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_combine_success_logs'::regclass;  -- true
-- SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_combine_success_logs';  -- 0
--
-- -- ② 부분 유니크 인덱스 술어
-- SELECT indexdef FROM pg_indexes
--   WHERE schemaname = 'public' AND indexname = 'user_combine_success_logs_recipe_first_uidx';
--   -- ... (recipe_id) WHERE is_recipe_first
--
-- -- ③ record_combine_success 권한이 service_role에만 있는지
-- SELECT proacl FROM pg_proc WHERE proname = 'record_combine_success';
--
-- -- ④ 롤백 스모크 — 같은 레시피를 유저 A가 먼저, 유저 B가 다음에 성공하면 A만 true, 다른 레시피는
-- --    다시 true. 레시피마다 is_recipe_first 행은 1개. MCP엔 트랜잭션이 없으므로 끝에
-- --    RAISE EXCEPTION으로 되돌린다.
-- DO $smoke$
-- DECLARE
--   v_a UUID; v_b UUID; v_r1 UUID := gen_random_uuid(); v_r2 UUID := gen_random_uuid();
--   v_a1 BOOLEAN; v_b1 BOOLEAN; v_b2 BOOLEAN; v_first_r1 INTEGER; v_first_r2 INTEGER;
-- BEGIN
--   SELECT id INTO v_a FROM public.users ORDER BY created_at LIMIT 1;
--   SELECT id INTO v_b FROM public.users WHERE id <> v_a ORDER BY created_at LIMIT 1;
--   v_a1 := public.record_combine_success(v_a, v_r1, '{}', '{}', 0);
--   v_b1 := public.record_combine_success(v_b, v_r1, '{}', '{}', 0);
--   v_b2 := public.record_combine_success(v_b, v_r2, '{}', '{}', 0);
--   SELECT count(*) INTO v_first_r1 FROM public.user_combine_success_logs WHERE recipe_id = v_r1 AND is_recipe_first;
--   SELECT count(*) INTO v_first_r2 FROM public.user_combine_success_logs WHERE recipe_id = v_r2 AND is_recipe_first;
--   RAISE EXCEPTION '롤백: A→r1 % / B→r1 % / B→r2 % (기대: t / f / t), 최초 표시 행 r1=% r2=% (기대: 1 / 1)',
--     v_a1, v_b1, v_b2, v_first_r1, v_first_r2;
-- END
-- $smoke$;
--
-- -- ⑤ 실패 로그 CHECK에 4값이 들어 있는지
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'user_combine_fail_logs_reason_check';

-- 되돌림 SQL
-- DROP FUNCTION IF EXISTS public.record_combine_success(uuid, uuid, uuid[], uuid[], integer);
-- -- ⚠️ 테이블을 지우면 그때까지 쌓인 믹스 성공 기록이 전부 사라진다. 기록이 쌓인 뒤에는 되돌릴 수 없는 손실이다
-- --    (과거 성공은 되살릴 수 없다). 배포 직후 기록이 없을 때만 지운다.
-- DROP TABLE IF EXISTS public.user_combine_success_logs;
-- -- 실패 로그 CHECK를 153의 3값으로 되돌린다. 되돌리기 전에 4번째 값 행을 지워야 한다(남아 있으면 ADD CONSTRAINT가 실패한다):
-- DELETE FROM public.user_combine_fail_logs WHERE fail_reason = 'recipe_not_found';
-- ALTER TABLE public.user_combine_fail_logs DROP CONSTRAINT IF EXISTS user_combine_fail_logs_reason_check;
-- ALTER TABLE public.user_combine_fail_logs ADD CONSTRAINT user_combine_fail_logs_reason_check
--   CHECK (fail_reason IN ('no_recipe_match', 'items_not_found', 'invalid_count'));
