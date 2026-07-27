-- ============================================================
-- Migration 062: common 아이템 배지를 그대로 복제해 rare/legendary/mythic 재생성
--
-- 061에서 지운 rare/legendary/mythic 아이템 배지를 다시 만든다. 이번엔 055처럼
-- 세력별 접두어로 이름/설명을 바꾸지 않고, common 원본의 이름·설명·이미지·
-- 활동타입·드랍가중치·유효기간·포인트 보상 등 전 필드를 그대로 복제한다
-- (등급만 다름). item_book_id는 의도적으로 NULL — 아이템북은 common 9개로만
-- 구성하기로 한 결정(059)을 유지하고, faction_id만 복사해 조합 엔진의
-- "다른 세계관" 판정에 쓰인다.
-- ============================================================

INSERT INTO public.badges (
  name, description, type, rarity, image_url, condition_json, activity_types,
  patch_available, patch_price_krw, is_wandering, faction_id, item_book_id,
  drop_weight, drop_condition_json, valid_from, valid_until, point_reward
)
SELECT
  name, description, type, 'rare'::badge_rarity, image_url, condition_json, activity_types,
  patch_available, patch_price_krw, is_wandering, faction_id, NULL,
  drop_weight, drop_condition_json, valid_from, valid_until, point_reward
FROM public.badges
WHERE type = 'item' AND rarity = 'common' AND deleted_at IS NULL

UNION ALL

SELECT
  name, description, type, 'legendary'::badge_rarity, image_url, condition_json, activity_types,
  patch_available, patch_price_krw, is_wandering, faction_id, NULL,
  drop_weight, drop_condition_json, valid_from, valid_until, point_reward
FROM public.badges
WHERE type = 'item' AND rarity = 'common' AND deleted_at IS NULL

UNION ALL

SELECT
  name, description, type, 'mythic'::badge_rarity, image_url, condition_json, activity_types,
  patch_available, patch_price_krw, is_wandering, faction_id, NULL,
  drop_weight, drop_condition_json, valid_from, valid_until, point_reward
FROM public.badges
WHERE type = 'item' AND rarity = 'common' AND deleted_at IS NULL;

-- 검증: SELECT rarity, count(*) FROM badges WHERE type='item' GROUP BY rarity;
