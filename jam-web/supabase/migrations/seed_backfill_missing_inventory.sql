-- seed_backfill_missing_inventory: 129 적용 이전 가입자의 결측 inventory 행 백필
-- (티켓 20260906_2217 — 지도 POI 픽업 시 "인벤토리를 불러오지 못했어요" 오류)
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- ── 배경 ──────────────────────────────────────────────────────────────────
-- 오케스트레이터가 Supabase MCP로 직접 진단 완료 (티켓 본문 참고):
--   · auth.users 12명 / public.users 12명 / public.inventory 0행 — 가입 유저 전원이
--     인벤토리 레코드 자체가 없다.
--   · 트리거(handle_new_user, 129_inventory_policy_max_slots.sql에서 갱신,
--     실제 적용 2026-09-04 07:41:58 UTC)는 이미 정상 동작한다 — DO 블록으로 동일 로직을
--     수동 실행해(즉시 롤백) 확인함. 다만 129 적용 이후 신규 가입자가 아직 없어
--     실가입 경로로는 검증되지 않았을 뿐이다.
--   · 079번 마이그레이션(079_fix_handle_new_user_missing_inventory.sql)은 파일은 있으나
--     supabase_migrations.schema_migrations에 기록이 없다 — 실제로 프로덕션에 적용된 적이
--     없다(078 다음이 082로 바로 뜀). 지금 함수가 정상인 이유는 079가 아니라 129의
--     CREATE OR REPLACE FUNCTION 전체 재정의 덕분이다.
--   · 결론: 트리거 자체는 고칠 필요 없음. 129 적용 이전에 가입한 기존 유저 전원에 대한
--     inventory 행 백필만 필요하다.
--
-- ── 동작 ──────────────────────────────────────────────────────────────────
-- inventory_policy(id=1).max_slots를 기준값으로 사용한다 — handle_new_user()가 정상
-- 가입 시 참조하는 값과 동일한 소스라 신규/백필 유저 간 max_slots가 어긋나지 않는다.
-- 정책 행 자체가 없는 비정상 상태에서는 컬럼 DEFAULT(001_initial_schema.sql:137)와
-- 동일한 50으로 폴백한다(handle_new_user()의 v_max_slots 폴백과 동일 값).
--
-- 멱등: WHERE NOT EXISTS + ON CONFLICT (user_id) DO NOTHING 이중 방어 — 여러 번 실행해도
-- 이미 존재하는 유저의 inventory 행을 건드리지 않는다.

INSERT INTO public.inventory (user_id, max_slots)
SELECT
  u.id,
  COALESCE((SELECT max_slots FROM public.inventory_policy WHERE id = 1), 50)
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventory i WHERE i.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

-- 실행 후 검증 (기대: 0행 = 결측 없음):
--   SELECT count(*) FROM auth.users u
--   WHERE NOT EXISTS (SELECT 1 FROM public.inventory i WHERE i.user_id = u.id);
