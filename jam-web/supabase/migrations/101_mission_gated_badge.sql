-- 101: 미션 → 본 배지 게이트 연결 + 레벨업 미션 데이터 정비 (티켓 20260825_028)
--
-- 1) missions.gated_badge_id 컬럼 추가 — "이 미션을 완료해야 열리는 본 배지"를 데이터로 명시.
--    기존에는 미션.reward_badge_ids → 보상배지 이름 → 그 이름을 prerequisite_badge_names에
--    가진 본 배지로 역추적해야 트리·단계를 알 수 있었다(배지명이 바뀌면 조용히 끊김).
-- 2) 레벨업 미션 15종에 gated_badge_id 채우기
-- 3) 첫 숨결 Legend/Mythic 조건값 정정 (DB 60km/150km → 확정값 40km/100km)
-- 4) '첫 숨결 레벨업' condition_json을 나머지 14종과 동일하게 {"mission_reward": true}로 통일
--
-- ⚠️ 이 파일은 스키마/데이터 변경만 한다. 기존 발급·참가 이력 정리는
--    seed_reset_levelup_missions_20260825.sql(사용자 직접 실행)에서 별도로 처리한다.

-- ── 1. 컬럼 추가 ────────────────────────────────────────────────────────────
ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS gated_badge_id UUID REFERENCES badges(id) ON DELETE SET NULL;

COMMENT ON COLUMN missions.gated_badge_id IS
  '이 미션을 완료해야 획득 조건이 열리는 본 배지 id (레벨업 미션 전용, NULL=게이팅 없는 일반 미션). 미션 노출 판정(src/lib/missions/visibility.ts)이 이 배지의 rarity를 기준으로 open/locked/hidden을 결정한다. 티켓 20260825_028';

CREATE INDEX IF NOT EXISTS idx_missions_gated_badge_id ON missions(gated_badge_id);

-- ── 2. 레벨업 미션 15종 gated_badge_id 채우기 ───────────────────────────────
-- 미션명 → (본 배지 이름, 등급) 매핑. 본 배지는 type='activity' + 미삭제 건만 대상.
UPDATE missions m
SET gated_badge_id = b.id
FROM (
  VALUES
    ('동네 산책러 레벨업',        '동네 산책러',   'rare'),
    ('동네 산책러 레벨업 Hard',   '동네 산책러',   'legend'),
    ('동네 산책러 레벨업 Ultra',  '동네 산책러',   'mythic'),
    ('첫 숨결 레벨업',            '첫 숨결',       'rare'),
    ('첫 숨결 레벨업 Hard',       '첫 숨결',       'legend'),
    ('첫 숨결 레벨업 Ultra',      '첫 숨결',       'mythic'),
    ('언덕의 도전자 레벨업',      '언덕의 도전자', 'rare'),
    ('언덕의 도전자 레벨업 Hard', '언덕의 도전자', 'legend'),
    ('언덕의 도전자 레벨업 Ultra','언덕의 도전자', 'mythic'),
    ('첫 고도 레벨업',            '첫 고도',       'rare'),
    ('첫 고도 레벨업 Hard',       '첫 고도',       'legend'),
    ('첫 고도 레벨업 Ultra',      '첫 고도',       'mythic'),
    ('야생의 주자 레벨업',        '야생의 주자',   'rare'),
    ('야생의 주자 레벨업 Hard',   '야생의 주자',   'legend'),
    ('야생의 주자 레벨업 Ultra',  '야생의 주자',   'mythic')
) AS map(mission_title, badge_name, badge_rarity)
JOIN badges b
  ON b.name = map.badge_name
 AND b.rarity = map.badge_rarity
 AND b.type = 'activity'
 AND b.deleted_at IS NULL
WHERE m.title = map.mission_title;

-- 확인용: 15건이 모두 채워졌는지
-- SELECT m.title, b.name, b.rarity
-- FROM missions m JOIN badges b ON b.id = m.gated_badge_id
-- WHERE m.title LIKE '%레벨업%' ORDER BY b.name, b.rarity;

-- ── 3. 첫 숨결 Legend/Mythic 조건값 정정 ────────────────────────────────────
-- 티켓 20260813_001·ACTIVITY_BADGES.md 확정값은 40km/100km인데 DB만 60km/150km로 남아 있었다
-- (3자 대조 결과 불일치 1건, 티켓 20260825_028 §4-b). 가장 마지막 확정값(2026-08-13)으로 맞춘다.
UPDATE badges
SET condition_json = jsonb_set(condition_json, '{distance_km}', '40'::jsonb)
WHERE name = '첫 숨결' AND rarity = 'legend' AND type = 'activity' AND deleted_at IS NULL;

UPDATE badges
SET condition_json = jsonb_set(condition_json, '{distance_km}', '100'::jsonb)
WHERE name = '첫 숨결' AND rarity = 'mythic' AND type = 'activity' AND deleted_at IS NULL;

-- ── 4. '첫 숨결 레벨업' condition_json 통일 ─────────────────────────────────
-- 미션보상배지 15종 중 이 1종만 NULL로 남아 있었다. 배지 상세 화면이 이 플래그로
-- "미션 보상 배지"임을 표시하고(badges/[id]/page.tsx), 배지엔진이 이 플래그를 보고
-- 발급 후보에서 명시적으로 제외한다(src/lib/badge-engine/index.ts).
UPDATE badges
SET condition_json = '{"mission_reward": true}'::jsonb
WHERE name = '첫 숨결 레벨업' AND type = 'activity';

-- 확인용: 미션보상배지 15종이 전부 {"mission_reward": true}인지
-- SELECT name, condition_json FROM badges
-- WHERE name LIKE '%레벨업%' AND type = 'activity' ORDER BY name;
