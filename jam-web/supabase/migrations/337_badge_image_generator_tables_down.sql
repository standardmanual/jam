-- 337 되돌림: 새 표 세 개만 지운다(기존 표 무변경). 자식 → 부모 순서.
drop table if exists public.badge_image_generations;
drop table if exists public.badge_image_item_prompts;
drop table if exists public.badge_image_presets;
