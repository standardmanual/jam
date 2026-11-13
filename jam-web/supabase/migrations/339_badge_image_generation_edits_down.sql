-- 되돌림: 후처리 기록 칸 4개 제거 (티켓 20261113_1332)
begin;
alter table public.badge_image_generations drop constraint if exists badge_image_generations_kind_check;
alter table public.badge_image_generations
  drop column if exists edit_plan,
  drop column if exists edit_instruction,
  drop column if exists parent_generation_id,
  drop column if exists kind;
commit;
