-- 티켓 20260909_2157: 유저 jamfather 아이디를 god으로 변경
-- 1회성 데이터 값 변경 (스키마·로직 변경 없음)

update public.users
set username = 'god'
where id = '3649ed39-2be2-402e-82ae-41e0cd328105'
  and username = 'jamfather';
