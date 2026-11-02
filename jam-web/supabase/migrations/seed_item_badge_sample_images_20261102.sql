-- seed_item_badge_sample_images_20261102.sql
-- 임시 이미지 등록: 활성 컬렉션 «겨울잠의 안식처»의 아이템 배지 4개 이름(등급별 4종씩 16개)에
-- 이미 등록된 투명 배경 이미지(factions/03-xx) URL을 빌려 쓴다 (티켓 20261102_1834 후속 범위).
-- 목적: 미발견 아이템 배지의 회색 실루엣을 화면에서 확인한다. 정식 이미지가 들어오면 그 이미지로 교체한다.
-- 활성 컬렉션 15개(배지 540개)는 이미지가 0개였고, 투명 배경이어야 실루엣이 네모가 되지 않는다.
-- 나머지 5개 이름(뜨개 방석·단수 카운터 등)은 일부러 비워 «이미지 없음» 대체 아이콘을 함께 확인한다.
-- ⚠️ 공용 DB 영향: 적용하는 순간 프로덕션에도 같은 이미지가 보인다. 적용 전 16개 모두 image_url이 NULL이었다.
-- 가드: 대상이 정확히 16개(4이름 × 4등급)이고 모두 이미지가 비어 있을 때만 갱신한다. 아니면 예외로 전체가 되돌아간다.
--
-- 되돌림 SQL (이전 값은 모두 NULL이었다):
--   UPDATE public.badges b SET image_url = NULL
--     FROM public.item_books ib
--    WHERE ib.id = b.item_book_id AND ib.name = '겨울잠의 안식처'
--      AND b.name IN ('건조기 볼','뜨개바늘','줄자','털실 한 뭉치')
--      AND b.deleted_at IS NULL;
--
-- 사후 확인:
--   SELECT b.name, count(*) n, count(b.image_url) with_img FROM public.badges b
--     JOIN public.item_books ib ON ib.id = b.item_book_id
--    WHERE ib.name = '겨울잠의 안식처' AND b.deleted_at IS NULL GROUP BY b.name ORDER BY b.name;
--   -- 4개 이름은 n=4, with_img=4, 나머지 5개 이름은 with_img=0

DO $sample_images$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.badges b
     SET image_url = (SELECT s.image_url FROM public.badges s WHERE s.name = v.src_name AND s.image_url IS NOT NULL LIMIT 1)
    FROM public.item_books ib,
         (VALUES
           ('건조기 볼',    '반짝이는 도토리'),
           ('뜨개바늘',     '말벌의 독침'),
           ('줄자',         '공원 벤치 나뭇조각'),
           ('털실 한 뭉치', '길고양이의 털뭉치')
         ) AS v(name, src_name)
   WHERE ib.id = b.item_book_id
     AND ib.name = '겨울잠의 안식처'
     AND ib.is_active
     AND b.name = v.name
     AND b.deleted_at IS NULL
     AND (b.image_url IS NULL OR b.image_url = '');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 16 THEN
    RAISE EXCEPTION '갱신 행 수가 16이 아니다(실제 %). 전체를 되돌린다.', v_updated;
  END IF;
  -- 빌린 이미지가 모두 채워졌는지(NULL 복사 방지)
  IF EXISTS (
    SELECT 1 FROM public.badges b JOIN public.item_books ib ON ib.id = b.item_book_id
     WHERE ib.name = '겨울잠의 안식처' AND b.name IN ('건조기 볼','뜨개바늘','줄자','털실 한 뭉치')
       AND b.deleted_at IS NULL AND coalesce(b.image_url,'') = ''
  ) THEN
    RAISE EXCEPTION '빌려 올 원본 이미지가 없는 이름이 있다. 전체를 되돌린다.';
  END IF;
END
$sample_images$;
