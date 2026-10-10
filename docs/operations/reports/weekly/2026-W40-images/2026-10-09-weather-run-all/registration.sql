-- 에셋 제너레이터 에이전트 홈피드 카드 등록 기록 (register-home-feed-card.mjs가 만든 파일, 티켓 20260925_1413)
-- 등록 경로: 에이전트 등록 스크립트(image_source = agent-generator). 기존 주간 편성 seed SQL 등록 카드는 image_source가 NULL이에요.
-- 묶음: 2026-10-09-weather-run-all / 작성자: 윤진 / 등록 시각(KST): 2026-09-29T13:58:30+09:00
-- 카드: 쉬는 날 러닝 (17a10aaf-a453-4f22-93da-5ad372e142b9)
-- 이미 등록이 끝난 기록이에요. 같은 id가 있으면 아무 일도 하지 않아요(ON CONFLICT DO NOTHING).
-- 이미지 파일(images 버킷): today_cards/asset-generator/17a10aaf-a453-4f22-93da-5ad372e142b9.png, today_cards/asset-generator/17a10aaf-a453-4f22-93da-5ad372e142b9.webp
--   저장소 파일은 SQL로 지울 수 없어요. 되돌릴 때는 아래 명령을 써요.
--   cd jam-web && npx tsx scripts/asset-generator/register-home-feed-card.mjs --undo <registration-record.json 절대경로>
-- 메인 세션: 이 파일을 jam-web/supabase/migrations/seed_agent_home_feed_2026_10_09_weather_run_all.sql 로 옮겨 커밋해요.

INSERT INTO public.today_cards (
  id,
  template_type,
  layout_type,
  title,
  subtitle,
  description,
  cover_image_url,
  badge_ids,
  mission_id,
  item_book_id,
  region_label,
  body_markdown,
  ranking_mode_id,
  content_type_id,
  target_href,
  exposure_tags,
  starts_at,
  ends_at,
  sort_order,
  is_active,
  image_source
) VALUES (
  '17a10aaf-a453-4f22-93da-5ad372e142b9',
  'drop_alert',
  'large_thumbnail',
  '쉬는 날 러닝',
  '가볍게 몸 풀어볼까요',
  '느긋한 하루라면 가까운 길부터 천천히 달려 봐요. 서두를 일은 없어요.',
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/today_cards/asset-generator/17a10aaf-a453-4f22-93da-5ad372e142b9.webp?v=1790657910651',
  ARRAY[]::uuid[],
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'T08',
  NULL,
  ARRAY['all']::text[],
  '2026-10-08T15:00:00.000Z',
  '2026-10-09T14:59:00.000Z',
  0,
  TRUE,
  'agent-generator'
)
ON CONFLICT (id) DO NOTHING;

-- 되돌림 SQL
-- delete from public.today_cards where id = '17a10aaf-a453-4f22-93da-5ad372e142b9';
-- (이 SQL만으로는 저장소 파일이 남아요. today_card_events에 이 id가 이미 붙었다면 지우지 말고 어드민에서 카드를 비활성으로 바꿔요. today_card_events는 카드를 지우면 card_id만 NULL로 바뀌어 어느 카드의 기록이었는지 알 수 없게 돼요.)
