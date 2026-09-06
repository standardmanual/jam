-- 137: 앰비언트 드랍 예약 배포 시각을 어드민이 설정한다 (티켓 20260906_1206)
--
-- 기존: 배포 시각이 코드 상수(AMBIENT_DROP_SCHEDULE_UTC_HOUR = 18)와 vercel.json의
--       "0 18 * * *"로 고정돼 있었다. Vercel Hobby 플랜의 "일 1회 초과 cron 거부" 제약이
--       근거였으나 현재는 Pro 플랜이라 그 제약이 없다.
-- 변경: cron을 매시 정각("0 * * * *")으로 돌리고, 핸들러가 schedule_hour_kst와 지금 시각을
--       비교해 그 시각이 아니면 no-op으로 반환한다.
--
-- schedule_hour_kst: KST 기준 정시(0~23). default 3은 현행 동작(18:00 UTC = KST 03:00)을
--   그대로 유지하기 위한 값이다 — 배포 즉시 배포 시각이 바뀌지 않는다.
-- last_auto_run_on: KST 날짜 기준 마지막 예약 배포일. 매시 실행되므로 하루 두 번 배치되지
--   않도록 조건부 UPDATE로 선점하는 데 쓴다(시스템 전용 — 어드민 화면에서 쓰지 않는다).

alter table ambient_drop_config
  add column if not exists schedule_hour_kst smallint not null default 3,
  add column if not exists last_auto_run_on  date;

alter table ambient_drop_config
  drop constraint if exists ambient_drop_config_schedule_hour_kst_range;

alter table ambient_drop_config
  add constraint ambient_drop_config_schedule_hour_kst_range
  check (schedule_hour_kst between 0 and 23);

comment on column ambient_drop_config.schedule_hour_kst is
  '예약 배포 시각 — KST 기준 정시(0~23). cron은 매시 정각에 호출되고 이 값과 맞을 때만 배치한다.';
comment on column ambient_drop_config.last_auto_run_on is
  '마지막 예약 배포일(KST 날짜). 하루 1회 선점용 시스템 전용 필드 — 어드민이 수정하지 않는다.';
