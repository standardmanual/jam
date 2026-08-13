-- 티켓 20260813_001 — 종목별 대표배지 레벨업 미션 게이팅 도입에 따른 소급 회수
--
-- 5개 대표 배지 트리(동네 산책러/첫 숨결/언덕의 도전자/첫 고도/야생의 주자)의
-- Rare 이상 등급을 앞으로는 미션 완료로만 받을 수 있도록 바꾸면서, 기존 크로스게이트로
-- 이미 발급된 건은 전부 회수(삭제)하기로 결정함(2026-08-13, 사용자 확정).
--
-- 실행 시점 기준 실제 대상 5건 확인됨(user_activity_badges):
--   9d35b7fd-4229-4da9-a668-8cdd532e435c (첫 숨결 Rare)   × user 25782789-2840-436c-827e-7ec90f898020
--   9d35b7fd-4229-4da9-a668-8cdd532e435c (첫 숨결 Rare)   × user 430f2d0a-10bf-4fb5-a241-49524f21442a
--   e0338c09-3968-4cda-a713-b018fb94bd1d (첫 고도 Rare)   × user 430f2d0a-10bf-4fb5-a241-49524f21442a
--   9d35b7fd-4229-4da9-a668-8cdd532e435c (첫 숨결 Rare)   × user 3649ed39-2be2-402e-82ae-41e0cd328105
--   dc8df6f0-76d1-4fba-b417-cd0e8b4e1da6 (첫 고도 Legendary) × user 430f2d0a-10bf-4fb5-a241-49524f21442a
--
-- ⚠️ 되돌릴 수 없는 삭제 SQL입니다. Claude는 플랫폼 안전 규칙상 이 파일을 직접
-- 실행하지 않습니다 — Supabase SQL 편집기 또는 본인 터미널에서 직접 실행해 주세요.
-- 실행 전 아래 SELECT로 대상이 여전히 위 5건과 일치하는지 재확인 권장.

-- 실행 전 확인용
-- SELECT user_id, badge_id, earned_at FROM user_activity_badges
-- WHERE (user_id, badge_id) IN (
--   ('25782789-2840-436c-827e-7ec90f898020', '9d35b7fd-4229-4da9-a668-8cdd532e435c'),
--   ('430f2d0a-10bf-4fb5-a241-49524f21442a', '9d35b7fd-4229-4da9-a668-8cdd532e435c'),
--   ('430f2d0a-10bf-4fb5-a241-49524f21442a', 'e0338c09-3968-4cda-a713-b018fb94bd1d'),
--   ('3649ed39-2be2-402e-82ae-41e0cd328105', '9d35b7fd-4229-4da9-a668-8cdd532e435c'),
--   ('430f2d0a-10bf-4fb5-a241-49524f21442a', 'dc8df6f0-76d1-4fba-b417-cd0e8b4e1da6')
-- );

DELETE FROM user_activity_badges
WHERE (user_id, badge_id) IN (
  ('25782789-2840-436c-827e-7ec90f898020', '9d35b7fd-4229-4da9-a668-8cdd532e435c'),
  ('430f2d0a-10bf-4fb5-a241-49524f21442a', '9d35b7fd-4229-4da9-a668-8cdd532e435c'),
  ('430f2d0a-10bf-4fb5-a241-49524f21442a', 'e0338c09-3968-4cda-a713-b018fb94bd1d'),
  ('3649ed39-2be2-402e-82ae-41e0cd328105', '9d35b7fd-4229-4da9-a668-8cdd532e435c'),
  ('430f2d0a-10bf-4fb5-a241-49524f21442a', 'dc8df6f0-76d1-4fba-b417-cd0e8b4e1da6')
);
