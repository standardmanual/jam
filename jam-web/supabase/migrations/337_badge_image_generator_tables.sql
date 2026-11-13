-- 337: 아이템 배지 이미지 생성기의 프리셋·묘사 문장·생성 이력 표 (티켓 20261113_1130)
-- 확장 단계만. 기존 표는 바꾸지 않는다. 세 표 모두 RLS만 켜고 정책은 없다(서비스 롤 전용).

-- ① 프리셋
create table public.badge_image_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  style_id text not null,
  model text not null default 'recraftv3',
  composition_text text not null,
  forbid_text text not null,
  negative_prompt text not null default '',
  background_color text not null default '#F2F2F2',
  version int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ② 아이템별 묘사 문장 (아이템 = 같은 컬렉션 안 같은 이름의 등급 행 묶음)
create table public.badge_image_item_prompts (
  id uuid primary key default gen_random_uuid(),
  item_book_id uuid not null references public.item_books(id) on delete cascade,
  item_name text not null,
  description_en text not null,
  source_hash text not null,
  source text not null check (source in ('claude', 'manual')),
  updated_at timestamptz not null default now(),
  unique (item_book_id, item_name)
);

-- ③ 생성 이력
create table public.badge_image_generations (
  id uuid primary key default gen_random_uuid(),
  item_book_id uuid not null references public.item_books(id) on delete cascade,
  item_name text not null,
  preset_id uuid references public.badge_image_presets(id) on delete set null,
  preset_version int not null,
  prompt text not null,
  request_json jsonb not null,
  candidate_urls text[] not null default '{}',
  status text not null default 'generated'
    check (status in ('generated', 'applied', 'reverted', 'failed')),
  applied_index int,
  applied_url text,
  previous_image_url text,
  feedback text,
  error text,
  created_by text,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index idx_badge_image_generations_item
  on public.badge_image_generations (item_book_id, item_name, created_at desc);

alter table public.badge_image_presets enable row level security;
alter table public.badge_image_item_prompts enable row level security;
alter table public.badge_image_generations enable row level security;

revoke all on public.badge_image_presets from anon, authenticated;
revoke all on public.badge_image_item_prompts from anon, authenticated;
revoke all on public.badge_image_generations from anon, authenticated;

insert into public.badge_image_presets (name, style_id, composition_text, forbid_text, negative_prompt)
values (
  '기본',
  'SET_ME',
  'A single object (or one compact group of the same object) for a collectible badge, centered, the whole object fully visible with generous empty space around it, seen from a slight three-quarter angle. Clear, simple silhouette that reads at small sizes. Restrained detail, soft even light, plain solid background.',
  'No text of any kind: no letters, numbers, symbols, labels, signs, signatures, logos or letter-like marks. No faces, no eyes, no people, no hands, no extra objects, no glow, no sparkles, no dramatic lighting, no border, no scenery.',
  'text, letters, numbers, digits, symbols, writing, label, signature, logo, watermark, face, eyes, cartoon character, people, hands, multiple objects, cropped, glossy, plastic, sparkles, glow, lens flare, bokeh, dramatic lighting, hyperrealistic, oversaturated, cluttered, ornate, scenery'
);
