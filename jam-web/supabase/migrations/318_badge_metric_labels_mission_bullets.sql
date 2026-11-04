-- 318: 미션 달성 조건 불릿용 지표 라벨 정리 (티켓 20261104_2321, 상위 20261104_2314)
--
-- 미션 상세의 «달성 조건» 카드가 나머지 미션 모양(체크인 카테고리·옛 유형 activity_count·걷기 미션)까지
-- `badge_metric_labels`의 라벨·단위와 이어 불릿을 만든다. 필요한 라벨 두 행을 더하고, 금지어(UX 라이팅
-- 가이드의 「충족」)를 쓰던 repeat_count 라벨을 바꾼다.
--
-- - `count`(옛 activity_count 유형의 목표 키)는 «활동 횟수 2회», `checkin_category_count`는
--   «기차·지하철 체크인 배지 2개»처럼 앞에 카테고리 이름이 붙는다(코드가 붙인다).
-- - 이미 있는 키는 바꾸지 않는다(ON CONFLICT DO NOTHING).
-- - repeat_count는 시드값 '충족 횟수'일 때만 '활동 횟수'로 바꾼다 — 어드민에서 손본 값은 건드리지 않는다.
--   이 표를 읽는 곳은 미션 상세뿐이다(`getMetricLabels` 호출부 확인). 레지스트리(conditionRegistry.ts)의
--   repeat_count 라벨 '충족 횟수'는 배지 어드민·판정 사유가 쓰므로 이번에 바꾸지 않는다.
-- - 실행은 카리나가 한다(드라이런 → 적용 → 읽기 전용 확인). 실행 전까지 화면은 폴백 문구로 돌아간다.

INSERT INTO public.badge_metric_labels (metric_key, label_ko, unit_ko) VALUES
  ('count', '활동 횟수', '회'),
  ('checkin_category_count', '체크인 배지', '개')
ON CONFLICT (metric_key) DO NOTHING;

UPDATE public.badge_metric_labels
   SET label_ko = '활동 횟수'
 WHERE metric_key = 'repeat_count'
   AND label_ko = '충족 횟수';

-- 되돌림 SQL
-- DELETE FROM public.badge_metric_labels
--  WHERE (metric_key, label_ko, unit_ko) IN (
--    ('count', '활동 횟수', '회'),
--    ('checkin_category_count', '체크인 배지', '개')
--  );
-- UPDATE public.badge_metric_labels
--    SET label_ko = '충족 횟수'
--  WHERE metric_key = 'repeat_count' AND label_ko = '활동 횟수';
