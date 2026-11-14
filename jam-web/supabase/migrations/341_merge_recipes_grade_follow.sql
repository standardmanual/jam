-- 341_merge_recipes_grade_follow.sql
-- 같은 이름 × 4등급 레시피 80개(20묶음)를 등급 대응형 레시피 20개로 합친다 (티켓 20261114_1705 1회차)
--
-- ⚠️ 이 파일은 작성만 했고 실행하지 않았다. 실행은 메인 세션(카리나)이 한다. 공용 DB라 적용하는 순간 프로덕션에 반영된다.
--
-- 적용 순서 (확장 → 전환 → 축소, .claude/skills/jam-work/references/db-migration-rules.md)
--   ① 확장: 340_combination_recipe_grade_mode.sql (칸·함수 추가, 옛 코드가 그대로 동작)
--   ② 전환: 등급 대응형 판정 코드(lib/combine/index.ts)를 배포한다. 옛 코드는 grade_mode를 모르므로, 합친 레시피를 만나면
--          재료 등급을 가리지 않고 4등급 보상을 전부 준다. 그래서 이 파일(데이터 합치기)은 새 코드가 프로덕션에 배포된 뒤에 적용한다.
--          /combine 화면이 같은 등급만 고르게 막는 것은 3회차다 — 그 전에는 화면에서 등급을 섞어 고르면 서버가 거절한다.
--   ③ 축소: 합치고 남은 옛 모양은 없다(이 파일이 옛 레시피 60개를 지운다). 별도 축소 파일은 필요 없다.
--
-- 하는 일 (DO 블록 하나 = 한 트랜잭션, 하나라도 어긋나면 전체가 되돌아간다)
--   1. 활성 레시피(종료 시각이 없거나 미래, grade_mode = 'fixed')를 «이름·보상 포인트·공개 기간·결과 잠김·보상 없음 허용·설명»이 같은 묶음으로 나눈다.
--      묶음은 정확히 20개, 레시피는 정확히 80개, 묶음마다 common·rare·epic·mystic 한 개씩이어야 한다. 아니면 멈춘다.
--   2. 묶음 안의 슬롯 위치(slot_order)별 «아이템 배지 묶음»(같은 item_book_id + name)과 보상 배지 묶음이 4개 레시피에서 같은지 확인한다.
--      어긋나면 멈춘다. 레시피마다 재료·보상 배지의 등급은 한 가지여야 하고 보상 배지에 같은 묶음이 두 번 있으면 멈춘다.
--   3. 가장 먼저 만든 레시피를 대표로 남기고(created_at, id 순) 대표의 슬롯을 «4등급 후보를 모두 담은 슬롯»으로 바꾼다.
--      보상 배지도 4등급을 모두 담는다(묶음 순서는 대표의 옛 순서, 묶음 안은 common → rare → epic → mystic).
--      대표를 grade_mode = 'follow_materials'로 바꾼다. 이름·보상 포인트·공개 기간·잠금 설정은 묶음이 같으므로 그대로다.
--   4. 믹스 성공 기록·받지 않은 결과·투데이 카드의 recipe_id를 대표로 옮긴다. 믹스 성공 기록은 «첫 성공» 표시를 전부 끄고 옮긴 뒤
--      대표 레시피 기준으로 가장 이른 1건(attempted_at, id 순)에만 다시 켠다.
--   5. 대표가 아닌 레시피 60개를 지운다(슬롯은 CASCADE). 지우기 전에 백업 표에 담는다.
--   6. 끝에서 개수·참조 잔존·첫 성공 표시 수를 검사하고 어긋나면 예외를 내 전체를 되돌린다.
--   배지 조건(badges.condition_json)이 지워질 레시피의 id를 가리키면 멈춘다(「가장 먼저 성공」 조건을 쓰는 배지는 0개로 확인했다).
--
-- 백업 표(재실행·되돌림 근거): recipe_merge_backup_20261114_{recipes,slots,success_logs,pending,cards}. 비어 있을 때만 합친다.
--   이미 합친 뒤에 같은 파일을 다시 실행하면 백업 표가 비어 있지 않아 멈춘다.
--
-- 실행: 한 번의 호출로 통째로 실행한다(BEGIN/COMMIT 없이). 롤백 실측은 이 파일 맨 아래 «롤백 실측» 문장을 같은 호출에 붙여 실행한다.
--   롤백 실측 때 백업 표는 만들어졌다가 예외로 함께 사라진다. 실제 실행 뒤에는 백업 표가 남는다(복구 확인 뒤 사람이 지운다).
--
-- 적용 전 확인 쿼리(읽기 전용 SELECT):
--   SELECT count(*) FILTER (WHERE valid_until IS NULL OR valid_until > now()) AS active, count(*) AS total FROM public.combination_recipes;   -- 80, 83
--   SELECT count(*) FROM public.combination_recipes WHERE grade_mode <> 'fixed' OR first_success_badge_id IS NOT NULL;                         -- 0
--   SELECT count(*) FROM public.user_combine_success_logs;                                                                                    -- 3
--   SELECT to_regclass('public.recipe_merge_backup_20261114_recipes');                                                                         -- NULL
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT count(*) FILTER (WHERE grade_mode = 'follow_materials') AS follow, count(*) FILTER (WHERE grade_mode = 'fixed') AS fixed FROM public.combination_recipes;   -- 20, 3
--   SELECT r.name, r.reward_points, r.valid_from, r.valid_until, r.reward_locked, cardinality(r.reward_badge_ids) AS rewards,
--          (SELECT count(*) FROM public.combination_recipe_slots s WHERE s.recipe_id = r.id) AS slots
--     FROM public.combination_recipes r WHERE r.grade_mode = 'follow_materials' ORDER BY r.name;                       -- 20행, 합치기 전 묶음의 값과 같다
--   SELECT recipe_id, count(*) FILTER (WHERE is_recipe_first) AS firsts, count(*) AS n FROM public.user_combine_success_logs GROUP BY recipe_id;   -- firsts는 전부 1 이하
--   SELECT (SELECT count(*) FROM public.recipe_merge_backup_20261114_recipes) AS backup_recipes;                         -- 80

-- ── 백업 표(비어 있는 채로 만들고 DO 블록이 채운다) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recipe_merge_backup_20261114_recipes (LIKE public.combination_recipes);
CREATE TABLE IF NOT EXISTS public.recipe_merge_backup_20261114_slots (LIKE public.combination_recipe_slots);
CREATE TABLE IF NOT EXISTS public.recipe_merge_backup_20261114_success_logs (id uuid, recipe_id uuid, is_recipe_first boolean);
CREATE TABLE IF NOT EXISTS public.recipe_merge_backup_20261114_pending (id uuid, recipe_id uuid);
CREATE TABLE IF NOT EXISTS public.recipe_merge_backup_20261114_cards (id uuid, recipe_id uuid);

ALTER TABLE public.recipe_merge_backup_20261114_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_merge_backup_20261114_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_merge_backup_20261114_success_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_merge_backup_20261114_pending ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_merge_backup_20261114_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recipe_merge_backup_20261114_recipes FROM anon, authenticated;
REVOKE ALL ON public.recipe_merge_backup_20261114_slots FROM anon, authenticated;
REVOKE ALL ON public.recipe_merge_backup_20261114_success_logs FROM anon, authenticated;
REVOKE ALL ON public.recipe_merge_backup_20261114_pending FROM anon, authenticated;
REVOKE ALL ON public.recipe_merge_backup_20261114_cards FROM anon, authenticated;

DO $merge$
DECLARE
  v_expected_recipes constant integer := 80;
  v_expected_groups  constant integer := 20;
  v_n integer;
  v_logs_before integer;
  v_logs_after integer;
BEGIN
  -- 0. 이미 합쳤으면 멈춘다
  IF EXISTS (SELECT 1 FROM public.recipe_merge_backup_20261114_recipes) THEN
    RAISE EXCEPTION 'recipe_merge: 백업 표가 비어 있지 않다 — 이미 합친 뒤다. 중단';
  END IF;

  -- 1. 후보와 묶음
  CREATE TEMP TABLE _m_cand ON COMMIT DROP AS
  SELECT r.id, r.created_at, r.reward_badge_ids,
         md5(concat_ws('|',
           coalesce(r.name, ''), r.reward_points::text, coalesce(r.valid_from::text, ''), coalesce(r.valid_until::text, ''),
           r.reward_locked::text, r.allow_no_reward::text, coalesce(r.description, ''))) AS grp,
         (SELECT array_agg(DISTINCT b.rarity::text)
            FROM (SELECT unnest(s.allowed_badge_ids) AS bid
                    FROM public.combination_recipe_slots s WHERE s.recipe_id = r.id AND s.badge_type = 'item'
                  UNION
                  SELECT unnest(r.reward_badge_ids)) x
            JOIN public.badges b ON b.id = x.bid) AS rarities,
         (SELECT count(*)
            FROM (SELECT unnest(s.allowed_badge_ids) AS bid
                    FROM public.combination_recipe_slots s WHERE s.recipe_id = r.id AND s.badge_type = 'item'
                  UNION
                  SELECT unnest(r.reward_badge_ids)) x
            LEFT JOIN public.badges b ON b.id = x.bid
           WHERE b.id IS NULL OR b.type <> 'item' OR b.deleted_at IS NOT NULL OR b.rarity IS NULL) AS bad_badges
    FROM public.combination_recipes r
   WHERE r.grade_mode = 'fixed' AND r.first_success_badge_id IS NULL
     AND (r.valid_until IS NULL OR r.valid_until > now());

  SELECT count(*) INTO v_n FROM _m_cand;
  IF v_n <> v_expected_recipes THEN
    RAISE EXCEPTION 'recipe_merge: 활성 레시피가 % 개다(기대 %). 실제 건수를 확인한 뒤 판단한다', v_n, v_expected_recipes;
  END IF;

  IF EXISTS (SELECT 1 FROM _m_cand WHERE cardinality(rarities) IS DISTINCT FROM 1 OR bad_badges > 0) THEN
    RAISE EXCEPTION 'recipe_merge: 재료·보상 배지의 등급이 한 가지가 아니거나 아이템 배지가 아닌(삭제된) 배지가 섞인 레시피가 있다';
  END IF;

  ALTER TABLE _m_cand ADD COLUMN grade text;
  UPDATE _m_cand SET grade = rarities[1];

  SELECT count(DISTINCT grp) INTO v_n FROM _m_cand;
  IF v_n <> v_expected_groups THEN
    RAISE EXCEPTION 'recipe_merge: 묶음이 % 개다(기대 %)', v_n, v_expected_groups;
  END IF;
  IF EXISTS (
    SELECT 1 FROM _m_cand GROUP BY grp
    HAVING count(*) <> 4 OR count(DISTINCT grade) <> 4
        OR NOT (array_agg(DISTINCT grade) @> ARRAY['common', 'rare', 'epic', 'mystic'])
  ) THEN
    RAISE EXCEPTION 'recipe_merge: 4개 레시피가 common·rare·epic·mystic 한 개씩이 아닌 묶음이 있다';
  END IF;

  -- 2. 슬롯·보상의 «아이템 배지 묶음» 대응 점검
  CREATE TEMP TABLE _m_sig ON COMMIT DROP AS
  SELECT c.id AS recipe_id, c.grp, s.slot_order, s.badge_type,
         CASE WHEN s.badge_type = 'item' THEN
           (SELECT string_agg(k.key, ',' ORDER BY k.key)
              FROM (SELECT DISTINCT coalesce(b.item_book_id::text, '-') || ':' || b.name AS key
                      FROM unnest(s.allowed_badge_ids) u(bid) JOIN public.badges b ON b.id = u.bid) k)
         ELSE
           (SELECT string_agg(u.bid::text, ',' ORDER BY u.bid::text) FROM unnest(s.allowed_badge_ids) u(bid))
         END AS sig
    FROM _m_cand c JOIN public.combination_recipe_slots s ON s.recipe_id = c.id;

  IF EXISTS (SELECT 1 FROM _m_sig GROUP BY grp, slot_order HAVING count(*) <> 4 OR count(DISTINCT sig) <> 1 OR count(DISTINCT badge_type) <> 1) THEN
    RAISE EXCEPTION 'recipe_merge: 묶음 안에서 슬롯 위치별 아이템 배지 묶음(또는 보유 조건 후보)이 4개 레시피에서 같지 않다';
  END IF;

  CREATE TEMP TABLE _m_rewardkey ON COMMIT DROP AS
  SELECT c.grp, c.id AS recipe_id, u.bid, u.pos,
         coalesce(b.item_book_id::text, '-') || ':' || b.name AS key, b.rarity::text AS rarity
    FROM _m_cand c
    CROSS JOIN LATERAL unnest(c.reward_badge_ids) WITH ORDINALITY AS u(bid, pos)
    JOIN public.badges b ON b.id = u.bid;

  IF EXISTS (SELECT 1 FROM _m_rewardkey GROUP BY recipe_id HAVING count(*) <> count(DISTINCT key)) THEN
    RAISE EXCEPTION 'recipe_merge: 한 레시피의 보상 배지에 같은 묶음이 두 번 들어 있다';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT grp, recipe_id, string_agg(key, ',' ORDER BY key) AS sig FROM _m_rewardkey GROUP BY grp, recipe_id
    ) t GROUP BY grp HAVING count(DISTINCT sig) <> 1
  ) OR EXISTS (
    -- 보상 배지가 있는 레시피와 없는 레시피가 한 묶음에 섞이면 안 된다
    SELECT 1 FROM _m_cand c GROUP BY c.grp HAVING count(*) FILTER (WHERE cardinality(c.reward_badge_ids) = 0) NOT IN (0, 4)
  ) THEN
    RAISE EXCEPTION 'recipe_merge: 묶음 안에서 보상 배지 묶음이 4개 레시피에서 같지 않다';
  END IF;

  -- 지워질 레시피를 가리키는 배지 조건이 있으면 멈춘다
  IF EXISTS (
    SELECT 1 FROM public.badges b JOIN _m_cand c ON b.condition_json::text LIKE '%' || c.id::text || '%'
  ) THEN
    RAISE EXCEPTION 'recipe_merge: 배지 조건(condition_json)이 합칠 레시피의 id를 가리킨다. 중단';
  END IF;

  -- 3. 대표 레시피와 옛 id → 대표 id 대응
  CREATE TEMP TABLE _m_rep ON COMMIT DROP AS
  SELECT DISTINCT ON (grp) grp, id AS rep_id FROM _m_cand ORDER BY grp, created_at, id;
  CREATE TEMP TABLE _m_map ON COMMIT DROP AS
  SELECT c.id AS old_id, r.rep_id FROM _m_cand c JOIN _m_rep r ON r.grp = c.grp;

  -- 백업
  INSERT INTO public.recipe_merge_backup_20261114_recipes SELECT * FROM public.combination_recipes WHERE id IN (SELECT old_id FROM _m_map);
  INSERT INTO public.recipe_merge_backup_20261114_slots SELECT * FROM public.combination_recipe_slots WHERE recipe_id IN (SELECT old_id FROM _m_map);
  INSERT INTO public.recipe_merge_backup_20261114_success_logs
    SELECT id, recipe_id, is_recipe_first FROM public.user_combine_success_logs WHERE recipe_id IN (SELECT old_id FROM _m_map);
  INSERT INTO public.recipe_merge_backup_20261114_pending
    SELECT id, recipe_id FROM public.combine_pending_results WHERE recipe_id IN (SELECT old_id FROM _m_map);
  INSERT INTO public.recipe_merge_backup_20261114_cards
    SELECT id, recipe_id FROM public.today_cards WHERE recipe_id IN (SELECT old_id FROM _m_map);

  SELECT count(*) INTO v_logs_before FROM public.user_combine_success_logs;

  -- 새 슬롯(묶음별 슬롯 위치마다 4개 레시피의 후보를 합친다)
  CREATE TEMP TABLE _m_newslots ON COMMIT DROP AS
  SELECT c.grp, s.slot_order, min(s.badge_type) AS badge_type, array_agg(DISTINCT u.bid ORDER BY u.bid) AS allowed
    FROM _m_cand c
    JOIN public.combination_recipe_slots s ON s.recipe_id = c.id
    CROSS JOIN LATERAL unnest(s.allowed_badge_ids) AS u(bid)
   GROUP BY c.grp, s.slot_order;

  -- 새 보상 배지(대표의 묶음 순서, 묶음 안은 common → rare → epic → mystic)
  CREATE TEMP TABLE _m_newreward ON COMMIT DROP AS
  SELECT rep.grp,
         coalesce(
           (SELECT array_agg(a.bid ORDER BY p.pos,
                             CASE a.rarity WHEN 'common' THEN 1 WHEN 'rare' THEN 2 WHEN 'epic' THEN 3 ELSE 4 END, a.bid)
              FROM _m_rewardkey a
              JOIN _m_rewardkey p ON p.recipe_id = rep.rep_id AND p.key = a.key
             WHERE a.grp = rep.grp),
           ARRAY[]::uuid[]) AS ids
    FROM _m_rep rep;

  -- 대표 레시피를 등급 대응형으로 바꾼다
  UPDATE public.combination_recipes r
     SET grade_mode = 'follow_materials', reward_badge_ids = n.ids
    FROM _m_rep rep JOIN _m_newreward n ON n.grp = rep.grp
   WHERE r.id = rep.rep_id;

  DELETE FROM public.combination_recipe_slots WHERE recipe_id IN (SELECT rep_id FROM _m_rep);
  INSERT INTO public.combination_recipe_slots (recipe_id, slot_order, badge_type, allowed_badge_ids)
  SELECT rep.rep_id, s.slot_order, s.badge_type, s.allowed
    FROM _m_newslots s JOIN _m_rep rep ON rep.grp = s.grp;

  -- 4. 참조 옮기기
  UPDATE public.user_combine_success_logs SET is_recipe_first = false
   WHERE is_recipe_first AND recipe_id IN (SELECT old_id FROM _m_map);
  UPDATE public.user_combine_success_logs l SET recipe_id = m.rep_id
    FROM _m_map m WHERE l.recipe_id = m.old_id AND m.old_id <> m.rep_id;
  UPDATE public.user_combine_success_logs l SET is_recipe_first = true
    FROM (SELECT DISTINCT ON (recipe_id) id
            FROM public.user_combine_success_logs
           WHERE recipe_id IN (SELECT rep_id FROM _m_rep)
           ORDER BY recipe_id, attempted_at, id) f
   WHERE l.id = f.id;
  UPDATE public.combine_pending_results p SET recipe_id = m.rep_id
    FROM _m_map m WHERE p.recipe_id = m.old_id AND m.old_id <> m.rep_id;
  UPDATE public.today_cards t SET recipe_id = m.rep_id
    FROM _m_map m WHERE t.recipe_id = m.old_id AND m.old_id <> m.rep_id;

  -- 5. 대표가 아닌 레시피 지우기(슬롯은 CASCADE)
  DELETE FROM public.combination_recipes WHERE id IN (SELECT old_id FROM _m_map WHERE old_id <> rep_id);

  -- 6. 사후 검사
  SELECT count(*) INTO v_n FROM public.combination_recipes WHERE grade_mode = 'follow_materials';
  IF v_n <> v_expected_groups THEN
    RAISE EXCEPTION 'recipe_merge: 합친 레시피가 % 개다(기대 %)', v_n, v_expected_groups;
  END IF;
  SELECT count(*) INTO v_n FROM public.combination_recipes WHERE id IN (SELECT old_id FROM _m_map WHERE old_id <> rep_id);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'recipe_merge: 지웠어야 할 레시피가 % 개 남았다', v_n;
  END IF;
  SELECT count(*) INTO v_logs_after FROM public.user_combine_success_logs;
  IF v_logs_after <> v_logs_before THEN
    RAISE EXCEPTION 'recipe_merge: 믹스 성공 기록 수가 달라졌다(% → %)', v_logs_before, v_logs_after;
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_combine_success_logs WHERE recipe_id IN (SELECT old_id FROM _m_map WHERE old_id <> rep_id))
     OR EXISTS (SELECT 1 FROM public.combine_pending_results WHERE recipe_id IN (SELECT old_id FROM _m_map WHERE old_id <> rep_id))
     OR EXISTS (SELECT 1 FROM public.today_cards WHERE recipe_id IN (SELECT old_id FROM _m_map WHERE old_id <> rep_id)) THEN
    RAISE EXCEPTION 'recipe_merge: 지워진 레시피를 가리키는 참조가 남았다';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_combine_success_logs WHERE is_recipe_first GROUP BY recipe_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'recipe_merge: 한 레시피에 첫 성공 표시가 둘 이상이다';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.combination_recipes r
     WHERE r.grade_mode = 'follow_materials'
       AND ((SELECT count(*) FROM public.combination_recipe_slots s WHERE s.recipe_id = r.id)
            <> (SELECT count(DISTINCT slot_order) FROM _m_newslots n JOIN _m_rep rep ON rep.grp = n.grp WHERE rep.rep_id = r.id))
  ) THEN
    RAISE EXCEPTION 'recipe_merge: 합친 레시피의 슬롯 수가 계획과 다르다';
  END IF;
END
$merge$;

-- ── 롤백 실측 (실제 적용 전 드라이런: 이 문장을 위 DO 블록 뒤에 붙여 같은 호출로 실행하면 전부 되돌아간다) ──────────────
-- DO $$ BEGIN RAISE EXCEPTION 'rollback-probe'; END $$;

-- 되돌림 SQL: 341_merge_recipes_grade_follow_down.sql (짝 파일)
