-- Migration 028: 019_seed_worldview.sql의 아이템북 100개 일괄 활성화
--
-- [배경]
--   019에서 모든 아이템북이 is_active = false로 시드됨
--   ("어드민이 이미지/설정 확인 후 개별 활성화" 의도)
--
-- [문제]
--   - 드랍 엔진이 is_active를 미체크 → 비활성 아이템북 배지가 드랍됨
--   - 유저 아이템북 API는 is_active = true만 표시 → 배지를 받아도 아이템북이 안 보임
--
-- [수정]
--   100개 아이템북 전체를 is_active = true로 변경
--   이후 드랍 엔진은 is_active = true인 아이템북의 배지만 드랍 풀에 포함 (코드 수정)
--   신규 아이템북은 어드민에서 개별 활성화 후 드랍 풀에 진입

UPDATE public.item_books
SET is_active = true
WHERE is_active = false;

-- 검증 쿼리:
-- SELECT COUNT(*) FROM public.item_books WHERE is_active = false;
-- → 0 이면 정상
