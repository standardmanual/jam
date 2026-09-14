-- ============================================================
-- 티켓 20260914_1945 폐기 처리 정정 — inventory_id 미해제 수정 (2026-09-15)
--
-- 20260914_1945에서 유출된 아이템배지 6개체를 폐기(destroyed_at)했으나, inventory_id를
-- NULL로 비우지 않아 인벤토리 목록 화면(app/(main)/inventory/page.tsx)에 계속 노출됐다.
-- 이 코드베이스의 관례는 "보유 여부 = inventory_id IS NOT NULL"이고(combine/index.ts 주석,
-- lib/admin/item-badge-status.ts 참고), destroyed_at만으로는 화면단 조회가 걸러내지 못한다.
-- combine의 기존 소각 로직은 이미 이 관례를 지켜 inventory_id를 함께 비우고 있었다 —
-- 이번 수기 작업에서 그 관례를 놓쳤다.
--
-- custody_events는 20260914_1945에서 이미 AdminDestroy로 기록돼 있어 재기록하지 않는다.
-- ============================================================

UPDATE public.inventory_items
SET inventory_id = NULL
WHERE id IN (
  '184bbf52-4de5-4b39-9a22-5e33062381d6',
  'c63a5a44-48a1-4d54-af33-1d9614927bd0',
  'abcec529-f60d-41bf-ab18-556daa3c70b9',
  '8f50e52b-0925-402d-979a-21fa5348de04',
  '938ec269-daef-435e-941d-e469b9f65351',
  'cb55eb76-1d57-4730-a023-ce855ed83b94'
)
AND destroyed_at IS NOT NULL;
