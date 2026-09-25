-- 190: today_cards.image_source 신규 — 홈피드 카드 대표 이미지 제작 경로 기록 (티켓 20260925_1411)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터(또는 사용자가 SQL 편집기에서 직접)가 처리한다.
--
-- 배경:
--   상위 티켓 20260925_1404(에셋 제너레이터 2차) 결정 4: 홈피드(today_cards)에도 배지·미션·
--   컬렉션과 같은 「제작 경로」 추적을 넣는다(`186_badges_image_source.sql`·
--   `188_missions_image_source.sql`·`189_item_books_image_source.sql`과 같은 목적). 다만
--   홈피드는 기존 주간 편성 파이프라인(seed SQL 등록, `content-automation/PRD.md` §8-2)의
--   등록 경로와 이번 어드민 적용 탭(신규) 경로가 병존한다(상위 티켓 리스크: 홈피드 등록 경로
--   이중화) — 운영자가 카드 출처를 혼동하지 않도록 이 컬럼으로 구분한다.
--
-- 설계:
--   - `image_source`는 nullable — 기존 카드(seed SQL로 등록된 카드 포함)는 전부 NULL("미상")로
--     남는다. 소급 채우기는 하지 않는다(186·188·189와 같은 판단).
--   - CHECK 제약 값 어휘는 188·189(미션·컬렉션)와 동일하게 `admin-generator`·`agent-generator`
--     2종만 허용한다 — 값 어휘를 콘텐츠 유형 전체에서 통일해 둔다(`contentImageSource.ts`
--     문서 주석과 같은 원칙). 배지 전용 `jam-img`는 넣지 않는다. `agent-generator`는 하위 티켓
--     20260925_1413(등록 스크립트 완성) 전까지는 값이 채워지지 않는다.
--   - Postgres CHECK 제약은 NULL을 "거짓으로 증명되지 않음"으로 취급해 통과시키므로, 기존 행
--     전부가 NULL이어도 이 제약을 추가하는 데 문제가 없다 — 별도 백필 단계가 필요 없는 순수
--     확장(expand) 마이그레이션이다(`db-migration-rules.md` §1, 추가만 하고 옛 모양을 건드리지
--     않는다).
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT IF EXISTS로 작성했다.

BEGIN;

ALTER TABLE public.today_cards ADD COLUMN IF NOT EXISTS image_source TEXT NULL;

ALTER TABLE public.today_cards DROP CONSTRAINT IF EXISTS today_cards_image_source_check;
ALTER TABLE public.today_cards ADD CONSTRAINT today_cards_image_source_check
  CHECK (image_source IN ('admin-generator', 'agent-generator'));

COMMENT ON COLUMN public.today_cards.image_source IS
  '홈피드 카드 대표 이미지(cover_image_url) 제작 경로. admin-generator=에셋 제너레이터 적용 탭
   (수동), agent-generator=등록 스크립트(자동, 하위 티켓 20260925_1413 완성 후). NULL이면 기존
   seed SQL 등록 카드(미상) — 티켓 20260925_1411, 상위 티켓 20260925_1404 결정 4.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 컬럼·CHECK가 만들어졌는지
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'today_cards' AND column_name = 'image_source';
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.today_cards'::regclass AND conname = 'today_cards_image_source_check';
--
-- -- ② 기존 행은 전부 NULL(미상)인지
-- SELECT count(*) FROM public.today_cards WHERE image_source IS NOT NULL; -- 0이어야 정상(실행 직후)

-- 되돌림 SQL
-- ALTER TABLE public.today_cards DROP COLUMN IF EXISTS image_source;
