-- 315_asset_presets_engine_state.sql
-- asset_presets.engine_state(JSONB, NULL 허용) 추가 — 3D 모드 설정값(폰트·두께·색·시점)을 프리셋에 담는다 (티켓 20261103_1736)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 오케스트레이터(카리나)가 실행 전 점검(되돌림 SQL 확인, DO 블록 롤백 실측) 뒤에 처리한다.
--
-- 설계:
--   - 순수 확장(expand)이다 — 칸 하나만 덧붙이고 기존 행·CHECK·RLS는 건드리지 않는다. 기존 행은 NULL로 남고
--     옛 코드(칸을 모르는 코드)는 그대로 동작한다. 백필이 필요 없다(db-migration-rules.md 1·2절 해당 없음).
--   - **칸을 읽는 코드(presets API)를 staging에 push하기 전에 먼저 실행한다.** 코드가 먼저 나가면 저장·조회 때
--     "column engine_state does not exist"로 500이 된다.
--   - 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS.
--   - 값 형식(앱이 저장 API에서 검증한다): { "mode": "3d", "version": 1, "state": { ... } }. NULL은 «모드 설정 없음».
--     DB는 형식을 강제하지 않는다 — mode가 늘어나도 마이그레이션이 필요 없게 하려는 선택이다.

BEGIN;

ALTER TABLE public.asset_presets
  ADD COLUMN IF NOT EXISTS engine_state JSONB;

COMMENT ON COLUMN public.asset_presets.engine_state IS
  '모드별 설정값. { "mode": "3d", "version": 1, "state": { ... } } 형식(저장 API가 검증). NULL이면 비율·레이어만 담은 프리셋이다. 티켓 20261103_1736.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 칸이 생겼는지 (기대: engine_state | jsonb | YES)
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'asset_presets' AND column_name = 'engine_state';
--
-- -- ② 기존 행 수가 그대로고 전부 NULL인지 (실행 전후 total이 같아야 하고, with_engine_state는 0)
-- SELECT count(*) AS total, count(engine_state) AS with_engine_state FROM public.asset_presets;

-- 되돌림 SQL
-- ⚠️ 칸에 저장된 3D 설정값도 함께 사라진다(비율·레이어는 그대로). 지우기 전에 코드를 먼저 되돌린다 —
--    presets API가 engine_state를 select·insert하므로 칸이 없으면 단건 조회·저장이 500이 된다.
-- ALTER TABLE public.asset_presets DROP COLUMN IF EXISTS engine_state;
