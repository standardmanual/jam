-- seed_backfill_missing_inventory.sql
--
-- 티켓 20260906_2217: public.inventory 전체 유저(12명) 결측 백필.
-- 원인: handle_new_user() 트리거가 079(미적용 확인됨) 이전에는 inventory INSERT를
-- 누락한 채로 프로덕션에 있었고, 129_inventory_policy_max_slots.sql이 CREATE OR REPLACE로
-- 정상 버전을 도입하기 전까지 가입한 유저 전원이 inventory 행 없이 남아 있었다.
-- 129 적용(2026-09-04 07:41:58 UTC) 이후 신규 가입자가 아직 없어 트리거 자체는 이미
-- 정상이라는 점만으로는 드러나지 않았다 — 기존 유저 백필만 필요하다.
--
-- 이 실행으로 해소되는 증상 두 가지:
--   1. POI 픽업 시 "인벤토리를 불러오지 못했어요" (inventory_not_found)
--   2. 어드민 인벤토리 최대치(inventory_policy.max_slots) 변경이 기존 유저에게 반영되지
--      않고 인벤토리 화면이 하드코딩 폴백(0/50)을 보여주던 증상
--      (inventory/page.tsx의 `inventory?.max_slots ?? 50` 폴백이 계속 타고 있었음)

INSERT INTO public.inventory (user_id, max_slots)
SELECT u.id, COALESCE((SELECT max_slots FROM public.inventory_policy WHERE id = 1), 50)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.inventory i WHERE i.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;
