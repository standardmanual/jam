-- 홈피드 2026-W41(2026-10-05~10-11) 편성 등록: 2026-W40 리포트(9/29 생성)의 승인 카드 중 수요일(10/7) 미션 소개 카드
-- 티켓 20260929_1250 후속. 등록은 사용자 승인 뒤 메인 세션이 실행한다(공용 단일 DB, CLAUDE.md 절대 규칙 6).
-- 선택 근거(사용자 승인, 리포트 「최종 선택」): 7일 모두 후보 A.
-- 월·화·목·금·토·일 카드 6장(이미지 포함)은 이 파일이 아니라 등록 묶음 스크립트(register-home-feed-card.mjs)로
-- 등록한다(묶음: docs/operations/reports/weekly/2026-W40-images/). 이 기간에 이미 등록된 카드는 없다(9/29 조회).
-- 미션 카드 규칙(content-automation PRD §8): mission_spotlight는 large_thumbnail, 커버는 미션 대표 이미지 URL 그대로.

BEGIN;

INSERT INTO public.today_cards
  (id, template_type, title, subtitle, description, cover_image_url, layout_type, content_type_id, exposure_tags, target_href, mission_id, sort_order, is_active, starts_at, ends_at)
SELECT
  '480c3c80-4e28-4e92-a934-9a59526a3a6f', 'mission_spotlight', '그루터기 살롱의 겨울 채비', NULL,
  '10월 한 달 활동 4번이면 「볼따구에 숨긴 도토리」를 받아요.',
  m.image_url, 'large_thumbnail', 'T04', ARRAY['all'], '/missions/b1009708-3258-477d-9278-107ad2c67d12',
  m.id, 0, true, '2026-10-07 00:00:00+09', '2026-10-07 23:59:59+09'
FROM public.missions m
WHERE m.id = 'b1009708-3258-477d-9278-107ad2c67d12' AND m.image_url IS NOT NULL;

COMMIT;

-- 등록한 카드 ID: 480c3c80-4e28-4e92-a934-9a59526a3a6f (수 T04)

-- 되돌림 SQL(문제가 있을 때만):
-- DELETE FROM public.today_cards WHERE id = '480c3c80-4e28-4e92-a934-9a59526a3a6f';
