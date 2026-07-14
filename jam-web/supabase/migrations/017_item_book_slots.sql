-- 유저 아이템북 슬롯 (어떤 인벤토리 아이템을 어느 아이템북 슬롯에 장착했는지)
CREATE TABLE IF NOT EXISTS public.user_item_book_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_book_id UUID NOT NULL REFERENCES public.item_books(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  slotted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, item_book_id, badge_id)
);

ALTER TABLE public.user_item_book_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_item_book_slots: 본인만 읽기"
  ON public.user_item_book_slots FOR SELECT
  USING (auth.uid() = user_id);

-- 아이템북 완성 기록
CREATE TABLE IF NOT EXISTS public.user_item_book_completions (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_book_id UUID NOT NULL REFERENCES public.item_books(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, item_book_id)
);

ALTER TABLE public.user_item_book_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_item_book_completions: 본인만 읽기"
  ON public.user_item_book_completions FOR SELECT
  USING (auth.uid() = user_id);

-- inventory_items에 슬롯 참조 추가 (어느 슬롯에 꽂혀 있는지)
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS slotted_in UUID REFERENCES public.user_item_book_slots(id) ON DELETE SET NULL;
