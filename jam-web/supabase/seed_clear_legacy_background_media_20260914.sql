-- ============================================================
-- 레거시 배경 이미지·영상 일괄 삭제 (2026-09-14, 티켓 20260914_1930)
--
-- 배경: 2026-09-01(티켓 20260901_1929)에 배경 패턴/애니메이션 제너레이터 저작 UI가
-- 제거됐다. 그 전에 이미 구워둔 background_image_url/background_video_url 값은
-- "다시 만들 수 없는 데이터"라 삭제하지 않고 보존해왔고, 상세화면은 계속 이 값을
-- 렌더링해왔다(badgeBackgroundTheme.ts, 변경 없음).
--
-- 사용자가 이 레거시 데이터를 전부 삭제하기로 명시적으로 결정(93개 행 확인 후 승인).
-- background_color/background_animation은 건드리지 않는다 — 이미지·영상 두 필드만 NULL 처리.
-- ============================================================

UPDATE public.badges
SET background_image_url = NULL, background_video_url = NULL
WHERE background_image_url IS NOT NULL OR background_video_url IS NOT NULL;

UPDATE public.item_books
SET background_image_url = NULL, background_video_url = NULL
WHERE background_image_url IS NOT NULL OR background_video_url IS NOT NULL;

UPDATE public.tribes
SET background_image_url = NULL, background_video_url = NULL
WHERE background_image_url IS NOT NULL OR background_video_url IS NOT NULL;
