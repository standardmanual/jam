-- 019_seed_worldview.sql에서 badges INSERT 시 faction_id가 누락됨
-- item_books.faction_id를 기준으로 item badges의 faction_id를 일괄 세팅

UPDATE public.badges b
SET faction_id = ib.faction_id
FROM public.item_books ib
WHERE b.item_book_id = ib.id
  AND b.faction_id IS NULL
  AND b.type = 'item';
