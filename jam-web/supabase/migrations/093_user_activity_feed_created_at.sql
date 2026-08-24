-- JAM! user_activity_feed 기록 시각(created_at) 컬럼 추가
-- 티켓: 20260824_003 (최초 Strava 연동 직후 배지 획득 연출)
-- 생성일: 2026-08-24
--
-- ────────────────────────────────────────────────────────────────────────────
-- 왜 필요한가
-- ────────────────────────────────────────────────────────────────────────────
-- user_activity_feed는 id / user_id / event_type / event_at / metadata 5개 컬럼뿐이라
-- "이 행이 언제 기록됐는지"를 사후에 알 방법이 아예 없다.
--
-- event_at은 기록 시각이 아니라 **Strava 활동 시작 시각**이다. recordFeedEvent()의 4번째
-- 인자로 활동 시작 시각이 그대로 들어간다(badge-engine / drop-engine / strava/sync 세 곳).
--
-- 프로덕션 실측 (2026-08-24, 조회 전용):
--   · item_dropped 101건 중 inventory_items.obtained_at(= 삽입 시각, DEFAULT NOW())과
--     10분 이내인 건 54/97. 편차 -27,502분 ~ +470분
--   · badge_earned 23건 중 user_activity_badges.earned_at과 10분 이내인 건 0/23.
--     편차 -5,204분 ~ +159분
--
-- 즉 event_at으로는 "방금 획득했는가"를 판정할 수 없다(미노출·오검출 양방향).
-- 최초 연동 연출은 도착 페이지에서 "방금 받은 배지"를 되읽어야 하므로 기록 시각이 필요하다.
--
-- ────────────────────────────────────────────────────────────────────────────
-- 실행 순서가 중요하다
-- ────────────────────────────────────────────────────────────────────────────
-- `ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`를 한 줄로 쓰면
-- PostgreSQL 11+ 는 기존 행 전체에 **ALTER 시점의 NOW() 하나**를 채운다.
-- 그러면 기존 388행이 전부 "방금 기록됨"이 되어, 마이그레이션 직후 10분 동안
-- 최초 연동 연출이 과거 배지를 통째로 띄우는 오검출이 난다.
-- 그래서 (1) NULL 컬럼 추가 → (2) 백필 → (3) DEFAULT·NOT NULL 부여 순으로 나눈다.
-- 세 단계를 한 트랜잭션에 묶어 ACCESS EXCLUSIVE 락 아래에서 원자적으로 처리한다
-- (중간에 INSERT가 끼어들어 NULL 행이 생기면 마지막 SET NOT NULL이 실패한다).

BEGIN;

-- (1) 기본값 없이 추가 — 기존 행은 NULL로 남는다
ALTER TABLE public.user_activity_feed
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

-- (2) 백필 — 기존 행의 기록 시각은 사후에 알 수 없으므로 event_at으로 근사한다.
--     다만 event_at이 "지금(=마이그레이션 시점)에 가깝거나 미래"인 행은 그대로 두면
--     연출 판정 창(10분)에 걸려 오검출이 난다. startDateLocal은 Strava가 로컬 벽시계에
--     Z를 붙여 주는 값이라 KST 사용자는 event_at이 최대 +9시간 미래로 찍힌다.
--     → 상한을 NOW() - 1시간으로 잘라 **기존 행은 어떤 경우에도 "방금 기록됨"이 되지 않게** 한다.
--     (판정 창 10분보다 넉넉하게 둔다. 오검출보다 미노출이 안전한 방향이다.)
--     측정 시점(2026-08-24 01:11 UTC) 기준 event_at이 현재 이후인 행은 0건이라 이 상한은
--     사실상 no-op이며, 백필 결과는 event_at과 동일하다.
UPDATE public.user_activity_feed
   SET created_at = LEAST(event_at, NOW() - INTERVAL '1 hour')
 WHERE created_at IS NULL;

-- (3) 이후 INSERT는 DB 시계로 기록 시각을 채운다.
--     recordFeedEvent()는 created_at을 넘기지 않으므로 항상 이 기본값이 적용된다.
ALTER TABLE public.user_activity_feed
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE public.user_activity_feed
  ALTER COLUMN created_at SET NOT NULL;

-- 최근 획득 조회(/api/badges/recent-earned)의 조건: user_id + event_type + created_at >= since
CREATE INDEX IF NOT EXISTS idx_user_activity_feed_user_created
  ON public.user_activity_feed (user_id, created_at DESC);

COMMENT ON COLUMN public.user_activity_feed.created_at IS
  '행이 DB에 기록된 시각. event_at(= Strava 활동 시작 시각)과 다르다. '
  '"방금 획득했는가" 판정은 반드시 이 컬럼을 쓴다. '
  '마이그레이션 093 이전 행은 event_at 기반 근사값이다(NOW()-1h 상한 적용).';

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- 적용 후 확인 쿼리 (조회 전용)
-- ────────────────────────────────────────────────────────────────────────────
-- SELECT count(*) FILTER (WHERE created_at IS NULL) AS null_cnt,
--        count(*) FILTER (WHERE created_at > NOW() - INTERVAL '10 minutes') AS recent_cnt,
--        count(*) AS total
--   FROM public.user_activity_feed;
--   → null_cnt = 0, recent_cnt = 0 (마이그레이션 직후 기준) 이어야 한다.
