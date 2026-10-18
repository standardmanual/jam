/**
 * 시험용 `record_checkin_earn` 페이크 (마이그레이션 241, 티켓 20261018_1814)
 *
 * DB 함수의 규칙을 그대로 흉내 낸다 — 같은 (배지·장소·활동)이면 `duplicate:true`, 새 줄이면 그 배지의 이전 방문 수
 * (`priorCounts` + 이번 시험에서 이미 넣은 줄)로 `visit_count`·`is_first`를 만든다. 새 줄은 `onEarn`으로 알려
 * 각 시험이 `user_checkin_badge_earns` insert 자리에 기록하게 한다. 이 파일은 `*.test.ts`가 아니라 시험으로 돌지 않는다.
 */
export interface CheckinEarnArgs {
  p_user_id: string
  p_badge_id: string
  p_poi_id: string
  p_strava_id: number
  p_activity_name: string
  p_distance_km: number | null
  p_activity_date: string
}

export function makeRecordCheckinEarn(
  onEarn: (args: CheckinEarnArgs) => void,
  priorCounts: Record<string, number> = {}
): (args: CheckinEarnArgs) => { data: Record<string, unknown>; error: null } {
  const seen = new Set<string>()
  const counts: Record<string, number> = { ...priorCounts }
  return (args) => {
    const key = `${args.p_user_id}|${args.p_badge_id}|${args.p_poi_id}|${args.p_strava_id}`
    if (seen.has(key)) return { data: { ok: true, duplicate: true }, error: null }
    seen.add(key)
    const prior = counts[args.p_badge_id] ?? 0
    counts[args.p_badge_id] = prior + 1
    onEarn(args)
    return {
      data: { ok: true, duplicate: false, earn_id: `earn-${seen.size}`, visit_count: prior + 1, is_first: prior === 0 },
      error: null,
    }
  }
}

/** 방문 기록 줄을 `user_checkin_badge_earns` insert 페이로드 모양으로 바꾼다 — 예전 시험의 단언을 그대로 쓰게 한다 */
export function earnArgsToRow(args: CheckinEarnArgs): Record<string, unknown> {
  return {
    user_id: args.p_user_id,
    badge_id: args.p_badge_id,
    poi_id: args.p_poi_id,
    triggered_by_strava_id: args.p_strava_id,
    triggered_by_activity_name: args.p_activity_name,
    triggered_by_distance_km: args.p_distance_km,
    triggered_by_activity_date: args.p_activity_date,
  }
}
