-- 홈피드 2026-W40(2026-09-28~10-04) 편성 등록: 기존 등록 카드 비활성화 + 2026-W39 리포트(9/26 생성)의 승인 카드 등록
-- 티켓 20260926_1541 후속. 등록은 사용자 승인 뒤 메인 세션이 실행한다(공용 단일 DB, CLAUDE.md 절대 규칙 6).
-- 월요일(9/28) 카드(포션 연금술사 「오아시스 자판기」, 이미지 포함)는 이 파일이 아니라 등록 묶음 스크립트
-- (`register-home-feed-card.mjs`)로 등록한다. 기존 카드는 삭제하지 않고 비활성화한다(되돌림 가능).
--
-- 선택 근거(사용자 승인, 리포트 「최종 선택」): 월 C · 화 A · 수 A · 목 A · 금 A(입력값 axwxx를 A로 처리) · 토 A · 일 A.
-- 화·수·목·토는 조건 태그 카드(A)라 「전원 카드」(C)를 함께 등록한다(요일마다 all 카드 1장 이상 규칙).
-- 이번 주는 새 규칙(요일별 전원 큰 카드, 미션 카드 큰 카드) 적용 전 리포트라 리포트 그대로 shortcut으로 등록한다.

BEGIN;

-- 1) 기존 등록 카드 13건 비활성화(9/24 등록분, 이 기간 카드 전부)
UPDATE public.today_cards SET is_active = false WHERE id IN (
    '5d1053cd-79a9-4e3d-b918-9dbe5dacebd2',
    'f409a12e-0f71-4a14-a2b0-abc7a1f5dac5',
    '33c30177-a8bc-4666-b34d-fe014380dd3b',
    '78e01a91-21c9-4e1e-b093-9fe1587f546f',
    'fd5ca5ad-6dae-40b7-a85a-ec2fe8a23364',
    'b16677b7-9ae8-48dd-b28d-ea14116430c2',
    '84adca04-5d60-4467-803b-a4d38dfd77ab',
    '1a3df805-bab2-4e32-bc18-5015601e9444',
    'f7d50af3-8958-48fd-8ed5-9bcfdd1b900a',
    'e92ba6e8-3aa3-41c0-be32-c2d6271b6b9a',
    'b419ed70-8ca4-4875-9526-9b050b114b9d',
    '06d6b6a2-3b04-4fad-a689-ed3531a260e1',
    '45340202-1c70-4d97-81a3-2537817aee25'
);

-- 2) 새 카드 10건 등록
INSERT INTO public.today_cards
  (id, template_type, title, subtitle, layout_type, content_type_id, exposure_tags, target_href, mission_id, sort_order, is_active, starts_at, ends_at)
VALUES
  ('dec90a48-d3a4-450f-af52-ea7611cf1a0a', 'itembook_milestone', '컬렉션 완성까지 조금 남았어요', '거의 다 채운 컬렉션이 있어요. 남은 조각을 찾아볼까요?', 'shortcut', 'T02', ARRAY['itembook_remaining_le3'], '/collections', NULL, 1, true, '2026-09-29 00:00:00+09', '2026-09-29 23:59:59+09'),  -- 화 T02
  ('cebac3ad-278b-432d-a1b5-56af66a740a8', 'itembook_milestone', '아직 시작 안 한 컬렉션이 있다면', '컬렉션 목록에서 마음 가는 것부터 살펴봐요', 'shortcut', 'T02', ARRAY['all'], '/collections', NULL, 2, true, '2026-09-29 00:00:00+09', '2026-09-29 23:59:59+09'),  -- 화 T02
  ('9b8a16c7-64be-437a-95b8-26c16df3b264', 'progress_nudge', '요즘 활동 기록이 좀 뜸했죠', '동기화를 다시 이어가요', 'shortcut', 'T03', ARRAY['strava_stale_14d'], '/profile', NULL, 1, true, '2026-09-30 00:00:00+09', '2026-09-30 23:59:59+09'),  -- 수 T03
  ('f1dec605-cc03-4637-8809-692528f6c362', 'progress_nudge', '연동 상태, 한 번 점검해볼까요', '프로필에서 Strava 연결 상태를 확인해봐요', 'shortcut', 'T03', ARRAY['all'], '/profile', NULL, 2, true, '2026-09-30 00:00:00+09', '2026-09-30 23:59:59+09'),  -- 수 T03
  ('7aa48627-42e5-475d-969c-0f4ce07b5e4a', 'drop_alert', '맑은 날엔 잠깐 나가볼까요', '맑은 날씨예요. 짧게 한 바퀴 돌아볼까요?', 'shortcut', 'T08', ARRAY['weather_clear'], '/drops', NULL, 1, true, '2026-10-01 00:00:00+09', '2026-10-01 23:59:59+09'),  -- 목 T08
  ('02bb220c-a48c-47d6-bf7a-744e86be6156', 'drop_alert', '오늘 날씨와 상관없이, 잠깐 걸어볼까요', '지도에서 근처 드랍을 확인해봐요', 'shortcut', 'T08', ARRAY['all'], '/drops', NULL, 2, true, '2026-10-01 00:00:00+09', '2026-10-01 23:59:59+09'),  -- 목 T08
  ('b3ff9bf0-f81c-4184-ac8b-5ca314ccd7fd', 'mission_spotlight', '그루터기 살롱의 겨울 채비', '찬 바람이 불면 그루터기 살롱도 장사가 바빠져요', 'shortcut', 'T04', ARRAY['all'], NULL, 'b1009708-3258-477d-9278-107ad2c67d12', 1, true, '2026-10-02 00:00:00+09', '2026-10-02 23:59:59+09'),  -- 금 T04
  ('c8885e3d-e572-4f55-9d4b-45e65d866808', 'location_trend', '쉬는 날엔 가까운 곳부터', '지도에서 체크인 지점 둘러보기', 'shortcut', 'T05', ARRAY['holiday_today'], '/drops', NULL, 1, true, '2026-10-03 00:00:00+09', '2026-10-03 23:59:59+09'),  -- 토 T05
  ('67daff84-795e-4669-b14b-de31c9fc5e6d', 'location_trend', '지도에서 새로운 장소 찾아보기', '가보지 않은 체크인 지점을 찾아봐요', 'shortcut', 'T05', ARRAY['all'], '/drops', NULL, 2, true, '2026-10-03 00:00:00+09', '2026-10-03 23:59:59+09'),  -- 토 T05
  ('29f8a42a-c651-42fc-ac6d-bf9079bd6335', 'progress_nudge', '주운 아이템, 조합해봤나요?', '「살롱의 장물 시세」 레시피가 있어요. 황금빛 도토리와 잃어버린 결혼반지로 시작해볼까요?', 'shortcut', 'T10', ARRAY['all'], '/combine', NULL, 1, true, '2026-10-04 00:00:00+09', '2026-10-04 23:59:59+09');  -- 일 T10

COMMIT;

-- 3) 등록 뒤 확인: 요일별 all 카드 수(각 날 12:00 KST 기준). 0인 날이 있으면 알린다.
-- select d::date as day,
--   count(c.id) filter (where 'all' = any(c.exposure_tags)) as all_cards,
--   count(c.id) as active_cards
-- from generate_series(date '2026-09-28', date '2026-10-04', interval '1 day') d
-- left join public.today_cards c on c.is_active
--  and c.starts_at <= ((d::date + time '12:00') at time zone 'Asia/Seoul')
--  and c.ends_at   >= ((d::date + time '12:00') at time zone 'Asia/Seoul')
-- group by 1 order by 1;

-- 되돌림 SQL(실행 뒤 문제가 있을 때만): 새 카드 삭제 + 기존 카드 다시 활성화
-- DELETE FROM public.today_cards WHERE id IN (
--     'dec90a48-d3a4-450f-af52-ea7611cf1a0a',
--    'cebac3ad-278b-432d-a1b5-56af66a740a8',
--    '9b8a16c7-64be-437a-95b8-26c16df3b264',
--    'f1dec605-cc03-4637-8809-692528f6c362',
--    '7aa48627-42e5-475d-969c-0f4ce07b5e4a',
--    '02bb220c-a48c-47d6-bf7a-744e86be6156',
--    'b3ff9bf0-f81c-4184-ac8b-5ca314ccd7fd',
--    'c8885e3d-e572-4f55-9d4b-45e65d866808',
--    '67daff84-795e-4669-b14b-de31c9fc5e6d',
--    '29f8a42a-c651-42fc-ac6d-bf9079bd6335'
-- );
-- UPDATE public.today_cards SET is_active = true WHERE id IN (
--     '5d1053cd-79a9-4e3d-b918-9dbe5dacebd2',
--    'f409a12e-0f71-4a14-a2b0-abc7a1f5dac5',
--    '33c30177-a8bc-4666-b34d-fe014380dd3b',
--    '78e01a91-21c9-4e1e-b093-9fe1587f546f',
--    'fd5ca5ad-6dae-40b7-a85a-ec2fe8a23364',
--    'b16677b7-9ae8-48dd-b28d-ea14116430c2',
--    '84adca04-5d60-4467-803b-a4d38dfd77ab',
--    '1a3df805-bab2-4e32-bc18-5015601e9444',
--    'f7d50af3-8958-48fd-8ed5-9bcfdd1b900a',
--    'e92ba6e8-3aa3-41c0-be32-c2d6271b6b9a',
--    'b419ed70-8ca4-4875-9526-9b050b114b9d',
--    '06d6b6a2-3b04-4fad-a689-ed3531a260e1',
--    '45340202-1c70-4d97-81a3-2537817aee25'
-- );
