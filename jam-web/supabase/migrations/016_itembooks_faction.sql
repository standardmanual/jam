-- item_books에 세계관 FK, 스토리, 활성화 여부 추가 + required_item_badge_ids DROP
ALTER TABLE public.item_books
  ADD COLUMN IF NOT EXISTS faction_id UUID REFERENCES public.factions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS story_text TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS drop_condition_json JSONB;

ALTER TABLE public.item_books
  DROP COLUMN IF EXISTS required_item_badge_ids;
