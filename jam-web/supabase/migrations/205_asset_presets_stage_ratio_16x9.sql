-- 205: asset_presets.stage_ratio CHECK 확장 — 1:1·4:5·9:16 → 16:9 추가 (티켓 20261001_1202)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터(또는 사용자가 SQL 편집기에서 직접)가 처리한다.
--
-- 배경:
--   상위 티켓 20260930_1453 결정 0·2 — 홈피드 hero 카드와 기사 머리 이미지가 16:9 한 장을
--   잘림 없이 같이 쓴다. 에셋 제너레이터 스테이지 비율에 16:9(1280×720)를 더하면서 프리셋
--   저장 값도 함께 넓힌다. 지금 CHECK는 세 값만 허용해(마이그레이션 185) 16:9 프리셋을
--   저장하면 CHECK 위반(500)이 된다.
--
-- 설계:
--   - 순수 확장(expand)이다 — CHECK 허용값만 늘리고 컬럼·기존 행은 그대로 둔다. 기존
--     1:1·4:5·9:16 행은 새 CHECK를 그대로 통과하므로 백필이 필요 없다. 확장→전환→축소 분할
--     대상이 아니다(옛 모양을 없애지 않는다, db-migration-rules.md 1절 참고).
--   - **코드(16:9 선택지·프리셋 API 허용값)를 staging에 push하기 전에 먼저 실행한다**
--     (상위 티켓 결정 16). 코드가 먼저 나가면 16:9 프리셋 저장이 CHECK 위반(500)이 된다.
--   - 재실행 가능(idempotent): DROP CONSTRAINT IF EXISTS 뒤 ADD CONSTRAINT로 작성했다.
--   - target_type CHECK(asset_presets_target_type_check)는 이 파일에서 건드리지 않는다.
--
-- 완료 조건(20261001_1202): CHECK가 '1:1'|'4:5'|'9:16'|'16:9' 4개를 허용하고, 기존 프리셋
-- 행(2026-10-01 기준 2행)은 그대로 남는다(회귀 없음).

BEGIN;

ALTER TABLE public.asset_presets DROP CONSTRAINT IF EXISTS asset_presets_stage_ratio_check;
ALTER TABLE public.asset_presets ADD CONSTRAINT asset_presets_stage_ratio_check
  CHECK (stage_ratio IN ('1:1', '4:5', '9:16', '16:9'));

COMMENT ON COLUMN public.asset_presets.stage_ratio IS
  '스테이지 비율(1:1·4:5·9:16·16:9). 어드민 화면 StageRatio 타입과 값이 같다. 16:9는 마이그레이션 205에서 추가했다(티켓 20261001_1202).';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① CHECK 제약이 4개 값을 허용하는지
-- --    (기대: CHECK ((stage_ratio = ANY (ARRAY['1:1'::text, '4:5'::text, '9:16'::text, '16:9'::text])))
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.asset_presets'::regclass AND conname = 'asset_presets_stage_ratio_check';
--
-- -- ② 기존 프리셋이 그대로 남아 있는지(실행 전후 같은 결과여야 한다 — 2026-10-01 기준 합계 2행)
-- SELECT stage_ratio, count(*) FROM public.asset_presets GROUP BY stage_ratio ORDER BY stage_ratio;
--
-- -- ③ 실행 직후에는 16:9 행이 아직 없다(0행이어야 정상)
-- SELECT count(*) FROM public.asset_presets WHERE stage_ratio = '16:9';

-- 되돌림 SQL
-- ⚠️ stage_ratio가 '16:9'인 행이 이미 생겼다면 CHECK를 다시 만드는 문장이 위반으로 실패한다.
--    먼저 그 행을 확인하고 정리한 뒤 실행한다. 비율만 바꿔 저장하면 이미지·텍스트 위치(스테이지
--    기준 %)가 달라져 같은 구도가 아니므로, 값을 바꾸지 않고 삭제하는 것을 기본으로 한다.
--    (이미지 레이어 원본은 저장소에 남는다 — 필요하면 layers의 assetUrl을 먼저 기록해 둔다)
-- -- (1) 정리 대상 확인
-- SELECT id, name, target_type, created_at FROM public.asset_presets WHERE stage_ratio = '16:9';
-- -- (2) 16:9 행 삭제
-- DELETE FROM public.asset_presets WHERE stage_ratio = '16:9';
-- -- (3) CHECK를 옛 값 3개로 되돌림
-- ALTER TABLE public.asset_presets DROP CONSTRAINT IF EXISTS asset_presets_stage_ratio_check;
-- ALTER TABLE public.asset_presets ADD CONSTRAINT asset_presets_stage_ratio_check
--   CHECK (stage_ratio IN ('1:1', '4:5', '9:16'));
-- -- (4) 컬럼 설명을 옛 문구로 되돌림
-- COMMENT ON COLUMN public.asset_presets.stage_ratio IS
--   '스테이지 비율(1:1·4:5·9:16). 어드민 화면 StageRatio 타입과 값이 같다.';
