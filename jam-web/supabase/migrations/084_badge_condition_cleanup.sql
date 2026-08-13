-- 084: 배지 획득 조건 정비 (2026-08-13)
-- 1. 미션 보상 배지 15종 condition_json 설정
-- 2. 흐지부지 러닝 클럽 → poi 타입 전환 + 발급 기록 이전
-- 3. 특수 배지 5종 소프트 삭제

-- 1. 미션 보상 배지: condition_json = {mission_reward: true}
UPDATE badges
SET condition_json = '{"mission_reward": true}'::jsonb
WHERE name IN (
  '동네 산책러 레벨업', '동네 산책러 레벨업 Hard', '동네 산책러 레벨업 Ultra',
  '첫 숨결 레벨업',    '첫 숨결 레벨업 Hard',    '첫 숨결 레벨업 Ultra',
  '언덕의 도전자 레벨업','언덕의 도전자 레벨업 Hard','언덕의 도전자 레벨업 Ultra',
  '첫 고도 레벨업',    '첫 고도 레벨업 Hard',    '첫 고도 레벨업 Ultra',
  '야생의 주자 레벨업', '야생의 주자 레벨업 Hard', '야생의 주자 레벨업 Ultra'
)
AND type = 'activity';

-- 2-a. 흐지부지 러닝 클럽 발급 기록 → user_poi_badge_earns 이전
INSERT INTO user_poi_badge_earns (user_id, badge_id, poi_id, earned_at)
SELECT
  u.user_id,
  u.badge_id,
  'cc7b204d-eeef-41db-b405-d7f0bb85a6ad'::uuid AS poi_id,
  u.earned_at
FROM user_activity_badges u
WHERE u.badge_id = 'ce5d5c21-dee4-449c-8e5c-e8b93ccc0ae6';

-- 2-b. 흐지부지 기존 activity 발급 기록 삭제
DELETE FROM user_activity_badges
WHERE badge_id = 'ce5d5c21-dee4-449c-8e5c-e8b93ccc0ae6';

-- 2-c. 흐지부지 배지 → poi 타입 + poi_id 조건 설정
UPDATE badges
SET type = 'poi',
    condition_json = '{"poi_id": "cc7b204d-eeef-41db-b405-d7f0bb85a6ad"}'::jsonb
WHERE id = 'ce5d5c21-dee4-449c-8e5c-e8b93ccc0ae6';

-- 3. 특수 배지 5종 소프트 삭제 (발급 기록 없음 확인 후 진행)
UPDATE badges
SET deleted_at = NOW()
WHERE name IN ('광나루 라이더', '뚝섬 라이더', '북악스카이웨이 클라이머', '남산 정복자', '청계산 완주자')
AND deleted_at IS NULL;
