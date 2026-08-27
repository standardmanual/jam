-- 알림 소식 전면 개편 — `notification_type`에 활동 결산 타입 추가 (티켓 20260827_014)
-- 스펙: Service Plan/Specs/PRD/Notification/RECAP_CASEBOOK.md (① 보상 획득 6종 → 결산 1종)
--
-- ⚠️ 이 파일은 /jam-work 규칙에 따라 **작성만** 하고 실행하지 않았다.
--    실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 🚨 실행 순서 제약 — **DDL 먼저 → 코드 배포.**
--    코드를 먼저 배포하면 `create_notification(p_type := 'activity_recap')` 호출이
--    22P02(invalid input value for enum)로 실패한다. 알림 라이브러리는 실패를 삼키고
--    console.error만 남기므로 **화면은 멀쩡한데 보상 소식만 한 건도 안 생기는 무증상**이 된다.
--
-- ℹ️ ALTER TYPE ... ADD VALUE 는 트랜잭션 안에서 실행할 수는 있으나
--    **같은 트랜잭션에서 그 값을 사용할 수 없다**. 이 파일은 단독으로 실행한다.
--
-- ♻️ 재실행 안전(멱등) — IF NOT EXISTS.
--
-- ↩️ 롤백
--    Postgres는 ENUM 값 제거가 안전하지 않다. 되돌려야 하면 코드만 롤백하고
--    'activity_recap' 값은 「예약됐으나 사용하지 않음」으로 남긴다
--    (`following_nearby_drop`·`nearby_drops` 선례).

-- ① 보상 획득 6종(badge_earned·rare_badge_earned·item_badge_earned·checkin_badge_earned·
--    points_earned·first_badge)을 대체하는 **활동 결산** 1종.
--    묶음 단위는 「KST 하루」이며, 활동 2건 이상이면 R11로 한 행에 접힌다.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'activity_recap';

-- ⚠️ `mutual_follow`(#27 맞팔 성립)는 **제거하지 않는다.**
--    코드에서만 생성을 중단하고 TS 타입에서 제외했다. Postgres는 ENUM 값 제거가
--    안전하지 않아 「예약됐으나 사용하지 않음」으로 남긴다.
