-- 167: shader_text_presets 신규 — 쉐이더 텍스트 생성기(디졸브 에코) 스타일 프리셋
--      (티켓 20260912_1532)
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 배경:
--   신규 어드민 도구 "쉐이더 텍스트 생성"(디졸브 에코)의 스타일 프리셋(색상·에코·헤일로·노이즈
--   등 설정값 묶음, 문구는 제외)을 여러 관리자·PC 간 공유하기 위한 저장소다.
--
--   생성 결과 자체(어떤 배지에 적용했는지, 문구·`image_gen_params`)는 이 테이블에 담지 않는다
--   — 그건 기존 `badges.image_gen_params`(마이그레이션 126, `20260902_1613`)를 재사용한다.
--   이 테이블은 "다음에 또 쓸 스타일 조합"만 저장하는 운영 편의용 테이블이다.
--
--   `created_by`는 FK가 아니라 이메일 문자열이다 — 프리셋은 운영 편의 데이터라 계정 삭제 시
--   연쇄 삭제·참조 무결성을 강제할 필요가 없다(`today_cards.created_by` 등 기존 관례와 다르게,
--   이 테이블은 굳이 `users.id`를 참조하지 않는다. 게이트 리뷰에서 이 선택을 재검토할 수 있다).
--
--   소프트 삭제(`deleted_at`)를 두지 않는다 — 프리셋은 운영 편의용 데이터라 하드 삭제로 충분하다
--   (티켓 명시, 구현자 재량 확정).
--
-- 재실행 가능(idempotent): CREATE TABLE IF NOT EXISTS 패턴.

BEGIN;

CREATE TABLE IF NOT EXISTS public.shader_text_presets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  params     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

-- 게이트 리뷰 FAIL로 확인된 필수 항목: RLS를 켜지 않으면 정책이 없어도 PostgREST가 anon
-- 키로 전체 조회·수정을 허용한다(마이그레이션 074·147과 동일 유형 사고). 정책(POLICY)은
-- 추가하지 않는다 — RLS만 켜면 service_role 키를 쓰는 서버 라우트만 접근 가능해지고,
-- 그게 이 테이블의 유일한 접근 경로다.
ALTER TABLE public.shader_text_presets ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.shader_text_presets IS
  '쉐이더 텍스트 생성기(디졸브 에코) 스타일 프리셋. 티켓 20260912_1532';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public' AND table_name = 'shader_text_presets';
--
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'shader_text_presets'
--  ORDER BY ordinal_position;
--
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'public.shader_text_presets'::regclass;
--  → true 여야 한다 (게이트 리뷰 FAIL 재발 방지 확인 항목).
