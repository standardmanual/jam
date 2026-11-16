-- 읽히지 않는 배지 이름·설명 고쳐 쓰기: 실제 실행 기록
-- 티켓 20261116_1250. 2026-11-16(KST) 카리나가 Supabase MCP로 실행했다.
--
-- seed_badge_copy_readability_20261116.sql은 약 120KB라서 MCP 호출 한 번에 그대로 넣지 않았다.
-- 대신 같은 대응표(jam-web/scripts/jam2-content/badge-copy-fix-20261116.json)의 값을 아래 백업 표에 먼저 담고,
-- 그 표를 읽는 블록 하나로 같은 행을 같은 조건(id와 기존 값)으로 고쳤다. 바뀐 행은 이름 81행, 설명 148행이다.
--
-- 순서
--   1. 아래 [1]로 백업 표를 만들었다.
--   2. 대응표의 names[].ids·descriptions[].ids를 풀어 229행(이름 81, 설명 148)을 supabase-js(service_role)로 넣고,
--      넣은 값이 대응표와 한 글자도 다르지 않은지 다시 읽어 확인했다.
--   3. [2]의 블록 끝에 일부러 예외를 붙여 실행하는 롤백 실측을 했다. 예외 문구에 81행·148행이 찍혔고,
--      실행 뒤 배지 표가 그대로인 것을 확인했다.
--   4. [2]를 실행했다. 실행 뒤 이름 81행과 설명 148행이 새 값이고 옛 값이 남은 행은 0건이었다.
--
-- 되돌림: seed_badge_copy_readability_20261116_down.sql 또는 맨 아래 [3]을 쓴다.
-- 백업 표는 복구할 일이 없다고 확인한 뒤 삭제한다(drop table public.badge_copy_backup_20261116).

-- [1] 백업 표
create table public.badge_copy_backup_20261116 (
  badge_id uuid not null,
  field text not null check (field in ('name', 'description')),
  old_value text not null,
  new_value text not null,
  backed_up_at timestamptz not null default now(),
  primary key (badge_id, field)
);
comment on table public.badge_copy_backup_20261116 is '티켓 20261116_1250: 읽히지 않는 배지 이름·설명을 고치기 전 값(old_value)과 바꾼 값(new_value). 복구 확인 뒤 삭제한다.';
alter table public.badge_copy_backup_20261116 enable row level security;
revoke all on public.badge_copy_backup_20261116 from anon, authenticated;

-- [2] 반영
do $$
declare n_name int; n_desc int;
begin
  update public.badges b set name = k.new_value
    from public.badge_copy_backup_20261116 k
    where k.field = 'name' and b.id = k.badge_id and b.name = k.old_value;
  get diagnostics n_name = row_count;
  update public.badges b set description = k.new_value
    from public.badge_copy_backup_20261116 k
    where k.field = 'description' and b.id = k.badge_id and b.description = k.old_value;
  get diagnostics n_desc = row_count;
  if n_name <> 81 or n_desc <> 148 then
    raise exception '건수 불일치: 이름 % (기대 81), 설명 % (기대 148)', n_name, n_desc;
  end if;
end $$;

-- [3] 되돌림 (실행하지 않았다. 필요할 때만 쓴다)
-- do $$
-- declare n_name int; n_desc int;
-- begin
--   update public.badges b set name = k.old_value
--     from public.badge_copy_backup_20261116 k
--     where k.field = 'name' and b.id = k.badge_id and b.name = k.new_value;
--   get diagnostics n_name = row_count;
--   update public.badges b set description = k.old_value
--     from public.badge_copy_backup_20261116 k
--     where k.field = 'description' and b.id = k.badge_id and b.description = k.new_value;
--   get diagnostics n_desc = row_count;
--   if n_name <> 81 or n_desc <> 148 then
--     raise exception '건수 불일치: 이름 % (기대 81), 설명 % (기대 148)', n_name, n_desc;
--   end if;
-- end $$;
