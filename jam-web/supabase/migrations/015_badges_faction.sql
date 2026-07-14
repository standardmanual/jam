-- badges에 세계관 FK, 아이템북 FK, drop_weight 추가
ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS faction_id UUID REFERENCES public.factions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_book_id UUID REFERENCES public.item_books(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS drop_weight NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS drop_condition_json JSONB;

-- drop_weight > 0 보장
ALTER TABLE public.badges
  ADD CONSTRAINT badges_drop_weight_positive CHECK (drop_weight > 0);
