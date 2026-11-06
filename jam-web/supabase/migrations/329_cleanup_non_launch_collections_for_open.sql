-- 329_cleanup_non_launch_collections_for_open.sql
-- 오픈 준비 1회성 정리: 오픈 때 여는 컬렉션 15개를 뺀, 서비스에 노출된 컬렉션·아이템 배지의 흔적을 지운다 (티켓 20261106_1337)
--
-- 사용자 지시(2026-11-06, 이번 한 번만)
--   «Jam 2.0에서 런칭하기로 했던 컬렉션과 배지는 유저에게서 강제 삭제하고 비활성화해. 이번에만 오픈 준비를 위해 정리하는거야»
--   «오픈때 열 컬렉션 15개를 제외한 나머지 서비스에서 보이는 모든 컬렉션과 아이템 배지를 제거 … 제거의 의미는 15개를 제외하고 비활성.
--    서비스에 노출된걸 삭제하라는 의미»  /  실행 시기: 지금 바로. 함께 정리: 컬렉션 알림 6건(홈 카드 7장은 건드리지 않는다).
--
-- 대상
--   «오픈 때 여는 15개» = 첫 공개 컬렉션 15개(292 헤더의 이름 목록, 현재 활성 15개와 같다). 이를 뺀 컬렉션 중 서비스에 보이는 것
--   = 개체가 한 번이라도 만들어져 발급 기록(`issued_item_books`)이 있거나 켜져 있는 컬렉션(2026-11-06 읽기: 63개, 모두 꺼져 있음).
--   아직 한 번도 발급되지 않아 보이지 않는 컬렉션 28개는 대상이 아니다.
--
-- 하는 일 (한 트랜잭션, 건수 가드 포함)
--   1. 대상 확정과 가드: 첫 공개 15개가 이름으로 정확히 15개이고 모두 켜져 있는지, 대상이 기대 건수(63개 컬렉션·개체 741·장착 89·완성 2·월드 드랍 631·
--      알림 6·발급 기록 222)와 같은지 본다. 하나라도 다르면 멈춘다.
--   2. 백업: 바뀌기 직전의 행을 `launch_backup_20261106`(행 단위 보안 켬, 정책 없음)에 담는다. 되돌림 SQL이 이 표를 쓴다.
--   3. 장착 슬롯 89개를 지우고, 대상 개체 741개를 소프트 파괴한다(`destroyed_at = now()`, `inventory_id = NULL`. 조합 소모·만료·325와 같은 방식).
--      보관 이력 `custody_events`에 'AdminDestroy'를 남긴다(표지 '오픈 준비 정리 20261106').
--   4. 파괴한 개체가 놓여 있던 월드 드랍 631개를 내린다(`is_available = false`).
--   5. 칸을 차지하던 개체(인벤토리에 있고 장착되지 않은 21개)만큼 `inventory.used_slots`를 줄인다.
--   6. 컬렉션 완성 기록(2건)과 등급별 완성 기록(0건)을 지운다.
--   7. 대상 컬렉션·배지의 발급 기록(`issued_item_books` 63행, `issued_item_badges` 222행)을 지워 다시 보이지 않게 한다.
--      («한 번이라도 발급된 컬렉션은 계속 보인다», 328의 규칙. 출발선을 맞추는 정리라 기록까지 지운다.)
--   8. 대상 컬렉션을 `is_active = false`로 둔다(이미 모두 꺼져 있다. 켜져 있던 것이 있으면 끈다).
--   9. 대상 컬렉션을 가리키는 컬렉션 알림 6건(`collection_slottable` 등, `payload->>'item_book_id'`)을 지운다.
--  10. 끝에서 검증하고 어긋나면 전체를 되돌린다: 대상 개체·슬롯·완성·발급 기록·월드 드랍 0, 첫 공개 15개의 개체·슬롯·완성·발급 기록은 그대로,
--      영향받은 인벤토리의 used_slots가 실제 칸 차지 개체 수와 같다.
--
-- 하지 않는 것
--   - 컬렉션·아이템 배지 **행 자체는 지우지도 폐기(`deleted_at`)하지도 않는다**: 오픈 직전 목록의 292(예약 컬렉션)·293 흐름과 오픈 뒤 운영자가 켜는 계획을 위해서다.
--   - 포인트 원장(`point_transactions`)은 건드리지 않는다(불변 기록, 대상 컬렉션을 가리키는 행은 2026-11-06 읽기 0건). 이미 받은 보상 배지·포인트는 회수하지 않는다.
--   - 홈 카드(`today_cards` 7장)는 건드리지 않는다(사용자 선택). 예약 드랍 일정 3건은 이미 취소 상태라 할 일이 없다.
--   - 첫 공개 15개의 개체·기록은 그대로 둔다.
--
-- 되돌림: 329_cleanup_non_launch_collections_for_open_down.sql (`launch_backup_20261106`에서 복원. 정리로 풀린 일련번호를 다른 개체가 받았다면 제약에 걸려 취소된다)

BEGIN;

CREATE TABLE public.launch_backup_20261106 (
  kind         text        NOT NULL,
  row_id       uuid,
  snapshot     jsonb       NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.launch_backup_20261106 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.launch_backup_20261106 FROM PUBLIC, anon, authenticated;

DO $do$
DECLARE
  c_marker CONSTANT text := '오픈 준비 정리 20261106';
  c_launch_names CONSTANT text[] := ARRAY[
    '무명을 쫓는 야식가들','시장 골목의 전설','비 오는 날의 기름 냄새',
    '노을 헌터의 기록','골목길 필름 스냅','매직 아워',
    '아날로그 믹스테이프','삼십 초의 소리','배터리 방전의 공포',
    '행운의 잡동사니','창고의 문구 상자','유리 칸 닦는 아침',
    '짝 잃은 양말','길거리 우체통의 편지','겨울잠의 안식처'];
  e_books CONSTANT integer := 63;
  e_items CONSTANT integer := 741;
  e_counted CONSTANT integer := 21;
  e_slots CONSTANT integer := 89;
  e_comp CONSTANT integer := 2;
  e_tier CONSTANT integer := 0;
  e_drops CONSTANT integer := 631;
  e_notifs CONSTANT integer := 6;
  e_issued_badges CONSTANT integer := 222;
  v_n integer;
  v_launch_items bigint; v_launch_slots bigint; v_launch_comp bigint; v_launch_issued bigint;
  v_left bigint; v_mismatch bigint; v_launch_items2 bigint; v_launch_slots2 bigint; v_launch_comp2 bigint; v_launch_issued2 bigint;
BEGIN
  -- 1. 대상 확정과 가드
  CREATE TEMP TABLE _launch ON COMMIT DROP AS
    SELECT id FROM public.item_books WHERE name = ANY(c_launch_names);
  SELECT count(*) INTO v_n FROM _launch;
  IF v_n <> 15 THEN RAISE EXCEPTION '329: 첫 공개 컬렉션이 이름으로 %개다 (기대 15개)', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.item_books WHERE id IN (SELECT id FROM _launch) AND NOT is_active) THEN
    RAISE EXCEPTION '329: 첫 공개 컬렉션 중 꺼진 것이 있다. 사람이 보고 판단한다';
  END IF;

  CREATE TEMP TABLE _tb ON COMMIT DROP AS
    SELECT DISTINCT x.id FROM (
      SELECT item_book_id AS id FROM public.issued_item_books
      UNION SELECT id FROM public.item_books WHERE is_active
    ) x WHERE x.id NOT IN (SELECT id FROM _launch);
  SELECT count(*) INTO v_n FROM _tb;
  IF v_n <> e_books THEN RAISE EXCEPTION '329: 대상 컬렉션이 %개다 (기대 %개)', v_n, e_books; END IF;

  CREATE TEMP TABLE _tbadge ON COMMIT DROP AS SELECT id FROM public.badges WHERE item_book_id IN (SELECT id FROM _tb);

  CREATE TEMP TABLE _titem ON COMMIT DROP AS
    SELECT ii.id, ii.inventory_id AS orig_inventory_id, ii.slotted_in AS orig_slotted_in
    FROM public.inventory_items ii
    WHERE ii.destroyed_at IS NULL AND ii.badge_id IN (SELECT id FROM _tbadge);
  SELECT count(*) INTO v_n FROM _titem;
  IF v_n <> e_items THEN RAISE EXCEPTION '329: 대상 개체가 %개다 (기대 %개)', v_n, e_items; END IF;
  SELECT count(*) INTO v_n FROM _titem WHERE orig_inventory_id IS NOT NULL AND orig_slotted_in IS NULL;
  IF v_n <> e_counted THEN RAISE EXCEPTION '329: 칸을 차지하던 개체가 %개다 (기대 %개)', v_n, e_counted; END IF;

  CREATE TEMP TABLE _inv_dec ON COMMIT DROP AS
    SELECT orig_inventory_id AS inventory_id, count(*)::integer AS n
    FROM _titem WHERE orig_inventory_id IS NOT NULL AND orig_slotted_in IS NULL GROUP BY orig_inventory_id;

  SELECT count(*) INTO v_n FROM public.user_item_book_slots WHERE item_book_id IN (SELECT id FROM _tb);
  IF v_n <> e_slots THEN RAISE EXCEPTION '329: 장착 슬롯이 %개다 (기대 %개)', v_n, e_slots; END IF;
  SELECT count(*) INTO v_n FROM public.user_item_book_completions WHERE item_book_id IN (SELECT id FROM _tb);
  IF v_n <> e_comp THEN RAISE EXCEPTION '329: 완성 기록이 %건이다 (기대 %건)', v_n, e_comp; END IF;
  SELECT count(*) INTO v_n FROM public.user_item_book_tier_completions WHERE item_book_id IN (SELECT id FROM _tb);
  IF v_n <> e_tier THEN RAISE EXCEPTION '329: 등급별 완성 기록이 %건이다 (기대 %건)', v_n, e_tier; END IF;
  SELECT count(*) INTO v_n FROM public.poi_drops WHERE is_available AND inventory_item_id IN (SELECT id FROM _titem);
  IF v_n <> e_drops THEN RAISE EXCEPTION '329: 내릴 월드 드랍이 %개다 (기대 %개)', v_n, e_drops; END IF;
  SELECT count(*) INTO v_n FROM public.issued_item_badges WHERE badge_id IN (SELECT id FROM _tbadge);
  IF v_n <> e_issued_badges THEN RAISE EXCEPTION '329: 배지 발급 기록이 %행이다 (기대 %행)', v_n, e_issued_badges; END IF;
  SELECT count(*) INTO v_n FROM public.notifications
    WHERE type IN ('collection_slottable','collection_near_complete','collection_completable','following_collection_complete')
      AND (payload->>'item_book_id') IN (SELECT id::text FROM _tb);
  IF v_n <> e_notifs THEN RAISE EXCEPTION '329: 컬렉션 알림이 %건이다 (기대 %건)', v_n, e_notifs; END IF;

  -- 첫 공개 15개의 지금 값(끝에서 그대로인지 본다)
  SELECT count(*) INTO v_launch_items FROM public.inventory_items ii JOIN public.badges b ON b.id = ii.badge_id
    WHERE ii.destroyed_at IS NULL AND b.item_book_id IN (SELECT id FROM _launch);
  SELECT count(*) INTO v_launch_slots FROM public.user_item_book_slots WHERE item_book_id IN (SELECT id FROM _launch);
  SELECT count(*) INTO v_launch_comp FROM public.user_item_book_completions WHERE item_book_id IN (SELECT id FROM _launch);
  SELECT count(*) INTO v_launch_issued FROM public.issued_item_books WHERE item_book_id IN (SELECT id FROM _launch);

  -- 2. 백업
  INSERT INTO public.launch_backup_20261106 (kind, row_id, snapshot)
    SELECT 'inventory_item', ii.id, to_jsonb(ii) FROM public.inventory_items ii WHERE ii.id IN (SELECT id FROM _titem);
  INSERT INTO public.launch_backup_20261106 (kind, row_id, snapshot)
    SELECT 'inventory', inv.id, to_jsonb(inv) FROM public.inventory inv WHERE inv.id IN (SELECT inventory_id FROM _inv_dec);
  INSERT INTO public.launch_backup_20261106 (kind, row_id, snapshot)
    SELECT 'user_item_book_slot', s.id, to_jsonb(s) FROM public.user_item_book_slots s WHERE s.item_book_id IN (SELECT id FROM _tb);
  INSERT INTO public.launch_backup_20261106 (kind, row_id, snapshot)
    SELECT 'user_item_book_completion', NULL, to_jsonb(c) FROM public.user_item_book_completions c WHERE c.item_book_id IN (SELECT id FROM _tb);
  INSERT INTO public.launch_backup_20261106 (kind, row_id, snapshot)
    SELECT 'user_item_book_tier_completion', NULL, to_jsonb(c) FROM public.user_item_book_tier_completions c WHERE c.item_book_id IN (SELECT id FROM _tb);
  INSERT INTO public.launch_backup_20261106 (kind, row_id, snapshot)
    SELECT 'poi_drop', d.id, to_jsonb(d) FROM public.poi_drops d WHERE d.is_available AND d.inventory_item_id IN (SELECT id FROM _titem);
  INSERT INTO public.launch_backup_20261106 (kind, row_id, snapshot)
    SELECT 'issued_item_book', s.item_book_id, to_jsonb(s) FROM public.issued_item_books s WHERE s.item_book_id IN (SELECT id FROM _tb);
  INSERT INTO public.launch_backup_20261106 (kind, row_id, snapshot)
    SELECT 'issued_item_badge', s.badge_id, to_jsonb(s) FROM public.issued_item_badges s WHERE s.badge_id IN (SELECT id FROM _tbadge);
  INSERT INTO public.launch_backup_20261106 (kind, row_id, snapshot)
    SELECT 'item_book', ib.id, to_jsonb(ib) FROM public.item_books ib WHERE ib.id IN (SELECT id FROM _tb);
  INSERT INTO public.launch_backup_20261106 (kind, row_id, snapshot)
    SELECT 'notification', n.id, to_jsonb(n) FROM public.notifications n
    WHERE n.type IN ('collection_slottable','collection_near_complete','collection_completable','following_collection_complete')
      AND (n.payload->>'item_book_id') IN (SELECT id::text FROM _tb);

  -- 3. 장착 슬롯 삭제(개체의 slotted_in은 FK로 NULL이 된다), 개체 소프트 파괴, 보관 이력
  DELETE FROM public.user_item_book_slots WHERE item_book_id IN (SELECT id FROM _tb);

  UPDATE public.inventory_items ii
  SET destroyed_at = now(), inventory_id = NULL
  WHERE ii.id IN (SELECT id FROM _titem) AND ii.destroyed_at IS NULL;

  INSERT INTO public.custody_events (inventory_item_id, event_type, from_user_id, from_username, actor_username)
  SELECT t.id, 'AdminDestroy', inv.user_id, u.username, c_marker
  FROM _titem t
  LEFT JOIN public.inventory inv ON inv.id = t.orig_inventory_id
  LEFT JOIN public.users u ON u.id = inv.user_id;

  -- 4. 월드 드랍 내리기
  UPDATE public.poi_drops SET is_available = FALSE
  WHERE is_available AND inventory_item_id IN (SELECT id FROM _titem);

  -- 5. 칸 수
  UPDATE public.inventory inv SET used_slots = GREATEST(0, inv.used_slots - d.n)
  FROM _inv_dec d WHERE inv.id = d.inventory_id;

  -- 6. 완성 기록
  DELETE FROM public.user_item_book_completions WHERE item_book_id IN (SELECT id FROM _tb);
  DELETE FROM public.user_item_book_tier_completions WHERE item_book_id IN (SELECT id FROM _tb);

  -- 7. 발급 기록
  DELETE FROM public.issued_item_badges WHERE badge_id IN (SELECT id FROM _tbadge);
  DELETE FROM public.issued_item_books WHERE item_book_id IN (SELECT id FROM _tb);

  -- 8. 비활성
  UPDATE public.item_books SET is_active = FALSE WHERE id IN (SELECT id FROM _tb) AND is_active;

  -- 9. 컬렉션 알림
  DELETE FROM public.notifications
  WHERE type IN ('collection_slottable','collection_near_complete','collection_completable','following_collection_complete')
    AND (payload->>'item_book_id') IN (SELECT id::text FROM _tb);

  -- 10. 검증
  SELECT count(*) INTO v_left FROM public.inventory_items ii JOIN public.badges b ON b.id = ii.badge_id
    WHERE ii.destroyed_at IS NULL AND b.item_book_id IN (SELECT id FROM _tb);
  IF v_left <> 0 THEN RAISE EXCEPTION '329: 정리 뒤에도 대상 개체가 %개 남았다', v_left; END IF;
  SELECT count(*) INTO v_left FROM public.poi_drops d JOIN public.badges b ON b.id = d.badge_id
    WHERE d.is_available AND b.item_book_id IN (SELECT id FROM _tb);
  IF v_left <> 0 THEN RAISE EXCEPTION '329: 정리 뒤에도 대상 월드 드랍이 %개 남았다', v_left; END IF;
  SELECT (SELECT count(*) FROM public.user_item_book_slots WHERE item_book_id IN (SELECT id FROM _tb))
       + (SELECT count(*) FROM public.user_item_book_completions WHERE item_book_id IN (SELECT id FROM _tb))
       + (SELECT count(*) FROM public.user_item_book_tier_completions WHERE item_book_id IN (SELECT id FROM _tb))
       + (SELECT count(*) FROM public.issued_item_books WHERE item_book_id IN (SELECT id FROM _tb))
       + (SELECT count(*) FROM public.issued_item_badges WHERE badge_id IN (SELECT id FROM _tbadge)) INTO v_left;
  IF v_left <> 0 THEN RAISE EXCEPTION '329: 정리 뒤에도 슬롯·완성·발급 기록이 %행 남았다', v_left; END IF;
  IF EXISTS (SELECT 1 FROM public.item_books WHERE id IN (SELECT id FROM _tb) AND is_active) THEN
    RAISE EXCEPTION '329: 켜져 있는 대상 컬렉션이 남았다';
  END IF;

  SELECT count(*) INTO v_launch_items2 FROM public.inventory_items ii JOIN public.badges b ON b.id = ii.badge_id
    WHERE ii.destroyed_at IS NULL AND b.item_book_id IN (SELECT id FROM _launch);
  SELECT count(*) INTO v_launch_slots2 FROM public.user_item_book_slots WHERE item_book_id IN (SELECT id FROM _launch);
  SELECT count(*) INTO v_launch_comp2 FROM public.user_item_book_completions WHERE item_book_id IN (SELECT id FROM _launch);
  SELECT count(*) INTO v_launch_issued2 FROM public.issued_item_books WHERE item_book_id IN (SELECT id FROM _launch);
  IF (v_launch_items, v_launch_slots, v_launch_comp, v_launch_issued) IS DISTINCT FROM (v_launch_items2, v_launch_slots2, v_launch_comp2, v_launch_issued2) THEN
    RAISE EXCEPTION '329: 첫 공개 15개의 값이 바뀌었다 (개체 % → %, 슬롯 % → %, 완성 % → %, 발급 % → %)',
      v_launch_items, v_launch_items2, v_launch_slots, v_launch_slots2, v_launch_comp, v_launch_comp2, v_launch_issued, v_launch_issued2;
  END IF;

  SELECT count(*) INTO v_mismatch FROM public.inventory inv
  WHERE inv.id IN (SELECT inventory_id FROM _inv_dec)
    AND inv.used_slots <> (SELECT count(*) FROM public.inventory_items x WHERE x.inventory_id = inv.id AND x.dropped_at IS NULL AND x.slotted_in IS NULL AND x.destroyed_at IS NULL);
  IF v_mismatch <> 0 THEN RAISE EXCEPTION '329: used_slots가 실제 칸 차지 개체 수와 다른 인벤토리가 %개다', v_mismatch; END IF;
END $do$;

COMMIT;
