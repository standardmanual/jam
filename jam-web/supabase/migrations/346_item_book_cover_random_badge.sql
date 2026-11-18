-- 346: 트라이브에 속한 각 컬렉션(item_books)의 대표 이미지를 그 컬렉션에 속한 아이템 배지 중 무작위 한 장으로 바꾼다
-- 티켓 20261118_1707 — 사용자 지시(2026-11-18): «현재 등록되어 있는 트라이브에 속한 각 컬렉션의 대표이미지를 컬렉션에 속한 배지중에 랜덤으로 사용해서 등록해»
--
-- 대상: item_books 중 tribe_id가 tribes에 있는 모든 행(공개 여부와 무관, 2026-11-18 실측 51건).
-- 후보: 그 컬렉션의 badges 중 type='item', deleted_at IS NULL, image_url이 비어 있지 않은 것(전부 등급 구분 없이 같은 확률).
--   후보가 없는 컬렉션은 건드리지 않는다(2026-11-18 실측 0건).
-- 바꾸는 칸: item_books.image_url 하나. 배지의 image_url(캐시 갱신용 ?v= 포함)을 그대로 쓴다. image_source 등 다른 칸은 그대로다.
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다. 무작위라 다시 실행하면 다른 배지가 뽑힌다.
-- 순서: 백업 표(옛 값과 뽑힌 배지 id) → 건수 대조 → 갱신 → 갱신 건수 대조(어긋나면 전체 롤백).
-- 되돌림: 346_item_book_cover_random_badge_down.sql (백업 표의 옛 값으로 되돌린다).

BEGIN;

CREATE TEMP TABLE _cover_pick ON COMMIT DROP AS
  SELECT DISTINCT ON (g.item_book_id) g.item_book_id, g.id AS badge_id, g.image_url
  FROM public.badges g
  JOIN public.item_books b ON b.id = g.item_book_id
  JOIN public.tribes t ON t.id = b.tribe_id
  WHERE g.type = 'item'
    AND g.deleted_at IS NULL
    AND g.image_url IS NOT NULL
    AND g.image_url <> ''
  ORDER BY g.item_book_id, random();

CREATE TABLE public.item_books_cover_backup_20261118 AS
  SELECT b.id, b.image_url AS old_image_url, p.badge_id AS picked_badge_id, p.image_url AS new_image_url
  FROM public.item_books b
  JOIN _cover_pick p ON p.item_book_id = b.id;

COMMENT ON TABLE public.item_books_cover_backup_20261118 IS
  '컬렉션 대표 이미지를 무작위 배지 이미지로 바꾸기 전 사본과 뽑힌 배지(티켓 20261118_1707). 되돌릴 필요가 없다고 확인한 뒤 삭제한다.';

ALTER TABLE public.item_books_cover_backup_20261118 ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_target BIGINT;
  v_backup BIGINT;
  v_updated BIGINT;
BEGIN
  SELECT count(*) INTO v_target
    FROM public.item_books b JOIN public.tribes t ON t.id = b.tribe_id;
  SELECT count(*) INTO v_backup FROM public.item_books_cover_backup_20261118;
  IF v_target <> v_backup THEN
    RAISE EXCEPTION '대상과 백업 행 수 불일치(후보 배지가 없는 컬렉션이 있을 수 있다): 대상 %, 백업 %', v_target, v_backup;
  END IF;

  UPDATE public.item_books b
     SET image_url = k.new_image_url
    FROM public.item_books_cover_backup_20261118 k
   WHERE k.id = b.id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> v_backup THEN
    RAISE EXCEPTION '갱신 행 수 불일치: 백업 %, 갱신 %', v_backup, v_updated;
  END IF;
END
$$;

COMMIT;
