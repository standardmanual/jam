-- =============================================================================
-- 유저 서비스 데이터 전체 초기화 (티켓 20260905_0039 · 2026-09-06 실행)
-- =============================================================================
--
-- ⚠️ 티켓 원안과 다르다. 원안은 유저를 전원 삭제(27개 테이블 CASCADE)하는 것이었으나,
--    2026-09-06 사용자 결정으로 **계정·Strava 연동·어드민 권한을 남기고** 서비스 데이터만
--    지우는 것으로 바뀌었다. CASCADE가 대신 해주던 일을 전부 명시적으로 지운다.
--
-- ## 남기는 것
--   · public.users 12 · auth.users 12        — 구글 계정 연동(회원 등록) 유지
--   · strava_connections 6                    — Strava 연동 유지. last_synced_at·
--                                                backfill_completed도 그대로 둔다(「최초 동기화 유지」)
--   · strava_activities 879                   — 누적 조건 평가·백필의 유일한 기반
--   · users.is_admin                          — 어드민 권한 유지
--   · 배지 정의 v5 630종 · POI · 미션 정의 · custody_events 257
--
-- ## 어드민 권한이 어떻게 유지되는가 (실측 2026-09-06)
--   판정은 `ADMIN_EMAILS` 환경변수 화이트리스트 **OR** `users.is_admin`이다
--   (`src/lib/admin/auth.ts`). 실제 상태:
--     · yonzich.official@gmail.com — users.is_admin = true  (DB 컬럼)
--     · sihyunrr@gmail.com         — users.is_admin = false (ADMIN_EMAILS 환경변수)
--   유저 행을 남기고 is_admin을 건드리지 않으므로 **두 계정 모두 영향받지 않는다.**
--
-- ## 결정 ①-C — 활동은 남기되 가입 앵커를 오늘로 옮긴다
--   배지만 지우고 활동 879건을 남기면, 다음 동기화 때 누적 조건이 **가입 앵커 이후
--   활동 214건**으로 평가돼 v5 배지가 즉시 대량 재발급된다(초기화가 무의미해진다).
--   그렇다고 활동을 지우면 백필 기반이 사라진다(티켓이 「절대 지우지 않는다」로 못박음).
--   그래서 `users.created_at`을 지금으로 옮겨 **앵커 이후 활동을 0건으로** 만든다.
--   `getSignupAnchorDate`(src/lib/strava/activity-history.ts)가 이 컬럼을 읽는다.
--   → 활동 이력은 보존되고, 누적은 오늘부터 다시 쌓인다. 티켓의 「모두 최초 가입자
--     경험으로 다시 시작」과 같은 결과다. 대가는 프로필 가입일이 오늘로 바뀌는 것.
--
-- ## 결정 ②-A — 아이템은 Orphaned로 전이시킨다 (직접 삭제하지 않는다)
--   `custody_events.inventory_item_id`가 CASCADE라 `inventory_items`를 직접 지우면
--   보관 이력 257건이 함께 사라진다. 티켓은 이 이력을 「지우지 않는다」로 못박았다
--   (고아 판정 기반이자 유저명 스냅샷을 담은 append-only 이력).
--   `inventory_items.inventory_id`는 SET NULL이므로 **`inventory`만 지우면**
--   아이템 429개가 설계된 Orphaned 상태로 전이된다.
--   → 이후 어드민 「미소유 아이템배지 현황」(/admin/item-badges/orphaned)에서 일괄 폐기한다.
--
-- ## 지우지 않는 것 — 이유가 있다
--   · strava_activities  — 위 ①-C 참조
--   · custody_events     — 위 ②-A 참조
--   · poi_drops 264      — 「드랍한 사람이 탈퇴해도 미픽업 드랍은 사라지지 않는다」가 정책
--                          (migrations/108). 유저를 남기므로 더더욱 건드릴 이유가 없다
--   · 체크인 배지 정의 1,789 · POI 1,795 · 아이템 배지 정의 1,825
--
-- ## point_treasury 컬럼명
--   티켓 초안은 `total_burned`로 적었으나 **실제 컬럼은 `total_reclaimed`** 다.
--   실행 전 실측으로 확인했다.
--
-- ## 실행 방식
--   DML 전체를 단일 DO 블록에 넣어 원자적으로 실행한다 — MCP에는 트랜잭션 제어가 없어
--   문장을 나누면 중간 실패 시 절반만 적용된 상태가 남는다. DO 블록은 한 문장이라
--   실패하면 통째로 롤백된다.
-- =============================================================================


-- ── Phase 0. 백업 ────────────────────────────────────────────────────────────
-- 되돌릴 수 없는 작업이므로 지우는 것 전부를 먼저 복사한다.
CREATE TABLE IF NOT EXISTS bak20260906_users                      AS SELECT * FROM public.users;
CREATE TABLE IF NOT EXISTS bak20260906_user_activity_badges       AS SELECT * FROM user_activity_badges;
CREATE TABLE IF NOT EXISTS bak20260906_user_activity_feed         AS SELECT * FROM user_activity_feed;
CREATE TABLE IF NOT EXISTS bak20260906_user_family_progress       AS SELECT * FROM user_family_progress;
CREATE TABLE IF NOT EXISTS bak20260906_engine_decision_log        AS SELECT * FROM engine_decision_log;
CREATE TABLE IF NOT EXISTS bak20260906_user_checkin_badge_earns   AS SELECT * FROM user_checkin_badge_earns;
CREATE TABLE IF NOT EXISTS bak20260906_user_mission_participations AS SELECT * FROM user_mission_participations;
CREATE TABLE IF NOT EXISTS bak20260906_user_mission_completions   AS SELECT * FROM user_mission_completions;
CREATE TABLE IF NOT EXISTS bak20260906_user_item_book_slots       AS SELECT * FROM user_item_book_slots;
CREATE TABLE IF NOT EXISTS bak20260906_user_item_book_completions AS SELECT * FROM user_item_book_completions;
CREATE TABLE IF NOT EXISTS bak20260906_notifications              AS SELECT * FROM notifications;
CREATE TABLE IF NOT EXISTS bak20260906_poi_views                  AS SELECT * FROM poi_views;
CREATE TABLE IF NOT EXISTS bak20260906_poi_blocks                 AS SELECT * FROM poi_blocks;
CREATE TABLE IF NOT EXISTS bak20260906_mission_rank_snapshots     AS SELECT * FROM mission_rank_snapshots;
CREATE TABLE IF NOT EXISTS bak20260906_point_transactions         AS SELECT * FROM point_transactions;
CREATE TABLE IF NOT EXISTS bak20260906_point_wallets              AS SELECT * FROM point_wallets;
CREATE TABLE IF NOT EXISTS bak20260906_point_treasury             AS SELECT * FROM point_treasury;
CREATE TABLE IF NOT EXISTS bak20260906_user_follows               AS SELECT * FROM user_follows;
CREATE TABLE IF NOT EXISTS bak20260906_abusing_logs               AS SELECT * FROM abusing_logs;
CREATE TABLE IF NOT EXISTS bak20260906_user_drop_state            AS SELECT * FROM user_drop_state;
CREATE TABLE IF NOT EXISTS bak20260906_user_combine_state         AS SELECT * FROM user_combine_state;
CREATE TABLE IF NOT EXISTS bak20260906_user_shadow_bans           AS SELECT * FROM user_shadow_bans;
CREATE TABLE IF NOT EXISTS bak20260906_trades                     AS SELECT * FROM trades;
CREATE TABLE IF NOT EXISTS bak20260906_inventory                  AS SELECT * FROM inventory;
-- 아이템 자체는 지우지 않지만 inventory_id가 NULL로 바뀌므로 「어느 인벤토리 소속이었는지」를 남긴다.
CREATE TABLE IF NOT EXISTS bak20260906_inventory_items            AS SELECT * FROM inventory_items;


-- ── Phase 1~4. 초기화 (원자적) ───────────────────────────────────────────────
DO $$
DECLARE
  v_users int;
BEGIN
  -- Phase 1. 배지·진행·이력
  DELETE FROM user_activity_badges;
  DELETE FROM user_checkin_badge_earns;
  DELETE FROM user_family_progress;
  DELETE FROM user_activity_feed;
  DELETE FROM engine_decision_log;

  -- Phase 2. 미션·아이템북·소셜·알림·POI 상호작용
  DELETE FROM user_mission_completions;
  DELETE FROM user_mission_participations;
  DELETE FROM mission_rank_snapshots;
  DELETE FROM user_item_book_completions;
  DELETE FROM user_item_book_slots;   -- inventory_items.slotted_in 은 SET NULL 로 풀린다
  DELETE FROM user_follows;
  DELETE FROM notifications;
  DELETE FROM poi_views;
  DELETE FROM poi_blocks;
  DELETE FROM abusing_logs;
  DELETE FROM user_shadow_bans;
  DELETE FROM user_drop_state;
  DELETE FROM user_combine_state;
  DELETE FROM trades;

  -- Phase 3. 포인트 — 지갑·거래·전역 장부를 **함께** 0으로 만든다.
  -- 셋 중 하나만 건드리면 잔액 드리프트가 생긴다(티켓 경고). 전부 비우므로 정합이 맞는다.
  DELETE FROM point_transactions;
  DELETE FROM point_wallets;
  UPDATE point_treasury SET total_minted = 0, total_reclaimed = 0, updated_at = now();

  -- Phase 4-A. 인벤토리 — 아이템은 지우지 않고 Orphaned 로 전이시킨다 (결정 ②-A)
  DELETE FROM inventory;

  -- Phase 4-B. 가입 앵커를 오늘로 (결정 ①-C)
  UPDATE public.users SET created_at = now();
  GET DIAGNOSTICS v_users = ROW_COUNT;

  RAISE NOTICE '초기화 완료 — 가입 앵커를 옮긴 유저 %명', v_users;
END $$;
