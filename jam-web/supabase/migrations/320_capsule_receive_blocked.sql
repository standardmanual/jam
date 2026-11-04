-- 320_capsule_receive_blocked.sql
-- «캡슐이 가득 차고 인벤토리 빈칸이 필요 칸수보다 적은가»를 판정하는 읽기 전용 DB 함수 (티켓 20261105_0101, 상위 20261105_0100)
--
-- 이 파일은 «확장»이다(db-migration-rules.md 1절). 새 함수 하나만 덧붙이고 옛 함수·표는 건드리지 않는다.
--   capsule_receive_blocked(p_user_id uuid) -> jsonb {blocked, free, needed}
--     · 캡슐: user_capsules의 이 유저 행에서 filled >= required이면 «가득»이다(CHECK가 filled <= required를 보장한다).
--     · 빈칸: GREATEST(0, inventory.max_slots - inventory.used_slots) — 302의 capsule_claim_pending와 같은 식이다.
--     · 필요 칸수: capsule_policy(id = 1)의 guaranteed_count + bonus_count — 서버 코드의 neededSlotsOf와 같은 값이다.
--     · blocked = 가득 && free < needed.
--   판정의 단일 원천이다. TS는 이 함수를 부르기만 하고 같은 판정을 따로 구현하지 않는다.
--
-- 규칙 해석
--   - 모르면 막지 않는다: 캡슐 행·인벤토리 행·정책 행이 하나라도 없으면 blocked=false(free·needed는 읽은 값, 못 읽은 값은 0)다.
--     잘못 막으면 유저의 활동 기록이 동기화되지 않기 때문이다. 캡슐 행이 없는 신규 유저가 대표적이다.
--   - 읽기 전용이다(STABLE, 잠금·쓰기 없음). 동기화 입구에서 부르므로 다른 함수와 잠금 순서가 얽히지 않는다.
--   - 이용 정지·트라이브 없음 판정은 이 함수가 하지 않는다. 호출하는 sync.ts가 두 검사(assertHasTribe·assertNotSuspended) 뒤에 부른다.
--   - 권한: service_role만 실행한다(302·303과 같은 방식). 함수 EXECUTE는 기본으로 PUBLIC에 열려 있으므로 REVOKE ALL FROM PUBLIC이 필수다.
--
-- 적용 전 확인(읽기 전용)
--   SELECT proname FROM pg_proc WHERE proname = 'capsule_receive_blocked';                                -- 0행
-- 적용 후 확인(읽기 전용)
--   SELECT proname, prosecdef, provolatile FROM pg_proc WHERE proname = 'capsule_receive_blocked';        -- 1행, true, s
--   SELECT public.capsule_receive_blocked('<유저 id>');                                                  -- {blocked, free, needed}
--   SELECT count(*) FROM public.user_capsules c JOIN public.inventory i USING (user_id)
--    WHERE c.filled >= c.required AND GREATEST(0, i.max_slots - i.used_slots) <
--          (SELECT guaranteed_count + bonus_count FROM public.capsule_policy WHERE id = 1);               -- 지금 막히는 유저 수
-- 되돌림: 같은 번호의 320_capsule_receive_blocked_down.sql

CREATE OR REPLACE FUNCTION public.capsule_receive_blocked(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_needed INTEGER;
  v_free INTEGER;
  v_full BOOLEAN;
  v_cap_found BOOLEAN;
  v_inv_found BOOLEAN;
  v_policy_found BOOLEAN;
BEGIN
  SELECT guaranteed_count + bonus_count INTO v_needed FROM public.capsule_policy WHERE id = 1;
  v_policy_found := FOUND;

  SELECT (filled >= required) INTO v_full FROM public.user_capsules WHERE user_id = p_user_id;
  v_cap_found := FOUND;

  SELECT GREATEST(0, max_slots - used_slots) INTO v_free FROM public.inventory WHERE user_id = p_user_id;
  v_inv_found := FOUND;

  RETURN jsonb_build_object(
    'blocked', (v_policy_found AND v_cap_found AND v_inv_found AND v_full AND v_free < v_needed),
    'free', COALESCE(v_free, 0),
    'needed', COALESCE(v_needed, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.capsule_receive_blocked(UUID) IS
  '캡슐이 가득(filled >= required)이고 인벤토리 빈칸이 guaranteed_count+bonus_count보다 적으면 blocked=true. {blocked, free, needed}를 돌려준다. 캡슐·인벤토리·정책 행이 없으면 막지 않는다. 읽기 전용. service_role 전용.';

REVOKE ALL ON FUNCTION public.capsule_receive_blocked(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capsule_receive_blocked(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capsule_receive_blocked(UUID) TO service_role;
