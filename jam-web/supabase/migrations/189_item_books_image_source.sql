-- 189: item_books.image_source 신규 — 컬렉션 대표 이미지 제작 경로 기록 (티켓 20260925_1409)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터(또는 사용자가 SQL 편집기에서 직접)가 처리한다.
--
-- 배경:
--   상위 티켓 20260925_1404(에셋 제너레이터 2차) 결정 4·6: 컬렉션(item_books)에도 배지·미션과
--   같은 「제작 경로」 추적을 넣는다(`186_badges_image_source.sql`·`188_missions_image_source.sql`
--   과 같은 목적). 다만 컬렉션은 자동 기획 경로가 없어(결정 6) 어드민 에셋 제너레이터 적용 탭
--   (이 티켓, `admin-generator`)만 값을 채운다.
--
-- 설계:
--   - `image_source`는 nullable — 기존 컬렉션은 전부 NULL("미상")로 남는다. 소급 채우기는
--     하지 않는다(186·188과 같은 판단).
--   - CHECK 제약 값 어휘는 188(미션)과 동일하게 `admin-generator`·`agent-generator` 2종만
--     허용한다 — 컬렉션에 자동 기획 경로(`agent-generator`)가 아직 없어도(상위 티켓 결정 6)
--     콘텐츠 유형이 늘 때마다 값 어휘가 갈리지 않도록 통일해 둔다(`contentImageSource.ts`
--     문서 주석과 같은 원칙). 배지 전용 `jam-img`는 넣지 않는다.
--   - Postgres CHECK 제약은 NULL을 "거짓으로 증명되지 않음"으로 취급해 통과시키므로, 기존 행
--     전부가 NULL이어도 이 제약을 추가하는 데 문제가 없다 — 별도 백필 단계가 필요 없는 순수
--     확장(expand) 마이그레이션이다(`db-migration-rules.md` §1, 추가만 하고 옛 모양을 건드리지
--     않는다).
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT IF EXISTS로 작성했다.

BEGIN;

ALTER TABLE public.item_books ADD COLUMN IF NOT EXISTS image_source TEXT NULL;

ALTER TABLE public.item_books DROP CONSTRAINT IF EXISTS item_books_image_source_check;
ALTER TABLE public.item_books ADD CONSTRAINT item_books_image_source_check
  CHECK (image_source IN ('admin-generator', 'agent-generator'));

COMMENT ON COLUMN public.item_books.image_source IS
  '컬렉션 대표 이미지(image_url) 제작 경로. admin-generator=에셋 제너레이터 적용 탭(수동).
   agent-generator는 컬렉션에 자동 기획 경로가 아직 없어(상위 티켓 20260925_1404 결정 6) 값이
   채워지지 않지만 값 어휘는 배지·미션과 통일해 둔다. NULL이면 기존 컬렉션(미상) — 티켓
   20260925_1409.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 컬럼·CHECK가 만들어졌는지
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'item_books' AND column_name = 'image_source';
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.item_books'::regclass AND conname = 'item_books_image_source_check';
--
-- -- ② 기존 행은 전부 NULL(미상)인지
-- SELECT count(*) FROM public.item_books WHERE image_source IS NOT NULL; -- 0이어야 정상(실행 직후)

-- 되돌림 SQL
-- ALTER TABLE public.item_books DROP COLUMN IF EXISTS image_source;
