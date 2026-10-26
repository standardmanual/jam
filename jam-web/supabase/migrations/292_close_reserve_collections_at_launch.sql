-- 292_close_reserve_collections_at_launch.sql
-- JAM 2.0 묶음 7 · 7-9: 예약 컬렉션 35개 끄기 (티켓 20261026_2026)
--
-- 이 파일은 gen-launch-sql.mjs가 7-6 계획(원고 01~05의 컬렉션 50개)에서 만든다. 손으로 고치지 말고 생성기를 고쳐 다시 만든다
-- (node scripts/jam2-content/gen-launch-sql.mjs --write). 시험이 생성 결과와 이 파일이 같은지 비교한다.
--
-- 이 파일은 오픈 직전에 적용한다(7-9 목록). 지금 적용하지 않는다.
--
-- 하는 일 (한 트랜잭션, 파일만 쓰고 실행은 오픈 직전에 카리나가 드라이런·롤백 실측과 함께 한다)
--   1. 컬렉션 35개 끄기: 오픈 때는 트라이브마다 10개 가운데 3개만 열고 7개는 꺼 둔 채 시작한다(5개 트라이브, 15개 열림, 35개 꺼 둠).
--      «7-6 계획의 컬렉션 50개 가운데 첫 공개 15개가 아니고 지금 켜져 있는 것»의 is_active를 false로 바꾼다.
--      is_active 하나만 바꾼다. valid_from을 비롯한 다른 열은 건드리지 않는다(켜는 일은 운영자가 어드민에서 is_active로 한다, 2026-10-26 결정).
--      지우지 않는다(소프트 삭제). 컬렉션 안의 배지와 유저가 이미 받은 기록은 그대로다.
--   2. 끄기 직전의 행 전체를 백업 표 launch_backup_20261026에 item_book 종류로 담고, 되돌림 SQL이 그 표를 쓴다.
--
-- 첫 공개 컬렉션 15개 (트라이브, 컬렉션) — 끄지 않는다
--   한입만 연구회: 무명을 쫓는 야식가들, 시장 골목의 전설, 비 오는 날의 기름 냄새
--   찰칵단: 노을 헌터의 기록, 골목길 필름 스냅, 매직 아워
--   비사이드 레코즈: 아날로그 믹스테이프, 삼십 초의 소리, 배터리 방전의 공포
--   소나무 잡화점: 행운의 잡동사니, 창고의 문구 상자, 유리 칸 닦는 아침
--   혼자들: 짝 잃은 양말, 길거리 우체통의 편지, 겨울잠의 안식처
--
-- 찾는 방법과 멈추는 조건
--   - 계획 컬렉션 50개는 «트라이브 이름과 컬렉션 이름»으로 찾고, 한 건씩 맞지 않으면 멈춘다(7-6의 트라이브 SQL(276~280)이 적용되지 않았다면 여기서 멈춘다).
--   - 첫 공개 15개가 모두 켜져 있지 않으면 멈춘다. 오픈 직전에 운영자가 따로 꺼 둔 것이 있다는 뜻이므로 사람이 보고 판단한다.
--   - 끄기 대상은 «계획 컬렉션 가운데 첫 공개가 아니고 지금 켜져 있는 것»이다. 35개가 아니면 멈춘다.
--     적용된 뒤에는 끄기 대상이 0개가 되므로 같은 파일을 다시 실행하면 멈춘다.
--   - 끝에서 끈 컬렉션 35개가 꺼져 있는지, 계획 컬렉션 가운데 켜진 것이 정확히 첫 공개 15개인지, 끈 컬렉션의 is_active를 뺀 나머지 열이 백업과 같은지,
--     백업이 35건인지 검사하고 어긋나면 전체를 되돌린다(트랜잭션).
--
-- 282(쓰지 않는 컬렉션 19개 끄기)와는 순서가 상관없다. 282는 «계획 밖의 활성 컬렉션»만 보고 이 파일은 «계획 안의 컬렉션»만 보므로 두 파일의 끝 검사가 서로를 깨지 않는다.
-- 적용 순서: 7-6의 다섯 트라이브 SQL(276~280) 적용 뒤, 오픈 직전. 293(첫 공개 단서 레시피 열기)과도 순서가 상관없다.
-- 실행: BEGIN/COMMIT 없이 한 번의 호출로 통째로 실행한다. 롤백 실측은 이 파일 뒤에 일부러 오류를 내는 문장을 붙여 같은 호출로 실행한다.
--
-- 적용 전 확인 쿼리(읽기 전용 SELECT):
--   -- 첫 공개 컬렉션 15개가 모두 켜져 있다 (15)
--   SELECT count(*) FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id
--    WHERE ib.is_active AND (t.name, ib.name) IN (
--          ('한입만 연구회', '무명을 쫓는 야식가들'),
--          ('한입만 연구회', '시장 골목의 전설'),
--          ('한입만 연구회', '비 오는 날의 기름 냄새'),
--          ('찰칵단', '노을 헌터의 기록'),
--          ('찰칵단', '골목길 필름 스냅'),
--          ('찰칵단', '매직 아워'),
--          ('비사이드 레코즈', '아날로그 믹스테이프'),
--          ('비사이드 레코즈', '삼십 초의 소리'),
--          ('비사이드 레코즈', '배터리 방전의 공포'),
--          ('소나무 잡화점', '행운의 잡동사니'),
--          ('소나무 잡화점', '창고의 문구 상자'),
--          ('소나무 잡화점', '유리 칸 닦는 아침'),
--          ('혼자들', '짝 잃은 양말'),
--          ('혼자들', '길거리 우체통의 편지'),
--          ('혼자들', '겨울잠의 안식처')
--    );
--   -- 새 트라이브 5곳의 켜진 컬렉션 가운데 첫 공개를 뺀 것 (35. 5곳에 계획 밖 컬렉션이 없으면 몸통의 끄기 대상 건수와 같다)
--   SELECT count(*) FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id
--    WHERE ib.is_active AND t.name IN ('한입만 연구회', '찰칵단', '비사이드 레코즈', '소나무 잡화점', '혼자들') AND (t.name, ib.name) NOT IN (
--          ('한입만 연구회', '무명을 쫓는 야식가들'),
--          ('한입만 연구회', '시장 골목의 전설'),
--          ('한입만 연구회', '비 오는 날의 기름 냄새'),
--          ('찰칵단', '노을 헌터의 기록'),
--          ('찰칵단', '골목길 필름 스냅'),
--          ('찰칵단', '매직 아워'),
--          ('비사이드 레코즈', '아날로그 믹스테이프'),
--          ('비사이드 레코즈', '삼십 초의 소리'),
--          ('비사이드 레코즈', '배터리 방전의 공포'),
--          ('소나무 잡화점', '행운의 잡동사니'),
--          ('소나무 잡화점', '창고의 문구 상자'),
--          ('소나무 잡화점', '유리 칸 닦는 아침'),
--          ('혼자들', '짝 잃은 양말'),
--          ('혼자들', '길거리 우체통의 편지'),
--          ('혼자들', '겨울잠의 안식처')
--    );
--   -- 백업 표가 아직 없다
--   SELECT to_regclass('public.launch_backup_20261026');                                  -- NULL
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   -- 끈 컬렉션 35개가 모두 꺼져 있다 (35)
--   SELECT count(*) FROM public.item_books ib JOIN public.launch_backup_20261026 s ON s.kind = 'item_book' AND s.row_id = ib.id WHERE NOT ib.is_active;
--   -- 새 트라이브 5곳에서 켜진 컬렉션은 첫 공개 15개뿐이다 (15, 0)
--   SELECT count(*) AS active_books,
--          count(*) FILTER (WHERE (t.name, ib.name) NOT IN (
--            ('한입만 연구회', '무명을 쫓는 야식가들'),
--            ('한입만 연구회', '시장 골목의 전설'),
--            ('한입만 연구회', '비 오는 날의 기름 냄새'),
--            ('찰칵단', '노을 헌터의 기록'),
--            ('찰칵단', '골목길 필름 스냅'),
--            ('찰칵단', '매직 아워'),
--            ('비사이드 레코즈', '아날로그 믹스테이프'),
--            ('비사이드 레코즈', '삼십 초의 소리'),
--            ('비사이드 레코즈', '배터리 방전의 공포'),
--            ('소나무 잡화점', '행운의 잡동사니'),
--            ('소나무 잡화점', '창고의 문구 상자'),
--            ('소나무 잡화점', '유리 칸 닦는 아침'),
--            ('혼자들', '짝 잃은 양말'),
--            ('혼자들', '길거리 우체통의 편지'),
--            ('혼자들', '겨울잠의 안식처')
--          )) AS active_not_initial
--     FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id
--    WHERE ib.is_active AND t.name IN ('한입만 연구회', '찰칵단', '비사이드 레코즈', '소나무 잡화점', '혼자들');
--   -- 백업 건수 (item_book 35)
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
-- 1. 7-6 계획의 컬렉션 50개를 «트라이브 이름과 컬렉션 이름»으로 찾고, 한 건씩 맞지 않으면 멈춘다
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS pg_temp._jam2_close_book;
DROP TABLE IF EXISTS pg_temp._jam2_launch_book;

CREATE TEMP TABLE _jam2_launch_book (
  tribe       TEXT NOT NULL,
  book        TEXT NOT NULL,
  is_initial  BOOLEAN NOT NULL,
  book_id     UUID,
  matches     INTEGER,
  PRIMARY KEY (tribe, book)
);

INSERT INTO _jam2_launch_book (tribe, book, is_initial) VALUES
  ('한입만 연구회', '무명을 쫓는 야식가들', true),
  ('한입만 연구회', '무명의 은박지 꼬치', false),
  ('한입만 연구회', '편의점 심야 만찬', false),
  ('한입만 연구회', '시장 골목의 전설', true),
  ('한입만 연구회', '비 오는 날의 기름 냄새', true),
  ('한입만 연구회', '새벽 무렵의 국밥', false),
  ('한입만 연구회', '2번 출구의 붕어빵', false),
  ('한입만 연구회', '순자 할매의 매실청', false),
  ('한입만 연구회', '오아시스 자판기의 동전', false),
  ('한입만 연구회', '외근 끝의 한 접시', false),
  ('찰칵단', '노을 헌터의 기록', true),
  ('찰칵단', '골목길 필름 스냅', true),
  ('찰칵단', '새벽 물안개 몽환', false),
  ('찰칵단', '매직 아워', true),
  ('찰칵단', '봄꽃 출사 전쟁', false),
  ('찰칵단', '가을 단풍 터널', false),
  ('찰칵단', '눈 덮인 순백의 언덕', false),
  ('찰칵단', '빛바랜 사진의 추억', false),
  ('찰칵단', '같은 자리의 기록', false),
  ('찰칵단', '도심 야경의 불빛', false),
  ('비사이드 레코즈', '플레이리스트 공유', false),
  ('비사이드 레코즈', '아날로그 믹스테이프', true),
  ('비사이드 레코즈', '새벽의 Lo-Fi', false),
  ('비사이드 레코즈', '삼십 초의 소리', true),
  ('비사이드 레코즈', '배터리 방전의 공포', true),
  ('비사이드 레코즈', '아무것도 안 트는 방', false),
  ('비사이드 레코즈', '계산대의 한마디', false),
  ('비사이드 레코즈', '열 시의 데모', false),
  ('비사이드 레코즈', '한쪽 귀의 출근길', false),
  ('비사이드 레코즈', '사운드박스의 한 시간', false),
  ('소나무 잡화점', '신상 언박싱의 희열', false),
  ('소나무 잡화점', '중고장터의 잠복자', false),
  ('소나무 잡화점', '공구통의 비밀', false),
  ('소나무 잡화점', '행운의 잡동사니', true),
  ('소나무 잡화점', '고장 난 장난감', false),
  ('소나무 잡화점', '분실물 센터 999', false),
  ('소나무 잡화점', '까치의 반짝이는 보물', false),
  ('소나무 잡화점', '열쇠고리를 단 가방', false),
  ('소나무 잡화점', '창고의 문구 상자', true),
  ('소나무 잡화점', '유리 칸 닦는 아침', true),
  ('혼자들', '고친 기계 번호', false),
  ('혼자들', '짝 잃은 양말', true),
  ('혼자들', '잃어버린 시간', false),
  ('혼자들', '길거리 우체통의 편지', true),
  ('혼자들', '노이즈 캔슬링 세상', false),
  ('혼자들', '겨울잠의 안식처', true),
  ('혼자들', '침묵의 메아리', false),
  ('혼자들', '밑줄이 그어진 문장들', false),
  ('혼자들', '등대지기의 손전등', false),
  ('혼자들', '이자는 없음', false);

UPDATE _jam2_launch_book k
   SET matches = (SELECT count(*) FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id
                   WHERE t.name = k.tribe AND ib.name = k.book),
       book_id = (SELECT ib.id FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id
                   WHERE t.name = k.tribe AND ib.name = k.book ORDER BY ib.created_at LIMIT 1);

DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(*) INTO v_bad FROM _jam2_launch_book WHERE matches IS DISTINCT FROM 1;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '7-6 계획의 컬렉션을 이름으로 한 건씩 찾지 못한 것이 %개입니다(기대: 50개 모두 1건). 7-6의 트라이브 SQL(276~280)이 적용되지 않았거나 같은 이름이 둘 이상 있습니다.', v_bad;
  END IF;

  SELECT count(DISTINCT book_id) INTO v_bad FROM _jam2_launch_book;
  IF v_bad <> 50 THEN
    RAISE EXCEPTION '7-6 계획의 컬렉션이 서로 다른 행 %개로 맞아야 합니다(기대 50).', v_bad;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. 첫 공개 15개가 모두 켜져 있는지 확인한다. 아니면 멈춘다
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n
    FROM _jam2_launch_book lb JOIN public.item_books ib ON ib.id = lb.book_id
   WHERE lb.is_initial AND ib.is_active;
  IF v_n <> 15 THEN
    RAISE EXCEPTION '첫 공개 컬렉션 중 켜져 있는 것이 %개입니다(기대 15개 모두 켜짐). 오픈 직전에 운영자가 따로 꺼 둔 것이 있는지 확인한 뒤 판단합니다.', v_n;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 3. 끄기 대상 = 계획 컬렉션 가운데 첫 공개가 아니고 지금 켜져 있는 것. 35개가 아니면 멈춘다
-- ----------------------------------------------------------------
CREATE TEMP TABLE _jam2_close_book AS
  SELECT lb.book_id
    FROM _jam2_launch_book lb
    JOIN public.item_books ib ON ib.id = lb.book_id
   WHERE NOT lb.is_initial AND ib.is_active;

DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM _jam2_close_book;
  IF v_n <> 35 THEN
    RAISE EXCEPTION '끄기 대상 컬렉션이 %개입니다(기대 35개: 계획 컬렉션 가운데 첫 공개가 아니고 켜진 것). 이미 적용했거나 운영자가 따로 바꾼 것이 있는지 확인한 뒤 판단합니다.', v_n;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 4. 끄기 직전 상태를 백업 표에 기록한다 (이미 있으면 지금 값으로 갱신 — 끄기 전이므로 지금이 원본이다)
-- ----------------------------------------------------------------
INSERT INTO public.launch_backup_20261026 (kind, row_id, snapshot)
SELECT 'item_book', ib.id, to_jsonb(ib)
  FROM public.item_books ib
  JOIN _jam2_close_book c ON c.book_id = ib.id
ON CONFLICT (kind, row_id) DO UPDATE
  SET snapshot = EXCLUDED.snapshot, backed_up_at = now();

-- ----------------------------------------------------------------
-- 5. 끄기: is_active만 바꾼다 (valid_from을 비롯한 다른 열은 건드리지 않는다)
-- ----------------------------------------------------------------
UPDATE public.item_books ib
   SET is_active = false
  FROM _jam2_close_book c
 WHERE ib.id = c.book_id;

-- ----------------------------------------------------------------
-- 6. 끝 검사 — 어긋나면 오류로 멈추고 트랜잭션 전체가 되돌아간다
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_n INTEGER;
  v_off INTEGER;
BEGIN
  -- 끈 컬렉션 35개가 모두 꺼져 있다
  SELECT count(*) INTO v_n
    FROM public.item_books ib JOIN _jam2_close_book c ON c.book_id = ib.id
   WHERE NOT ib.is_active;
  IF v_n <> 35 THEN
    RAISE EXCEPTION '끝 검사: 꺼진 컬렉션이 %개입니다(기대 35).', v_n;
  END IF;

  -- 계획 컬렉션 가운데 켜진 것은 정확히 첫 공개 15개다
  SELECT count(*) FILTER (WHERE lb.is_initial), count(*) FILTER (WHERE NOT lb.is_initial) INTO v_n, v_off
    FROM _jam2_launch_book lb JOIN public.item_books ib ON ib.id = lb.book_id
   WHERE ib.is_active;
  IF v_n <> 15 OR v_off <> 0 THEN
    RAISE EXCEPTION '끝 검사: 계획 컬렉션 가운데 켜진 첫 공개가 %개, 켜진 첫 공개 밖이 %개입니다(기대 15, 0).', v_n, v_off;
  END IF;

  -- 끈 컬렉션 35개의 is_active를 뺀 나머지 열이 백업과 같다
  SELECT count(*) INTO v_n
    FROM public.item_books ib
    JOIN _jam2_close_book c ON c.book_id = ib.id
    JOIN public.launch_backup_20261026 s ON s.kind = 'item_book' AND s.row_id = ib.id
   WHERE to_jsonb(ib) - 'is_active' = s.snapshot - 'is_active';
  IF v_n <> 35 THEN
    RAISE EXCEPTION '끝 검사: is_active 밖의 열이 백업과 같은 컬렉션이 %개입니다(기대 35).', v_n;
  END IF;

  -- 백업 건수
  SELECT count(*) INTO v_n FROM public.launch_backup_20261026 WHERE kind = 'item_book';
  IF v_n <> 35 THEN
    RAISE EXCEPTION '끝 검사: 컬렉션 백업이 %건입니다(기대 35).', v_n;
  END IF;
END $$;

DROP TABLE _jam2_close_book;
DROP TABLE _jam2_launch_book;

-- 되돌림 SQL
-- 끈 컬렉션 35개를 백업 표 launch_backup_20261026의 is_active로 되돌린다. 한 번의 호출로 통째로 실행한다.
-- 오픈 뒤 운영자가 어드민에서 이 35개 가운데 일부를 이미 켰다면 이 UPDATE는 그것도 백업 값(켜짐)으로 맞춘다. 일부만 되돌리려면 row_id 조건을 더한다.
--
-- 1) 끈 컬렉션 되돌리기 (is_active)
-- UPDATE public.item_books ib
--    SET is_active = (s.snapshot->>'is_active')::boolean
--   FROM public.launch_backup_20261026 s
--  WHERE s.kind = 'item_book' AND s.row_id = ib.id;
--
-- 2) 되돌린 뒤 확인: 아래가 0이어야 한다 (백업 값과 다른 행)
-- SELECT count(*) FROM public.item_books ib JOIN public.launch_backup_20261026 s ON s.kind = 'item_book' AND s.row_id = ib.id WHERE to_jsonb(ib) <> s.snapshot;
--
-- 3) 백업 표 지우기: 293(첫 공개 단서 레시피 열기)도 같은 표 launch_backup_20261026를 쓰므로 292와 293을 모두 되돌린 뒤에만 지운다
-- DROP TABLE IF EXISTS public.launch_backup_20261026;
