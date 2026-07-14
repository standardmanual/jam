-- Phase 8-D prep: item_books.required_activity_badge_id nullable + badges.image_url nullable
--
-- required_activity_badge_id: Phase 8에서 아이템북 discovery는 인벤토리 아이템 보유 여부로 결정.
--   activity badge 선행 조건이 더 이상 필수가 아님.
-- image_url: 시드 배지 및 어드민 미등록 배지에 이미지 없을 수 있음.

ALTER TABLE public.item_books
  ALTER COLUMN required_activity_badge_id DROP NOT NULL;

ALTER TABLE public.badges
  ALTER COLUMN image_url DROP NOT NULL;
