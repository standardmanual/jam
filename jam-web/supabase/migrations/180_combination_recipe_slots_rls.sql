-- 180: combination_recipe_slots RLS 활성화 (Supabase 보안 어드바이저 rls_disabled_in_public)
--
-- 배경:
--   Supabase 보안 린터가 `public.combination_recipe_slots`에 RLS가 꺼져 있다고 보고했다
--   (레벨 ERROR, rls_disabled_in_public). 이 테이블은 PostgREST 기본 grant로 anon·authenticated
--   롤에 SELECT/INSERT/UPDATE/DELETE가 모두 열려 있어, RLS가 없으면 로그인하지 않은 사용자도
--   조합 레시피 슬롯 정의를 직접 쓰기할 수 있는 상태였다.
--
-- 설계:
--   - recipe_id·slot_order·badge_type·allowed_badge_ids로 구성된 백엔드 관리용 설정 데이터다
--     (유저별 데이터 아님).
--   - 형제 테이블 combination_recipes·combine_policy와 동일한 패턴을 따른다: RLS는 켜되 정책은
--     만들지 않는다. service_role은 RLS를 우회하므로 백엔드 기능에는 영향이 없고,
--     anon/authenticated는 기본 거부된다.
--
-- 재실행 가능(idempotent): ALTER TABLE ... ENABLE ROW LEVEL SECURITY는 이미 켜져 있어도 안전하다.

BEGIN;

ALTER TABLE public.combination_recipe_slots ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① RLS가 켜졌고 정책이 없는지(= anon/authenticated 접근 불가)
-- SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'combination_recipe_slots';
-- SELECT policyname FROM pg_policies WHERE tablename = 'combination_recipe_slots'; -- 0행이어야 정상

-- 되돌림 SQL
--    ALTER TABLE public.combination_recipe_slots DISABLE ROW LEVEL SECURITY;
