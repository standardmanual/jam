-- «남은 재료 저녁상» 5개 종목 계열의 이름을 종목별로 나눈다
-- 티켓 20261118_1335: 같은 이름을 5개 종목 계열(family_key *:J3-2)이 함께 쓰고 있었다. 종목별 이름으로 바꾼다.
-- 바뀌는 행: 20행(종목 5 × 등급 4). 이름 칸만 바꾸고 종목·등급·조건·설명·이미지는 그대로다.
-- 건수가 다르면 예외로 전부 되돌아간다. 되돌림은 seed_badge_name_split_j3_2_20261118_down.sql.
do $$
declare n int; total int := 0;
begin
  -- 걷기
  update public.badges set name = '파장의 골목' where family_key = 'walking:J3-2' and type = 'activity' and deleted_at is null and name = '남은 재료 저녁상';
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'walking:J3-2 갱신이 4건이어야 하는데 %건이다', n; end if;
  total := total + n;
  -- 달리기
  update public.badges set name = '닫히기 전의 셔터' where family_key = 'running:J3-2' and type = 'activity' and deleted_at is null and name = '남은 재료 저녁상';
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'running:J3-2 갱신이 4건이어야 하는데 %건이다', n; end if;
  total := total + n;
  -- 자전거
  update public.badges set name = '상자 실은 바퀴' where family_key = 'cycling:J3-2' and type = 'activity' and deleted_at is null and name = '남은 재료 저녁상';
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'cycling:J3-2 갱신이 4건이어야 하는데 %건이다', n; end if;
  total := total + n;
  -- 트레일러닝
  update public.badges set name = '냄비 불빛 능선' where family_key = 'trail_running:J3-2' and type = 'activity' and deleted_at is null and name = '남은 재료 저녁상';
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'trail_running:J3-2 갱신이 4건이어야 하는데 %건이다', n; end if;
  total := total + n;
  -- 하이킹
  update public.badges set name = '반쪽 두부 고개' where family_key = 'hiking:J3-2' and type = 'activity' and deleted_at is null and name = '남은 재료 저녁상';
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'hiking:J3-2 갱신이 4건이어야 하는데 %건이다', n; end if;
  total := total + n;
  if total <> 20 then raise exception '합계가 20건이어야 하는데 %건이다', total; end if;
end $$;
