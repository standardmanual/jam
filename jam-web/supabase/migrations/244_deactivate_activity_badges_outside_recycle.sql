-- 244_deactivate_activity_badges_outside_recycle.sql
-- JAM 2.0 액티비티 배지: 재활용 후보 밖 배지를 끄고, 재활용 계열 전체의 옛 게이트 조건을 뺀다
-- (티켓 20261018_1816 2회, 상위 20261018_1811. 사용자 결정 1·2 = 2026-10-19 질문창 답, 재활용 확정 결정 9-4 = 2026-10-10)
--
-- 작성만 하고 실행하지 않았다. 실행은 사용자 승인과 롤백 실측 뒤 카리나가 한다. 새 칸·새 제약·새 객체는 없고 기존 행의 값만 바꾼다.
--
-- ⚠️ 공용 DB 영향: Supabase는 staging과 프로덕션이 한 DB를 쓰므로, 적용하는 순간 옛 프로덕션 코드에도 바로 반영된다.
--    꺼진 배지는 배지함·배지 트리·목록·미션 보상 카드에서 사라지고 새로 발급되지 않는다. 받은 기록(user_activity_badges)은
--    지우지 않는다(행은 그대로 남지만 화면에는 deleted_at 필터 때문에 보이지 않는다).
--
-- 규칙
--   ① 끄기: type = 'activity' 이고 deleted_at IS NULL 이고 family_key가 «유지 61계열»에 없는 배지의 deleted_at을 now()로 갱신한다.
--      family_key가 NULL인 활동 배지도 유지 목록에 없으니 대상이다(조사 시점 0개).
--      유지 61계열 = `docs/plan/jam2/service-redesign/액티비티 배지 재활용 후보.md` 2절 대조표의
--        «그대로 재활용» 15계열(79개) + «고쳐서 재활용» 12계열에 대응하는 지금 45계열(190개) = 269개. 사용자 결정(2026-10-19)으로 온보딩 «퀘스트 클리어»(onboarding:complete, 1개)도 유지하므로
--        유지는 270개(61계열)다.
--      3.2절의 겹치는 단일 배지 23개와 3절의 폐기 112계열 가운데 온보딩 1개를 뺀 341개는 유지 목록에 없다 → 끄는 대상은 364개다.
--      (2026-10-10 조사 기준 활동 배지 634개 = 유지 270 + 겹치는 단일 23 + 폐기 341). 그 뒤 DB가 바뀌었으면 숫자가 어긋나니 드라이런으로 먼저 본다.)
--   ② 게이트 조건 빼기: 유지 61계열(그대로 재활용 15 + 고쳐서 재활용 45 + 온보딩) 행의 condition_json에서 최상위 키 gate_mission_badge, cross_between_axis를 뺀다.
--      게이트 미션을 정식 오픈에 붙이지 않기로 했고(결정 9-4), 미션 보상 배지(폐기 묶음 1, 41개)가 꺼지면
--      이 키가 가리킬 대상이 없어 상위 단계(Epic·Mystic·상위 레벨)가 영영 발급되지 않기 때문이다.
--      cross_in_axis는 건드리지 않는다. 사용자 결정(2026-10-19)으로 «고쳐서 재활용» 45계열도 포함한다(게이트가 가리키는 계열이 꺼지면 Epic·Mystic이 영영 발급되지 않기 때문).
--   받은 기록과 유저·포인트 원장·미션·미션 참가 기록은 바꾸지 않는다.
--
-- 트리거: badges_family_consistency는 UPDATE OF name, activity_types, condition_json, level, rarity, family_key에만 걸린다.
--   ①(deleted_at)은 걸리지 않고, ②(condition_json)는 걸리지만 게이트 키가 측정 조건 필드 집합에 들지 않아(133·134) 계열 정합성 검사를 그대로 통과한다.
--
-- ⚠️ 이 SQL이 «하지 않는» 일 (리뷰어·카리나가 알아야 한다)
--   (a) [해결, 2026-10-19 사용자 결정] «고쳐서 재활용» 45계열의 게이트 키도 ②에서 뺀다(유지 270개 전체). cross_in_axis만 남는다(드라이런 ⑧).
--   (b) 미션 보상 배지가 꺼져도 미션 행(missions)은 그대로라 게이트 미션 카드는 남는다(완료해도 배지는 안 받는다).
--       미션을 끄는 일은 이 파일의 범위 밖이다.
--   (c) [해결, 2026-10-19 사용자 결정] 온보딩 «퀘스트 클리어»(onboarding:complete, 포인트 100)는 끄지 않고 유지 목록에 넣었다(completion.ts가 이 배지를 다시 읽기 때문).
--
-- 되돌림 방법과 사후 확인은 파일 끝에 있다. 적용 «전에» 파일 끝의 「사전 백업 SELECT」를 먼저 돌려 결과(JSON)를 티켓에 남긴다.

-- ═══════════════════════════════════════════════════════════════════════════
-- 드라이런 (읽기 전용 SELECT — 적용 전에 돌려서 «기대값»과 맞는지 본다. 데이터를 바꾸지 않는다)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 기대값(2026-10-10 조사 기준): 활동 배지 634 / 유지 270(61계열) / 끄기 364 / 끄는 대상 중 family_key NULL 0 /
--   게이트 키를 뺄 행 ≤ 79 / 유지 목록에 있지만 DB에 없는 family_key 0.
--
-- ①~⑦ 한 번에: 지표 이름과 값을 줄마다 돌려준다.
--
-- WITH
--   keep AS (
--     SELECT
--       -- 그대로 재활용 15계열(원고 6-3~6-17)
--       ARRAY[
--       'walking:K1', 'running:L1', 'running:P1', 'running:K1', 'trail_running:L1',  -- 6-3~6-7
--       'trail_running:E1', 'trail_running:K2', 'cycling:L1', 'cycling:E1', 'cycling:K1',  -- 6-8~6-12
--       'cycling:K2', 'hiking:L1', 'hiking:P1', 'hiking:A1', 'hiking:K1'  -- 6-13~6-17
--       ]::text[] AS as_is,
--       -- 고쳐서 재활용 45계열(1-2는 1-1과 같은 계열을 쓴다)
--       ARRAY[
--       'walking:P2', 'cycling:C2', 'running:C2',  -- 1-1
--       'walking:S1', 'walking:S2', 'walking:S3', 'running:N1', 'cycling:N1', 'trail_running:N1', 'running:N2', 'cycling:N2', 'trail_running:N2', 'running:N3', 'cycling:N3', 'hiking:N1', 'hiking:N2', 'hiking:N3',  -- 1-3
--       'walking:P1', 'running:C1', 'cycling:C1', 'trail_running:C1', 'hiking:C1',  -- 1-5
--       'walking:R4', 'running:X3', 'cycling:X2', 'trail_running:X2', 'hiking:X2',  -- 2-1
--       'running:T1', 'trail_running:T1', 'walking:A8',  -- 3-1
--       'cycling:D1', 'hiking:D1', 'running:D2',  -- 3-3
--       'walking:A6',  -- 3-6
--       'walking:A9',  -- 3-7
--       'walking:K3', 'running:K3', 'cycling:K3', 'trail_running:K3', 'hiking:K3',  -- 5-3
--       'walking:B1', 'running:R1', 'trail_running:R1', 'cycling:R1',  -- 6-18
--       'running:R2',  -- 6-19
--       'onboarding:complete'  -- 온보딩 퀘스트 클리어(사용자 결정 2026-10-19: 끄지 않고 유지)
--       ]::text[] AS fixed
--   ),
-- target AS (
--   SELECT b.id, b.family_key, b.admin_category, b.condition_json
--     FROM public.badges b, keep k
--    WHERE b.type = 'activity' AND b.deleted_at IS NULL
--      AND (b.family_key IS NULL OR b.family_key <> ALL (k.as_is || k.fixed))
-- ),
-- kept AS (
--   SELECT b.id, b.family_key, b.condition_json
--     FROM public.badges b, keep k
--    WHERE b.type = 'activity' AND b.deleted_at IS NULL AND b.family_key = ANY (k.as_is || k.fixed)
-- ),
-- strip AS (
--   SELECT b.id
--     FROM public.badges b, keep k
--    WHERE b.type = 'activity' AND b.deleted_at IS NULL AND b.family_key = ANY (k.as_is || k.fixed)
--      AND (b.condition_json ? 'gate_mission_badge' OR b.condition_json ? 'cross_between_axis')
-- ),
-- recv AS (
--   SELECT uab.badge_id, uab.user_id FROM public.user_activity_badges uab JOIN target t ON t.id = uab.badge_id
-- )
-- SELECT '① 활동 배지(deleted_at IS NULL) 전체' AS 지표, count(*)::text AS 값
--   FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL
-- UNION ALL SELECT '② 끄기 대상(소프트 삭제 예정) 배지 수', count(*)::text FROM target
-- UNION ALL SELECT '②-1 끄기 대상 중 family_key NULL', count(*)::text FROM target WHERE family_key IS NULL
-- UNION ALL SELECT '②-2 끄기 대상 계열 수', count(DISTINCT family_key)::text FROM target
-- UNION ALL SELECT '③ 유지 배지 수', count(*)::text FROM kept
-- UNION ALL SELECT '③-1 유지 계열 수', count(DISTINCT family_key)::text FROM kept
-- UNION ALL SELECT '④ 받은 기록이 걸린 끄기 대상 배지 수', count(DISTINCT badge_id)::text FROM recv
-- UNION ALL SELECT '④-1 그 받은 기록 건수(지워지지 않음)', count(*)::text FROM recv
-- UNION ALL SELECT '④-2 그 기록을 가진 유저 수', count(DISTINCT user_id)::text FROM recv
-- UNION ALL SELECT '⑤ 게이트 키를 뺄 행 수(그대로 재활용 15계열)', count(*)::text FROM strip
-- UNION ALL SELECT '⑥ 유지 목록에 있지만 DB에 활성 배지가 없는 family_key 수',
--                  count(*)::text FROM keep k, unnest(k.as_is || k.fixed) AS fk
--                   WHERE NOT EXISTS (SELECT 1 FROM public.badges b WHERE b.type = 'activity' AND b.deleted_at IS NULL AND b.family_key = fk)
-- UNION ALL SELECT '⑦-1 끄기 대상 중 미션 보상 표시(mission_reward) 배지 수', count(*)::text FROM target WHERE (condition_json->>'mission_reward')::boolean IS TRUE
-- UNION ALL SELECT '⑦-2 끄기 대상 중 admin_category 값이 있는 배지 수(jam 카테고리)', count(*)::text FROM target WHERE admin_category IS NOT NULL
-- UNION ALL SELECT '⑦-3 끄기 대상에 온보딩 «퀘스트 클리어»가 있는가(1이면 있음)',
--                  count(*)::text FROM target WHERE id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3'
-- UNION ALL SELECT '⑦-4 끄기 대상 배지를 보상으로 거는 미션 수(missions.reward_badge_ids)',
--                  count(*)::text FROM public.missions m WHERE m.reward_badge_ids && (SELECT coalesce(array_agg(id), '{}') FROM target)
-- UNION ALL SELECT '⑦-5 끄기 대상 배지를 gated_badge_id로 거는 미션 수',
--                  count(*)::text FROM public.missions m WHERE m.gated_badge_id IN (SELECT id FROM target);
--
-- ⑥에서 0이 아니면 어느 계열인지(읽기 전용):
-- WITH
--   keep AS (
--     SELECT
--       -- 그대로 재활용 15계열(원고 6-3~6-17)
--       ARRAY[
--       'walking:K1', 'running:L1', 'running:P1', 'running:K1', 'trail_running:L1',  -- 6-3~6-7
--       'trail_running:E1', 'trail_running:K2', 'cycling:L1', 'cycling:E1', 'cycling:K1',  -- 6-8~6-12
--       'cycling:K2', 'hiking:L1', 'hiking:P1', 'hiking:A1', 'hiking:K1'  -- 6-13~6-17
--       ]::text[] AS as_is,
--       -- 고쳐서 재활용 45계열(1-2는 1-1과 같은 계열을 쓴다)
--       ARRAY[
--       'walking:P2', 'cycling:C2', 'running:C2',  -- 1-1
--       'walking:S1', 'walking:S2', 'walking:S3', 'running:N1', 'cycling:N1', 'trail_running:N1', 'running:N2', 'cycling:N2', 'trail_running:N2', 'running:N3', 'cycling:N3', 'hiking:N1', 'hiking:N2', 'hiking:N3',  -- 1-3
--       'walking:P1', 'running:C1', 'cycling:C1', 'trail_running:C1', 'hiking:C1',  -- 1-5
--       'walking:R4', 'running:X3', 'cycling:X2', 'trail_running:X2', 'hiking:X2',  -- 2-1
--       'running:T1', 'trail_running:T1', 'walking:A8',  -- 3-1
--       'cycling:D1', 'hiking:D1', 'running:D2',  -- 3-3
--       'walking:A6',  -- 3-6
--       'walking:A9',  -- 3-7
--       'walking:K3', 'running:K3', 'cycling:K3', 'trail_running:K3', 'hiking:K3',  -- 5-3
--       'walking:B1', 'running:R1', 'trail_running:R1', 'cycling:R1',  -- 6-18
--       'running:R2',  -- 6-19
--       'onboarding:complete'  -- 온보딩 퀘스트 클리어(사용자 결정 2026-10-19: 끄지 않고 유지)
--       ]::text[] AS fixed
--   )
-- SELECT fk AS 유지_목록에_있지만_DB에_없는_family_key
--   FROM keep k, unnest(k.as_is || k.fixed) AS fk
--  WHERE NOT EXISTS (SELECT 1 FROM public.badges b WHERE b.type = 'activity' AND b.deleted_at IS NULL AND b.family_key = fk);
--
-- ⑧ «고쳐서 재활용» 45계열에 남는 게이트 요구 중 대상 계열이 전부 유지 목록 밖이라 영영 충족되지 않는 요구가 걸린 행 수.
--    (이 SQL이 ②에서 빼는 15계열의 두 키는 빼고, 15계열에 남는 cross_in_axis는 포함한다.) 0이 아니면 위 ⚠️ (a)다.
-- WITH
--   keep AS (
--     SELECT
--       -- 그대로 재활용 15계열(원고 6-3~6-17)
--       ARRAY[
--       'walking:K1', 'running:L1', 'running:P1', 'running:K1', 'trail_running:L1',  -- 6-3~6-7
--       'trail_running:E1', 'trail_running:K2', 'cycling:L1', 'cycling:E1', 'cycling:K1',  -- 6-8~6-12
--       'cycling:K2', 'hiking:L1', 'hiking:P1', 'hiking:A1', 'hiking:K1'  -- 6-13~6-17
--       ]::text[] AS as_is,
--       -- 고쳐서 재활용 45계열(1-2는 1-1과 같은 계열을 쓴다)
--       ARRAY[
--       'walking:P2', 'cycling:C2', 'running:C2',  -- 1-1
--       'walking:S1', 'walking:S2', 'walking:S3', 'running:N1', 'cycling:N1', 'trail_running:N1', 'running:N2', 'cycling:N2', 'trail_running:N2', 'running:N3', 'cycling:N3', 'hiking:N1', 'hiking:N2', 'hiking:N3',  -- 1-3
--       'walking:P1', 'running:C1', 'cycling:C1', 'trail_running:C1', 'hiking:C1',  -- 1-5
--       'walking:R4', 'running:X3', 'cycling:X2', 'trail_running:X2', 'hiking:X2',  -- 2-1
--       'running:T1', 'trail_running:T1', 'walking:A8',  -- 3-1
--       'cycling:D1', 'hiking:D1', 'running:D2',  -- 3-3
--       'walking:A6',  -- 3-6
--       'walking:A9',  -- 3-7
--       'walking:K3', 'running:K3', 'cycling:K3', 'trail_running:K3', 'hiking:K3',  -- 5-3
--       'walking:B1', 'running:R1', 'trail_running:R1', 'cycling:R1',  -- 6-18
--       'running:R2',  -- 6-19
--       'onboarding:complete'  -- 온보딩 퀘스트 클리어(사용자 결정 2026-10-19: 끄지 않고 유지)
--       ]::text[] AS fixed
--   )
-- SELECT b.family_key, b.rarity, g.key AS 게이트_키, g.value->'family_keys' AS 대상_계열
--   FROM public.badges b
--   CROSS JOIN keep k
--   CROSS JOIN LATERAL jsonb_each(b.condition_json) AS g(key, value)
--  WHERE b.type = 'activity' AND b.deleted_at IS NULL AND b.family_key = ANY (k.as_is || k.fixed)
--    AND g.key IN ('cross_in_axis', 'cross_between_axis', 'gate_mission_badge')
--    AND g.key NOT IN ('cross_between_axis', 'gate_mission_badge')
--    AND NOT EXISTS (
--          SELECT 1 FROM jsonb_array_elements_text(g.value->'family_keys') AS t(fk) WHERE t.fk = ANY (k.as_is || k.fixed)
--        )
--  ORDER BY b.family_key, b.rarity;
--
-- ⑨ 끄기 대상이 미션 보상 배지인 미션 목록(어느 미션 카드가 영향을 받는지, 읽기 전용):
-- SELECT m.id, m.title, m.gate_axis, m.exposure_mode, m.starts_at, m.ends_at
--   FROM public.missions m
--  WHERE m.reward_badge_ids && (
--          SELECT coalesce(array_agg(b.id), '{}') FROM public.badges b
--           WHERE b.type = 'activity' AND b.deleted_at IS NULL AND (b.condition_json->>'mission_reward')::boolean IS TRUE
--        )
--  ORDER BY m.starts_at;

-- ═══════════════════════════════════════════════════════════════════════════
-- 본문
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 안전 확인: 유지 목록이 DB와 어긋나면(유지 배지 수가 270이 아니거나 DB에 없는 계열이 있으면) 아무것도 바꾸지 않고 멈춘다.
-- 조사(2026-10-10) 뒤 DB에 배지가 더해지거나 빠졌다면 유지 목록을 다시 확정한 뒤 이 숫자를 고친다.
DO $guard$
DECLARE
  v_keep_rows   INT;
  v_keep_fams   INT;
  v_missing     TEXT[];
BEGIN
  WITH
  keep AS (
    SELECT
      -- 그대로 재활용 15계열(원고 6-3~6-17)
      ARRAY[
      'walking:K1', 'running:L1', 'running:P1', 'running:K1', 'trail_running:L1',  -- 6-3~6-7
      'trail_running:E1', 'trail_running:K2', 'cycling:L1', 'cycling:E1', 'cycling:K1',  -- 6-8~6-12
      'cycling:K2', 'hiking:L1', 'hiking:P1', 'hiking:A1', 'hiking:K1'  -- 6-13~6-17
      ]::text[] AS as_is,
      -- 고쳐서 재활용 45계열(1-2는 1-1과 같은 계열을 쓴다)
      ARRAY[
      'walking:P2', 'cycling:C2', 'running:C2',  -- 1-1
      'walking:S1', 'walking:S2', 'walking:S3', 'running:N1', 'cycling:N1', 'trail_running:N1', 'running:N2', 'cycling:N2', 'trail_running:N2', 'running:N3', 'cycling:N3', 'hiking:N1', 'hiking:N2', 'hiking:N3',  -- 1-3
      'walking:P1', 'running:C1', 'cycling:C1', 'trail_running:C1', 'hiking:C1',  -- 1-5
      'walking:R4', 'running:X3', 'cycling:X2', 'trail_running:X2', 'hiking:X2',  -- 2-1
      'running:T1', 'trail_running:T1', 'walking:A8',  -- 3-1
      'cycling:D1', 'hiking:D1', 'running:D2',  -- 3-3
      'walking:A6',  -- 3-6
      'walking:A9',  -- 3-7
      'walking:K3', 'running:K3', 'cycling:K3', 'trail_running:K3', 'hiking:K3',  -- 5-3
      'walking:B1', 'running:R1', 'trail_running:R1', 'cycling:R1',  -- 6-18
      'running:R2',  -- 6-19
      'onboarding:complete'  -- 온보딩 퀘스트 클리어(사용자 결정 2026-10-19: 끄지 않고 유지)
      ]::text[] AS fixed
  )
  SELECT
    (SELECT count(*) FROM public.badges b, keep k
      WHERE b.type = 'activity' AND b.deleted_at IS NULL AND b.family_key = ANY (k.as_is || k.fixed)),
    (SELECT count(DISTINCT b.family_key) FROM public.badges b, keep k
      WHERE b.type = 'activity' AND b.deleted_at IS NULL AND b.family_key = ANY (k.as_is || k.fixed)),
    (SELECT array_agg(fk) FROM keep k, unnest(k.as_is || k.fixed) AS fk
      WHERE NOT EXISTS (SELECT 1 FROM public.badges b WHERE b.type = 'activity' AND b.deleted_at IS NULL AND b.family_key = fk))
  INTO v_keep_rows, v_keep_fams, v_missing;

  IF v_keep_rows <> 270 OR v_keep_fams <> 61 OR v_missing IS NOT NULL THEN
    RAISE EXCEPTION '유지 목록이 DB와 어긋남 — 유지 배지 % (기대 270), 유지 계열 % (기대 61), DB에 없는 family_key %',
      v_keep_rows, v_keep_fams, v_missing;
  END IF;
END
$guard$;

-- ① 재활용 후보 밖 활동 배지를 끈다(소프트 삭제). 같은 문장 안의 now()는 한 값이라 모든 대상 행의 deleted_at이 같다 —
--    되돌림이 이 값으로 대상을 가려낸다(파일 끝 되돌림 SQL).
UPDATE public.badges AS b
   SET deleted_at = now()
  FROM (
    WITH
    keep AS (
      SELECT
        -- 그대로 재활용 15계열(원고 6-3~6-17)
        ARRAY[
        'walking:K1', 'running:L1', 'running:P1', 'running:K1', 'trail_running:L1',  -- 6-3~6-7
        'trail_running:E1', 'trail_running:K2', 'cycling:L1', 'cycling:E1', 'cycling:K1',  -- 6-8~6-12
        'cycling:K2', 'hiking:L1', 'hiking:P1', 'hiking:A1', 'hiking:K1'  -- 6-13~6-17
        ]::text[] AS as_is,
        -- 고쳐서 재활용 45계열(1-2는 1-1과 같은 계열을 쓴다)
        ARRAY[
        'walking:P2', 'cycling:C2', 'running:C2',  -- 1-1
        'walking:S1', 'walking:S2', 'walking:S3', 'running:N1', 'cycling:N1', 'trail_running:N1', 'running:N2', 'cycling:N2', 'trail_running:N2', 'running:N3', 'cycling:N3', 'hiking:N1', 'hiking:N2', 'hiking:N3',  -- 1-3
        'walking:P1', 'running:C1', 'cycling:C1', 'trail_running:C1', 'hiking:C1',  -- 1-5
        'walking:R4', 'running:X3', 'cycling:X2', 'trail_running:X2', 'hiking:X2',  -- 2-1
        'running:T1', 'trail_running:T1', 'walking:A8',  -- 3-1
        'cycling:D1', 'hiking:D1', 'running:D2',  -- 3-3
        'walking:A6',  -- 3-6
        'walking:A9',  -- 3-7
        'walking:K3', 'running:K3', 'cycling:K3', 'trail_running:K3', 'hiking:K3',  -- 5-3
        'walking:B1', 'running:R1', 'trail_running:R1', 'cycling:R1',  -- 6-18
        'running:R2',  -- 6-19
        'onboarding:complete'  -- 온보딩 퀘스트 클리어(사용자 결정 2026-10-19: 끄지 않고 유지)
        ]::text[] AS fixed
    )
    SELECT x.id
      FROM public.badges x, keep k
     WHERE x.type = 'activity' AND x.deleted_at IS NULL
       AND (x.family_key IS NULL OR x.family_key <> ALL (k.as_is || k.fixed))
  ) AS t
 WHERE b.id = t.id;

-- ② «그대로 재활용» 15계열의 옛 게이트 조건 두 키를 뺀다(최상위 키만 뺀다. cross_in_axis는 그대로 둔다).
UPDATE public.badges AS b
   SET condition_json = (b.condition_json - 'gate_mission_badge') - 'cross_between_axis'
  FROM (
    WITH
    keep AS (
      SELECT
        -- 그대로 재활용 15계열(원고 6-3~6-17)
        ARRAY[
        'walking:K1', 'running:L1', 'running:P1', 'running:K1', 'trail_running:L1',  -- 6-3~6-7
        'trail_running:E1', 'trail_running:K2', 'cycling:L1', 'cycling:E1', 'cycling:K1',  -- 6-8~6-12
        'cycling:K2', 'hiking:L1', 'hiking:P1', 'hiking:A1', 'hiking:K1'  -- 6-13~6-17
        ]::text[] AS as_is,
        -- 고쳐서 재활용 45계열(1-2는 1-1과 같은 계열을 쓴다)
        ARRAY[
        'walking:P2', 'cycling:C2', 'running:C2',  -- 1-1
        'walking:S1', 'walking:S2', 'walking:S3', 'running:N1', 'cycling:N1', 'trail_running:N1', 'running:N2', 'cycling:N2', 'trail_running:N2', 'running:N3', 'cycling:N3', 'hiking:N1', 'hiking:N2', 'hiking:N3',  -- 1-3
        'walking:P1', 'running:C1', 'cycling:C1', 'trail_running:C1', 'hiking:C1',  -- 1-5
        'walking:R4', 'running:X3', 'cycling:X2', 'trail_running:X2', 'hiking:X2',  -- 2-1
        'running:T1', 'trail_running:T1', 'walking:A8',  -- 3-1
        'cycling:D1', 'hiking:D1', 'running:D2',  -- 3-3
        'walking:A6',  -- 3-6
        'walking:A9',  -- 3-7
        'walking:K3', 'running:K3', 'cycling:K3', 'trail_running:K3', 'hiking:K3',  -- 5-3
        'walking:B1', 'running:R1', 'trail_running:R1', 'cycling:R1',  -- 6-18
        'running:R2',  -- 6-19
        'onboarding:complete'  -- 온보딩 퀘스트 클리어(사용자 결정 2026-10-19: 끄지 않고 유지)
        ]::text[] AS fixed
    )
    SELECT x.id
      FROM public.badges x, keep k
     WHERE x.type = 'activity' AND x.deleted_at IS NULL AND x.family_key = ANY (k.as_is || k.fixed)
       AND (x.condition_json ? 'gate_mission_badge' OR x.condition_json ? 'cross_between_axis')
  ) AS t
 WHERE b.id = t.id;

-- 선택 ③ (이 파일에는 문장이 없다 — 위 ⚠️ (a)): «고쳐서 재활용» 45계열에서 대상 계열이 전부 유지 목록 밖인 게이트 요구만 빼는 문장.
--   드라이런 ⑧의 목록을 사용자에게 보여 주고 승인받은 뒤 ②와 같은 모양으로 더한다(남은 대상이 있는 요구는 둔다).

-- 사후 확인(같은 트랜잭션 안): 활성 활동 배지가 유지 목록과 정확히 같은 270개이고 게이트 키가 유지 계열에 남지 않았는지 본다.
DO $post$
DECLARE
  v_active   INT;
  v_left     INT;
BEGIN
  WITH
  keep AS (
    SELECT
      -- 그대로 재활용 15계열(원고 6-3~6-17)
      ARRAY[
      'walking:K1', 'running:L1', 'running:P1', 'running:K1', 'trail_running:L1',  -- 6-3~6-7
      'trail_running:E1', 'trail_running:K2', 'cycling:L1', 'cycling:E1', 'cycling:K1',  -- 6-8~6-12
      'cycling:K2', 'hiking:L1', 'hiking:P1', 'hiking:A1', 'hiking:K1'  -- 6-13~6-17
      ]::text[] AS as_is,
      -- 고쳐서 재활용 45계열(1-2는 1-1과 같은 계열을 쓴다)
      ARRAY[
      'walking:P2', 'cycling:C2', 'running:C2',  -- 1-1
      'walking:S1', 'walking:S2', 'walking:S3', 'running:N1', 'cycling:N1', 'trail_running:N1', 'running:N2', 'cycling:N2', 'trail_running:N2', 'running:N3', 'cycling:N3', 'hiking:N1', 'hiking:N2', 'hiking:N3',  -- 1-3
      'walking:P1', 'running:C1', 'cycling:C1', 'trail_running:C1', 'hiking:C1',  -- 1-5
      'walking:R4', 'running:X3', 'cycling:X2', 'trail_running:X2', 'hiking:X2',  -- 2-1
      'running:T1', 'trail_running:T1', 'walking:A8',  -- 3-1
      'cycling:D1', 'hiking:D1', 'running:D2',  -- 3-3
      'walking:A6',  -- 3-6
      'walking:A9',  -- 3-7
      'walking:K3', 'running:K3', 'cycling:K3', 'trail_running:K3', 'hiking:K3',  -- 5-3
      'walking:B1', 'running:R1', 'trail_running:R1', 'cycling:R1',  -- 6-18
      'running:R2',  -- 6-19
      'onboarding:complete'  -- 온보딩 퀘스트 클리어(사용자 결정 2026-10-19: 끄지 않고 유지)
      ]::text[] AS fixed
  )
  SELECT
    (SELECT count(*) FROM public.badges b WHERE b.type = 'activity' AND b.deleted_at IS NULL),
    (SELECT count(*) FROM public.badges b, keep k
      WHERE b.type = 'activity' AND b.deleted_at IS NULL AND b.family_key = ANY (k.as_is || k.fixed)
        AND (b.condition_json ? 'gate_mission_badge' OR b.condition_json ? 'cross_between_axis'))
  INTO v_active, v_left;

  IF v_active <> 270 OR v_left <> 0 THEN
    RAISE EXCEPTION '사후 확인 실패 — 활성 활동 배지 % (기대 270), 게이트 키가 남은 행 % (기대 0)', v_active, v_left;
  END IF;
END
$post$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 적용 후 확인 쿼리 (읽기 전용 SELECT)
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT count(*) FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;                          -- 270
-- SELECT deleted_at, count(*) FROM public.badges WHERE type = 'activity' AND deleted_at IS NOT NULL
--  GROUP BY 1 ORDER BY 2 DESC LIMIT 3;                                                                        -- 첫 줄이 이번에 끈 364개(되돌림에 쓸 시각)
-- SELECT count(*) FROM public.user_activity_badges;                                                           -- 적용 전과 같음(드라이런 시점의 전체 건수와 대조)
-- 받은 기록이 그대로인지 보려면 적용 전에도 같은 쿼리(`SELECT count(*) FROM public.user_activity_badges;`)를 돌려 건수를 적어 둔다.

-- ═══════════════════════════════════════════════════════════════════════════
-- 사전 백업 SELECT (적용 «전에» 돌려 결과를 티켓에 붙인다 — 게이트 키 값은 적용 뒤 DB에서 복원할 수 없기 때문이다)
-- ═══════════════════════════════════════════════════════════════════════════
-- 끄기(deleted_at)는 값을 잃지 않는다(위 되돌림이 시각으로 대상을 가려낸다). 잃는 것은 ②가 빼는 두 키의 값뿐이라 그 값만 남긴다.
-- 백업 테이블은 만들지 않는다. 아래 결과(JSON 한 칸)를 티켓 완료 기록에 붙여 두고, 되돌릴 때 그 JSON을 되돌림 ②의 자리에 넣는다.
--
-- WITH
--   keep AS (
--     SELECT
--       -- 그대로 재활용 15계열(원고 6-3~6-17)
--       ARRAY[
--       'walking:K1', 'running:L1', 'running:P1', 'running:K1', 'trail_running:L1',  -- 6-3~6-7
--       'trail_running:E1', 'trail_running:K2', 'cycling:L1', 'cycling:E1', 'cycling:K1',  -- 6-8~6-12
--       'cycling:K2', 'hiking:L1', 'hiking:P1', 'hiking:A1', 'hiking:K1'  -- 6-13~6-17
--       ]::text[] AS as_is,
--       -- 고쳐서 재활용 45계열(1-2는 1-1과 같은 계열을 쓴다)
--       ARRAY[
--       'walking:P2', 'cycling:C2', 'running:C2',  -- 1-1
--       'walking:S1', 'walking:S2', 'walking:S3', 'running:N1', 'cycling:N1', 'trail_running:N1', 'running:N2', 'cycling:N2', 'trail_running:N2', 'running:N3', 'cycling:N3', 'hiking:N1', 'hiking:N2', 'hiking:N3',  -- 1-3
--       'walking:P1', 'running:C1', 'cycling:C1', 'trail_running:C1', 'hiking:C1',  -- 1-5
--       'walking:R4', 'running:X3', 'cycling:X2', 'trail_running:X2', 'hiking:X2',  -- 2-1
--       'running:T1', 'trail_running:T1', 'walking:A8',  -- 3-1
--       'cycling:D1', 'hiking:D1', 'running:D2',  -- 3-3
--       'walking:A6',  -- 3-6
--       'walking:A9',  -- 3-7
--       'walking:K3', 'running:K3', 'cycling:K3', 'trail_running:K3', 'hiking:K3',  -- 5-3
--       'walking:B1', 'running:R1', 'trail_running:R1', 'cycling:R1',  -- 6-18
--       'running:R2',  -- 6-19
--       'onboarding:complete'  -- 온보딩 퀘스트 클리어(사용자 결정 2026-10-19: 끄지 않고 유지)
--       ]::text[] AS fixed
--   )
-- SELECT jsonb_agg(jsonb_build_object(
--          'id', b.id,
--          'gate_mission_badge', b.condition_json->'gate_mission_badge',
--          'cross_between_axis', b.condition_json->'cross_between_axis'
--        ) ORDER BY b.id) AS 게이트_키_백업
--   FROM public.badges b, keep k
--  WHERE b.type = 'activity' AND b.deleted_at IS NULL AND b.family_key = ANY (k.as_is || k.fixed)
--    AND (b.condition_json ? 'gate_mission_badge' OR b.condition_json ? 'cross_between_axis');

-- 되돌림 SQL
-- ① 끈 배지를 다시 켠다. 대상은 deleted_at 값과 유지 목록으로 가려낸다 — 임시 백업 테이블을 두지 않는다.
--    <끈_시각>은 위 「적용 후 확인 쿼리」의 두 번째 쿼리에서 가장 많은 행(364)을 가진 deleted_at 값이다(마이크로초까지 그대로 옮긴다).
--    그 시각은 이 마이그레이션이 한 문장으로 끈 한 값이라 다른 때 삭제된 배지와 섞이지 않는다.
--    되돌리기 전에 `SELECT count(*) ... WHERE deleted_at = '<끈_시각>'`이 364인지 본다. 아니면 멈추고 원인을 먼저 확인한다.
--
-- BEGIN;
-- UPDATE public.badges AS b
--    SET deleted_at = NULL
--   FROM (
--     WITH
--     keep AS (
--       SELECT
--         -- 그대로 재활용 15계열(원고 6-3~6-17)
--         ARRAY[
--         'walking:K1', 'running:L1', 'running:P1', 'running:K1', 'trail_running:L1',  -- 6-3~6-7
--         'trail_running:E1', 'trail_running:K2', 'cycling:L1', 'cycling:E1', 'cycling:K1',  -- 6-8~6-12
--         'cycling:K2', 'hiking:L1', 'hiking:P1', 'hiking:A1', 'hiking:K1'  -- 6-13~6-17
--         ]::text[] AS as_is,
--         -- 고쳐서 재활용 45계열(1-2는 1-1과 같은 계열을 쓴다)
--         ARRAY[
--         'walking:P2', 'cycling:C2', 'running:C2',  -- 1-1
--         'walking:S1', 'walking:S2', 'walking:S3', 'running:N1', 'cycling:N1', 'trail_running:N1', 'running:N2', 'cycling:N2', 'trail_running:N2', 'running:N3', 'cycling:N3', 'hiking:N1', 'hiking:N2', 'hiking:N3',  -- 1-3
--         'walking:P1', 'running:C1', 'cycling:C1', 'trail_running:C1', 'hiking:C1',  -- 1-5
--         'walking:R4', 'running:X3', 'cycling:X2', 'trail_running:X2', 'hiking:X2',  -- 2-1
--         'running:T1', 'trail_running:T1', 'walking:A8',  -- 3-1
--         'cycling:D1', 'hiking:D1', 'running:D2',  -- 3-3
--         'walking:A6',  -- 3-6
--         'walking:A9',  -- 3-7
--         'walking:K3', 'running:K3', 'cycling:K3', 'trail_running:K3', 'hiking:K3',  -- 5-3
--         'walking:B1', 'running:R1', 'trail_running:R1', 'cycling:R1',  -- 6-18
--         'running:R2',  -- 6-19
--         'onboarding:complete'  -- 온보딩 퀘스트 클리어(사용자 결정 2026-10-19: 끄지 않고 유지)
--         ]::text[] AS fixed
--     )
--     SELECT x.id
--       FROM public.badges x, keep k
--      WHERE x.type = 'activity' AND x.deleted_at = TIMESTAMPTZ '<끈_시각>'
--        AND (x.family_key IS NULL OR x.family_key <> ALL (k.as_is || k.fixed))
--   ) AS t
--  WHERE b.id = t.id;
--
-- ② 게이트 키를 되돌린다. 사전 백업 SELECT 결과(JSON 배열)를 <백업_JSON> 자리에 넣는다. 키가 원래 없던 행은 JSON에 null로 들어 있으니
--    null이 아닌 키만 되살린다.
--
-- UPDATE public.badges AS b
--    SET condition_json = b.condition_json
--          || CASE WHEN r.gate_mission_badge IS NOT NULL AND r.gate_mission_badge <> 'null'::jsonb
--                  THEN jsonb_build_object('gate_mission_badge', r.gate_mission_badge) ELSE '{}'::jsonb END
--          || CASE WHEN r.cross_between_axis IS NOT NULL AND r.cross_between_axis <> 'null'::jsonb
--                  THEN jsonb_build_object('cross_between_axis', r.cross_between_axis) ELSE '{}'::jsonb END
--   FROM jsonb_to_recordset('<백업_JSON>'::jsonb)
--          AS r(id uuid, gate_mission_badge jsonb, cross_between_axis jsonb)
--  WHERE b.id = r.id;
-- COMMIT;
--
-- ②의 대안(백업 JSON을 잃었을 때): jam-web/supabase/migrations/seed_v5_gate_conditions.sql(2026-09-06 시드, 멱등 jsonb 병합)에서
--   «그대로 재활용» 15계열의 UPDATE 문만 골라 다시 실행한다. 시드 뒤에 어드민에서 고친 게이트는 되돌아오지 않는다.
-- 되돌린 뒤 확인: SELECT count(*) FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;  -- 634
