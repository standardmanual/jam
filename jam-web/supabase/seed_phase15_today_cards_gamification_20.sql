-- Phase 15 투데이 카드 추가 시드: 리텐션/동기부여/보상 중심 20개 (기존 1~62번과 다른 조합/카피)
-- Supabase SQL Editor에서 실행. sort_order 70~89 사용(기존 1~62와 겹치지 않음).
-- 전제: 048_today_cards.sql + 049_today_cards_layout_type.sql 적용 완료.
--
-- 설계 원칙:
--   - 기존 20개와 다른 template_type × layout_type 조합 위주로 구성
--   - 보상(포인트/배지)을 카피에 명시적으로 노출
--   - 리텐션(스트릭/근접완주/긴급성), 동기부여(경쟁/희귀성/사회적증거), 보상(확정지급 문구) 3축 반영
--   - 배지/미션/아이템북은 전부 실제 시드 데이터 이름으로 서브쿼리 조회
--   - 모든 ends_at = '2026-12-30 23:59:59+09' (기존과 동일 컨벤션)

-- ================= progress_nudge (3) — 스트릭/근접 완주 =================

-- 70: 스트릭 방어 넛지
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('progress_nudge', 'large_thumbnail', '''루틴의 수호자''까지 단 하루', '오늘 하루만 더 채우면 레전더리 배지 확정 지급', NULL,
  ARRAY[(SELECT id FROM public.badges WHERE name = '루틴의 수호자' AND type = 'activity' AND rarity = 'legendary' LIMIT 1)]::uuid[],
  NULL, NULL, NULL, NULL, NULL, ARRAY['has_participating_mission']::text[], NOW(), '2026-12-30 23:59:59+09', 70, TRUE);

-- 71: 놓치면 사라지는 배지 갤러리 (긴급성)
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('progress_nudge', 'badge_gallery', '이번 주 놓치면 아쉬운 배지들', '''작심삼일의 파괴자''와 ''새벽 루틴 마스터'', 지금 진행 중인 활동으로 노려보세요', NULL,
  ARRAY[
    (SELECT id FROM public.badges WHERE name = '작심삼일의 파괴자' AND type = 'activity' AND rarity = 'legendary' LIMIT 1),
    (SELECT id FROM public.badges WHERE name = '새벽 루틴 마스터' AND type = 'activity' AND rarity = 'legendary' LIMIT 1)
  ]::uuid[],
  NULL, NULL, NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 71, TRUE);

-- 72: 포인트 목표 근접 배너
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('progress_nudge', 'banner', '100P, 거의 다 왔어요', '''이번 시즌 5회 이상 운동'' 완료 시 100P 확정 지급',
  (SELECT image_url FROM public.badges WHERE name = '스피드 엔듀러' AND type = 'activity' AND rarity = 'mythic' LIMIT 1),
  ARRAY[(SELECT id FROM public.badges WHERE name = '스피드 엔듀러' AND type = 'activity' AND rarity = 'mythic' LIMIT 1)]::uuid[],
  (SELECT id FROM public.missions WHERE title = '이번 시즌 5회 이상 운동' LIMIT 1),
  NULL, NULL, NULL, NULL, ARRAY['has_participating_mission']::text[], NOW(), '2026-12-30 23:59:59+09', 72, TRUE);

-- ================= badge_spotlight (3) — 희귀성/긴급성 =================

-- 73: 새벽 CTA (짧은 넛지)
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('badge_spotlight', 'shortcut', '지금 아니면 못 받는 배지', '''새벽 야생인'' — 신화 등급', NULL,
  ARRAY[(SELECT id FROM public.badges WHERE name = '새벽 야생인' AND type = 'activity' AND rarity = 'mythic' LIMIT 1)]::uuid[],
  NULL, NULL, NULL, NULL, NULL, ARRAY['time_dawn']::text[], NOW(), '2026-12-30 23:59:59+09', 73, TRUE);

-- 74: 희귀성 배너
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('badge_spotlight', 'banner', '보유자가 손에 꼽는 신화 배지', '''알파인 트레일러'' — 전체 유저 중 극소수만 보유',
  (SELECT image_url FROM public.badges WHERE name = '알파인 트레일러' AND type = 'activity' AND rarity = 'mythic' LIMIT 1),
  ARRAY[(SELECT id FROM public.badges WHERE name = '알파인 트레일러' AND type = 'activity' AND rarity = 'mythic' LIMIT 1)]::uuid[],
  NULL, NULL, NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 74, TRUE);

-- 75: 담백형(other)
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('badge_spotlight', 'other', '당신만 아직 모르는 배지', '''산책의 명상가'' — 걷기 활동으로 도전 가능', NULL,
  ARRAY[(SELECT id FROM public.badges WHERE name = '산책의 명상가' AND type = 'activity' AND rarity = 'legendary' LIMIT 1)]::uuid[],
  NULL, NULL, NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 75, TRUE);

-- ================= mission_spotlight (4) — 긴급성/경쟁/보상명시 =================

-- 76: 선착순 마감 임박
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('mission_spotlight', 'large_thumbnail', '선착순 100명, 지금이 마지막 기회', '''선착순 100명! 7회 운동 챌린지'' 완료 시 200P 확정 지급', NULL,
  '{}'::uuid[],
  (SELECT id FROM public.missions WHERE title = '선착순 100명! 7회 운동 챌린지' LIMIT 1),
  NULL, NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 76, TRUE);

-- 77: 랭킹 경쟁 배너
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('mission_spotlight', 'banner', '500km 라이더 랭킹, 지금 도전하세요', '완료 시 500P — 이 시즌 최고 보상 미션', NULL,
  '{}'::uuid[],
  (SELECT id FROM public.missions WHERE title = '자전거 500km 챌린지' LIMIT 1),
  NULL, NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 77, TRUE);

-- 78: 담백형(other) — 고보상 미션
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('mission_spotlight', 'other', '이번 시즌 최대 400P 미션', '''전체 활동 누적 300km'' — 종목 무관 누적이라 도전하기 쉬워요', NULL,
  '{}'::uuid[],
  (SELECT id FROM public.missions WHERE title = '전체 활동 누적 300km' LIMIT 1),
  NULL, NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 78, TRUE);

-- 79: 바로가기형
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('mission_spotlight', 'shortcut', '트레일러닝 3회, 완주 배지 + 180P', '3회만 채우면 바로 완료 처리돼요', NULL,
  '{}'::uuid[],
  (SELECT id FROM public.missions WHERE title = '트레일러닝 3회 완주' LIMIT 1),
  NULL, NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 79, TRUE);

-- ================= itembook_milestone (3) — 근접완주 리텐션 =================

-- 80: 근접 완주 넛지 (가장 강한 리텐션 트리거)
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('itembook_milestone', 'shortcut', '딱 한 조각 남았어요', '''3일 차의 위기'' 컬렉션, 지금이 고비예요', NULL,
  '{}'::uuid[], NULL,
  (SELECT id FROM public.item_books WHERE name = '3일 차의 위기' LIMIT 1),
  NULL, NULL, NULL, ARRAY['has_incomplete_itembook']::text[], NOW(), '2026-12-30 23:59:59+09', 80, TRUE);

-- 81: 완성 보상 강조
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('itembook_milestone', 'large_thumbnail', '완성하면 특별 배지가 기다려요', '''지름신 강림'' 컬렉션 완성 보상 확인하기', NULL,
  '{}'::uuid[], NULL,
  (SELECT id FROM public.item_books WHERE name = '지름신 강림' LIMIT 1),
  NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 81, TRUE);

-- 82: 담백형(other) — 포기 방지 메시지
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('itembook_milestone', 'other', '여기서 멈추기엔 아까워요', '''내일부터 진짜 다이어트'' 컬렉션, 지금까지 모은 조각을 확인해보세요', NULL,
  '{}'::uuid[], NULL,
  (SELECT id FROM public.item_books WHERE name = '내일부터 진짜 다이어트' LIMIT 1),
  NULL, NULL, NULL, ARRAY['has_incomplete_itembook']::text[], NOW(), '2026-12-30 23:59:59+09', 82, TRUE);

-- ================= location_trend (2) — 사회적 증거 =================

-- 83: 큰 썸네일형
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('location_trend', 'large_thumbnail', '북한산 자락에서 지금 벌어지는 일', '이번 주 등산객들이 가장 많이 획득한 배지', NULL,
  ARRAY[
    (SELECT id FROM public.badges WHERE name = '야생의 첫발' AND type = 'activity' AND rarity = 'legendary' LIMIT 1)
  ]::uuid[],
  NULL, NULL, '북한산', NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 83, TRUE);

-- 84: 바로가기형
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('location_trend', 'shortcut', '한강 라이더들의 오늘', '''이달의 그란폰도'' 획득 소식이 늘고 있어요', NULL,
  ARRAY[(SELECT id FROM public.badges WHERE name = '이달의 그란폰도' AND type = 'activity' AND rarity = 'legendary' LIMIT 1)]::uuid[],
  NULL, NULL, '한강', NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 84, TRUE);

-- ================= drop_alert (3) — 가변보상/습관형성 =================

-- 85: 큰 썸네일형 — 가변 보상 심리
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('drop_alert', 'large_thumbnail', '오늘의 드랍은 매번 달라요', '어떤 등급이 나올지는 확인해야 알아요', NULL,
  '{}'::uuid[], NULL, NULL, NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 85, TRUE);

-- 86: 배너형 — 신규 유저 습관 형성 유도
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('drop_alert', 'banner', '매일 확인하는 습관, 오늘부터 시작', '주변 드랍은 매일 바뀌어요 — 하루 한 번 체크해보세요', NULL,
  '{}'::uuid[], NULL, NULL, NULL, NULL, NULL, ARRAY['new_user']::text[], NOW(), '2026-12-30 23:59:59+09', 86, TRUE);

-- 87: 담백형(other)
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('drop_alert', 'other', '빈손으로 지나치지 마세요', '지금 근처에 드랍된 아이템이 있을 수 있어요', NULL,
  '{}'::uuid[], NULL, NULL, NULL, NULL, NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 87, TRUE);

-- ================= editorial_article (2) — 리텐션 내러티브 =================

-- 88: 배너형 — 습관 형성 스토리
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('editorial_article', 'banner', '작심삼일을 이겨낸 사람들', '3일의 벽을 넘은 유저들의 공통점',
  (SELECT image_url FROM public.badges WHERE name = '작심삼일의 파괴자' AND type = 'activity' AND rarity = 'legendary' LIMIT 1),
  '{}'::uuid[], NULL, NULL, NULL,
  '가장 많이 포기하는 시점은 이틀째와 사흘째 사이라고 합니다. 처음 시작할 때의 의욕은 크지만, 그 의욕이 눈에 보이는 결과로 바뀌기 전에 대부분 멈춰버리기 때문입니다.

JAM! 안에서 ''작심삼일의 파괴자'' 배지를 받은 유저들의 활동 기록을 살펴보면 공통점이 하나 있었습니다. 첫 3일 동안 아주 짧게라도 매일 활동을 기록했다는 것입니다. 거리나 속도보다 ''오늘도 켰다''는 사실 자체를 지킨 셈입니다.

거창한 목표보다 작은 반복이 먼저라는 이야기, 어쩌면 뻔하지만 여전히 유효한 이야기입니다.',
  NULL, ARRAY['all']::text[], NOW(), '2026-12-30 23:59:59+09', 88, TRUE);

-- 89: 담백형(other) — 짧은 습관 스토리
INSERT INTO public.today_cards (template_type, layout_type, title, subtitle, cover_image_url, badge_ids, mission_id, item_book_id, region_label, body_markdown, target_href, exposure_tags, starts_at, ends_at, sort_order, is_active)
VALUES ('editorial_article', 'other', '매일 3분이면 충분했다', '짧은 습관이 만든 변화',
  NULL, '{}'::uuid[], NULL, NULL, NULL,
  '거창하게 시작한 계획은 오래가지 못하는 경우가 많습니다. 반대로 ''오늘은 3분만''이라고 정하고 시작한 사람들이 오히려 몇 주씩 꾸준히 이어가는 모습을 종종 보게 됩니다.

미션 하나를 채우는 데 걸리는 시간은 생각보다 길지 않습니다. 다만 그 며칠을 잇는 게 관건입니다. 오늘 짧게라도 기록을 남겨보는 건 어떨까요.',
  NULL, ARRAY['has_ending_soon_mission']::text[], NOW(), '2026-12-30 23:59:59+09', 89, TRUE);

-- 확인용:
-- SELECT sort_order, template_type, layout_type, title FROM public.today_cards WHERE sort_order >= 70 ORDER BY sort_order;
