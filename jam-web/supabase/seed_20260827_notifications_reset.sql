-- 알림 전량 삭제 + 재생성 (배포 시점 1회성) — 티켓 20260827_014
--
-- ⚠️ 이 파일은 /jam-work 규칙에 따라 **작성만** 하고 실행하지 않았다.
--    실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 🚨 Supabase는 staging·프로덕션 **공용 단일 DB**다. 이 DELETE는 즉시 프로덕션에 반영된다.
--
-- ────────────────────────────────────────────────────────────────────────────
-- 실행 절차 (순서를 지킨다)
-- ────────────────────────────────────────────────────────────────────────────
--   1. `105_notification_recap_type.sql` 적용            (ENUM에 activity_recap 추가)
--   2. 코드 배포 (프로덕션 승격)
--   3. 이 파일 실행                                       (기존 알림 전량 삭제)
--   4. `/api/cron/notifications` 배치를 1회 수동 실행      (상태 기반 소식 재생성)
--
--   3을 2보다 먼저 하면 구 코드가 다시 구 형식 소식을 만들어 삭제 효과가 사라진다.
--
-- ────────────────────────────────────────────────────────────────────────────
-- 왜 전량 삭제인가
-- ────────────────────────────────────────────────────────────────────────────
--   문구·묶음 단위·착지점이 전부 바뀌어 기존 행은 새 렌더러와 계약이 맞지 않는다.
--   특히 ① 보상 획득 6종은 결산 1종으로 재편돼 과거 행이 「레거시 렌더 경로」로만
--   보이고, ②④의 묶음 행은 새 payload 키(target_count 등)가 없어 단건 문구로 남는다.
--
--   · `users.notifications_seen_at`은 **건드리지 않는다** — 재생성된 소식이
--     「새 소식」으로 뜨고 dot이 켜지도록 한다 (사용자 확정).
--   · **결산 소식(①)은 백필하지 않는다** — 다음 동기화부터 새 형식으로 쌓인다.
--     과거 보상 히스토리는 `user_activity_feed`(프로필 피드)에 그대로 남아 있다.
--   · `poi_views`·`mission_rank_snapshots`는 삭제하지 않는다 — 소식이 아니라
--     판정용 계측 데이터다. 지우면 #18 주간 집계와 #23 순위 기준선이 리셋된다.

BEGIN;

-- 삭제 전 분포 확인용 (실행 로그에 남긴다)
--   SELECT type, COUNT(*) FROM public.notifications GROUP BY type ORDER BY 2 DESC;

DELETE FROM public.notifications;

COMMIT;

-- 실행 후 확인
--   SELECT COUNT(*) FROM public.notifications;                     -- 0 이어야 한다
--   SELECT COUNT(*) FROM public.users WHERE notifications_seen_at IS NOT NULL;  -- 변화 없어야 한다
--
-- 이어서 배치 1회 수동 실행:
--   curl "https://j-a-m.app/api/cron/notifications" -H "Authorization: Bearer $CRON_SECRET"
