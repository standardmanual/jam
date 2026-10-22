-- 홈피드 돔형(dome)·티켓형(ticket)·에셋 동영상(video) 샘플 카드 시드 등록 (티켓 20261022_2300 후속)
-- 사용자 승인 하에 라이브 DB에 등록 완료된 샘플 데이터 정의 파일.
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
  'dome',
  'dome',
  '성수 가을 숲길 트레일',
  '숲길을 걸으며 찾는 한정판 배지',
  '아치 돔형 실루엣에 에셋 루프 비디오가 적용된 홈피드 카드입니다.',
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
  'dome',
  'dome',
  '북한산 가을 능선 하이킹',
  '바위 능선을 넘어 가을 숲으로',
  '아치 돔형 실루엣에 고화질 커버 이미지가 적용된 카드입니다.',
  '북한산 백운대',
  'https://images.unsplash.com/photo-1551632811-561732d1e306?q=80&w=800&auto=format&fit=crop',
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
