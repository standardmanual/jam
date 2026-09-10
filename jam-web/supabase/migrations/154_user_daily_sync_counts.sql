-- 154: user_daily_sync_counts 신규 테이블 + 원자적 증가 RPC
--      (티켓 20260910_1557, JAM! 카테고리 — 서비스 사용량 배지 엔진)
--
-- 배경:
--   JAM! 카테고리(서비스 사용량 기반 배지)의 3개 지표 — 팔로워 수·팔로잉 수·일일 동기화
--   횟수 — 중 팔로워/팔로잉은 기존 user_follows를 COUNT(*)로 즉시 구할 수 있지만, "하루
--   동기화 횟수"는 이를 기록하는 테이블이 전혀 없다. 이 파일이 그 카운터를 연다.
--
--   카운터 증가는 `POST /api/strava/sync`(syncStravaActivities)가 synced > 0일 때만
--   호출한다 — 동시 요청(중복 클릭·다중 탭)이 겹쳐도 유실 없이 정확히 1씩 올라가야
--   하므로, 앱 코드의 읽고-고치고-쓰기 대신 한 문장 원자 UPSERT를 RPC로 감싼다
--   (마이그레이션 132 `increment_activity_badge_earn`과 같은 이유·같은 패턴).
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: 155(condition_json CHECK 제약 확장)와 순서 무관 — 서로 다른 테이블·제약을
--   건드린다. 다만 코드 배포(usageBadges.ts, strava/sync.ts 훅)보다는 먼저 실행돼야 한다
--   (코드가 이 테이블·RPC를 참조한다).
--
-- 재실행 가능(idempotent): CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS +
--   CREATE OR REPLACE FUNCTION으로 작성했다.

BEGIN;

-- ── ① user_daily_sync_counts ────────────────────────────────────────────
--
-- sync_date는 KST 기준 날짜(YYYY-MM-DD)를 그대로 담는다 — 앱 코드가 KST로 변환한 값을
-- 넘기고, 이 테이블은 그 값을 문자 그대로 저장한다(타임존 변환을 DB에서 하지 않는다).
CREATE TABLE IF NOT EXISTS public.user_daily_sync_counts (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sync_date DATE NOT NULL,       -- KST 기준 날짜
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sync_date)
);

ALTER TABLE public.user_daily_sync_counts ENABLE ROW LEVEL SECURITY;

-- 본인만 읽기 — user_drop_state(034)와 동일한 규약. INSERT/UPDATE 정책은 두지 않는다.
-- 카운터 증가는 아래 RPC(SECURITY DEFINER, service_role 전용)로만 이뤄진다.
DROP POLICY IF EXISTS "user_daily_sync_counts: 본인만 읽기" ON public.user_daily_sync_counts;
CREATE POLICY "user_daily_sync_counts: 본인만 읽기"
  ON public.user_daily_sync_counts FOR SELECT
  USING (auth.uid() = user_id);

-- ── ② increment_daily_sync_count() — 원자적 증가 + 최신 카운트 반환 ────────
--
-- `INSERT ... ON CONFLICT (user_id, sync_date) DO UPDATE SET count = count + 1`은 그
-- 자체로 한 문장 원자 연산이다(행 잠금 하에 순차 직렬화 — 동시 호출이 겹쳐도 유실되지
-- 않는다). RETURNING으로 갱신 직후 값을 그대로 돌려줘 호출부가 별도 SELECT 왕복 없이
-- "그 날짜의 최신 카운트로 평가"(usageBadges.ts)할 수 있게 한다.
CREATE OR REPLACE FUNCTION public.increment_daily_sync_count(
  p_user_id   UUID,
  p_sync_date DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.user_daily_sync_counts (user_id, sync_date, count, updated_at)
  VALUES (p_user_id, p_sync_date, 1, now())
  ON CONFLICT (user_id, sync_date)
  DO UPDATE SET count = public.user_daily_sync_counts.count + 1,
                updated_at = now()
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;

-- anon/authenticated의 EXECUTE 권한을 회수하고 service_role에만 남긴다 — 이 함수는
-- 호출자 검증 없이 p_user_id를 그대로 신뢰하므로, anon 키로 직접 호출하면 임의 유저의
-- 카운터를 조작할 수 있다(132의 동일 방어와 같은 이유).
REVOKE ALL ON FUNCTION public.increment_daily_sync_count(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_daily_sync_count(UUID, DATE) FROM anon;
REVOKE ALL ON FUNCTION public.increment_daily_sync_count(UUID, DATE) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_daily_sync_count(UUID, DATE) TO service_role;

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 테이블·정책이 만들어졌는지
-- SELECT tablename, policyname FROM pg_policies WHERE tablename = 'user_daily_sync_counts';
--
-- -- ② 동시성 스모크 — 같은 (user_id, sync_date)에 연달아 호출해도 유실 없이 누적되는지.
-- --    (임의 유저로 바꿔 실행하고, 끝에 RAISE EXCEPTION으로 되돌릴 것)
-- DO $smoke$
-- DECLARE v_user UUID; v_a INTEGER; v_b INTEGER; v_c INTEGER;
-- BEGIN
--   SELECT id INTO v_user FROM public.users LIMIT 1;
--   v_a := public.increment_daily_sync_count(v_user, '2026-09-10'::date);
--   v_b := public.increment_daily_sync_count(v_user, '2026-09-10'::date);
--   v_c := public.increment_daily_sync_count(v_user, '2026-09-10'::date);
--   RAISE EXCEPTION '롤백: 1회차 % / 2회차 % / 3회차 % (기대: 1 / 2 / 3)', v_a, v_b, v_c;
-- END
-- $smoke$;
--
-- -- ③ 권한이 service_role에만 남았는지
-- SELECT proacl FROM pg_proc WHERE proname = 'increment_daily_sync_count';

-- ↩️ 롤백 DDL
--    DROP FUNCTION IF EXISTS public.increment_daily_sync_count(UUID, DATE);
--    DROP TABLE IF EXISTS public.user_daily_sync_counts;
