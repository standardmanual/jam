-- 256_drop_chapter_names.sql
-- JAM 2.0 챕터 이름 표 삭제 (티켓 20261021_1539 2회, 마이그레이션 221의 chapter_names)
--
-- 배경: 2026-10-21 정책 변경으로 챕터는 트라이브와 상관없이 «챕터» + 숫자로만 표기한다(결정 원문: «모든 유저의 챕터는
--   트라이브와 상관없이 '챕터' + 숫자로 표기함»). 트라이브별 챕터 이름 표는 쓰지 않는다. 공용 DB에서 이 표는 0행이다(2026-10-21 읽기 전용 조회).
-- 단계: 확장 → 전환 → 축소 중 «축소(Contract)». 전환은 티켓 1회 코드(이름 읽기·표시·어드민 이름 표를 걷어낸 변경)이고 이미 staging에 배포되었다.
-- 실행 전제: 1회 코드가 배포되어 chapter_names를 읽는 곳이 없다. 프로덕션(origin/main)에는 이 표를 읽는 코드가 처음부터 없다.
--   이 표를 가리키는 외래 키·함수·뷰·트리거·발행(publication)도 없다. 표 자신의 외래 키 둘(tribes, chapter_definitions)은
--   표와 함께 사라지며 부모 표에는 영향이 없다. 표에 달린 RLS 정책(chapter_names_select_authenticated)도 표와 함께 사라진다.
-- 순서: 1) 행이 있으면 예외로 멈춘다(표가 이미 없으면 통과). 2) CASCADE 없이 표를 지운다. 의존이 새로 생겼으면 실패하는 편이 안전하다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT to_regclass('public.chapter_names');                                          -- NULL (표 없음)
--   SELECT count(*) FROM pg_policies WHERE tablename = 'chapter_names';                  -- 0
--   SELECT count(*) FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name IN ('chapter_definitions', 'tribes');  -- 2 (부모 표는 그대로)

-- 1. 안전 확인: 표가 있고 행이 있으면 멈춘다. 없는 표를 직접 SELECT하면 계획 단계에서 실패하므로 to_regclass와 동적 실행을 쓴다.
DO $$
DECLARE
  v_rows BIGINT;
BEGIN
  IF to_regclass('public.chapter_names') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.chapter_names' INTO v_rows;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'chapter_names에 행이 % 개 있어 삭제를 멈춥니다. 데이터 처리를 먼저 정하세요.', v_rows;
    END IF;
  END IF;
END
$$;

-- 2. 표 삭제. CASCADE를 붙이지 않는다.
DROP TABLE IF EXISTS public.chapter_names;

-- 되돌림 SQL
-- 복원할 행이 없다(삭제 시점에 0행이었다). 표의 모양만 마이그레이션 221(48~66줄, 157줄)과 같은 정의로 다시 만든다.
-- 되돌릴 때는 tribes와 chapter_definitions가 있어야 한다. 되돌린 뒤 이름을 읽는 코드는 돌아오지 않는다(1회 코드를 따로 되돌려야 한다).
--
-- CREATE TABLE IF NOT EXISTS public.chapter_names (
--   tribe_id UUID NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
--   chapter_no INTEGER NOT NULL REFERENCES public.chapter_definitions(chapter_no),
--   name TEXT,
--   updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--   PRIMARY KEY (tribe_id, chapter_no)
-- );
--
-- ALTER TABLE public.chapter_names ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS chapter_names_select_authenticated ON public.chapter_names;
-- CREATE POLICY chapter_names_select_authenticated ON public.chapter_names
--   FOR SELECT TO authenticated USING (true);
--
-- COMMENT ON TABLE public.chapter_names IS
--   '트라이브별 챕터 이름 표. (tribe_id, chapter_no)가 키, name은 비어도 된다. 초기에는 행이 없다.';
--
-- REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.chapter_names FROM anon, authenticated;
