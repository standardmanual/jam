-- 141: avg_cadence ×2 재정규화 백필 — 러닝·트레일러닝만 (티켓 20260906_0110 ⑤)
--
-- 배경:
--   `strava_activities.normalized.avgCadence`는 티켓 20260905_0029 백필이 Strava
--   `average_cadence`를 변환 없이 그대로 저장한 값이다. 그런데 조건 설계값(`running:H2`
--   「180의 리듬」의 180spm)은 **양발 합계** 기준이고, Strava의 러닝 `average_cadence`는
--   편족(한쪽 다리) 기준이라 실제로는 절반 수준으로 쌓여 있다(실측: 러닝 중앙값 86.5 ·
--   최댓값 110.2 — 180의 절반 언저리). 애플리케이션 코드(`normalizeActivity`/
--   `mergeExtendedFields`, `src/types/strava.ts`의 `normalizeCadenceForActivityType`)는
--   이제 저장 시점에 ×2를 적용하지만, **이미 저장된 행은 이 마이그레이션으로만 바뀐다.**
--
--   자전거는 대상이 아니다 — `average_cadence`가 처음부터 크랭크 회전수(rpm) 자체라
--   편족 개념이 없고, ×2하면 오히려 틀린 값이 된다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: **코드 배포(정규화 적용 커밋) 이후에 실행한다.** 순서가 뒤집히면 이 마이그레이션과
--    신규 싱크가 좁은 창에서 서로 다른 규칙으로 같은 활동을 저장할 여지가 생긴다(둘 다
--    Strava 원본에서 다시 계산하므로 최종 상태는 같아지지만, 실행 순서는 이 편이 안전하다).
--
-- 안전장치(멱등):
--   ① 대상은 `jam_activity_type IN ('running','trail_running')`만 — 자전거·걷기·등산은
--      건드리지 않는다.
--   ② **이미 정규화된 값으로 보이는 행은 건드리지 않는다** — `avgCadence < 130`인 행만
--      갱신한다. 정상적인 편족 케이던스(대부분 70~110)는 전부 130 미만이고, ×2된 값
--      (140~220대)은 전부 130 이상이라 실측 분포(중앙값 86.5·최댓값 110.2)와 조건 설계값
--      (180) 사이에 뚜렷한 간극이 있다. 이 재실행 가능성 보장이 없으면, 이 마이그레이션을
--      실수로 두 번 돌리거나 신규 싱크가 먼저 반영된 행에 다시 돌리면 값이 다시 배가 된다.
--   ③ `normalized` 안의 `avgCadence` 키 하나만 바꾼다 — `jsonb_set`으로 다른 필드는
--      한 글자도 건드리지 않는다.
--
-- 재실행 가능(idempotent): ②의 `< 130` 가드가 이미 정규화된 행을 자연히 건너뛴다.

BEGIN;

-- ── 사전 확인 쿼리 (실행 «전»에 돌려서 영향 범위를 실측할 것) ────────────────
--
-- SELECT count(*) FROM public.strava_activities
--  WHERE jam_activity_type IN ('running', 'trail_running')
--    AND (normalized->>'avgCadence') IS NOT NULL
--    AND (normalized->>'avgCadence')::numeric > 0
--    AND (normalized->>'avgCadence')::numeric < 130;

UPDATE public.strava_activities
   SET normalized = jsonb_set(
         normalized,
         '{avgCadence}',
         to_jsonb((normalized->>'avgCadence')::numeric * 2),
         false
       )
 WHERE jam_activity_type IN ('running', 'trail_running')
   AND normalized ? 'avgCadence'
   AND (normalized->>'avgCadence') ~ '^[0-9.]+$'  -- 형태가 깨진 값(문자열 등)은 건드리지 않는다
   AND (normalized->>'avgCadence')::numeric > 0
   AND (normalized->>'avgCadence')::numeric < 130;  -- 이미 정규화된 값(≥130)은 건너뛴다 — 멱등 가드

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 재정규화 후 분포 — 러닝 중앙값이 대략 173(=86.5×2) 근처로 이동했는지
-- SELECT jam_activity_type,
--        percentile_cont(0.5) WITHIN GROUP (ORDER BY (normalized->>'avgCadence')::numeric) AS median,
--        max((normalized->>'avgCadence')::numeric) AS max_cadence,
--        count(*) AS rows
--   FROM public.strava_activities
--  WHERE jam_activity_type IN ('running', 'trail_running')
--    AND normalized ? 'avgCadence'
--  GROUP BY 1;
--
-- -- ② 자전거는 한 글자도 안 바뀌었는지(스냅샷 비교가 없으므로, 최소 범위만 확인)
-- SELECT count(*) FROM public.strava_activities
--  WHERE jam_activity_type = 'cycling' AND normalized ? 'avgCadence';
--
-- -- ③ 재실행해도 0행이 갱신되는지(멱등 확인) — 위 UPDATE를 그대로 다시 돌려서 영향 행수가 0인지 본다.

-- ↩️ 롤백 DDL — 원본 원시값을 보존하지 않으므로 «되돌리기»는 ÷2로 근사할 수밖에 없다.
--    실행 직후 백업(예: 이 UPDATE 대상 id·이전 값의 스냅샷 테이블)이 없으면 완전한 롤백은
--    불가능하다 — 실행 전 사전 확인 쿼리 결과를 반드시 기록해 둘 것.
--    UPDATE public.strava_activities
--       SET normalized = jsonb_set(normalized, '{avgCadence}',
--             to_jsonb((normalized->>'avgCadence')::numeric / 2), false)
--     WHERE jam_activity_type IN ('running', 'trail_running')
--       AND normalized ? 'avgCadence'
--       AND (normalized->>'avgCadence')::numeric >= 130;
