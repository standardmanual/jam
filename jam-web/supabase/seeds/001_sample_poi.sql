-- Phase 2 샘플 POI 데이터 (서울/수도권 자전거·달리기 명소)
-- 실제 운영 전 어드민 도구로 검수 후 교체 필요

-- NOTE: linked_badge_id는 실제 배지 데이터 입력 후 UPDATE로 연결할 것.
-- 현재는 NULL로 삽입.

INSERT INTO public.poi (id, name, latitude, longitude, radius_meters, category, linked_badge_id)
VALUES
  (
    gen_random_uuid(),
    '남산 N서울타워',
    37.5512,
    126.9882,
    50,
    'mountain',
    NULL
  ),
  (
    gen_random_uuid(),
    '뚝섬 한강공원 자전거 기점',
    37.5311,
    127.0667,
    50,
    'bike_route',
    NULL
  ),
  (
    gen_random_uuid(),
    '북악스카이웨이 팔각정',
    37.6060,
    126.9785,
    50,
    'bike_route',
    NULL
  ),
  (
    gen_random_uuid(),
    '청계산 옛골 입구',
    37.4282,
    127.0611,
    50,
    'trail',
    NULL
  ),
  (
    gen_random_uuid(),
    '광나루 한강공원 자전거 대여소',
    37.5477,
    127.1058,
    50,
    'bike_route',
    NULL
  )
ON CONFLICT DO NOTHING;
