-- 티켓 20260813_001 — 종목별 대표배지 레벨업 미션 게이팅: 데이터 생성
-- 1) 미션보상배지 15종 (badges, type='activity', condition_json=NULL — 미션 완료로만 지급, 일반 동기화로 발급되지 않음)
-- 2) 미션 15종 (missions, 상시/개인형/포인트없음/선착순없음)
-- 3) 5개 대표 트리(Rare~Mythic)의 condition_json에서 기존 prerequisite_badge_names 제거 → 해당 미션보상배지명 1개로 교체

BEGIN;

-- ── 1) 미션보상배지 15종 ─────────────────────────────────────────────────

INSERT INTO badges (id, name, description, type, rarity, activity_types, condition_json, point_reward, image_url) VALUES
-- 걷기 — 동네 산책러
('d7909ac4-b4c0-4ef4-a8dd-30c8484904aa', '동네 산책러 레벨업', '섬데이의 리듬을 스스로 증명했습니다. 이제 동네 산책러 Rare에 도전하세요.', 'activity', 'rare', ARRAY['walking'], NULL, 0, '/badges/sample/s347.png'),
('b25f9632-dade-4460-8ae8-9ea9b409ee76', '동네 산책러 레벨업 Hard', '두 번째 7일 연속 걷기 미션 완료. 그루터기 살롱이 이번엔 조용히 박수를 보냅니다. 이제 동네 산책러 Legend에 도전하세요.', 'activity', 'legendary', ARRAY['walking'], NULL, 0, '/badges/sample/s145.png'),
('c7c034dd-948a-4e2d-b863-414d2cf1406c', '동네 산책러 레벨업 Ultra', '14일 연속 걷기 미션 완료. 블랙 트랙이 이 끈기를 기록에 새깁니다. 이제 동네 산책러 Mythic에 도전하세요.', 'activity', 'mythic', ARRAY['walking'], NULL, 0, '/badges/sample/s364.png'),
-- 러닝 — 첫 숨결
('93255c94-30af-44b1-9b95-2a24a218527f', '첫 숨결 레벨업', '120분 논스톱 러닝 미션 완료. 그루터기 살롱이 당신의 지구력을 처음 주목합니다. 이제 첫 숨결 Rare에 도전하세요.', 'activity', 'rare', ARRAY['running'], NULL, 0, '/badges/sample/s142.png'),
('7986587d-8f8c-427f-ae7d-001543f9c19c', '첫 숨결 레벨업 Hard', '180분 논스톱 러닝 미션 완료. 블랙 트랙이 이 지구력을 전설로 기록합니다. 이제 첫 숨결 Legend에 도전하세요.', 'activity', 'legendary', ARRAY['running'], NULL, 0, '/badges/sample/s331.png'),
('193cf7ff-d886-4d1b-872c-f0b5bd4aca1c', '첫 숨결 레벨업 Ultra', '320분 논스톱 러닝 미션 완료. 화이트 룸이 극한의 지구력을 인정합니다. 이제 첫 숨결 Mythic에 도전하세요.', 'activity', 'mythic', ARRAY['running'], NULL, 0, '/badges/sample/s029.png'),
-- 사이클 — 언덕의 도전자
('dc1ed526-4003-444b-bae4-f2a6fa1e70dd', '언덕의 도전자 레벨업', '120분 논스톱 라이딩 미션 완료. 그루터기 살롱이 당신의 페달링을 주목합니다. 이제 언덕의 도전자 Rare에 도전하세요.', 'activity', 'rare', ARRAY['cycling'], NULL, 0, '/badges/sample/s010.png'),
('72bb8066-b861-4e29-9065-4cd83414042f', '언덕의 도전자 레벨업 Hard', '180분 논스톱 라이딩 미션 완료. 블랙 트랙이 이 항속력을 기록합니다. 이제 언덕의 도전자 Legend에 도전하세요.', 'activity', 'legendary', ARRAY['cycling'], NULL, 0, '/badges/sample/s216.png'),
('bb1944de-1694-4393-82b5-1114056ac18b', '언덕의 도전자 레벨업 Ultra', '300분 논스톱 라이딩 미션 완료. 화이트 룸이 이 항속을 정복으로 인정합니다. 이제 언덕의 도전자 Mythic에 도전하세요.', 'activity', 'mythic', ARRAY['cycling'], NULL, 0, '/badges/sample/s228.png'),
-- 등산 — 첫 고도
('843ee15b-4fc9-40b8-8cb1-f841f19a4b24', '첫 고도 레벨업', '120분 단일 산행 미션 완료. 그루터기 살롱이 당신의 인내를 처음 인정합니다. 이제 첫 고도 Rare에 도전하세요.', 'activity', 'rare', ARRAY['hiking'], NULL, 0, '/badges/sample/s138.png'),
('c783d07f-7ca2-47a6-a89b-fd86d5b9bdc4', '첫 고도 레벨업 Hard', '200분 단일 산행 미션 완료. 블랙 트랙의 심산행자 명단에 이름이 오릅니다. 이제 첫 고도 Legend에 도전하세요.', 'activity', 'legendary', ARRAY['hiking'], NULL, 0, '/badges/sample/s182.png'),
('1e5133d5-68d9-4fba-8641-8d5ce8cf5899', '첫 고도 레벨업 Ultra', '300분 단일 산행 미션 완료. 화이트 룸이 산의 깊이를 아는 자를 인정합니다. 이제 첫 고도 Mythic에 도전하세요.', 'activity', 'mythic', ARRAY['hiking'], NULL, 0, '/badges/sample/s073.png'),
-- 트레일러닝 — 야생의 주자
('4fc54cc7-4691-43b2-b5c6-ea476197398a', '야생의 주자 레벨업', '단일 활동 600m 등반 미션 완료. 그루터기 살롱이 당신의 수직 감각을 주목합니다. 이제 야생의 주자 Rare에 도전하세요.', 'activity', 'rare', ARRAY['trail_running'], NULL, 0, '/badges/sample/s079.png'),
('5c94338f-e6e7-49a5-a1a1-7669be1e2f14', '야생의 주자 레벨업 Hard', '단일 활동 1,500m 등반 미션 완료. 블랙 트랙의 수직 전사 명단에 이름이 오릅니다. 이제 야생의 주자 Legend에 도전하세요.', 'activity', 'legendary', ARRAY['trail_running'], NULL, 0, '/badges/sample/s118.png'),
('e9847300-41ed-4e7f-ae73-661dbe3985e7', '야생의 주자 레벨업 Ultra', '단일 활동 3,000m 등반 미션 완료. 화이트 룸이 중력을 이긴 자를 인정합니다. 이제 야생의 주자 Mythic에 도전하세요.', 'activity', 'mythic', ARRAY['trail_running'], NULL, 0, '/badges/sample/s019.png');

-- ── 2) 미션 15종 (상시 / 개인형 / 포인트 없음 / 선착순 없음) ────────────────

INSERT INTO missions (title, description, mission_type, condition_json, reward_type, reward_badge_ids, reward_points, starts_at, ends_at, max_completions, status_display_type) VALUES
-- 걷기
('동네 산책러 레벨업', '미션에 참가한 이후, 언제든지 연속 7일 걸으면 완료돼요.', 'streak_days', '{"activity_type":"walking","streak_days":7}', 'badge', ARRAY['d7909ac4-b4c0-4ef4-a8dd-30c8484904aa']::uuid[], 0, now(), NULL, NULL, 'individual'),
('동네 산책러 레벨업 Hard', '미션에 참가한 이후, 언제든지 연속 7일 걸으면 완료돼요.', 'streak_days', '{"activity_type":"walking","streak_days":7}', 'badge', ARRAY['b25f9632-dade-4460-8ae8-9ea9b409ee76']::uuid[], 0, now(), NULL, NULL, 'individual'),
('동네 산책러 레벨업 Ultra', '미션에 참가한 이후, 언제든지 연속 14일 걸으면 완료돼요.', 'streak_days', '{"activity_type":"walking","streak_days":14}', 'badge', ARRAY['c7c034dd-948a-4e2d-b863-414d2cf1406c']::uuid[], 0, now(), NULL, NULL, 'individual'),
-- 러닝
('첫 숨결 레벨업', '미션에 참가한 이후, 한 번의 러닝에서 120분 이상 달리면 완료돼요.', 'duration_minutes', '{"activity_type":"running","duration_minutes":120}', 'badge', ARRAY['93255c94-30af-44b1-9b95-2a24a218527f']::uuid[], 0, now(), NULL, NULL, 'individual'),
('첫 숨결 레벨업 Hard', '미션에 참가한 이후, 한 번의 러닝에서 180분 이상 달리면 완료돼요.', 'duration_minutes', '{"activity_type":"running","duration_minutes":180}', 'badge', ARRAY['7986587d-8f8c-427f-ae7d-001543f9c19c']::uuid[], 0, now(), NULL, NULL, 'individual'),
('첫 숨결 레벨업 Ultra', '미션에 참가한 이후, 한 번의 러닝에서 320분 이상 달리면 완료돼요.', 'duration_minutes', '{"activity_type":"running","duration_minutes":320}', 'badge', ARRAY['193cf7ff-d886-4d1b-872c-f0b5bd4aca1c']::uuid[], 0, now(), NULL, NULL, 'individual'),
-- 사이클
('언덕의 도전자 레벨업', '미션에 참가한 이후, 한 번의 라이딩에서 120분 이상 타면 완료돼요.', 'duration_minutes', '{"activity_type":"cycling","duration_minutes":120}', 'badge', ARRAY['dc1ed526-4003-444b-bae4-f2a6fa1e70dd']::uuid[], 0, now(), NULL, NULL, 'individual'),
('언덕의 도전자 레벨업 Hard', '미션에 참가한 이후, 한 번의 라이딩에서 180분 이상 타면 완료돼요.', 'duration_minutes', '{"activity_type":"cycling","duration_minutes":180}', 'badge', ARRAY['72bb8066-b861-4e29-9065-4cd83414042f']::uuid[], 0, now(), NULL, NULL, 'individual'),
('언덕의 도전자 레벨업 Ultra', '미션에 참가한 이후, 한 번의 라이딩에서 300분 이상 타면 완료돼요.', 'duration_minutes', '{"activity_type":"cycling","duration_minutes":300}', 'badge', ARRAY['bb1944de-1694-4393-82b5-1114056ac18b']::uuid[], 0, now(), NULL, NULL, 'individual'),
-- 등산
('첫 고도 레벨업', '미션에 참가한 이후, 한 번의 등산에서 120분 이상 산에 있으면 완료돼요.', 'duration_minutes', '{"activity_type":"hiking","duration_minutes":120}', 'badge', ARRAY['843ee15b-4fc9-40b8-8cb1-f841f19a4b24']::uuid[], 0, now(), NULL, NULL, 'individual'),
('첫 고도 레벨업 Hard', '미션에 참가한 이후, 한 번의 등산에서 200분 이상 산에 있으면 완료돼요.', 'duration_minutes', '{"activity_type":"hiking","duration_minutes":200}', 'badge', ARRAY['c783d07f-7ca2-47a6-a89b-fd86d5b9bdc4']::uuid[], 0, now(), NULL, NULL, 'individual'),
('첫 고도 레벨업 Ultra', '미션에 참가한 이후, 한 번의 등산에서 300분 이상 산에 있으면 완료돼요.', 'duration_minutes', '{"activity_type":"hiking","duration_minutes":300}', 'badge', ARRAY['1e5133d5-68d9-4fba-8641-8d5ce8cf5899']::uuid[], 0, now(), NULL, NULL, 'individual'),
-- 트레일러닝
('야생의 주자 레벨업', '미션에 참가한 이후, 한 번의 트레일러닝에서 상승고도 600m 이상을 채우면 완료돼요.', 'elevation_gain_m', '{"activity_type":"trail_running","elevation_gain_m":600}', 'badge', ARRAY['4fc54cc7-4691-43b2-b5c6-ea476197398a']::uuid[], 0, now(), NULL, NULL, 'individual'),
('야생의 주자 레벨업 Hard', '미션에 참가한 이후, 한 번의 트레일러닝에서 상승고도 1,500m 이상을 채우면 완료돼요.', 'elevation_gain_m', '{"activity_type":"trail_running","elevation_gain_m":1500}', 'badge', ARRAY['5c94338f-e6e7-49a5-a1a1-7669be1e2f14']::uuid[], 0, now(), NULL, NULL, 'individual'),
('야생의 주자 레벨업 Ultra', '미션에 참가한 이후, 한 번의 트레일러닝에서 상승고도 3,000m 이상을 채우면 완료돼요.', 'elevation_gain_m', '{"activity_type":"trail_running","elevation_gain_m":3000}', 'badge', ARRAY['e9847300-41ed-4e7f-ae73-661dbe3985e7']::uuid[], 0, now(), NULL, NULL, 'individual');

-- ── 3) 5개 대표 트리 Rare~Mythic — 기존 prerequisite_badge_names 제거, 미션보상배지명 1개로 교체 ──

-- 동네 산책러
UPDATE badges SET condition_json = jsonb_set(condition_json, '{prerequisite_badge_names}', '["동네 산책러 레벨업"]'::jsonb)
  WHERE id = '6e1ced9a-d61e-4d0f-813f-3d5a39168b0f'; -- Rare
UPDATE badges SET condition_json = jsonb_set(condition_json, '{prerequisite_badge_names}', '["동네 산책러 레벨업 Hard"]'::jsonb)
  WHERE id = '99c2036e-65ea-4f6e-9dc0-f270cfa07316'; -- Legendary
UPDATE badges SET condition_json = jsonb_set(condition_json, '{prerequisite_badge_names}', '["동네 산책러 레벨업 Ultra"]'::jsonb)
  WHERE id = 'ceb068f9-0456-41b1-8a04-5d546776f23d'; -- Mythic

-- 첫 숨결
UPDATE badges SET condition_json = jsonb_set(condition_json, '{prerequisite_badge_names}', '["첫 숨결 레벨업"]'::jsonb)
  WHERE id = '9d35b7fd-4229-4da9-a668-8cdd532e435c'; -- Rare
UPDATE badges SET condition_json = jsonb_set(condition_json, '{prerequisite_badge_names}', '["첫 숨결 레벨업 Hard"]'::jsonb)
  WHERE id = '60b94e73-0a73-4778-ae46-633bfd133535'; -- Legendary
UPDATE badges SET condition_json = jsonb_set(condition_json, '{prerequisite_badge_names}', '["첫 숨결 레벨업 Ultra"]'::jsonb)
  WHERE id = 'b04bd549-f3b8-4a07-bdba-59f2dfaf1295'; -- Mythic

-- 언덕의 도전자
UPDATE badges SET condition_json = jsonb_set(condition_json, '{prerequisite_badge_names}', '["언덕의 도전자 레벨업"]'::jsonb)
  WHERE id = 'a2d40e6d-27f6-4389-9931-8fe8cce57257'; -- Rare
UPDATE badges SET condition_json = jsonb_set(condition_json, '{prerequisite_badge_names}', '["언덕의 도전자 레벨업 Hard"]'::jsonb)
  WHERE id = '5bcbfb26-5a01-42ec-adc7-6113f199d949'; -- Legendary
UPDATE badges SET condition_json = jsonb_set(condition_json, '{prerequisite_badge_names}', '["언덕의 도전자 레벨업 Ultra"]'::jsonb)
  WHERE id = '64c2ee62-b1e3-4f13-93c9-c37d36068f84'; -- Mythic

-- 첫 고도
UPDATE badges SET condition_json = jsonb_set(condition_json, '{prerequisite_badge_names}', '["첫 고도 레벨업"]'::jsonb)
  WHERE id = 'e0338c09-3968-4cda-a713-b018fb94bd1d'; -- Rare
UPDATE badges SET condition_json = jsonb_set(condition_json, '{prerequisite_badge_names}', '["첫 고도 레벨업 Hard"]'::jsonb)
  WHERE id = 'dc8df6f0-76d1-4fba-b417-cd0e8b4e1da6'; -- Legendary
UPDATE badges SET condition_json = jsonb_set(condition_json, '{prerequisite_badge_names}', '["첫 고도 레벨업 Ultra"]'::jsonb)
  WHERE id = '30057717-4539-4f7d-b53a-16b9d31b7287'; -- Mythic

-- 야생의 주자
UPDATE badges SET condition_json = jsonb_set(condition_json, '{prerequisite_badge_names}', '["야생의 주자 레벨업"]'::jsonb)
  WHERE id = 'c5e9f290-4214-448d-a51a-ebc775295a93'; -- Rare
UPDATE badges SET condition_json = jsonb_set(condition_json, '{prerequisite_badge_names}', '["야생의 주자 레벨업 Hard"]'::jsonb)
  WHERE id = 'b3e619a0-6306-4507-9c42-1dd00feda6a4'; -- Legendary
UPDATE badges SET condition_json = jsonb_set(condition_json, '{prerequisite_badge_names}', '["야생의 주자 레벨업 Ultra"]'::jsonb)
  WHERE id = '9fd3dbd9-1448-45ff-a3c0-0b9a5d4ba36a'; -- Mythic

COMMIT;
