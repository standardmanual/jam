-- 산 POI 배지 이미지(JAM MOUNTAIN 디자인) 경로 확인용 — 경로가 이전과 동일하므로
-- 실제로는 실행할 필요가 없다 (파일만 교체). 멱등하므로 실행해도 무해하다.
UPDATE public.badges b
SET image_url = '/badges/poi/mountain/' || b.id || '.png'
FROM public.poi p
WHERE p.linked_badge_id = b.id
  AND p.category = 'mountain'
  AND b.deleted_at IS NULL
  AND b.image_url IS DISTINCT FROM '/badges/poi/mountain/' || b.id || '.png';
