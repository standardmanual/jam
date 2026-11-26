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
