-- 187: asset_presets.target_type CHECK 확장 — badge 단일값 → 4종 (티켓 20260925_1405)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터(또는 사용자가 SQL 편집기에서 직접)가 처리한다.
--
-- 배경:
--   상위 티켓 20260925_1404(에셋 제너레이터 2차)가 미션·컬렉션·홈피드 프리셋 저장을
--   추가한다. 지금 CHECK 제약은 'badge' 하나만 허용해(마이그레이션 185) 나머지 3종을
--   저장할 자리가 없다. 프리셋 하나는 유형 하나에만 속한다(공용 프리셋 아님, 상위 티켓
--   결정 2) — 값 집합만 넓히면 되고 컬럼·테이블 모양은 바뀌지 않는다.
--
-- 설계:
--   - 순수 확장(expand)이다 — CHECK 허용값만 늘리고 기존 컬럼·행은 그대로 둔다. 기존
--     'badge' 행은 새 CHECK를 그대로 통과하므로 백필이 필요 없다. 확장→전환→축소 분할
--     대상이 아니다(옛 모양을 없애지 않는다, db-migration-rules.md 1절 참고).
--   - 재실행 가능(idempotent): DROP CONSTRAINT IF EXISTS 뒤 ADD CONSTRAINT로 작성했다.
--
-- 완료 조건(20260925_1405): CHECK가 'badge'|'mission'|'collection'|'home_feed' 4개를 허용하고,
-- 마이그레이션 185로 만든 기존 'badge' 프리셋은 그대로 동작한다(회귀 없음).

BEGIN;

ALTER TABLE public.asset_presets DROP CONSTRAINT IF EXISTS asset_presets_target_type_check;
ALTER TABLE public.asset_presets ADD CONSTRAINT asset_presets_target_type_check
  CHECK (target_type IN ('badge', 'mission', 'collection', 'home_feed'));

COMMENT ON COLUMN public.asset_presets.target_type IS
  '프리셋이 적용될 컨텐츠 유형(badge·mission·collection·home_feed). 유형 하나에만 속한다(상위 티켓 20260925_1404 결정 2). 1차(티켓 20260924_2159)는 badge 하나만 허용했다(마이그레이션 187에서 확장).';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① CHECK 제약이 4개 값을 허용하는지
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.asset_presets'::regclass AND conname = 'asset_presets_target_type_check';
--
-- -- ② 기존 badge 프리셋이 그대로 남아 있는지(행 수 비교, 실행 전후)
-- SELECT target_type, count(*) FROM public.asset_presets GROUP BY target_type;

-- 되돌림 SQL
-- ⚠️ target_type이 'mission'·'collection'·'home_feed'인 행이 이미 생겼다면 아래를 그대로
--    실행할 수 없다(CHECK 위반) — 먼저 그 행을 지우거나 값을 'badge'로 바꾼 뒤 실행한다.
-- ALTER TABLE public.asset_presets DROP CONSTRAINT IF EXISTS asset_presets_target_type_check;
-- ALTER TABLE public.asset_presets ADD CONSTRAINT asset_presets_target_type_check
--   CHECK (target_type IN ('badge'));
