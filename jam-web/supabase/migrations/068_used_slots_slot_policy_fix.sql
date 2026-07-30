-- ============================================================
-- Migration 068: 인벤토리 used_slots 정책 확정 + 기존 데이터 정합화
--
-- 확정 정책: 아이템북에 슬롯된 아이템(slotted_in NOT NULL)은 인벤토리 칸을
-- 차지하지 않는다. 드랍(dropped_at NOT NULL)된 아이템도 더 이상 소유가 아니므로
-- 차지하지 않는다. 즉 used_slots = 진짜 "지금 인벤토리에 있는" 아이템 수만 반영해야 한다.
--
-- 지금까지는:
--   - 슬롯해도 used_slots가 안 줄어듦 (애플리케이션 코드 버그, 이번에 같이 수정)
--   - 드랍해도 used_slots가 안 줄어듦 (위와 동일)
--   - 그 결과 슬롯된 아이템이 이후 드랍까지 되어버리는 모순 데이터도 일부 존재
--     (아이템북 상세 화면이 dropped_at 필터 없이 "슬롯 후보"를 찾던 버그로 발생)
--
-- 이 마이그레이션은 그 두 가지를 한 번에 정리한다.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. 모순 데이터 정리: slotted_in과 dropped_at이 동시에 찍힌 아이템은
--    이미 남에게 넘어간 것이므로 슬롯을 해제한다(완성 기록은 건드리지 않음 —
--    완성은 한 번 달성한 이력으로 유지, 물리적 슬롯 상태만 정정).
-- ----------------------------------------------------------------
DELETE FROM public.user_item_book_slots s
USING public.inventory_items ii
WHERE s.id = ii.slotted_in
  AND ii.dropped_at IS NOT NULL;

UPDATE public.inventory_items
SET slotted_in = NULL
WHERE dropped_at IS NOT NULL
  AND slotted_in IS NOT NULL;

-- ----------------------------------------------------------------
-- 2. 전체 유저 used_slots 재계산 — "드랍 안 됐고 슬롯도 안 된" 아이템 수만 반영
-- ----------------------------------------------------------------
UPDATE public.inventory i
SET used_slots = (
  SELECT COUNT(*)
  FROM public.inventory_items ii
  WHERE ii.inventory_id = i.id
    AND ii.dropped_at IS NULL
    AND ii.slotted_in IS NULL
);
