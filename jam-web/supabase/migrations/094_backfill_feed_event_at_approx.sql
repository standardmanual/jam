-- JAM! user_activity_feed.event_at 과거 데이터 근사 보정
-- 티켓: 20260824_006 (피드 event_at 로컬 벽시계 UTC 오해석)
-- 생성일: 2026-08-24
--
-- ⚠️⚠️⚠️ 절대 자동 실행 금지 ⚠️⚠️⚠️
-- 이 파일은 SQL만 작성한 것이다. STEP 1(진단, 읽기 전용)을 먼저 실행해 매칭 규모·거리
-- 분포를 사용자에게 보고하고, 승인을 받은 뒤에만 STEP 2(백필)를 실행한다.
-- (jam-developer 서브에이전트는 이 파일을 실행할 권한이 없다 — 오케스트레이터가
-- 사용자 승인 후 별도로 처리한다.)
--
-- ────────────────────────────────────────────────────────────────────────────
-- 배경
-- ────────────────────────────────────────────────────────────────────────────
-- recordFeedEvent()의 4번째 인자(event_at)에 Strava 활동의 startDateLocal(로컬 벽시계에
-- Z를 붙인 값 — 진짜 UTC가 아니다)이 startDate(진짜 UTC)보다 우선 적용되던 버그가
-- badge-engine·drop-engine·strava/sync.ts 세 곳에 있었다. 같은 티켓에서 코드는
-- startDate 우선으로 뒤집었지만(신규 기록 정상화), 기존에 이미 기록된 badge_earned/
-- item_dropped 행의 event_at은 그대로 남는다.
--
-- 행 단위로 "어느 쪽으로 기록됐는지"는 구분할 수 없다(플래그가 없다). metadata에도
-- strava_activities와 연결할 키(strava_id 등)가 없어 정확한 조인이 불가능함을 확인했다.
--
-- 대안: 동일 user_id 안에서 event_at과 가장 가까운 시각의 strava_activities.start_date를
-- 근사 매칭해 그 값으로 덮어쓴다. strava_activities.start_date는 sync.ts의
-- recordProcessedActivities()가 a.startDate(진짜 UTC)로만 채우므로 항상 정확하다.
-- 매칭 거리에 상한을 둬서(오보정보다 무보정이 낫다) 상한을 넘는 행은 원본을 보존한다.
--
-- 대상: event_type IN ('badge_earned', 'item_dropped') — event_at에 recordFeedEvent()의
-- eventAt 인자가 실제로 쓰이는 두 타입뿐이다(마이그레이션 013 참고). 나머지
-- (mission_joined/completed/cancelled, item_picked_up)는 항상 컬럼 DEFAULT NOW()로
-- 기록되므로 버그 대상이 아니라 제외한다.
--
-- 이미 올바르게 기록된 행(정상적으로 startDate로 기록됐거나, badge_earned 중 POI 배지
-- 경로 — strava/sync.ts:325 — 처럼 애초에 버그가 없던 행)도 대상 범위(event_type 조건)에는
-- 포함되지만, 그 경우 최근접 매칭 거리가 0에 가까워 사실상 값이 바뀌지 않거나 무시할
-- 수준의 오차만 생긴다(nearest-neighbor 특성상 자기 자신을 유발한 활동이 최근접이 된다).
--
-- ⚠️ strava_activities 테이블은 2026-07-30(마이그레이션 069)에 생성됐다. 그 이전에
-- 처리된 활동은 strava_activities에 대응 행이 없어 매칭 후보가 없고, 그 행의 event_at은
-- 보정되지 않은 채 그대로 남는다(무보정 — 의도된 동작).
--
-- created_at(마이그레이션 093)은 이 백필 대상이 아니다. created_at은 "행이 DB에 기록된
-- 시각"이라는 별개의 의미를 가지며, 093 이전 행의 created_at은 이미 그 시점의 event_at으로
-- 근사 백필이 끝난 상태다. 이 마이그레이션 이후 event_at을 갱신해도 093이 이미 써놓은
-- created_at 값은 소급 반영되지 않는다 — 093 이전 행은 여전히 부정확한 created_at을 가질
-- 수 있다(알려진 잔여 이슈, 완료 기록의 잔여 이슈 항목 참고).

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1. 진단 (읽기 전용) — 반드시 먼저 실행하고 결과를 보고할 것
--          매칭 규모·거리 분포를 확인하기 전에는 STEP 2를 실행하지 않는다.
-- ════════════════════════════════════════════════════════════════════════════

WITH target AS (
  SELECT f.id, f.user_id, f.event_at
    FROM public.user_activity_feed f
   WHERE f.event_type IN ('badge_earned', 'item_dropped')
),
nearest AS (
  SELECT t.id,
         t.event_at,
         sa.start_date AS matched_start_date,
         sa.strava_id,
         EXTRACT(EPOCH FROM (sa.start_date - t.event_at)) / 3600.0 AS diff_hours
    FROM target t
    LEFT JOIN LATERAL (
      SELECT s.start_date, s.strava_id
        FROM public.strava_activities s
       WHERE s.user_id = t.user_id
       ORDER BY ABS(EXTRACT(EPOCH FROM (s.start_date - t.event_at))) ASC
       LIMIT 1
    ) sa ON TRUE
)
SELECT
  COUNT(*)                                                              AS total_target_rows,
  COUNT(matched_start_date)                                             AS rows_with_candidate,
  COUNT(*) FILTER (WHERE ABS(diff_hours) <= 1)                          AS within_1h,
  COUNT(*) FILTER (WHERE ABS(diff_hours) > 1  AND ABS(diff_hours) <= 3) AS within_1_3h,
  COUNT(*) FILTER (WHERE ABS(diff_hours) > 3  AND ABS(diff_hours) <= 6) AS within_3_6h,
  COUNT(*) FILTER (WHERE ABS(diff_hours) > 6  AND ABS(diff_hours) <= 9) AS within_6_9h,
  COUNT(*) FILTER (WHERE ABS(diff_hours) > 9  AND ABS(diff_hours) <= 12) AS within_9_12h,
  COUNT(*) FILTER (WHERE ABS(diff_hours) > 12 AND ABS(diff_hours) <= 24) AS within_12_24h,
  COUNT(*) FILTER (WHERE ABS(diff_hours) > 24)                          AS over_24h,
  MIN(diff_hours)                                                       AS min_diff_hours,
  MAX(diff_hours)                                                       AS max_diff_hours
FROM nearest;

-- 위 결과의 within_*h 버킷 분포를 보고 STEP 2의 상한(MATCH_CAP_HOURS, 아래 12로 하드코딩)을
-- 확정한다. 기본값 12시간은 알려진 최대 편차 +7.84h(KST, 활동 시작~동기화 지연이 상쇄돼
-- 9h보다 조금 작게 나온다)에 여유를 둔 값이다. within_9_12h/over_24h 비중이 크면 상한을
-- 조정해 재검토한다(over_24h는 항상 무보정 — 상한과 무관하게 STEP 2에서 제외된다).

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2. 백필 (STEP 1 결과 검토·승인 후에만 실행)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

WITH nearest AS (
  SELECT f.id AS feed_id,
         sa.start_date AS matched_start_date,
         ABS(EXTRACT(EPOCH FROM (sa.start_date - f.event_at))) / 3600.0 AS diff_hours
    FROM public.user_activity_feed f
    JOIN LATERAL (
      SELECT s.start_date
        FROM public.strava_activities s
       WHERE s.user_id = f.user_id
       ORDER BY ABS(EXTRACT(EPOCH FROM (s.start_date - f.event_at))) ASC
       LIMIT 1
    ) sa ON TRUE
   WHERE f.event_type IN ('badge_earned', 'item_dropped')
)
UPDATE public.user_activity_feed f
   SET event_at = n.matched_start_date
  FROM nearest n
 WHERE f.id = n.feed_id
   AND n.diff_hours <= 12  -- 매칭 거리 상한(시간). STEP 1 분포 확인 후 조정 가능.
   AND f.event_at IS DISTINCT FROM n.matched_start_date;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- 적용 후 확인 쿼리 (조회 전용)
-- ────────────────────────────────────────────────────────────────────────────
-- SELECT count(*) FILTER (WHERE event_at > NOW()) AS future_cnt, count(*) AS total
--   FROM public.user_activity_feed
--  WHERE event_type IN ('badge_earned', 'item_dropped');
--  → future_cnt = 0 이어야 한다(모든 활동은 과거에 시작했으므로).
