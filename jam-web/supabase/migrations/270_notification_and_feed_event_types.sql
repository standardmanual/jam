-- 270_notification_and_feed_event_types.sql
-- JAM 2.0 퇴장 6-3 5회: 소식 종류 3개와 피드 종류 2개 추가 (티켓 20261021_1249, 운영 로직 15.3·15.4절)
--
-- notification_type enum에 값 3개(suspension_started, suspension_lifted, reward_pending), feed_event_type enum에 값 2개(chapter_up, collection_tier_completed)를
-- 덧붙이기만 한다. 옛 값과 옛 코드는 그대로다. 옛 프로덕션 코드는 이 값들을 모르고 쓰지도 않는다.
-- 옛 알림 화면은 모르는 종류를 `d.notifications.unknown`으로 처리하고, 옛 피드 화면은 모르는 종류를 렌더러 폴백으로 처리한다.
--
-- ⚠️ 새 enum 값은 같은 트랜잭션에서 쓸 수 없다(55P04). 이 파일은 값을 쓰지 않는다. 한 번의 apply_migration 안에서 이 값으로 INSERT·SELECT·함수 생성을 하지 않는다.
--    값을 만드는 곳은 앱 코드다.
--      · suspension_started / suspension_lifted — 어드민 정지·해제가 성공한 뒤 소식 한 건 (lib/suspension/notify.ts)
--      · reward_pending — 미션 보상이 «받지 않은 보상»으로 보류될 때 소식 한 건 (lib/missions/rewards.ts)
--      · chapter_up — 챕터가 2 이상으로 새로 오른 처리의 피드 한 건 (lib/chapter/rise.ts)
--      · collection_tier_completed — 컬렉션 등급을 처음 완성한 처리의 피드 한 건 (lib/chapter/collection.ts)
--
-- 🚨 적용 순서: DDL 먼저 → 코드 배포.
--    코드가 먼저 배포되면 `create_notification(p_type := 'suspension_started')`와 피드 INSERT가 22P02(invalid input value for enum)로 실패한다.
--    알림·피드 라이브러리는 실패를 삼키고 console.error만 남기므로, 화면은 멀쩡한데 새 소식과 새 피드만 한 건도 안 생기는 무증상 실패가 된다.
--
-- ♻️ 재실행 안전(멱등) — IF NOT EXISTS.
--
-- 적용 전 확인 쿼리(읽기 전용 SELECT):
--   SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'notification_type';                                                                   -- 33 (2026-10-22 공용 DB 기준, 생성 타입의 값 개수와 같다)
--   SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'feed_event_type';                                                                     -- 6
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'notification_type'
--      AND enumlabel IN ('suspension_started', 'suspension_lifted', 'reward_pending') ORDER BY enumlabel;    -- 3행
--   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'feed_event_type'
--      AND enumlabel IN ('chapter_up', 'collection_tier_completed') ORDER BY enumlabel;                      -- 2행
--   SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'notification_type';                                                                   -- 36
--   SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'feed_event_type';                                                                     -- 8

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'suspension_started';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'suspension_lifted';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'reward_pending';

ALTER TYPE public.feed_event_type ADD VALUE IF NOT EXISTS 'chapter_up';
ALTER TYPE public.feed_event_type ADD VALUE IF NOT EXISTS 'collection_tier_completed';

-- 되돌림 SQL
-- enum 값은 지울 수 없다(PostgreSQL이 지원하지 않는다). 되돌릴 때는 새 앱 코드가 이 값들을 만들지 않게 하고 값은 쓰지 않은 채로 둔다.
-- 이 값으로 만든 행이 있으면 앱 코드가 모르는 종류로 남지 않도록 먼저 지운다:
-- DELETE FROM public.notifications WHERE type IN ('suspension_started', 'suspension_lifted', 'reward_pending');
-- DELETE FROM public.user_activity_feed WHERE event_type IN ('chapter_up', 'collection_tier_completed');
