-- 317: user_sync_events 신규 표 + 지표 라벨 «동기화» 한 개 (티켓 20261104_2234, 상위 20261104_2146 2회차)
--
-- 배경:
--   미션 전용 조건 키 `sync_count`(참가한 뒤 미션 기간 안의 동기화 횟수)를 세려면 동기화 한 번에 한 줄을 남기는 기록이 필요하다.
--   `user_daily_sync_counts`는 유저·날짜별 카운터 한 행이라 마지막 동기화 시각(updated_at)만 남아, 참가 시각 이후의 횟수를
--   정확히 셀 수 없다(참가한 날 이전의 동기화가 같은 행에 섞인다).
--
--   ① user_sync_events — 새 활동을 받은 동기화 1회 = 1행. 코드(`processFetchedActivities`)가 미션 판정(`checkMissions`) 앞에서 남긴다.
--      과거 동기화는 채우지 않는다(참가한 뒤의 기록만 세므로 필요 없다).
--      RLS를 켜고 정책을 만들지 않는다 — service_role 전용(200 `user_combine_success_logs`와 같은 방식).
--   ② badge_metric_labels에 `sync_count` = 동기화 / 회 (미션 달성 조건 불릿용). 이미 있으면 건드리지 않는다.
--
-- 확장만 하는 변경이다(새 표·새 행). 옛 코드는 이 표를 모르고 그대로 동작한다.
-- 실행 순서: 코드 배포보다 먼저 실행한다. 코드가 먼저 배포되면 기록 삽입이 실패한다(오류는 삼켜져 동기화는 계속되지만 그 사이의 동기화는 기록되지 않는다).
-- 재실행 가능(idempotent): CREATE TABLE/INDEX IF NOT EXISTS + ON CONFLICT DO NOTHING.
-- 실행은 카리나가 한다(롤백 드라이런 → 적용 → 읽기 전용 확인).

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_sync_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_sync_events_user_synced_idx
  ON public.user_sync_events (user_id, synced_at);

-- RLS: service_role 전용. 정책을 만들지 않으면 anon/authenticated는 전부 거부된다.
ALTER TABLE public.user_sync_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_sync_events IS
  '새 활동을 받은 동기화 1회당 1행(티켓 20261104_2234). 미션 전용 조건 sync_count(참가한 뒤 기간 안의 동기화 횟수)의 원천이다. 과거 동기화는 채우지 않는다.';

INSERT INTO public.badge_metric_labels (metric_key, label_ko, unit_ko) VALUES
  ('sync_count', '동기화', '회')
ON CONFLICT (metric_key) DO NOTHING;

COMMIT;

-- 되돌림 SQL
-- DELETE FROM public.badge_metric_labels
--  WHERE (metric_key, label_ko, unit_ko) = ('sync_count', '동기화', '회');
-- -- ⚠️ 표를 지우면 그때까지 쌓인 동기화 기록이 사라진다(과거 동기화는 되살릴 수 없다). 코드를 되돌린 뒤, 기록이 쌓이기 전에만 지운다.
-- DROP TABLE IF EXISTS public.user_sync_events;
