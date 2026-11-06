-- 329_cleanup_non_launch_collections_for_open_down.sql
-- 329가 지운 것을 백업 표 `launch_backup_20261106`에서 복원한다 (티켓 20261106_1337)
--
-- 하는 일 (한 트랜잭션)
--   1. 백업 표가 있고 행이 기대 건수(개체 741·슬롯 89·완성 2·월드 드랍 631·컬렉션 발급 63·배지 발급 222·알림 6·컬렉션 63·인벤토리 N)인지 본다. 아니면 멈춘다.
--   2. 장착 슬롯, 완성 기록, 등급별 완성 기록, 컬렉션·배지 발급 기록, 알림을 되살린다(`ON CONFLICT DO NOTHING`).
--   3. 개체의 `destroyed_at`·`inventory_id`·`slotted_in`을 백업 값으로 되돌린다(슬롯을 먼저 되살린 뒤).
--   4. 월드 드랍을 다시 올리고(`is_available = true`), 인벤토리 `used_slots`를 백업 값으로 되돌린다.
--   5. 컬렉션의 `is_active`를 백업 값으로 되돌린다.
--   6. 329가 남긴 보관 이력 'AdminDestroy'(표지 '오픈 준비 정리 20261106')를 지운다.
--
-- 주의
--   - 정리로 풀린 일련번호를 다른 개체가 받았다면 일련번호 부분 유니크 인덱스에 걸려 전체가 취소된다.
--   - 되돌린 뒤에도 백업 표는 지우지 않는다. 복구를 확인한 뒤 따로 지운다(`DROP TABLE public.launch_backup_20261106`).

BEGIN;

DO $do$
DECLARE
  c_marker CONSTANT text := '오픈 준비 정리 20261106';
  v_items integer; v_slots integer; v_comp integer; v_drops integer; v_ibooks integer; v_ibadges integer; v_notifs integer; v_books integer;
BEGIN
  IF to_regclass('public.launch_backup_20261106') IS NULL THEN RAISE EXCEPTION '329 되돌림: 백업 표가 없다'; END IF;
  SELECT count(*) FILTER (WHERE kind='inventory_item'), count(*) FILTER (WHERE kind='user_item_book_slot'),
         count(*) FILTER (WHERE kind='user_item_book_completion'), count(*) FILTER (WHERE kind='poi_drop'),
         count(*) FILTER (WHERE kind='issued_item_book'), count(*) FILTER (WHERE kind='issued_item_badge'),
         count(*) FILTER (WHERE kind='notification'), count(*) FILTER (WHERE kind='item_book')
    INTO v_items, v_slots, v_comp, v_drops, v_ibooks, v_ibadges, v_notifs, v_books
  FROM public.launch_backup_20261106;
  IF (v_items, v_slots, v_comp, v_drops, v_ibooks, v_ibadges, v_notifs, v_books) IS DISTINCT FROM (741, 89, 2, 631, 63, 222, 6, 63) THEN
    RAISE EXCEPTION '329 되돌림: 백업 건수가 다르다 (개체 %, 슬롯 %, 완성 %, 드랍 %, 컬렉션 발급 %, 배지 발급 %, 알림 %, 컬렉션 %)',
      v_items, v_slots, v_comp, v_drops, v_ibooks, v_ibadges, v_notifs, v_books;
  END IF;

  INSERT INTO public.user_item_book_slots
    SELECT (jsonb_populate_record(NULL::public.user_item_book_slots, snapshot)).* FROM public.launch_backup_20261106 WHERE kind = 'user_item_book_slot'
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_item_book_completions
    SELECT (jsonb_populate_record(NULL::public.user_item_book_completions, snapshot)).* FROM public.launch_backup_20261106 WHERE kind = 'user_item_book_completion'
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_item_book_tier_completions
    SELECT (jsonb_populate_record(NULL::public.user_item_book_tier_completions, snapshot)).* FROM public.launch_backup_20261106 WHERE kind = 'user_item_book_tier_completion'
  ON CONFLICT DO NOTHING;
  INSERT INTO public.issued_item_books
    SELECT (jsonb_populate_record(NULL::public.issued_item_books, snapshot)).* FROM public.launch_backup_20261106 WHERE kind = 'issued_item_book'
  ON CONFLICT DO NOTHING;
  INSERT INTO public.issued_item_badges
    SELECT (jsonb_populate_record(NULL::public.issued_item_badges, snapshot)).* FROM public.launch_backup_20261106 WHERE kind = 'issued_item_badge'
  ON CONFLICT DO NOTHING;
  INSERT INTO public.notifications
    SELECT (jsonb_populate_record(NULL::public.notifications, snapshot)).* FROM public.launch_backup_20261106 WHERE kind = 'notification'
  ON CONFLICT DO NOTHING;

  UPDATE public.inventory_items ii
  SET destroyed_at = (b.snapshot->>'destroyed_at')::timestamptz,
      inventory_id = (b.snapshot->>'inventory_id')::uuid,
      slotted_in   = (b.snapshot->>'slotted_in')::uuid
  FROM public.launch_backup_20261106 b
  WHERE b.kind = 'inventory_item' AND ii.id = b.row_id;

  UPDATE public.poi_drops d SET is_available = TRUE
  FROM public.launch_backup_20261106 b WHERE b.kind = 'poi_drop' AND d.id = b.row_id;

  UPDATE public.inventory inv SET used_slots = (b.snapshot->>'used_slots')::integer
  FROM public.launch_backup_20261106 b WHERE b.kind = 'inventory' AND inv.id = b.row_id;

  UPDATE public.item_books ib SET is_active = (b.snapshot->>'is_active')::boolean
  FROM public.launch_backup_20261106 b WHERE b.kind = 'item_book' AND ib.id = b.row_id;

  DELETE FROM public.custody_events ce
  USING public.launch_backup_20261106 b
  WHERE b.kind = 'inventory_item' AND ce.inventory_item_id = b.row_id
    AND ce.event_type = 'AdminDestroy' AND ce.actor_username = c_marker;
END $do$;

COMMIT;
