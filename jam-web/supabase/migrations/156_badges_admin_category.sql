-- 156: badges.admin_category 컬럼 신설 — 어드민 전용 분류(JAM! 카테고리)
--      (티켓 20260910_2055)
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 배경:
--   티켓 20260910_1557이 "서비스 사용량"(팔로워 수·팔로잉 수·일일 동기화 횟수) 조건 배지
--   엔진을 신설했고, 20260910_1959가 실제 배지 3종을 만들었다. 유저 노출 분류(badge_type
--   enum)는 늘리지 않는다는 원칙 아래 `type='activity'`로 저장했는데, 그 결과 **어드민**에서
--   이 배지들을 구분할 방법이 전혀 없어졌다 — 배지 목록 필터에 안 뜨고, 계열관리에서는
--   "계열 키 없음" 단독 계열로 섞여 종목·조건지표 칸이 "—"로 보이고, 시뮬레이터는 평가
--   불가능한 지표인데도 매번 "미획득"으로 잡힌다. 앞으로 레벨형·등급형으로 확장되고
--   게이트미션·아이템북 게이트 조건으로도 쓸 계획이라, 어드민에서 "정식으로 관리·선택
--   가능한 분류"가 필요하다.
--
-- ⚠️ 컬럼명이 `admin_category`인 이유 (최초 스펙 `category`에서 변경):
--   `badges.category`는 이미 마이그레이션 113(티켓 20260830_1344)이 추가했고, **체크인
--   배지가 속한 "지점 카테고리"**(poi_categories(slug) FK) 전용이다. 죽은 컬럼이 아니라
--   현재도 BadgeForm.tsx·어드민 배지 생성/수정 API·배지 목록 필터가 쓰는 살아있는 기능이다.
--   특히 API가 `type !== 'checkin'`이면 `category`를 항상 NULL로 덮어쓰는 가드까지 있어,
--   이름만 같은 신규 컬럼을 추가하면 JAM! 배지를 어드민에서 한 번이라도 저장할 때 값이
--   조용히 사라진다. 그래서 완전히 별개의 신규 컬럼 `admin_category`로 분리한다 — 값
--   집합·CHECK 제약·판별 로직 등 설계 원칙 자체는 최초 스펙과 동일하고 이름만 바뀌었다.
--   기존 `category`(지점 카테고리) 컬럼·FK·API 가드 로직에는 전혀 손대지 않는다.
--
-- 값 집합: 기존 `condition_json` 화이트리스트 CHECK 패턴(badges_condition_json_known_keys,
--   마이그레이션 102/155)과 일관되게 화이트리스트로 관리한다. 현재는 'jam' 1개뿐이다 —
--   새 값이 필요해지면 이 CHECK를 확장하는 후속 마이그레이션에서 추가한다.
--
-- 실행 순서: 코드 배포와 무관하게 먼저 실행해도 안전하다. 신규 nullable 컬럼 추가라
--   기존 행(전부 NULL)에 영향이 없다.
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS 패턴.
--   UPDATE는 대상 3건이 이미 'jam'이면 그대로 재적용돼도 결과가 같다.

BEGIN;

ALTER TABLE public.badges ADD COLUMN IF NOT EXISTS admin_category TEXT;

ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_admin_category_known_values;
ALTER TABLE public.badges
  ADD CONSTRAINT badges_admin_category_known_values
  CHECK (admin_category IS NULL OR admin_category IN ('jam'));

-- 기존 JAM! 카테고리 배지 3종 반영 — id는 티켓 20260910_1959 실행 완료 기록(실제 생성된
-- UUID)에서 그대로 가져왔다.
UPDATE public.badges
   SET admin_category = 'jam'
 WHERE id IN (
   '5f1c677e-9786-4c81-956f-f3440bb78a93', -- 만 명의 시선 (follower_count 10,000)
   '2f89636b-1607-449f-9313-c6634de91996', -- 만 번의 손짓 (following_count 10,000)
   'b45ae272-1098-4522-a652-fbb6ce21ab30'  -- 백만 번의 동기화 (daily_sync_count 1,000,000)
 );

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 컬럼·제약이 생겼는지
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'badges' AND column_name = 'admin_category';
--
-- -- ② 대상 3건이 정확히 반영됐는지 (3행이어야 한다)
-- SELECT id, name, admin_category FROM public.badges WHERE admin_category = 'jam' ORDER BY name;
--
-- -- ③ 화이트리스트 밖 값은 거부되는지 — 롤백 스모크. MCP엔 트랜잭션이 없으므로
-- --    RAISE EXCEPTION으로 되돌린다.
-- DO $smoke$
-- BEGIN
--   UPDATE public.badges SET admin_category = '__invalid__'
--    WHERE id = '5f1c677e-9786-4c81-956f-f3440bb78a93';
--   RAISE EXCEPTION '롤백: 화이트리스트 밖 값이 통과했다면 이 줄에 절대 도달하면 안 됨';
-- EXCEPTION WHEN check_violation THEN
--   RAISE NOTICE '정상 — CHECK 제약이 화이트리스트 밖 값을 거부했다';
-- END
-- $smoke$;

-- ↩️ 롤백 DDL
--   ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_admin_category_known_values;
--   ALTER TABLE public.badges DROP COLUMN IF EXISTS admin_category;
--   -- 다른 컬럼·FK에 의존성이 없는 완전히 독립된 신규 컬럼이라 안전하게 되돌릴 수 있다.
--   -- 기존 category(지점 카테고리) 컬럼은 이 마이그레이션으로 전혀 변경되지 않았으므로
--   -- 별도 롤백이 필요 없다.
