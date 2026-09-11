-- 163: missions에 exposure_mode·exposure_at 컬럼 추가 (티켓 20260912_0139, 미션 노출 옵션)
--
-- 배경:
--   어드민 미션 관리에 노출을 수동 제어하는 수단이 없었다. 서비스 목록 쿼리는
--   ends_at만 필터링해서 아직 시작하지 않은 미션도 목록에 노출되는 상태였다(starts_at <= now
--   조건 부재). 이번 변경으로 "시작일 노출" 모드가 그 갭을 메운다.
--
-- 값:
--   hidden      서비스 어디에도 노출하지 않는다(목록·오늘 카드·참가 API·상세 직접 접근 전부).
--   start_date  missions.starts_at 시각에 노출한다(기존 전체 미션의 기본값).
--   scheduled   exposure_at에 지정한 시각에 노출한다. starts_at과 무관하게 노출 시점만 별도 조정.
--
-- 이 레이어는 게이트 미션 노출 판정(src/lib/missions/visibility.ts, gate_axis/visibility_rule_json
-- 기반)보다 먼저 적용되는 별도 레이어다 — 기존 게이트 판정 로직 자체는 변경하지 않는다.

alter table public.missions
  add column if not exists exposure_mode text not null default 'start_date';

alter table public.missions
  add column if not exists exposure_at timestamptz null;

alter table public.missions
  drop constraint if exists missions_exposure_mode_check;

alter table public.missions
  add constraint missions_exposure_mode_check
  check (exposure_mode in ('hidden', 'start_date', 'scheduled'));

comment on column public.missions.exposure_mode is
  '노출 모드 — hidden(무조건 숨김)/start_date(starts_at 시각 노출)/scheduled(exposure_at 시각 노출). 기본값 start_date.';

comment on column public.missions.exposure_at is
  'exposure_mode=scheduled일 때만 사용하는 노출 시각. 그 외 모드에서는 무시된다.';
