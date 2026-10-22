-- 홈피드 돔형 전체 영상(dome poster)·티켓형 영상(ticket)·박스형 전체 영상(box poster) 샘플 카드 시드 등록 (티켓 20261022_2300 후속)
-- 사용자 요청에 따른 3가지 영상 카드 샘플:
-- 1. 돔 형태 전체가 영상인 카드 (Dome Poster)
-- 2. 티켓 모양 카드의 이미지가 영상인 카드 (Ticket)
-- 3. 박스 카드 전체가 영상인 카드 (Box Poster)
--
-- 재실행 가능(idempotent): ON CONFLICT (id) DO UPDATE

BEGIN;

INSERT INTO public.today_cards (
  id,
  template_type,
  layout_type,
  shape,
  title,
  subtitle,
  description,
  region_label,
  cover_image_url,
  image_source,
  exposure_tags,
  starts_at,
  ends_at,
  sort_order,
  is_active
) VALUES
(
  'e0000000-0000-4000-8000-000000000001',
  'drop_alert',
  'banner',
  'dome',
  '성수 가을 숲길 돔 에디션',
  '숲길을 걸으며 찾는 한정판 배지',
  NULL,
  '성수동 서울숲',
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/factions/backgrounds/1787132025744_2gfhi6.mp4',
  'admin-generator',
  ARRAY['all'],
  '2026-10-22 00:00:00+09',
  '2026-10-31 23:59:59+09',
  1,
  true
),
(
  'e0000000-0000-4000-8000-000000000002',
  'drop_alert',
  'ticket',
  'ticket',
  '주말 스페셜 리워드 티켓',
  '3회 체크인 시 2,500P 즉시 지급',
  '상하 노치 펀칭과 점선 절취선이 있는 티켓형 카드입니다.',
  '서울 전지역',
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/itembooks/backgrounds/1787129306878_pcwy7y.mp4',
  'admin-generator',
  ARRAY['all'],
  '2026-10-22 00:00:00+09',
  '2026-10-31 23:59:59+09',
  2,
  true
),
(
  'e0000000-0000-4000-8000-000000000003',
  'drop_alert',
  'banner',
  'poster',
  '새벽 안개 브리즈 런 박스',
  '호숫가를 따라 달리는 특별한 코스',
  NULL,
  '한강공원',
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/factions/backgrounds/1787132036068_scc23y.mp4',
  'admin-generator',
  ARRAY['all'],
  '2026-10-22 00:00:00+09',
  '2026-10-31 23:59:59+09',
  3,
  true
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  description = EXCLUDED.description,
  cover_image_url = EXCLUDED.cover_image_url,
  layout_type = EXCLUDED.layout_type,
  shape = EXCLUDED.shape,
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at,
  is_active = EXCLUDED.is_active;

COMMIT;

-- 되돌림 SQL:
-- DELETE FROM public.today_cards WHERE id IN ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000003');
