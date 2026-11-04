-- 317 되돌림: user_sync_events 표와 지표 라벨 «동기화» 제거 (티켓 20261104_2234)
-- ⚠️ 표를 지우면 그때까지 쌓인 동기화 기록이 사라진다(과거 동기화는 되살릴 수 없다).
--    sync_count를 쓰는 코드를 먼저 되돌린 뒤 실행한다. 어드민에서 라벨을 고쳤다면 그 라벨은 지우지 않는다.

DELETE FROM public.badge_metric_labels
 WHERE (metric_key, label_ko, unit_ko) = ('sync_count', '동기화', '회');

DROP TABLE IF EXISTS public.user_sync_events;
