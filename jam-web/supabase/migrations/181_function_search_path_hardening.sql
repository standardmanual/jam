-- 181: 함수 18개 search_path 고정 (Supabase 보안 어드바이저 function_search_path_mutable)
--
-- 배경:
--   보안 린터가 아래 18개 함수의 search_path가 고정되지 않았다고 보고했다(레벨 WARN).
--   search_path가 비어 있으면 호출 시점의 세션 search_path를 따라가므로, 같은 이름의
--   객체를 다른 스키마에 만들어 함수 동작을 가로채는 공격(search_path hijacking)에
--   노출된다. 함수 본문은 바꾸지 않고 검색 경로만 고정한다.
--
-- 설계:
--   - 이미 이 패턴이 적용된 apply_tribe_background_cascade·count_tribe_background_cascade
--     (마이그레이션 092)와 동일하게 `SET search_path = public`으로 고정한다.
--   - ALTER FUNCTION ... SET은 함수 정의를 재작성하지 않는 설정 변경이라 동작에 영향이 없다.
--
-- 재실행 가능(idempotent): ALTER FUNCTION ... SET은 몇 번을 실행해도 같은 결과다.

BEGIN;

ALTER FUNCTION public.admin_destroy_orphaned_item(p_item_id uuid, p_admin_id uuid) SET search_path = public;
ALTER FUNCTION public.admin_reassign_orphaned_item(p_item_id uuid, p_admin_id uuid, p_target_user_id uuid) SET search_path = public;
ALTER FUNCTION public.assign_random_serial() SET search_path = public;
ALTER FUNCTION public.check_family_condition_consistency() SET search_path = public;
ALTER FUNCTION public.create_user_drop(p_dropper_id uuid, p_poi_id uuid, p_inventory_item_id uuid) SET search_path = public;
ALTER FUNCTION public.expire_stale_poi_drops() SET search_path = public;
ALTER FUNCTION public.generate_serial_prefix() SET search_path = public;
ALTER FUNCTION public.grant_inventory_item(p_inventory_id uuid, p_badge_id uuid, p_obtained_by text, p_expires_at timestamptz) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.handle_updated_at() SET search_path = public;
ALTER FUNCTION public.log_orphan_custody_events() SET search_path = public;
ALTER FUNCTION public.mint_and_place_ambient_drop(p_poi_id uuid, p_badge_id uuid) SET search_path = public;
ALTER FUNCTION public.pickup_drop(p_drop_id uuid, p_picker_id uuid, p_inventory_id uuid) SET search_path = public;
ALTER FUNCTION public.release_inventory_slots(p_inventory_id uuid, p_count integer) SET search_path = public;
ALTER FUNCTION public.set_inventory_max_slots(p_max_slots integer) SET search_path = public;
ALTER FUNCTION public.slot_item_into_book(p_user_id uuid, p_item_book_id uuid, p_inventory_item_id uuid) SET search_path = public;
ALTER FUNCTION public.swap_item_in_book(p_user_id uuid, p_item_book_id uuid, p_slot_id uuid, p_new_inventory_item_id uuid) SET search_path = public;
ALTER FUNCTION public.unslot_item_from_book(p_user_id uuid, p_slot_id uuid) SET search_path = public;

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- SELECT proname, proconfig FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
--   AND proname IN (
--     'admin_destroy_orphaned_item','admin_reassign_orphaned_item','assign_random_serial',
--     'check_family_condition_consistency','create_user_drop','expire_stale_poi_drops',
--     'generate_serial_prefix','grant_inventory_item','handle_new_user','handle_updated_at',
--     'log_orphan_custody_events','mint_and_place_ambient_drop','pickup_drop',
--     'release_inventory_slots','set_inventory_max_slots','slot_item_into_book',
--     'swap_item_in_book','unslot_item_from_book'
--   );
-- -- 18행 모두 proconfig에 {search_path=public}이 보여야 정상

-- ↩️ 롤백 DDL
--    (각 함수별) ALTER FUNCTION public.<name>(<args>) RESET search_path;
