/**
 * JAM! 카테고리 — "현재(오늘 기준) 연속 동기화 일수" 계산 (티켓 20260911_2304)
 *
 * `daily_sync_streak_days` 조건 전용 계산 로직. 기존 활동배지의 `streak_days`
 * (Strava 활동 기반, `activityFilters.ts`의 `calcMaxStreak` — **역대 최장**)와는 판정
 * 기준이 다르다 — 이 지표는 "오늘까지 하루라도 거르지 않고 이어진 연속"만 본다.
 * 어제까지만 연속이고 오늘 동기화가 없으면 0으로 리셋된다(사용자 확정 판정 기준).
 *
 * `user_daily_sync_counts`(마이그레이션 154)는 유저별 동기화 발생일(KST, PK
 * `(user_id, sync_date)`)만 기록하므로, 이 파일이 그 날짜 목록에서 연속일수를 센다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { kstDateString } from '@/lib/notifications/kst'

/** `YYYY-MM-DD` 문자열에 일(day) 단위 오프셋을 더한다 — 달력 날짜 연산만 하고 시각은 보지 않는다 */
function shiftDateString(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}

/**
 * 동기화 발생일 목록(`YYYY-MM-DD`, 순서 무관)에서 "오늘 기준 현재 연속일수"를 계산하는
 * 순수 함수. 오늘 날짜가 목록에 없으면(오늘 아직 동기화 안 함) 0을 돌려준다 — 어제까지
 * 아무리 길게 연속이었어도 오늘 끊겼으면 "현재 연속"은 0이다(사용자 확정 판정 기준).
 *
 * @param syncDates 유저의 `user_daily_sync_counts.sync_date` 전체(또는 최근 구간)
 * @param today 기준 날짜(KST, `YYYY-MM-DD`). 생략하면 지금 시각의 KST 날짜를 쓴다
 */
export function calcCurrentSyncStreakDays(syncDates: readonly string[], today: string = kstDateString()): number {
  const dateSet = new Set(syncDates)
  if (!dateSet.has(today)) return 0

  let streak = 0
  let cursor = today
  while (dateSet.has(cursor)) {
    streak++
    cursor = shiftDateString(cursor, -1)
  }
  return streak
}

/**
 * `user_daily_sync_counts`에서 유저의 동기화 발생일을 조회해 `calcCurrentSyncStreakDays`로
 * 넘긴다. 조회 실패는 예외를 던지지 않고 0으로 폴백한다(로그만 남긴다) — 이 판정 실패가
 * 동기화 자체를 막으면 안 된다(`recordDailySyncAndEvaluate`와 같은 방어 원칙).
 *
 * limit은 3650(약 10년) — 연속일수는 첫 끊긴 지점에서 멈추므로 이보다 긴 재직 스트릭은
 * 실질적으로 없다고 보고, 무한정 테이블 스캔을 막는 상한이다.
 */
export async function fetchCurrentSyncStreakDays(
  userId: string,
  supabase: SupabaseClient,
  today: string = kstDateString()
): Promise<number> {
  const { data, error } = await supabase
    .from('user_daily_sync_counts')
    .select('sync_date')
    .eq('user_id', userId)
    .order('sync_date', { ascending: false })
    .limit(3650)

  if (error) {
    console.error(`[fetchCurrentSyncStreakDays] 동기화 기록 조회 실패 (userId: ${userId}):`, error)
    return 0
  }

  const dates = ((data as { sync_date: string }[] | null) ?? []).map((r) => r.sync_date)
  return calcCurrentSyncStreakDays(dates, today)
}
