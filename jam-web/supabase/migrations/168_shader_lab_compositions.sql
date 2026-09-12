-- 168: shader_lab_compositions 신규 — 쉐이더 랩(레이어형 셰이더 합성 편집기) 최소 지속성
--      (티켓 20260912_1951)
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 배경:
--   신규 어드민 도구 "쉐이더 랩"(`/admin/shader-lab`, basement.studio의
--   `@basementstudio/shader-lab` 런타임 이식)의 레이어 스택 + 파라미터를 저장한다. 1차는
--   작업 유실 방지 수준의 최소 지속성만 갖춘다 — 정식 저장 스키마(배지/컬렉션/미션 자동
--   등록과 연결되는 형태)는 3차에서 확정한다(티켓 "유예된 판단" 3항).
--
--   `scene_json`은 패키지가 export하는 `ShaderLabConfig`(레이어 배열 + 타임라인 + 캔버스
--   크기)를 그대로 담는다. 이미지 레이어의 실제 파일(blob URL)은 세션 종료 후 무효가 되므로
--   저장되지 않는다 — 불러온 뒤에는 이미지를 다시 올려야 한다(구현자 재량, 완료 기록 참고).
--
--   `shader_text_presets`(마이그레이션 167)와 동일한 패턴을 따른다: `created_by`는 FK가
--   아니라 이메일 문자열(운영 편의 데이터라 계정 삭제 연쇄 처리 불필요), 소프트 삭제 없이
--   하드 삭제.
--
-- 재실행 가능(idempotent): CREATE TABLE IF NOT EXISTS 패턴.

BEGIN;

CREATE TABLE IF NOT EXISTS public.shader_lab_compositions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  scene_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

-- 게이트 리뷰 FAIL로 확인된 필수 항목(마이그레이션 074·147·167과 동일 유형 사고 방지):
-- RLS를 켜지 않으면 정책이 없어도 PostgREST가 anon 키로 전체 조회·수정을 허용한다. 정책
-- (POLICY)은 추가하지 않는다 — RLS만 켜면 service_role 키를 쓰는 서버 라우트만 접근
-- 가능해지고, 그게 이 테이블의 유일한 접근 경로다.
ALTER TABLE public.shader_lab_compositions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.shader_lab_compositions IS
  '쉐이더 랩(레이어형 셰이더 합성 편집기) 최소 지속성 저장. 티켓 20260912_1951';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public' AND table_name = 'shader_lab_compositions';
--
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'shader_lab_compositions'
--  ORDER BY ordinal_position;
--
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'public.shader_lab_compositions'::regclass;
--  → true 여야 한다 (게이트 리뷰 FAIL 재발 방지 확인 항목).
