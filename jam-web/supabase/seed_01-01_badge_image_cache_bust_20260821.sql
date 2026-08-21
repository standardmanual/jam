-- 01-01(무명을 쫓는 야식가들) 배지 이미지 재등록 후 흰 배경 표시 이슈 수정 (2026-08-21)
--
-- 원인: badges.image_url 재업로드 시 Supabase Storage 파일 경로를 그대로 재사용(upsert)했더니
-- Vercel Image Optimization(/_next/image) 엣지 캐시가 URL 기준으로 캐싱되어 있어, 콘텐츠가
-- 바뀐 뒤에도 일부 엣지에서 재업로드 이전(투명 처리 전) 이미지를 계속 서빙함(최대 4시간, TTL).
-- 조치: image_url에 ?v=2 캐시버스팅 쿼리스트링을 붙여 Next Image의 캐시 키를 새로 발급받게 함.
-- 향후 동일 경로 재업로드 시 이 문제가 재발하므로, register-badge-images.js에도 버전 쿼리스트링
-- 부여를 고려할 것.

update badges
set image_url = image_url || '?v=2'
where id in (
  '848729b0-9acd-4aac-b0fb-ffd588373a74','dc0664b2-fee2-4be9-bb6b-9c25a0f620c7','d7d3acb9-f990-4ac4-a8ce-98c26bacc72f','7473fb62-7fe3-46eb-8547-009237cd8ada',
  'fd066b1c-acc6-4c03-83ea-bf39610a482c','26b40b5e-e770-41db-afba-dc2ecd98c85e','a651975e-ea66-484a-ac8c-e047ac7d4e33','8e5da719-1286-4913-9742-e7e478f90eab',
  '7748c696-d219-40c9-bfb1-e2ca3c2bf3f8','e5b676da-4b0c-4742-9a0b-319c5cba9722','5ea7fc78-295d-472a-aea6-4b5f1d52e142','c2e631c6-2bfe-4f40-88d9-e110ae590ad6',
  '3fdb8e3f-81bd-4ebb-bf0d-fc4e2201a501','08e5c87c-4bc8-4789-b3d6-3bb01ef790e8','e54acec2-7291-4b59-8ad5-06ad3f797337','d54ab4de-02fc-40fb-8f51-27a842596699',
  'd88c2000-a743-4948-baee-c95d6dd2e7a9','0c6baf10-d13e-4900-aa8c-6b02142a08b4','c89d5c32-4310-43ce-b851-e007dc553785','a3b80af9-73d0-44a0-9128-415dd47a7144',
  'c8f9755b-bc16-4841-8e90-be02932375fb','5fae4fd2-2b77-41e5-b59f-53930c457932','fa64df63-5e2c-40de-b88e-e810e08c9a33','9c332920-5ceb-4315-a522-78d604da975c',
  'fa216981-356e-4506-b1f6-f0121f5d046d','7eae9aeb-7130-4a2e-92bf-74fa71b7275f','f77f6875-4cbd-4fc9-a4f5-58f9afd7e65e','6dc227a7-a52b-4eab-ac21-c8bb1678620c',
  '78857d60-bd5a-426b-8ba0-e0d6ea76fe9b','43dce823-a5c3-49ea-8fe2-b462312a5426','dc5937fc-d5f2-495a-87ea-6340bee438e1','e15ae52b-0817-496e-ac1c-65e38c1246be',
  '052a5fa1-3a25-46db-80d5-99c564de3d03','14177c40-e8cb-490e-a28d-a014b502cb89','2fedddc7-f5df-4967-a552-323124f6f539','8f224ba4-080d-4df3-baff-dfc115c886b8'
) and image_url not like '%?v=%';

update item_books
set image_url = image_url || '?v=2'
where id = '7ecbc840-6167-03a3-95b7-acca945951b1'
  and image_url not like '%?v=%';
