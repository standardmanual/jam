-- ============================================================
-- 미션 보상 전용 아이템배지의 드랍 유출분 회수·폐기 (2026-09-14, 티켓 20260914_1945)
--
-- 배경: 미션 보상으로만 지급되어야 할 아이템배지 18종(missions.reward_badge_ids로 확인)이
-- 전부 badges.drop_excluded=false 상태로 방치돼 드랍엔진의 일반 확률 뽑기 후보에도 섞여
-- 있었다. 그 결과 실제로 6개 개체가 미션 완료 없이 드랍으로 유출됐다(실유저 3명 + 테스트
-- 계정 1명). 사용자 확인 후 이 유출분 전량을 회수·폐기한다. 유저 알림은 만들지 않는다
-- (사용자 지시).
--
-- 대상 6개체:
--   184bbf52-4de5-4b39-9a22-5e33062381d6  kangwonc   5일 연속 출석 워킹        Held
--   c63a5a44-48a1-4d54-af33-1d9614927bd0  kangwonc   주간 꾸준함 마스터         Held
--   abcec529-f60d-41bf-ab18-556daa3c70b9  kangwonc   더블 데일리 런             Held
--   8f50e52b-0925-402d-979a-21fa5348de04  cheerslovelymate  주간 5일 꾸준 러너   Held
--   938ec269-daef-435e-941d-e469b9f65351  jae_everydae      모닝 & 이브닝        Slotted(먼저 해제)
--   cb55eb76-1d57-4730-a023-ce855ed83b94  god(테스트)       5일 연속 습관 런     Slotted(먼저 해제)
--
-- 처리 순서: ①슬롯된 2건은 기존 unslot_item_from_book() RPC로 먼저 해제(Held로 전이,
-- custody_events 'Unslot' 자동 기록) → ②6건 전부 destroyed_at 처리 + 인벤토리 칸 반환
-- + custody_events 'AdminDestroy' 기록(§3.5-1 8종 이벤트 중 이 경로 전용으로 이미 존재).
-- ============================================================

BEGIN;

-- ⓪ 재유출 방지 — 미션 보상 전용 아이템배지 18종을 드랍 후보에서 제외
-- (회수만 하고 이 플래그를 안 켜면 다음 동기화에서 곧바로 다시 새 개체가 드랍될 수 있다)
UPDATE public.badges
SET drop_excluded = TRUE
WHERE id IN (
  SELECT DISTINCT b.id
  FROM public.missions m, unnest(m.reward_badge_ids) AS badge_id
  JOIN public.badges b ON b.id = badge_id
  WHERE b.type = 'item'
);

-- ① 슬롯된 2건 해제 (Held로 되돌림 — 인벤토리 칸을 일시적으로 다시 소비)
SELECT public.unslot_item_from_book('dad44dda-5a52-45db-a060-669230118f34', '67341ef5-042e-4f26-b1eb-035267bb3044');
SELECT public.unslot_item_from_book('3649ed39-2be2-402e-82ae-41e0cd328105', '461343e5-335d-46b2-8e74-fbcfcde768a1');

-- ② 6건 전부 폐기(destroyed_at) — 해제로 다시 소비된 칸 포함, 유저별 개수만큼 칸 반환
WITH targets AS (
  SELECT id, inventory_id
  FROM public.inventory_items
  WHERE id IN (
    '184bbf52-4de5-4b39-9a22-5e33062381d6',
    'c63a5a44-48a1-4d54-af33-1d9614927bd0',
    'abcec529-f60d-41bf-ab18-556daa3c70b9',
    '8f50e52b-0925-402d-979a-21fa5348de04',
    '938ec269-daef-435e-941d-e469b9f65351',
    'cb55eb76-1d57-4730-a023-ce855ed83b94'
  )
  AND destroyed_at IS NULL
),
destroy AS (
  UPDATE public.inventory_items
  SET destroyed_at = NOW()
  WHERE id IN (SELECT id FROM targets)
  RETURNING id, inventory_id
),
per_inventory AS (
  SELECT inventory_id, count(*) AS n FROM destroy GROUP BY inventory_id
)
UPDATE public.inventory inv
SET used_slots = GREATEST(0, inv.used_slots - per_inventory.n)
FROM per_inventory
WHERE inv.id = per_inventory.inventory_id;

INSERT INTO public.custody_events (inventory_item_id, event_type, actor_username)
SELECT id, 'AdminDestroy', 'admin_migration_20260914_1945'
FROM public.inventory_items
WHERE id IN (
  '184bbf52-4de5-4b39-9a22-5e33062381d6',
  'c63a5a44-48a1-4d54-af33-1d9614927bd0',
  'abcec529-f60d-41bf-ab18-556daa3c70b9',
  '8f50e52b-0925-402d-979a-21fa5348de04',
  '938ec269-daef-435e-941d-e469b9f65351',
  'cb55eb76-1d57-4730-a023-ce855ed83b94'
);

COMMIT;
