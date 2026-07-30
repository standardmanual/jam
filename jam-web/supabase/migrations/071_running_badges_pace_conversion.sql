-- 071: 러닝 속도 조건 배지(리듬의 발견, 스피드 엔듀러)를 km/h(min_speed_kmh) →
-- 페이스(초/km, max_pace_sec_per_km) 단위로 전환. 페이스는 값이 작을수록 빠름.
--
-- 기존 km/h 임계값을 러너가 실제 쓰는 페이스 단위로 반올림해 재설정:
--   리듬의 발견   : 7.0/9.0/11.0/13.0 km/h → 8:30/6:30/5:30/4:30 /km (510/390/330/270초)
--   스피드 엔듀러 : 8.0/9.0/11.0/13.0 km/h → 7:30/6:30/5:30/4:30 /km (450/390/330/270초), duration_minutes는 유지
--
-- trail_running·walking 카테고리에는 애초에 속도 조건 배지가 없어 전환 대상 없음.

-- 리듬의 발견 (common → mythic)
UPDATE badges
SET
  condition_json = jsonb_set(condition_json - 'min_speed_kmh', '{max_pace_sec_per_km}', '510'::jsonb),
  description = '평균 페이스 8:30/km. 섬데이 아스팔트가 당신의 리듬을 감지합니다.'
WHERE name = '리듬의 발견' AND rarity = 'common' AND type = 'activity';

UPDATE badges
SET
  condition_json = jsonb_set(condition_json - 'min_speed_kmh', '{max_pace_sec_per_km}', '390'::jsonb),
  description = '페이스 6:30/km 돌파. 그루터기 살롱이 당신의 스텝을 주목합니다.'
WHERE name = '리듬의 발견' AND rarity = 'rare' AND type = 'activity';

UPDATE badges
SET
  condition_json = jsonb_set(condition_json - 'min_speed_kmh', '{max_pace_sec_per_km}', '330'::jsonb),
  description = '페이스 5:30/km. 블랙 트랙의 속도 신봉자들이 고개를 끄덕입니다.'
WHERE name = '리듬의 발견' AND rarity = 'legendary' AND type = 'activity';

UPDATE badges
SET
  condition_json = jsonb_set(condition_json - 'min_speed_kmh', '{max_pace_sec_per_km}', '270'::jsonb),
  description = '페이스 4:30/km. 화이트 룸의 속도 코드를 해독했습니다.'
WHERE name = '리듬의 발견' AND rarity = 'mythic' AND type = 'activity';

-- 스피드 엔듀러 (min_speed_kmh → max_pace_sec_per_km, duration_minutes 그대로 유지, 설명문엔 원래도 수치 미포함)
UPDATE badges
SET condition_json = jsonb_set(condition_json - 'min_speed_kmh', '{max_pace_sec_per_km}', '450'::jsonb)
WHERE name = '스피드 엔듀러' AND rarity = 'common' AND type = 'activity';

UPDATE badges
SET condition_json = jsonb_set(condition_json - 'min_speed_kmh', '{max_pace_sec_per_km}', '390'::jsonb)
WHERE name = '스피드 엔듀러' AND rarity = 'rare' AND type = 'activity';

UPDATE badges
SET condition_json = jsonb_set(condition_json - 'min_speed_kmh', '{max_pace_sec_per_km}', '330'::jsonb)
WHERE name = '스피드 엔듀러' AND rarity = 'legendary' AND type = 'activity';

UPDATE badges
SET condition_json = jsonb_set(condition_json - 'min_speed_kmh', '{max_pace_sec_per_km}', '270'::jsonb)
WHERE name = '스피드 엔듀러' AND rarity = 'mythic' AND type = 'activity';
