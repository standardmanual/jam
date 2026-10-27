import { computeKpiWeeklyMetrics, resolveKpiWeeklyRange, DEFAULT_KPI_WEEKLY_DAYS, type KpiWeeklyMetrics } from '@/lib/admin/kpiWeekly'

/**
 * 주간 지표 두 구간(이번 7일·직전 7일)을 한 번에 읽는 서버 읽기 (티켓 20261026_2027 3-2).
 * 운영 홈의 서비스 점검(Strava 칸)과 생태계 상황판의 주간 핵심 지표가 둘 다 쓰므로 한 곳에 둔다.
 * `app/admin/_home/sections.tsx`에 있던 것을 동작 그대로 옮겼다.
 */

export interface KpiResult {
  metrics: KpiWeeklyMetrics | null
  error: string | null
}

/** 이번 주와 지난주의 주간 지표. 둘 다 던지지 않고 실패 사유를 담는다. */
export interface KpiWeeklyPair {
  thisWeek: KpiResult
  lastWeek: KpiResult
}

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
  return String(error)
}

/**
 * 주간 지표 두 구간(이번 7일·직전 7일)을 읽기 시작한다. **페이지에서 한 번만** 불러 같은 약속을 여러 구역에 넘긴다.
 * 약속은 거부되지 않는다 — 실패는 `error`에 담긴다.
 */
export function startKpiWeekly(now: Date = new Date()): Promise<KpiWeeklyPair> {
  const thisWeekRange = resolveKpiWeeklyRange(null, now)
  // 직전 7일 구간 — resolveKpiWeeklyRange(days, now)의 now 자리에 "7일 전 시각"을 넣으면
  // start=14일 전 · end=7일 전인, 이번 주 바로 앞 7일 구간이 그대로 나온다(같은 함수 재사용).
  const lastWeekRange = resolveKpiWeeklyRange(null, new Date(now.getTime() - DEFAULT_KPI_WEEKLY_DAYS * 24 * 60 * 60 * 1000))
  const settle = (range: ReturnType<typeof resolveKpiWeeklyRange>): Promise<KpiResult> =>
    computeKpiWeeklyMetrics(range)
      .then((metrics): KpiResult => ({ metrics, error: null }))
      .catch((error): KpiResult => ({ metrics: null, error: messageOf(error) }))
  return Promise.all([settle(thisWeekRange), settle(lastWeekRange)]).then(([thisWeek, lastWeek]) => ({ thisWeek, lastWeek }))
}
