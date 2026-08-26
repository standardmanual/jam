/**
 * 앰비언트 드랍 자동 스케줄 시각 + 상호 배제 창 계산
 *
 * Vercel Hobby 플랜은 일 1회 초과 빈도의 cron을 배포 시점에 거부한다(과거 인시던트 —
 * SERVICE_OPERATIONS_20260723_1435). 그래서 "자동 스케줄"은 어드민이 임의 시각을 등록하는
 * 것이 아니라, vercel.json에 고정된 하루 1회 시각에 실행되는 cron을 켜고 끄는 것(auto_enabled)과
 * 그 시각 전후 상호 배제 창(exclusion_window_minutes)을 설정하는 것으로 구성된다.
 *
 * ⚠️ 아래 두 상수는 jam-web/vercel.json의 "/api/cron/ambient-drop" 스케줄과 반드시 함께
 * 바뀌어야 한다. 한쪽만 바꾸면 상호 배제 창이 실제 cron 실행 시각과 어긋난다.
 */
export const AMBIENT_DROP_SCHEDULE_UTC_HOUR = 18
export const AMBIENT_DROP_SCHEDULE_UTC_MINUTE = 0

/**
 * 주어진 시각이 자동 스케줄 시각(UTC) 전후 `windowMinutes`분 이내인지 판정한다.
 * 자정 경계 랩어라운드를 처리한다 (예: 스케줄 00:10, windowMinutes=30일 때 23:55도 포함).
 */
export function isWithinAmbientDropExclusionWindow(now: Date, windowMinutes: number): boolean {
  if (windowMinutes <= 0) return false
  const scheduleMinutesOfDay = AMBIENT_DROP_SCHEDULE_UTC_HOUR * 60 + AMBIENT_DROP_SCHEDULE_UTC_MINUTE
  const nowMinutesOfDay = now.getUTCHours() * 60 + now.getUTCMinutes()
  const diff = Math.abs(nowMinutesOfDay - scheduleMinutesOfDay)
  const wrapped = Math.min(diff, 24 * 60 - diff)
  return wrapped <= windowMinutes
}
