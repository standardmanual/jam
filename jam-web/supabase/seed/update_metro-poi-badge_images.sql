-- 지하철역/버스정류장 등 대중교통 POI 배지 이미지(JAM METRO 디자인) 반영
-- scripts/badge-image-gen/generate.js metro-poi-badge 실행 결과
UPDATE public.badges b
SET image_url = '/badges/poi/metro/' || b.id || '.png'
FROM public.poi p
WHERE p.linked_badge_id = b.id
  AND p.category IN ('train_subway', 'transit')
  AND b.deleted_at IS NULL;

-- 위 UPDATE는 poi.linked_badge_id 조인 기반이라, POI 행 자체가 없는 배지는 대상에서
-- 빠진다. 22개 백필(티켓 20260830_1252) 검증 중 이 케이스로 3개가 누락됨을 발견:
-- 석촌역 9호선(f436ce33), 종로3가역 3호선(d0f87489), 종로3가역 5호선(b57cec38).
-- 이미지 파일은 22개 모두 생성·배포됐으므로 22개 배지 id를 직접 지정해 보정 실행함
-- (2026-08-30, 프로덕션 jam-prod DB에 이미 반영 완료).
UPDATE public.badges
SET image_url = '/badges/poi/metro/' || id || '.png'
WHERE id IN (
  '0ed1c551-baf0-4b2c-91d2-b65f84d70a9e', 'd2d3d6bf-365a-46c7-8172-fdaeb9e5edad',
  '37bba4c1-3984-40d6-a3f0-f8fdfd22c7f2', '1012cd7c-6603-44c9-ac7a-9d93174cb6e8',
  '1d2cb9f7-1430-456e-b3bb-cdc29b649a7e', '25f1983b-bbd3-43ff-8662-9886217bfa0c',
  '946bb972-e7b5-4460-aedf-057ceac50309', '6d8b8aae-ed0d-4e73-9785-b89e8843da35',
  'f436ce33-2d38-48d6-9f95-983cf4ebe7b2', '20781c20-309c-46f3-9e8a-83ff09e05634',
  '45559105-7cf6-4355-a04c-20c915b2403e', 'e5e5841d-03ac-436f-9e4e-f0a9600247cf',
  'ae2cd2a9-8278-423e-b004-e7ee612bfdd3', '7c661953-5a68-4fa2-92be-5260178193a7',
  'd96f2a00-1e5d-41d0-9734-f2ca950e377f', 'c84993c5-b2f7-4b3b-bf52-f16ae01c1417',
  'c410e68d-ebf2-4baa-a180-28f7878d0236', '7dca929b-076c-4ff9-93cb-c44a3459e5dd',
  'd0f87489-0749-45f7-b9ad-2b1c7a200d4a', 'b57cec38-0a92-469f-8402-a3caacadd56a',
  '8dd844fd-c91f-4787-9e80-6abb63e253e6', '40a25e90-06de-4fea-8762-6e0399446b94'
) AND deleted_at IS NULL;
