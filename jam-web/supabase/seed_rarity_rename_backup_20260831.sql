-- ============================================================
-- [1/3] 등급명 변경 실행 전 백업 스냅샷 — 티켓 20260831_1115
--
-- 실행 순서
--   1) 이 파일 (백업)
--   2) migrations/115_rename_rarity_epic_mystic.sql (enum·컬럼 rename)
--   3) seed_rarity_rename_data_20260831.sql (과거 데이터·컨텐츠 문구 정정)
--
-- enum RENAME VALUE는 역방향 rename으로 되돌릴 수 있지만, JSONB(metadata·payload)
-- 문자열 치환과 컨텐츠 문구 UPDATE는 되돌리기 어렵다. 원본을 스냅샷으로 남긴다.
-- 검증이 끝나면 스냅샷 테이블은 수동으로 DROP 한다.
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS public.backup_20260831_badges;
DROP TABLE IF EXISTS public.backup_20260831_user_activity_feed;
DROP TABLE IF EXISTS public.backup_20260831_engine_decision_log;
DROP TABLE IF EXISTS public.backup_20260831_missions;
DROP TABLE IF EXISTS public.backup_20260831_today_cards;

-- badges.rarity는 badge_rarity enum이다. CREATE TABLE AS로 그대로 뜨면 스냅샷도 같은
-- 타입을 참조해 RENAME VALUE를 따라 함께 바뀐다 → TEXT로 캐스팅해 "변경 전 문자열"을 고정한다.
CREATE TABLE public.backup_20260831_badges AS
  SELECT id, name, rarity::text AS rarity_text, description, type::text AS type_text, deleted_at
  FROM public.badges;

CREATE TABLE public.backup_20260831_user_activity_feed AS
  SELECT id, user_id, event_type::text AS event_type_text, metadata, event_at, created_at
  FROM public.user_activity_feed;

CREATE TABLE public.backup_20260831_engine_decision_log AS
  SELECT id, user_id, engine, event, payload, created_at
  FROM public.engine_decision_log;

CREATE TABLE public.backup_20260831_missions AS
  SELECT id, title, description, mission_type, condition_json, gated_badge_id
  FROM public.missions;

CREATE TABLE public.backup_20260831_today_cards AS
  SELECT id, title, subtitle, body_markdown, template_type, is_active
  FROM public.today_cards;

COMMIT;

-- 확인용
-- SELECT 'badges' AS t, count(*) FROM public.backup_20260831_badges
-- UNION ALL SELECT 'feed',        count(*) FROM public.backup_20260831_user_activity_feed
-- UNION ALL SELECT 'engine_log',  count(*) FROM public.backup_20260831_engine_decision_log
-- UNION ALL SELECT 'missions',    count(*) FROM public.backup_20260831_missions
-- UNION ALL SELECT 'today_cards', count(*) FROM public.backup_20260831_today_cards;
