-- 종목별로 나눈 J3-2 계열 이름을 «남은 재료 저녁상»으로 되돌린다
-- 티켓 20261118_1335: 20행. 건수가 다르면 예외로 전부 되돌아간다.
do $$
declare n int; total int := 0;
begin
  -- 걷기
  update public.badges set name = '남은 재료 저녁상' where family_key = 'walking:J3-2' and type = 'activity' and deleted_at is null and name = '파장의 골목';
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'walking:J3-2 갱신이 4건이어야 하는데 %건이다', n; end if;
  total := total + n;
  -- 달리기
  update public.badges set name = '남은 재료 저녁상' where family_key = 'running:J3-2' and type = 'activity' and deleted_at is null and name = '닫히기 전의 셔터';
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'running:J3-2 갱신이 4건이어야 하는데 %건이다', n; end if;
  total := total + n;
  -- 자전거
  update public.badges set name = '남은 재료 저녁상' where family_key = 'cycling:J3-2' and type = 'activity' and deleted_at is null and name = '상자 실은 바퀴';
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'cycling:J3-2 갱신이 4건이어야 하는데 %건이다', n; end if;
  total := total + n;
  -- 트레일러닝
  update public.badges set name = '남은 재료 저녁상' where family_key = 'trail_running:J3-2' and type = 'activity' and deleted_at is null and name = '냄비 불빛 능선';
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'trail_running:J3-2 갱신이 4건이어야 하는데 %건이다', n; end if;
  total := total + n;
  -- 하이킹
  update public.badges set name = '남은 재료 저녁상' where family_key = 'hiking:J3-2' and type = 'activity' and deleted_at is null and name = '반쪽 두부 고개';
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'hiking:J3-2 갱신이 4건이어야 하는데 %건이다', n; end if;
  total := total + n;
  if total <> 20 then raise exception '합계가 20건이어야 하는데 %건이다', total; end if;
end $$;
