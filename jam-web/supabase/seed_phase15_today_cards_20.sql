-- Phase 15 투데이 카드 시드: 20개.
-- Supabase SQL Editor에서 실행. 각 카드는 개별 INSERT라 일부만 붙여넣어도 실행됨.
-- 전제: 048_today_cards.sql 마이그레이션이 먼저 적용되어 public.today_cards 존재.
--
-- 참조 규칙:
--   - badge_ids / mission_id / item_book_id 는 이름으로 서브쿼리 조회(LIMIT 1).
--     시드 이후 이름이 바뀌었으면 해당 참조는 NULL/빈배열이 되지만 카드 자체는 삽입됨.
--   - 모든 ends_at = '2026-12-30 23:59:59+09' (KST 고정).
--   - starts_at 대부분 NOW()(즉시 노출), 3개(#5, #9, #18)만 미래(예약 발행 시연).
--   - 컬럼 순서:
--     (template_type, title, subtitle, cover_image_url, badge_ids, mission_id,
--      item_book_id, region_label, body_markdown, target_href, exposure_tags,
--      starts_at, ends_at, sort_order, is_active)

-- ================= badge_spotlight (5) =================

-- 1
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('badge_spotlight', '이런 배지, 어때요?', '이달의 산책왕에 도전해보세요', NULL,
  ARRAY[(SELECT id FROM public.badges WHERE name = '이달의 산책왕' LIMIT 1)]::uuid[],
  NULL, NULL, NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 10, TRUE);

-- 2 (상황 맞춤: 새벽 접속)
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('badge_spotlight', '새벽을 여는 사람들', '침대를 박차고 나오면 만나는 ''밤의 보행자''', NULL,
  ARRAY[(SELECT id FROM public.badges WHERE name = '밤의 보행자' LIMIT 1)]::uuid[],
  NULL, NULL, NULL, NULL, NULL, ARRAY['time_dawn']::text[], NOW(), '2026-12-30 23:59:59+09', 11, TRUE);

-- 3
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('badge_spotlight', '겨울 정복자 컬렉션', '혹한 장정 · 혹한의 트레일러', NULL,
  ARRAY[
    (SELECT id FROM public.badges WHERE name = '혹한 장정' LIMIT 1),
    (SELECT id FROM public.badges WHERE name = '혹한의 트레일러' LIMIT 1)
  ]::uuid[],
  NULL, NULL, NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 12, TRUE);

-- 4 (신규 유저 대상)
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('badge_spotlight', '환영합니다!', '첫 배지 ''두 바퀴의 시작''부터 모아보세요', NULL,
  ARRAY[(SELECT id FROM public.badges WHERE name = '두 바퀴의 시작' LIMIT 1)]::uuid[],
  NULL, NULL, NULL, NULL, NULL, ARRAY['new_user']::text[], NOW(), '2026-12-30 23:59:59+09', 5, TRUE);

-- 5 (예약 발행: 4일 뒤 노출)
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('badge_spotlight', '산을 오르는 자들', '수직의 도전 · 주말 등산가', NULL,
  ARRAY[
    (SELECT id FROM public.badges WHERE name = '수직의 도전' LIMIT 1),
    (SELECT id FROM public.badges WHERE name = '주말 등산가' LIMIT 1)
  ]::uuid[],
  NULL, NULL, NULL, NULL, NULL, ARRAY['time_morning']::text[], NOW() + INTERVAL '4 days', '2026-12-30 23:59:59+09', 13, TRUE);

-- ================= progress_nudge (3) =================

-- 6
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('progress_nudge', '곧 종료! 참여 중 미션 마무리', '3일 안에 끝나는 미션이 있어요', NULL,
  '{}'::uuid[],
  (SELECT id FROM public.missions WHERE title = '러닝 마스터: 100km 완주' LIMIT 1),
  NULL, NULL, NULL, NULL, ARRAY['has_ending_soon_mission']::text[], NOW(), '2026-12-30 23:59:59+09', 1, TRUE);

-- 7
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('progress_nudge', '거의 다 왔어요', '''트레일 루틴'' 배지까지 한 걸음', NULL,
  ARRAY[(SELECT id FROM public.badges WHERE name = '트레일 루틴' LIMIT 1)]::uuid[],
  NULL, NULL, NULL, NULL, NULL, ARRAY['has_participating_mission']::text[], NOW(), '2026-12-30 23:59:59+09', 2, TRUE);

-- 8 (예약 발행: 3일 뒤 노출)
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('progress_nudge', '이번 주 목표를 향해', '참가한 미션 진행 상황을 확인하세요', NULL,
  '{}'::uuid[],
  (SELECT id FROM public.missions WHERE title = '이번 시즌 러닝 50km 달성' LIMIT 1),
  NULL, NULL, NULL, NULL, ARRAY['has_participating_mission']::text[], NOW() + INTERVAL '3 days', '2026-12-30 23:59:59+09', 3, TRUE);

-- ================= mission_spotlight (3) =================

-- 9
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('mission_spotlight', '곧 종료되는 미션', '트레일러닝 30km 도전, 지금 참여!', NULL,
  '{}'::uuid[],
  (SELECT id FROM public.missions WHERE title = '트레일러닝 30km 도전' LIMIT 1),
  NULL, NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 20, TRUE);

-- 10 (신규 유저 대상)
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('mission_spotlight', '초보 환영 미션', '러닝 10km 완주부터 시작해요', NULL,
  '{}'::uuid[],
  (SELECT id FROM public.missions WHERE title = '러닝 10km 완주 (초보 환영)' LIMIT 1),
  NULL, NULL, NULL, NULL, ARRAY['new_user', 'all']::text[], NOW(), '2026-12-30 23:59:59+09', 21, TRUE);

-- 11
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('mission_spotlight', '500km 라이더 챌린지', '자전거 500km 챌린지 랭킹에 도전하세요', NULL,
  '{}'::uuid[],
  (SELECT id FROM public.missions WHERE title = '자전거 500km 챌린지' LIMIT 1),
  NULL, NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 22, TRUE);

-- ================= itembook_milestone (2) =================

-- 12
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('itembook_milestone', '누군가 ''분실물 센터 999''를 완성했어요', '국내 첫 완성자가 등장했습니다', NULL,
  '{}'::uuid[], NULL,
  (SELECT id FROM public.item_books WHERE name = '분실물 센터 999' LIMIT 1),
  NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 30, TRUE);

-- 13
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('itembook_milestone', '아이템북을 모으는 재미', '''종이 지도의 낭만'' 컬렉션을 채워보세요', NULL,
  '{}'::uuid[], NULL,
  (SELECT id FROM public.item_books WHERE name = '종이 지도의 낭만' LIMIT 1),
  NULL, NULL, NULL, ARRAY['has_incomplete_itembook']::text[], NOW(), '2026-12-30 23:59:59+09', 31, TRUE);

-- ================= location_trend (2) =================

-- 14
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('location_trend', '핫한 성수동에서 발견된 레전드 배지', '이번 주 성수 러너들이 가장 많이 획득했어요', NULL,
  ARRAY[
    (SELECT id FROM public.badges WHERE name = '이달의 산책왕' LIMIT 1),
    (SELECT id FROM public.badges WHERE name = '밤의 보행자' LIMIT 1),
    (SELECT id FROM public.badges WHERE name = '산악 라이더' LIMIT 1)
  ]::uuid[],
  NULL, NULL, '성수동', NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 40, TRUE);

-- 15
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('location_trend', '남산 일대 트렌드', '계단과 언덕의 배지들', NULL,
  ARRAY[
    (SELECT id FROM public.badges WHERE name = '언덕의 도전자' LIMIT 1),
    (SELECT id FROM public.badges WHERE name = '수직의 도전' LIMIT 1)
  ]::uuid[],
  NULL, NULL, '남산', NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 41, TRUE);

-- ================= drop_alert (2) =================

-- 16
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('drop_alert', '지금 주변에 드랍된 아이템배지 확인', '가까운 장소에서 픽업해보세요', NULL,
  '{}'::uuid[], NULL, NULL, NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 50, TRUE);

-- 17 (상황 맞춤: 오후)
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('drop_alert', '오후의 산책, 드랍 찬스', '동네 한 바퀴 돌며 아이템을 주워보세요', NULL,
  '{}'::uuid[], NULL, NULL, NULL, NULL, NULL, ARRAY['time_afternoon']::text[], NOW(), '2026-12-30 23:59:59+09', 51, TRUE);

-- ================= editorial_article (3) =================

-- 18 (예약 발행: 6일 뒤 노출)
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('editorial_article', '슈처 루키의 도전일기', '반년 만에 100km 미션을 완주한 러너의 기록', NULL,
  '{}'::uuid[], NULL, NULL, NULL,
  E'러닝을 시작한 지 반년, 지훈(가명) 님은 처음으로 ''러닝 마스터: 100km 완주'' 미션에 도전했다.\n\n"처음엔 3km도 버거웠어요. 그런데 앱에서 다음 배지까지 얼마 안 남았다고 알려주니까, 딱 그만큼만 더 뛰게 되더라고요."\n\n그가 특히 아꼈던 건 새벽 러닝에서 얻은 ''밤의 보행자'' 배지다. 아직 해가 뜨기 전, 텅 빈 거리를 달리며 모은 기록이었다.\n\n100km를 채운 날, 그는 이렇게 적었다. "숫자는 그냥 숫자인데, 이상하게 뿌듯하네요. 다음 시즌엔 트레일에 도전해보려고요."\n\n※ 등장인물은 가상이며, 언급된 배지·미션은 실제 JAM!에서 진행 중입니다.',
  NULL, ARRAY['all']::text[], NOW() + INTERVAL '6 days', '2026-12-30 23:59:59+09', 60, TRUE);

-- 19
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('editorial_article', '성수동 러너들이 ''이달의 산책왕''을 노리는 이유', '한 동네에서 시작된 작은 경쟁 이야기', NULL,
  '{}'::uuid[], NULL, NULL, NULL,
  E'성수동은 요즘 러너들 사이에서 조용한 경쟁이 벌어지는 동네다.\n\n매달 초가 되면 ''이달의 산책왕'' 배지를 두고 근처 이웃들이 은근히 신경전을 벌인다. 누가 더 많이, 더 자주 걸었는지가 앱 안에서 드러나기 때문이다.\n\n한 참가자는 말했다. "경쟁이라기보단, 서로 자극이 돼요. 오늘 저 사람이 벌써 나갔구나 싶으면 저도 신발을 신게 되죠."\n\n거창한 목표가 아니어도 좋다. 동네 한 바퀴가 쌓이면, 그게 이달의 기록이 된다.\n\n※ 등장인물은 가상이며, 언급된 배지는 실제 JAM!에서 획득 가능합니다.',
  NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 61, TRUE);

-- 20
INSERT INTO public.today_cards (template_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('editorial_article', '아이템북 ''분실물 센터 999'' 완성기', '흩어진 조각을 모으는 사람들', NULL,
  '{}'::uuid[], NULL, NULL, NULL,
  E'아이템북 하나를 끝까지 채우는 건 생각보다 인내가 필요한 일이다.\n\n''분실물 센터 999''는 여러 장소에 흩어진 아이템배지를 하나씩 주워 완성하는 컬렉션이다. 한 완성자는 "마지막 한 칸이 제일 안 채워지더라"며 웃었다.\n\n그는 퇴근길마다 조금씩 경로를 바꿔 걸었다고 한다. 늘 지나던 길 대신 한 골목 더 들어가 보는 식으로.\n\n"완성하고 나니 별거 아닌데, 그 과정에서 동네를 다시 알게 됐어요. 그게 진짜 보상 같아요."\n\n※ 등장인물은 가상이며, 언급된 아이템북은 실제 JAM!에 존재합니다.',
  NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 62, TRUE);
