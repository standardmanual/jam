-- 261_notification_type_tribe_changed.sql
-- JAM 2.0 입장: «트라이브가 바뀌었어요» 알림 종류 추가 (티켓 20261021_1247 2회, 운영 로직 2.4절)
--
-- notification_type enum에 값 하나를 덧붙이기만 한다. 옛 값과 옛 코드는 그대로다. 옛 프로덕션 코드는 이 값을 모르고 쓰지도 않는다.
-- 새 enum 값은 같은 트랜잭션에서 쓸 수 없으므로(55P04) 다른 마이그레이션과 나눴고, 이 파일은 값을 쓰지 않는다.
-- 값을 만드는 곳은 앱 코드(lib/admin/user-tribe.ts — 어드민 트라이브 변경이 성공한 뒤 소식 한 건)다. 옛 알림 화면은 모르는 종류를 `d.notifications.unknown`으로 처리한다.
-- 운영자가 트라이브를 바꿨다는 알림이 맞는 기존 종류가 없다(announcement는 투데이 카드 공지다). 티켓 20261021_1249(6-3) 4번의 «트라이브 변경 소식»은 이 값으로 대신한다.
--
-- 적용 전 확인 쿼리(읽기 전용 SELECT):
--   SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'notification_type';                                                                   -- 32 (2026-10-21 공용 DB 기준, 생성 타입의 값 개수와 같다)
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'notification_type' AND enumlabel = 'tribe_changed';   -- 1행
--   SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'notification_type';                                    -- 33

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'tribe_changed';

-- 되돌림 SQL
-- enum 값은 지울 수 없다(PostgreSQL이 지원하지 않는다). 되돌릴 때는 새 앱 코드가 이 값을 만들지 않게 하고 값은 쓰지 않은 채로 둔다.
-- 이 값으로 만든 알림 행이 있으면 앱 코드가 모르는 종류로 남지 않도록 먼저 지운다:
-- DELETE FROM public.notifications WHERE type = 'tribe_changed';
