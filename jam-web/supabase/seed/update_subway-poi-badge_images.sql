-- 지하철역 POI 배지 이미지 반영 (scripts/badge-image-gen/generate.js subway-poi-badge 실행 결과)
UPDATE public.badges
SET image_url = '/badges/poi/transit/' || id || '.png'
WHERE id IN (
  SELECT linked_badge_id FROM public.poi
  WHERE category = 'transit' AND linked_badge_id IS NOT NULL
);
