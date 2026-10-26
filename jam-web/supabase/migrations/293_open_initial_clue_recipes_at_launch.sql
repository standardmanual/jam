-- 293_open_initial_clue_recipes_at_launch.sql
-- JAM 2.0 묶음 7 · 7-9: 첫 공개 단서 레시피 28건 열기 (단서 7개 × 등급 4개, 티켓 20261026_2026)
--
-- 이 파일은 gen-launch-sql.mjs가 단서 레시피 원고(docs/plan/jam2/tribe-rethink/manuscript/07 단서 레시피.md)와
-- 7-6 계획에서 만든다. 손으로 고치지 말고 생성기를 고쳐 다시 만든다
-- (node scripts/jam2-content/gen-launch-sql.mjs --write). 시험이 생성 결과와 이 파일이 같은지 비교한다.
--
-- 이 파일은 오픈 직전에 적용한다(7-9 목록). 지금 적용하지 않는다.
--
-- 하는 일 (한 트랜잭션, 파일만 쓰고 실행은 오픈 직전에 카리나가 드라이런·롤백 실측과 함께 한다)
--   1. 281이 넣은 단서 레시피 80건(단서 20개 × 등급 4개)은 모두 공개 시작 자리 값(2099-01-01 00:00:00+09, 2099-01-01 00:00 KST)이다.
--      이 가운데 재료 컬렉션과 보상 컬렉션이 모두 첫 공개 컬렉션 15개 안에 있는 단서 7개(28건)만 valid_from을 NULL로 바꿔 연다.
--      나머지 단서 13개(52건)는 재료나 보상 컬렉션이 꺼 두는 컬렉션에 있어서 자리 값으로 남긴다. 오픈 뒤 운영자가 컬렉션을 켤 때 따로 연다.
--      valid_from 하나만 바꾼다. valid_until, 칸(combination_recipe_slots), 보상 열은 건드리지 않는다.
--   2. 열기 직전의 행 전체를 백업 표 launch_backup_20261026에 combination_recipe 종류로 담고(28건), 되돌림 SQL이 그 표를 쓴다.
--
-- 열 단서 7개 (이름 / 재료 컬렉션 / 보상 컬렉션) — 이름마다 4행
--   노트 위의 별 / 한입만 연구회·비 오는 날의 기름 냄새 / 혼자들·길거리 우체통의 편지
--   노을 구석의 트럭 / 한입만 연구회·무명을 쫓는 야식가들 / 찰칵단·골목길 필름 스냅
--   카세트 표지의 같은 글씨 / 비사이드 레코즈·아날로그 믹스테이프 / 소나무 잡화점·창고의 문구 상자
--   녹음 부스의 셔터 소리 / 비사이드 레코즈·삼십 초의 소리 / 찰칵단·골목길 필름 스냅
--   하은의 칸에 꽂힌 카세트 / 소나무 잡화점·창고의 문구 상자 / 비사이드 레코즈·아날로그 믹스테이프
--   벽장의 월세 봉투 / 소나무 잡화점·유리 칸 닦는 아침 / 혼자들·짝 잃은 양말
--   맨 아래 줄의 노트 12권 / 혼자들·길거리 우체통의 편지 / 소나무 잡화점·유리 칸 닦는 아침
--
-- 찾는 방법과 멈추는 조건
--   - 7개 이름을 combination_recipes.name으로 찾는다. 이름마다 정확히 4행이어야 하고, 4행 모두 valid_from이 자리 값이며 valid_until이 비어 있어야 한다.
--     하나라도 어긋나면 멈춘다(이미 열었거나 281이 적용되지 않았다는 뜻이다).
--   - 이름마다 재료 컬렉션과 보상 컬렉션을 DB에서 다시 구한다(칸의 allowed_badge_ids → badges.item_book_id → item_books → tribes, 보상은 reward_badge_ids로 같은 경로).
--     위 표의 컬렉션과 정확히 같지 않으면 멈춘다. 그리고 그 컬렉션이 첫 공개 컬렉션에 들지 않거나 is_active가 아니면 멈춘다.
--     이 검사는 292보다 먼저 실행해도 292 뒤에 실행해도 통과한다(첫 공개 컬렉션은 어느 쪽이든 켜져 있다).
--   - 열기 전에, 7개 이름을 뺀 나머지 중 valid_from이 자리 값인 행이 정확히 52행인지 확인한다(80행 - 28행). 아니면 다른 세션이 레시피를 건드렸다는 뜻이므로 멈춘다.
--   - 끝에서 28행의 valid_from이 NULL인지, 자리 값으로 남은 행이 52행인지, 28행의 valid_from을 뺀 나머지 열이 백업과 같은지, 백업이 28건인지 검사하고
--     어긋나면 전체를 되돌린다(트랜잭션).
--   - 적용된 뒤에는 자리 값인 행이 없어지므로 같은 파일을 다시 실행하면 멈춘다.
--
-- 적용 순서: 281(단서 레시피 입력) 적용 뒤, 오픈 직전. 292(예약 컬렉션 끄기)와는 순서가 상관없다.
-- 실행: BEGIN/COMMIT 없이 한 번의 호출로 통째로 실행한다. 롤백 실측은 이 파일 뒤에 일부러 오류를 내는 문장을 붙여 같은 호출로 실행한다.
--
-- 적용 전 확인 쿼리(읽기 전용 SELECT):
--   -- 열 단서 7개 이름의 행이 모두 자리 값 공개 시작이고 종료 시각이 없다 (28)
--   SELECT count(*) FROM public.combination_recipes
--    WHERE name IN ('노트 위의 별', '노을 구석의 트럭', '카세트 표지의 같은 글씨', '녹음 부스의 셔터 소리', '하은의 칸에 꽂힌 카세트', '벽장의 월세 봉투', '맨 아래 줄의 노트 12권') AND valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND valid_until IS NULL;
--   -- 열 단서를 뺀 자리 값 행 (52)
--   SELECT count(*) FROM public.combination_recipes
--    WHERE valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND name NOT IN ('노트 위의 별', '노을 구석의 트럭', '카세트 표지의 같은 글씨', '녹음 부스의 셔터 소리', '하은의 칸에 꽂힌 카세트', '벽장의 월세 봉투', '맨 아래 줄의 노트 12권');
--   -- 백업 표 (292보다 먼저 실행하면 NULL, 292 뒤에는 표 이름)
--   SELECT to_regclass('public.launch_backup_20261026');
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   -- 열린 레시피 28건: 공개 시작이 비어 있다 (28)
--   SELECT count(*) FROM public.combination_recipes
--    WHERE name IN ('노트 위의 별', '노을 구석의 트럭', '카세트 표지의 같은 글씨', '녹음 부스의 셔터 소리', '하은의 칸에 꽂힌 카세트', '벽장의 월세 봉투', '맨 아래 줄의 노트 12권') AND valid_from IS NULL;
--   -- 자리 값으로 남은 레시피 (52)
--   SELECT count(*) FROM public.combination_recipes WHERE valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09';
--   -- 백업 건수 (combination_recipe 28)
--   SELECT kind, count(*) FROM public.launch_backup_20261026 GROUP BY kind ORDER BY kind;

-- ----------------------------------------------------------------
-- 0. 백업 표 — 서버 전용(RLS 켜고 정책 없음, 클라이언트 권한 회수). 292와 293이 같은 정의를 쓴다
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.launch_backup_20261026 (
  kind          TEXT NOT NULL CHECK (kind IN ('item_book', 'combination_recipe')),
  row_id        UUID NOT NULL,
  snapshot      JSONB NOT NULL,
  backed_up_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, row_id)
);

ALTER TABLE public.launch_backup_20261026 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.launch_backup_20261026 FROM anon, authenticated;

COMMENT ON TABLE public.launch_backup_20261026 IS
  'JAM 2.0 오픈 직전 SQL(292 컬렉션 끄기, 293 단서 레시피 열기) 되돌림용 백업(티켓 20261026_2026). item_book은 끄기 직전, combination_recipe는 열기 직전 전체 행(snapshot)이다. 오픈 뒤 문제가 없으면 지운다. 서버(service role)만 읽고 쓴다.';

-- ----------------------------------------------------------------
-- 1. 열 단서 7개를 이름으로 찾고, 이름마다 정확히 4행이 자리 값 공개 시작인지 확인한다. 아니면 멈춘다
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS pg_temp._jam2_launch_ref;
DROP TABLE IF EXISTS pg_temp._jam2_launch_recipe;
DROP TABLE IF EXISTS pg_temp._jam2_launch_open_book;
DROP TABLE IF EXISTS pg_temp._jam2_launch_clue;

-- 열 단서 7개: 이름과, 위 표에서 정한 재료 컬렉션·보상 컬렉션(트라이브 이름, 컬렉션 이름)
CREATE TEMP TABLE _jam2_launch_clue (
  name              TEXT PRIMARY KEY,
  ingredient_tribe  TEXT NOT NULL,
  ingredient_book   TEXT NOT NULL,
  reward_tribe      TEXT NOT NULL,
  reward_book       TEXT NOT NULL,
  recipe_rows       INTEGER,
  placeholder_rows  INTEGER
);

INSERT INTO _jam2_launch_clue (name, ingredient_tribe, ingredient_book, reward_tribe, reward_book) VALUES
  ('노트 위의 별', '한입만 연구회', '비 오는 날의 기름 냄새', '혼자들', '길거리 우체통의 편지'),
  ('노을 구석의 트럭', '한입만 연구회', '무명을 쫓는 야식가들', '찰칵단', '골목길 필름 스냅'),
  ('카세트 표지의 같은 글씨', '비사이드 레코즈', '아날로그 믹스테이프', '소나무 잡화점', '창고의 문구 상자'),
  ('녹음 부스의 셔터 소리', '비사이드 레코즈', '삼십 초의 소리', '찰칵단', '골목길 필름 스냅'),
  ('하은의 칸에 꽂힌 카세트', '소나무 잡화점', '창고의 문구 상자', '비사이드 레코즈', '아날로그 믹스테이프'),
  ('벽장의 월세 봉투', '소나무 잡화점', '유리 칸 닦는 아침', '혼자들', '짝 잃은 양말'),
  ('맨 아래 줄의 노트 12권', '혼자들', '길거리 우체통의 편지', '소나무 잡화점', '유리 칸 닦는 아침');

UPDATE _jam2_launch_clue c
   SET recipe_rows      = (SELECT count(*) FROM public.combination_recipes r WHERE r.name = c.name),
       placeholder_rows = (SELECT count(*) FROM public.combination_recipes r
                            WHERE r.name = c.name AND r.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND r.valid_until IS NULL);

DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM _jam2_launch_clue WHERE recipe_rows IS DISTINCT FROM 4;
  IF v_n > 0 THEN
    RAISE EXCEPTION '단서 레시피를 이름으로 찾았을 때 4행이 아닌 이름이 %개입니다(기대: 7개 모두 4행). 281이 적용되지 않았거나 같은 이름의 레시피가 따로 있습니다.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM _jam2_launch_clue WHERE placeholder_rows IS DISTINCT FROM 4;
  IF v_n > 0 THEN
    RAISE EXCEPTION '4행이 모두 공개 시작 자리 값(2099-01-01 00:00:00+09)이고 종료 시각이 비어 있어야 하는데 그렇지 않은 이름이 %개입니다. 이미 열었거나 운영자가 바꾼 레시피가 있습니다.', v_n;
  END IF;
END $$;

CREATE TEMP TABLE _jam2_launch_recipe AS
  SELECT r.id AS recipe_id, r.name
    FROM public.combination_recipes r
    JOIN _jam2_launch_clue c ON c.name = r.name;

DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM _jam2_launch_recipe;
  IF v_n <> 28 THEN
    RAISE EXCEPTION '열 레시피가 %건입니다(기대 28건 = 7개 이름 × 4행).', v_n;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. 재료 컬렉션과 보상 컬렉션을 DB에서 다시 구해 위 표와 대조하고, 모두 첫 공개 15개에 들고 켜져 있는지 확인한다
-- ----------------------------------------------------------------
-- 첫 공개 컬렉션 15개 (트라이브 이름, 컬렉션 이름)
CREATE TEMP TABLE _jam2_launch_open_book (
  tribe  TEXT NOT NULL,
  book   TEXT NOT NULL,
  PRIMARY KEY (tribe, book)
);

INSERT INTO _jam2_launch_open_book (tribe, book) VALUES
  ('한입만 연구회', '무명을 쫓는 야식가들'),
  ('한입만 연구회', '시장 골목의 전설'),
  ('한입만 연구회', '비 오는 날의 기름 냄새'),
  ('찰칵단', '노을 헌터의 기록'),
  ('찰칵단', '골목길 필름 스냅'),
  ('찰칵단', '매직 아워'),
  ('비사이드 레코즈', '아날로그 믹스테이프'),
  ('비사이드 레코즈', '삼십 초의 소리'),
  ('비사이드 레코즈', '배터리 방전의 공포'),
  ('소나무 잡화점', '행운의 잡동사니'),
  ('소나무 잡화점', '창고의 문구 상자'),
  ('소나무 잡화점', '유리 칸 닦는 아침'),
  ('혼자들', '짝 잃은 양말'),
  ('혼자들', '길거리 우체통의 편지'),
  ('혼자들', '겨울잠의 안식처');

-- 레시피마다 칸의 후보 배지(재료)와 보상 배지가 속한 컬렉션. 배지나 컬렉션을 찾지 못하면 이름이 NULL로 남아 아래 대조에서 걸린다
CREATE TEMP TABLE _jam2_launch_ref AS
SELECT r.recipe_id, 'ingredient'::text AS part, t.name AS tribe, ib.name AS book, ib.is_active AS book_active
  FROM _jam2_launch_recipe r
  JOIN public.combination_recipe_slots s ON s.recipe_id = r.recipe_id
 CROSS JOIN LATERAL unnest(s.allowed_badge_ids) AS a(badge_id)
  LEFT JOIN public.badges b ON b.id = a.badge_id
  LEFT JOIN public.item_books ib ON ib.id = b.item_book_id
  LEFT JOIN public.tribes t ON t.id = ib.tribe_id
UNION ALL
SELECT r.recipe_id, 'reward'::text, t.name, ib.name, ib.is_active
  FROM _jam2_launch_recipe r
  JOIN public.combination_recipes cr ON cr.id = r.recipe_id
 CROSS JOIN LATERAL unnest(cr.reward_badge_ids) AS a(badge_id)
  LEFT JOIN public.badges b ON b.id = a.badge_id
  LEFT JOIN public.item_books ib ON ib.id = b.item_book_id
  LEFT JOIN public.tribes t ON t.id = ib.tribe_id;

DO $$
DECLARE
  v_n INTEGER;
BEGIN
  -- 재료: 레시피마다 칸의 후보가 있고, 후보가 모두 위 표의 재료 컬렉션 한 곳이다
  SELECT count(*) INTO v_n
    FROM _jam2_launch_recipe r JOIN _jam2_launch_clue c ON c.name = r.name
   WHERE NOT EXISTS (SELECT 1 FROM _jam2_launch_ref f WHERE f.recipe_id = r.recipe_id AND f.part = 'ingredient')
      OR EXISTS (SELECT 1 FROM _jam2_launch_ref f
                  WHERE f.recipe_id = r.recipe_id AND f.part = 'ingredient'
                    AND (f.tribe IS DISTINCT FROM c.ingredient_tribe OR f.book IS DISTINCT FROM c.ingredient_book));
  IF v_n > 0 THEN
    RAISE EXCEPTION '재료 칸의 컬렉션이 위 표와 다르거나 후보가 없는 레시피가 %건입니다(기대 0건). 레시피의 재료가 바뀌었는지 확인한 뒤 판단합니다.', v_n;
  END IF;

  -- 보상: 레시피마다 보상 배지가 있고, 보상이 모두 위 표의 보상 컬렉션 한 곳이다
  SELECT count(*) INTO v_n
    FROM _jam2_launch_recipe r JOIN _jam2_launch_clue c ON c.name = r.name
   WHERE NOT EXISTS (SELECT 1 FROM _jam2_launch_ref f WHERE f.recipe_id = r.recipe_id AND f.part = 'reward')
      OR EXISTS (SELECT 1 FROM _jam2_launch_ref f
                  WHERE f.recipe_id = r.recipe_id AND f.part = 'reward'
                    AND (f.tribe IS DISTINCT FROM c.reward_tribe OR f.book IS DISTINCT FROM c.reward_book));
  IF v_n > 0 THEN
    RAISE EXCEPTION '보상 배지의 컬렉션이 위 표와 다르거나 보상이 없는 레시피가 %건입니다(기대 0건). 레시피의 보상이 바뀌었는지 확인한 뒤 판단합니다.', v_n;
  END IF;

  -- 재료·보상 컬렉션이 모두 첫 공개 15개에 들고 켜져 있다
  SELECT count(*) INTO v_n
    FROM _jam2_launch_ref f
   WHERE NOT EXISTS (SELECT 1 FROM _jam2_launch_open_book o WHERE o.tribe = f.tribe AND o.book = f.book)
      OR f.book_active IS NOT TRUE;
  IF v_n > 0 THEN
    RAISE EXCEPTION '재료·보상 배지의 컬렉션 가운데 첫 공개 15개 밖이거나 꺼져 있는 것이 %개입니다(기대 0개). 컬렉션이 꺼진 채로 레시피를 열면 유저가 쓸 수 없습니다.', v_n;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 3. 열 단서를 뺀 나머지 중 공개 시작이 자리 값인 행이 정확히 52행인지 확인한다. 아니면 멈춘다
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n
    FROM public.combination_recipes r
   WHERE r.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09'
     AND NOT EXISTS (SELECT 1 FROM _jam2_launch_clue c WHERE c.name = r.name);
  IF v_n <> 52 THEN
    RAISE EXCEPTION '열 단서를 뺀 나머지 중 공개 시작이 자리 값인 행이 %행입니다(기대 52행 = 80행 - 28행). 다른 세션이 레시피를 건드렸을 수 있습니다. 실제 건수를 확인한 뒤 판단합니다.', v_n;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 4. 열기 직전 상태를 백업 표에 기록한다 (이미 있으면 지금 값으로 갱신 — 열기 전이므로 지금이 원본이다)
-- ----------------------------------------------------------------
INSERT INTO public.launch_backup_20261026 (kind, row_id, snapshot)
SELECT 'combination_recipe', cr.id, to_jsonb(cr)
  FROM public.combination_recipes cr
  JOIN _jam2_launch_recipe r ON r.recipe_id = cr.id
ON CONFLICT (kind, row_id) DO UPDATE
  SET snapshot = EXCLUDED.snapshot, backed_up_at = now();

-- ----------------------------------------------------------------
-- 5. 열기: valid_from만 NULL로 바꾼다 (valid_until, 칸, 보상 열은 건드리지 않는다)
-- ----------------------------------------------------------------
UPDATE public.combination_recipes cr
   SET valid_from = NULL
  FROM _jam2_launch_recipe r
 WHERE cr.id = r.recipe_id;

-- ----------------------------------------------------------------
-- 6. 끝 검사 — 어긋나면 오류로 멈추고 트랜잭션 전체가 되돌아간다
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_n INTEGER;
BEGIN
  -- 열린 레시피 28행의 공개 시작이 비어 있다
  SELECT count(*) INTO v_n
    FROM public.combination_recipes cr JOIN _jam2_launch_recipe r ON r.recipe_id = cr.id
   WHERE cr.valid_from IS NULL;
  IF v_n <> 28 THEN
    RAISE EXCEPTION '끝 검사: 공개 시작이 비어 있는 열린 레시피가 %건입니다(기대 28).', v_n;
  END IF;

  -- 자리 값으로 남은 행이 52행이다
  SELECT count(*) INTO v_n FROM public.combination_recipes WHERE valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09';
  IF v_n <> 52 THEN
    RAISE EXCEPTION '끝 검사: 공개 시작이 자리 값으로 남은 레시피가 %건입니다(기대 52).', v_n;
  END IF;

  -- 열린 28행의 valid_from을 뺀 나머지 열이 백업과 같다
  SELECT count(*) INTO v_n
    FROM public.combination_recipes cr
    JOIN _jam2_launch_recipe r ON r.recipe_id = cr.id
    JOIN public.launch_backup_20261026 s ON s.kind = 'combination_recipe' AND s.row_id = cr.id
   WHERE to_jsonb(cr) - 'valid_from' = s.snapshot - 'valid_from';
  IF v_n <> 28 THEN
    RAISE EXCEPTION '끝 검사: valid_from 밖의 열이 백업과 같은 레시피가 %건입니다(기대 28).', v_n;
  END IF;

  -- 백업 건수
  SELECT count(*) INTO v_n FROM public.launch_backup_20261026 WHERE kind = 'combination_recipe';
  IF v_n <> 28 THEN
    RAISE EXCEPTION '끝 검사: 레시피 백업이 %건입니다(기대 28).', v_n;
  END IF;
END $$;

DROP TABLE _jam2_launch_ref;
DROP TABLE _jam2_launch_recipe;
DROP TABLE _jam2_launch_open_book;
DROP TABLE _jam2_launch_clue;

-- 되돌림 SQL
-- 연 레시피 28건을 백업 표 launch_backup_20261026의 valid_from(자리 값)으로 되돌린다. 한 번의 호출로 통째로 실행한다.
-- 연 뒤에 유저가 이미 믹스했을 수 있다. 그때는 먼저 user_combine_success_logs와 user_combine_fail_logs를 확인하고,
-- 배지 조건(condition_json.recipe_first_success)이 이 레시피를 가리키는지도 확인한다(삭제 가드와 같다).
-- 연 뒤에 운영자가 같은 레시피의 공개 시작을 따로 바꿨다면 아래 확인 쿼리가 0이 아닐 수 있다. 그때는 달라진 행을 보고 판단한다.
--
-- 1) 연 레시피 되돌리기 (valid_from)
-- UPDATE public.combination_recipes cr
--    SET valid_from = (s.snapshot->>'valid_from')::timestamptz
--   FROM public.launch_backup_20261026 s
--  WHERE s.kind = 'combination_recipe' AND s.row_id = cr.id;
--
-- 2) 되돌린 뒤 확인: 아래가 0이어야 한다 (백업 값과 다른 행)
-- SELECT count(*) FROM public.combination_recipes cr JOIN public.launch_backup_20261026 s ON s.kind = 'combination_recipe' AND s.row_id = cr.id WHERE to_jsonb(cr) <> s.snapshot;
--
-- 3) 백업 표 지우기: 292(예약 컬렉션 끄기)도 같은 표 launch_backup_20261026를 쓰므로 292와 293을 모두 되돌린 뒤에만 지운다
-- DROP TABLE IF EXISTS public.launch_backup_20261026;
