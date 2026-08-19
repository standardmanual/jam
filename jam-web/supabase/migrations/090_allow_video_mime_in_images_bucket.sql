-- 티켓 20260819_012: 애니메이션 배경 — images 버킷에 video/mp4 허용
--
-- 배경 제너레이터 애니메이션 모드가 구운 반복 재생 MP4는 기존 이미지와 같은 'images' 버킷에
-- 올라간다(upload-image 라우트 공용). 그런데 이 버킷은 대시보드에서 생성돼
-- allowed_mime_types가 이미지 MIME 6종으로 잠겨 있어, MP4 업로드가 Storage 단에서 거부된다.
-- (API 검증은 통과하는데 Storage가 막아 500이 나므로 애니메이션 배경 기능 전체가 동작하지 않는다.)
--
-- 조치: allowed_mime_types에 'video/mp4' 한 종류만 추가한다.
--   - 유저단은 <video>로 재생만 하고 iOS Safari 호환이 필수라 H.264 MP4 외 포맷은 쓰지 않는다.
--   - WebM 등 다른 영상 MIME은 허용하지 않는다(허용 범위를 필요한 만큼만 넓힌다).
--
-- file_size_limit은 5MB 그대로 둔다:
--   실측 결과물이 최대 473KB(430x860 / H.264 Main@3.1 / 15fps / 2.0초)라 5MB로 충분하고,
--   API 쪽 영상 상한도 이 값에 맞춰 5MB로 낮춰 정합을 맞췄다
--   (jam-web/src/app/api/admin/upload-image/route.ts MAX_VIDEO_SIZE).

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'video/mp4')
WHERE id = 'images'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('video/mp4' = ANY(allowed_mime_types));

-- 적용 확인용 (실행 후 allowed_mime_types에 video/mp4가 포함되고 file_size_limit이 5242880인지 확인)
-- SELECT id, allowed_mime_types, file_size_limit FROM storage.buckets WHERE id = 'images';
