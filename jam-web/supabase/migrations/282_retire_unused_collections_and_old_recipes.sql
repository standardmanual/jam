-- 282_retire_unused_collections_and_old_recipes.sql
-- JAM 2.0 묶음 7 · 7-7: 쓰지 않는 컬렉션 56개와 옛 레시피 3건 끄기 (티켓 20261022_1138)
--
-- 이 파일은 gen-recipe-sql.mjs가 7-6 계획(원고 01~05의 컬렉션 50개)에서 만든다. 손으로 고치지 말고 생성기를 고쳐 다시 만든다
-- (node scripts/jam2-content/gen-recipe-sql.mjs --write). 시험이 생성 결과와 이 파일이 같은지 비교한다.
--
-- 이 파일은 오픈 직전에 적용한다(7-9 목록). 지금 적용하지 않는다.
--
-- 하는 일 (한 트랜잭션, 파일만 쓰고 실행은 롤백 실측과 사용자 승인 뒤 카리나가 한다)
--   1. 컬렉션 56개 끄기: «활성 컬렉션 가운데 7-6 계획의 컬렉션 50개에 들지 않는 것»의 is_active를 false로 바꾼다.
--      지우지 않는다(소프트 삭제). 컬렉션 안의 배지와 유저가 이미 받은 기록은 그대로다. 다른 열은 건드리지 않는다.
--   2. 옛 레시피 3건 끄기(트라이브 단독 레시피, 운영 로직 15장 4절): valid_until을 이 SQL이 실행되는 시각(now())으로 채운다.
--      지우지 않는다. 이미 받은 보상·포인트·배지는 그대로다.
--   3. 끄기 직전 상태를 백업 표 retire_backup_20261022에 기록하고(컬렉션은 행 전체, 레시피는 행 전체), 되돌림 SQL이 그 표를 쓴다.
--      7-6의 백업 표는 kind 제약이 레시피를 담지 못하고 6-4 정리 때 지워지므로 쓰지 않고 이 파일이 따로 만든다.
--
-- 찾는 방법과 멈추는 조건
--   - 계획 컬렉션 50개는 «트라이브 이름과 컬렉션 이름»으로 찾고, 한 건씩 맞지 않으면 멈춘다(7-6 SQL을 적용하기 전이라면 여기서 멈춘다).
--   - 끄기 대상은 계획 컬렉션이 아닌 활성 컬렉션이다. 공용 DB에서 56개일 것으로 본다(7-6 적용 뒤 컬렉션 106개 − 계획 50개).
--     56개가 아니면 멈춘다(그 사이 컬렉션이 늘었거나 이미 꺼진 것이 있다는 뜻이다. 실제 건수를 확인한 뒤 판단한다).
--   - 옛 레시피는 이름으로 찾고 3건이 한 건씩 맞지 않으면 멈춘다. 이미 종료 시각이 있거나 공개 전이면 멈춘다.
--   - 끝에서 끈 컬렉션 수, 활성으로 남은 비계획 컬렉션, 옛 레시피의 종료 시각, 백업 건수를 검사하고 어긋나면 전체를 되돌린다(트랜잭션).
--   - 적용된 뒤에는 끄기 대상이 0개가 되므로 같은 파일을 다시 실행하면 멈춘다.
--
-- 적용 순서: 7-6의 다섯 트라이브 SQL(276~280) 적용 뒤, 오픈 직전. 281(단서 레시피)과는 순서가 상관없다.
-- 실행: BEGIN/COMMIT 없이 한 번의 호출로 통째로 실행한다. 롤백 실측은 이 파일 뒤에 일부러 오류를 내는 문장을 붙여 같은 호출로 실행한다.
--
-- 적용 전 확인 쿼리(읽기 전용 SELECT):
--   -- 새 트라이브 5곳의 컬렉션이 50개다 (50). 몸통의 1단계 검사가 이름 한 건씩으로 정확히 확인한다
--   SELECT count(*) FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id
--    WHERE t.name IN ('한입만 연구회', '찰칵단', '비사이드 레코즈', '소나무 잡화점', '혼자들');
--   -- 끄기 대상 후보: 새 트라이브 밖의 활성 컬렉션 (56)
--   SELECT count(*) FROM public.item_books ib LEFT JOIN public.tribes t ON t.id = ib.tribe_id
--    WHERE ib.is_active AND (t.name IS NULL OR t.name NOT IN ('한입만 연구회', '찰칵단', '비사이드 레코즈', '소나무 잡화점', '혼자들'));
--   -- 옛 레시피 3건은 종료 시각이 비어 있다 (3행, valid_until 모두 NULL)
--   SELECT name, valid_from, valid_until FROM public.combination_recipes WHERE name IN ('무명 트럭의 불맛 흔적', '블랙 트랙 입구의 채비', '살롱의 장물 시세');
--   -- 백업 표가 아직 없다
--   SELECT to_regclass('public.retire_backup_20261022');                                  -- NULL
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   -- 끈 컬렉션 56개가 모두 꺼져 있다 (56)
--   SELECT count(*) FROM public.item_books ib JOIN public.retire_backup_20261022 s ON s.kind = 'item_book' AND s.row_id = ib.id WHERE NOT ib.is_active;
--   -- 새 트라이브 밖에 활성 컬렉션이 남지 않았다 (0)
--   SELECT count(*) FROM public.item_books ib LEFT JOIN public.tribes t ON t.id = ib.tribe_id
--    WHERE ib.is_active AND (t.name IS NULL OR t.name NOT IN ('한입만 연구회', '찰칵단', '비사이드 레코즈', '소나무 잡화점', '혼자들'));
--   -- 옛 레시피 3건에 종료 시각이 채워졌다 (3행)
--   SELECT name, valid_until FROM public.combination_recipes WHERE name IN ('무명 트럭의 불맛 흔적', '블랙 트랙 입구의 채비', '살롱의 장물 시세') AND valid_until IS NOT NULL;
--   -- 백업 건수 (combination_recipe 3, item_book 56)
--   SELECT kind, count(*) FROM public.retire_backup_20261022 GROUP BY kind ORDER BY kind;

-- ----------------------------------------------------------------
-- 0. 백업 표 — 서버 전용(RLS 켜고 정책 없음, 클라이언트 권한 회수)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.retire_backup_20261022 (
  kind          TEXT NOT NULL CHECK (kind IN ('item_book', 'combination_recipe')),
  row_id        UUID NOT NULL,
  snapshot      JSONB NOT NULL,
  backed_up_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, row_id)
);

ALTER TABLE public.retire_backup_20261022 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retire_backup_20261022 FROM anon, authenticated;

COMMENT ON TABLE public.retire_backup_20261022 IS
  'JAM 2.0 7-7 끄기 되돌림용 백업(티켓 20261022_1138). item_book·combination_recipe는 끄기 직전 전체 행(snapshot)이다. 오픈 뒤 문제가 없으면 지운다. 서버(service role)만 읽고 쓴다.';

-- ----------------------------------------------------------------
-- 1. 7-6 계획의 컬렉션 50개를 «트라이브 이름과 컬렉션 이름»으로 찾고, 한 건씩 맞지 않으면 멈춘다
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS pg_temp._jam2_old_recipe;
DROP TABLE IF EXISTS pg_temp._jam2_retire_book;
DROP TABLE IF EXISTS pg_temp._jam2_keep;

CREATE TEMP TABLE _jam2_keep (
  tribe    TEXT NOT NULL,
  book     TEXT NOT NULL,
  book_id  UUID,
  matches  INTEGER,
  PRIMARY KEY (tribe, book)
);

INSERT INTO _jam2_keep (tribe, book) VALUES
  ('한입만 연구회', '무명을 쫓는 야식가들'),
  ('한입만 연구회', '무명의 은박지 꼬치'),
  ('한입만 연구회', '편의점 심야 만찬'),
  ('한입만 연구회', '시장 골목의 전설'),
  ('한입만 연구회', '비 오는 날의 기름 냄새'),
  ('한입만 연구회', '새벽 무렵의 국밥'),
  ('한입만 연구회', '2번 출구의 붕어빵'),
  ('한입만 연구회', '순자 할매의 매실청'),
  ('한입만 연구회', '오아시스 자판기의 동전'),
  ('한입만 연구회', '외근 끝의 한 접시'),
  ('찰칵단', '노을 헌터의 기록'),
  ('찰칵단', '골목길 필름 스냅'),
  ('찰칵단', '새벽 물안개 몽환'),
  ('찰칵단', '매직 아워'),
  ('찰칵단', '봄꽃 출사 전쟁'),
  ('찰칵단', '가을 단풍 터널'),
  ('찰칵단', '눈 덮인 순백의 언덕'),
  ('찰칵단', '빛바랜 사진의 추억'),
  ('찰칵단', '같은 자리의 기록'),
  ('찰칵단', '도심 야경의 불빛'),
  ('비사이드 레코즈', '플레이리스트 공유'),
  ('비사이드 레코즈', '아날로그 믹스테이프'),
  ('비사이드 레코즈', '새벽의 Lo-Fi'),
  ('비사이드 레코즈', '삼십 초의 소리'),
  ('비사이드 레코즈', '배터리 방전의 공포'),
  ('비사이드 레코즈', '아무것도 안 트는 방'),
  ('비사이드 레코즈', '계산대의 한마디'),
  ('비사이드 레코즈', '열 시의 데모'),
  ('비사이드 레코즈', '한쪽 귀의 출근길'),
  ('비사이드 레코즈', '사운드박스의 한 시간'),
  ('소나무 잡화점', '신상 언박싱의 희열'),
  ('소나무 잡화점', '중고장터의 잠복자'),
  ('소나무 잡화점', '공구통의 비밀'),
  ('소나무 잡화점', '행운의 잡동사니'),
  ('소나무 잡화점', '고장 난 장난감'),
  ('소나무 잡화점', '분실물 센터 999'),
  ('소나무 잡화점', '까치의 반짝이는 보물'),
  ('소나무 잡화점', '열쇠고리를 단 가방'),
  ('소나무 잡화점', '창고의 문구 상자'),
  ('소나무 잡화점', '유리 칸 닦는 아침'),
  ('혼자들', '고친 기계 번호'),
  ('혼자들', '짝 잃은 양말'),
  ('혼자들', '잃어버린 시간'),
  ('혼자들', '길거리 우체통의 편지'),
  ('혼자들', '노이즈 캔슬링 세상'),
  ('혼자들', '겨울잠의 안식처'),
  ('혼자들', '침묵의 메아리'),
  ('혼자들', '밑줄이 그어진 문장들'),
  ('혼자들', '등대지기의 손전등'),
  ('혼자들', '이자는 없음');

UPDATE _jam2_keep k
   SET matches = (SELECT count(*) FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id
                   WHERE t.name = k.tribe AND ib.name = k.book),
       book_id = (SELECT ib.id FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id
                   WHERE t.name = k.tribe AND ib.name = k.book ORDER BY ib.created_at LIMIT 1);

DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(*) INTO v_bad FROM _jam2_keep WHERE matches IS DISTINCT FROM 1;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '7-6 계획의 컬렉션을 이름으로 한 건씩 찾지 못한 것이 %개입니다(기대: 50개 모두 1건). 7-6의 트라이브 SQL(276~280)이 적용되지 않았거나 같은 이름이 둘 이상 있습니다.', v_bad;
  END IF;

  SELECT count(DISTINCT book_id) INTO v_bad FROM _jam2_keep;
  IF v_bad <> 50 THEN
    RAISE EXCEPTION '7-6 계획의 컬렉션이 서로 다른 행 %개로 맞아야 합니다(기대 50).', v_bad;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. 끄기 대상 = 활성 컬렉션 가운데 계획 컬렉션이 아닌 것. 56개가 아니면 멈춘다
-- ----------------------------------------------------------------
CREATE TEMP TABLE _jam2_retire_book AS
  SELECT ib.id AS book_id
    FROM public.item_books ib
   WHERE ib.is_active
     AND ib.id NOT IN (SELECT book_id FROM _jam2_keep);

DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM _jam2_retire_book;
  IF v_n <> 56 THEN
    RAISE EXCEPTION '끄기 대상 컬렉션이 %개입니다(기대 56개: 7-6 적용 뒤 컬렉션 106개 − 계획 50개). 실제 건수를 확인한 뒤 판단합니다.', v_n;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 3. 옛 레시피 3건을 이름으로 찾고, 한 건씩 맞지 않거나 이미 종료·공개 전이면 멈춘다
-- ----------------------------------------------------------------
CREATE TEMP TABLE _jam2_old_recipe (
  name       TEXT PRIMARY KEY,
  recipe_id  UUID,
  matches    INTEGER
);

INSERT INTO _jam2_old_recipe (name) VALUES
  ('무명 트럭의 불맛 흔적'),
  ('블랙 트랙 입구의 채비'),
  ('살롱의 장물 시세');

UPDATE _jam2_old_recipe o
   SET matches   = (SELECT count(*) FROM public.combination_recipes r WHERE r.name = o.name),
       recipe_id = (SELECT r.id FROM public.combination_recipes r WHERE r.name = o.name ORDER BY r.created_at LIMIT 1);

DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM _jam2_old_recipe WHERE matches IS DISTINCT FROM 1;
  IF v_n > 0 THEN
    RAISE EXCEPTION '옛 레시피를 이름으로 한 건씩 찾지 못한 것이 %개입니다(기대: 3개 모두 1건).', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.combination_recipes r JOIN _jam2_old_recipe o ON o.recipe_id = r.id
   WHERE r.valid_until IS NOT NULL OR (r.valid_from IS NOT NULL AND r.valid_from >= now());
  IF v_n > 0 THEN
    RAISE EXCEPTION '옛 레시피 중 이미 종료 시각이 있거나 공개 전인 것이 %건입니다(기대: 모두 공개 중, 종료 시각 없음).', v_n;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 4. 끄기 직전 상태를 백업 표에 기록한다 (이미 있으면 지금 값으로 갱신 — 끄기 전이므로 지금이 원본이다)
-- ----------------------------------------------------------------
INSERT INTO public.retire_backup_20261022 (kind, row_id, snapshot)
SELECT 'item_book', ib.id, to_jsonb(ib)
  FROM public.item_books ib
  JOIN _jam2_retire_book r ON r.book_id = ib.id
ON CONFLICT (kind, row_id) DO UPDATE
  SET snapshot = EXCLUDED.snapshot, backed_up_at = now();

INSERT INTO public.retire_backup_20261022 (kind, row_id, snapshot)
SELECT 'combination_recipe', cr.id, to_jsonb(cr)
  FROM public.combination_recipes cr
  JOIN _jam2_old_recipe o ON o.recipe_id = cr.id
ON CONFLICT (kind, row_id) DO UPDATE
  SET snapshot = EXCLUDED.snapshot, backed_up_at = now();

-- ----------------------------------------------------------------
-- 5. 끄기: 컬렉션은 is_active만, 옛 레시피는 valid_until만 바꾼다
-- ----------------------------------------------------------------
UPDATE public.item_books ib
   SET is_active = false
  FROM _jam2_retire_book r
 WHERE ib.id = r.book_id;

UPDATE public.combination_recipes cr
   SET valid_until = now()
  FROM _jam2_old_recipe o
 WHERE cr.id = o.recipe_id;

-- ----------------------------------------------------------------
-- 6. 끝 검사 — 어긋나면 오류로 멈추고 트랜잭션 전체가 되돌아간다
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_n INTEGER;
BEGIN
  -- 끈 컬렉션 56개가 모두 꺼져 있다
  SELECT count(*) INTO v_n
    FROM public.item_books ib JOIN _jam2_retire_book r ON r.book_id = ib.id
   WHERE NOT ib.is_active;
  IF v_n <> 56 THEN
    RAISE EXCEPTION '끝 검사: 꺼진 컬렉션이 %개입니다(기대 56).', v_n;
  END IF;

  -- 활성으로 남은 컬렉션은 모두 계획 컬렉션이다
  SELECT count(*) INTO v_n
    FROM public.item_books ib
   WHERE ib.is_active AND ib.id NOT IN (SELECT book_id FROM _jam2_keep);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '끝 검사: 계획 밖의 활성 컬렉션이 %개 남았습니다(기대 0).', v_n;
  END IF;

  -- 옛 레시피 3건에 종료 시각이 채워졌다
  SELECT count(*) INTO v_n
    FROM public.combination_recipes cr JOIN _jam2_old_recipe o ON o.recipe_id = cr.id
   WHERE cr.valid_until IS NOT NULL;
  IF v_n <> 3 THEN
    RAISE EXCEPTION '끝 검사: 종료 시각이 채워진 옛 레시피가 %건입니다(기대 3).', v_n;
  END IF;

  -- 백업 건수
  SELECT count(*) INTO v_n FROM public.retire_backup_20261022 WHERE kind = 'item_book';
  IF v_n <> 56 THEN RAISE EXCEPTION '끝 검사: 컬렉션 백업이 %건입니다(기대 56).', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.retire_backup_20261022 WHERE kind = 'combination_recipe';
  IF v_n <> 3 THEN RAISE EXCEPTION '끝 검사: 레시피 백업이 %건입니다(기대 3).', v_n; END IF;
END $$;

DROP TABLE _jam2_old_recipe;
DROP TABLE _jam2_retire_book;
DROP TABLE _jam2_keep;

-- 되돌림 SQL
-- 끈 컬렉션과 옛 레시피를 백업 표 retire_backup_20261022의 값으로 되돌린다. 한 번의 호출로 통째로 실행한다.
-- 끈 뒤에 운영자가 같은 컬렉션이나 레시피를 따로 바꿨다면 아래 확인 쿼리가 0이 아닐 수 있다. 그때는 달라진 행을 보고 판단한다.
--
-- 1) 끈 컬렉션 되돌리기 (is_active)
-- UPDATE public.item_books ib
--    SET is_active = (s.snapshot->>'is_active')::boolean
--   FROM public.retire_backup_20261022 s
--  WHERE s.kind = 'item_book' AND s.row_id = ib.id;
--
-- 2) 옛 레시피 되돌리기 (valid_until. 백업이 JSON null이면 SQL NULL로 돌아간다)
-- UPDATE public.combination_recipes cr
--    SET valid_until = (s.snapshot->>'valid_until')::timestamptz
--   FROM public.retire_backup_20261022 s
--  WHERE s.kind = 'combination_recipe' AND s.row_id = cr.id;
--
-- 3) 되돌린 뒤 확인: 아래 둘이 모두 0이어야 한다 (백업 값과 다른 행)
-- SELECT count(*) FROM public.item_books ib JOIN public.retire_backup_20261022 s ON s.kind = 'item_book' AND s.row_id = ib.id WHERE to_jsonb(ib) <> s.snapshot;
-- SELECT count(*) FROM public.combination_recipes cr JOIN public.retire_backup_20261022 s ON s.kind = 'combination_recipe' AND s.row_id = cr.id WHERE to_jsonb(cr) <> s.snapshot;
--
-- 4) 백업 표가 더 필요 없으면 지운다
-- DROP TABLE IF EXISTS public.retire_backup_20261022;
