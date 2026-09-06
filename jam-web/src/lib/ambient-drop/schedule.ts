/**
 * 앰비언트 드랍 예약 배포 시각(KST) + 상호 배제 창 계산
 *
 * 배포 시각은 어드민이 `ambient_drop_config.schedule_hour_kst`(KST 정시 0~23)로 정한다.
 * Vercel cron 표현식은 동적일 수 없으므로 `/api/cron/ambient-drop`은 매시 정각
 * ("0 * * * *", jam-web/vercel.json)에 호출되고, 핸들러가 지금이 설정 시각인지 판정해
 * 아닐 때 즉시 no-op으로 반환한다.
 *
 * KST↔UTC 변환은 직접 하지 않고 공용 헬퍼(`@/lib/notifications/kst`)를 쓴다 — 오프셋 계산이
 * 여러 곳에 복제되면 어긋난다.
 * (티켓 20260906_1206. 이전에는 코드 상수 AMBIENT_DROP_SCHEDULE_UTC_HOUR=18로 고정돼 있었고,
 *  근거였던 "Vercel Hobby 플랜 일 1회 cron 제약"은 Pro 플랜 전환으로 사라졌다.)
 */
import { kstHour } from '@/lib/notifications/kst'

const MINUTES_PER_DAY = 24 * 60

/** 배포 시각으로 고를 수 있는 KST 정시 목록 (0~23) */
export const AMBIENT_DROP_SCHEDULE_HOURS_KST = Array.from({ length: 24 }, (_, h) => h)

/** 0~23 정수인지 — 어드민 입력 검증용 */
export function isValidScheduleHourKst(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23
}

/**
 * 주어진 시각의 KST 기준 자정 이후 경과 분(0~1439).
 * KST는 정시 오프셋(UTC+9)이라 분 값은 UTC와 같다 — 시(hour)만 공용 헬퍼로 옮긴다.
 */
function kstMinutesOfDay(now: Date): number {
  return (kstHour(now) * 60 + now.getUTCMinutes()) % MINUTES_PER_DAY
}

/** 지금이 어드민이 정한 예약 배포 시각(KST 정시)인지 — 매시 cron이 배치 여부를 판정한다 */
export function isAmbientDropScheduledHour(now: Date, scheduleHourKst: number): boolean {
  return kstHour(now) === scheduleHourKst
}

/**
 * 주어진 시각이 예약 배포 시각(KST 정시) 전후 `windowMinutes`분 이내인지 판정한다.
 * 자정 경계 랩어라운드를 처리한다 (예: 배포 시각 00:00, windowMinutes=30일 때 23:55도 포함).
 */
export function isWithinAmbientDropExclusionWindow(
  now: Date,
  scheduleHourKst: number,
  windowMinutes: number
): boolean {
  if (windowMinutes <= 0) return false
  const scheduleMinutesOfDay = scheduleHourKst * 60
  const nowMinutesOfDay = kstMinutesOfDay(now)
  const diff = Math.abs(nowMinutesOfDay - scheduleMinutesOfDay)
  const wrapped = Math.min(diff, MINUTES_PER_DAY - diff)
  return wrapped <= windowMinutes
}

/** 화면 표기 — 「03:00 KST」. 시간대를 반드시 함께 적는다(시간대 불명확이 오해의 원인이었다) */
export function formatAmbientDropScheduleTime(scheduleHourKst: number): string {
  return `${String(scheduleHourKst).padStart(2, '0')}:00 KST`
}

/**
 * 화면 표기 — 「03:00 KST · 새벽」.
 *
 * 24시간제 숫자만 보면 그게 하루 중 언제인지 감이 안 온다. 이 티켓의 발단이 정확히
 * 그것이었다 — 배포 시각이 18:00(UTC)으로 적혀 있어 **매일 한국시간 새벽 3시에 드랍이
 * 깔리고 있다는 사실을 아무도 읽어내지 못했다.** 그래서 선택지마다 때를 함께 적는다.
 */
export function formatAmbientDropScheduleOption(scheduleHourKst: number): string {
  return `${formatAmbientDropScheduleTime(scheduleHourKst)} · ${dayBandLabel(scheduleHourKst)}`
}

function dayBandLabel(hourKst: number): string {
  if (hourKst <= 4) return '새벽'
  if (hourKst <= 8) return '아침'
  if (hourKst <= 11) return '오전'
  if (hourKst <= 17) return '오후'
  if (hourKst <= 21) return '저녁'
  return '밤'
}

/**
 * 상호 배제 창 상한(분).
 *
 * 이 창의 목적은 예약 배포와 수동 배포가 겹치는 것을 막는 것뿐이라 몇 분이면 충분하다.
 * 상한이 없으면 720(12시간) 이상을 넣는 순간 `isWithinAmbientDropExclusionWindow`의
 * 랩어라운드 최댓값이 720이라 **하루 24시간 내내 「지금 배포」가 409로 막힌다** —
 * 운영자가 스스로를 잠그는 경로다.
 */
export const AMBIENT_DROP_EXCLUSION_WINDOW_MAX_MINUTES = 180

/** 화면 표기 — 「매일 03:00 KST」 */
export function formatAmbientDropScheduleLabel(scheduleHourKst: number): string {
  return `매일 ${formatAmbientDropScheduleTime(scheduleHourKst)}`
}
