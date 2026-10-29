-- 301_capsule_auto_fill.sql
-- 동기화 자동 채움의 DB 함수 셋 (티켓 20261028_1733 1회, 상위 20261028_1730, 결정 D1·D2·D3)
--
-- 새 함수 3개만 더한다(확장 단계, db-migration-rules.md 1절). 옛 함수 capsule_next_required·capsule_get_or_create·
-- capsule_fill·capsule_open·jam_apply와 옛 열 capsule_chapter_costs.fill_amount는 건드리지 않는다
-- (프로덕션 main이 옛 함수를 쓴다). 새 표·새 열은 없다(열은 마이그레이션 300이 만들었다).
-- 이 함수들을 부르는 서버 코드는 2~3회차 티켓이다. 이 파일만 적용해도 옛 코드는 그대로 동작한다.
--
-- 함수
--   capsule_next_required_v2(uuid) -> (required, chapter_no)
--     새 캡슐의 필요량. 챕터가 없으면 capsule_policy.pre_quest_fill_amount, 있으면 capsule_chapter_costs.fill_amount_v2,
--     그 챕터 행에 값이 없으면(표의 마지막보다 높은 챕터 포함) fill_amount_v2가 있는 마지막 행의 값.
--   capsule_auto_fill(uuid) -> jsonb {ok, applied, required, filled, full, balance, chapterNo}
--     이용 정지 확인 → 캡슐 행 잠금 → filled=0이면 필요량을 v2로 맞춤 → 이미 가득이면 applied=0,full=true →
--     아니면 «지갑 잔액과 남은 양 중 작은 만큼» jam_apply(-n,'capsule_fill')로 빼고 filled를 올린다.
--     한 번에 캡슐 하나만 채운다. 잔액이 0이면 applied=0, full=false로 정상 반환한다(오류가 아니다, 반복의 종료 신호).
--   capsule_open_counted(uuid, jsonb) -> jsonb {...capsule_open 결과, chapterNo, reachedChapters, chapterCount}
--     capsule_open을 같은 트랜잭션에서 부른 뒤, 열린 캡슐에 챕터가 있었으면 user_chapters.capsule_full_count를 1 올리고
--     advance_count에 닿으면 다음 챕터로 올린다(횟수 0으로, chapter_ups 한 줄). 열린 직후의 다음 캡슐 필요량은 v2로 덮어쓴다.
--     capsule_open이 ok=false를 주면 그 결과를 그대로 돌려준다(아무것도 바꾸지 않았다).
--
-- 규칙 해석(티켓 「동작 설계」)
--   - 챕터 횟수를 세는 조건: 열린 캡슐의 chapter_no가 NULL이 아니고(퀘스트 전 첫 캡슐은 세지 않는다, B5)
--     user_chapters.chapter_no도 NULL이 아닐 때. 횟수는 «지금 유저의 챕터»에 센다.
--   - advance_count가 NULL(챕터 10)이거나 챕터 정의에 다음 챕터가 없으면 횟수만 올리고 멈춘다(B4).
--   - 한 번의 열기로 챕터는 최대 한 번 오른다(advance_count >= 1이고 오르면 횟수가 0으로 돌아간다).
--   - 반환 chapterNo = 횟수를 센 챕터(오르기 전). 오른 챕터는 reachedChapters, chapterCount = 센 뒤의 횟수(오르면 0).
--     세지 않았으면 chapterNo·chapterCount는 null, reachedChapters는 빈 배열.
--   - total_score(옛 점수 장부)는 건드리지 않는다.
--   - 자동 채움은 filled=0일 때 필요량·챕터를 v2 기준으로 다시 맞춘다. 퀘스트를 마친 뒤 아직 채우지 않은 «양 5» 캡슐은
--     챕터 1의 캡슐로 바뀐다. 이미 채우기 시작한 캡슐은 그대로 둔다.
--
-- 실행 주의
--   - 함수만 만들므로 잠금·백필이 없다. 한 트랜잭션으로 실행한다.
--   - 새 함수는 service_role만 실행한다(PUBLIC·anon·authenticated 회수).
--
-- 적용 전 확인(읽기 전용 SELECT)
--   SELECT proname FROM pg_proc WHERE proname IN ('capsule_next_required_v2','capsule_auto_fill','capsule_open_counted');  -- 0행
--   SELECT chapter_no, fill_amount_v2, advance_count FROM public.capsule_chapter_costs ORDER BY chapter_no;               -- 10행, 300 적용 값
--
-- 적용 후 확인(읽기 전용 SELECT)
--   SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('capsule_next_required_v2','capsule_auto_fill','capsule_open_counted');  -- 3행, true
--   SELECT has_function_privilege('authenticated', 'public.capsule_auto_fill(uuid)', 'EXECUTE');                          -- false
--   SELECT has_function_privilege('service_role', 'public.capsule_open_counted(uuid, jsonb)', 'EXECUTE');                 -- true
--   SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc
--    WHERE proname IN ('capsule_fill','capsule_open','capsule_next_required','jam_apply');                                -- 적용 전과 같은 행
--
-- 적용 직후 롤백 실측 권장(DO 블록 + RAISE EXCEPTION으로 되돌림, 시험 계정 사용):
--   빈 지갑 → applied=0·full=false / 잼 적립 후 → 남은 양과 잔액 중 작은 만큼 / 가득 → capsule_open_counted → 횟수 +1,
--   advance_count 번째 열기에서 챕터 오름·횟수 0·chapter_ups 한 줄 / 원장 합 = 캡슐에 채운 양 + 지갑 잔액

-- ----------------------------------------------------------------
-- 1. capsule_next_required_v2 — 새 캡슐의 필요량(v2)과 챕터
--    옛 capsule_next_required와 같은 모양(OUT required, chapter_no)이다.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capsule_next_required_v2(p_user_id UUID, OUT required INTEGER, OUT chapter_no INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chapter INTEGER;
  v_required INTEGER;
BEGIN
  SELECT uc.chapter_no INTO v_chapter FROM public.user_chapters uc WHERE uc.user_id = p_user_id;
  IF v_chapter IS NULL THEN
    SELECT p.pre_quest_fill_amount INTO v_required FROM public.capsule_policy p WHERE p.id = 1;
  ELSE
    SELECT c.fill_amount_v2 INTO v_required FROM public.capsule_chapter_costs c WHERE c.chapter_no = v_chapter;
    IF v_required IS NULL THEN
      SELECT c.fill_amount_v2 INTO v_required
        FROM public.capsule_chapter_costs c
       WHERE c.fill_amount_v2 IS NOT NULL
       ORDER BY c.chapter_no DESC
       LIMIT 1;
    END IF;
  END IF;

  IF v_required IS NULL THEN
    RAISE EXCEPTION 'capsule_next_required_v2: 필요량을 정할 수 없습니다 (chapter %)', v_chapter USING ERRCODE = 'check_violation';
  END IF;

  required := v_required;
  chapter_no := v_chapter;
END;
$$;

COMMENT ON FUNCTION public.capsule_next_required_v2(UUID) IS
  '새 캡슐의 필요량과 챕터(자동 채움 구조). 챕터가 없으면 퀘스트 전 값, 있으면 fill_amount_v2(없으면 값이 있는 마지막 행). 옛 capsule_next_required는 fill_amount를 읽는다. service_role 전용.';

-- ----------------------------------------------------------------
-- 2. capsule_auto_fill — 지갑 잼으로 캡슐 하나를 채운다
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capsule_auto_fill(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap public.user_capsules;
  v_next RECORD;
  v_balance BIGINT;
  v_remaining INTEGER;
  v_amount INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  PERFORM public.capsule_get_or_create(p_user_id);
  SELECT * INTO v_cap FROM public.user_capsules WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'capsule_changed');
  END IF;

  -- 아직 채우지 않은 캡슐은 필요량·챕터를 v2 기준으로 맞춘다(옛 함수가 만든 캡슐 포함).
  IF v_cap.filled = 0 THEN
    SELECT * INTO v_next FROM public.capsule_next_required_v2(p_user_id);
    IF v_cap.required IS DISTINCT FROM v_next.required OR v_cap.chapter_no IS DISTINCT FROM v_next.chapter_no THEN
      UPDATE public.user_capsules
         SET required = v_next.required, chapter_no = v_next.chapter_no, updated_at = now()
       WHERE user_id = p_user_id
       RETURNING * INTO v_cap;
    END IF;
  END IF;

  SELECT COALESCE(w.balance, 0) INTO v_balance FROM public.jam_wallets w WHERE w.user_id = p_user_id;
  v_balance := COALESCE(v_balance, 0);

  v_remaining := v_cap.required - v_cap.filled;
  IF v_remaining > 0 AND v_balance > 0 THEN
    v_amount := LEAST(v_remaining::BIGINT, v_balance)::INTEGER;
    PERFORM public.jam_apply(p_user_id, -v_amount, 'capsule_fill');
    UPDATE public.user_capsules
       SET filled = filled + v_amount, updated_at = now()
     WHERE user_id = p_user_id
     RETURNING * INTO v_cap;
    v_balance := v_balance - v_amount;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'applied', v_amount,
    'required', v_cap.required,
    'filled', v_cap.filled,
    'full', v_cap.filled >= v_cap.required,
    'balance', v_balance,
    'chapterNo', v_cap.chapter_no
  );
END;
$$;

COMMENT ON FUNCTION public.capsule_auto_fill(UUID) IS
  '지갑 잼으로 지금 캡슐 하나를 채운다(남은 양과 잔액 중 작은 만큼, jam_apply capsule_fill). 이미 가득이면 applied=0,full=true. 잔액이 0이면 applied=0,full=false로 정상 반환. service_role 전용.';

-- ----------------------------------------------------------------
-- 3. capsule_open_counted — capsule_open + 챕터 횟수 세기·오름 + 다음 캡슐 필요량 v2
--    capsule_open과 같은 트랜잭션이다. capsule_open 안에서 예외가 나면 전체가 되돌려진다.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capsule_open_counted(p_user_id UUID, p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap public.user_capsules;
  v_open JSONB;
  v_chapter INTEGER;
  v_count INTEGER;
  v_advance INTEGER;
  v_next_chapter INTEGER;
  v_counted_chapter INTEGER := NULL;
  v_result_count INTEGER := NULL;
  v_reached INTEGER[] := ARRAY[]::INTEGER[];
  v_next RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  -- 열기 전의 캡슐(챕터 여부)을 기억한다. 캡슐 행 잠금은 capsule_open이 같은 트랜잭션에서 다시 잡는다.
  PERFORM public.capsule_get_or_create(p_user_id);
  SELECT * INTO v_cap FROM public.user_capsules WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'capsule_changed');
  END IF;

  v_open := public.capsule_open(p_user_id, p_items);
  IF NOT COALESCE((v_open->>'ok')::BOOLEAN, FALSE) THEN
    RETURN v_open;
  END IF;

  -- 챕터 횟수: 퀘스트 전 캡슐(chapter_no NULL)이거나 유저에 챕터가 없으면 세지 않는다.
  IF v_cap.chapter_no IS NOT NULL THEN
    SELECT uc.chapter_no, uc.capsule_full_count INTO v_chapter, v_count
      FROM public.user_chapters uc WHERE uc.user_id = p_user_id FOR UPDATE;
    IF FOUND AND v_chapter IS NOT NULL THEN
      v_counted_chapter := v_chapter;
      v_count := v_count + 1;

      SELECT c.advance_count INTO v_advance FROM public.capsule_chapter_costs c WHERE c.chapter_no = v_chapter;
      IF v_advance IS NOT NULL AND v_count >= v_advance THEN
        SELECT d.chapter_no INTO v_next_chapter
          FROM public.chapter_definitions d
         WHERE d.chapter_no > v_chapter
         ORDER BY d.chapter_no
         LIMIT 1;
        IF v_next_chapter IS NOT NULL THEN
          INSERT INTO public.chapter_ups (user_id, chapter_no) VALUES (p_user_id, v_next_chapter)
            ON CONFLICT (user_id, chapter_no) DO NOTHING;
          v_reached := ARRAY[v_next_chapter];
          v_chapter := v_next_chapter;
          v_count := 0;
        END IF;
      END IF;

      UPDATE public.user_chapters
         SET chapter_no = v_chapter, capsule_full_count = v_count, updated_at = now()
       WHERE user_id = p_user_id;
      v_result_count := v_count;
    END IF;
  END IF;

  -- 열린 직후의 다음 캡슐: 오른 챕터를 반영해 v2 기준으로 덮어쓴다(capsule_open은 옛 fill_amount로 정했다).
  SELECT * INTO v_next FROM public.capsule_next_required_v2(p_user_id);
  UPDATE public.user_capsules
     SET required = v_next.required, filled = 0, chapter_no = v_next.chapter_no, updated_at = now()
   WHERE user_id = p_user_id;

  RETURN v_open || jsonb_build_object(
    'next', jsonb_build_object('required', v_next.required, 'filled', 0),
    'chapterNo', v_counted_chapter,
    'reachedChapters', to_jsonb(v_reached),
    'chapterCount', v_result_count
  );
END;
$$;

COMMENT ON FUNCTION public.capsule_open_counted(UUID, JSONB) IS
  'capsule_open 뒤 같은 트랜잭션에서 챕터 횟수 +1(퀘스트 전 캡슐은 제외), advance_count에 닿으면 다음 챕터로 오름(횟수 0, chapter_ups 한 줄), 다음 캡슐 필요량을 v2로 덮어쓴다. ok=false면 capsule_open 결과 그대로. service_role 전용.';

-- ----------------------------------------------------------------
-- 4. 실행 권한 — service_role만
-- ----------------------------------------------------------------
REVOKE ALL ON FUNCTION public.capsule_next_required_v2(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capsule_next_required_v2(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capsule_next_required_v2(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.capsule_auto_fill(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capsule_auto_fill(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capsule_auto_fill(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.capsule_open_counted(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capsule_open_counted(UUID, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capsule_open_counted(UUID, JSONB) TO service_role;

-- 되돌림 SQL
-- 새로 만든 함수만 지운다. 이 함수를 부르는 새 코드(2~3회차)를 먼저 되돌린다. 옛 함수는 바뀌지 않았으므로 복원할 것이 없다.
-- 함수를 지워도 이미 일어난 챕터 횟수(user_chapters.capsule_full_count)·chapter_ups·jam_transactions(capsule_fill) 줄은 남는다.
-- DROP FUNCTION IF EXISTS public.capsule_open_counted(UUID, JSONB);
-- DROP FUNCTION IF EXISTS public.capsule_auto_fill(UUID);
-- DROP FUNCTION IF EXISTS public.capsule_next_required_v2(UUID);
