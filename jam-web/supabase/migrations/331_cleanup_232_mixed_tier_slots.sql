-- 331_cleanup_232_mixed_tier_slots.sql
-- 스테이징 자동 로그인 계정 «232»(user_id 00000000-0000-0000-0000-000000000001, username 3332)의 여러 등급이 섞인 컬렉션 3개를 한 등급으로 정리한다 (사용자 지시 2026-11-09)
--
-- 원인: 시드 `seed_20261031_dev_tester_full_sample.sql`(164줄)이 `user_item_book_slots`에 직접 INSERT해 4등급 컬렉션의 `tier_mismatch` 검사(222의 장착·교환 함수)를 거치지 않았다.
-- 앱의 장착 경로(`slot_item_into_book_tiered`, `swap_item_in_book_tiered`)는 다른 등급을 거절한다. 이 파일은 시드가 남긴 데이터만 정리한다.
--
-- 대상(2026-11-09 읽기): 이 계정이 장착한 컬렉션 중 장착 배지의 등급이 둘 이상인 컬렉션 3개
--   골목길 필름 스냅  Common 9 + Rare 9   → Rare 9칸을 남기고 Common 9칸을 푼다 (같은 수라 높은 등급을 남긴다)
--   노을 헌터의 기록  Common 2 + Rare 1   → Common 2칸을 남기고 Rare 1칸을 푼다 (많은 쪽을 남긴다)
--   매직 아워         Common 1 + Epic 1 + Mystic 1 → Mystic 1칸을 남기고 Common·Epic을 푼다 (같은 수라 높은 등급을 남긴다)
--   남기는 등급의 기준: 장착이 많은 등급, 같으면 높은 등급. 푸는 칸은 모두 12개다.
--
-- 하는 일 (한 트랜잭션, 건수 가드 포함)
--   1. 가드: 정리 대상이 위 3개 컬렉션·푸는 칸 12개와 정확히 같은지, 인벤토리 빈칸이 12칸 이상인지 본다. 하나라도 다르면 멈춘다.
--   2. 백업: 푸는 12행을 `sample_seed_232_slot_fix_backup_20261109`(행 단위 보안 켬, 정책 없음)에 담는다. 되돌림 SQL이 이 표를 쓴다.
--   3. 푸는 칸마다 앱의 해제 함수 `unslot_item_from_book`을 부른다 — 슬롯 행 삭제, `slotted_in` 해제, `used_slots` 증가, `custody_events` 'Unslot'이 한 번에 처리된다.
--      풀린 개체는 인벤토리로 돌아온다(소각·삭제하지 않는다).
--   4. 끝에서 검증하고 어긋나면 전체를 되돌린다: 세 컬렉션이 각각 한 등급만 남음, 칸 수(Rare 9·Common 2·Mystic 1), 다른 컬렉션의 장착 수 그대로, `used_slots` 일치.
--
-- 하지 않는 것
--   - 등급별 완성 기록(`user_item_book_tier_completions`)과 포인트 원장은 건드리지 않는다. 장착을 풀어도 완성 기록은 남는 것이 앱의 규칙이다(222).
--     골목길 필름 스냅의 Common 완성 기록(2026-10-24)은 Common 칸이 비어도 그대로 남는다.
--   - 다른 계정과 이 계정의 다른 컬렉션(겨울잠의 안식처·길거리 우체통의 편지·시장 골목의 전설)은 건드리지 않는다.
--   - 실제 계정의 옛 장착 기록(god의 겨울잠의 안식처, jae_everydae의 무명을 쫓는 야식가들)은 대상이 아니다. 별도 판단이 필요하다.
--
-- 실행 순서: v_dry = true로 롤백 실측 → v_dry = false로 실행 → 읽기 확인.
-- 되돌림: 331_cleanup_232_mixed_tier_slots_down.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.sample_seed_232_slot_fix_backup_20261109 (
  row_id       uuid PRIMARY KEY,
  snapshot     jsonb       NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sample_seed_232_slot_fix_backup_20261109 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sample_seed_232_slot_fix_backup_20261109 FROM PUBLIC, anon, authenticated;

DO $do$
DECLARE
  v_dry CONSTANT boolean := false;  -- true면 끝에서 예외로 롤백한다
  U CONSTANT uuid := '00000000-0000-0000-0000-000000000001';
  e_remove CONSTANT integer := 12;
  v_inv        RECORD;
  v_slot       RECORD;
  v_res        jsonb;
  v_removed    integer := 0;
  v_bad_books  integer;
  v_summary    jsonb;
BEGIN
  -- 푸는 칸을 임시 표로 정한다: 컬렉션마다 남길 등급 = 장착이 많은 등급, 같으면 높은 등급
  CREATE TEMP TABLE _rm ON COMMIT DROP AS
  WITH per AS (
    SELECT s.item_book_id, b.rarity::text AS rarity, count(*) AS cnt,
           CASE b.rarity::text WHEN 'common' THEN 1 WHEN 'rare' THEN 2 WHEN 'epic' THEN 3 WHEN 'mystic' THEN 4 END AS rank
    FROM public.user_item_book_slots s
    JOIN public.badges b ON b.id = s.badge_id
    WHERE s.user_id = U
    GROUP BY s.item_book_id, b.rarity
  ), mixed AS (
    SELECT item_book_id FROM per GROUP BY item_book_id HAVING count(*) > 1
  ), keep AS (
    SELECT DISTINCT ON (p.item_book_id) p.item_book_id, p.rarity AS keep_rarity
    FROM per p JOIN mixed m ON m.item_book_id = p.item_book_id
    ORDER BY p.item_book_id, p.cnt DESC, p.rank DESC
  )
  SELECT s.id AS slot_id, s.item_book_id, b.rarity::text AS rarity, k.keep_rarity
  FROM public.user_item_book_slots s
  JOIN public.badges b ON b.id = s.badge_id
  JOIN keep k ON k.item_book_id = s.item_book_id
  WHERE s.user_id = U AND b.rarity::text <> k.keep_rarity;

  -- 1. 가드
  IF (SELECT count(*) FROM _rm) <> e_remove THEN
    RAISE EXCEPTION '푸는 칸이 기대(12)와 다르다: %', (SELECT count(*) FROM _rm);
  END IF;
  IF (SELECT count(DISTINCT item_book_id) FROM _rm) <> 3 THEN
    RAISE EXCEPTION '정리 대상 컬렉션이 기대(3)와 다르다: %', (SELECT count(DISTINCT item_book_id) FROM _rm);
  END IF;
  IF (SELECT count(*) FROM _rm r JOIN public.item_books ib ON ib.id = r.item_book_id
      WHERE ib.name IN ('골목길 필름 스냅','노을 헌터의 기록','매직 아워')) <> e_remove THEN
    RAISE EXCEPTION '대상 컬렉션 이름이 기대와 다르다';
  END IF;
  SELECT * INTO v_inv FROM public.inventory WHERE user_id = U FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '인벤토리가 없다'; END IF;
  IF v_inv.max_slots - v_inv.used_slots < e_remove THEN
    RAISE EXCEPTION '인벤토리 빈칸이 모자란다: % / %', v_inv.used_slots, v_inv.max_slots;
  END IF;

  -- 2. 백업
  INSERT INTO public.sample_seed_232_slot_fix_backup_20261109 (row_id, snapshot)
  SELECT s.id, to_jsonb(s) FROM public.user_item_book_slots s WHERE s.id IN (SELECT slot_id FROM _rm)
  ON CONFLICT (row_id) DO NOTHING;

  -- 3. 앱의 해제 함수로 푼다
  FOR v_slot IN SELECT slot_id FROM _rm LOOP
    v_res := public.unslot_item_from_book(U, v_slot.slot_id);
    IF NOT coalesce((v_res->>'ok')::boolean, false) THEN
      RAISE EXCEPTION '해제 실패: % %', v_slot.slot_id, v_res;
    END IF;
    v_removed := v_removed + 1;
  END LOOP;

  -- 4. 검증
  SELECT count(*) INTO v_bad_books FROM (
    SELECT s.item_book_id FROM public.user_item_book_slots s JOIN public.badges b ON b.id = s.badge_id
    WHERE s.user_id = U GROUP BY s.item_book_id HAVING count(DISTINCT b.rarity) > 1) x;
  IF v_bad_books <> 0 THEN RAISE EXCEPTION '여러 등급이 남은 컬렉션이 있다: %', v_bad_books; END IF;

  IF (SELECT count(*) FROM public.user_item_book_slots s JOIN public.badges b ON b.id = s.badge_id JOIN public.item_books ib ON ib.id = s.item_book_id
      WHERE s.user_id = U AND ib.name = '골목길 필름 스냅' AND b.rarity::text = 'rare') <> 9
     OR (SELECT count(*) FROM public.user_item_book_slots s JOIN public.item_books ib ON ib.id = s.item_book_id
      WHERE s.user_id = U AND ib.name = '골목길 필름 스냅') <> 9
     OR (SELECT count(*) FROM public.user_item_book_slots s JOIN public.badges b ON b.id = s.badge_id JOIN public.item_books ib ON ib.id = s.item_book_id
      WHERE s.user_id = U AND ib.name = '노을 헌터의 기록' AND b.rarity::text = 'common') <> 2
     OR (SELECT count(*) FROM public.user_item_book_slots s JOIN public.item_books ib ON ib.id = s.item_book_id
      WHERE s.user_id = U AND ib.name = '노을 헌터의 기록') <> 2
     OR (SELECT count(*) FROM public.user_item_book_slots s JOIN public.badges b ON b.id = s.badge_id JOIN public.item_books ib ON ib.id = s.item_book_id
      WHERE s.user_id = U AND ib.name = '매직 아워' AND b.rarity::text = 'mystic') <> 1
     OR (SELECT count(*) FROM public.user_item_book_slots s JOIN public.item_books ib ON ib.id = s.item_book_id
      WHERE s.user_id = U AND ib.name = '매직 아워') <> 1 THEN
    RAISE EXCEPTION '남은 칸 수가 기대와 다르다';
  END IF;

  IF (SELECT count(*) FROM public.user_item_book_slots WHERE user_id = U) <> (9 + 9 + 5 + 2 + 1 + 1) THEN
    RAISE EXCEPTION '이 계정의 전체 장착 수가 기대와 다르다: %', (SELECT count(*) FROM public.user_item_book_slots WHERE user_id = U);
  END IF;

  IF (SELECT used_slots FROM public.inventory WHERE user_id = U)
     <> (SELECT count(*) FROM public.inventory_items WHERE inventory_id = v_inv.id AND slotted_in IS NULL AND dropped_at IS NULL AND destroyed_at IS NULL) THEN
    RAISE EXCEPTION 'used_slots가 실제 칸 차지 개체 수와 다르다';
  END IF;

  SELECT jsonb_build_object(
    'removed', v_removed,
    'slots_total', (SELECT count(*) FROM public.user_item_book_slots WHERE user_id = U),
    'used_slots', (SELECT used_slots FROM public.inventory WHERE user_id = U),
    'max_slots', (SELECT max_slots FROM public.inventory WHERE user_id = U),
    'backup_rows', (SELECT count(*) FROM public.sample_seed_232_slot_fix_backup_20261109)) INTO v_summary;

  IF v_dry THEN RAISE EXCEPTION '롤백 실측 결과: %', v_summary; END IF;
END $do$;

COMMIT;
