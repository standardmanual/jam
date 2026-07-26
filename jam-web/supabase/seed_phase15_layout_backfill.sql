-- Phase 15 개선: 기존 투데이 카드 20개에 layout_type + 썸네일 이미지 백필
-- 전제: 049_today_cards_layout_type.sql 적용 후 실행 (layout_type 컬럼 필요)
-- sort_order로 매칭 (seed_phase15_today_cards_20.sql과 동일한 sort_order 사용)
--
-- 분포: large_thumbnail 6 / badge_gallery 4 / shortcut 7 / banner 2 / other 1

-- progress_nudge (1~3)
UPDATE public.today_cards SET layout_type = 'shortcut' WHERE sort_order = 1;
UPDATE public.today_cards SET layout_type = 'shortcut' WHERE sort_order = 2;
UPDATE public.today_cards SET layout_type = 'other'    WHERE sort_order = 3;

-- badge_spotlight (5, 10, 11: 단일 배지 → 큰썸네일 / 12, 13: 복수 배지 → 갤러리)
UPDATE public.today_cards SET layout_type = 'large_thumbnail',
  cover_image_url = (SELECT image_url FROM public.badges WHERE name = '두 바퀴의 시작' LIMIT 1)
  WHERE sort_order = 5;
UPDATE public.today_cards SET layout_type = 'large_thumbnail',
  cover_image_url = (SELECT image_url FROM public.badges WHERE name = '이달의 산책왕' LIMIT 1)
  WHERE sort_order = 10;
UPDATE public.today_cards SET layout_type = 'large_thumbnail',
  cover_image_url = (SELECT image_url FROM public.badges WHERE name = '밤의 보행자' LIMIT 1)
  WHERE sort_order = 11;
UPDATE public.today_cards SET layout_type = 'badge_gallery' WHERE sort_order = 12;
UPDATE public.today_cards SET layout_type = 'badge_gallery' WHERE sort_order = 13;

-- mission_spotlight (20~22)
UPDATE public.today_cards SET layout_type = 'shortcut' WHERE sort_order = 20;
UPDATE public.today_cards SET layout_type = 'shortcut' WHERE sort_order = 21;
UPDATE public.today_cards SET layout_type = 'shortcut' WHERE sort_order = 22;

-- itembook_milestone (30, 31 → 배너, 아이템북 표지 이미지)
UPDATE public.today_cards SET layout_type = 'banner',
  cover_image_url = (SELECT image_url FROM public.item_books WHERE name = '분실물 센터 999' LIMIT 1)
  WHERE sort_order = 30;
UPDATE public.today_cards SET layout_type = 'banner',
  cover_image_url = (SELECT image_url FROM public.item_books WHERE name = '종이 지도의 낭만' LIMIT 1)
  WHERE sort_order = 31;

-- location_trend (40, 41 → 배지 갤러리)
UPDATE public.today_cards SET layout_type = 'badge_gallery' WHERE sort_order = 40;
UPDATE public.today_cards SET layout_type = 'badge_gallery' WHERE sort_order = 41;

-- drop_alert (50, 51)
UPDATE public.today_cards SET layout_type = 'shortcut' WHERE sort_order = 50;
UPDATE public.today_cards SET layout_type = 'shortcut' WHERE sort_order = 51;

-- editorial_article (60~62 → 큰썸네일, 소재 배지/아이템북 이미지를 표지로)
UPDATE public.today_cards SET layout_type = 'large_thumbnail',
  cover_image_url = (SELECT image_url FROM public.badges WHERE name = '트레일 루틴' LIMIT 1)
  WHERE sort_order = 60;
UPDATE public.today_cards SET layout_type = 'large_thumbnail',
  cover_image_url = (SELECT image_url FROM public.badges WHERE name = '이달의 산책왕' LIMIT 1)
  WHERE sort_order = 61;
UPDATE public.today_cards SET layout_type = 'large_thumbnail',
  cover_image_url = (SELECT image_url FROM public.item_books WHERE name = '분실물 센터 999' LIMIT 1)
  WHERE sort_order = 62;
