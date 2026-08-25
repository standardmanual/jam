-- 티켓 20260825_028 — 레벨업 미션/미션보상배지 이력 초기화 (테스터 데이터 정리)
--
-- 배경: 마이그레이션 084가 미션보상배지 15종에 {"mission_reward": true}를 넣으면서 배지엔진의
-- "조건 없으면 미발급" 가드가 무력화됐고, 그 결과 미션을 하지 않아도 미션보상배지가 발급돼
-- 본 배지 Rare/Legend/Mythic 게이트가 전부 열려 있었다. 엔진 결함을 고친 뒤에도 이미 잘못
-- 나간 발급분이 남아 있으면 게이팅이 처음부터 열린 상태이므로, 현재 보유자가 전원 테스터·더미
-- 계정임을 확인하고 원점에서 다시 시작하기로 했다(2026-08-25 사용자 확정).
--
-- 삭제 대상 4종 (2026-08-25 프로덕션 DB 실측):
--   1) 미션보상배지 15종 발급분 (user_activity_badges)           104건
--   2) 5개 트리 본 배지 Rare/Legend/Mythic 발급분                 37건
--   3) 레벨업 미션 15종 참가 기록 (user_mission_participations)   33건
--   4) 레벨업 미션 15종 완료 기록 (user_mission_completions)       3건
--   미션보상배지 보유 유저 7명 / 본 배지 Rare+ 보유 유저 8명
--   → 이 스크립트가 실제로 영향을 주는 유저는 두 집합의 합집합 **9명** (전원 테스터·더미 계정)
--   ※ 실행 시점이 위 측정일보다 뒤라면 그동안의 동기화로 건수가 늘어날 수 있습니다.
--     STEP 0에서 실제 건수를 다시 확인한 뒤 진행하세요.
--
-- ⚠️ 되돌릴 수 없는 삭제 SQL입니다. Claude는 플랫폼 안전 규칙상 이 파일을 직접 실행하지
--    않습니다 — Supabase SQL 편집기 또는 본인 터미널에서 직접 실행해 주세요.
-- ⚠️ 실행 순서: 마이그레이션 101 + 배지엔진 수정 배포가 끝난 뒤에 실행해야 합니다.
--    엔진 수정 전에 지우면 다음 동기화에서 그대로 재발급됩니다.
--
-- =====================================================================
-- STEP 0. 실행 전 확인 — 대상 id와 건수를 먼저 눈으로 확인하세요.
--         (아래 SELECT만 따로 실행. 건수가 위 실측치와 크게 다르면 중단하고 재검토)
-- =====================================================================
--
-- -- 0-a. 미션보상배지 15종 (기대: 15행)
-- SELECT id, name, rarity FROM badges
-- WHERE type = 'activity' AND name IN (
--   '동네 산책러 레벨업','동네 산책러 레벨업 Hard','동네 산책러 레벨업 Ultra',
--   '첫 숨결 레벨업','첫 숨결 레벨업 Hard','첫 숨결 레벨업 Ultra',
--   '언덕의 도전자 레벨업','언덕의 도전자 레벨업 Hard','언덕의 도전자 레벨업 Ultra',
--   '첫 고도 레벨업','첫 고도 레벨업 Hard','첫 고도 레벨업 Ultra',
--   '야생의 주자 레벨업','야생의 주자 레벨업 Hard','야생의 주자 레벨업 Ultra'
-- ) ORDER BY name;
--
-- -- 0-b. 5개 트리 본 배지 Rare/Legend/Mythic (기대: 15행)
-- SELECT id, name, rarity FROM badges
-- WHERE type = 'activity'
--   AND name IN ('동네 산책러','첫 숨결','언덕의 도전자','첫 고도','야생의 주자')
--   AND rarity IN ('rare','legend','mythic') ORDER BY name, rarity;
--
-- -- 0-c. 레벨업 미션 15종 (기대: 15행)
-- SELECT id, title FROM missions WHERE title LIKE '%레벨업%' ORDER BY title;
--
-- -- 0-d. 삭제 예정 건수 (기대: 104 / 37 / 33 / 3 — 2026-08-25 실측)
-- SELECT
--   (SELECT count(*) FROM user_activity_badges uab JOIN badges b ON b.id = uab.badge_id
--      WHERE b.type='activity' AND b.name LIKE '%레벨업%')                                  AS 미션보상배지_발급분,
--   (SELECT count(*) FROM user_activity_badges uab JOIN badges b ON b.id = uab.badge_id
--      WHERE b.type='activity' AND b.name IN ('동네 산책러','첫 숨결','언덕의 도전자','첫 고도','야생의 주자')
--        AND b.rarity IN ('rare','legend','mythic'))                                        AS 본배지_발급분,
--   (SELECT count(*) FROM user_mission_participations p JOIN missions m ON m.id = p.mission_id
--      WHERE m.title LIKE '%레벨업%')                                                       AS 참가기록,
--   (SELECT count(*) FROM user_mission_completions c JOIN missions m ON m.id = c.mission_id
--      WHERE m.title LIKE '%레벨업%')                                                       AS 완료기록;
--
-- =====================================================================
-- STEP 1. 실제 삭제 — 아래 DO 블록 전체를 한 번에 실행합니다(단일 문이라 원자적).
--         대상은 1-a에서 확정한 id 배열 안으로만 한정되며,
--         id 개수가 기대치(15/15/15)와 다르면 RAISE EXCEPTION으로 전체 롤백됩니다.
-- =====================================================================

-- ⚠️ 2026-08-25 수정 — 최초 버전은 CREATE TEMP TABLE ... ON COMMIT DROP을 썼다가
--    `ERROR: 42P01: relation "_reset_reward_badge_ids" does not exist`로 실패했다.
--    Supabase SQL 편집기처럼 문(statement)을 개별 autocommit으로 실행하는 환경에서는
--    temp table이 CREATE 직후 커밋과 함께 즉시 드롭돼 다음 문이 참조할 수 없다.
--    전체를 단일 DO 블록으로 바꿨다 — DO는 하나의 문이라 어떤 실행 환경에서도 원자적이고,
--    중간에 RAISE EXCEPTION이 나면 그 블록의 모든 DELETE가 함께 롤백된다.

DO $$
DECLARE
  reward_ids  UUID[];
  tree_ids    UUID[];
  mission_ids UUID[];
  d_reward INT; d_tree INT; d_comp INT; d_part INT;
BEGIN
  -- 1-a. 삭제 대상 id 확정 (이후 모든 DELETE는 이 세 배열 안으로만 한정된다)
  SELECT array_agg(id) INTO reward_ids FROM badges
  WHERE type = 'activity' AND name IN (
    '동네 산책러 레벨업', '동네 산책러 레벨업 Hard', '동네 산책러 레벨업 Ultra',
    '첫 숨결 레벨업',     '첫 숨결 레벨업 Hard',     '첫 숨결 레벨업 Ultra',
    '언덕의 도전자 레벨업','언덕의 도전자 레벨업 Hard','언덕의 도전자 레벨업 Ultra',
    '첫 고도 레벨업',     '첫 고도 레벨업 Hard',     '첫 고도 레벨업 Ultra',
    '야생의 주자 레벨업', '야생의 주자 레벨업 Hard', '야생의 주자 레벨업 Ultra'
  );

  SELECT array_agg(id) INTO tree_ids FROM badges
  WHERE type = 'activity'
    AND name IN ('동네 산책러', '첫 숨결', '언덕의 도전자', '첫 고도', '야생의 주자')
    AND rarity IN ('rare', 'legend', 'mythic');

  SELECT array_agg(id) INTO mission_ids FROM missions
  WHERE title IN (
    '동네 산책러 레벨업', '동네 산책러 레벨업 Hard', '동네 산책러 레벨업 Ultra',
    '첫 숨결 레벨업',     '첫 숨결 레벨업 Hard',     '첫 숨결 레벨업 Ultra',
    '언덕의 도전자 레벨업','언덕의 도전자 레벨업 Hard','언덕의 도전자 레벨업 Ultra',
    '첫 고도 레벨업',     '첫 고도 레벨업 Hard',     '첫 고도 레벨업 Ultra',
    '야생의 주자 레벨업', '야생의 주자 레벨업 Hard', '야생의 주자 레벨업 Ultra'
  );

  -- 1-b. 안전장치 — 대상 개수가 기대치와 다르면(이름 변경·중복 등) 전체 롤백
  IF coalesce(array_length(reward_ids, 1), 0) <> 15 THEN
    RAISE EXCEPTION '미션보상배지 대상이 15개가 아닙니다 (실제 %개) — 중단', coalesce(array_length(reward_ids, 1), 0);
  END IF;
  IF coalesce(array_length(tree_ids, 1), 0) <> 15 THEN
    RAISE EXCEPTION '본 배지 Rare/Legend/Mythic 대상이 15개가 아닙니다 (실제 %개) — 중단', coalesce(array_length(tree_ids, 1), 0);
  END IF;
  IF coalesce(array_length(mission_ids, 1), 0) <> 15 THEN
    RAISE EXCEPTION '레벨업 미션 대상이 15개가 아닙니다 (실제 %개) — 중단', coalesce(array_length(mission_ids, 1), 0);
  END IF;

  -- 1-c. 미션보상배지 15종 발급분 삭제
  DELETE FROM user_activity_badges WHERE badge_id = ANY(reward_ids);
  GET DIAGNOSTICS d_reward = ROW_COUNT;

  -- 1-d. 5개 트리 본 배지 Rare/Legend/Mythic 발급분 삭제 (common은 보존)
  DELETE FROM user_activity_badges WHERE badge_id = ANY(tree_ids);
  GET DIAGNOSTICS d_tree = ROW_COUNT;

  -- 1-e. 레벨업 미션 15종 완료 기록 삭제
  DELETE FROM user_mission_completions WHERE mission_id = ANY(mission_ids);
  GET DIAGNOSTICS d_comp = ROW_COUNT;

  -- 1-f. 레벨업 미션 15종 참가 기록 삭제
  DELETE FROM user_mission_participations WHERE mission_id = ANY(mission_ids);
  GET DIAGNOSTICS d_part = ROW_COUNT;

  RAISE NOTICE '삭제 완료 — 미션보상배지 발급분 %건 / 본 배지 발급분 %건 / 완료기록 %건 / 참가기록 %건',
    d_reward, d_tree, d_comp, d_part;
END $$;

-- =====================================================================
-- STEP 2. 실행 후 확인 — 전부 0이어야 합니다.
-- =====================================================================
-- SELECT
--   (SELECT count(*) FROM user_activity_badges uab JOIN badges b ON b.id = uab.badge_id
--      WHERE b.type='activity' AND b.name LIKE '%레벨업%')                                  AS 미션보상배지_발급분,
--   (SELECT count(*) FROM user_activity_badges uab JOIN badges b ON b.id = uab.badge_id
--      WHERE b.type='activity' AND b.name IN ('동네 산책러','첫 숨결','언덕의 도전자','첫 고도','야생의 주자')
--        AND b.rarity IN ('rare','legend','mythic'))                                        AS 본배지_발급분,
--   (SELECT count(*) FROM user_mission_participations p JOIN missions m ON m.id = p.mission_id
--      WHERE m.title LIKE '%레벨업%')                                                       AS 참가기록,
--   (SELECT count(*) FROM user_mission_completions c JOIN missions m ON m.id = c.mission_id
--      WHERE m.title LIKE '%레벨업%')                                                       AS 완료기록;
