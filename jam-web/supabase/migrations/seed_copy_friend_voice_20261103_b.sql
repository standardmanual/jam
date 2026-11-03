-- 카피 고쳐 쓰기 2차(윈터 톤 확인 반영)
-- 티켓 20261103_1152: 윈터 톤 확인(2026-11-03) 반영. 앞선 seed_copy_friend_voice_20261103.sql 다음에 실행한다. 되돌림은 seed_copy_friend_voice_20261103_b_down.sql.
do $$
declare n int;
begin
  update today_cards set description = '활동하다가 처음 가는 역 두 곳을 지나가면 20포인트를 획득해요.' where id = '741d421c-6b16-4709-b2ed-7deaa4a28064' and description = '활동 길에 처음 가는 역 두 곳을 지나가면 20포인트를 획득해요.';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'today_cards.description 741d421c-6b16-4709-b2ed-7deaa4a28064 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update today_cards set description = '요즘은 산, 편의점, 마트, 관공서에서 아이템 배지를 많이 획득해요.' where id = '4c7902e5-f082-4ab4-8eb6-1f7ee28bb05d' and description = '요즘은 산, 편의점, 마트, 관공서에 아이템 배지가 많이 떨어져 있어요.';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'today_cards.description 4c7902e5-f082-4ab4-8eb6-1f7ee28bb05d 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update today_cards set description = '날이 쌀쌀해진 요즘 10분 이상 걷고 동기화를 3번 하면 10포인트를 획득해요.' where id = '4e3d6299-f314-453e-b975-7580e3f2837b' and description = '쌀쌀해지기 전에 10분 이상 걷고 동기화를 3번 하면 10포인트를 획득해요.';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'today_cards.description 4e3d6299-f314-453e-b975-7580e3f2837b 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update today_cards set title = '인벤토리가 꽉 찼다면 하나 드랍하고 가요' where id = '464a990c-11bb-4d4f-b7fa-8a183f5e62ed' and title = '인벤토리가 꽉 찼다면 하나 놓고 가요';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'today_cards.title 464a990c-11bb-4d4f-b7fa-8a183f5e62ed 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update today_cards set title = '드랍하고, 픽업하고, 이어가기' where id = '626c1e62-1726-4b4c-a0e6-235f952e9b85' and title = '놓고, 줍고, 이어가기';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'today_cards.title 626c1e62-1726-4b4c-a0e6-235f952e9b85 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update today_cards set description = '아이템 배지를 한 번 드랍하고 한 번 픽업한 뒤 동기화하면 10포인트를 획득해요.' where id = '626c1e62-1726-4b4c-a0e6-235f952e9b85' and description = '아이템 배지를 드랍하고 다른 사람이 놓은 배지를 픽업한 뒤 동기화하면 10포인트를 획득해요.';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'today_cards.description 626c1e62-1726-4b4c-a0e6-235f952e9b85 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update today_cards set description = '겨울로 넘어가는 날이에요. 새 역 2곳과 새 산 1곳에 체크인하면 포인트를 획득해요.' where id = '0bc05266-8632-45d8-9937-d14092c60808' and description = '겨울이 시작되는 날이에요. 새 역 2곳과 새 산 1곳에 체크인하면 포인트를 획득해요.';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'today_cards.description 0bc05266-8632-45d8-9937-d14092c60808 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update today_cards set description = '이번 주에 처음 가는 산 한 곳을 지나가면 20포인트를 획득해요.' where id = '391b8638-5bee-4797-af59-3b243f05c5d5' and description = '활동 길에 처음 가는 산 한 곳을 지나가면 20포인트를 획득해요.';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'today_cards.description 391b8638-5bee-4797-af59-3b243f05c5d5 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update missions set description = '날이 쌀쌀해진 요즘 10분 이상 걷고 동기화해 봐요. 3번이면 10포인트를 획득해요.' where id = '662960dd-6506-4690-871b-8ab1e476622c' and description = '쌀쌀해지기 전에 10분 이상 걷고 동기화해 봐요. 3번이면 10포인트를 획득해요.';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'missions.description 662960dd-6506-4690-871b-8ab1e476622c 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update missions set title = '드랍하고, 픽업하고, 이어가기' where id = 'e66f802f-dd8c-4d4f-97f2-3cd1cec2a3cf' and title = '놓고, 줍고, 이어가기';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'missions.title e66f802f-dd8c-4d4f-97f2-3cd1cec2a3cf 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update missions set description = '아이템 배지를 한 번 드랍하고 한 번 픽업한 뒤 동기화하면 10포인트를 획득해요.' where id = 'e66f802f-dd8c-4d4f-97f2-3cd1cec2a3cf' and description = '아이템 배지를 드랍하고 다른 사람이 놓은 배지를 픽업한 뒤 동기화하면 10포인트를 획득해요.';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'missions.description e66f802f-dd8c-4d4f-97f2-3cd1cec2a3cf 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update missions set description = '활동하다가 처음 가는 역 두 곳을 지나가 봐요. 새 체크인 배지 2개를 획득하면 20포인트를 받아요.' where id = '0766b21d-b1e8-419e-ae77-5002ce9b08a3' and description = '활동 길에 처음 가는 역 두 곳을 지나가 봐요. 새 체크인 배지 2개를 획득하면 20포인트를 받아요.';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'missions.description 0766b21d-b1e8-419e-ae77-5002ce9b08a3 현재 값이 예상과 다르다(갱신 %건)', n; end if;
  update missions set description = '활동하다가 처음 가는 산 한 곳을 지나가기만 해도 20포인트를 획득해요.' where id = '2998a5bd-87f0-4351-a34a-b15afcc3f4a2' and description = '활동 길에 처음 가는 산 한 곳을 지나가기만 해도 20포인트를 획득해요.';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'missions.description 2998a5bd-87f0-4351-a34a-b15afcc3f4a2 현재 값이 예상과 다르다(갱신 %건)', n; end if;
end $$;
