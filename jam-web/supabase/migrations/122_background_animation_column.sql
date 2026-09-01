-- 20260901_1944: 배지·컬렉션·세계관 이미지 카드 배경 — 블롭 애니메이션 파라미터 컬럼 추가
--
-- 기존 배경 4컬럼(background_color / background_shader_id / background_image_url /
-- background_video_url)은 "상세화면 전체를 덮는 고정 배경 레이어"용이다. 이 컬럼은 그것과 별개로
-- **이미지가 놓인 정사각형 Hero 카드 안에서** 실행할 Canvas 2D 애니메이션의 파라미터를 담는다.
--
-- 영상으로 굽지 않고(티켓 20260819_012 방식과 다름) 파라미터만 저장해 서비스에서 라이브
-- 실행한다 — 저장 후 재편집이 가능하고 네트워크 페이로드가 수백 바이트로 작다.
--
-- 저장 형태(jsonb):
--   {
--     "type": "blob",
--     "colors": ["#ff6d30", "#a8aded", "#ffe5d1", "#ff4c00"],
--     "bgColor": "#ffffff",
--     "speed": 1, "seed": 21, "blur": 0.54, "scale": 0.66
--   }
-- `type`을 함께 저장해 향후 다른 애니메이션을 추가할 때 컬럼을 또 늘리지 않는다.
-- 값이 NULL이면 애니메이션 배경이 없는 상태(기존 배경색 모드)다.
--
-- background_shader_id를 재사용하지 않는 이유: 그 컬럼은 값만 저장되고 렌더링에 연결된 적 없는
-- 죽은 레거시이며 티켓 20260901_1929에서 저작 UI가 제거됐다. 의미가 다른 값을 얹지 않는다.
--
-- factions까지 추가하는 이유: 세계관 → 컬렉션 → 배지 3단 배경 캐스케이드
-- (apply_faction_background_cascade)가 이미 동작 중이라 한 테이블만 빠지면 캐스케이드가 깨진다.

ALTER TABLE public.badges     ADD COLUMN IF NOT EXISTS background_animation JSONB;
ALTER TABLE public.item_books ADD COLUMN IF NOT EXISTS background_animation JSONB;
ALTER TABLE public.factions   ADD COLUMN IF NOT EXISTS background_animation JSONB;

COMMENT ON COLUMN public.badges.background_animation IS
  '배지 상세화면 Hero 카드 안에서 실행하는 배경 애니메이션 파라미터(jsonb). NULL이면 없음. 20260901_1944';
COMMENT ON COLUMN public.item_books.background_animation IS
  '컬렉션 상세화면 Hero 카드 안에서 실행하는 배경 애니메이션 파라미터(jsonb). NULL이면 없음. 20260901_1944';
COMMENT ON COLUMN public.factions.background_animation IS
  '세계관 자체에는 렌더링되지 않고 하위 일괄 적용(캐스케이드)의 원본이 되는 배경 애니메이션 파라미터(jsonb). 20260901_1944';

-- 3단 캐스케이드에 background_animation을 함께 복사하도록 확장한다.
-- (마이그레이션 092에서 도입, 121에서 background_color 단일 필드로 축소된 함수를 다시 정의)
CREATE OR REPLACE FUNCTION public.apply_faction_background_cascade(p_faction_id UUID)
RETURNS TABLE(direct_badges INT, item_books INT, item_book_badges INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_background_color TEXT;
  v_background_animation JSONB;
  v_direct_badges INT;
  v_item_books INT;
  v_item_book_badges INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.factions WHERE id = p_faction_id) THEN
    RAISE EXCEPTION '존재하지 않는 세계관입니다: %', p_faction_id;
  END IF;

  SELECT background_color, background_animation
  INTO v_background_color, v_background_animation
  FROM public.factions
  WHERE id = p_faction_id;

  -- (a) 세계관 직속 배지
  WITH updated AS (
    UPDATE public.badges
    SET background_color = v_background_color,
        background_animation = v_background_animation
    WHERE faction_id = p_faction_id
      AND deleted_at IS NULL
    RETURNING id
  )
  SELECT count(*) INTO v_direct_badges FROM updated;

  -- (b) 세계관 소속 컬렉션
  WITH updated AS (
    UPDATE public.item_books
    SET background_color = v_background_color,
        background_animation = v_background_animation
    WHERE faction_id = p_faction_id
    RETURNING id
  )
  SELECT count(*) INTO v_item_books FROM updated;

  -- (c) 그 컬렉션들에 속한 아이템배지
  WITH updated AS (
    UPDATE public.badges
    SET background_color = v_background_color,
        background_animation = v_background_animation
    WHERE deleted_at IS NULL
      AND item_book_id IN (SELECT id FROM public.item_books WHERE faction_id = p_faction_id)
    RETURNING id
  )
  SELECT count(*) INTO v_item_book_badges FROM updated;

  RETURN QUERY SELECT v_direct_badges, v_item_books, v_item_book_badges;
END;
$$;
