-- 256: 온보딩 완료 배지의 이름을 '퀘스트 클리어'에서 'JAM!'으로 바꾼다
-- 티켓 20261021_1248(JAM2 퀘스트 개편 6-2, 사용자 결정 (다)) — 작성만, 실행은 롤백 실측과 사용자 승인 뒤 카리나가 처리
--
-- 배경:
--   운영 로직 2.2절: 유저 화면에는 이 과제를 가리키는 용어(퀘스트)를 보여 주지 않는다. 그래서 완료 배지의 이름은 '퀘스트 클리어'가 아니라 「JAM!」이다.
--   마이그레이션 196이 이름 '퀘스트 클리어', 설명 '퀘스트를 모두 마친 증표입니다.'로 넣은 행 하나를 고친다. 데이터 한 행의 이름과 설명만 바뀐다.
--
-- 지급 로직이 깨지지 않는 근거 (코드 확인):
--   - 지급 코드(`grantOnboardingQuestReward`, jam-web/src/lib/onboarding-quest/completion.ts)는 배지를 **이름이 아니라 고정 id**
--     (`ONBOARDING_COMPLETION_BADGE_ID` = cd20f271-9445-42cc-ac51-d8a96b25e1c3, config.ts)로 찾는다. 이름은 피드 기록(`badge_name`)에 옮겨 적는 값일 뿐이다.
--   - 이 행을 이름으로 대조하는 코드는 없다(src 전체에서 '퀘스트 클리어'는 주석·시험 데이터에만 남아 있다).
--   - 마이그레이션 244가 끄지 않고 유지한 배지 목록은 `family_key = 'onboarding:complete'`로 잡으며 이름을 보지 않는다.
--   - `badges.name`에는 UNIQUE 제약이 없다(마이그레이션 118 주석 확인).
--
-- 바꾸는 값:
--   - name:        '퀘스트 클리어' → 'JAM!'
--   - description: '퀘스트를 모두 마친 증표입니다.' → 'JAM!의 첫 단계를 모두 마친 증표입니다.'
--                  (설명이 «퀘스트»를 말할 때만. 배지 설명문은 -습니다체다 — UX 라이팅 가이드 2.1절 예외)
--   - 이미지·포인트(100)·등급(Common)·조건(mission_reward)·family_key·admin_category는 그대로다.
--
-- 안전장치:
--   - id로 한 행만 고르고, 이름이 아직 '퀘스트 클리어'이거나 설명에 «퀘스트»가 있을 때만 바꾼다. 어드민에서 이미 손으로 고쳤다면 그 값은 덮어쓰지 않는다.
--   - 이름과 설명을 각각 현재 값을 보고 바꾼다(CASE) — 한쪽만 이미 고쳐졌어도 나머지 한쪽만 바뀐다.
--   - 재실행해도 두 번째부터는 조건에 걸리는 행이 없어 아무 일도 일어나지 않는다(멱등).
--   - 이미 이 배지를 받은 유저는 0명이다(티켓 20261021_1248 조사, 공용 DB 읽기). 받은 기록(`user_activity_badges`)은 건드리지 않는다.
--
-- 영향 범위 참고:
--   - 공용 DB라 옛 프로덕션 코드도 같은 이름으로 보인다. 옛 코드는 이름을 비교하지 않으므로 동작은 같고 표시만 바뀐다.
--   - 배지 상세의 획득 조건 문장은 `mission_reward` 배지에 이름을 끼워 «'{이름}' 미션을 완료하면 받을 수 있는 배지예요.»로 고정이다
--     (jam-web/src/lib/badgeConditionText.ts). 이름이 바뀌면 그 문장도 «'JAM!' 미션을…»으로 바뀐다 — 이 티켓 범위 밖이라 코드는 고치지 않았다.
--
-- 적용 전 확인 (읽기 전용 SELECT):
--   SELECT id, name, description, point_reward, admin_category, family_key
--     FROM public.badges WHERE id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3';        -- 1행, name = '퀘스트 클리어'
--   SELECT count(*) FROM public.user_activity_badges
--    WHERE badge_id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3';                       -- 0
--
-- 적용 후 확인 (읽기 전용 SELECT):
--   SELECT name, description, point_reward FROM public.badges
--    WHERE id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3';                             -- 'JAM!' / 'JAM!의 첫 단계를 모두 마친 증표입니다.' / 100
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 롤백 실측과 사용자 승인 뒤 카리나가 처리한다.

BEGIN;

UPDATE public.badges
   SET name = CASE WHEN name = '퀘스트 클리어' THEN 'JAM!' ELSE name END,
       description = CASE
         WHEN description LIKE '%퀘스트%' THEN 'JAM!의 첫 단계를 모두 마친 증표입니다.'
         ELSE description
       END
 WHERE id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3'
   AND (name = '퀘스트 클리어' OR description LIKE '%퀘스트%');

COMMIT;

-- 되돌림 SQL
-- 마이그레이션 196이 넣은 원래 값으로 되돌린다. 이름이 지금 'JAM!'일 때만 이름을, 설명이 지금 이 파일의 값일 때만 설명을 되돌려
-- 그 사이 어드민에서 고친 값을 덮어쓰지 않는다.
-- UPDATE public.badges
--    SET name = CASE WHEN name = 'JAM!' THEN '퀘스트 클리어' ELSE name END,
--        description = CASE
--          WHEN description = 'JAM!의 첫 단계를 모두 마친 증표입니다.' THEN '퀘스트를 모두 마친 증표입니다.'
--          ELSE description
--        END
--  WHERE id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3';
