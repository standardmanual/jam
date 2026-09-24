-- 186: badges.image_source 신규 — 배지 대표 이미지 제작 경로 기록 (티켓 20260924_2200)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터(또는 사용자가 SQL 편집기에서 직접)가 처리한다.
--
-- 배경:
--   배지 대표 이미지(badges.image_url)는 세 경로로 만들어질 수 있다 — 어드민 에셋 제너레이터
--   적용 탭(수동, 이 티켓), 윤진 CLI 등록 스크립트(자동, 하위 티켓 2201), 기존 `/jam-img` 아이콘
--   파이프라인. 세 경로가 섞이면 스타일 차이의 원인을 화면에서 추적할 수 없어(어드민 배지
--   목록·상세에 원인이 안 보임), 어느 경로로 만들었는지 배지에 기록해 화면에 표시한다
--   (PRD asset-generator/PRD.md §10, 사용자 결정 2·7).
--
-- 설계:
--   - `image_source`는 nullable — 기존 배지는 전부 NULL("미상")로 남는다. 어느 경로로 만들었는지
--     알 수 없는 과거 데이터를 강제로 특정 값으로 채우지 않는다(소급 채우기는 PRD §10에 열린
--     질문으로 남겨둠).
--   - CHECK 제약은 현재 알려진 세 경로만 허용한다: `admin-generator`(이 티켓의 적용 탭),
--     `agent-generator`(하위 티켓 2201 등록 스크립트), `jam-img`(기존 아이콘 파이프라인 —
--     `register-badge-images.js`에 값 기록을 추가하는 후속 티켓은 이 마이그레이션 범위 밖).
--   - Postgres CHECK 제약은 NULL을 "거짓으로 증명되지 않음"으로 취급해 통과시키므로, 기존 행
--     전부가 NULL이어도 이 제약을 추가하는 데 문제가 없다 — 별도 백필 단계가 필요 없는 순수
--     확장(expand) 마이그레이션이다(`db-migration-rules.md` §1, 추가만 하고 옛 모양을 건드리지
--     않는다).
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT IF EXISTS로 작성했다.

BEGIN;

ALTER TABLE public.badges ADD COLUMN IF NOT EXISTS image_source TEXT NULL;

ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_image_source_check;
ALTER TABLE public.badges ADD CONSTRAINT badges_image_source_check
  CHECK (image_source IN ('admin-generator', 'agent-generator', 'jam-img'));

COMMENT ON COLUMN public.badges.image_source IS
  '배지 대표 이미지(image_url) 제작 경로. admin-generator=에셋 제너레이터 적용 탭(수동),
   agent-generator=윤진 CLI 등록 스크립트(자동), jam-img=기존 아이콘 파이프라인. NULL이면 기존
   배지(미상) — 티켓 20260924_2200, PRD asset-generator/PRD.md §10.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 컬럼·CHECK가 만들어졌는지
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'badges' AND column_name = 'image_source';
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.badges'::regclass AND conname = 'badges_image_source_check';
--
-- -- ② 기존 행은 전부 NULL(미상)인지
-- SELECT count(*) FROM public.badges WHERE image_source IS NOT NULL; -- 0이어야 정상(실행 직후)

-- 되돌림 SQL
-- ALTER TABLE public.badges DROP COLUMN IF EXISTS image_source;
