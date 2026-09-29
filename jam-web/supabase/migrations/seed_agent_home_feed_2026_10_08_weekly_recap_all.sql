-- 에셋 제너레이터 에이전트 홈피드 카드 등록 기록 (register-home-feed-card.mjs가 만든 파일, 티켓 20260925_1413)
-- 등록 경로: 에이전트 등록 스크립트(image_source = agent-generator). 기존 주간 편성 seed SQL 등록 카드는 image_source가 NULL이에요.
-- 묶음: 2026-10-08-weekly-recap-all / 작성자: 윤진 / 등록 시각(KST): 2026-09-29T13:58:28+09:00
-- 카드: 이번 주 궤적 (74e665c6-b55d-427b-9490-9b8781ec9f65)
-- 이미 등록이 끝난 기록이에요. 같은 id가 있으면 아무 일도 하지 않아요(ON CONFLICT DO NOTHING).
-- 이미지 파일(images 버킷): today_cards/asset-generator/74e665c6-b55d-427b-9490-9b8781ec9f65.png, today_cards/asset-generator/74e665c6-b55d-427b-9490-9b8781ec9f65.webp
--   저장소 파일은 SQL로 지울 수 없어요. 되돌릴 때는 아래 명령을 써요.
--   cd jam-web && npx tsx scripts/asset-generator/register-home-feed-card.mjs --undo <registration-record.json 절대경로>
-- 메인 세션: 이 파일을 jam-web/supabase/migrations/seed_agent_home_feed_2026_10_08_weekly_recap_all.sql 로 옮겨 커밋해요.

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
  '74e665c6-b55d-427b-9490-9b8781ec9f65',
  'progress_nudge',
  'large_thumbnail',
  '이번 주 궤적',
  '이번 주 활동을 모았어요',
  '지난 며칠 걸은 길을 한 번 돌아봐요. 내 발자국만 조용히 모여 있어요.',
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/today_cards/asset-generator/74e665c6-b55d-427b-9490-9b8781ec9f65.webp?v=1790657908574',
  ARRAY[]::uuid[],
  'b1009708-3258-477d-9278-107ad2c67d12',
  NULL,
  NULL,
  NULL,
  NULL,
  'T12',
  '/feed',
  ARRAY['all']::text[],
  '2026-10-07T15:00:00.000Z',
  '2026-10-08T14:59:00.000Z',
  0,
  TRUE,
  'agent-generator'
)
ON CONFLICT (id) DO NOTHING;

-- 되돌림 SQL
-- delete from public.today_cards where id = '74e665c6-b55d-427b-9490-9b8781ec9f65';
-- (이 SQL만으로는 저장소 파일이 남아요. today_card_events에 이 id가 이미 붙었다면 지우지 말고 어드민에서 카드를 비활성으로 바꿔요. today_card_events는 카드를 지우면 card_id만 NULL로 바뀌어 어느 카드의 기록이었는지 알 수 없게 돼요.)
