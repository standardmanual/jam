-- 103: "POI 배지" → "체크인 배지" 용어 통일 (티켓 20260826_004)
--
-- 배경: 커밋 2d01df14에서 "체크인(CHECK-IN)"이 공식 고정 용어로 확정됐으나 소스코드·DB에는
-- 전파되지 않아 같은 개념이 '장소' / '장소 배지' / 'POI 배지' / 'POI 체크인' 등 7가지로
-- 불리고 있었다. 이 마이그레이션은 그중 **배지 도메인**의 DB 식별자를 checkin으로 통일한다.
--
-- ⚠️ 경계 규칙 — 3갈래로 나뉜다 (사용자 확정, 2026-08-26)
--   1) 배지 도메인            → checkin 으로 변경  ← 이 파일이 다루는 범위
--   2) 드랍/픽업 지점 정보    → poi 유지 (기술 식별자)
--      · poi / poi_categories / poi_drops / poi_blocks / poi_views / poi_search_cache 테이블
--      · poi.linked_badge_id, user_activity_badges.triggered_by_poi_id
--      · user_checkin_badge_earns.poi_id 컬럼 (이름 그대로 둔다 — 지점 참조 FK)
--      · missions.condition_json 의 poi_id 키 (20260825_031 계약 검증 대상 — 변경 시 즉시 런타임 실패)
--   3) 지점을 가리키는 사용자 노출 문구 → 'POI' 약어만 제거 (DB 변경 없음, 코드 i18n에서 처리)
--
-- ⚠️ 이 파일은 티켓 20260826_004(db 유형) 규칙에 따라 **작성만** 하고 실행하지 않았다.
--    실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 🚨 실행 순서 제약 — 반드시 지킬 것
--   **DDL과 코드 배포는 원자적이어야 한다. DDL 먼저 → 코드 배포를 곧바로 이어서 한다.**
--   · DDL만 적용하고 구 코드가 살아 있으면: badge_type 'poi' / notification_type
--     'poi_badge_earned' / mission_type 'poi_visit' 리터럴이 전부 무효값이 되어 배지 조회는
--     22P02(invalid input value for enum), 알림 생성은 create_notification() 호출 실패,
--     user_poi_badge_earns 접근은 PostgREST 42P01(테이블 없음) → HTTP 404가 된다.
--   · 코드만 배포하고 DDL이 없으면: 같은 오류가 방향만 반대로 발생한다.
--   → 실무 절차: 트래픽이 적은 시간대에 이 SQL 적용 직후 Vercel 배포를 승격한다.
--     사이 구간(수십 초)에는 체크인 배지 조회·Strava 동기화가 실패할 수 있다.
--   실행 후: `npm run db:types`로 src/types/database.generated.ts를 재생성해
--            수동 편집분(src/types/database.ts)과 대조한다.
--
-- 사전 검증 완료 (2026-08-26, 티켓 조사)
--   · badge_type / notification_type 을 참조하는 뷰·함수·머티리얼라이즈드뷰·인덱스: 0건
--   · enum 사용 컬럼: badges.type, notifications.type 뿐. default expression 없음
--   · enum 값 'poi'를 참조하는 CHECK 제약: 없음
--   · 실데이터: badges type=poi 1,800 / notifications poi_badge_earned 5 /
--     missions poi_visit 4 / user_poi_badge_earns 142행 / poi 지점 2,374(변경 없음)
--
-- ℹ️ ALTER TYPE ... RENAME VALUE 는 ADD VALUE 와 달리 트랜잭션 제약이 없다
--    (ADD VALUE만 "같은 트랜잭션에서 그 값을 쓸 수 없다"는 제약을 갖는다).
--    값의 OID가 그대로라 기존 1,800행·5행은 **UPDATE 없이** 새 이름으로 읽힌다.
--
-- ♻️ 재실행 안전(멱등) — 모든 rename을 존재 확인으로 감쌌다.
--    부분 적용 후 재시도하거나 이미 적용된 DB에 다시 돌려도 에러 없이 통과한다.
--
-- ↩️ 롤백 DDL (적용 후 되돌려야 할 경우 — 반드시 코드 롤백을 먼저 한다)
--   ALTER TYPE public.badge_type RENAME VALUE 'checkin' TO 'poi';
--   ALTER TYPE public.notification_type RENAME VALUE 'checkin_badge_earned' TO 'poi_badge_earned';
--   ALTER TABLE public.missions DROP CONSTRAINT missions_mission_type_check;
--   UPDATE public.missions SET mission_type = 'poi_visit' WHERE mission_type = 'checkin';
--   ALTER TABLE public.missions ADD CONSTRAINT missions_mission_type_check
--     CHECK (mission_type IN ('distance','poi_visit','activity_count','item_collect',
--                             'streak_days','duration_minutes','elevation_gain_m'));
--   ALTER TABLE public.user_checkin_badge_earns RENAME TO user_poi_badge_earns;
--   (인덱스·제약·정책 이름도 역방향으로 되돌릴 것 — 아래 3)의 이름 목록 참고)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) badge_type ENUM: 'poi' → 'checkin'
--    badges.type 1,800행이 UPDATE 없이 따라온다.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'badge_type' AND e.enumlabel = 'poi'
  ) THEN
    ALTER TYPE public.badge_type RENAME VALUE 'poi' TO 'checkin';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) notification_type ENUM: 'poi_badge_earned' → 'checkin_badge_earned'
--    notifications.type 5행이 UPDATE 없이 따라온다.
--    ⚠️ notifications.group_key 에는 'poi_badge_earned:<activityId>' 형태의 문자열이
--       그대로 남는다. group_key는 묶음 병합 키일 뿐 렌더에 쓰이지 않고, 과거 소식을
--       다시 병합할 일도 없으므로 문자열 치환하지 않는다 (건드리면 UNIQUE 충돌 위험만 커진다).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'notification_type'
      AND e.enumlabel = 'poi_badge_earned'
  ) THEN
    ALTER TYPE public.notification_type
      RENAME VALUE 'poi_badge_earned' TO 'checkin_badge_earned';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) missions.mission_type: 'poi_visit' → 'checkin'
--    ENUM이 아니라 TEXT + CHECK 제약이라 제약 재생성과 UPDATE가 둘 다 필요하다.
--    제약 이름을 하드코딩하지 않고 동적으로 찾아 지운다 (082_mission_engine_extension.sql 패턴).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.missions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%mission_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.missions DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

UPDATE public.missions SET mission_type = 'checkin' WHERE mission_type = 'poi_visit';

ALTER TABLE public.missions
  ADD CONSTRAINT missions_mission_type_check
  CHECK (mission_type IN (
    'distance', 'checkin', 'activity_count', 'item_collect',
    'streak_days', 'duration_minutes', 'elevation_gain_m'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) user_poi_badge_earns → user_checkin_badge_earns
--    ALTER TABLE ... RENAME TO 는 인덱스·제약·정책 이름을 따라 바꾸지 않으므로 직접 정리한다.
--    poi_id 컬럼은 지점 참조라 이름 그대로 둔다 (경계 규칙 2).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.user_poi_badge_earns') IS NOT NULL THEN
    ALTER TABLE public.user_poi_badge_earns RENAME TO user_checkin_badge_earns;
  END IF;
END $$;

ALTER INDEX IF EXISTS public.idx_user_poi_badge_earns_user_badge
  RENAME TO idx_user_checkin_badge_earns_user_badge;
ALTER INDEX IF EXISTS public.idx_user_poi_badge_earns_earned_at
  RENAME TO idx_user_checkin_badge_earns_earned_at;

-- PK·FK·UNIQUE 제약: 자동 생성 이름(63자 절단 가능)이라 하드코딩하지 않고 접두사로 찾아 바꾼다.
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.user_checkin_badge_earns'::regclass
      AND conname LIKE 'user\_poi\_badge\_earns%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.user_checkin_badge_earns RENAME CONSTRAINT %I TO %I',
      con.conname,
      'user_checkin_badge_earns' || substring(con.conname from length('user_poi_badge_earns') + 1)
    );
  END LOOP;
END $$;

-- 정책명을 하드코딩하지 않고 조회해서 바꾼다.
-- (053 원본은 "user_poi_badge_earns: 본인만 읽기"지만, 이름이 조금이라도 다르면
--  하드코딩 방식은 그 지점에서 트랜잭션 전체가 롤백된다.)
DO $$
DECLARE
  pol text;
BEGIN
  SELECT policyname INTO pol
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'user_checkin_badge_earns'
    AND policyname LIKE 'user\_poi\_badge\_earns%'
  LIMIT 1;

  IF pol IS NOT NULL THEN
    EXECUTE format(
      'ALTER POLICY %I ON public.user_checkin_badge_earns RENAME TO %I',
      pol,
      'user_checkin_badge_earns' || substring(pol from length('user_poi_badge_earns') + 1)
    );
  END IF;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- ℹ️ feed_event_type 은 건드리지 않는다 (티켓 20260826_004 구현 판단)
--    티켓 초안은 "체크인 이벤트 타입이 아예 없다"를 전제로 enum 확장을 계획했으나,
--    티켓 작성 직후 머지된 20260826_001(커밋 943653b7)이 체크인 피드 기록을
--    `badge_earned` + metadata(poi_name·visit_count)로 이미 구현했다.
--    별도 enum 값을 새로 만들면 (a) 기존 피드 행을 재분류하는 데이터 마이그레이션이
--    필요하고 (b) FeedSection 필터 탭(전체/배지/아이템/미션) 어디에도 속하지 않는
--    이벤트가 생겨 피드에서 사라진다. 이번 티켓은 표시 문구만 '체크인'으로 통일한다.
-- ─────────────────────────────────────────────────────────────────────────────

-- 🧪 적용 후 검증
--   SELECT unnest(enum_range(NULL::public.badge_type));         -- activity/item/checkin
--   SELECT unnest(enum_range(NULL::public.notification_type));  -- checkin_badge_earned 포함
--   SELECT type, count(*) FROM public.badges GROUP BY type;     -- checkin 1,800
--   SELECT mission_type, count(*) FROM public.missions GROUP BY mission_type;  -- poi_visit 0
--   SELECT count(*) FROM public.user_checkin_badge_earns;       -- 142
--   SELECT count(*) FROM public.poi;                            -- 2,374 (변경 없음)
