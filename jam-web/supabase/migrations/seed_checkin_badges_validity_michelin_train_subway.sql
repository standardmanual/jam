-- 체크인 배지 유효기간(활성/비활성 조건) 설정 — 티켓 20260912_1121 후속 데이터 반영
-- 미슐랭 POI 연결 체크인 배지: 2026-09-25부터 상시(valid_until 없음)
-- 기차/지하철 카테고리 체크인 배지: 2026-09-26부터 상시(valid_until 없음)
--
-- 대상 확인 (실행 전 조회 결과):
--   category='michelin'     : 42건, 전부 deleted_at IS NULL, created_at 2026-09-12 01:45:41 배치
--   category='train_subway' : 18건, 전부 deleted_at IS NULL
--
-- valid_from을 이 시점부터로 설정하면 badge-engine 발급 판정과 체크인 배지 지도 마커 노출
-- (show_on_map과 AND 조건, 티켓 20260912_1121) 양쪽에 동일하게 적용된다.

update badges
set valid_from = '2026-09-25 00:00:00+00',
    valid_until = null
where type = 'checkin'
  and category = 'michelin'
  and deleted_at is null;

update badges
set valid_from = '2026-09-26 00:00:00+00',
    valid_until = null
where type = 'checkin'
  and category = 'train_subway'
  and deleted_at is null;
