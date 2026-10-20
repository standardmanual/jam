-- 254_record_combine_success_with_id.sql
-- JAM 2.0 챕터 점수: 믹스 성공 기록의 id를 돌려주는 새 함수 (티켓 20261019_1315 3회, 상위 20261019_1310, 운영 로직 12.2절)
--
-- 새 함수 1개만 덧붙인다. 옛 함수 `record_combine_success`(200)와 `user_combine_success_logs` 표는 바꾸지 않는다.
-- 옛 프로덕션 코드는 옛 함수를 계속 부르므로 이 파일을 먼저 적용해도 아무것도 깨지지 않는다.
--
-- 왜 필요한가
--   챕터 점수 «믹스 성공»(`mix_success`)은 믹스 한 번당 한 번만 세어야 해서 원천 id가 필요하다. 믹스 성공 한 건은 `user_combine_success_logs`의 한 행이고
--   그 행의 id가 가장 안정적인 원천 id다. 그런데 옛 함수는 «이 호출이 레시피 최초 성공인가»(boolean)만 돌려줘서 앱이 방금 만든 행의 id를 알 수 없다.
--   앱이 id를 따로 읽으면 같은 유저의 두 번째 믹스가 끼어들 때 엉뚱한 행을 집을 수 있어, 함수가 id를 직접 돌려주게 한다.
--
-- 규칙
--   - record_combine_success_with_id(p_user_id, p_recipe_id, p_ingredient_badge_ids, p_result_badge_ids, p_points_awarded) → JSONB `{ "id": uuid, "is_recipe_first": boolean }`.
--     옛 함수와 인자·동작이 같다: 먼저 `is_recipe_first = true`로 넣어 보고(`ON CONFLICT (recipe_id) WHERE is_recipe_first DO NOTHING`),
--     이미 최초 표시가 있으면 `false`로 한 번 더 넣는다. 레시피마다 최초 표시 행은 부분 유니크 인덱스가 정확히 1개로 강제한다(동시 최초 성공에서도 한 명만).
--     두 경우 모두 방금 넣은 행의 id를 돌려준다.
--   - 같은 표에 행을 넣는 함수가 둘이 된다(옛 함수는 boolean, 새 함수는 id). 옛 코드가 사라지는 묶음 6에서 옛 함수를 지운다.
--   - service_role만 실행한다(서버 전용). anon·authenticated·PUBLIC 권한은 회수한다(옛 함수와 같은 방어: 호출자 검증 없이 p_user_id를 신뢰한다).
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT proname, prosecdef FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('record_combine_success', 'record_combine_success_with_id');   -- 2행, 둘 다 prosecdef = true
--   SELECT has_function_privilege('authenticated','public.record_combine_success_with_id(uuid,uuid,uuid[],uuid[],integer)','EXECUTE'),
--          has_function_privilege('anon','public.record_combine_success_with_id(uuid,uuid,uuid[],uuid[],integer)','EXECUTE'),
--          has_function_privilege('service_role','public.record_combine_success_with_id(uuid,uuid,uuid[],uuid[],integer)','EXECUTE');   -- false, false, true

CREATE OR REPLACE FUNCTION public.record_combine_success_with_id(
  p_user_id              uuid,
  p_recipe_id            uuid,
  p_ingredient_badge_ids uuid[],
  p_result_badge_ids     uuid[],
  p_points_awarded       integer
)
RETURNS jsonb
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
    RETURN jsonb_build_object('id', v_id, 'is_recipe_first', true);
  END IF;

  INSERT INTO public.user_combine_success_logs
    (user_id, recipe_id, ingredient_badge_ids, result_badge_ids, points_awarded, is_recipe_first)
  VALUES
    (p_user_id, p_recipe_id, COALESCE(p_ingredient_badge_ids, '{}'), COALESCE(p_result_badge_ids, '{}'),
     GREATEST(COALESCE(p_points_awarded, 0), 0), false)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'is_recipe_first', false);
END;
$$;

COMMENT ON FUNCTION public.record_combine_success_with_id IS
  '믹스 성공 기록 + 레시피 최초 표시를 원자적으로 만들고 방금 넣은 행의 id와 최초 여부를 돌려준다. 옛 record_combine_success와 같은 동작이며 id를 돌려주는 점만 다르다. 챕터 점수 mix_success의 원천 id로 쓴다. 서버(service role)에서만 호출. 티켓 20261019_1315.';

REVOKE ALL ON FUNCTION public.record_combine_success_with_id(uuid, uuid, uuid[], uuid[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_combine_success_with_id(uuid, uuid, uuid[], uuid[], integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_combine_success_with_id(uuid, uuid, uuid[], uuid[], integer) TO service_role;

-- 되돌림 SQL
-- 앱이 이 함수를 부르는 코드(lib/combine/index.ts)를 되돌린 뒤에 지운다(앱이 먼저 남아 있으면 믹스 성공 기록이 전부 실패한다).
-- 이 함수가 만든 행은 옛 함수가 만든 행과 같은 표·같은 모양이라 지울 필요가 없다.
-- DROP FUNCTION IF EXISTS public.record_combine_success_with_id(uuid, uuid, uuid[], uuid[], integer);
