-- 에셋 제너레이터 에이전트 홈피드 카드 등록 기록 (register-home-feed-card.mjs가 만든 파일, 티켓 20260925_1413)
-- 등록 경로: 에이전트 등록 스크립트(image_source = agent-generator). 기존 주간 편성 seed SQL 등록 카드는 image_source가 NULL이에요.
-- 묶음: 2026-09-28-potion-alchemist-editorial / 작성자: 윤진 / 등록 시각(KST): 2026-09-26T17:26:29+09:00
-- 카드: 오아시스 자판기 (562a4af0-d80d-45c8-ad68-a1c36fe064e9)
-- 이미 등록이 끝난 기록이에요. 같은 id가 있으면 아무 일도 하지 않아요(ON CONFLICT DO NOTHING).
-- 이미지 파일(images 버킷): today_cards/asset-generator/562a4af0-d80d-45c8-ad68-a1c36fe064e9.png, today_cards/asset-generator/562a4af0-d80d-45c8-ad68-a1c36fe064e9.webp
--   저장소 파일은 SQL로 지울 수 없어요. 되돌릴 때는 아래 명령을 써요.
--   cd jam-web && npx tsx scripts/asset-generator/register-home-feed-card.mjs --undo <registration-record.json 절대경로>
-- 메인 세션: 이 파일을 jam-web/supabase/migrations/seed_agent_home_feed_2026_09_28_potion_alchemist_editorial.sql 로 옮겨 커밋해요.

INSERT INTO public.today_cards (
  id,
  template_type,
  layout_type,
  title,
  subtitle,
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
  '562a4af0-d80d-45c8-ad68-a1c36fe064e9',
  'editorial_article',
  'large_thumbnail',
  '오아시스 자판기',
  '체력보다 화학, 이 계절의 신조',
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/today_cards/asset-generator/562a4af0-d80d-45c8-ad68-a1c36fe064e9.webp?v=1790411189500',
  ARRAY[]::uuid[],
  NULL,
  'bf20a6e1-d3e3-989c-b2db-795287c711d6',
  NULL,
  '제로슈거·무카페인 음료가 편의점 냉장고를 채우는 계절이다.

"순수 체력보다 화학적 결합을 맹신하는 아웃도어 도핑 전문가들. 주머니는 항상 에너지 젤·전해질 캔디·고카페인 알약으로 가득하다. 모든 갈증과 피로를 씻어준다는 환상의 음료가 담긴 ''오아시스 자판기''를 맹목적으로 찾아 헤맨다." — 포션 연금술사',
  NULL,
  'T01',
  '/collections/bf20a6e1-d3e3-989c-b2db-795287c711d6',
  ARRAY['all']::text[],
  '2026-09-27T15:00:00.000Z',
  '2026-09-28T14:59:00.000Z',
  0,
  TRUE,
  'agent-generator'
)
ON CONFLICT (id) DO NOTHING;

-- 되돌림 SQL
-- delete from public.today_cards where id = '562a4af0-d80d-45c8-ad68-a1c36fe064e9';
-- (이 SQL만으로는 저장소 파일이 남아요. today_card_events에 이 id가 이미 붙었다면 지우지 말고 어드민에서 카드를 비활성으로 바꿔요. today_card_events는 카드를 지우면 card_id만 NULL로 바뀌어 어느 카드의 기록이었는지 알 수 없게 돼요.)
