-- 316 되돌림: 미션 달성 조건 불릿용 지표 라벨 두 개 제거 (티켓 20261104_2148)
-- 이 마이그레이션이 넣은 값과 같은 행만 지운다. 어드민에서 라벨을 고쳤다면 지우지 않는다.

DELETE FROM public.badge_metric_labels
 WHERE (metric_key, label_ko, unit_ko) IN (
   ('drop_item_count', '아이템 배지 드랍', '회'),
   ('pickup_item_count', '아이템 배지 픽업', '회')
 );
