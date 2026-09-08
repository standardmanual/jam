/**
 * 가상 활동(GPX·수치 직접입력) → `NormalizedActivity[]` 변환 — `/api/admin/simulate`가 쓰던
 * 로직을 그대로 옮겼다(티켓 20260908_1631). `/api/admin/badges/simulate-condition`의 가상 활동
 * 입력 경로도 같은 함수를 재사용한다 — 두 API가 서로 다른 변환 로직을 갖지 않게 하기 위함이다.
 */
import type { NormalizedActivity, ExtendedActivityFields } from '@/types/strava'
import { EXTENDED_ACTIVITY_FIELD_KEYS } from '@/types/strava'

/** 클라이언트(어드민 폼)가 보내는 가상 활동 입력 — GPX 파싱 결과 또는 수치 직접입력 결과 공통 형태 */
export interface VirtualActivityInput {
  activityType: string
  distanceKm: number
  movingTimeSec: number
  elevationGainM: number
  averageSpeedKmh: number
  startDate: string
  route?: [number, number][] | null
  // v5 확장 필드(avgHeartrateBpm 등)는 키가 있을 때만 실린다 — readExtendedFields가 흡수
  [key: string]: unknown
}

/**
 * 어드민 폼이 보낸 v5 확장 필드를 `NormalizedActivity` 조각으로 옮긴다 (티켓 20260905_0029).
 *
 * `normalizeActivity`와 **같은 규칙**을 지킨다 — 값이 없으면 `null`을 넣지 않고 **키 자체를
 * 만들지 않는다.** 어드민 폼이 `null`을 넣으면 실제 Strava 활동과 다른 형태가 되어, 「심박
 * 데이터가 없는 활동」을 재현할 수 없게 된다.
 *
 * 입력이 어드민 폼이라 문자열로 올 수 있어 숫자 변환도 여기서 흡수한다.
 */
export function readExtendedFields(activity: Record<string, unknown>): ExtendedActivityFields {
  const out: Record<string, number> = {}
  for (const key of EXTENDED_ACTIVITY_FIELD_KEYS) {
    const raw = activity[key]
    if (raw === undefined || raw === null || raw === '') continue
    const value = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(value)) continue
    out[key] = value
  }
  return out as ExtendedActivityFields
}

/**
 * 가상 활동 하나를 `repeatCount`만큼 연속 날짜에 복제해 `NormalizedActivity[]`를 만든다.
 * `evaluateBadgesDetailed`/`evaluateConditionDetailed`가 그대로 받을 수 있는 형태다.
 */
export function buildVirtualActivities(
  activity: VirtualActivityInput,
  repeatCount: number
): NormalizedActivity[] {
  const extended = readExtendedFields(activity)
  const baseDate = new Date(activity.startDate)
  const count = Number.isFinite(repeatCount) && repeatCount > 0 ? Math.floor(repeatCount) : 1

  return Array.from({ length: count }, (_, i) => {
    const date = new Date(baseDate)
    date.setDate(date.getDate() - (count - 1 - i))
    return {
      stravaId: -(i + 1),
      name: `시뮬레이션 활동 #${i + 1}`,
      distanceKm: activity.distanceKm,
      movingTimeSec: activity.movingTimeSec,
      elevationGainM: activity.elevationGainM,
      jamActivityType: activity.activityType,
      startDate: date.toISOString(),
      averageSpeedKmh: activity.averageSpeedKmh,
      startLatLng: activity.route?.[0] ?? null,
      endLatLng: activity.route?.[activity.route.length - 1] ?? null,
      // 확장 필드 — 입력된 것만 실린다(`normalizeActivity`와 같은 «없으면 키 없음» 규칙)
      ...extended,
    }
  })
}
