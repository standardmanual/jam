-- 320_capsule_receive_blocked.sql의 되돌림 — 새 함수만 지운다(다른 객체는 건드리지 않았다).
-- 먼저 jam-web의 sync.ts가 이 함수를 부르지 않는 코드로 돌아가 있어야 한다(없는 함수를 부르면 동기화가 실패한다).
DROP FUNCTION IF EXISTS public.capsule_receive_blocked(uuid);
