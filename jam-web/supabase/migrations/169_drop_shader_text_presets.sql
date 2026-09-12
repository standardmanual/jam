-- 169: shader_text_presets 삭제 — 쉐이더 텍스트 생성기 도구 제거에 따른 정리
--      (티켓 20260913_0413)
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 배경:
--   2026-09-12 신설한 어드민 "쉐이더 텍스트 생성" 도구(디졸브 에코 이펙트, 티켓
--   20260912_1532 및 후속 20260912_1729·20260912_1742·20260912_1840)를 사용자 요청으로
--   완전히 제거한다(티켓 20260913_0413). 같은 날 밤 별도로 신설된 "쉐이더 랩"
--   (`/admin/shader-lab`, 티켓 20260912_1951·20260912_2157)은 제거 대상이 아니며 그대로
--   유지한다 — 두 기능은 별개다.
--
--   `public.shader_text_presets`(마이그레이션 167, `20260912_1532`)는 이 도구 전용 스타일
--   프리셋 저장소였고, 도구가 사라지면 더 이상 쓸 곳이 없어 테이블째 삭제한다.
--
--   원본 마이그레이션 167 파일은 수정하지 않는다(과거 기록 보존, CLAUDE.md 문서 원칙) —
--   이 파일로 되돌린다.
--
--   기존 167 마이그레이션은 이 테이블에 명시적 `POLICY`를 만들지 않고 `ENABLE ROW LEVEL
--   SECURITY`만 적용했다(정책 없이 RLS만 켜서 서버의 service_role 키만 접근 가능하게 한
--   방식). `DROP TABLE`은 그 RLS 설정을 포함해 테이블 전체를 함께 제거하므로 별도의
--   `DROP POLICY` 구문은 필요 없다.
--
--   범위 밖: 이 도구로 이미 생성해 배지에 적용한 이미지(`badges.image_url`,
--   `badges.image_gen_params`에 `generator: "shader-text-dissolve"`로 저장된 값)는 건드리지
--   않는다 — `badges` 테이블은 이 마이그레이션과 무관하다.
--
-- 재실행 가능(idempotent): DROP TABLE IF EXISTS 패턴.

BEGIN;

DROP TABLE IF EXISTS public.shader_text_presets;

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public' AND table_name = 'shader_text_presets';
--  → 행이 없어야 한다(테이블이 삭제됨).
