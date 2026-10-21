-- 259_admin_change_user_tribe.sql
-- JAM 2.0 입장: 어드민이 유저의 트라이브를 바꾸는 함수 — 갱신·참가 취소·변경 기록을 한 트랜잭션으로 (티켓 20261021_1247 2회, 상위 20261021_1246, 운영 로직 2.4절·13.2절)
--
-- 새 함수 1개만 덧붙인다. 옛 함수·옛 칸의 서명은 바꾸지 않는다(mission_cancel_for_tribe_change는 부르기만 한다). 선례는 252 admin_deduct_points다.
-- 옛 프로덕션 코드는 이 함수를 모르고 쓰지도 않는다. 258(user_tribe_changes)이 먼저 적용돼 있어야 한다.
--
-- 배경
--   - 트라이브를 바꾸는 길은 어드민 변경뿐이다(유저는 직접 바꿀 수 없다 — 260이 DB에서도 막는다).
--   - mission_cancel_for_tribe_change(249)는 users.tribe_id의 «지금» 값을 읽어 새 트라이브가 대상이 아닌 트라이브 제한 미션의 참가를 취소한다.
--     그래서 트라이브를 먼저 갱신한 뒤에 불러야 한다. 앱에서 차례로 부르면 갱신만 남고 기록·취소가 빠질 수 있어, 한 트랜잭션 함수로 묶는다.
--
-- 규칙
--   - admin_change_user_tribe(p_admin_id, p_user_id, p_new_tribe_id, p_reason_code, p_memo) → JSONB.
--     한 번의 호출 안에서 순서대로 (가) 사유 코드 검사 (나) 유저 행 FOR UPDATE (다) 검사 (라) users.tribe_id 갱신
--     (마) mission_cancel_for_tribe_change 호출(갱신 뒤) (바) user_tribe_changes 삽입 (사) 결과 반환.
--     같은 유저에게 동시에 들어온 변경은 (나)의 행 잠금으로 직렬화된다. 거절하면 아무것도 바꾸지 않는다.
--     예외가 나면 함수 전체가 롤백된다(갱신만 남는 경우가 없다).
--       {ok:true, changeId, fromTribeId, toTribeId, toTribeName, cancelled:[{missionId, title}]}   -- cancelled가 빈 배열이면 취소된 미션이 없다
--       {ok:false, code:'reason_required'}   사유 코드가 비었다(앞뒤 공백 제거 뒤)
--       {ok:false, code:'user_not_found'}    유저가 없다
--       {ok:false, code:'no_tribe'}          트라이브를 고르지 않은 유저다(그런 유저는 고르기 화면에서 스스로 고른다)
--       {ok:false, code:'invalid_tribe'}     새 트라이브가 없거나 비활성이다
--       {ok:false, code:'same_tribe'}        지금 트라이브와 같다
--   - 사유 코드의 값 검증(고정 목록, «기타» 메모 필수, 메모 길이 상한)은 앱이 한다(lib/admin/user-tribe.ts). 이 함수는 코드와 메모를 그대로 남긴다.
--     메모는 앞뒤 공백을 지우고 빈 문자열이면 NULL로 남긴다.
--   - changed_by(p_admin_id)가 users에 없으면 NULL로 저장한다(어드민이 환경변수 화이트리스트 계정이라 users 행이 없는 경우에도 변경이 실패하지 않게 한다).
--   - 새 트라이브 행은 FOR SHARE로 잠가 검사와 갱신 사이에 지워지거나 비활성으로 바뀌지 않게 한다(users.tribe_id 외래 키도 삭제는 막는다).
--   - 이미 받은 배지·잼·챕터와 완료 기록은 건드리지 않는다. 보류 중인 아이템 배지도 옛 트라이브의 것 그대로 둔다(이미 번 것을 유지하는 원칙).
--   - service_role만 실행한다(서버 전용). anon·authenticated·PUBLIC 권한은 회수한다.
--
-- 적용 전 확인 쿼리(읽기 전용 SELECT):
--   SELECT to_regclass('public.user_tribe_changes');                                                                     -- user_tribe_changes (258 적용됨)
--   SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'mission_cancel_for_tribe_change'; -- 1행 (249 적용됨)
--   SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'admin_change_user_tribe';     -- 0
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT proname, prosecdef, proconfig, pg_get_function_identity_arguments(oid) FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace AND proname = 'admin_change_user_tribe';
--     -- 1행, prosecdef = true, proconfig = {search_path=public}, 인자 = p_admin_id uuid, p_user_id uuid, p_new_tribe_id uuid, p_reason_code text, p_memo text DEFAULT NULL::text
--   SELECT has_function_privilege('authenticated','public.admin_change_user_tribe(uuid,uuid,uuid,text,text)','EXECUTE'),
--          has_function_privilege('anon','public.admin_change_user_tribe(uuid,uuid,uuid,text,text)','EXECUTE'),
--          has_function_privilege('service_role','public.admin_change_user_tribe(uuid,uuid,uuid,text,text)','EXECUTE');   -- false, false, true
--   SELECT count(*) FROM public.user_tribe_changes;                                                                       -- 0 (아직 아무도 바꾸지 않았다)
--
-- 롤백 실측(카리나가 적용 직후 한 번 돌린다 — 쓰기를 하지만 맨 끝의 RAISE EXCEPTION이 전체를 되돌리므로 데이터가 남지 않는다.
--   성공하면 'ROLLBACK_OK: ...' 메시지가 오류로 돌아온다. 그 메시지가 아닌 다른 오류가 오면 어느 단계에서 실패했는지가 메시지에 있다. 오류 메시지의 값은 실행한 DB 기준이다):
--   DO $$
--   DECLARE
--     v_user      UUID;  v_from UUID;  v_other UUID;  v_mission UUID;  v_nobody UUID;
--     r           JSONB; v_cnt INTEGER; v_row public.user_tribe_changes;
--     v_log       TEXT := '';
--   BEGIN
--     SELECT u.id, u.tribe_id INTO v_user, v_from FROM public.users u WHERE u.tribe_id IS NOT NULL LIMIT 1;
--     SELECT t.id INTO v_other FROM public.tribes t WHERE t.is_active AND t.id <> v_from ORDER BY t.sort_order LIMIT 1;
--     SELECT u.id INTO v_nobody FROM public.users u WHERE u.tribe_id IS NULL LIMIT 1;
--     IF v_user IS NULL OR v_other IS NULL THEN RAISE EXCEPTION 'NO_FIXTURE: 트라이브가 있는 유저 또는 다른 활성 트라이브가 없다'; END IF;
--
--     -- ① 거절 코드 (아무것도 바꾸지 않는다)
--     r := public.admin_change_user_tribe(NULL, v_user, v_other, '   ', NULL);
--     IF r->>'code' IS DISTINCT FROM 'reason_required' THEN RAISE EXCEPTION '① reason_required 실패: %', r; END IF;
--     r := public.admin_change_user_tribe(NULL, gen_random_uuid(), v_other, 'ops_fix', NULL);
--     IF r->>'code' IS DISTINCT FROM 'user_not_found' THEN RAISE EXCEPTION '① user_not_found 실패: %', r; END IF;
--     IF v_nobody IS NOT NULL THEN
--       r := public.admin_change_user_tribe(NULL, v_nobody, v_other, 'ops_fix', NULL);
--       IF r->>'code' IS DISTINCT FROM 'no_tribe' THEN RAISE EXCEPTION '① no_tribe 실패: %', r; END IF;
--     END IF;
--     r := public.admin_change_user_tribe(NULL, v_user, gen_random_uuid(), 'ops_fix', NULL);
--     IF r->>'code' IS DISTINCT FROM 'invalid_tribe' THEN RAISE EXCEPTION '① invalid_tribe(없는 트라이브) 실패: %', r; END IF;
--     r := public.admin_change_user_tribe(NULL, v_user, v_from, 'ops_fix', NULL);
--     IF r->>'code' IS DISTINCT FROM 'same_tribe' THEN RAISE EXCEPTION '① same_tribe 실패: %', r; END IF;
--     SELECT count(*) INTO v_cnt FROM public.user_tribe_changes;
--     IF v_cnt <> 0 THEN RAISE EXCEPTION '① 거절인데 기록이 생겼다: %', v_cnt; END IF;
--     IF (SELECT tribe_id FROM public.users WHERE id = v_user) IS DISTINCT FROM v_from THEN RAISE EXCEPTION '① 거절인데 트라이브가 바뀌었다'; END IF;
--     v_log := v_log || '①거절 코드 통과; ';
--
--     -- ② 참가 취소 연결: 아직 트라이브 제한이 없는 미션 하나를 지금 트라이브 전용으로 만들고 이 유저를 참가시킨 뒤 다른 트라이브로 바꾼다
--     SELECT m.id INTO v_mission FROM public.missions m
--      WHERE NOT EXISTS (SELECT 1 FROM public.mission_allowed_tribes a WHERE a.mission_id = m.id) LIMIT 1;
--     IF v_mission IS NOT NULL THEN
--       INSERT INTO public.mission_allowed_tribes (mission_id, tribe_id) VALUES (v_mission, v_from);
--       INSERT INTO public.user_mission_participations (user_id, mission_id) VALUES (v_user, v_mission) ON CONFLICT (user_id, mission_id) DO NOTHING;
--     END IF;
--
--     -- ③ 성공: 어드민 id가 users에 없으면 changed_by가 NULL이어야 한다(gen_random_uuid()는 users에 없다)
--     r := public.admin_change_user_tribe(gen_random_uuid(), v_user, v_other, 'wrong_pick', '  롤백 실측  ');
--     IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION '③ 성공 호출이 거절됐다: %', r; END IF;
--     IF (SELECT tribe_id FROM public.users WHERE id = v_user) IS DISTINCT FROM v_other THEN RAISE EXCEPTION '③ users.tribe_id가 안 바뀌었다'; END IF;
--     SELECT * INTO v_row FROM public.user_tribe_changes WHERE id = (r->>'changeId')::uuid;
--     IF v_row.id IS NULL THEN RAISE EXCEPTION '③ 변경 기록이 없다'; END IF;
--     IF v_row.from_tribe_id <> v_from OR v_row.to_tribe_id <> v_other OR v_row.user_id <> v_user THEN RAISE EXCEPTION '③ 기록의 트라이브·유저가 다르다: %', to_jsonb(v_row); END IF;
--     IF v_row.changed_by IS NOT NULL THEN RAISE EXCEPTION '③ changed_by가 NULL이 아니다: %', v_row.changed_by; END IF;
--     IF v_row.memo IS DISTINCT FROM '롤백 실측' OR v_row.reason_code <> 'wrong_pick' THEN RAISE EXCEPTION '③ 사유·메모(앞뒤 공백 제거)가 다르다: %', to_jsonb(v_row); END IF;
--     IF v_row.cancelled_mission_count <> jsonb_array_length(r->'cancelled') THEN RAISE EXCEPTION '③ 취소 수와 결과가 다르다: %', r; END IF;
--     IF v_mission IS NOT NULL THEN
--       IF jsonb_array_length(r->'cancelled') < 1 THEN RAISE EXCEPTION '③ 참가 취소가 안 됐다(갱신 뒤에 불렀는지 확인): %', r; END IF;
--       IF EXISTS (SELECT 1 FROM public.user_mission_participations WHERE user_id = v_user AND mission_id = v_mission) THEN RAISE EXCEPTION '③ 참가 행이 남았다'; END IF;
--       IF NOT EXISTS (SELECT 1 FROM public.mission_participation_cancellations WHERE user_id = v_user AND mission_id = v_mission AND new_tribe_id = v_other) THEN RAISE EXCEPTION '③ 취소 기록의 새 트라이브가 다르다'; END IF;
--     END IF;
--     v_log := v_log || '③성공·기록·취소 통과(취소 ' || jsonb_array_length(r->'cancelled') || '건); ';
--
--     -- ④ 방금 바뀐 트라이브로 다시 바꾸면 same_tribe다
--     r := public.admin_change_user_tribe(NULL, v_user, v_other, 'wrong_pick', NULL);
--     IF r->>'code' IS DISTINCT FROM 'same_tribe' THEN RAISE EXCEPTION '④ 같은 트라이브 재요청이 거절되지 않았다: %', r; END IF;
--
--     RAISE EXCEPTION 'ROLLBACK_OK: %', v_log;   -- 이 예외가 위의 모든 쓰기를 되돌린다
--   END $$;
--   (행 잠금의 직렬화는 한 세션으로 재현할 수 없다. 두 세션에서 같은 유저로 이 함수를 동시에 부르면 뒤 호출이 앞 호출이 끝날 때까지 기다리고, 앞 호출이 새 트라이브로 바꿨다면 뒤 호출은 same_tribe 또는 새 값 기준으로 처리된다.)
--
-- 적용 후(롤백 실측 뒤) 다시 확인: SELECT count(*) FROM public.user_tribe_changes;   -- 0, SELECT count(*) FROM public.mission_participation_cancellations;   -- 적용 전과 같다

CREATE OR REPLACE FUNCTION public.admin_change_user_tribe(
  p_admin_id     UUID,
  p_user_id      UUID,
  p_new_tribe_id UUID,
  p_reason_code  TEXT,
  p_memo         TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_reason      TEXT;
  v_memo        TEXT;
  v_from_tribe  UUID;
  v_new_name    TEXT;
  v_changed_by  UUID;
  v_change_id   UUID;
  v_cancelled   JSONB;
BEGIN
  -- (가) 사유 코드. 앱이 고정 목록으로 검증하고, 이 함수는 비어 있는 값만 막는다
  v_reason := btrim(COALESCE(p_reason_code, ''));
  IF v_reason = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'reason_required');
  END IF;
  v_memo := NULLIF(btrim(COALESCE(p_memo, '')), '');

  -- (나) 유저 행을 잠그고 지금 트라이브를 읽는다(같은 유저에게 동시에 들어온 변경을 직렬화한다)
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'user_not_found');
  END IF;
  SELECT u.tribe_id INTO v_from_tribe FROM public.users u WHERE u.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'user_not_found');
  END IF;

  -- (다) 검사
  IF v_from_tribe IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'no_tribe');
  END IF;

  IF p_new_tribe_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_tribe');
  END IF;
  SELECT t.name INTO v_new_name
    FROM public.tribes t
   WHERE t.id = p_new_tribe_id AND t.is_active
     FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_tribe');
  END IF;

  IF v_from_tribe = p_new_tribe_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'same_tribe');
  END IF;

  -- (라) 트라이브 갱신. 트라이브를 «지금» 값으로 읽는 취소 함수보다 반드시 먼저다
  UPDATE public.users SET tribe_id = p_new_tribe_id WHERE id = p_user_id;

  -- (마) 새 트라이브가 대상이 아닌 트라이브 제한 미션의 참가를 취소한다(완료 기록·받은 보상은 그대로)
  SELECT COALESCE(
           jsonb_agg(jsonb_build_object('missionId', c.out_mission_id, 'title', c.out_mission_title)),
           '[]'::jsonb
         )
    INTO v_cancelled
    FROM public.mission_cancel_for_tribe_change(p_user_id) AS c;

  -- (바) 변경 기록. 어드민 계정이 users에 없으면 NULL로 남긴다(외래 키 위반으로 변경 전체가 실패하지 않게 한다)
  IF p_admin_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.users a WHERE a.id = p_admin_id) THEN
    v_changed_by := p_admin_id;
  ELSE
    v_changed_by := NULL;
  END IF;

  INSERT INTO public.user_tribe_changes (
    user_id, from_tribe_id, to_tribe_id, reason_code, memo, changed_by, cancelled_mission_count
  )
  VALUES (
    p_user_id, v_from_tribe, p_new_tribe_id, v_reason, v_memo, v_changed_by, jsonb_array_length(v_cancelled)
  )
  RETURNING id INTO v_change_id;

  -- (사) 결과
  RETURN jsonb_build_object(
    'ok', TRUE,
    'changeId', v_change_id,
    'fromTribeId', v_from_tribe,
    'toTribeId', p_new_tribe_id,
    'toTribeName', v_new_name,
    'cancelled', v_cancelled
  );
END;
$function$;

COMMENT ON FUNCTION public.admin_change_user_tribe IS
  '어드민 트라이브 변경. 유저 행 잠금 → 검사 → users.tribe_id 갱신 → mission_cancel_for_tribe_change(갱신 뒤) → user_tribe_changes 삽입을 한 트랜잭션으로 처리하고, 거절하면 아무것도 바꾸지 않고 코드를 돌려준다. 서버(service role)에서만 호출. 티켓 20261021_1247.';

REVOKE ALL ON FUNCTION public.admin_change_user_tribe(UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_change_user_tribe(UUID, UUID, UUID, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_user_tribe(UUID, UUID, UUID, TEXT, TEXT) TO service_role;

-- 되돌림 SQL
-- 앱이 이 함수를 부르는 코드(lib/admin/user-tribe.ts, /api/admin/users/[id]/tribe)를 되돌린 뒤에 지운다(앱이 먼저 남아 있으면 어드민 트라이브 변경이 전부 실패한다).
-- 이 함수가 바꾼 users.tribe_id와 취소된 참가는 함수를 지워도 되돌아가지 않는다(변경 기록은 258의 표에 남아 있다. 필요하면 그 기록의 from_tribe_id로 직접 되돌린다).
-- DROP FUNCTION IF EXISTS public.admin_change_user_tribe(UUID, UUID, UUID, TEXT, TEXT);
