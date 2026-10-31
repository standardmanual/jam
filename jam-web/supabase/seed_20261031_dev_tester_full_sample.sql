-- seed_20261031_dev_tester_full_sample.sql
-- 스테이징 자동 로그인 계정 «232»(dev-tester@jam.local)에 서비스 전 영역을 확인할 수 있는 샘플 데이터를 넣는다 (사용자 요청 2026-10-31)
--
-- ⚠️ Supabase는 staging·프로덕션 공용 단일 DB다. 이 시드는 아래 한 계정의 행을 만들거나 바꾼다. 실제 유저의 행은 건드리지 않는다.
--   user_id: 00000000-0000-0000-0000-000000000001 (email dev-tester@jam.local, display_name 232)
--   예외로, 같은 DB에 있는 가상 계정 jiwon.kim·minjun.park·sora.lee(@jam.local)와 팔로우 관계를 만들고, 앞의 둘에는 «친구 활동» 탭용 소식을 넣는다.
--   공용 합계 하나도 바뀐다: point_treasury.total_minted가 시드가 지급한 포인트만큼 늘어난다(되돌림 SQL이 백업 값으로 복원한다).
--
-- 넣는 영역
--   1) 액티비티 배지: 등급형 약 34개(새 JAM 2.0 계열 포함)와 레벨형 약 18개, 반복 획득형은 earn_count 2~4. triggered_by = 'seed_sample_232'
--   2) 포인트: 위 배지의 point_reward를 award_points로 지급, 컬렉션 등급 완성 보상, 믹스 보상
--   3) 잼: 보유 활동 10건의 정산(activity_settlement)과 캡슐 채움(capsule_fill)
--   4) 챕터·캡슐: 챕터 3 도달(chapter_ups 1~3), 캡슐 게이지 진행 중
--   5) 아이템 배지·인벤토리: 컬렉션에 꽂힌 개체(5개 컬렉션), 믹스 재료 5개(노을 구석의 트럭), 잠긴 개체 2개, 만료 임박 1개, 일반 1개
--      아이템 배지는 활성 컬렉션의 배지만 쓴다(비활성 컬렉션의 배지는 읽기 정책 때문에 화면에 안 보인다)
--   6) 컬렉션: 등급 완성 3개(common ×2, rare ×1), 부분 진행 3개 컬렉션
--   7) 믹스: 열려 있는 단서 레시피 3종의 성공 기록 3건
--   8) 알림 11종, 소식 5종(배지·드랍·픽업·챕터·컬렉션 등급 완성), 팔로우 관계, 체크인 배지 6개,
--      친구 활동 탭용으로 팔로우한 가상 계정(jiwon.kim, minjun.park)의 소식 9건
-- 넣지 않는 영역: 미션(공용 DB에 미션이 0건), 트라이브 변경(옛 트라이브 «낭만 미식가» 소속 유지), 온보딩 퀘스트(진행 화면을 볼 수 있게 그대로 둠),
--   스트라바 연결(토큰이 필요), capsule_opens 기록(공용 DB에 쓰인 적이 없어 items 형태를 확인하지 못함), 합친 연출(`seed_20261031_capsule_gauge_sample.sql`).
--
-- 되돌림: 만든 행의 id를 표 sample_seed_232_backup_20261031에 남긴다. 되돌림 SQL은 파일 맨 아래.
-- 실행 순서: v_dry = true로 롤백 실측 → v_dry = false로 실행 → 읽기 확인.
-- 프로모션 점검 주의: user_activity_badges의 새 계열(:J) 발급 기록을 볼 때 triggered_by = 'seed_sample_232'는 제외한다 (docs/plan/jam2/12 JAM 2.0 오픈 전후 적용 순서.md 5절).

DO $t$
#variable_conflict use_column
DECLARE
  v_dry boolean := true;
  U   constant uuid := '00000000-0000-0000-0000-000000000001';
  TAG constant text := 'seed_sample_232';
  v_inv uuid; v_g jsonb; v_item uuid; v_slot uuid; v_tx record; r record; k record;
  i int; n int; v_req int; v_ch int;
  v_sa uuid[]; v_sa_strava bigint[]; v_sa_dist numeric[]; v_sa_date timestamptz[]; v_sa_n int;
  v_sora uuid; v_jiwon uuid; v_minjun uuid;
  v_book1 uuid; v_book1_name text; v_book3 uuid; v_book3_name text;
  v_loose_item uuid; v_loose_badge uuid; v_loose_name text; v_loose_rarity text;
  v_hi_ab uuid; v_hi_ab_name text; v_hi_ab_rarity text;
  v_poi1 uuid; v_poi1_name text; v_poi2 uuid; v_poi2_name text;
  v_summary jsonb;
BEGIN
  -- ── 0. 가드 ──
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = U AND email = 'dev-tester@jam.local' AND display_name = '232') THEN
    RAISE EXCEPTION '대상 계정이 232(dev-tester@jam.local)가 아닙니다.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_activity_badges WHERE user_id = U)
     OR EXISTS (SELECT 1 FROM public.user_chapters WHERE user_id = U)
     OR EXISTS (SELECT 1 FROM public.jam_wallets WHERE user_id = U)
     OR EXISTS (SELECT 1 FROM public.chapter_ups WHERE user_id = U)
     OR (SELECT balance FROM public.point_wallets WHERE user_id = U) IS DISTINCT FROM 240 THEN
    RAISE EXCEPTION '이미 샘플이 들어갔거나 기준 상태(활동 배지 0, 챕터 0, 잼 지갑 없음, 포인트 240)가 달라졌습니다.';
  END IF;
  SELECT id INTO v_inv FROM public.inventory WHERE user_id = U;
  IF v_inv IS NULL THEN RAISE EXCEPTION '인벤토리 행이 없습니다.'; END IF;
  SELECT array_agg(id ORDER BY start_date), array_agg(strava_id ORDER BY start_date), array_agg(coalesce(distance_km, 0) ORDER BY start_date), array_agg(start_date ORDER BY start_date)
    INTO v_sa, v_sa_strava, v_sa_dist, v_sa_date FROM public.strava_activities WHERE user_id = U;
  v_sa_n := coalesce(cardinality(v_sa), 0);
  IF v_sa_n < 3 THEN RAISE EXCEPTION '보유 스트라바 활동이 %건뿐입니다(3건 이상 필요).', v_sa_n; END IF;
  SELECT id INTO v_sora  FROM public.users WHERE email = 'sora.lee@jam.local';
  SELECT id INTO v_jiwon FROM public.users WHERE email = 'jiwon.kim@jam.local';
  SELECT id INTO v_minjun FROM public.users WHERE email = 'minjun.park@jam.local';
  IF v_sora IS NULL OR v_jiwon IS NULL OR v_minjun IS NULL THEN RAISE EXCEPTION '가상 계정(@jam.local)이 없습니다.'; END IF;

  -- ── 백업 표: 바꿀 행의 원래 값과 만든 행의 id ──
  CREATE TABLE public.sample_seed_232_backup_20261031 (
    tbl TEXT NOT NULL, row_id TEXT NOT NULL, snapshot JSONB, backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tbl, row_id));
  ALTER TABLE public.sample_seed_232_backup_20261031 ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.sample_seed_232_backup_20261031 FROM anon, authenticated;
  COMMENT ON TABLE public.sample_seed_232_backup_20261031 IS '232 계정 샘플 시드(seed_20261031_dev_tester_full_sample.sql)의 되돌림용 표. snapshot이 있는 행은 바꾸기 전 원래 값, 없는 행은 만든 행의 id다. 서버(service role)만 읽고 쓴다.';
  INSERT INTO public.sample_seed_232_backup_20261031 (tbl, row_id, snapshot)
    SELECT 'snap:user_capsules', user_id::text, to_jsonb(c) FROM public.user_capsules c WHERE user_id = U
    UNION ALL SELECT 'snap:point_wallets', user_id::text, to_jsonb(w) FROM public.point_wallets w WHERE user_id = U
    UNION ALL SELECT 'snap:inventory', id::text, to_jsonb(i) FROM public.inventory i WHERE id = v_inv
    UNION ALL SELECT 'snap:point_treasury', id::text, to_jsonb(p) FROM public.point_treasury p WHERE id = 1;
  CREATE TEMP TABLE _made (tbl text, id text) ON COMMIT DROP;

  -- ── 1. 액티비티 배지 ──
  -- 등급형: 새 계열(:J) 8개 + 옛 계열 8개. 계열마다 앞에서부터 cap 등급까지(common<rare<epic<mystic)
  CREATE TEMP TABLE _pick ON COMMIT DROP AS
  WITH fam AS (
    SELECT family_key, (family_key LIKE '%:J%') AS is_new,
           row_number() OVER (PARTITION BY (family_key LIKE '%:J%') ORDER BY md5(family_key)) AS rn
      FROM (SELECT DISTINCT family_key FROM public.badges
             WHERE type = 'activity' AND deleted_at IS NULL AND rarity IS NOT NULL AND family_key IS NOT NULL AND family_key <> 'onboarding:complete') f
  ), capped AS (
    SELECT family_key, CASE rn WHEN 1 THEN 4 WHEN 2 THEN 3 WHEN 3 THEN 3 WHEN 4 THEN 2 WHEN 5 THEN 2 ELSE 1 END AS cap FROM fam WHERE rn <= 8
  )
  SELECT b.id, b.family_key, b.rarity::text AS rarity, coalesce(b.point_reward, 0) AS point_reward, (b.condition_json ? 'repeat_count') AS rep, NULL::int AS level
    FROM public.badges b JOIN capped c ON c.family_key = b.family_key
   WHERE b.type = 'activity' AND b.deleted_at IS NULL AND b.rarity IS NOT NULL AND NOT coalesce(b.is_hidden, false)
     AND (CASE b.rarity::text WHEN 'common' THEN 1 WHEN 'rare' THEN 2 WHEN 'epic' THEN 3 ELSE 4 END) <= c.cap;
  -- 레벨형: 새 계열 3개 + 옛 계열 3개. 레벨 1부터 cap까지
  INSERT INTO _pick
  SELECT b.id, b.family_key, NULL, coalesce(b.point_reward, 0), false, b.level
    FROM public.badges b
    JOIN (SELECT family_key, CASE rn WHEN 1 THEN 5 WHEN 2 THEN 4 WHEN 3 THEN 3 ELSE 3 END AS cap
            FROM (SELECT family_key, row_number() OVER (PARTITION BY is_new ORDER BY md5(family_key)) AS rn
                    FROM (SELECT DISTINCT family_key, (family_key LIKE '%:J%') AS is_new FROM public.badges
                           WHERE type = 'activity' AND deleted_at IS NULL AND rarity IS NULL AND level IS NOT NULL) x) y WHERE rn <= 3) c
      ON c.family_key = b.family_key
   WHERE b.type = 'activity' AND b.deleted_at IS NULL AND b.rarity IS NULL AND b.level <= c.cap AND NOT coalesce(b.is_hidden, false);

  WITH ins AS (
    INSERT INTO public.user_activity_badges (user_id, badge_id, earned_at, triggered_by, triggered_by_strava_id, triggered_by_activity_name,
                                             triggered_by_distance_km, triggered_by_activity_date, earn_count, earn_history)
    SELECT U, p.id, now() - (p.n * interval '17 hours'), TAG,
           v_sa_strava[1 + p.n % v_sa_n], '샘플 활동', v_sa_dist[1 + p.n % v_sa_n],
           to_char(v_sa_date[1 + p.n % v_sa_n] AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD'),
           CASE WHEN p.rep THEN 2 + p.n % 3 ELSE 1 END,
           CASE WHEN p.rep THEN (SELECT jsonb_agg(jsonb_build_object('strava_id', v_sa_strava[1 + (p.n + g) % v_sa_n], 'earned_at', (now() - ((p.n + g * 7) * interval '17 hours'))::text))
                                   FROM generate_series(0, 1 + p.n % 3) g)
                ELSE '[]'::jsonb END
      FROM (SELECT _pick.*, (row_number() OVER (ORDER BY md5(id::text)))::int AS n FROM _pick) p
    RETURNING id)
  INSERT INTO _made SELECT 'user_activity_badges', id::text FROM ins;

  -- 포인트: 배지마다 point_reward 지급 (거래 시각은 배지를 받은 시각으로 맞춘다)
  FOR r IN SELECT uab.badge_id, uab.earned_at, b.point_reward FROM public.user_activity_badges uab JOIN public.badges b ON b.id = uab.badge_id
            WHERE uab.user_id = U AND uab.triggered_by = TAG AND coalesce(b.point_reward, 0) > 0 ORDER BY uab.earned_at LOOP
    SELECT * INTO v_tx FROM public.award_points(U, r.point_reward, 'badge_point_reward', r.badge_id);
    UPDATE public.point_transactions SET created_at = r.earned_at WHERE id = v_tx.id;
    INSERT INTO _made VALUES ('point_transactions', v_tx.id::text);
  END LOOP;

  -- ── 2. 잼 정산 (보유 활동마다 1건, 활동한 날 기준) ──
  FOR i IN 1..v_sa_n LOOP
    SELECT * INTO v_tx FROM public.jam_apply(U, 120 + ((i * 137) % 330), 'activity_settlement', v_sa[i], NULL, NULL, NULL, (v_sa_date[i] AT TIME ZONE 'Asia/Seoul')::date);
    UPDATE public.jam_transactions SET created_at = v_sa_date[i] + interval '40 minutes' WHERE id = v_tx.id;
    INSERT INTO _made VALUES ('jam_transactions', v_tx.id::text);
  END LOOP;

  -- ── 3. 챕터 3 도달과 캡슐 게이지 ──
  INSERT INTO public.user_chapters (user_id, chapter_no, total_score, capsule_full_count) VALUES (U, 3, 2450, 2);
  INSERT INTO public.chapter_ups (user_id, chapter_no, reached_at)
    VALUES (U, 1, now() - interval '38 days'), (U, 2, now() - interval '21 days'), (U, 3, now() - interval '6 days');
  INSERT INTO _made VALUES ('user_chapters', U::text), ('chapter_ups', '1'), ('chapter_ups', '2'), ('chapter_ups', '3');
  SELECT required, chapter_no INTO v_req, v_ch FROM public.capsule_next_required_v2(U);
  IF v_ch IS DISTINCT FROM 3 OR v_req IS NULL OR v_req <= 0 THEN
    RAISE EXCEPTION '챕터 3의 캡슐 필요량을 읽지 못했습니다(챕터 %, 필요량 %).', v_ch, v_req;
  END IF;
  UPDATE public.user_capsules SET chapter_no = 3, required = v_req, filled = least(120, v_req - 30), updated_at = now() WHERE user_id = U;
  SELECT * INTO v_tx FROM public.jam_apply(U, -least(120, v_req - 30), 'capsule_fill');
  UPDATE public.jam_transactions SET created_at = now() - interval '2 days' WHERE id = v_tx.id;
  INSERT INTO _made VALUES ('jam_transactions', v_tx.id::text);

  -- ── 4. 컬렉션에 꽂힌 개체와 등급 완성 ──
  -- 활성 컬렉션을 이름순으로 5개: 1번 common 완성, 2번 common·rare 완성, 3번 common 5칸, 4번 common 2·rare 1, 5번 common·epic·mystic 1칸씩
  FOR k IN
    SELECT ib.id AS book_id, ib.name AS book_name, t.rn, t.rarity, t.cnt
      FROM (SELECT id, name, row_number() OVER (ORDER BY name) AS rn FROM public.item_books WHERE is_active AND tier_mode ORDER BY name LIMIT 5) ib
      JOIN (VALUES (1,'common',9),(2,'common',9),(2,'rare',9),(3,'common',5),(4,'common',2),(4,'rare',1),(5,'common',1),(5,'epic',1),(5,'mystic',1)) AS t(rn, rarity, cnt)
        ON t.rn = ib.rn
     ORDER BY ib.rn, t.rarity
  LOOP
    IF k.rn = 1 THEN v_book1 := k.book_id; v_book1_name := k.book_name; END IF;
    IF k.rn = 3 THEN v_book3 := k.book_id; v_book3_name := k.book_name; END IF;
    n := 0;
    FOR r IN SELECT id FROM public.badges WHERE item_book_id = k.book_id AND type = 'item' AND rarity::text = k.rarity AND deleted_at IS NULL ORDER BY id LIMIT k.cnt LOOP
      v_g := public.grant_inventory_item(v_inv, r.id, TAG, NULL);
      IF NOT coalesce((v_g->>'ok')::boolean, false) THEN RAISE EXCEPTION '개체 지급 실패: %', v_g; END IF;
      v_item := (v_g->>'itemId')::uuid;
      INSERT INTO public.user_item_book_slots (user_id, item_book_id, badge_id, inventory_item_id, slotted_at)
        VALUES (U, k.book_id, r.id, v_item, now() - ((k.rn * 9 + n) * interval '5 hours')) RETURNING id INTO v_slot;
      UPDATE public.inventory_items SET slotted_in = v_slot, obtained_at = now() - ((k.rn * 9 + n + 40) * interval '5 hours') WHERE id = v_item;
      UPDATE public.inventory SET used_slots = (SELECT count(*) FROM public.inventory_items WHERE inventory_id = v_inv AND slotted_in IS NULL AND dropped_at IS NULL AND destroyed_at IS NULL) WHERE id = v_inv;
      INSERT INTO _made VALUES ('user_item_book_slots', v_slot::text), ('inventory_items', v_item::text);
      n := n + 1;
    END LOOP;
    IF n <> k.cnt THEN RAISE EXCEPTION '컬렉션 % %등급 개체가 %개뿐입니다(%개 필요).', k.book_name, k.rarity, n, k.cnt; END IF;
    -- 한 등급의 9칸이 모두 찼으면 완성 기록과 보상을 넣는다
    IF k.cnt = 9 THEN
      INSERT INTO public.user_item_book_tier_completions (user_id, item_book_id, tier, completed_at)
        VALUES (U, k.book_id, k.rarity::public.badge_rarity, now() - ((k.rn * 3 + 1) * interval '1 day'));
      INSERT INTO _made VALUES ('user_item_book_tier_completions', k.book_id::text || ':' || k.rarity);
      SELECT * INTO v_tx FROM public.award_points(p_user_id => U, p_amount => CASE k.rarity WHEN 'common' THEN 100 ELSE 200 END,
                                                   p_reason => 'item_book_completion_point_reward', p_source_item_book_id => k.book_id);
      UPDATE public.point_transactions SET created_at = now() - ((k.rn * 3 + 1) * interval '1 day') WHERE id = v_tx.id;
      INSERT INTO _made VALUES ('point_transactions', v_tx.id::text);
      INSERT INTO public.user_activity_feed (user_id, event_type, event_at, metadata)
        VALUES (U, 'collection_tier_completed', now() - ((k.rn * 3 + 1) * interval '1 day'),
                jsonb_build_object('collection_id', k.book_id, 'collection_name', k.book_name, 'rarity', k.rarity, 'sample', true));
    END IF;
  END LOOP;

  -- ── 5. 인벤토리에 남는 개체: 믹스 재료 5개, 잠긴 개체 2개, 만료 임박 1개, 일반 1개 ──
  -- ⚠️ 아이템 배지의 읽기 정책(badges: 전체 읽기 허용)은 «컬렉션이 활성일 때만» 보이게 한다. 비활성 옛 컬렉션의 배지를 넣으면 인벤토리에 안 그려진다.
  --    그래서 재료·잠긴 개체·일반 개체는 모두 활성 컬렉션의 배지에서 고른다. 레시피도 종료된 옛 3건(valid_until이 있는 것)이 아니라 열려 있는 단서 레시피를 쓴다.
  CREATE TEMP TABLE _vis ON COMMIT DROP AS
    SELECT b.id, b.rarity::text AS rarity, b.name, coalesce(b.drop_excluded, false) AS drop_ex
      FROM public.badges b
     WHERE b.type = 'item' AND b.deleted_at IS NULL
       AND b.item_book_id IN (SELECT id FROM public.item_books WHERE is_active AND (valid_from IS NULL OR valid_from <= now()));
  -- 믹스 재료: 레시피 «노을 구석의 트럭»(5칸, 칸마다 배지 하나)
  FOR k IN
    SELECT r.id AS recipe_id, s.slot_order,
           (SELECT v.id FROM _vis v WHERE v.id = ANY(s.allowed_badge_ids) ORDER BY v.id LIMIT 1) AS badge_id
      FROM public.combination_recipes r JOIN public.combination_recipe_slots s ON s.recipe_id = r.id
     WHERE r.id = '479ecff5-c0ba-40f6-a2c3-35d110ab5a01' AND r.name = '노을 구석의 트럭' AND s.badge_type = 'item'
     ORDER BY s.slot_order
  LOOP
    IF k.badge_id IS NULL THEN RAISE EXCEPTION '레시피 재료 배지를 찾지 못했습니다.'; END IF;
    v_g := public.grant_inventory_item(v_inv, k.badge_id, TAG, NULL);
    IF NOT coalesce((v_g->>'ok')::boolean, false) THEN RAISE EXCEPTION '재료 지급 실패: %', v_g; END IF;
    INSERT INTO _made VALUES ('inventory_items', v_g->>'itemId');
  END LOOP;
  -- 잠긴 개체 2개(common 필요 잼 30, epic 필요 잼 120), 만료 임박(3일 뒤) rare 1개, 일반 common 1개. 이미 가진 배지는 피한다
  FOR k IN SELECT * FROM (VALUES ('common', 30, true), ('epic', 120, true), ('rare', NULL, false), ('common', NULL, false)) AS t(rarity, need, locked) LOOP
    SELECT v.id INTO v_loose_badge FROM _vis v WHERE v.rarity = k.rarity AND NOT v.drop_ex
       AND NOT EXISTS (SELECT 1 FROM public.inventory_items x WHERE x.inventory_id = v_inv AND x.badge_id = v.id) ORDER BY md5(v.id::text) LIMIT 1;
    IF v_loose_badge IS NULL THEN RAISE EXCEPTION '% 등급 배지를 고르지 못했습니다.', k.rarity; END IF;
    IF k.locked THEN
      v_g := public.grant_inventory_item_locked(v_inv, v_loose_badge, TAG, NULL, true, 'rolled', k.need);
    ELSIF k.rarity = 'rare' THEN
      v_g := public.grant_inventory_item(v_inv, v_loose_badge, TAG, now() + interval '3 days');
    ELSE
      v_g := public.grant_inventory_item(v_inv, v_loose_badge, TAG, NULL);
      v_loose_item := (v_g->>'itemId')::uuid;
    END IF;
    IF NOT coalesce((v_g->>'ok')::boolean, false) THEN RAISE EXCEPTION '개체 지급 실패: %', v_g; END IF;
    INSERT INTO _made VALUES ('inventory_items', v_g->>'itemId');
  END LOOP;
  -- 마지막 반복이 일반 common이라 v_loose_badge가 그 배지다(알림·소식이 이 개체를 가리킨다)
  SELECT b.name, b.rarity::text INTO v_loose_name, v_loose_rarity FROM public.badges b WHERE b.id = v_loose_badge;
  -- 받은 시각을 흩어 놓는다
  UPDATE public.inventory_items SET obtained_at = now() - (x.rn * interval '9 hours')
    FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM public.inventory_items WHERE inventory_id = v_inv AND obtained_by = TAG AND slotted_in IS NULL) x
   WHERE inventory_items.id = x.id;
  UPDATE public.inventory SET used_slots = (SELECT count(*) FROM public.inventory_items WHERE inventory_id = v_inv AND slotted_in IS NULL AND dropped_at IS NULL AND destroyed_at IS NULL) WHERE id = v_inv;

  -- ── 6. 믹스 성공 기록 3건 (열려 있는 단서 레시피 3종, 이름마다 한 건. 재료 레시피 «노을 구석의 트럭»은 제외) ──
  FOR k IN
    SELECT q.id, q.reward_points, coalesce(q.reward_badge_ids, '{}') AS result_ids,
           (SELECT array_agg((SELECT v.id FROM _vis v WHERE v.id = ANY(s.allowed_badge_ids) ORDER BY v.id LIMIT 1) ORDER BY s.slot_order)
              FROM public.combination_recipe_slots s WHERE s.recipe_id = q.id) AS ingredients,
           (row_number() OVER (ORDER BY q.name))::int AS rn
      FROM (SELECT DISTINCT ON (name) id, name, reward_points, reward_badge_ids FROM public.combination_recipes
             WHERE valid_from IS NULL AND valid_until IS NULL AND name IN ('노트 위의 별', '맨 아래 줄의 노트 12권', '벽장의 월세 봉투') ORDER BY name, id) q
  LOOP
    INSERT INTO public.user_combine_success_logs (user_id, recipe_id, attempted_at, ingredient_badge_ids, result_badge_ids, points_awarded, is_recipe_first)
      VALUES (U, k.id, now() - (k.rn * interval '2 days'), coalesce(k.ingredients, '{}'), k.result_ids, k.reward_points, true) RETURNING id INTO v_slot;
    INSERT INTO _made VALUES ('user_combine_success_logs', v_slot::text);
    IF coalesce(k.reward_points, 0) > 0 THEN
      SELECT * INTO v_tx FROM public.award_points(U, k.reward_points, 'combine_recipe_reward');
      UPDATE public.point_transactions SET created_at = now() - (k.rn * interval '2 days') WHERE id = v_tx.id;
      INSERT INTO _made VALUES ('point_transactions', v_tx.id::text);
    END IF;
  END LOOP;

  -- ── 7. 팔로우 관계 (가상 계정과 맞팔로우 둘, 단방향 둘) ──
  WITH f AS (
    INSERT INTO public.user_follows (follower_id, following_id, created_at)
    VALUES (U, v_jiwon, now() - interval '12 days'), (v_jiwon, U, now() - interval '11 days'),
           (U, v_minjun, now() - interval '9 days'), (v_sora, U, now() - interval '4 days')
    ON CONFLICT (follower_id, following_id) DO NOTHING RETURNING id)
  INSERT INTO _made SELECT 'user_follows', id::text FROM f;

  -- ── 8. 체크인 배지 6개 (역·산 이름이 지점 이름과 같은 배지) ──
  WITH c AS (
    INSERT INTO public.user_checkin_badge_earns (user_id, badge_id, poi_id, earned_at, triggered_by_strava_id, triggered_by_activity_name, triggered_by_distance_km, triggered_by_activity_date)
    SELECT U, q.bid, q.pid, now() - (q.n * interval '30 hours'), v_sa_strava[1 + q.n % v_sa_n], '샘플 활동', v_sa_dist[1 + q.n % v_sa_n], v_sa_date[1 + q.n % v_sa_n]
      FROM (SELECT b.id AS bid, p.id AS pid, (row_number() OVER (ORDER BY md5(b.id::text)))::int AS n
              FROM public.badges b JOIN public.poi p ON p.name = b.name
             WHERE b.type = 'checkin' AND b.deleted_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM public.user_checkin_badge_earns e WHERE e.user_id = U AND e.badge_id = b.id)
             ORDER BY md5(b.id::text) LIMIT 6) q
    RETURNING id)
  INSERT INTO _made SELECT 'user_checkin_badge_earns', id::text FROM c;

  -- ── 9. 소식과 알림에 쓸 실제 값 ──
  SELECT uab.badge_id, b.name, b.rarity::text INTO v_hi_ab, v_hi_ab_name, v_hi_ab_rarity
    FROM public.user_activity_badges uab JOIN public.badges b ON b.id = uab.badge_id
   WHERE uab.user_id = U AND uab.triggered_by = TAG AND b.rarity IS NOT NULL
   ORDER BY (CASE b.rarity::text WHEN 'mystic' THEN 4 WHEN 'epic' THEN 3 WHEN 'rare' THEN 2 ELSE 1 END) DESC, b.id LIMIT 1;
  SELECT p.id, p.name INTO v_poi1, v_poi1_name FROM public.poi_views v JOIN public.poi p ON p.id = v.poi_id WHERE v.user_id = U ORDER BY p.id LIMIT 1;
  SELECT p.id, p.name INTO v_poi2, v_poi2_name FROM public.poi_views v JOIN public.poi p ON p.id = v.poi_id WHERE v.user_id = U AND p.id <> v_poi1 ORDER BY p.id LIMIT 1;

  -- 소식: 배지 받음 6, 드랍 2, 픽업 2, 챕터 3 (컬렉션 등급 완성은 위에서 넣음)
  WITH ins AS (
    INSERT INTO public.user_activity_feed (user_id, event_type, event_at, metadata, strava_activity_id)
    SELECT U, 'badge_earned', uab.earned_at,
           jsonb_build_object('rarity', b.rarity::text, 'badge_id', b.id, 'badge_name', b.name, 'badge_image_url', b.image_url, 'sample', true),
           v_sa_strava[1 + (row_number() OVER (ORDER BY uab.earned_at))::int % v_sa_n]
      FROM public.user_activity_badges uab JOIN public.badges b ON b.id = uab.badge_id
     WHERE uab.user_id = U AND uab.triggered_by = TAG
     ORDER BY (CASE WHEN b.rarity IS NULL THEN 0 ELSE 1 END) DESC, (CASE b.rarity::text WHEN 'mystic' THEN 4 WHEN 'epic' THEN 3 WHEN 'rare' THEN 2 ELSE 1 END) DESC, b.id LIMIT 6
    RETURNING id)
  INSERT INTO _made SELECT 'user_activity_feed', id::text FROM ins;
  WITH ins AS (
    INSERT INTO public.user_activity_feed (user_id, event_type, event_at, metadata)
    SELECT U, e.ev::public.feed_event_type, now() - (e.n * interval '7 hours'),
           CASE e.ev WHEN 'item_dropped'
             THEN jsonb_build_object('rarity', b.rarity::text, 'badge_id', b.id, 'poi_name', e.poi, 'badge_name', b.name, 'tribe_name', coalesce(t.name, ''), 'point_reward', coalesce(b.point_reward, 0),
                                     'is_last_piece', false, 'badge_image_url', coalesce(b.image_url, ''), 'inventory_item_id', ii.id, 'sample', true)
             ELSE jsonb_build_object('rarity', b.rarity::text, 'badge_id', b.id, 'poi_name', e.poi, 'badge_name', b.name, 'badge_image_url', b.image_url, 'sample', true) END
      FROM (VALUES (1,'item_dropped', v_poi1_name), (2,'item_dropped', v_poi2_name), (3,'item_picked_up', v_poi1_name), (4,'item_picked_up', v_poi2_name)) AS e(n, ev, poi)
      JOIN (SELECT id, badge_id, row_number() OVER (ORDER BY id) AS rn FROM public.inventory_items WHERE inventory_id = v_inv AND obtained_by = TAG AND slotted_in IS NULL) ii ON ii.rn = e.n
      JOIN public.badges b ON b.id = ii.badge_id LEFT JOIN public.tribes t ON t.id = b.tribe_id
    RETURNING id)
  INSERT INTO _made SELECT 'user_activity_feed', id::text FROM ins;
  WITH ins AS (
    INSERT INTO public.user_activity_feed (user_id, event_type, event_at, metadata)
    SELECT U, 'chapter_up', cu.reached_at, jsonb_build_object('chapter_no', cu.chapter_no, 'sample', true) FROM public.chapter_ups cu WHERE cu.user_id = U
    RETURNING id)
  INSERT INTO _made SELECT 'user_activity_feed', id::text FROM ins;
  -- 컬렉션 등급 완성 소식은 4절에서 넣었으므로 id를 모아 기록한다
  INSERT INTO _made SELECT 'user_activity_feed', id::text FROM public.user_activity_feed
   WHERE user_id = U AND event_type = 'collection_tier_completed' AND metadata->>'sample' = 'true';

  -- 알림 11종 (group_key 끝에 :sample232를 붙여 실제 묶음 키와 겹치지 않게 한다)
  WITH ins AS (
    INSERT INTO public.notifications (user_id, type, actor_user_id, actor_count, group_key, payload, bumps_badge, created_at, updated_at)
    SELECT U, v.ty::public.notification_type, v.actor, v.cnt, v.ty || ':sample232', v.pl || jsonb_build_object('sample', true), v.bump, now() - v.ago, now() - v.ago
      FROM (VALUES
        ('activity_recap', NULL::uuid, 1, jsonb_build_object('points', 55, 'activity_ids', jsonb_build_array(v_sa_strava[1], v_sa_strava[2]),
             'item_badges', jsonb_build_array(jsonb_build_object('name', v_loose_name, 'rarity', v_loose_rarity, 'badge_id', v_loose_badge, 'inventory_item_id', v_loose_item)),
             'activity_badges', jsonb_build_array(jsonb_build_object('id', v_hi_ab, 'name', v_hi_ab_name, 'rarity', v_hi_ab_rarity))), false, interval '3 hours'),
        ('collection_completable', NULL, 1, jsonb_build_object('book_name', v_book3_name, 'item_book_id', v_book3), true, interval '5 hours'),
        ('collection_near_complete', NULL, 1, jsonb_build_object('target_count', 2), true, interval '9 hours'),
        ('collection_slottable', NULL, 1, jsonb_build_object('count', 3, 'target_count', 3), true, interval '14 hours'),
        ('drop_picked_up', v_jiwon, 1, jsonb_build_object('poi_id', v_poi1, 'actor_ids', jsonb_build_array(v_jiwon), 'badge_ids', jsonb_build_array(v_loose_badge), 'badge_name', v_loose_name), true, interval '20 hours'),
        ('drop_spot_active', NULL, 1, jsonb_build_object('poi_id', v_poi2, 'poi_name', v_poi2_name, 'visitor_count', 3), true, interval '1 day'),
        ('followed', v_sora, 1, jsonb_build_object('actor_ids', jsonb_build_array(v_sora)), true, interval '2 days'),
        ('following_collection_complete', v_jiwon, 1, jsonb_build_object('book_name', v_book1_name, 'item_book_id', v_book1), true, interval '3 days'),
        ('following_rare_badge', v_jiwon, 1, jsonb_build_object('rarity', v_hi_ab_rarity, 'badge_id', v_hi_ab, 'badge_name', v_hi_ab_name), true, interval '4 days'),
        ('inventory_full', NULL, 1, jsonb_build_object('max_slots', 10, 'used_slots', 10), true, interval '5 days'),
        ('sync_stalled', NULL, 1, jsonb_build_object('days', 3), true, interval '6 days')
      ) AS v(ty, actor, cnt, pl, bump, ago)
    RETURNING id)
  INSERT INTO _made SELECT 'notifications', id::text FROM ins;

  -- 친구 활동 탭: 팔로우한 가상 계정(jiwon.kim, minjun.park)의 소식 9건 (배지 5, 드랍 2, 픽업 2)
  SELECT p.name INTO v_poi1_name FROM public.poi p ORDER BY md5(p.id::text) LIMIT 1;
  WITH pick AS (
    SELECT b.id, b.name, b.rarity::text AS rarity, b.image_url, (row_number() OVER (ORDER BY md5(b.id::text)))::int AS rn
      FROM public.badges b WHERE b.type = 'activity' AND b.deleted_at IS NULL AND b.rarity::text IN ('rare', 'epic', 'mystic') AND NOT coalesce(b.is_hidden, false)
  ), ins AS (
    INSERT INTO public.user_activity_feed (user_id, event_type, event_at, metadata)
    SELECT CASE WHEN rn % 2 = 0 THEN v_jiwon ELSE v_minjun END, 'badge_earned', now() - (rn * interval '5 hours'),
           jsonb_build_object('rarity', rarity, 'badge_id', id, 'badge_name', name, 'badge_image_url', image_url, 'sample', true)
      FROM pick WHERE rn <= 5
    RETURNING id)
  INSERT INTO _made SELECT 'user_activity_feed', id::text FROM ins;
  WITH ib AS (
    SELECT b.id, b.name, b.rarity::text AS rarity, b.image_url, coalesce(t.name, '') AS tribe, (row_number() OVER (ORDER BY md5(b.id::text)))::int AS rn
      FROM public.badges b LEFT JOIN public.tribes t ON t.id = b.tribe_id
     WHERE b.type = 'item' AND b.deleted_at IS NULL AND b.rarity::text IN ('common', 'rare')
       AND b.item_book_id IN (SELECT id FROM public.item_books WHERE is_active)
  ), ev AS (
    SELECT * FROM (VALUES (1, v_jiwon, 'item_dropped', 3), (2, v_jiwon, 'item_picked_up', 7), (3, v_minjun, 'item_dropped', 11), (4, v_minjun, 'item_picked_up', 13)) AS t(rn, uid, ev, hrs)
  ), ins AS (
    INSERT INTO public.user_activity_feed (user_id, event_type, event_at, metadata)
    SELECT ev.uid, ev.ev::public.feed_event_type, now() - (ev.hrs * interval '1 hour'),
           CASE ev.ev WHEN 'item_dropped'
             THEN jsonb_build_object('rarity', ib.rarity, 'badge_id', ib.id, 'poi_name', v_poi1_name, 'badge_name', ib.name, 'tribe_name', ib.tribe, 'point_reward', 0, 'is_last_piece', false, 'badge_image_url', coalesce(ib.image_url, ''), 'sample', true)
             ELSE jsonb_build_object('rarity', ib.rarity, 'badge_id', ib.id, 'poi_name', v_poi1_name, 'badge_name', ib.name, 'badge_image_url', ib.image_url, 'sample', true) END
      FROM ev JOIN ib ON ib.rn = ev.rn
    RETURNING id)
  INSERT INTO _made SELECT 'user_activity_feed', id::text FROM ins;

  -- ── 10. 되돌림용 id 기록과 요약 ──
  INSERT INTO public.sample_seed_232_backup_20261031 (tbl, row_id) SELECT DISTINCT tbl, id FROM _made;
  SELECT jsonb_build_object(
    'activity_badges', (SELECT count(*) FROM public.user_activity_badges WHERE user_id = U AND triggered_by = TAG),
    'activity_new_family', (SELECT count(*) FROM public.user_activity_badges uab JOIN public.badges b ON b.id = uab.badge_id WHERE uab.user_id = U AND uab.triggered_by = TAG AND b.family_key LIKE '%:J%'),
    'point_balance', (SELECT balance FROM public.point_wallets WHERE user_id = U),
    'point_tx_sum', (SELECT sum(amount) FROM public.point_transactions WHERE user_id = U),
    'jam_balance', (SELECT balance FROM public.jam_wallets WHERE user_id = U),
    'jam_total_earned', (SELECT total_earned FROM public.jam_wallets WHERE user_id = U),
    'jam_tx_sum', (SELECT sum(amount) FROM public.jam_transactions WHERE user_id = U),
    'capsule', (SELECT to_jsonb(c) - 'user_id' FROM public.user_capsules c WHERE user_id = U),
    'inventory', (SELECT jsonb_build_object('used', used_slots, 'max', max_slots) FROM public.inventory WHERE id = v_inv),
    'items_total', (SELECT count(*) FROM public.inventory_items WHERE inventory_id = v_inv),
    'items_locked', (SELECT count(*) FROM public.inventory_items WHERE inventory_id = v_inv AND locked),
    'slots', (SELECT count(*) FROM public.user_item_book_slots WHERE user_id = U),
    'tier_completions', (SELECT count(*) FROM public.user_item_book_tier_completions WHERE user_id = U),
    'combine_logs', (SELECT count(*) FROM public.user_combine_success_logs WHERE user_id = U),
    'notifications', (SELECT count(*) FROM public.notifications WHERE user_id = U AND payload->>'sample' = 'true'),
    'feed', (SELECT count(*) FROM public.user_activity_feed WHERE user_id = U AND metadata->>'sample' = 'true'),
    'follows', (SELECT count(*) FROM public.user_follows WHERE follower_id = U OR following_id = U),
    'checkins', (SELECT count(*) FROM public.user_checkin_badge_earns WHERE user_id = U),
    'made_rows', (SELECT count(*) FROM _made)) INTO v_summary;
  IF v_dry THEN RAISE EXCEPTION '롤백 실측 결과: %', v_summary; END IF;
END $t$;

-- ============================================================
-- 되돌림 (232 계정의 샘플을 모두 지운다. 표 sample_seed_232_backup_20261031이 있어야 한다)
-- ============================================================
-- DELETE FROM public.user_activity_badges WHERE user_id = '00000000-0000-0000-0000-000000000001' AND triggered_by = 'seed_sample_232';
-- DELETE FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-000000000001' AND payload->>'sample' = 'true';
-- DELETE FROM public.user_activity_feed WHERE id::text IN (SELECT row_id FROM public.sample_seed_232_backup_20261031 WHERE tbl = 'user_activity_feed');  -- 232와 가상 계정의 소식 25건
-- DELETE FROM public.user_follows WHERE id::text IN (SELECT row_id FROM public.sample_seed_232_backup_20261031 WHERE tbl = 'user_follows');
-- DELETE FROM public.user_checkin_badge_earns WHERE id::text IN (SELECT row_id FROM public.sample_seed_232_backup_20261031 WHERE tbl = 'user_checkin_badge_earns');
-- DELETE FROM public.user_combine_success_logs WHERE id::text IN (SELECT row_id FROM public.sample_seed_232_backup_20261031 WHERE tbl = 'user_combine_success_logs');
-- DELETE FROM public.user_item_book_tier_completions WHERE user_id = '00000000-0000-0000-0000-000000000001';
-- DELETE FROM public.user_item_book_slots WHERE id::text IN (SELECT row_id FROM public.sample_seed_232_backup_20261031 WHERE tbl = 'user_item_book_slots');
-- DELETE FROM public.inventory_items WHERE id::text IN (SELECT row_id FROM public.sample_seed_232_backup_20261031 WHERE tbl = 'inventory_items');
-- DELETE FROM public.chapter_ups WHERE user_id = '00000000-0000-0000-0000-000000000001';
-- DELETE FROM public.user_chapters WHERE user_id = '00000000-0000-0000-0000-000000000001';
-- DELETE FROM public.jam_transactions WHERE user_id = '00000000-0000-0000-0000-000000000001';
-- DELETE FROM public.jam_daily_earned WHERE user_id = '00000000-0000-0000-0000-000000000001';
-- DELETE FROM public.jam_wallets WHERE user_id = '00000000-0000-0000-0000-000000000001';
-- DELETE FROM public.point_transactions WHERE id::text IN (SELECT row_id FROM public.sample_seed_232_backup_20261031 WHERE tbl = 'point_transactions');
-- 바꾼 행 복원: 캡슐·포인트 지갑·인벤토리·재무 합계를 백업 값으로 되돌린다
-- UPDATE public.user_capsules c SET chapter_no = (s.snapshot->>'chapter_no')::int, required = (s.snapshot->>'required')::int, filled = (s.snapshot->>'filled')::int, updated_at = (s.snapshot->>'updated_at')::timestamptz FROM public.sample_seed_232_backup_20261031 s WHERE s.tbl = 'snap:user_capsules' AND c.user_id = s.row_id::uuid;
-- UPDATE public.point_wallets w SET balance = (s.snapshot->>'balance')::int, updated_at = (s.snapshot->>'updated_at')::timestamptz FROM public.sample_seed_232_backup_20261031 s WHERE s.tbl = 'snap:point_wallets' AND w.user_id = s.row_id::uuid;
-- UPDATE public.inventory i SET used_slots = (s.snapshot->>'used_slots')::int FROM public.sample_seed_232_backup_20261031 s WHERE s.tbl = 'snap:inventory' AND i.id = s.row_id::uuid;
-- UPDATE public.point_treasury p SET total_minted = (s.snapshot->>'total_minted')::bigint, total_reclaimed = (s.snapshot->>'total_reclaimed')::bigint, updated_at = (s.snapshot->>'updated_at')::timestamptz FROM public.sample_seed_232_backup_20261031 s WHERE s.tbl = 'snap:point_treasury' AND p.id = 1;
-- 확인이 끝나 더 필요 없으면: DROP TABLE IF EXISTS public.sample_seed_232_backup_20261031;
