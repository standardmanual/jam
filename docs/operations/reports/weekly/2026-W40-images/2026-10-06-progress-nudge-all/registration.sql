-- 에셋 제너레이터 에이전트 홈피드 카드 등록 기록 (register-home-feed-card.mjs가 만든 파일, 티켓 20260925_1413)
-- 등록 경로: 에이전트 등록 스크립트(image_source = agent-generator). 기존 주간 편성 seed SQL 등록 카드는 image_source가 NULL이에요.
-- 묶음: 2026-10-06-progress-nudge-all / 작성자: 윤진 / 등록 시각(KST): 2026-09-29T13:58:26+09:00
-- 카드: 한 걸음 더 (45b8d32a-0516-47db-a58a-1c25367300aa)
-- 이미 등록이 끝난 기록이에요. 같은 id가 있으면 아무 일도 하지 않아요(ON CONFLICT DO NOTHING).
-- 이미지 파일(images 버킷): today_cards/asset-generator/45b8d32a-0516-47db-a58a-1c25367300aa.png, today_cards/asset-generator/45b8d32a-0516-47db-a58a-1c25367300aa.webp
--   저장소 파일은 SQL로 지울 수 없어요. 되돌릴 때는 아래 명령을 써요.
--   cd jam-web && npx tsx scripts/asset-generator/register-home-feed-card.mjs --undo <registration-record.json 절대경로>
-- 메인 세션: 이 파일을 jam-web/supabase/migrations/seed_agent_home_feed_2026_10_06_progress_nudge_all.sql 로 옮겨 커밋해요.

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
  '45b8d32a-0516-47db-a58a-1c25367300aa',
  'progress_nudge',
  'large_thumbnail',
  '한 걸음 더',
  '다음 배지가 가까워요',
  '배지 「더 높이」를 향해 오늘도 한 걸음 보태 봐요.',
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/today_cards/asset-generator/45b8d32a-0516-47db-a58a-1c25367300aa.webp?v=1790657906727',
  ARRAY['478d2b17-561f-437f-addb-43aa6f86b22d']::uuid[],
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'T07',
  '/badges/478d2b17-561f-437f-addb-43aa6f86b22d',
  ARRAY['all']::text[],
  '2026-10-05T15:00:00.000Z',
  '2026-10-06T14:59:00.000Z',
  0,
  TRUE,
  'agent-generator'
)
ON CONFLICT (id) DO NOTHING;

-- 되돌림 SQL
-- delete from public.today_cards where id = '45b8d32a-0516-47db-a58a-1c25367300aa';
-- (이 SQL만으로는 저장소 파일이 남아요. today_card_events에 이 id가 이미 붙었다면 지우지 말고 어드민에서 카드를 비활성으로 바꿔요. today_card_events는 카드를 지우면 card_id만 NULL로 바뀌어 어느 카드의 기록이었는지 알 수 없게 돼요.)
