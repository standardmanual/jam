-- 이미지 생성기 후처리(편집) 기록 칸 추가 (티켓 20261113_1332) — 확장 단계
-- 편집 결과도 생성 기록 한 줄로 남겨 기존 적용·되돌리기·이력 흐름을 쓴다. 기존 행은 kind='generate'.
begin;
alter table public.badge_image_generations
  add column if not exists kind text not null default 'generate',
  add column if not exists parent_generation_id uuid references public.badge_image_generations(id) on delete set null,
  add column if not exists edit_instruction text,
  add column if not exists edit_plan jsonb;
alter table public.badge_image_generations
  add constraint badge_image_generations_kind_check check (kind in ('generate', 'edit'));
comment on column public.badge_image_generations.kind is 'generate=Recraft 생성, edit=후처리 편집 결과';
comment on column public.badge_image_generations.parent_generation_id is '편집의 원본 생성 기록';
comment on column public.badge_image_generations.edit_instruction is '운영자가 적은 후처리 요청 원문';
comment on column public.badge_image_generations.edit_plan is 'Claude가 고른 편집 계획(API 키 없음)';
commit;
