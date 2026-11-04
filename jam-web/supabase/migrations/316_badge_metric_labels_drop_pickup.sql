-- 316: 미션 달성 조건 불릿용 지표 라벨 두 개 추가 (티켓 20261104_2148, 상위 20261104_2146)
--
-- 미션 상세의 «달성 조건» 카드가 조건 키(drop_item_count·pickup_item_count)를 `badge_metric_labels`의
-- 라벨·단위와 이어 「아이템 배지 드랍 1회」 같은 불릿을 만든다. 현재 «드랍하고, 픽업하고, 이어가기» 미션이 쓰는 두 키만 더한다.
--
-- - 확장만 하는 변경이다(행 추가). 옛 모양은 그대로 동작하고, 읽는 곳은 배지 진행 화면과 미션 상세뿐이다.
-- - 이미 있는 키의 라벨은 바꾸지 않는다(ON CONFLICT DO NOTHING) — 배지 진행 화면이 같은 표를 읽는다.
-- - 실행은 카리나가 한다(드라이런 → 적용 → 읽기 전용 확인).

INSERT INTO public.badge_metric_labels (metric_key, label_ko, unit_ko) VALUES
  ('drop_item_count', '아이템 배지 드랍', '회'),
  ('pickup_item_count', '아이템 배지 픽업', '회')
ON CONFLICT (metric_key) DO NOTHING;

-- 되돌림 SQL
-- DELETE FROM public.badge_metric_labels
--  WHERE (metric_key, label_ko, unit_ko) IN (
--    ('drop_item_count', '아이템 배지 드랍', '회'),
--    ('pickup_item_count', '아이템 배지 픽업', '회')
--  );
