-- 홈피드 카드 4장의 이동 주소를 목록 화면에서 그 컨텐츠의 상세 화면으로 바꾼다 (티켓 20261106_1658, 2차)
-- 스키마 변경이 아니라 today_cards 4행의 target_href 값만 바꾸는 기록 파일이에요. 번호가 붙는 마이그레이션이 아니에요.
-- 현재 값이 읽어 둔 값과 같을 때만 바뀌도록 조건을 걸었어요(그 사이 누가 고쳤다면 0행이 바뀌어요).

-- 1) 입동 주간, 처음 가는 곳으로 (content_intro, «새 역 2곳»을 앞세움) → 「지하철 역에서 만나는 행운」 미션 상세
UPDATE public.today_cards
SET target_href = '/missions/0766b21d-b1e8-419e-ae77-5002ce9b08a3'
WHERE id = '18a6efa0-cd8b-4534-823f-d86ac81d6d0b'
  AND target_href = '/missions';

-- 2) 오늘은 입동이에요 (content_intro, 같은 문구 구조) → 같은 미션 상세
UPDATE public.today_cards
SET target_href = '/missions/0766b21d-b1e8-419e-ae77-5002ce9b08a3'
WHERE id = '0bc05266-8632-45d8-9937-d14092c60808'
  AND target_href = '/missions';

-- 3) 입동에 만나는 활동 배지 「겨울잠」 (content_intro, «쉬다 돌아온 첫 걷기») → 「겨울잠」 1회 등급 배지 상세
UPDATE public.today_cards
SET target_href = '/badges/8c41975d-4ffe-4b80-9004-dcb82addafe0'
WHERE id = 'ffdda97f-d655-4da2-ab21-6ff1b49d1683'
  AND target_href = '/badges';

-- 4) 송파구 역마다 체크인 배지가 있어요 (content_intro, 특정 배지가 없는 역 체크인 소개) → 지도가 있는 드랍 메뉴
UPDATE public.today_cards
SET target_href = '/drops'
WHERE id = '79916e12-8ab3-4b84-ab53-20b4c91374c0'
  AND target_href = '/badges';

-- 되돌림 SQL
-- update public.today_cards set target_href = '/missions' where id in ('18a6efa0-cd8b-4534-823f-d86ac81d6d0b', '0bc05266-8632-45d8-9937-d14092c60808');
-- update public.today_cards set target_href = '/badges' where id in ('ffdda97f-d655-4da2-ab21-6ff1b49d1683', '79916e12-8ab3-4b84-ab53-20b4c91374c0');
