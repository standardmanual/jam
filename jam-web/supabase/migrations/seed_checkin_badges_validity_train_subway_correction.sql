-- 기차/지하철 체크인 배지 유효기간 시작일 정정: 2026-09-26 → 2026-09-24
-- (seed_checkin_badges_validity_michelin_train_subway.sql에서 09-26으로 반영했으나,
--  이후 사용자가 목표를 09-24로 확정함. 미슐랭(2026-09-25)은 변경 없음.)

update badges
set valid_from = '2026-09-24 00:00:00+00',
    valid_until = null
where type = 'checkin'
  and category = 'train_subway'
  and deleted_at is null;
