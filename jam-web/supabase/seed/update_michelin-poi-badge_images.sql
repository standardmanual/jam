-- 미슐랭 POI 체크인 배지 이미지(JAM MICHELIN 디자인) 반영
-- scripts/badge-image-gen/generate.js michelin-poi-badge 실행 결과
UPDATE public.badges b
SET image_url = '/badges/poi/michelin/' || b.id || '.png'
FROM public.poi p
WHERE p.linked_badge_id = b.id
  AND p.category = 'michelin'
  AND b.deleted_at IS NULL;
