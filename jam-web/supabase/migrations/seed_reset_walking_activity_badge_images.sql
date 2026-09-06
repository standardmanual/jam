-- 어드민 "액티비티 배지 이미지 생성" 화면에서 걷기(walking) 액티비티 배지 220건의
-- 생성 상태를 초기화한다. image_url·image_gen_params를 NULL로 되돌려 화면상 "없음"
-- 상태로 만들고, 재생성 시 저장된 저작 파라미터(배경 blob 애니메이션 등)를 복원하지 않고
-- 신규로 취급하게 한다.
--
-- 실행일: 2026-09-06, 사용자 요청으로 supabase-js 스크립트를 통해 직접 실행함
-- (DB 컬럼 리셋 + Storage 버킷 images/badges/activity/{id}.png 파일까지 완전 삭제).
-- 이 파일은 실행된 동작의 기록용이며, 재실행해도 같은 결과를 낸다(Storage 파일 삭제는
-- 이 SQL에 포함되지 않으므로 재실행 시 컬럼만 다시 초기화된다).

UPDATE badges
SET image_url = NULL, image_gen_params = NULL
WHERE type = 'activity' AND activity_types @> ARRAY['walking'];
