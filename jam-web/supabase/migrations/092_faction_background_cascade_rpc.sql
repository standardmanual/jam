-- 20260819_016: 세계관 배경 3단 캐스케이드 원자성 확보 + 서버 건수 미리보기
--
-- 티켓 015에서 apply-background 라우트가 (a) 직속 배지 → (b) 소속 컬렉션 → (c) 그 컬렉션의
-- 아이템배지 순으로 3개의 개별 UPDATE를 순차 실행해 원자성이 없었다. 단일 plpgsql 함수로 옮겨
-- 하나의 함수 호출(=암묵적 트랜잭션)로 all-or-nothing을 보장한다.
--
-- 짝을 이루는 count_faction_background_cascade는 동일한 WHERE 조건으로 UPDATE 없이 COUNT만
-- 반환해, 일괄 적용 확인 다이얼로그가 전체 배지/컬렉션 목록을 fetch하지 않고 가벼운 미리보기를
-- 받을 수 있게 한다.

CREATE FUNCTION public.apply_faction_background_cascade(p_faction_id UUID)
RETURNS TABLE(direct_badges INT, item_books INT, item_book_badges INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_background_color TEXT;
  v_background_shader_id TEXT;
  v_background_image_url TEXT;
  v_background_video_url TEXT;
  v_direct_badges INT;
  v_item_books INT;
  v_item_book_badges INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.factions WHERE id = p_faction_id) THEN
    RAISE EXCEPTION '존재하지 않는 세계관입니다: %', p_faction_id;
  END IF;

  SELECT background_color, background_shader_id, background_image_url, background_video_url
  INTO v_background_color, v_background_shader_id, v_background_image_url, v_background_video_url
  FROM public.factions
  WHERE id = p_faction_id;

  -- (a) 세계관 직속 배지
  WITH updated AS (
    UPDATE public.badges
    SET background_color = v_background_color,
        background_shader_id = v_background_shader_id,
        background_image_url = v_background_image_url,
        background_video_url = v_background_video_url
    WHERE faction_id = p_faction_id
      AND deleted_at IS NULL
    RETURNING id
  )
  SELECT count(*) INTO v_direct_badges FROM updated;

  -- (b) 세계관 소속 컬렉션
  WITH updated AS (
    UPDATE public.item_books
    SET background_color = v_background_color,
        background_shader_id = v_background_shader_id,
        background_image_url = v_background_image_url,
        background_video_url = v_background_video_url
    WHERE faction_id = p_faction_id
    RETURNING id
  )
  SELECT count(*) INTO v_item_books FROM updated;

  -- (c) 그 컬렉션들에 속한 아이템배지
  WITH updated AS (
    UPDATE public.badges
    SET background_color = v_background_color,
        background_shader_id = v_background_shader_id,
        background_image_url = v_background_image_url,
        background_video_url = v_background_video_url
    WHERE deleted_at IS NULL
      AND item_book_id IN (SELECT id FROM public.item_books WHERE faction_id = p_faction_id)
    RETURNING id
  )
  SELECT count(*) INTO v_item_book_badges FROM updated;

  RETURN QUERY SELECT v_direct_badges, v_item_books, v_item_book_badges;
END;
$$;

CREATE FUNCTION public.count_faction_background_cascade(p_faction_id UUID)
RETURNS TABLE(direct_badges INT, item_books INT, item_book_badges INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.factions WHERE id = p_faction_id) THEN
    RAISE EXCEPTION '존재하지 않는 세계관입니다: %', p_faction_id;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*)::INT FROM public.badges WHERE faction_id = p_faction_id AND deleted_at IS NULL),
    (SELECT count(*)::INT FROM public.item_books WHERE faction_id = p_faction_id),
    (SELECT count(*)::INT FROM public.badges
      WHERE deleted_at IS NULL
        AND item_book_id IN (SELECT id FROM public.item_books WHERE faction_id = p_faction_id));
END;
$$;
