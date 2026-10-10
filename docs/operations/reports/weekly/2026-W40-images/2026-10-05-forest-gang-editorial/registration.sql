-- 에셋 제너레이터 에이전트 홈피드 카드 등록 기록 (register-home-feed-card.mjs가 만든 파일, 티켓 20260925_1413)
-- 등록 경로: 에이전트 등록 스크립트(image_source = agent-generator). 기존 주간 편성 seed SQL 등록 카드는 image_source가 NULL이에요.
-- 묶음: 2026-10-05-forest-gang-editorial / 작성자: 윤진 / 등록 시각(KST): 2026-09-29T13:58:24+09:00
-- 카드: 가을의 그림자 (11ffdd57-8a3f-4fe9-bbc4-534e33fc5a2d)
-- 이미 등록이 끝난 기록이에요. 같은 id가 있으면 아무 일도 하지 않아요(ON CONFLICT DO NOTHING).
-- 이미지 파일(images 버킷): today_cards/asset-generator/11ffdd57-8a3f-4fe9-bbc4-534e33fc5a2d.png, today_cards/asset-generator/11ffdd57-8a3f-4fe9-bbc4-534e33fc5a2d.webp
--   저장소 파일은 SQL로 지울 수 없어요. 되돌릴 때는 아래 명령을 써요.
--   cd jam-web && npx tsx scripts/asset-generator/register-home-feed-card.mjs --undo <registration-record.json 절대경로>
-- 메인 세션: 이 파일을 jam-web/supabase/migrations/seed_agent_home_feed_2026_10_05_forest_gang_editorial.sql 로 옮겨 커밋해요.

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
  '11ffdd57-8a3f-4fe9-bbc4-534e33fc5a2d',
  'editorial_article',
  'large_thumbnail',
  '가을의 그림자',
  '가을은 숲속의 갱단 차례예요',
  NULL,
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/today_cards/asset-generator/11ffdd57-8a3f-4fe9-bbc4-534e33fc5a2d.webp?v=1790657904816',
  ARRAY[]::uuid[],
  NULL,
  '68a6ef7d-8ef3-117b-b25c-1418e1c5d416',
  NULL,
  '도시의 가을이 깊어지면 숲속의 갱단이 나설 차례예요.

도심 공원과 외곽 산자락에는 다람쥐와 길고양이를 닮은 실세들이 살아요. 숲속의 갱단이에요. "방심한 등산객의 가방을 털고, 길가에 흘린 간식에서 가장 맛있는 부분만 빼먹는 범인들." 훔친 물건은 어디로 갈까요? "깊은 숲속 동물들의 비밀 환전소 ''그루터기 살롱''에서 도토리와 거래된다."

그 전리품이 모인 곳이 컬렉션 「그루터기 살롱의 장물들」이에요. "인간들의 방심을 틈타 가방을 털고 간 무법자들의 전리품. 깊은 숲속 그루터기 살롱에서 도토리와 밀거래되고 있다."

그렇다고 늘 털어 가기만 하는 건 아니에요. "구역을 존중하며 걷는 자들에게는 보물을 슬쩍 흘려두기도 한다." 오늘 공원 한 바퀴든 산자락 한 구간이든, 가방 지퍼는 꼭 잠그고 구역을 존중하며 걸어 보세요. 길 위에서 갱단이 슬쩍 흘려둔 무언가를 만날지도 몰라요.

「그루터기 살롱의 장물들」에서 갱단이 털어 간 전리품을 먼저 구경해 보세요.',
  NULL,
  'T01',
  '/collections/68a6ef7d-8ef3-117b-b25c-1418e1c5d416',
  ARRAY['all']::text[],
  '2026-10-04T15:00:00.000Z',
  '2026-10-05T14:59:00.000Z',
  0,
  TRUE,
  'agent-generator'
)
ON CONFLICT (id) DO NOTHING;

-- 되돌림 SQL
-- delete from public.today_cards where id = '11ffdd57-8a3f-4fe9-bbc4-534e33fc5a2d';
-- (이 SQL만으로는 저장소 파일이 남아요. today_card_events에 이 id가 이미 붙었다면 지우지 말고 어드민에서 카드를 비활성으로 바꿔요. today_card_events는 카드를 지우면 card_id만 NULL로 바뀌어 어느 카드의 기록이었는지 알 수 없게 돼요.)
