-- 되돌림: 형태 묘사 칸 제거 (티켓 20261113_1145)
alter table public.badges drop column if exists form_description;
