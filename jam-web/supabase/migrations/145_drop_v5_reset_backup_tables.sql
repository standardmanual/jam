-- 145: v5 전환(유저 초기화) 직전 안전망으로 만든 백업 테이블 25개 삭제
-- 티켓: 20260906_1409 (v5 전환 뒷정리 4건 — ②)
--
-- 배경: 2026-09-06 유저 서비스 데이터 초기화(20260905_0039) 직전, 되돌릴 유일한 수단으로
-- bak20260906_* 테이블 25개를 만들었다. 초기화가 잘 굴러갔는지(유저가 실제로 동기화해서
-- v5 배지를 정상 획득하는지) 확인될 때까지 지우지 않기로 했다.
--
-- 안정화 확인 (2026-09-08, 실행 직전 조회):
--   user_activity_badges에서 earned_at > '2026-09-06'인 행 25건, 유저 2명, 최근 획득
--   2026-09-07. 유저가 실제로 v5 배지를 정상 획득함을 확인했다 — 되돌릴 필요가 없다고
--   판단해 삭제를 진행한다(사용자 승인 완료).

DROP TABLE IF EXISTS bak20260906_users CASCADE;
DROP TABLE IF EXISTS bak20260906_user_activity_badges CASCADE;
DROP TABLE IF EXISTS bak20260906_user_activity_feed CASCADE;
DROP TABLE IF EXISTS bak20260906_user_family_progress CASCADE;
DROP TABLE IF EXISTS bak20260906_engine_decision_log CASCADE;
DROP TABLE IF EXISTS bak20260906_user_checkin_badge_earns CASCADE;
DROP TABLE IF EXISTS bak20260906_user_mission_participations CASCADE;
DROP TABLE IF EXISTS bak20260906_user_mission_completions CASCADE;
DROP TABLE IF EXISTS bak20260906_user_item_book_slots CASCADE;
DROP TABLE IF EXISTS bak20260906_user_item_book_completions CASCADE;
DROP TABLE IF EXISTS bak20260906_notifications CASCADE;
DROP TABLE IF EXISTS bak20260906_poi_views CASCADE;
DROP TABLE IF EXISTS bak20260906_poi_blocks CASCADE;
DROP TABLE IF EXISTS bak20260906_mission_rank_snapshots CASCADE;
DROP TABLE IF EXISTS bak20260906_point_transactions CASCADE;
DROP TABLE IF EXISTS bak20260906_point_wallets CASCADE;
DROP TABLE IF EXISTS bak20260906_point_treasury CASCADE;
DROP TABLE IF EXISTS bak20260906_user_follows CASCADE;
DROP TABLE IF EXISTS bak20260906_abusing_logs CASCADE;
DROP TABLE IF EXISTS bak20260906_user_drop_state CASCADE;
DROP TABLE IF EXISTS bak20260906_user_combine_state CASCADE;
DROP TABLE IF EXISTS bak20260906_user_shadow_bans CASCADE;
DROP TABLE IF EXISTS bak20260906_trades CASCADE;
DROP TABLE IF EXISTS bak20260906_inventory CASCADE;
DROP TABLE IF EXISTS bak20260906_inventory_items CASCADE;
