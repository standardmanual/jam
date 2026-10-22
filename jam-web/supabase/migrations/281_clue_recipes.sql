-- 281_clue_recipes.sql
-- JAM 2.0 묶음 7 · 7-7: 단서 레시피 20건 입력 (티켓 20261022_1138)
--
-- 이 파일은 gen-recipe-sql.mjs가 단서 레시피 원고(docs/plan/jam2/tribe-rethink/manuscript/07 단서 레시피.md)와
-- 트라이브 원고 01~05에서 만든다. 손으로 고치지 말고 생성기를 고쳐 다시 만든다
-- (node scripts/jam2-content/gen-recipe-sql.mjs --write). 시험이 생성 결과와 이 파일이 같은지 비교한다.
--
-- 하는 일 (한 트랜잭션, 파일만 쓰고 실행은 롤백 실측과 사용자 승인 뒤 카리나가 한다)
--   1. 레시피 20건(combination_recipes): 이름·설명은 원고 07의 5절 값 그대로, 보상 배지는 도착 트라이브의 Common 아이템 배지 1개.
--      성공 포인트는 재료 수 × 10이다(재료 3개 30, 4개 40, 5개 50. 재료 3개 2건, 4개 10건, 5개 8건).
--      reward_locked는 false(결과를 열린 채 지급), allow_no_reward는 false(보상 없음 허용 끔), valid_until은 비운다.
--   2. 재료 칸 86개(combination_recipe_slots): 재료마다 칸 하나, badge_type은 item, 후보(allowed_badge_ids)는 출발 트라이브의 Common 아이템 배지 1개.
--      slot_order는 원고의 재료 순서대로 0부터 매긴다(어드민 저장 코드와 같다).
--   3. 공개 시작(valid_from)은 2099-01-01 00:00:00+09 자리 값(2099-01-01 00:00 KST)이다. 일반 유저와 프로덕션에는 보이지 않고,
--      운영자만 staging 믹스 화면에서 공개 전 시험 믹스를 할 수 있다. 오픈 직전 SQL(7-9 목록)이 valid_from을 실제 오픈 시각으로 바꾼다.
--      컬렉션을 트라이브마다 3개로 줄일 때는 재료와 보상 컬렉션이 모두 열리는 날에 공개 시각을 맞춘다(자동 연동 코드는 없다).
--
-- 찾는 방법과 멈추는 조건
--   - 재료·보상 배지는 id가 아니라 «트라이브 이름, 컬렉션 이름, 아이템 이름, Common 등급(type item, 삭제되지 않음)»으로 찾는다.
--   - 재료 86개와 보상 20개가 각각 한 건씩 맞지 않으면(0건이거나 2건 이상) 멈춘다.
--   - 같은 이름의 레시피가 이미 있으면 멈춘다. 이 파일은 한 번만 적용한다.
--   - 재료 배지가 같은 레시피의 보상 배지와 같으면 멈춘다.
--   - 끝에서 레시피·칸·포인트·공개 시작·Common 등급을 검사하고 어긋나면 전체를 되돌린다(트랜잭션).
--
-- 적용 순서: 7-6의 다섯 트라이브 SQL(276~280)을 적용한 뒤. 282(끄기)와는 순서가 상관없다(282는 오픈 직전에 적용한다).
-- 실행: BEGIN/COMMIT 없이 한 번의 호출로 통째로 실행한다. 롤백 실측은 이 파일 뒤에 일부러 오류를 내는 문장을 붙여 같은 호출로 실행한다.
--
-- 적용 전 확인 쿼리(읽기 전용 SELECT):
--   -- 기존 레시피는 옛 트라이브 단독 레시피 3건이고, 자리 값 공개 시작을 가진 레시피는 없다 (3, 0)
--   SELECT count(*) AS recipes,
--          count(*) FILTER (WHERE valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09') AS clue_placeholder FROM public.combination_recipes;
--   -- 단서 레시피 이름과 같은 레시피가 없다 (0)
--   SELECT count(*) FROM public.combination_recipes WHERE name IN ('노트 위의 별', '노을 구석의 트럭', '무명의 손글씨 번호표', '마감 무렵의 노래', '반셔터 벽의 무대 사진', '혼자 찍은 네컷', '좌판 위의 닫힌 카메라', '필름 마지막 장의 트럭', '수첩 첫 장의 아침 노래', '끝까지 들은 새벽의 곡', '10시 50분의 공중전화', '카세트 표지의 같은 글씨', '녹음 부스의 셔터 소리', '같은 숫자만 적힌 번호표', '열쇠고리에 끼운 네컷', '하은의 칸에 꽂힌 카세트', '벽장의 월세 봉투', '창문과 대합실 사이', '맨 아래 줄의 노트 12권', '빨래방 노트 사이의 봉투');
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   -- 단서 레시피 20건: 자리 값 공개 시작, 종료 없음, 열린 채 지급 (20)
--   SELECT count(*) FROM public.combination_recipes
--    WHERE valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND valid_until IS NULL AND NOT reward_locked AND NOT allow_no_reward;
--   -- 재료 칸 86개, 후보는 모두 1개 (86, 1)
--   SELECT count(*), max(array_length(s.allowed_badge_ids, 1)) FROM public.combination_recipe_slots s
--     JOIN public.combination_recipes r ON r.id = s.recipe_id WHERE r.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09';
--   -- 성공 포인트가 칸 수 × 10이 아닌 레시피 (0행)
--   SELECT r.name, r.reward_points, count(s.id) AS slots FROM public.combination_recipes r
--     JOIN public.combination_recipe_slots s ON s.recipe_id = r.id
--    WHERE r.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09'
--    GROUP BY r.id HAVING r.reward_points <> count(s.id) * 10;
--   -- 재료 칸의 후보와 보상 배지 중 Common 아이템 배지가 아닌 것 (0)
--   SELECT count(*) FROM public.combination_recipes r
--     CROSS JOIN LATERAL unnest(r.reward_badge_ids) AS rb(id)
--     JOIN public.badges b ON b.id = rb.id
--    WHERE r.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND (b.type <> 'item' OR b.rarity <> 'common' OR b.deleted_at IS NOT NULL);
--   SELECT count(*) FROM public.combination_recipe_slots s
--     JOIN public.combination_recipes r ON r.id = s.recipe_id
--     CROSS JOIN LATERAL unnest(s.allowed_badge_ids) AS ab(id)
--     JOIN public.badges b ON b.id = ab.id
--    WHERE r.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND (b.type <> 'item' OR b.rarity <> 'common' OR b.deleted_at IS NOT NULL);
--   -- 전체 레시피: 옛 3건 + 단서 20건 (23)
--   SELECT count(*) FROM public.combination_recipes;

-- ----------------------------------------------------------------
-- 0. 작업용 임시 표
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS pg_temp._jam2_clue_slot;
DROP TABLE IF EXISTS pg_temp._jam2_clue;

-- 단서 레시피 20건: 번호, 코드, 이름, 설명, 성공 포인트, 보상 배지를 찾을 이름(트라이브, 컬렉션, 아이템)
CREATE TEMP TABLE _jam2_clue (
  no              INTEGER PRIMARY KEY,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  points          INTEGER NOT NULL,
  reward_tribe    TEXT NOT NULL,
  reward_book     TEXT NOT NULL,
  reward_item     TEXT NOT NULL,
  reward_id       UUID,
  reward_matches  INTEGER,
  recipe_id       UUID NOT NULL DEFAULT gen_random_uuid()
);

INSERT INTO _jam2_clue (no, code, name, description, points, reward_tribe, reward_book, reward_item) VALUES
  (1, 'R01', '노트 위의 별', '엔드롤에서는 접시 옆에 젓가락 포장지로 접은 별이 놓입니다. 보름달 빨래방 노트 위에도 같은 모양의 별이 가끔 놓여 있습니다.', 50, '혼자들', '길거리 우체통의 편지', '접이식 테이블'),
  (2, 'R02', '노을 구석의 트럭', '지난여름 노을을 찍은 휴대폰 사진 구석에 트럭 한 대가 작게 들어 있습니다. 반셔터에서 인화하던 광호가 그 구석을 한참 들여다봤습니다.', 50, '찰칵단', '골목길 필름 스냅', '맨 위의 한 장'),
  (3, 'R03', '무명의 손글씨 번호표', '무명이 남긴 번호표입니다. 손글씨로 적힌 30장 넘는 번호표가 소나무 잡화점 유리 칸 하나에 꽂혀 있습니다.', 40, '소나무 잡화점', '유리 칸 닦는 아침', '칸 번호 팻말'),
  (4, 'R04', '마감 무렵의 노래', '엔드롤 라디오는 마감 무렵 같은 노래를 틀고, 누가 쳐다보면 볼륨이 줄어듭니다. 그 노래는 굿나잇 레터에서도 매일 밤 흐르는데, 한소리는 은주와 같은 밴드의 보컬이었습니다.', 40, '비사이드 레코즈', '열 시의 데모', '동네 밴드의 데모'),
  (5, 'R05', '반셔터 벽의 무대 사진', '반셔터 벽의 사진에서 마이크 앞 사람은 눈을 감고 노래하지만 소리는 없습니다. 비사이드 계산대 아래에는 음반이 11장 있습니다.', 30, '비사이드 레코즈', '계산대의 한마디', '계산대 아래 11장'),
  (6, 'R06', '혼자 찍은 네컷', '혼자 찍은 네컷 사진은 4칸 모두 한 명입니다. 빨래방 줄 끝에서 돌아가는 드럼도 하나입니다.', 40, '혼자들', '침묵의 메아리', '한 대만 도는 세탁기'),
  (7, 'R07', '좌판 위의 닫힌 카메라', '열지 않는 카메라가 놓인 좌판입니다. 구름다리 벼룩시장의 곽진철은 필름이 든 채 들어온 카메라를 담요 위에 그대로 올립니다.', 30, '소나무 잡화점', '중고장터의 잠복자', '좌판 깔개 담요'),
  (8, 'R08', '필름 마지막 장의 트럭', '36장의 마지막 장 구석에 간판 없는 트럭이 있습니다. 불꽃이 스친 통마늘은 어디서 구웠는지 모릅니다.', 50, '한입만 연구회', '무명의 은박지 꼬치', '그을린 통마늘'),
  (9, 'R09', '수첩 첫 장의 아침 노래', '도란의 수첩 첫 장은 제목이 비어 있습니다. 그 노래는 얼리버드 줄 위로 아침마다 흐릅니다.', 50, '한입만 연구회', '편의점 심야 만찬', '웨이팅 번호표'),
  (10, 'R10', '끝까지 들은 새벽의 곡', '새벽 피아노 곡을 끝까지 들은 간호사가 있다고 합니다. 엔드롤에서는 그 간호사를 첫차국밥이라 부릅니다.', 40, '한입만 연구회', '새벽 무렵의 국밥', '뚝배기'),
  (11, 'R11', '10시 50분의 공중전화', '스튜디오 수화기 너머의 사람은 첫 소절만 흥얼거리고 끊습니다. 전화는 빨래방 앞 공중전화에서 1분 안에 끝납니다.', 50, '혼자들', '잃어버린 시간', '점퍼'),
  (12, 'R12', '카세트 표지의 같은 글씨', '표지 글씨는 늘 같은 손입니다. 비사이드 카세트 100개 가운데 1개는 늘 반하은의 칸에 꽂힙니다.', 40, '소나무 잡화점', '창고의 문구 상자', '레터링 펜'),
  (13, 'R13', '녹음 부스의 셔터 소리', '녹음 부스에 현상소 셔터 소리가 30초 담겼습니다. 소리가 난 현상소 간판에는 반셔터라고 파여 있습니다.', 50, '찰칵단', '골목길 필름 스냅', '반셔터 간판'),
  (14, 'R14', '같은 숫자만 적힌 번호표', '번호표 32장에는 모두 같은 숫자가 적혀 있습니다. 무명의 손글씨이고, 트럭은 꼬치를 은박지에 쌉니다.', 50, '한입만 연구회', '무명의 은박지 꼬치', '불향 나는 은박지'),
  (15, 'R15', '열쇠고리에 끼운 네컷', '열쇠고리 47개 가운데 하나에는 혼자 찍은 네컷 사진이 끼워져 있습니다. 가방을 메고 걸으면 그 사진도 다른 열쇠고리와 같이 흔들립니다.', 50, '찰칵단', '빛바랜 사진의 추억', '다이어리에 붙어 있던 사진'),
  (16, 'R16', '하은의 칸에 꽂힌 카세트', '반하은의 칸에는 비사이드 카세트가 하나도 빠짐없이 꽂혀 있습니다. 비사이드는 동네 밴드의 노래를 카세트로 100개씩 찍습니다.', 40, '비사이드 레코즈', '아날로그 믹스테이프', '카세트테이프'),
  (17, 'R17', '벽장의 월세 봉투', '벽장 월세는 매달 같은 날 이름 없는 봉투로 들어옵니다. 봉투에서는 늘 섬유유연제 냄새가 납니다.', 40, '혼자들', '짝 잃은 양말', '세제통'),
  (18, 'R18', '창문과 대합실 사이', '창문의 불이 꺼질 무렵이면 역 쪽에서 피아노 소리가 난다는 말이 있습니다. 대합실 벽에는 칠이 벗겨진 갈색 피아노가 있고, 뚜껑은 누구에게나 열립니다.', 40, '비사이드 레코즈', '새벽의 Lo-Fi', '낡은 피아노'),
  (19, 'R19', '맨 아래 줄의 노트 12권', '빨래방에서 다 쓴 노트 12권은 소나무 잡화점 맨 아래 줄 한 칸에 꽂혀 있습니다. 이 가게의 유리 칸 100개는 한 달씩 빌려주는 자리입니다.', 40, '소나무 잡화점', '유리 칸 닦는 아침', '유리 칸'),
  (20, 'R20', '빨래방 노트 사이의 봉투', '노트 사이에 낀 반셔터 인화 봉투에는 세탁기 문을 하나씩 찍은 사진이 있습니다. 맨 위에는 광호가 고른 한 장이 올려져 있습니다.', 40, '찰칵단', '골목길 필름 스냅', '손글씨 인화 봉투');

-- 재료 칸 86개: 단서 번호, 칸 순서(0부터), 재료 배지를 찾을 이름(트라이브, 컬렉션, 아이템)
CREATE TEMP TABLE _jam2_clue_slot (
  clue_no        INTEGER NOT NULL REFERENCES _jam2_clue (no),
  slot_order     INTEGER NOT NULL,
  tribe          TEXT NOT NULL,
  book_name      TEXT NOT NULL,
  item_name      TEXT NOT NULL,
  badge_id       UUID,
  badge_matches  INTEGER,
  PRIMARY KEY (clue_no, slot_order)
);

INSERT INTO _jam2_clue_slot (clue_no, slot_order, tribe, book_name, item_name) VALUES
  (1, 0, '한입만 연구회', '비 오는 날의 기름 냄새', '젓가락 포장지'),
  (1, 1, '한입만 연구회', '비 오는 날의 기름 냄새', '기름 튄 냅킨'),
  (1, 2, '한입만 연구회', '비 오는 날의 기름 냄새', '오더북'),
  (1, 3, '한입만 연구회', '비 오는 날의 기름 냄새', '재료 상자'),
  (1, 4, '한입만 연구회', '비 오는 날의 기름 냄새', '양파 장아찌'),
  (2, 0, '한입만 연구회', '무명을 쫓는 야식가들', '엎어 둔 휴대폰'),
  (2, 1, '한입만 연구회', '무명을 쫓는 야식가들', '길거리 뻥튀기'),
  (2, 2, '한입만 연구회', '무명을 쫓는 야식가들', '들고 나간 어묵 국물'),
  (2, 3, '한입만 연구회', '무명을 쫓는 야식가들', '넘어진 의자'),
  (2, 4, '한입만 연구회', '무명을 쫓는 야식가들', '한 입 핫도그'),
  (3, 0, '한입만 연구회', '무명의 은박지 꼬치', '염통 꼬치'),
  (3, 1, '한입만 연구회', '무명의 은박지 꼬치', '불맛 파닭 꼬치'),
  (3, 2, '한입만 연구회', '무명의 은박지 꼬치', '매운 데리야끼 소스'),
  (3, 3, '한입만 연구회', '무명의 은박지 꼬치', '빈 양념통'),
  (4, 0, '한입만 연구회', '비 오는 날의 기름 냄새', '주방 구석의 라디오'),
  (4, 1, '한입만 연구회', '비 오는 날의 기름 냄새', '녹두빈대떡'),
  (4, 2, '한입만 연구회', '비 오는 날의 기름 냄새', '비닐우산'),
  (4, 3, '한입만 연구회', '비 오는 날의 기름 냄새', '바삭한 해물파전'),
  (5, 0, '찰칵단', '골목길 필름 스냅', '압정 한 줌'),
  (5, 1, '찰칵단', '골목길 필름 스냅', '현상소 영수증'),
  (5, 2, '찰칵단', '골목길 필름 스냅', '인화 타이머'),
  (6, 0, '찰칵단', '빛바랜 사진의 추억', '오래된 앨범'),
  (6, 1, '찰칵단', '빛바랜 사진의 추억', '일회용 카메라'),
  (6, 2, '찰칵단', '빛바랜 사진의 추억', '초점이 나간 필름'),
  (6, 3, '찰칵단', '빛바랜 사진의 추억', '복원 전과 후의 사진 한 쌍'),
  (7, 0, '찰칵단', '골목길 필름 스냅', '황동 카메라'),
  (7, 1, '찰칵단', '골목길 필름 스냅', '낡은 필름 카메라 스트랩'),
  (7, 2, '찰칵단', '골목길 필름 스냅', '다 쓴 노란 필름통'),
  (8, 0, '찰칵단', '매직 아워', '강가 사진'),
  (8, 1, '찰칵단', '매직 아워', '필름 슬리브'),
  (8, 2, '찰칵단', '매직 아워', '다 찍은 필름'),
  (8, 3, '찰칵단', '매직 아워', '구도 틀'),
  (8, 4, '찰칵단', '매직 아워', '반사판'),
  (9, 0, '비사이드 레코즈', '한쪽 귀의 출근길', '가게 노래 수첩'),
  (9, 1, '비사이드 레코즈', '한쪽 귀의 출근길', '수첩 볼펜'),
  (9, 2, '비사이드 레코즈', '한쪽 귀의 출근길', '문 위의 스피커'),
  (9, 3, '비사이드 레코즈', '한쪽 귀의 출근길', '문 괴는 벽돌'),
  (9, 4, '비사이드 레코즈', '한쪽 귀의 출근길', '한쪽만 끼는 이어폰'),
  (10, 0, '비사이드 레코즈', '새벽의 Lo-Fi', '첫차 시간표'),
  (10, 1, '비사이드 레코즈', '새벽의 Lo-Fi', '피아노 의자'),
  (10, 2, '비사이드 레코즈', '새벽의 Lo-Fi', '캠코더'),
  (10, 3, '비사이드 레코즈', '새벽의 Lo-Fi', '소리굽쇠'),
  (11, 0, '비사이드 레코즈', '열 시의 데모', '스튜디오 전화기'),
  (11, 1, '비사이드 레코즈', '열 시의 데모', '전화 옆 클립보드'),
  (11, 2, '비사이드 레코즈', '열 시의 데모', '스튜디오 벽시계'),
  (11, 3, '비사이드 레코즈', '열 시의 데모', '스튜디오 의자'),
  (11, 4, '비사이드 레코즈', '열 시의 데모', '곡명 카드함'),
  (12, 0, '비사이드 레코즈', '아날로그 믹스테이프', '믹스테이프 라벨지'),
  (12, 1, '비사이드 레코즈', '아날로그 믹스테이프', '100개들이 상자'),
  (12, 2, '비사이드 레코즈', '아날로그 믹스테이프', '카세트 케이스'),
  (12, 3, '비사이드 레코즈', '아날로그 믹스테이프', '공테이프'),
  (13, 0, '비사이드 레코즈', '삼십 초의 소리', 'USB 메모리'),
  (13, 1, '비사이드 레코즈', '삼십 초의 소리', '초시계'),
  (13, 2, '비사이드 레코즈', '삼십 초의 소리', '팝필터'),
  (13, 3, '비사이드 레코즈', '삼십 초의 소리', '방음 스펀지'),
  (13, 4, '비사이드 레코즈', '삼십 초의 소리', '12장 달력'),
  (14, 0, '소나무 잡화점', '행운의 잡동사니', '종이 버스표'),
  (14, 1, '소나무 잡화점', '행운의 잡동사니', '다 쓴 영화표'),
  (14, 2, '소나무 잡화점', '행운의 잡동사니', '빵 봉지 집게'),
  (14, 3, '소나무 잡화점', '행운의 잡동사니', '접어 둔 붕어빵 봉투'),
  (14, 4, '소나무 잡화점', '행운의 잡동사니', '구멍 뚫린 버스 토큰'),
  (15, 0, '소나무 잡화점', '열쇠고리를 단 가방', '아크릴 열쇠고리'),
  (15, 1, '소나무 잡화점', '열쇠고리를 단 가방', '종이 꼬리표'),
  (15, 2, '소나무 잡화점', '열쇠고리를 단 가방', '검은 가방'),
  (15, 3, '소나무 잡화점', '열쇠고리를 단 가방', '아크릴 스탠드'),
  (15, 4, '소나무 잡화점', '열쇠고리를 단 가방', '캐릭터 손거울'),
  (16, 0, '소나무 잡화점', '창고의 문구 상자', '단종 잉크병'),
  (16, 1, '소나무 잡화점', '창고의 문구 상자', '마스킹테이프 상자'),
  (16, 2, '소나무 잡화점', '창고의 문구 상자', '명성문방구 간판'),
  (16, 3, '소나무 잡화점', '창고의 문구 상자', '책받침 한 장'),
  (17, 0, '소나무 잡화점', '유리 칸 닦는 아침', '칸 열쇠'),
  (17, 1, '소나무 잡화점', '유리 칸 닦는 아침', '극세사 수건'),
  (17, 2, '소나무 잡화점', '유리 칸 닦는 아침', '비워 둔 받침대'),
  (17, 3, '소나무 잡화점', '유리 칸 닦는 아침', '손글씨 이름표'),
  (18, 0, '혼자들', '잃어버린 시간', '스톱워치'),
  (18, 1, '혼자들', '잃어버린 시간', '형광등 한 줄'),
  (18, 2, '혼자들', '잃어버린 시간', '타이머'),
  (18, 3, '혼자들', '잃어버린 시간', '모래시계'),
  (19, 0, '혼자들', '길거리 우체통의 편지', '닳은 노트'),
  (19, 1, '혼자들', '길거리 우체통의 편지', '클립'),
  (19, 2, '혼자들', '길거리 우체통의 편지', '수리 목요일 메모'),
  (19, 3, '혼자들', '길거리 우체통의 편지', '만년필'),
  (20, 0, '혼자들', '침묵의 메아리', '세탁망'),
  (20, 1, '혼자들', '침묵의 메아리', '세탁볼'),
  (20, 2, '혼자들', '침묵의 메아리', '제습기'),
  (20, 3, '혼자들', '침묵의 메아리', '보풀 롤러');

-- ----------------------------------------------------------------
-- 1. 이름으로 배지를 찾고, 찾은 수가 기대와 다르면 멈춘다
-- ----------------------------------------------------------------
UPDATE _jam2_clue_slot s
   SET badge_matches = (SELECT count(*)
                          FROM public.badges b
                          JOIN public.item_books ib ON ib.id = b.item_book_id
                          JOIN public.tribes t ON t.id = ib.tribe_id
                         WHERE t.name = s.tribe AND ib.name = s.book_name AND b.name = s.item_name
                           AND b.type = 'item' AND b.rarity = 'common' AND b.deleted_at IS NULL),
       badge_id      = (SELECT b.id
                          FROM public.badges b
                          JOIN public.item_books ib ON ib.id = b.item_book_id
                          JOIN public.tribes t ON t.id = ib.tribe_id
                         WHERE t.name = s.tribe AND ib.name = s.book_name AND b.name = s.item_name
                           AND b.type = 'item' AND b.rarity = 'common' AND b.deleted_at IS NULL
                         ORDER BY b.created_at LIMIT 1);

UPDATE _jam2_clue c
   SET reward_matches = (SELECT count(*)
                           FROM public.badges b
                           JOIN public.item_books ib ON ib.id = b.item_book_id
                           JOIN public.tribes t ON t.id = ib.tribe_id
                          WHERE t.name = c.reward_tribe AND ib.name = c.reward_book AND b.name = c.reward_item
                            AND b.type = 'item' AND b.rarity = 'common' AND b.deleted_at IS NULL),
       reward_id      = (SELECT b.id
                           FROM public.badges b
                           JOIN public.item_books ib ON ib.id = b.item_book_id
                           JOIN public.tribes t ON t.id = ib.tribe_id
                          WHERE t.name = c.reward_tribe AND ib.name = c.reward_book AND b.name = c.reward_item
                            AND b.type = 'item' AND b.rarity = 'common' AND b.deleted_at IS NULL
                          ORDER BY b.created_at LIMIT 1);

DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(*) INTO v_bad FROM _jam2_clue_slot WHERE badge_matches IS DISTINCT FROM 1;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '재료 배지를 이름으로 한 건씩 찾지 못한 것이 %개입니다(기대: 86개 모두 1건). 7-6의 트라이브 SQL(276~280)이 적용되지 않았거나 같은 이름이 둘 이상 있습니다.', v_bad;
  END IF;

  SELECT count(*) INTO v_bad FROM _jam2_clue WHERE reward_matches IS DISTINCT FROM 1;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '보상 배지를 이름으로 한 건씩 찾지 못한 것이 %개입니다(기대: 20개 모두 1건).', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM _jam2_clue_slot s JOIN _jam2_clue c ON c.no = s.clue_no
   WHERE s.badge_id = c.reward_id;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '재료 배지가 같은 레시피의 보상 배지와 같은 것이 %개입니다.', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.combination_recipes r JOIN _jam2_clue c ON c.name = r.name;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '단서 레시피와 같은 이름의 레시피가 이미 %건 있습니다. 이 파일은 한 번만 적용합니다.', v_bad;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. 레시피 20건과 재료 칸 86개 넣기 (공개 시작은 먼 미래 자리 값)
-- ----------------------------------------------------------------
INSERT INTO public.combination_recipes (id, name, description, reward_points, reward_badge_ids, valid_from)
SELECT c.recipe_id, c.name, c.description, c.points, ARRAY[c.reward_id], TIMESTAMPTZ '2099-01-01 00:00:00+09'
  FROM _jam2_clue c
 ORDER BY c.no;

INSERT INTO public.combination_recipe_slots (recipe_id, slot_order, badge_type, allowed_badge_ids)
SELECT c.recipe_id, s.slot_order, 'item', ARRAY[s.badge_id]
  FROM _jam2_clue_slot s
  JOIN _jam2_clue c ON c.no = s.clue_no
 ORDER BY s.clue_no, s.slot_order;

-- ----------------------------------------------------------------
-- 3. 끝 검사 — 어긋나면 오류로 멈추고 트랜잭션 전체가 되돌아간다
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_n INTEGER;
  v_expected INTEGER;
BEGIN
  -- 레시피 20건: 이름·설명·성공 포인트·보상 배지가 계획과 같고, 자리 값 공개 시작, 종료 없음, 열린 채 지급, 보상 없음 허용 꺼짐
  SELECT count(*) INTO v_n
    FROM public.combination_recipes r
    JOIN _jam2_clue c ON c.recipe_id = r.id
   WHERE r.name = c.name AND r.description = c.description AND r.reward_points = c.points
     AND r.reward_badge_ids = ARRAY[c.reward_id]
     AND r.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND r.valid_until IS NULL
     AND NOT r.reward_locked AND NOT r.allow_no_reward;
  IF v_n <> 20 THEN
    RAISE EXCEPTION '끝 검사: 계획과 같은 레시피가 %건입니다(기대 20).', v_n;
  END IF;

  -- 재료 칸 86개
  SELECT count(*) INTO v_n FROM public.combination_recipe_slots s WHERE s.recipe_id IN (SELECT recipe_id FROM _jam2_clue);
  IF v_n <> 86 THEN
    RAISE EXCEPTION '끝 검사: 단서 레시피의 칸이 %개입니다(기대 86).', v_n;
  END IF;

  -- 칸의 순서와 후보가 계획과 같다: item 칸, 후보는 재료 배지 1개
  SELECT count(*) INTO v_n
    FROM public.combination_recipe_slots s
    JOIN _jam2_clue c ON c.recipe_id = s.recipe_id
    JOIN _jam2_clue_slot x ON x.clue_no = c.no AND x.slot_order = s.slot_order
   WHERE s.badge_type = 'item' AND s.allowed_badge_ids = ARRAY[x.badge_id];
  IF v_n <> 86 THEN
    RAISE EXCEPTION '끝 검사: 계획과 같은 칸이 %개입니다(기대 86).', v_n;
  END IF;

  -- 성공 포인트 = 칸 수 × 10
  SELECT count(*) INTO v_n
    FROM public.combination_recipes r
    JOIN _jam2_clue c ON c.recipe_id = r.id
   WHERE r.reward_points = 10 * (SELECT count(*) FROM public.combination_recipe_slots s WHERE s.recipe_id = r.id);
  IF v_n <> 20 THEN
    RAISE EXCEPTION '끝 검사: 성공 포인트가 칸 수 × 10인 레시피가 %건입니다(기대 20).', v_n;
  END IF;

  -- 재료와 보상 배지는 모두 Common 아이템 배지다
  SELECT count(*) INTO v_expected FROM (SELECT badge_id FROM _jam2_clue_slot UNION SELECT reward_id FROM _jam2_clue) u;
  SELECT count(*) INTO v_n
    FROM public.badges b
   WHERE b.id IN (SELECT badge_id FROM _jam2_clue_slot UNION SELECT reward_id FROM _jam2_clue)
     AND b.type = 'item' AND b.rarity = 'common' AND b.deleted_at IS NULL;
  IF v_n <> v_expected THEN
    RAISE EXCEPTION '끝 검사: Common 아이템 배지인 재료·보상이 %개입니다(기대 %).', v_n, v_expected;
  END IF;
END $$;

DROP TABLE _jam2_clue_slot;
DROP TABLE _jam2_clue;

-- 되돌림 SQL
-- 단서 레시피 20건만 지운다. 칸(combination_recipe_slots)은 외래키 ON DELETE CASCADE로 함께 지워진다. 한 번의 호출로 통째로 실행한다.
-- 공개 시작을 실제 오픈 시각으로 바꾼 뒤라면 유저가 이미 믹스했을 수 있다. 그때는 먼저 user_combine_success_logs와 user_combine_fail_logs를 확인하고,
-- 배지 조건(condition_json.recipe_first_success)이 이 레시피를 가리키는지도 확인한다(삭제 가드와 같다).
--
-- 1) 지우기 (자리 값 공개 시작인 상태에서는 정확히 20건이 지워진다. 공개 시작을 이미 바꿨다면 valid_from 조건을 뺀다)
-- DELETE FROM public.combination_recipes WHERE valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09' AND name IN ('노트 위의 별', '노을 구석의 트럭', '무명의 손글씨 번호표', '마감 무렵의 노래', '반셔터 벽의 무대 사진', '혼자 찍은 네컷', '좌판 위의 닫힌 카메라', '필름 마지막 장의 트럭', '수첩 첫 장의 아침 노래', '끝까지 들은 새벽의 곡', '10시 50분의 공중전화', '카세트 표지의 같은 글씨', '녹음 부스의 셔터 소리', '같은 숫자만 적힌 번호표', '열쇠고리에 끼운 네컷', '하은의 칸에 꽂힌 카세트', '벽장의 월세 봉투', '창문과 대합실 사이', '맨 아래 줄의 노트 12권', '빨래방 노트 사이의 봉투');
--
-- 2) 되돌린 뒤 확인: 아래 둘이 모두 0이어야 한다
-- SELECT count(*) FROM public.combination_recipes WHERE name IN ('노트 위의 별', '노을 구석의 트럭', '무명의 손글씨 번호표', '마감 무렵의 노래', '반셔터 벽의 무대 사진', '혼자 찍은 네컷', '좌판 위의 닫힌 카메라', '필름 마지막 장의 트럭', '수첩 첫 장의 아침 노래', '끝까지 들은 새벽의 곡', '10시 50분의 공중전화', '카세트 표지의 같은 글씨', '녹음 부스의 셔터 소리', '같은 숫자만 적힌 번호표', '열쇠고리에 끼운 네컷', '하은의 칸에 꽂힌 카세트', '벽장의 월세 봉투', '창문과 대합실 사이', '맨 아래 줄의 노트 12권', '빨래방 노트 사이의 봉투');
-- SELECT count(*) FROM public.combination_recipes WHERE valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09';
