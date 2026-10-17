-- 221_chapters.sql
-- JAM 2.0 챕터와 점수의 저장 구조 (티켓 20261016_2339, 운영 로직 12장 "챕터")
--
-- 새 테이블 6개(chapter_definitions, chapter_names, chapter_score_rules, user_chapters,
-- chapter_score_events, chapter_ups)와 새 함수 2개(chapter_add_score, chapter_start)만 추가한다.
-- 기존 객체는 건드리지 않는다. 점수를 주는 연결·연출·소식·챕터 배지·프로필 표시는 이 파일의 범위가 아니다(묶음 5).
--
-- 원칙
--   - 누적 점수(user_chapters.total_score)와 챕터(chapter_no)는 두 함수 안에서만 바뀐다.
--   - 챕터는 내려가지 않는다. 함수는 올리기만 한다.
--   - 같은 (activity_kind, source_id)는 DB에서 한 번만 센다. 두 번째 호출은 오류가 아니라 이미 센 결과를 돌려준다.
--   - 점수 수치(챕터별 필요 점수, 활동별 점수, 주간 상한)는 전용 테이블의 행이다. 값을 바꾸거나 활동 종류·챕터를
--     더하는 일에 마이그레이션이 필요 없다(밸런스 설정 화면이 이 테이블을 읽고 쓴다, 묶음 7).
--   - 점수 가산을 부를지 말지(챕터 배지·포인트 조건 배지 제외, 자기 드랍 줍기 제외, 이용 정지 중 차단)는
--     부르는 쪽 책임이다. chapter_add_score는 호출된 활동을 그대로 센다.
--   - source_id는 호출부가 정한 UUID(활동, 캡슐 열기 기록 등)이고 외래키로 묶지 않는다. 점수 기록은 지워지지 않는 기록이다.
--
-- 가정 (카리나가 정했고 SQL 실행 승인 전에 다시 확인한다)
--   - 퀘스트를 마치기 전에 쌓인 점수: 정책 문서에 없다. 챕터가 없어도 점수 기록과 누적 점수는 쌓고(chapter_no는 NULL),
--     chapter_start가 챕터 1로 만드는 순간 쌓인 점수로 오를 챕터까지 한 번에 올린다. 버리려면 이 규칙만 바꾸면 된다.
--   - 주간 상한: 주(월~일)는 활동한 날(KST, occurred_on)로 정한다(잼 원장과 같은 기준). 상한 안의 점수는 그대로 세고,
--     넘는 부분에만 over_cap_ratio를 곱한다. 한 번의 호출이 경계에 걸치면 경계까지는 전부, 넘는 양은 비율대로 센다.
--     소수점은 내림한다(단위당 점수 곱한 값, 넘는 부분 곱한 값 각각).
--     상한 계산의 기준은 같은 유저·같은 활동 종류·같은 주에 이미 기록된 상한 적용 전 점수(raw_score)의 합이다.
--     늦게 동기화된 활동은 그 활동한 날의 주 기준으로 세므로, 호출 순서와 활동 순서가 다르면 결과가 호출 순서를 따른다.

-- ----------------------------------------------------------------
-- 1. chapter_definitions — 챕터 정의(오르는 데 필요한 누적 점수)
--    챕터 1은 퀘스트 완료(chapter_start)로 얻으므로 필요 점수 0. 챕터는 뒤에 더할 수 있다.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chapter_definitions (
  chapter_no INTEGER PRIMARY KEY CHECK (chapter_no >= 1),
  required_score BIGINT NOT NULL CHECK (required_score >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chapter_definitions ENABLE ROW LEVEL SECURITY;

-- 로그인 유저는 모두 읽는다(다음 챕터까지 게이지에 필요). 쓰기 정책 없음.
DROP POLICY IF EXISTS chapter_definitions_select_authenticated ON public.chapter_definitions;
CREATE POLICY chapter_definitions_select_authenticated ON public.chapter_definitions
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.chapter_definitions IS
  '챕터 정의. required_score=그 챕터에 오르는 데 필요한 누적 점수. 챕터 1은 0(퀘스트 완료). 뒤에 행을 더해 챕터를 늘린다.';

-- ----------------------------------------------------------------
-- 2. chapter_names — 트라이브별 챕터 이름
--    트라이브 다섯 개가 아직 등록되지 않았으므로 행을 미리 넣지 않는다. name은 비어도 된다.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chapter_names (
  tribe_id UUID NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  chapter_no INTEGER NOT NULL REFERENCES public.chapter_definitions(chapter_no),
  name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tribe_id, chapter_no)
);

ALTER TABLE public.chapter_names ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chapter_names_select_authenticated ON public.chapter_names;
CREATE POLICY chapter_names_select_authenticated ON public.chapter_names
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.chapter_names IS
  '트라이브별 챕터 이름 표. (tribe_id, chapter_no)가 키, name은 비어도 된다. 초기에는 행이 없다.';

-- ----------------------------------------------------------------
-- 3. chapter_score_rules — 활동별 점수 규칙
--    activity_kind는 규칙 테이블의 행이다. 새 종류는 행을 더하면 된다. 읽기는 서버 전용(클라이언트 정책 없음).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chapter_score_rules (
  activity_kind TEXT PRIMARY KEY,
  points_per_unit NUMERIC(10, 2) NOT NULL CHECK (points_per_unit >= 0),
  weekly_cap INTEGER CHECK (weekly_cap IS NULL OR weekly_cap >= 0),   -- 주(월~일)당 상한 점수. NULL이면 상한 없음
  over_cap_ratio NUMERIC(4, 3) NOT NULL DEFAULT 0.5 CHECK (over_cap_ratio >= 0 AND over_cap_ratio <= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chapter_score_rules ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.chapter_score_rules IS
  '활동별 점수 규칙. points_per_unit=단위당 점수, weekly_cap=주간 상한(NULL=없음), over_cap_ratio=상한 초과분을 세는 비율. 서버(service role)만 읽는다.';

-- ----------------------------------------------------------------
-- 4. user_chapters — 유저의 지금 챕터와 누적 점수
--    chapter_no가 NULL이면 아직 챕터가 없다(퀘스트 전). lazy 생성(첫 점수·시작 때). 기존 유저 백필 없음.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_chapters (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  chapter_no INTEGER REFERENCES public.chapter_definitions(chapter_no),
  total_score BIGINT NOT NULL DEFAULT 0 CHECK (total_score >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_chapters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_chapters_select_own ON public.user_chapters;
CREATE POLICY user_chapters_select_own ON public.user_chapters
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_chapters IS
  '유저의 지금 챕터(NULL=퀘스트 전)와 누적 점수. chapter_add_score()/chapter_start()로만 변경. 챕터는 내려가지 않는다.';

-- ----------------------------------------------------------------
-- 5. chapter_score_events — 점수 기록 (append-only)
--    (activity_kind, source_id) 유일 제약으로 같은 활동은 한 번만 센다.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chapter_score_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  activity_kind TEXT NOT NULL REFERENCES public.chapter_score_rules(activity_kind),
  source_id UUID NOT NULL,                              -- 호출부가 정한 원천 식별자 (FK 없음)
  occurred_on DATE NOT NULL,                            -- 활동한 날(KST)
  unit_amount INTEGER NOT NULL CHECK (unit_amount > 0), -- 호출된 양(단위 수)
  raw_score INTEGER NOT NULL CHECK (raw_score >= 0),    -- 상한 적용 전 점수
  counted_score INTEGER NOT NULL CHECK (counted_score >= 0 AND counted_score <= raw_score), -- 실제로 센 점수
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chapter_score_events_kind_source_uniq UNIQUE (activity_kind, source_id)
);

-- 주간 상한 계산용: 같은 유저·활동 종류의 기간 합.
CREATE INDEX IF NOT EXISTS chapter_score_events_user_kind_day_idx
  ON public.chapter_score_events (user_id, activity_kind, occurred_on);

ALTER TABLE public.chapter_score_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chapter_score_events_select_own ON public.chapter_score_events;
CREATE POLICY chapter_score_events_select_own ON public.chapter_score_events
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.chapter_score_events IS
  '점수 기록(append-only). raw_score=상한 적용 전, counted_score=실제로 센 점수. (activity_kind, source_id)당 한 줄.';

-- ----------------------------------------------------------------
-- 6. chapter_ups — 오른 기록
--    한 번에 여러 챕터를 넘으면 챕터마다 한 줄이다.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chapter_ups (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  chapter_no INTEGER NOT NULL REFERENCES public.chapter_definitions(chapter_no),
  reached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chapter_no)
);

ALTER TABLE public.chapter_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chapter_ups_select_own ON public.chapter_ups;
CREATE POLICY chapter_ups_select_own ON public.chapter_ups
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.chapter_ups IS
  '챕터에 오른 기록. (user_id, chapter_no)가 키. 한 번에 여러 챕터를 넘으면 챕터마다 한 줄.';

-- 클라이언트 역할의 직접 쓰기 권한도 회수한다(RLS 정책 부재에 더한 이중 차단).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.chapter_definitions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.chapter_names FROM anon, authenticated;
REVOKE ALL ON public.chapter_score_rules FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_chapters FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.chapter_score_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.chapter_ups FROM anon, authenticated;

-- ----------------------------------------------------------------
-- 7. 초기값 (운영 로직 12.4절·12.2절). 다시 실행해도 중복이 생기지 않는다.
-- ----------------------------------------------------------------
INSERT INTO public.chapter_definitions (chapter_no, required_score) VALUES
  (1, 0),
  (2, 1000),
  (3, 2300),
  (4, 3800),
  (5, 5700),
  (6, 8500),
  (7, 11500),
  (8, 15000),
  (9, 19000),
  (10, 23000)
ON CONFLICT (chapter_no) DO NOTHING;

INSERT INTO public.chapter_score_rules (activity_kind, points_per_unit, weekly_cap, over_cap_ratio) VALUES
  ('jam_earned',              1,   300,  0.5),   -- 모은 잼: 1당 1점, 주 300점까지 그대로 넘는 것은 절반
  ('capsule_open',            20,  NULL, 0.5),
  ('locked_item_badge_open',  10,  NULL, 0.5),
  ('badge_receive',           10,  NULL, 0.5),
  ('collection_complete_common', 100, NULL, 0.5),
  ('collection_complete_rare',   200, NULL, 0.5),
  ('collection_complete_epic',   400, NULL, 0.5),
  ('collection_complete_mystic', 800, NULL, 0.5),
  ('mix_success',             20,  NULL, 0.5),
  ('mission_complete',        50,  NULL, 0.5),
  ('drop',                    5,   NULL, 0.5),
  ('pickup',                  5,   NULL, 0.5)
ON CONFLICT (activity_kind) DO NOTHING;

-- ----------------------------------------------------------------
-- 8. chapter_add_score() — 점수 가산의 유일한 경로
--    ①입력 검사 ②유저 행 확보·잠금 ③같은 (활동 종류, 원천)이면 기존 결과 반환 ④점수 계산(주간 상한)
--    ⑤점수 기록·누적 점수 반영 ⑥챕터가 있으면 올릴 수 있는 만큼 올리고 오른 기록을 챕터마다 남김.
--    시그니처는 확정이다. 인자 수를 바꾸려면 옛 시그니처를 먼저 DROP해야 한다(db-migration-rules.md 3절).
--    돌려주는 값: score_added=센 점수, current_chapter=지금 챕터(없으면 NULL), reached_chapters=이번 호출로 오른 챕터 번호 목록.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chapter_add_score(
  p_user_id UUID,
  p_activity_kind TEXT,
  p_source_id UUID,
  p_amount INTEGER,                     -- 단위 수(예: 모은 잼 양, 열기 1회는 1)
  p_occurred_on DATE DEFAULT NULL       -- 활동한 날(KST). 비우면 오늘(KST)
) RETURNS TABLE (
  score_added INTEGER,
  current_chapter INTEGER,
  reached_chapters INTEGER[]
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.chapter_score_rules;
  v_event public.chapter_score_events;
  v_today_kst DATE := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_occurred_on DATE;
  v_week_start DATE;
  v_chapter INTEGER;
  v_total BIGINT;
  v_prior BIGINT;
  v_raw INTEGER;
  v_room BIGINT;
  v_within BIGINT;
  v_counted INTEGER;
  v_next_no INTEGER;
  v_next_required BIGINT;
  v_reached INTEGER[] := ARRAY[]::INTEGER[];
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'chapter_add_score: amount는 1 이상이어야 합니다' USING ERRCODE = 'check_violation';
  END IF;
  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'chapter_add_score: source_id가 필요합니다' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_rule FROM public.chapter_score_rules WHERE activity_kind = p_activity_kind;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chapter_add_score: 알 수 없는 활동 종류 %', p_activity_kind USING ERRCODE = 'check_violation';
  END IF;

  -- 활동한 날: 미래는 거절하고, 비우면 오늘(KST).
  v_occurred_on := COALESCE(p_occurred_on, v_today_kst);
  IF v_occurred_on > v_today_kst THEN
    RAISE EXCEPTION 'chapter_add_score: 활동한 날이 미래입니다 (%)', v_occurred_on USING ERRCODE = 'check_violation';
  END IF;

  -- 유저 행 확보 후 잠금(같은 유저의 동시 호출을 직렬화한다).
  INSERT INTO public.user_chapters (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT uc.chapter_no, uc.total_score INTO v_chapter, v_total
    FROM public.user_chapters uc WHERE uc.user_id = p_user_id FOR UPDATE;

  -- 이미 센 (활동 종류, 원천): 아무것도 바꾸지 않고 이미 센 결과를 돌려준다.
  SELECT * INTO v_event FROM public.chapter_score_events e
   WHERE e.activity_kind = p_activity_kind AND e.source_id = p_source_id;
  IF FOUND THEN
    IF v_event.user_id <> p_user_id THEN
      RAISE EXCEPTION 'chapter_add_score: 이 (활동 종류, 원천)은 다른 유저의 점수로 이미 기록되어 있습니다'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN QUERY SELECT v_event.counted_score, v_chapter, ARRAY[]::INTEGER[];
    RETURN;
  END IF;

  -- 점수 계산: 상한 적용 전 점수 → 이번 주(월~일) 상한 안은 그대로, 넘는 부분은 over_cap_ratio. 소수점 내림.
  v_raw := floor(p_amount * v_rule.points_per_unit)::INTEGER;
  IF v_rule.weekly_cap IS NULL THEN
    v_counted := v_raw;
  ELSE
    v_week_start := date_trunc('week', v_occurred_on::timestamp)::date;
    SELECT COALESCE(SUM(e.raw_score), 0) INTO v_prior
      FROM public.chapter_score_events e
     WHERE e.user_id = p_user_id
       AND e.activity_kind = p_activity_kind
       AND e.occurred_on >= v_week_start
       AND e.occurred_on < v_week_start + 7;
    v_room := GREATEST(v_rule.weekly_cap - v_prior, 0);
    v_within := LEAST(v_raw, v_room);
    v_counted := v_within::INTEGER + floor((v_raw - v_within) * v_rule.over_cap_ratio)::INTEGER;
  END IF;

  INSERT INTO public.chapter_score_events
    (user_id, activity_kind, source_id, occurred_on, unit_amount, raw_score, counted_score)
  VALUES
    (p_user_id, p_activity_kind, p_source_id, v_occurred_on, p_amount, v_raw, v_counted);

  v_total := v_total + v_counted;

  -- 챕터가 있으면 올릴 수 있는 만큼 올린다(내려가지 않는다). 챕터가 없으면 점수만 쌓는다.
  IF v_chapter IS NOT NULL THEN
    LOOP
      SELECT d.chapter_no, d.required_score INTO v_next_no, v_next_required
        FROM public.chapter_definitions d
       WHERE d.chapter_no > v_chapter
       ORDER BY d.chapter_no
       LIMIT 1;
      EXIT WHEN NOT FOUND OR v_next_required > v_total;
      v_chapter := v_next_no;
      v_reached := v_reached || v_next_no;
      INSERT INTO public.chapter_ups (user_id, chapter_no) VALUES (p_user_id, v_next_no)
        ON CONFLICT (user_id, chapter_no) DO NOTHING;
    END LOOP;
  END IF;

  UPDATE public.user_chapters
     SET total_score = v_total,
         chapter_no = v_chapter,
         updated_at = now()
   WHERE user_id = p_user_id;

  RETURN QUERY SELECT v_counted, v_chapter, v_reached;
END;
$$;

COMMENT ON FUNCTION public.chapter_add_score IS
  '챕터 점수 가산의 유일한 경로. 규칙을 읽어 점수 계산(주간 상한: 상한 안 그대로, 넘는 부분 over_cap_ratio, 내림) + 점수 기록 + 누적 점수 반영 + 챕터가 있으면 올릴 수 있는 만큼 상승(오른 기록 챕터마다 한 줄)을 원자 처리. 같은 (활동 종류, 원천)은 이미 센 결과 반환, 미래 날짜 거절. 서버(service role)에서만 호출.';

-- ----------------------------------------------------------------
-- 9. chapter_start() — 챕터 1 시작 (퀘스트 완료 때 호출)
--    챕터가 비어 있으면 챕터 1로 만들고 오른 기록을 남긴 뒤, 쌓인 점수로 오를 수 있는 챕터까지 올린다.
--    이미 챕터가 있으면 아무것도 하지 않는다. chapter_add_score와 같은 모양의 값을 돌려준다(score_added는 항상 0).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chapter_start(
  p_user_id UUID
) RETURNS TABLE (
  score_added INTEGER,
  current_chapter INTEGER,
  reached_chapters INTEGER[]
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chapter INTEGER;
  v_total BIGINT;
  v_next_no INTEGER;
  v_next_required BIGINT;
  v_reached INTEGER[] := ARRAY[]::INTEGER[];
BEGIN
  INSERT INTO public.user_chapters (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT uc.chapter_no, uc.total_score INTO v_chapter, v_total
    FROM public.user_chapters uc WHERE uc.user_id = p_user_id FOR UPDATE;

  -- 이미 챕터가 있으면 아무것도 하지 않는다.
  IF v_chapter IS NOT NULL THEN
    RETURN QUERY SELECT 0, v_chapter, ARRAY[]::INTEGER[];
    RETURN;
  END IF;

  -- 챕터 1은 점수와 상관없이 시작한다. 정의가 없으면 설정 오류다.
  IF NOT EXISTS (SELECT 1 FROM public.chapter_definitions WHERE chapter_no = 1) THEN
    RAISE EXCEPTION 'chapter_start: 챕터 1 정의가 없습니다' USING ERRCODE = 'check_violation';
  END IF;
  v_chapter := 1;
  v_reached := ARRAY[1];
  INSERT INTO public.chapter_ups (user_id, chapter_no) VALUES (p_user_id, 1)
    ON CONFLICT (user_id, chapter_no) DO NOTHING;

  -- 쌓인 점수로 오를 수 있는 챕터까지 한 번에 올린다.
  LOOP
    SELECT d.chapter_no, d.required_score INTO v_next_no, v_next_required
      FROM public.chapter_definitions d
     WHERE d.chapter_no > v_chapter
     ORDER BY d.chapter_no
     LIMIT 1;
    EXIT WHEN NOT FOUND OR v_next_required > v_total;
    v_chapter := v_next_no;
    v_reached := v_reached || v_next_no;
    INSERT INTO public.chapter_ups (user_id, chapter_no) VALUES (p_user_id, v_next_no)
      ON CONFLICT (user_id, chapter_no) DO NOTHING;
  END LOOP;

  UPDATE public.user_chapters
     SET chapter_no = v_chapter,
         updated_at = now()
   WHERE user_id = p_user_id;

  RETURN QUERY SELECT 0, v_chapter, v_reached;
END;
$$;

COMMENT ON FUNCTION public.chapter_start IS
  '챕터 1 시작(퀘스트 완료 때). 챕터가 비어 있으면 챕터 1로 만들고 오른 기록을 남긴 뒤 쌓인 점수로 오를 수 있는 챕터까지 올린다. 이미 챕터가 있으면 아무것도 하지 않는다. 서버(service role)에서만 호출.';

-- 클라이언트(anon/authenticated)가 RPC로 점수·챕터를 조작하지 못하도록 실행 권한 회수. service_role만 호출 가능.
REVOKE ALL ON FUNCTION public.chapter_add_score(UUID, TEXT, UUID, INTEGER, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chapter_add_score(UUID, TEXT, UUID, INTEGER, DATE) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chapter_add_score(UUID, TEXT, UUID, INTEGER, DATE) TO service_role;

REVOKE ALL ON FUNCTION public.chapter_start(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chapter_start(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chapter_start(UUID) TO service_role;

-- 되돌림 SQL
-- 새로 만든 객체만 지운다. 점수 기록과 오른 기록이 함께 사라지므로, 운영 데이터가 생긴 뒤에는 백업 후 실행한다.
-- DROP FUNCTION IF EXISTS public.chapter_start(UUID);
-- DROP FUNCTION IF EXISTS public.chapter_add_score(UUID, TEXT, UUID, INTEGER, DATE);
-- DROP TABLE IF EXISTS public.chapter_ups;
-- DROP TABLE IF EXISTS public.chapter_score_events;
-- DROP TABLE IF EXISTS public.user_chapters;
-- DROP TABLE IF EXISTS public.chapter_names;
-- DROP TABLE IF EXISTS public.chapter_score_rules;
-- DROP TABLE IF EXISTS public.chapter_definitions;
