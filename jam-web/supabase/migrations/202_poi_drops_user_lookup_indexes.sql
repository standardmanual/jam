-- 202: poi_drops 유저별 조회 인덱스 2개 — 드랍·픽업 행동 지표용
--      (티켓 20261001_0632, 상위 20260930_1456 ②)
--
-- 배경:
--   드랍·픽업 행동 지표 4종(`src/lib/badge-engine/jamActionDropMetrics.ts`)은 한 유저의 `poi_drops`
--   행을 «놓은 사람 기준»·«주운 사람 기준»으로 끝까지 읽는다:
--
--     놓은 사람 기준: WHERE dropper_user_id = $1 AND inventory_item_id IS NOT NULL ORDER BY id
--     주운 사람 기준: WHERE picked_up_by    = $1 AND inventory_item_id IS NOT NULL ORDER BY id
--
--   라이브 `poi_drops`의 인덱스는 idx_poi_drops_available · idx_poi_drops_inventory_item ·
--   idx_poi_drops_system_available · poi_drops_pkey 4개뿐이라(2026-10-01 확인, 저장소와 같음)
--   두 조회 모두 전체 스캔이다. 부분 조건 `inventory_item_id IS NOT NULL`은 코드의
--   `.not('inventory_item_id', 'is', null)`와 같고(2026-08-29 이전 옛 행 제외), 끝 열 `id`는
--   페이지 조회의 `.order('id')`를 인덱스 순서로 받기 위해서다.
--
--   CONCURRENTLY를 쓰지 않는다 — 이 글을 쓰는 시점 `poi_drops`는 약 1,133행이라 인덱스 생성이
--   쓰기를 막는 시간이 무시할 만하다. 행이 수십만으로 늘어난 뒤 같은 종류의 인덱스를 더한다면
--   `CREATE INDEX CONCURRENTLY`(트랜잭션 밖, 단독 실행)로 만든다.
--
--   201(condition_json CHECK 확장)과는 서로 독립이다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: 코드 배포와 무관하다. 인덱스가 없어도 코드는 정확히 동작하고(느릴 뿐), 있으면 빨라진다.
--
-- 재실행 가능(idempotent): CREATE INDEX IF NOT EXISTS.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_poi_drops_dropper_lookup
  ON public.poi_drops (dropper_user_id, id)
  WHERE inventory_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_poi_drops_picker_lookup
  ON public.poi_drops (picked_up_by, id)
  WHERE inventory_item_id IS NOT NULL;

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 인덱스 2개가 생겼는지
-- SELECT indexname FROM pg_indexes
--   WHERE schemaname = 'public' AND tablename = 'poi_drops'
--   ORDER BY indexname;
--   -- idx_poi_drops_dropper_lookup, idx_poi_drops_picker_lookup 포함
--
-- -- ② 4지표 SQL 기준값 (읽기 전용) — 코드(jamActionDropMetrics.ts)의 계산과 대조하는 용도
-- SELECT u.id,
--   (SELECT count(DISTINCT inventory_item_id) FROM poi_drops WHERE dropper_user_id=u.id AND inventory_item_id IS NOT NULL) AS drop_item_count,
--   (SELECT count(DISTINCT inventory_item_id) FROM poi_drops WHERE picked_up_by=u.id AND inventory_item_id IS NOT NULL AND dropper_user_id IS DISTINCT FROM u.id) AS pickup_item_count,
--   (SELECT count(DISTINCT dropper_user_id) FROM poi_drops WHERE picked_up_by=u.id AND inventory_item_id IS NOT NULL AND dropper_user_id IS NOT NULL AND dropper_user_id <> u.id) AS pickup_from_user_count,
--   (SELECT count(DISTINCT picked_up_by) FROM poi_drops WHERE dropper_user_id=u.id AND inventory_item_id IS NOT NULL AND picked_up_by IS NOT NULL AND picked_up_by <> u.id) AS picked_up_by_user_count
-- FROM users u;

-- 되돌림 SQL
-- DROP INDEX IF EXISTS public.idx_poi_drops_dropper_lookup;
-- DROP INDEX IF EXISTS public.idx_poi_drops_picker_lookup;
