-- 331_cleanup_232_mixed_tier_slots_down.sql
-- 331이 푼 232 계정의 장착 12칸을 백업 표(`sample_seed_232_slot_fix_backup_20261109`)에서 되돌린다.
--
-- 하는 일: 백업된 슬롯 행을 같은 id로 다시 넣고, 그 칸의 개체에 `slotted_in`을 다시 걸고, `inventory.used_slots`를 실제 칸 차지 개체 수로 맞춘다.
-- 하지 않는 것: 331이 남긴 `custody_events`의 'Unslot' 이력은 지우지 않는다(보관 이력은 사실의 기록이다).
-- 주의: 되돌리면 세 컬렉션에 여러 등급이 다시 섞인다(시드 원래 모양). 백업 표는 되돌림 뒤에 직접 지운다.

BEGIN;

DO $do$
DECLARE
  U CONSTANT uuid := '00000000-0000-0000-0000-000000000001';
  v_inv   uuid;
  v_n     integer;
BEGIN
  IF (SELECT count(*) FROM public.sample_seed_232_slot_fix_backup_20261109) <> 12 THEN
    RAISE EXCEPTION '백업 행이 기대(12)와 다르다';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_item_book_slots s JOIN public.sample_seed_232_slot_fix_backup_20261109 b ON b.row_id = s.id) THEN
    RAISE EXCEPTION '이미 되돌려진 칸이 있다';
  END IF;

  INSERT INTO public.user_item_book_slots
  SELECT (jsonb_populate_record(NULL::public.user_item_book_slots, snapshot)).*
  FROM public.sample_seed_232_slot_fix_backup_20261109;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 12 THEN RAISE EXCEPTION '복원된 슬롯 행이 기대(12)와 다르다: %', v_n; END IF;

  UPDATE public.inventory_items i SET slotted_in = s.id
  FROM public.user_item_book_slots s
  WHERE s.id IN (SELECT row_id FROM public.sample_seed_232_slot_fix_backup_20261109) AND i.id = s.inventory_item_id;

  SELECT id INTO v_inv FROM public.inventory WHERE user_id = U;
  UPDATE public.inventory SET used_slots = (
    SELECT count(*) FROM public.inventory_items WHERE inventory_id = v_inv AND slotted_in IS NULL AND dropped_at IS NULL AND destroyed_at IS NULL)
  WHERE id = v_inv;
END $do$;

COMMIT;

-- 되돌린 뒤 백업 표를 지운다: DROP TABLE public.sample_seed_232_slot_fix_backup_20261109;
