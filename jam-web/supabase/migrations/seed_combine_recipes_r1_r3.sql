-- 믹스 레시피 3건 시드 (티켓 20260924_0902)
--
-- 활성 트라이브 3종의 아이템배지로 만든 트라이브 단독 레시피 R1·R2·R3다.
-- 기획: 윈터(재료·결과물·서사), 경제 점검: 혜린(성공 포인트 = 재료 수 × 실패 포인트 10P),
-- 승인: 사용자 2026-09-24. R4(미식가×갱단)는 「황금빛 도토리」 수급 확인 뒤로 보류, R5는 제외했다.
--
-- 재료·결과물은 이름으로 badges를 찾는다(type='item', 삭제되지 않음, 이름당 정확히 1건).
-- 하나라도 0건이거나 2건 이상이면 예외로 전체를 중단한다.
-- 같은 이름의 레시피가 이미 있으면 다시 넣지 않는다(재실행 안전).
--
-- 되돌림(참가 기록이 없는 등록 직후):
--   delete from combination_recipe_slots where recipe_id in
--     (select id from combination_recipes where name in
--       ('무명 트럭의 불맛 흔적','블랙 트랙 입구의 채비','살롱의 장물 시세'));
--   delete from combination_recipes where name in
--     ('무명 트럭의 불맛 흔적','블랙 트랙 입구의 채비','살롱의 장물 시세');

do $$
declare
  r record;
  s record;
  v_recipe_id uuid;
  v_reward uuid;
  v_ids uuid[];
  v_name text;
  v_id uuid;
  v_cnt int;
  v_order int;
  -- 레시피: 이름, 결과물 배지 이름, 성공 포인트, 슬롯(각 슬롯은 후보 배지 이름 배열)
  recipes jsonb := '[
    {"name":"무명 트럭의 불맛 흔적","reward":"반으로 갈라진 나무젓가락","points":30,"slots":[
      ["탄맛 나는 파닭 꼬치","염통 꼬치 막대"],
      ["불향 나는 호일","토치에 그을린 자국","가스 토치 부품"],
      ["매운 데리야끼 소스","빈 양념통"]]},
    {"name":"블랙 트랙 입구의 채비","reward":"흠집 난 고글 렌즈","points":30,"slots":[
      ["다 식어버린 핫팩","얼어붙은 물통"],
      ["물먹은 방수 양말","비바람에 꺾인 우비"],
      ["녹슨 체인 조각","수명이 다한 펑크 패치","진흙투성이 카라비너"]]},
    {"name":"살롱의 장물 시세","reward":"최고급 캣닢 뭉치","points":20,"slots":[
      ["황금빛 도토리","다이아몬드 큐빅"],
      ["잃어버린 결혼반지","스마트키 조각","명품 가방의 지퍼"]]}
  ]'::jsonb;
  rec jsonb;
  slot jsonb;
  cand jsonb;
begin
  for rec in select * from jsonb_array_elements(recipes) loop
    v_name := rec->>'name';
    if exists (select 1 from combination_recipes where name = v_name) then
      raise notice '이미 있는 레시피라 건너뜀: %', v_name;
      continue;
    end if;

    -- 결과물 배지: 이름으로 정확히 1건
    select count(*), (array_agg(id))[1] into v_cnt, v_reward
      from badges where name = rec->>'reward' and type = 'item' and deleted_at is null;
    if v_cnt <> 1 then
      raise exception '결과물 배지를 찾지 못하거나 중복: % (건수 %)', rec->>'reward', v_cnt;
    end if;

    insert into combination_recipes (name, reward_points, reward_badge_ids)
      values (v_name, (rec->>'points')::int, array[v_reward])
      returning id into v_recipe_id;

    v_order := 0;
    for slot in select * from jsonb_array_elements(rec->'slots') loop
      v_order := v_order + 1;
      v_ids := '{}';
      for cand in select * from jsonb_array_elements(slot) loop
        select count(*), (array_agg(id))[1] into v_cnt, v_id
          from badges where name = cand #>> '{}' and type = 'item' and deleted_at is null;
        if v_cnt <> 1 then
          raise exception '재료 배지를 찾지 못하거나 중복: % (건수 %)', cand #>> '{}', v_cnt;
        end if;
        v_ids := v_ids || v_id;
      end loop;
      insert into combination_recipe_slots (recipe_id, slot_order, badge_type, allowed_badge_ids)
        values (v_recipe_id, v_order, 'item', v_ids);
    end loop;
  end loop;
end $$;
