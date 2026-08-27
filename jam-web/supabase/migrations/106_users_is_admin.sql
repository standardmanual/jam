-- 티켓 20260827_015: 어드민 권한 부여 메뉴
-- 기존 ADMIN_EMAILS 환경변수 화이트리스트와 OR 조건으로 병행하는 DB 컬럼을 추가한다.
-- 기존 화이트리스트 계정은 OR 조건 덕분에 별도 마이그레이션 없이 그대로 접근이 유지된다.

alter table public.users
  add column if not exists is_admin boolean not null default false;

comment on column public.users.is_admin is
  '어드민 권한 부여 여부. ADMIN_EMAILS 환경변수 화이트리스트와 OR 조건으로 판정한다 (20260827_015).';
