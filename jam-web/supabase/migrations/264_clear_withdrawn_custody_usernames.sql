-- 264_clear_withdrawn_custody_usernames.sql
-- JAM 2.0 퇴장: 이미 지워진 유저의 옛 이름 스냅샷을 이력에서 지운다 (티켓 20261021_1249 2회, 운영 로직 17.2절)
--
-- 배경: custody_events의 from_username·to_username·actor_username은 마이그레이션 108이 박제한 이름 스냅샷이다. 유저를 지우면 짝 *_user_id는 SET NULL로 비워지지만
--   이름은 남는다. 운영 로직 17.2는 «지울 때 이력의 이름 칸을 비운다»이고, 마이그레이션 263의 준비 함수(prepare_account_deletion)는 앞으로 지우는 유저의 이름만 비운다.
--   263 이전에 이미 지워진 유저의 이름은 *_user_id가 비어 있어 그 함수가 찾지 못한다. 이 마이그레이션이 그 옛 이름을 한 번 정리한다.
-- 대상: *_user_id가 NULL인데 짝 *_username이 값을 가진 칸. 2026-10-21 읽기 전용 조사로 13건이다(Slot.actor 7, Pickup.from 1, Orphan.from 5).
-- 하는 일: 위 칸의 *_username을 NULL로 바꾼다. 데이터 정리 한 번이고, 이미 비어 있는 칸은 건드리지 않아 다시 실행해도 안전하다.
-- 바꾸지 않는 것: 표의 제약(custody_events_event_type_check)·외래키·트리거·함수. *_user_id가 값을 가진(아직 살아 있는 유저의) 행의 이름도 건드리지 않는다.
-- 화면: 이름 칸이 비어도 어드민 이력은 필수 칸의 *_user_id가 NULL이면 탈퇴 표시를 그린다(lib/account/withdrawn-actor.ts). 이 마이그레이션 전후로 화면이 같다
--   (앱은 *_user_id가 NULL인 칸의 이름 문자열을 값이 있어도 무시한다).
-- 되돌림: 없다. 지우는 것이 목적이고 지운 이름은 이 표 안에 다른 사본이 없다. 가린 이름을 되살리려면 백업에서 복원해야 한다. 실행 전 확인 SELECT의 결과를 기록해 둔다.
--
-- 실행 전 확인 쿼리(읽기 전용 SELECT) — 13행이 나와야 한다. 다르면 멈추고 보고한다:
--   SELECT event_type, 'from' AS slot, count(*) FROM public.custody_events WHERE from_user_id IS NULL AND from_username IS NOT NULL GROUP BY event_type
--   UNION ALL
--   SELECT event_type, 'to', count(*) FROM public.custody_events WHERE to_user_id IS NULL AND to_username IS NOT NULL GROUP BY event_type
--   UNION ALL
--   SELECT event_type, 'actor', count(*) FROM public.custody_events WHERE actor_user_id IS NULL AND actor_username IS NOT NULL GROUP BY event_type;
--                                                                                      -- 예상: Slot/actor 7, Pickup/from 1, Orphan/from 5 (합 13)
--   SELECT count(*) FROM public.custody_events
--    WHERE (from_user_id IS NULL AND from_username IS NOT NULL)
--       OR (to_user_id IS NULL AND to_username IS NOT NULL)
--       OR (actor_user_id IS NULL AND actor_username IS NOT NULL);                    -- 예상: 13
--
-- 실행 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT count(*) FROM public.custody_events
--    WHERE (from_user_id IS NULL AND from_username IS NOT NULL)
--       OR (to_user_id IS NULL AND to_username IS NOT NULL)
--       OR (actor_user_id IS NULL AND actor_username IS NOT NULL);                    -- 0
--   SELECT count(*) FROM public.custody_events;                                      -- 실행 전과 같다(행은 지우지 않는다. 1회 조사 시점 1,846건)
--   SELECT count(*) FROM public.custody_events
--    WHERE from_user_id IS NOT NULL AND from_username IS NOT NULL;                    -- 실행 전과 같다(살아 있는 유저의 이름은 그대로)

UPDATE public.custody_events
   SET from_username  = CASE WHEN from_user_id  IS NULL THEN NULL ELSE from_username  END,
       to_username    = CASE WHEN to_user_id    IS NULL THEN NULL ELSE to_username    END,
       actor_username = CASE WHEN actor_user_id IS NULL THEN NULL ELSE actor_username END
 WHERE (from_user_id  IS NULL AND from_username  IS NOT NULL)
    OR (to_user_id    IS NULL AND to_username    IS NOT NULL)
    OR (actor_user_id IS NULL AND actor_username IS NOT NULL);

-- 되돌림 SQL 없음 — 지운 이름을 되살릴 사본이 이 표에 없다. 되돌려야 하면 실행 전 백업에서 해당 행의 *_username만 복원한다.
