-- seed_invalidate_orphaned_poi_drops.sql
-- 티켓 20260906_2217 후속 신고("픽업 안됨") 조사 중 발견한 별개 결함의 1회성 수정.
--
-- 2026-08-29 "개체 정체성 모델" 마이그레이션(poi_drops.inventory_item_id로 아이템
-- 소유권 이전을 관리하도록 개편) 당시 백필이 이 마이그레이션 이전(2026-08-27~28)에
-- 생성된 활성 드랍 2건을 놓쳤다. inventory_item_id가 계속 NULL로 남아, pickup_drop()
-- RPC의 방어 분기("이론상 도달하지 않아야 함")에 걸려 픽업 시도가 전부 item_not_found
-- (404)로 실패했다. 애초에 건네줄 아이템 개체가 연결된 적이 없어 복구 불가능한
-- 드랍이므로, 지도·픽업 목록에서 사라지도록 무효화한다(사용자 확인 후 실행, 2026-09-06).
--
-- 실행 결과: 2건 모두 is_available = false로 전환 확인.

UPDATE public.poi_drops
SET is_available = false
WHERE id IN ('858a70bd-b51e-454e-a95b-9aba61581c05', 'fa4c4c34-ee46-447a-b809-7c83ad7ebe03')
  AND is_available = true
  AND inventory_item_id IS NULL;
