-- 325_cleanup_inactive_collection_held_items.sql
-- 비활성 컬렉션 배지의 보유 개체 21개를 정리한다 (티켓 20261106_1044)
--
-- 왜
--   어드민에서 꺼 둔 컬렉션(item_books.is_active = false)의 아이템 배지는 읽기 정책(badges: 전체 읽기 허용)이 사용자 화면에서 숨긴다.
--   그런데 이미 받은 개체는 칸(inventory.used_slots)을 그대로 차지해서, 화면에는 8개만 보이는데 «10/10 가득 찼어요»가 나왔다
--   (sihyunrr@gmail.com 계정, 2026-11-06 사용자 확인). 같은 상태의 개체가 5개 계정에 21개 있다.
--
-- 하는 일 (한 트랜잭션, 멈추는 조건 포함)
--   1. 대상: 인벤토리에 있고(inventory_id 있음) 장착·드랍·파괴되지 않았으며 비활성 컬렉션 배지인 개체. 21개가 아니면 멈춘다.
--   2. 개체를 소프트 파괴한다: destroyed_at = now(), inventory_id = NULL. 조합 소모·만료·어드민 폐기와 같은 방식이며 행과 이력은 남는다
--      (일련번호는 destroyed_at 부분 유니크 인덱스 덕분에 풀로 돌아간다).
--   3. 소유 인벤토리의 used_slots를 파괴한 개수만큼 줄인다.
--   4. custody_events에 'AdminDestroy'를 남긴다 (actor_username에 이 정리의 표지를 적는다. 되돌림 SQL이 이 표지로 이력을 찾는다).
--   5. 끝에서 대상 0개, 5개 인벤토리의 used_slots가 실제 칸 차지 개체 수와 같은지 검사하고 어긋나면 전체를 되돌린다.
--
-- 하지 않는 것
--   - 배지(badges)는 건드리지 않는다. 예약 컬렉션은 오픈 때 is_active 하나로 켜는 계획이라(292) 배지는 살아 있어야 한다.
--   - 장착된 개체(slotted_in 있음)는 칸을 차지하지 않으므로 건드리지 않는다.
--   - 월드에 남은 드랍(poi_drops)은 건드리지 않는다. 별도 판단 사항이다(티켓 참고).
--
-- 되돌림: 325_cleanup_inactive_collection_held_items_down.sql

DO $$
DECLARE
  v_expected CONSTANT integer := 21;
  v_marker   CONSTANT text := '정리 20261106 비활성 컬렉션 개체';
  v_found    integer;
  v_left     integer;
  v_mismatch integer;
BEGIN
  CREATE TEMP TABLE _t325 ON COMMIT DROP AS
  SELECT ii.id AS item_id, ii.inventory_id, i.user_id, u.username
  FROM public.inventory_items ii
  JOIN public.inventory i ON i.id = ii.inventory_id
  JOIN public.users u ON u.id = i.user_id
  JOIN public.badges b ON b.id = ii.badge_id
  JOIN public.item_books ib ON ib.id = b.item_book_id
  WHERE ii.dropped_at IS NULL
    AND ii.slotted_in IS NULL
    AND ii.destroyed_at IS NULL
    AND ib.is_active = false;

  SELECT count(*) INTO v_found FROM _t325;
  IF v_found <> v_expected THEN
    RAISE EXCEPTION '325: 대상이 %개라 멈춘다 (기대 %개). 상태가 바뀌었으니 사람이 다시 본다', v_found, v_expected;
  END IF;

  -- 같은 개체·인벤토리를 만지는 다른 요청과 겹치지 않도록 잠근다
  PERFORM 1 FROM public.inventory_items WHERE id IN (SELECT item_id FROM _t325) FOR UPDATE;
  PERFORM 1 FROM public.inventory WHERE id IN (SELECT DISTINCT inventory_id FROM _t325) FOR UPDATE;

  UPDATE public.inventory_items ii
  SET destroyed_at = now(), inventory_id = NULL
  FROM _t325 t
  WHERE ii.id = t.item_id;

  UPDATE public.inventory inv
  SET used_slots = GREATEST(0, inv.used_slots - c.n)
  FROM (SELECT inventory_id, count(*)::integer AS n FROM _t325 GROUP BY inventory_id) c
  WHERE inv.id = c.inventory_id;

  INSERT INTO public.custody_events (inventory_item_id, event_type, from_user_id, from_username, actor_username)
  SELECT item_id, 'AdminDestroy', user_id, username, v_marker FROM _t325;

  -- 검증 1: 같은 조건의 대상이 남지 않았다
  SELECT count(*) INTO v_left
  FROM public.inventory_items ii
  JOIN public.badges b ON b.id = ii.badge_id
  JOIN public.item_books ib ON ib.id = b.item_book_id
  WHERE ii.inventory_id IS NOT NULL AND ii.dropped_at IS NULL AND ii.slotted_in IS NULL
    AND ii.destroyed_at IS NULL AND ib.is_active = false;
  IF v_left <> 0 THEN
    RAISE EXCEPTION '325: 정리 뒤에도 대상이 %개 남았다', v_left;
  END IF;

  -- 검증 2: 영향받은 인벤토리의 used_slots가 실제 칸 차지 개체 수와 같다
  SELECT count(*) INTO v_mismatch
  FROM public.inventory inv
  WHERE inv.id IN (SELECT DISTINCT inventory_id FROM _t325)
    AND inv.used_slots <> (
      SELECT count(*) FROM public.inventory_items x
      WHERE x.inventory_id = inv.id AND x.dropped_at IS NULL AND x.slotted_in IS NULL AND x.destroyed_at IS NULL
    );
  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION '325: used_slots가 실제 개체 수와 다른 인벤토리가 %개다', v_mismatch;
  END IF;
END $$;
