-- 365_chapter_jam_apply.sql
-- 챕터 진행값 적립과 승급 판정 함수 추가 (티켓 20261127_1725, 상위 20261127_1720)
--
-- 확장 단계다(db-migration-rules.md 1절). 새 표 chapter_jam_events 1개와 새 함수 chapter_jam_apply 1개만 덧붙인다.
-- 옛 함수(jam_apply, jam_apply_service_activity, capsule_auto_fill, chapter_start 등), 열, 정책, 기존 표는 건드리지 않는다.
-- 호출하는 곳이 아직 없다(B4 이중 쓰기, C2 전환이 부른다). 적용해도 서비스 동작이 바뀌지 않는다.
--
-- 두 모드
--   p_promote = FALSE : 진행값(user_chapters.chapter_jam)만 더한다. 챕터 번호와 chapter_ups는 건드리지 않는다(B4 이중 쓰기).
--   p_promote = TRUE  : 더한 뒤 승급한다(C2 전환 뒤). 기본값.
--   승급 규칙(Q-a): 필요량(chapter_definitions.required_jam) 이상이면 필요량을 빼고 다음 챕터로 올린다.
--   한 번에 여러 챕터를 넘을 수 있고 넘친 잼은 이월한다. 마지막 챕터(required_jam NULL)에서는 진행값만 쌓인다.
--
-- 멱등: 같은 (user_id, event_key)는 한 번만 센다. 두 번째 호출은 duplicate로 돌려주고 값을 바꾸지 않는다.
-- 챕터 보상 지급(C3), 인벤토리 빈칸 처리(Q-c), 동기화 막힘 규칙은 이 함수에 넣지 않는다.
--
-- 적용 대상: Supabase는 staging·프로덕션 공용 단일 DB라 적용 즉시 프로덕션에 반영된다.
-- 되돌림은 365_chapter_jam_apply_down.sql.

-- 1. chapter_jam_events — 진행값 적립 멱등 키 기록
CREATE TABLE IF NOT EXISTS public.chapter_jam_events (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL CHECK (btrim(event_key) <> ''),
  amount INTEGER NOT NULL CHECK (amount > 0),
  promoted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_key)
);

-- 정책은 만들지 않는다. service_role과 SECURITY DEFINER 함수만 접근한다.
ALTER TABLE public.chapter_jam_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.chapter_jam_events IS
  '챕터 진행값 적립의 멱등 키 기록. (user_id, event_key)가 키이고 같은 키는 한 번만 센다. promoted는 그 적립으로 챕터가 올랐는지. chapter_jam_apply()로만 쓴다.';

-- 2. chapter_jam_apply — 진행값 적립과 승급
CREATE OR REPLACE FUNCTION public.chapter_jam_apply(
  p_user_id UUID,
  p_amount INTEGER,
  p_event_key TEXT,
  p_promote BOOLEAN DEFAULT TRUE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chapter_no INTEGER;
  v_chapter_jam INTEGER;
  v_required INTEGER;
  v_next INTEGER;
  v_reached INTEGER[] := ARRAY[]::INTEGER[];
  v_rows INTEGER;
  v_guard INTEGER := 0;
  v_promoted BOOLEAN := FALSE;
BEGIN
  -- 1) 입력 검사
  IF p_user_id IS NULL
     OR p_amount IS NULL OR p_amount <= 0
     OR p_event_key IS NULL OR btrim(p_event_key) = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_input');
  END IF;

  -- 2) 이용 정지 중이면 거절
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  -- 3) 유저 챕터 행을 잠그고 읽는다. 행이 없거나 챕터가 없으면(퀘스트 전·옛 유저) 아무것도 저장하지 않는다.
  SELECT chapter_no, chapter_jam
    INTO v_chapter_no, v_chapter_jam
    FROM public.user_chapters
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND OR v_chapter_no IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'no_chapter');
  END IF;

  -- 4) 멱등 키 기록. 이미 있으면 같은 일이므로 값을 바꾸지 않는다.
  INSERT INTO public.chapter_jam_events (user_id, event_key, amount)
  VALUES (p_user_id, p_event_key, p_amount)
  ON CONFLICT (user_id, event_key) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object(
      'ok', TRUE, 'duplicate', TRUE, 'applied', 0,
      'chapterNo', v_chapter_no, 'chapterJam', v_chapter_jam,
      'reachedChapters', to_jsonb(v_reached)
    );
  END IF;

  -- 5) 진행값 가산
  v_chapter_jam := v_chapter_jam + p_amount;

  -- 6) 승급 모드: 필요량을 채운 만큼 챕터를 올린다(안전 한도 100회).
  IF p_promote THEN
    WHILE v_guard < 100 LOOP
      v_guard := v_guard + 1;

      SELECT required_jam INTO v_required
        FROM public.chapter_definitions
       WHERE chapter_no = v_chapter_no;

      EXIT WHEN v_required IS NULL OR v_chapter_jam < v_required;

      SELECT MIN(chapter_no) INTO v_next
        FROM public.chapter_definitions
       WHERE chapter_no > v_chapter_no;

      EXIT WHEN v_next IS NULL;

      v_chapter_jam := v_chapter_jam - v_required;

      INSERT INTO public.chapter_ups (user_id, chapter_no)
      VALUES (p_user_id, v_next)
      ON CONFLICT (user_id, chapter_no) DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows > 0 THEN
        v_reached := array_append(v_reached, v_next);
      END IF;

      v_chapter_no := v_next;
      v_promoted := TRUE;
    END LOOP;
  END IF;

  -- 7) 갱신. capsule_full_count, total_score는 건드리지 않는다.
  UPDATE public.user_chapters
     SET chapter_no = v_chapter_no,
         chapter_jam = v_chapter_jam,
         updated_at = now()
   WHERE user_id = p_user_id;

  -- 이번 적립으로 승급이 한 번이라도 있었으면 이벤트 행에 표시한다
  -- (chapter_ups에 이미 있던 챕터를 지나간 경우도 승급으로 본다).
  IF v_promoted THEN
    UPDATE public.chapter_jam_events
       SET promoted = TRUE
     WHERE user_id = p_user_id AND event_key = p_event_key;
  END IF;

  -- 8) 현재 챕터의 필요량(마지막 챕터면 NULL)
  SELECT required_jam INTO v_required
    FROM public.chapter_definitions
   WHERE chapter_no = v_chapter_no;

  RETURN jsonb_build_object(
    'ok', TRUE, 'duplicate', FALSE, 'applied', p_amount, 'promote', p_promote,
    'chapterNo', v_chapter_no, 'chapterJam', v_chapter_jam,
    'requiredJam', v_required,
    'reachedChapters', to_jsonb(v_reached)
  );
END;
$$;

COMMENT ON FUNCTION public.chapter_jam_apply(UUID, INTEGER, TEXT, BOOLEAN) IS
  '챕터 진행값(user_chapters.chapter_jam)을 p_amount만큼 더한다. 같은 (p_user_id, p_event_key)는 한 번만 세고 두 번째는 duplicate. p_promote=FALSE는 진행값만 더하고 챕터·chapter_ups는 그대로(B4 이중 쓰기), TRUE는 required_jam 이상이면 필요량을 빼고 다음 챕터로 올린다(한 번에 여러 챕터, 넘친 잼 이월, 마지막 챕터는 진행값만 쌓임). B4는 FALSE, C2부터 TRUE. 입력 오류는 invalid_input, 정지 중은 user_suspended, 챕터 없는 유저는 no_chapter이며 아무것도 저장하지 않는다. reachedChapters는 이번 호출로 chapter_ups에 새로 들어간 챕터. service_role 전용.';

REVOKE ALL ON FUNCTION public.chapter_jam_apply(UUID, INTEGER, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chapter_jam_apply(UUID, INTEGER, TEXT, BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chapter_jam_apply(UUID, INTEGER, TEXT, BOOLEAN) TO service_role;

-- 되돌림 SQL
-- 짝 파일 365_chapter_jam_apply_down.sql 참고. 이 함수를 부르는 코드(B4, C2)를 먼저 되돌린 뒤 지운다.
-- DROP FUNCTION IF EXISTS public.chapter_jam_apply(UUID, INTEGER, TEXT, BOOLEAN);
-- DROP TABLE IF EXISTS public.chapter_jam_events;
