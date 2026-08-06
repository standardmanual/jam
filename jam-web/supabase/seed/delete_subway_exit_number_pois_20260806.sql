-- 지하철역 'N번출구' 형식 POI/배지 삭제 (2026-08-06)
-- 대상: category='transit', name이 '[0-9]+번출구'로 끝나는 POI 26개 (연결된 배지 22개)
-- 이 파일은 이미 service_role 키로 직접 실행된 변경사항의 재현/기록용 SQL이다 (feedback-direct-sql-deploy 규칙).
--
-- 실행 전 확인된 영향 범위:
--   - user_poi_badge_earns: 12건 (poi_id/badge_id 모두 ON DELETE CASCADE로 함께 삭제됨)
--   - user_activity_badges: 5건 (badge_id가 ON DELETE NO ACTION이라 명시적으로 먼저 삭제 필요)
--   - poi_drops: 1건 (poi_id CASCADE로 함께 삭제됨)
--   - inventory_items: 위 poi_drops 1건에 걸린 무관한 아이템("에어로 프레임 데칼") 1건 —
--     아이템 자체는 유지하고 출처 링크(drop_id)만 NULL 처리 후 진행
--   - combination_recipes / item_books / user_item_book_slots / wandering_mythic_state /
--     poi_blocks / point_transactions: 참조 없음(0건) 확인

CREATE TEMP TABLE target_exit_pois AS
SELECT id as poi_id, linked_badge_id
FROM public.poi
WHERE category = 'transit' AND name ~ '[0-9]+번출구$';

-- 무관한 인벤토리 아이템의 출처(drop_id)만 끊는다 (아이템 자체는 유저가 그대로 보유)
UPDATE public.inventory_items
SET drop_id = NULL
WHERE drop_id IN (
  SELECT id FROM public.poi_drops WHERE poi_id IN (SELECT poi_id FROM target_exit_pois)
);

DELETE FROM public.user_activity_badges
WHERE badge_id IN (SELECT linked_badge_id FROM target_exit_pois WHERE linked_badge_id IS NOT NULL);

DELETE FROM public.poi
WHERE id IN (SELECT poi_id FROM target_exit_pois);

DELETE FROM public.badges
WHERE id IN (SELECT linked_badge_id FROM target_exit_pois WHERE linked_badge_id IS NOT NULL);
