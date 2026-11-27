-- 364_chapter_jam_expand.sql
-- 챕터별 필요 잼과 이번 챕터 진행값 열 추가 (티켓 20261127_1724, 상위 20261127_1720)
--
-- 확장 단계다(db-migration-rules.md 1절). 새 열 두 개와 시드 값만 덧붙인다.
-- 옛 열(chapter_definitions.required_score, user_chapters.total_score, user_chapters.capsule_full_count),
-- 모든 함수, RLS 정책은 건드리지 않는다. 새 정책·함수·인덱스도 만들지 않는다.
-- 옛 코드는 이 파일 적용 뒤에도 그대로 동작한다(새 열은 NULL 가능 또는 기본값이 있다).
-- 새 열을 읽고 쓰는 코드는 이후 티켓(B2 적립 함수, B4 호출, C5a 읽기)이 만든다.
-- user_chapters.chapter_jam 채우기(이관)는 C1이다.
--
-- 적용 대상: Supabase는 staging·프로덕션 공용 단일 DB라 적용 즉시 프로덕션에 반영된다.
-- 모든 문장은 다시 실행해도 같은 결과가 나온다(IF NOT EXISTS, IS DISTINCT FROM).
-- 되돌림은 364_chapter_jam_expand_down.sql.

-- 1. chapter_definitions.required_jam (챕터 10은 마지막 챕터라 NULL로 남긴다)
ALTER TABLE public.chapter_definitions
  ADD COLUMN IF NOT EXISTS required_jam INTEGER
  CHECK (required_jam IS NULL OR required_jam >= 1);

-- 2. 시드: 챕터 1~9의 필요 잼(capsule_chapter_costs의 fill_amount_v2 × advance_count와 같다)
UPDATE public.chapter_definitions AS d
SET required_jam = v.jam,
    updated_at = now()
FROM (VALUES
  (1, 870),
  (2, 1120),
  (3, 1260),
  (4, 1600),
  (5, 1980),
  (6, 2205),
  (7, 2700),
  (8, 3300),
  (9, 3960)
) AS v(chapter_no, jam)
WHERE d.chapter_no = v.chapter_no
  AND d.required_jam IS DISTINCT FROM v.jam;

-- 3. user_chapters.chapter_jam (기존 행은 기본값 0으로 채워진다)
ALTER TABLE public.user_chapters
  ADD COLUMN IF NOT EXISTS chapter_jam INTEGER NOT NULL DEFAULT 0
  CHECK (chapter_jam >= 0);

-- 4. 열 설명
COMMENT ON COLUMN public.chapter_definitions.required_jam IS
  '이 챕터에서 다음 챕터로 오르는 데 필요한 잼. 마지막 챕터는 NULL. 필요량은 챕터 1~9가 capsule_chapter_costs의 fill_amount_v2 × advance_count와 같다(2026-11-27).';

COMMENT ON COLUMN public.user_chapters.chapter_jam IS
  '이번 챕터에서 모은 잼. 챕터가 오르면 필요량을 빼고 넘친 잼은 이월한다. 새 구조 B2부터 쓴다.';

-- 되돌림 SQL
-- 짝 파일 364_chapter_jam_expand_down.sql 참고.
-- ALTER TABLE public.user_chapters DROP COLUMN IF EXISTS chapter_jam;
-- ALTER TABLE public.chapter_definitions DROP COLUMN IF EXISTS required_jam;
