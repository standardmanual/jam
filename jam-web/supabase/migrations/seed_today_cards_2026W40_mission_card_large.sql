-- 홈피드 2026-W40 금요일(10/2) 미션 소개 카드를 미션 카드 규칙에 맞춘다(티켓 20260927_2044, 상위 20260927_2033).
-- 규칙: content-automation PRD §8 「미션 카드 규칙」(2026-09-26 사용자 결정) — mission_spotlight는 항상
-- large_thumbnail이고 커버는 그 미션의 대표 이미지(missions.image_url)를 URL 그대로 쓴다.
-- 이 카드는 규칙 적용 전 리포트로 등록돼 shortcut·커버 없음 상태다(seed_today_cards_2026W40.sql 8행).
-- 미션 「그루터기 살롱의 겨울 채비」에는 대표 이미지가 있으므로 새 이미지를 만들지 않는다.
-- 실행은 사용자 승인 뒤 메인 세션만 한다(공용 단일 DB, CLAUDE.md 절대 규칙 6).
--
-- 실행 전 상태(2026-09-27 읽기 확인): layout_type = 'shortcut', cover_image_url = NULL, image_source = NULL.
-- 같은 미션을 가리키는 비활성 카드 f7d50af3-8958-48fd-8ed5-9bcfdd1b900a는 노출되지 않으므로 건드리지 않는다.

update public.today_cards c
   set layout_type = 'large_thumbnail',
       cover_image_url = m.image_url
  from public.missions m
 where c.id = 'b3ff9bf0-f81c-4184-ac8b-5ca314ccd7fd'
   and m.id = c.mission_id
   and c.template_type = 'mission_spotlight'
   and c.layout_type = 'shortcut'
   and c.cover_image_url is null
   and m.image_url is not null;

-- 확인: 1행이 large_thumbnail이고 cover_image_url이 미션 이미지와 같아야 한다.
-- select c.layout_type, c.cover_image_url = m.image_url as same_cover
--   from public.today_cards c join public.missions m on m.id = c.mission_id
--  where c.id = 'b3ff9bf0-f81c-4184-ac8b-5ca314ccd7fd';

-- 되돌림 SQL(문제가 있을 때만):
-- update public.today_cards
--    set layout_type = 'shortcut', cover_image_url = null
--  where id = 'b3ff9bf0-f81c-4184-ac8b-5ca314ccd7fd';
