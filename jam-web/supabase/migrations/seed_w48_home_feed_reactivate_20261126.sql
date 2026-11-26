-- 2026-W48 묶음(weekly-2026-W47-0901)의 홈피드 카드 11장을 다시 활성화하고 종료일을 연장한다.
-- 이미 2026-11-26에 메인 세션이 실행했다. 기록용 파일이다.
-- 종료일: 2026-11-29(일) 자정 = 2026-11-30 00:00 KST (기존 주간 카드의 일요일 종료 관례)

create table if not exists today_cards_backup_20261126 as
select * from today_cards
where id in (
  '0c8a9f80-2872-40b9-adca-4b951cb6369f','821b6d08-9318-4688-8ce4-c78126332dd2',
  '4c18a9fd-0b45-4bf8-b474-a0728545f52a','4c496912-773c-414d-9a02-095eb437214e',
  '4ec62e7d-365e-4bb3-aa21-dcb1968c6a65','b5aaa516-88f0-4e10-b8f2-933a032ec554',
  '3718c6a3-84a0-43d2-b851-15e904b5d10f','06887e41-db88-45bd-8f20-d4bc5e924f08',
  'dc2e4cf4-e3cc-4ed9-82b0-af9e1c863f60','380a4fd0-6159-4c96-8bac-8701b4910a83',
  '33f97f0d-ab4f-4171-aa90-c76988f1a023'
);
alter table today_cards_backup_20261126 enable row level security;

update today_cards
set is_active = true, ends_at = '2026-11-30 00:00:00+09'
where id in (select id from today_cards_backup_20261126);

-- 되돌림 SQL (백업 표 기준)
-- update today_cards t set is_active = b.is_active, ends_at = b.ends_at
--   from today_cards_backup_20261126 b where t.id = b.id;

-- 2차: 어드민 묶음 항목 13건과 미션 2건의 종료일·상태를 카드와 맞춘다 (같은 날 실행).
create table if not exists ops_bundle_items_backup_20261126 as
select i.* from ops_bundle_items i join ops_bundles b on b.id = i.bundle_id where b.week = '2026-W48';
create table if not exists missions_backup_20261126 as
select * from missions where id in ('0d2934a1-0e1a-4ea1-920c-4abd83387ea9','2d1daaca-eb1d-49e4-bd98-d6c4140701e4');
alter table ops_bundle_items_backup_20261126 enable row level security;
alter table missions_backup_20261126 enable row level security;

update missions set ends_at = '2026-11-30 00:00:00+09' where id in (select id from missions_backup_20261126);
update ops_bundle_items set status = 'live', ends_at = '2026-11-30 00:00:00+09', updated_at = now()
where id in (select id from ops_bundle_items_backup_20261126);

-- 되돌림 SQL (2차)
-- update missions m set ends_at = b.ends_at from missions_backup_20261126 b where m.id = b.id;
-- update ops_bundle_items i set status = b.status, ends_at = b.ends_at, updated_at = b.updated_at
--   from ops_bundle_items_backup_20261126 b where i.id = b.id;
