-- 20260901_1929: 어드민 배경 편집에서 패턴/쉐이더 제너레이터 제거, 배경색만 유지
--
-- apply_faction_background_cascade(마이그레이션 092)는 세계관의 background_color/
-- background_shader_id/background_image_url/background_video_url 4필드를 직속 배지 → 소속
-- 컬렉션 → 그 컬렉션의 아이템배지 3단에 복사했다. 어드민 저작 화면에서 제너레이터·쉐이더
-- 드롭다운을 제거해 이 3필드를 더 이상 채울 방법이 없으므로, 캐스케이드도 background_color만
-- 복사하도록 축소한다.
--
-- count_faction_background_cascade는 COUNT만 계산할 뿐 어떤 필드를 복사하는지와 무관해
-- 변경하지 않는다.

CREATE OR REPLACE FUNCTION public.apply_faction_background_cascade(p_faction_id UUID)
RETURNS TABLE(direct_badges INT, item_books INT, item_book_badges INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_background_color TEXT;
  v_direct_badges INT;
  v_item_books INT;
  v_item_book_badges INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.factions WHERE id = p_faction_id) THEN
    RAISE EXCEPTION '존재하지 않는 세계관입니다: %', p_faction_id;
  END IF;

  SELECT background_color
  INTO v_background_color
  FROM public.factions
  WHERE id = p_faction_id;

  -- (a) 세계관 직속 배지
  WITH updated AS (
    UPDATE public.badges
    SET background_color = v_background_color
    WHERE faction_id = p_faction_id
      AND deleted_at IS NULL
    RETURNING id
  )
  SELECT count(*) INTO v_direct_badges FROM updated;

  -- (b) 세계관 소속 컬렉션
  WITH updated AS (
    UPDATE public.item_books
    SET background_color = v_background_color
    WHERE faction_id = p_faction_id
    RETURNING id
  )
  SELECT count(*) INTO v_item_books FROM updated;

  -- (c) 그 컬렉션들에 속한 아이템배지
  WITH updated AS (
    UPDATE public.badges
    SET background_color = v_background_color
    WHERE deleted_at IS NULL
      AND item_book_id IN (SELECT id FROM public.item_books WHERE faction_id = p_faction_id)
    RETURNING id
  )
  SELECT count(*) INTO v_item_book_badges FROM updated;

  RETURN QUERY SELECT v_direct_badges, v_item_books, v_item_book_badges;
END;
$$;
