-- 192: shader_lab_compositions 테이블 제거 (축소, 티켓 20260925_1416)
--
-- ✅ 2026-09-26 사용자 승인 뒤 카리나가 Supabase MCP `apply_migration`(이름 `drop_shader_lab_compositions`)으로 실행했다.
--    삭제 전 2행(개발 테스트 계정이 09-17에 만든 "뉴클베-러닝"·"뉴클베-자전거", 이미지 레이어는 복원 불가한 blob: 주소)을
--    JSON으로 보관했다. 검증 쿼리 결과 0행 확인. 실행 당시 프로덕션(main)에는 옛 코드가 아직 돌고 있었으므로
--    프로덕션 배포 전까지 프로덕션 `/admin/shader-lab`의 저장·불러오기는 오류가 난다(사용자가 이 상태를 알고 승인함).
--    Supabase는 staging·프로덕션 공용 단일 DB라 적용 즉시 프로덕션에 반영된다.
--
-- 배경:
--   쉐이더 랩(`/admin/shader-lab`)의 레이어 스택 저장소였다(마이그레이션 168). 화면과
--   API(`/api/admin/shader-lab/compositions`)를 같은 브랜치에서 삭제했다.
--
-- 코드 참조 0건 확인(이 브랜치, 2026-09-26):
--   `grep -rn "shader_lab_compositions" jam-web/src`의 남은 결과는
--   에셋 제너레이터 주석뿐이다(실행 코드 없음). `src/types/database.generated.ts`의 타입
--   정의는 같은 브랜치에서 손으로 제거했다.
--   `asset_presets`(마이그레이션 185)는 이 테이블과 FK·뷰 의존이 없다(185 주석은 설계 참고만).
--
-- ⚠️ 데이터가 사라진다:
--   저장된 컴포지션 행은 DROP과 함께 없어지고 되돌림 SQL로는 스키마만 복원된다. 적용 전에
--   `SELECT count(*) FROM public.shader_lab_compositions;`로 행 수를 확인하고, 필요하면
--   `SELECT * FROM public.shader_lab_compositions;` 결과를 보관한 뒤 적용한다.
--
-- 배포 순서: 코드(화면·API 삭제)가 먼저 배포된 뒤 적용한다.
--
-- 재실행 가능(idempotent): DROP TABLE IF EXISTS.
--
-- 적용 후 할 일: Supabase MCP `generate_typescript_types` 결과를 `database.generated.ts`와
--   대조한다(메인 세션). 이 환경에 CLI·MCP가 없어 `shader_lab_compositions` 정의를 손으로 지웠다.

BEGIN;

DROP TABLE IF EXISTS public.shader_lab_compositions;

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public' AND table_name = 'shader_lab_compositions';
--  → 0행이어야 한다.

-- 되돌림 SQL
-- 스키마만 복원한다(행 데이터는 복원되지 않는다). 원본은 마이그레이션 168.
--
-- BEGIN;
--
-- CREATE TABLE IF NOT EXISTS public.shader_lab_compositions (
--   id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   name       TEXT NOT NULL,
--   scene_json JSONB NOT NULL,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--   created_by TEXT
-- );
--
-- -- 정책 없이 RLS만 켠다 — service_role 서버 라우트만 접근 가능(168과 동일).
-- ALTER TABLE public.shader_lab_compositions ENABLE ROW LEVEL SECURITY;
--
-- COMMENT ON TABLE public.shader_lab_compositions IS
--   '쉐이더 랩(레이어형 셰이더 합성 편집기) 최소 지속성 저장. 티켓 20260912_1951';
--
-- COMMIT;
