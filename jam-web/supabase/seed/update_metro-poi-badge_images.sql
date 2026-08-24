-- 지하철역 POI 배지 이미지(JAM METRO 디자인) 반영
-- scripts/badge-image-gen/generate.js metro-poi-badge 실행 결과
UPDATE public.badges b
SET image_url = '/badges/poi/metro/' || b.id || '.png'
FROM public.poi p
WHERE p.linked_badge_id = b.id
  AND p.category = 'transit'
  AND p.name LIKE '%역'
  AND b.deleted_at IS NULL;
