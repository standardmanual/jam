-- 지하철역/버스정류장 등 대중교통 POI 배지 이미지(JAM METRO 디자인) 반영
-- scripts/badge-image-gen/generate.js metro-poi-badge 실행 결과
UPDATE public.badges b
SET image_url = '/badges/poi/metro/' || b.id || '.png'
FROM public.poi p
WHERE p.linked_badge_id = b.id
  AND p.category IN ('train_subway', 'transit')
  AND b.deleted_at IS NULL;
