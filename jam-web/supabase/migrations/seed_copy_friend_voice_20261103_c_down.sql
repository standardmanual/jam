-- 카피 고쳐 쓰기 3차 되돌림
-- 티켓 20261103_1152: 조건을 요약한 제목(숫자+단위, 행동 이름으로 끝남)을 장면이 보이는 제목으로 바꾼다(사용자 지시 2026-11-03). 대표 이미지 속 글자는 다시 만들지 않는다(사용자 결정). 앞선 seed_copy_friend_voice_20261103_b.sql 다음에 실행한다. 3차 실행 전의 제목으로 되돌린다.
do $$
declare n int;
begin
  update today_cards set title = '새 역 체크인 2곳' where id = '741d421c-6b16-4709-b2ed-7deaa4a28064' and title = '지하철 역에서 만나는 행운';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'today_cards.title 741d421c-6b16-4709-b2ed-7deaa4a28064 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update today_cards set title = '겨울 앞두고 걷기 3번' where id = '4e3d6299-f314-453e-b975-7580e3f2837b' and title = '쌀쌀한 날의 짧은 산책';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'today_cards.title 4e3d6299-f314-453e-b975-7580e3f2837b 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update today_cards set title = '이번 주 산 체크인 한 곳' where id = '391b8638-5bee-4797-af59-3b243f05c5d5' and title = '처음 오른 산에서의 한 걸음';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'today_cards.title 391b8638-5bee-4797-af59-3b243f05c5d5 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update today_cards set title = '입동 주간, 새 장소 체크인' where id = '18a6efa0-cd8b-4534-823f-d86ac81d6d0b' and title = '입동 주간, 처음 가는 곳으로';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'today_cards.title 18a6efa0-cd8b-4534-823f-d86ac81d6d0b 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update missions set title = '새 역 체크인 2곳' where id = '0766b21d-b1e8-419e-ae77-5002ce9b08a3' and title = '지하철 역에서 만나는 행운';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'missions.title 0766b21d-b1e8-419e-ae77-5002ce9b08a3 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update missions set title = '겨울 앞두고 걷기 3번' where id = '662960dd-6506-4690-871b-8ab1e476622c' and title = '쌀쌀한 날의 짧은 산책';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'missions.title 662960dd-6506-4690-871b-8ab1e476622c 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update missions set title = '걸어서 10km' where id = '492d7cc8-e9c3-47e7-8c80-5f3a601b758a' and title = '걷다 보면 어느새 10km';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'missions.title 492d7cc8-e9c3-47e7-8c80-5f3a601b758a 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update missions set title = '산 체크인 한 곳' where id = '2998a5bd-87f0-4351-a34a-b15afcc3f4a2' and title = '처음 오른 산에서의 한 걸음';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'missions.title 2998a5bd-87f0-4351-a34a-b15afcc3f4a2 현재 값이 예상과 다르다(갱신 %건)', n; end if;
end $$;
