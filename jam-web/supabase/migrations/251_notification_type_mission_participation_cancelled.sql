-- 251_notification_type_mission_participation_cancelled.sql
-- JAM 2.0 미션 소식: «트라이브가 바뀌어 미션 참가가 취소됐어요» 알림 종류 추가 (티켓 20261019_1313, 운영 로직 13.2절)
--
-- notification_type enum에 값 하나를 덧붙이기만 한다. 옛 값과 옛 코드는 그대로다. 옛 프로덕션 코드는 이 값을 모르고 쓰지도 않는다.
-- 새 enum 값은 같은 트랜잭션에서 쓸 수 없으므로(55P04) 다른 마이그레이션과 나눴고, 이 파일은 값을 쓰지 않는다.
-- 값을 만드는 곳은 앱 코드(mission_cancel_for_tribe_change가 돌려준 목록으로 소식 생성)이고, 그 호출 연결은 묶음 6이다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'notification_type' AND enumlabel = 'mission_participation_cancelled';   -- 1행

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'mission_participation_cancelled';

-- 되돌림 SQL
-- enum 값은 지울 수 없다(PostgreSQL이 지원하지 않는다). 되돌릴 때는 새 앱 코드가 이 값을 만들지 않게 하고 값은 쓰지 않은 채로 둔다.
-- 이 값으로 만든 알림 행이 있으면 앱 코드가 모르는 종류로 남지 않도록 먼저 지운다:
-- DELETE FROM public.notifications WHERE type = 'mission_participation_cancelled';
