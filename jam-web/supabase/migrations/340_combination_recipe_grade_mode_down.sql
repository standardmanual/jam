-- 340 되돌림: 레시피 유형·첫 성공자 보상 칸과 지급 함수 제거 (티켓 20261114_1705 1회차)
-- 순서: ① 341로 합친 레시피를 먼저 되돌린다(341_merge_recipes_grade_follow_down.sql) ② 새 칸을 읽는 코드를 되돌린다 ③ 이 파일을 적용한다.
-- 코드가 먼저 남아 있으면 combine_grant_first_success 호출이 실패하고(첫 성공자 보상 미지급, 믹스 응답은 그대로) 새 칸 조회가 깨진다.
-- 첫 성공자 보상으로 이미 지급된 배지와 받지 않은 결과는 그대로 남는다.
DROP FUNCTION IF EXISTS public.combine_grant_first_success(uuid, uuid, uuid, boolean, boolean);
ALTER TABLE public.combination_recipes DROP CONSTRAINT IF EXISTS combination_recipes_grade_mode_check;
ALTER TABLE public.combination_recipes DROP COLUMN IF EXISTS first_success_badge_id;
ALTER TABLE public.combination_recipes DROP COLUMN IF EXISTS grade_mode;
