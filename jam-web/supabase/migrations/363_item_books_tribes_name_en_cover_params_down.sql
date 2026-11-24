-- 363 되돌림: 추가한 세 칸을 지운다 (티켓 20261124_1742)
ALTER TABLE public.item_books DROP COLUMN IF EXISTS name_en;
ALTER TABLE public.item_books DROP COLUMN IF EXISTS cover_params;
ALTER TABLE public.tribes DROP COLUMN IF EXISTS name_en;
