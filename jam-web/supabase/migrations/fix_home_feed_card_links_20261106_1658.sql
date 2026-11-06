-- 홈피드 카드 3장의 이동 주소를 목록 화면에서 그 컨텐츠의 상세 화면으로 바꾼다 (티켓 20261106_1658)
-- 스키마 변경이 아니라 today_cards 3행의 target_href 값만 바꾸는 기록 파일이에요. 번호가 붙는 마이그레이션이 아니에요.
-- 현재 값이 읽어 둔 값과 같을 때만 바뀌도록 조건을 걸었어요(그 사이 누가 고쳤다면 0행이 바뀌어요).

-- 1) 이번 주 산행, 아이템 배지가 숨은 두 곳 (location_trend, 값이 비어 /badges 목록으로 해석되던 카드) → 드랍 메뉴
UPDATE public.today_cards
SET target_href = '/drops'
WHERE id = 'a69966fb-b4ae-49ea-926e-9444cebeb141'
  AND target_href IS NULL;

-- 2) 산에서 보내는 하루 (content_intro, 3시간 문구) → 「산에서의 하루」 180분 등급 배지 상세
UPDATE public.today_cards
SET target_href = '/badges/669b6886-b5d4-4cce-a6f6-da5bc54e8f8e'
WHERE id = '59a0864f-9d15-4f18-88dd-0445614c4b90'
  AND target_href = '/badges';

-- 3) 주말엔 한 번, 10km (content_intro, 한 번에 10km 문구) → 「주말 장거리」 1회 등급 배지 상세
UPDATE public.today_cards
SET target_href = '/badges/b6a3bfc0-9597-4347-a518-18e523ebf47c'
WHERE id = '67735398-3097-428e-bf72-777c9289539e'
  AND target_href = '/badges';

-- 되돌림 SQL
-- update public.today_cards set target_href = NULL where id = 'a69966fb-b4ae-49ea-926e-9444cebeb141';
-- update public.today_cards set target_href = '/badges' where id in ('59a0864f-9d15-4f18-88dd-0445614c4b90', '67735398-3097-428e-bf72-777c9289539e');
