-- 318 되돌림: 미션 달성 조건 불릿용 지표 라벨 정리를 원상태로 (티켓 20261104_2321)
-- 이 마이그레이션이 넣은 값과 같은 행만 지우고, repeat_count는 '활동 횟수'일 때만 '충족 횟수'로 되돌린다.
-- 어드민에서 라벨을 고쳤다면 건드리지 않는다.

DELETE FROM public.badge_metric_labels
 WHERE (metric_key, label_ko, unit_ko) IN (
   ('count', '활동 횟수', '회'),
   ('checkin_category_count', '체크인 배지', '개')
 );

UPDATE public.badge_metric_labels
   SET label_ko = '충족 횟수'
 WHERE metric_key = 'repeat_count'
   AND label_ko = '활동 횟수';
