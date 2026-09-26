-- 193: missions.condition_text 신규 — 달성 조건 카드에 쓰는 조건 문장 (티켓 20260927_0026)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터가 처리한다. Supabase는 staging·프로덕션 공용 단일 DB라
--    실행하는 순간 프로덕션에 반영된다.
--
-- 배경:
--   복합 조건(engine_condition) 미션은 상세 화면 달성 조건 카드에서 「미션 완료 1 달성」만 보여 준다.
--   실제 조건을 담을 칸이 없어 설명(description) 칸에 조건 문장을 적어 넣었다. 조건 문장을 별도 칸으로
--   분리해, 설명은 산문으로 쓰고 카드는 이 칸을 첫 줄로 보여 준다.
--
-- 설계:
--   - nullable 텍스트 칸을 덧붙이기만 하는 확장(expand) 마이그레이션이다(`db-migration-rules.md` §1).
--     값이 NULL이면 화면이 기존 동작(목표 유형별 문구)을 그대로 쓰므로 옛 코드·기존 행이 깨지지 않는다.
--   - 기존 행 채우기는 이 파일에서 하지 않는다. 화면 코드가 머지된 뒤
--     194_missions_condition_text_backfill.sql로 따로 실행한다.
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS.

BEGIN;

ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS condition_text TEXT NULL;

COMMENT ON COLUMN public.missions.condition_text IS
  '달성 조건 카드 첫 줄에 표시하는 조건 문장(마침표 없음). NULL이면 목표 유형별 기본 문구를 쓴다. 티켓 20260927_0026';

COMMIT;

-- 🧪 적용 후 검증
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'missions' AND column_name = 'condition_text';
--     → 1행 (text, YES)

-- 되돌림 SQL
-- ALTER TABLE public.missions DROP COLUMN IF EXISTS condition_text;
