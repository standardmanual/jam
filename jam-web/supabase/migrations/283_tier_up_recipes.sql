-- 283_tier_up_recipes.sql
-- JAM 2.0 묶음 7 · 7-7: 등급 올리기 레시피 1,350건 입력 (트라이브 5곳 × 아이템 90종 × 올릴 등급 3개, 티켓 20261022_1138 2회)
--
-- 이 파일은 gen-recipe-sql.mjs가 7-6 계획(트라이브 원고 01~05)에서 트라이브 이름과 건수 기대를 읽어 만든다. 손으로 고치지 말고 생성기를 고쳐 다시 만든다
-- (node scripts/jam2-content/gen-recipe-sql.mjs --write). 시험이 생성 결과와 이 파일이 같은지 비교한다.
-- 레시피 id와 후보 id는 파일에 적지 않는다. 레시피와 칸은 아래 SQL이 DB의 아이템 배지를 읽어 INSERT … SELECT로 만든다.
--
-- 이 파일은 7-7a(믹스 화면이 재료 후보를 레시피를 고를 때만 불러오게 고침, 티켓 20261022_2119)가 staging에 반영된 뒤에 공용 DB에 적용한다.
-- 레시피가 1,350건 늘면 지금 믹스 화면은 후보 약 607,500개를 한 번에 읽기 때문이다. 그 전에는 파일만 만들어 둔다.
--
-- 하는 일 (한 트랜잭션, 파일만 쓰고 실행은 롤백 실측과 사용자 승인 뒤 카리나가 한다)
--   1. 레시피 1,350건(combination_recipes): 새 트라이브 5곳의 아이템 이름 450개(트라이브마다 90종) × 올릴 등급 3개(Common→Rare, Rare→Epic, Epic→Mystic).
--      보상은 같은 컬렉션·같은 이름의 바로 위 등급 아이템 배지 1개다(운영 로직 8.4절). Mystic은 재료가 되지 않는다.
--      이름은 «{아이템 이름} {보상 등급} 올리기», 설명은 «같은 트라이브의 {재료 등급} 아이템 배지 다섯 개를 **{아이템 이름}** {보상 등급} 한 개로 바꿉니다.»다(사용자 결정 2026-10-22 5번, 습니다체).
--      성공 포인트는 0이다(결정 6번. 포인트 없이 위 등급 아이템 배지만 받는다). reward_locked는 false(결과를 열린 채 지급), allow_no_reward는 false, valid_until은 비운다.
--   2. 재료 칸 6,750개(combination_recipe_slots): 레시피마다 5개(slot_order 0~4), badge_type은 item.
--      후보(allowed_badge_ids)는 같은 트라이브·재료 등급의 아이템 배지 90종 전부(어느 컬렉션의 것이든)이고 5칸이 같다. 등급을 섞어 넣을 수 없다.
--      트라이브·등급마다 후보 id 배열을 한 번 모아(임시 표 _jam2_up_pool) 칸에 쓴다.
--   3. 공개 시작(valid_from)은 2099-01-01 00:00:00+09 자리 값(2099-01-01 00:00 KST)이다(단서 레시피 281과 같다). 일반 유저와 프로덕션에는 보이지 않고, 운영자만 staging 믹스 화면에서 시험할 수 있다.
--      오픈 때 컬렉션을 트라이브마다 3개로 줄이면, 열리는 컬렉션마다 그 컬렉션이 보상인 레시피 27건(아이템 9종 × 3등급)을 함께 연다.
--      파일 끝의 «컬렉션을 열 때 쓰는 SQL»이 그 예시이고 자동 연동 코드는 없다(오픈 직전 목록 7-9).
--
-- 찾는 방법과 멈추는 조건
--   - 트라이브는 이름으로 찾고 한 건씩 맞지 않으면 멈춘다. 아이템 배지는 그 트라이브 컬렉션에 속한 type item, 삭제되지 않은 배지다.
--   - 트라이브 5곳 × 등급 4개 = 20곳마다 아이템 배지가 원고의 아이템 수(90개)와 다르면 멈춘다(재료 후보가 되는 Common·Rare·Epic 15곳과 보상으로만 쓰이는 Mystic 5곳).
--   - 같은 컬렉션·같은 이름의 아이템 배지가 4등급에 한 건씩 있지 않으면 멈춘다(보상 배지를 한 건씩 찾지 못하는 경우).
--   - 레시피가 1,350건이 아니거나 이름이 서로 겹치면 멈추고, 같은 이름의 레시피가 이미 있으면 멈춘다. 이 파일은 한 번만 적용한다.
--   - 재료 후보에 보상 배지가 들어 있으면 멈춘다.
--   - 끝에서 레시피·칸·포인트·공개 시작·후보의 등급(재료 등급)·보상의 등급(바로 위 등급)·재료 후보에 Mystic 배지 없음·이름 중복 없음을 검사하고,
--     이 파일이 늘린 것이 레시피와 칸뿐인지(적용 전 건수 대비) 확인한 뒤 어긋나면 전체를 되돌린다(트랜잭션).
--
-- 적용 순서: 7-7a가 staging에 반영된 뒤. 7-6의 다섯 트라이브 SQL(276~280) 뒤. 281(단서 레시피)·282(끄기)와는 순서가 상관없다.
-- 실행: BEGIN/COMMIT 없이 한 번의 호출로 통째로 실행한다. 롤백 실측은 이 파일 뒤에 일부러 오류를 내는 문장을 붙여 같은 호출로 실행한다.
--
-- 적용 전 확인 쿼리(읽기 전용 SELECT):
--   -- 새 트라이브 5곳의 아이템 배지가 등급마다 90개다 (20행, 모두 90. 몸통의 2단계가 같은 검사를 한다)
--   SELECT t.name, b.rarity, count(*) FROM public.badges b
--     JOIN public.item_books ib ON ib.id = b.item_book_id JOIN public.tribes t ON t.id = ib.tribe_id
--    WHERE t.name IN ('한입만 연구회', '찰칵단', '비사이드 레코즈', '소나무 잡화점', '혼자들') AND b.type = 'item' AND b.deleted_at IS NULL
--    GROUP BY t.name, b.rarity ORDER BY t.name, b.rarity;
--   -- 이 파일의 이름 틀과 같은 레시피가 없다 (0)
--   SELECT count(*) FROM public.combination_recipes cr WHERE cr.name ~ ' (Rare|Epic|Mystic) 올리기$';
--   -- 적용 전 레시피와 칸 수(적용 뒤 «전체 레시피와 칸»에 이 값을 더해 비교한다)
--   SELECT (SELECT count(*) FROM public.combination_recipes) AS recipes, (SELECT count(*) FROM public.combination_recipe_slots) AS slots;

-- ----------------------------------------------------------------
-- 0. 작업용 임시 표
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS pg_temp._jam2_up_base;
DROP TABLE IF EXISTS pg_temp._jam2_up_recipe;
DROP TABLE IF EXISTS pg_temp._jam2_up_pool;
DROP TABLE IF EXISTS pg_temp._jam2_up_tribe;
DROP TABLE IF EXISTS pg_temp._jam2_tier_pair;

-- 적용 전 레시피·칸 수: 끝 검사가 «이 파일이 늘린 것은 레시피 1,350건과 칸 6,750개뿐»임을 확인한다
CREATE TEMP TABLE _jam2_up_base AS
  SELECT (SELECT count(*) FROM public.combination_recipes) AS recipes,
         (SELECT count(*) FROM public.combination_recipe_slots) AS slots;

-- 등급 올리기 짝 3개: 재료 등급 → 바로 위 보상 등급. Mystic은 재료 열에 없으므로 재료가 되지 않는다
CREATE TEMP TABLE _jam2_tier_pair (
  pair_ord         INTEGER NOT NULL UNIQUE,
  material_rarity  public.badge_rarity PRIMARY KEY,
  reward_rarity    public.badge_rarity NOT NULL UNIQUE,
  material_label   TEXT NOT NULL,
  reward_label     TEXT NOT NULL
);

INSERT INTO _jam2_tier_pair (pair_ord, material_rarity, reward_rarity, material_label, reward_label) VALUES
  (0, 'common', 'rare', 'Common', 'Rare'),
  (1, 'rare', 'epic', 'Rare', 'Epic'),
  (2, 'epic', 'mystic', 'Epic', 'Mystic');

-- 새 트라이브 5곳: 이름, 원고의 아이템 수(= 등급마다 있어야 할 아이템 배지 수)
CREATE TEMP TABLE _jam2_up_tribe (
  name       TEXT PRIMARY KEY,
  pool_size  INTEGER NOT NULL,
  tribe_id   UUID,
  matches    INTEGER
);

INSERT INTO _jam2_up_tribe (name, pool_size) VALUES
  ('한입만 연구회', 90),
  ('찰칵단', 90),
  ('비사이드 레코즈', 90),
  ('소나무 잡화점', 90),
  ('혼자들', 90);

-- ----------------------------------------------------------------
-- 1. 트라이브를 이름으로 찾고, 한 건씩 찾지 못하면 멈춘다
-- ----------------------------------------------------------------
UPDATE _jam2_up_tribe u
   SET matches  = (SELECT count(*) FROM public.tribes t WHERE t.name = u.name),
       tribe_id = (SELECT t.id FROM public.tribes t WHERE t.name = u.name ORDER BY t.created_at LIMIT 1);

DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(*) INTO v_bad FROM _jam2_up_tribe WHERE matches IS DISTINCT FROM 1;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '트라이브를 이름으로 한 건씩 찾지 못한 것이 %곳입니다(기대: 5곳 모두 1건). 7-6의 트라이브 SQL(276~280)이 적용되지 않았거나 같은 이름이 둘 이상 있습니다.', v_bad;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. 후보 모으기: 트라이브·등급마다 아이템 배지 id를 한 번 모은다 (칸 6,750개가 이 배열을 그대로 쓴다)
-- ----------------------------------------------------------------
CREATE TEMP TABLE _jam2_up_pool (
  tribe_id     UUID NOT NULL,
  rarity       public.badge_rarity NOT NULL,
  badge_count  INTEGER NOT NULL,
  badge_ids    UUID[] NOT NULL,
  PRIMARY KEY (tribe_id, rarity)
);

-- 후보 배열의 순서는 의미가 없다(유저는 가진 배지 중 후보에 드는 것을 낸다). 같은 입력이면 같은 배열이 되도록 id 순으로 둔다
INSERT INTO _jam2_up_pool (tribe_id, rarity, badge_count, badge_ids)
SELECT ib.tribe_id, b.rarity, count(*), array_agg(b.id ORDER BY b.id)
  FROM public.badges b
  JOIN public.item_books ib ON ib.id = b.item_book_id
 WHERE ib.tribe_id IN (SELECT tribe_id FROM _jam2_up_tribe)
   AND b.type = 'item' AND b.rarity IS NOT NULL AND b.deleted_at IS NULL
 GROUP BY ib.tribe_id, b.rarity;

DO $$
DECLARE
  v_bad INTEGER;
  v_list TEXT;
BEGIN
  -- 트라이브 × 등급 20곳마다 아이템 배지가 원고의 아이템 수(90개)와 같다
  SELECT count(*), string_agg(u.name || ' ' || r.rarity::text || '=' || COALESCE(p.badge_count, 0), ', ' ORDER BY u.name, r.rarity)
    INTO v_bad, v_list
    FROM _jam2_up_tribe u
   CROSS JOIN (SELECT material_rarity AS rarity FROM _jam2_tier_pair UNION SELECT reward_rarity FROM _jam2_tier_pair) r
    LEFT JOIN _jam2_up_pool p ON p.tribe_id = u.tribe_id AND p.rarity = r.rarity
   WHERE COALESCE(p.badge_count, 0) <> u.pool_size;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '아이템 배지가 원고의 아이템 수(90개)와 다른 트라이브·등급이 %곳입니다(트라이브 등급=개수: %. 기대: 20곳 모두 90개). 7-6의 트라이브 SQL(276~280)이 적용되지 않았거나 원고 밖 아이템 배지가 있습니다.', v_bad, v_list;
  END IF;

  -- 같은 컬렉션·같은 이름의 아이템 배지가 4등급에 한 건씩 있다 (보상 배지를 한 건씩 찾을 수 있다)
  SELECT count(*) INTO v_bad
    FROM (SELECT b.item_book_id, b.name
            FROM public.badges b
            JOIN public.item_books ib ON ib.id = b.item_book_id
           WHERE ib.tribe_id IN (SELECT tribe_id FROM _jam2_up_tribe)
             AND b.type = 'item' AND b.deleted_at IS NULL
           GROUP BY b.item_book_id, b.name
          HAVING count(*) <> 4 OR count(DISTINCT b.rarity) <> 4) x;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '같은 컬렉션·같은 이름의 아이템 배지가 4등급에 한 건씩 있지 않은 이름이 %개입니다(보상 배지를 한 건씩 찾지 못합니다).', v_bad;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 3. 레시피 1,350건 만들기: 보상 배지(재료 등급의 바로 위 등급)마다 한 건. 이름·설명은 결정 5의 틀
-- ----------------------------------------------------------------
CREATE TEMP TABLE _jam2_up_recipe (
  recipe_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id         UUID NOT NULL,
  material_rarity  public.badge_rarity NOT NULL,
  reward_rarity    public.badge_rarity NOT NULL,
  reward_id        UUID NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL
);

INSERT INTO _jam2_up_recipe (tribe_id, material_rarity, reward_rarity, reward_id, name, description)
SELECT u.tribe_id, p.material_rarity, p.reward_rarity, b.id,
       b.name || ' ' || p.reward_label || ' 올리기',
       '같은 트라이브의 ' || p.material_label || ' 아이템 배지 다섯 개를 **' || b.name || '** ' || p.reward_label || ' 한 개로 바꿉니다.'
  FROM _jam2_up_tribe u
  JOIN public.item_books ib ON ib.tribe_id = u.tribe_id
  JOIN public.badges b ON b.item_book_id = ib.id
  JOIN _jam2_tier_pair p ON p.reward_rarity = b.rarity
 WHERE b.type = 'item' AND b.deleted_at IS NULL
 ORDER BY u.name, p.pair_ord, ib.name, b.name;

DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(*) INTO v_bad FROM _jam2_up_recipe;
  IF v_bad <> 1350 THEN
    RAISE EXCEPTION '만든 등급 올리기 레시피가 %건입니다(기대 1350).', v_bad;
  END IF;

  SELECT count(*) - count(DISTINCT name) INTO v_bad FROM _jam2_up_recipe;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '등급 올리기 레시피 이름이 서로 겹치는 것이 %건입니다(아이템 이름이 겹칩니다).', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.combination_recipes cr JOIN _jam2_up_recipe r ON r.name = cr.name;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '등급 올리기 레시피와 같은 이름의 레시피가 이미 %건 있습니다. 이 파일은 한 번만 적용합니다.', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM _jam2_up_recipe r
    JOIN _jam2_up_pool p ON p.tribe_id = r.tribe_id AND p.rarity = r.material_rarity
   WHERE r.reward_id = ANY (p.badge_ids);
  IF v_bad > 0 THEN
    RAISE EXCEPTION '재료 후보에 보상 배지가 들어 있는 레시피가 %건입니다.', v_bad;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 4. 레시피 1,350건과 재료 칸 6,750개 넣기 (공개 시작은 먼 미래 자리 값, 성공 포인트 0)
-- ----------------------------------------------------------------
INSERT INTO public.combination_recipes (id, name, description, reward_points, reward_badge_ids, valid_from)
SELECT r.recipe_id, r.name, r.description, 0, ARRAY[r.reward_id], TIMESTAMPTZ '2099-01-01 00:00:00+09'
  FROM _jam2_up_recipe r
  JOIN _jam2_up_tribe u ON u.tribe_id = r.tribe_id
  JOIN _jam2_tier_pair p ON p.material_rarity = r.material_rarity
 ORDER BY u.name, p.pair_ord, r.name;

INSERT INTO public.combination_recipe_slots (recipe_id, slot_order, badge_type, allowed_badge_ids)
SELECT r.recipe_id, s.slot_order, 'item', p.badge_ids
  FROM _jam2_up_recipe r
  JOIN _jam2_up_pool p ON p.tribe_id = r.tribe_id AND p.rarity = r.material_rarity
 CROSS JOIN generate_series(0, 4) AS s(slot_order);

-- ----------------------------------------------------------------
-- 5. 끝 검사 — 어긋나면 오류로 멈추고 트랜잭션 전체가 되돌아간다
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_n BIGINT;
BEGIN
  -- 레시피 1,350건: 이름·설명·성공 포인트·보상 배지가 계획과 같고, 자리 값 공개 시작, 종료 없음, 열린 채 지급, 보상 없음 허용 꺼짐
  SELECT count(*) INTO v_n
    FROM public.combination_recipes cr
    JOIN _jam2_up_recipe r ON r.recipe_id = cr.id
   WHERE cr.name = r.name AND cr.description = r.description AND cr.reward_points = 0
     AND cr.reward_badge_ids = ARRAY[r.reward_id]
     AND cr.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND cr.valid_until IS NULL
     AND NOT cr.reward_locked AND NOT cr.allow_no_reward;
  IF v_n <> 1350 THEN
    RAISE EXCEPTION '끝 검사: 계획과 같은 레시피가 %건입니다(기대 1350).', v_n;
  END IF;

  -- 이름이 서로 다르고, 이 이름을 가진 레시피는 이 파일의 1350건뿐이다
  SELECT count(*) INTO v_n FROM public.combination_recipes WHERE name IN (SELECT name FROM _jam2_up_recipe);
  IF v_n <> 1350 THEN
    RAISE EXCEPTION '끝 검사: 등급 올리기 이름을 가진 레시피가 %건입니다(기대 1350).', v_n;
  END IF;
  SELECT count(DISTINCT cr.name) INTO v_n
    FROM public.combination_recipes cr JOIN _jam2_up_recipe r ON r.recipe_id = cr.id;
  IF v_n <> 1350 THEN
    RAISE EXCEPTION '끝 검사: 서로 다른 이름이 %개입니다(기대 1350).', v_n;
  END IF;

  -- 재료 칸 6,750개, 레시피마다 5개이고 slot_order는 0~4이다
  SELECT count(*) INTO v_n FROM public.combination_recipe_slots cs WHERE cs.recipe_id IN (SELECT recipe_id FROM _jam2_up_recipe);
  IF v_n <> 6750 THEN
    RAISE EXCEPTION '끝 검사: 등급 올리기 레시피의 칸이 %개입니다(기대 6750).', v_n;
  END IF;
  SELECT count(*) INTO v_n
    FROM (SELECT cs.recipe_id
            FROM public.combination_recipe_slots cs
           WHERE cs.recipe_id IN (SELECT recipe_id FROM _jam2_up_recipe)
           GROUP BY cs.recipe_id
          HAVING count(*) = 5 AND min(cs.slot_order) = 0 AND max(cs.slot_order) = 4) x;
  IF v_n <> 1350 THEN
    RAISE EXCEPTION '끝 검사: 칸이 5개(0~4)인 레시피가 %건입니다(기대 1350).', v_n;
  END IF;

  -- 칸은 item 타입이고 후보는 같은 트라이브·재료 등급의 모은 배열 그대로이며 90개다
  SELECT count(*) INTO v_n
    FROM public.combination_recipe_slots cs
    JOIN _jam2_up_recipe r ON r.recipe_id = cs.recipe_id
    JOIN _jam2_up_pool p ON p.tribe_id = r.tribe_id AND p.rarity = r.material_rarity
    JOIN _jam2_up_tribe u ON u.tribe_id = r.tribe_id
   WHERE cs.badge_type = 'item' AND cs.allowed_badge_ids = p.badge_ids
     AND array_length(cs.allowed_badge_ids, 1) = u.pool_size;
  IF v_n <> 6750 THEN
    RAISE EXCEPTION '끝 검사: 후보가 계획과 같은 칸이 %개입니다(기대 6750).', v_n;
  END IF;

  -- 모은 배열이 DB의 아이템 배지와 같다: 트라이브·등급마다 type item, 삭제되지 않은 배지 전부이고 그 등급이다 (20곳 모두)
  SELECT count(*) INTO v_n
    FROM _jam2_up_pool p
   WHERE p.badge_ids = ARRAY(SELECT b.id
                               FROM public.badges b JOIN public.item_books ib ON ib.id = b.item_book_id
                              WHERE ib.tribe_id = p.tribe_id AND b.rarity = p.rarity
                                AND b.type = 'item' AND b.deleted_at IS NULL
                              ORDER BY b.id);
  IF v_n <> 20 THEN
    RAISE EXCEPTION '끝 검사: 후보 배열이 DB의 아이템 배지와 같은 트라이브·등급이 %곳입니다(기대 20).', v_n;
  END IF;

  -- 후보의 등급은 재료 등급이다: 칸에 쓰인 서로 다른 배열(트라이브 × 재료 등급 15개)의 배지 1350개가 모두 그 트라이브·그 등급의 아이템 배지다
  SELECT count(*) INTO v_n
    FROM (SELECT DISTINCT r.tribe_id, r.material_rarity, cs.allowed_badge_ids AS ids
            FROM public.combination_recipe_slots cs
            JOIN _jam2_up_recipe r ON r.recipe_id = cs.recipe_id) d
   CROSS JOIN LATERAL unnest(d.ids) AS ab(id)
    JOIN public.badges b ON b.id = ab.id
    JOIN public.item_books ib ON ib.id = b.item_book_id
   WHERE b.type = 'item' AND b.deleted_at IS NULL AND b.rarity = d.material_rarity AND ib.tribe_id = d.tribe_id;
  IF v_n <> 1350 THEN
    RAISE EXCEPTION '끝 검사: 재료 등급·트라이브가 맞는 후보가 %개입니다(기대 1350).', v_n;
  END IF;

  -- Mystic은 재료가 아니다: 재료 등급이 Mystic인 레시피가 없고, 칸 후보에 Mystic 배지가 없다
  SELECT count(*) INTO v_n FROM _jam2_up_recipe WHERE material_rarity = 'mystic';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '끝 검사: 재료 등급이 Mystic인 레시피가 %건입니다(기대 0).', v_n;
  END IF;
  SELECT count(*) INTO v_n
    FROM (SELECT DISTINCT cs.allowed_badge_ids AS ids
            FROM public.combination_recipe_slots cs
           WHERE cs.recipe_id IN (SELECT recipe_id FROM _jam2_up_recipe)) d
   CROSS JOIN LATERAL unnest(d.ids) AS ab(id)
    JOIN public.badges b ON b.id = ab.id
   WHERE b.rarity = 'mystic';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '끝 검사: 칸 후보에 Mystic 배지가 %개 들어 있습니다(기대 0).', v_n;
  END IF;

  -- 보상은 재료 등급의 바로 위 등급 아이템 배지 1개이고, 짝(Common→Rare, Rare→Epic, Epic→Mystic)마다 450건이다
  SELECT count(*) INTO v_n
    FROM public.combination_recipes cr
    JOIN _jam2_up_recipe r ON r.recipe_id = cr.id
    JOIN _jam2_tier_pair p ON p.material_rarity = r.material_rarity
    JOIN public.badges b ON b.id = cr.reward_badge_ids[1]
   WHERE array_length(cr.reward_badge_ids, 1) = 1
     AND b.type = 'item' AND b.deleted_at IS NULL AND b.rarity = p.reward_rarity AND r.reward_rarity = p.reward_rarity;
  IF v_n <> 1350 THEN
    RAISE EXCEPTION '끝 검사: 보상이 재료 등급의 바로 위 등급 아이템 배지인 레시피가 %건입니다(기대 1350).', v_n;
  END IF;
  SELECT count(*) INTO v_n
    FROM _jam2_tier_pair p
   WHERE (SELECT count(*) FROM _jam2_up_recipe r WHERE r.material_rarity = p.material_rarity AND r.reward_rarity = p.reward_rarity) = 450;
  IF v_n <> 3 THEN
    RAISE EXCEPTION '끝 검사: 레시피가 450건인 등급 짝이 %개입니다(기대 3).', v_n;
  END IF;

  -- 트라이브마다 레시피가 아이템 수 × 3 = 270건이다
  SELECT count(*) INTO v_n
    FROM _jam2_up_tribe u
   WHERE (SELECT count(*) FROM _jam2_up_recipe r WHERE r.tribe_id = u.tribe_id) = u.pool_size * 3;
  IF v_n <> 5 THEN
    RAISE EXCEPTION '끝 검사: 레시피가 아이템 수 × 3건인 트라이브가 %곳입니다(기대 5).', v_n;
  END IF;

  -- 후보에 보상 배지가 없고, 성공 포인트는 모두 0이다
  SELECT count(*) INTO v_n
    FROM public.combination_recipe_slots cs
    JOIN public.combination_recipes cr ON cr.id = cs.recipe_id
   WHERE cs.recipe_id IN (SELECT recipe_id FROM _jam2_up_recipe) AND cr.reward_badge_ids[1] = ANY (cs.allowed_badge_ids);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '끝 검사: 후보에 보상 배지가 들어 있는 칸이 %개입니다(기대 0).', v_n;
  END IF;
  SELECT count(*) INTO v_n
    FROM public.combination_recipes cr JOIN _jam2_up_recipe r ON r.recipe_id = cr.id
   WHERE cr.reward_points <> 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '끝 검사: 성공 포인트가 0이 아닌 레시피가 %건입니다(기대 0).', v_n;
  END IF;

  -- 이 파일이 늘린 것은 레시피 1,350건과 칸 6,750개뿐이다(281의 단서 레시피를 포함한 기존 행은 그대로다)
  SELECT count(*) INTO v_n FROM public.combination_recipes;
  IF v_n <> (SELECT recipes FROM _jam2_up_base) + 1350 THEN
    RAISE EXCEPTION '끝 검사: 전체 레시피가 %건입니다(기대 적용 전 + 1350).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.combination_recipe_slots;
  IF v_n <> (SELECT slots FROM _jam2_up_base) + 6750 THEN
    RAISE EXCEPTION '끝 검사: 전체 칸이 %개입니다(기대 적용 전 + 6750).', v_n;
  END IF;
END $$;

DROP TABLE _jam2_up_recipe;
DROP TABLE _jam2_up_pool;
DROP TABLE _jam2_up_tribe;
DROP TABLE _jam2_tier_pair;
DROP TABLE _jam2_up_base;

-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   -- 등급 올리기 레시피 1,350건: 자리 값 공개 시작, 이름과 설명이 틀에 맞는다 (1350)
--   SELECT count(*) FROM public.combination_recipes cr WHERE cr.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND cr.name ~ ' (Rare|Epic|Mystic) 올리기$' AND cr.description ~ '^같은 트라이브의 (Common|Rare|Epic) 아이템 배지 다섯 개를 \*\*.+\*\* (Rare|Epic|Mystic) 한 개로 바꿉니다\.$';
--   -- 보상 배지의 등급별 레시피 수 (rare 450, epic 450, mystic 450)
--   SELECT rb.rarity, count(*) FROM public.combination_recipes cr
--     JOIN public.badges rb ON rb.id = cr.reward_badge_ids[1]
--    WHERE cr.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND cr.name ~ ' (Rare|Epic|Mystic) 올리기$' GROUP BY rb.rarity ORDER BY rb.rarity;
--   -- 재료 칸 6,750개, 칸마다 후보 90개 (6750, 90, 90)
--   SELECT count(*), min(array_length(s.allowed_badge_ids, 1)), max(array_length(s.allowed_badge_ids, 1))
--     FROM public.combination_recipe_slots s JOIN public.combination_recipes cr ON cr.id = s.recipe_id
--    WHERE cr.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND cr.name ~ ' (Rare|Epic|Mystic) 올리기$';
--   -- 칸이 5개가 아닌 레시피 (0행)
--   SELECT cr.name, count(s.id) FROM public.combination_recipes cr
--     LEFT JOIN public.combination_recipe_slots s ON s.recipe_id = cr.id
--    WHERE cr.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND cr.name ~ ' (Rare|Epic|Mystic) 올리기$'
--    GROUP BY cr.id HAVING count(s.id) <> 5;
--   -- 성공 포인트가 0이 아닌 레시피 (0)
--   SELECT count(*) FROM public.combination_recipes cr WHERE cr.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND cr.name ~ ' (Rare|Epic|Mystic) 올리기$' AND cr.reward_points <> 0;
--   -- 보상 등급별 후보 등급: 보상의 바로 아래 등급이고 레시피 450건 × 5칸 × 후보 90개 = 202,500개씩 (rare-common, epic-rare, mystic-epic)
--   SELECT rb.rarity AS reward_rarity, b.rarity AS candidate_rarity, count(*)
--     FROM public.combination_recipe_slots s
--     JOIN public.combination_recipes cr ON cr.id = s.recipe_id
--     JOIN public.badges rb ON rb.id = cr.reward_badge_ids[1]
--    CROSS JOIN LATERAL unnest(s.allowed_badge_ids) AS ab(id)
--     JOIN public.badges b ON b.id = ab.id
--    WHERE cr.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND cr.name ~ ' (Rare|Epic|Mystic) 올리기$'
--    GROUP BY rb.rarity, b.rarity ORDER BY rb.rarity;
--   -- 후보에 보상 배지가 들어 있는 칸 (0)
--   SELECT count(*) FROM public.combination_recipe_slots s JOIN public.combination_recipes cr ON cr.id = s.recipe_id
--    WHERE cr.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND cr.name ~ ' (Rare|Epic|Mystic) 올리기$' AND cr.reward_badge_ids[1] = ANY (s.allowed_badge_ids);
--   -- 단서 레시피 80건은 그대로다: 자리 값 공개 시작이면서 이 틀에 맞지 않는 레시피 (281 적용 뒤 공개 시작을 바꾸기 전에는 80)
--   SELECT count(*) FROM public.combination_recipes cr WHERE cr.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND NOT (cr.name ~ ' (Rare|Epic|Mystic) 올리기$' AND cr.description ~ '^같은 트라이브의 (Common|Rare|Epic) 아이템 배지 다섯 개를 \*\*.+\*\* (Rare|Epic|Mystic) 한 개로 바꿉니다\.$');
--   -- 전체 레시피와 칸: 적용 전 값 + 1,350건, + 6,750개
--   SELECT (SELECT count(*) FROM public.combination_recipes) AS recipes, (SELECT count(*) FROM public.combination_recipe_slots) AS slots;

-- 컬렉션을 열 때 쓰는 SQL (예시. 오픈 직전 목록 7-9, 자동 연동 코드는 없다. 실행하지 않는다)
-- 오픈 때 컬렉션을 트라이브마다 3개로 줄이면, 열리는 컬렉션마다 그 컬렉션이 보상인 등급 올리기 레시피 27건(아이템 9종 × 3등급)을 함께 연다.
-- 보상 배지가 속한 컬렉션의 트라이브 이름과 컬렉션 이름으로 찾아 valid_from을 실제 공개 시각으로 바꾼다. <…> 자리는 열 컬렉션과 시각으로 바꿔 쓴다.
-- 단서 레시피(281)는 재료와 보상 컬렉션이 모두 열리는 날에 따로 맞춘다. 이 SQL은 등급 올리기 레시피만 건드린다.
--
-- 1) 먼저 읽기 전용으로 건수를 본다 (27건이어야 한다)
-- SELECT count(*) FROM public.combination_recipes cr
--   JOIN public.badges rb ON rb.id = cr.reward_badge_ids[1]
--   JOIN public.item_books ib ON ib.id = rb.item_book_id
--   JOIN public.tribes t ON t.id = ib.tribe_id
--  WHERE cr.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND cr.name ~ ' (Rare|Epic|Mystic) 올리기$'
--    AND t.name = '<트라이브 이름>' AND ib.name = '<컬렉션 이름>';
--
-- 2) 27건이면 공개 시각으로 바꾼다 (한 번의 호출로 실행하고, 바뀐 행이 27건인지 확인한다)
-- UPDATE public.combination_recipes cr
--    SET valid_from = TIMESTAMPTZ '<공개 시각, 예: 2026-12-01 00:00:00+09>'
--   FROM public.badges rb
--   JOIN public.item_books ib ON ib.id = rb.item_book_id
--   JOIN public.tribes t ON t.id = ib.tribe_id
--  WHERE rb.id = cr.reward_badge_ids[1]
--    AND cr.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND cr.name ~ ' (Rare|Epic|Mystic) 올리기$'
--    AND t.name = '<트라이브 이름>' AND ib.name = '<컬렉션 이름>';

-- 되돌림 SQL
-- 등급 올리기 레시피 1,350건만 지운다. 칸(combination_recipe_slots)은 외래키 ON DELETE CASCADE로 함께 지워진다. 한 번의 호출로 통째로 실행한다.
-- 단서 레시피 80건(281)은 지우지 않는다. 이름 틀(«… Rare·Epic·Mystic 올리기»)과 설명 틀로 고르며, 단서 레시피의 이름과 설명은 이 틀에 맞지 않는다.
-- 컬렉션을 연 뒤라면(공개 시작을 실제 시각으로 바꾼 레시피가 있으면) 유저가 이미 믹스했을 수 있다. 그때는 먼저 user_combine_success_logs와 user_combine_fail_logs를 확인하고,
-- 배지 조건(condition_json.recipe_first_success)이 이 레시피를 가리키는지도 확인한다(삭제 가드와 같다).
--
-- 1) 지우기 전 확인(읽기 전용): 틀에 맞는 레시피와, 틀에 맞지 않는 자리 값 레시피(단서 80건)를 센다 (1350, 80. 281 적용 뒤 공개 시작을 바꾸기 전 기준)
-- SELECT count(*) FROM public.combination_recipes cr WHERE cr.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND cr.name ~ ' (Rare|Epic|Mystic) 올리기$' AND cr.description ~ '^같은 트라이브의 (Common|Rare|Epic) 아이템 배지 다섯 개를 \*\*.+\*\* (Rare|Epic|Mystic) 한 개로 바꿉니다\.$';
-- SELECT count(*) FROM public.combination_recipes cr WHERE cr.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND NOT (cr.name ~ ' (Rare|Epic|Mystic) 올리기$' AND cr.description ~ '^같은 트라이브의 (Common|Rare|Epic) 아이템 배지 다섯 개를 \*\*.+\*\* (Rare|Epic|Mystic) 한 개로 바꿉니다\.$');
--
-- 2) 지우기 (자리 값 공개 시작인 상태에서는 정확히 1350건이 지워진다. 공개 시작을 이미 바꿨다면 valid_from 조건을 뺀다)
-- DELETE FROM public.combination_recipes cr WHERE cr.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND cr.name ~ ' (Rare|Epic|Mystic) 올리기$' AND cr.description ~ '^같은 트라이브의 (Common|Rare|Epic) 아이템 배지 다섯 개를 \*\*.+\*\* (Rare|Epic|Mystic) 한 개로 바꿉니다\.$';
--
-- 3) 되돌린 뒤 확인: 첫째는 0이고 둘째는 남은 단서 레시피 80건이라 80이다(281 적용 뒤 공개 시작을 바꾸기 전 기준)
-- SELECT count(*) FROM public.combination_recipes cr WHERE cr.name ~ ' (Rare|Epic|Mystic) 올리기$';
-- SELECT count(*) FROM public.combination_recipes WHERE valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09';
