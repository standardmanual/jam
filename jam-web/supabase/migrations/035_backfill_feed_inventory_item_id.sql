-- ============================================================
-- Migration 035: item_dropped 피드 기록에 inventory_item_id 소급 채우기
--
-- 배경 (커밋 59e71a8):
--   드랍엔진의 recordFeedEvent 호출이 inventory_item_id를 metadata에
--   기록하지 않던 결함을 수정했다. 하지만 이 수정 "이전"에 이미 기록된
--   user_activity_feed 행은 여전히 inventory_item_id가 비어있어,
--   홈/프로필의 "레거시 드랍 합성" 로직이 매칭에 실패해 매 렌더링마다
--   중복 항목을 계속 만들어낸다 (예: 같은 아이템이 피드에 2번 표시).
--
-- 방법:
--   같은 (user_id, badge_id) 안에서, 아직 링크되지 않은 item_dropped
--   피드 행들과 아직 어떤 피드 행에도 링크되지 않은 inventory_items(obtained_by='drop')를
--   각각 시간순으로 정렬해 1:1로 짝지어 metadata.inventory_item_id를 채운다.
--   (recordFeedEvent는 INSERT 직후 같은 요청 안에서 호출되므로 시간순 정렬이
--    원래의 생성 순서와 일치한다고 가정)
--
-- 주의: 조합/양도 등으로 개수가 어긋난 극소수 케이스는 매칭이 안 될 수 있으나,
--       그런 경우도 최소한 "기존과 동일하게 중복 표시"일 뿐 악화되지 않는다.
-- ============================================================

BEGIN;

WITH already_linked AS (
  SELECT (metadata->>'inventory_item_id')::uuid AS id
  FROM public.user_activity_feed
  WHERE event_type = 'item_dropped'
    AND metadata->>'inventory_item_id' IS NOT NULL
),
unmatched_feed AS (
  SELECT
    id,
    user_id,
    (metadata->>'badge_id')::uuid AS badge_id,
    ROW_NUMBER() OVER (PARTITION BY user_id, metadata->>'badge_id' ORDER BY event_at) AS rn
  FROM public.user_activity_feed
  WHERE event_type = 'item_dropped'
    AND metadata->>'badge_id' IS NOT NULL
    AND metadata->>'inventory_item_id' IS NULL
),
unmatched_items AS (
  SELECT
    ii.id,
    inv.user_id,
    ii.badge_id,
    ROW_NUMBER() OVER (PARTITION BY inv.user_id, ii.badge_id ORDER BY ii.obtained_at) AS rn
  FROM public.inventory_items ii
  JOIN public.inventory inv ON inv.id = ii.inventory_id
  WHERE ii.obtained_by = 'drop'
    AND ii.id NOT IN (SELECT id FROM already_linked)
)
UPDATE public.user_activity_feed f
SET metadata = f.metadata || jsonb_build_object('inventory_item_id', ui.id::text)
FROM unmatched_feed uf
JOIN unmatched_items ui
  ON ui.user_id = uf.user_id
 AND ui.badge_id = uf.badge_id
 AND ui.rn = uf.rn
WHERE f.id = uf.id;

COMMIT;

-- 검증 쿼리:
-- SELECT count(*) FROM user_activity_feed
--   WHERE event_type = 'item_dropped' AND metadata->>'inventory_item_id' IS NULL;
-- → 남은 개수가 있다면 inventory_items가 이미 삭제/소모(조합 재료 등)된 극소수 케이스

-- ============================================================
-- 동일 결함 — item_picked_up (POI 픽업) 소급 채우기
-- ============================================================

BEGIN;

WITH already_linked_p AS (
  SELECT (metadata->>'poi_drop_id')::uuid AS id
  FROM public.user_activity_feed
  WHERE event_type = 'item_picked_up'
    AND metadata->>'poi_drop_id' IS NOT NULL
),
unmatched_feed_p AS (
  SELECT
    id,
    user_id,
    (metadata->>'badge_id')::uuid AS badge_id,
    ROW_NUMBER() OVER (PARTITION BY user_id, metadata->>'badge_id' ORDER BY event_at) AS rn
  FROM public.user_activity_feed
  WHERE event_type = 'item_picked_up'
    AND metadata->>'badge_id' IS NOT NULL
    AND metadata->>'poi_drop_id' IS NULL
),
unmatched_drops_p AS (
  SELECT
    pd.id,
    pd.picked_up_by AS user_id,
    pd.badge_id,
    ROW_NUMBER() OVER (PARTITION BY pd.picked_up_by, pd.badge_id ORDER BY pd.picked_up_at) AS rn
  FROM public.poi_drops pd
  WHERE pd.picked_up_by IS NOT NULL
    AND pd.picked_up_at IS NOT NULL
    AND pd.id NOT IN (SELECT id FROM already_linked_p)
)
UPDATE public.user_activity_feed f
SET metadata = f.metadata || jsonb_build_object('poi_drop_id', up.id::text)
FROM unmatched_feed_p uf
JOIN unmatched_drops_p up
  ON up.user_id = uf.user_id
 AND up.badge_id = uf.badge_id
 AND up.rn = uf.rn
WHERE f.id = uf.id;

COMMIT;
