import type { BadgeCondition, ActivityType } from '@/types/database'
import { ALL_CONDITION_KEYS } from '@/lib/badge-engine/condition-schema'

/** "5:30" 같은 mm:ss 페이스 입력을 초(sec/km)로 변환. 형식이 어긋나면 null */
export function parsePaceToSec(input: string): number | null {
  const match = input.trim().match(/^(\d+):([0-5]?\d)$/)
  if (!match) return null
  const min = parseInt(match[1], 10)
  const sec = parseInt(match[2], 10)
  return min * 60 + sec
}

/**
 * 조건 빌더 폼 필드 → condition_json 조립에 필요한 원시 입력값 묶음.
 * BadgeForm.tsx의 조건 빌더 state와 1:1 대응한다. 순수 로직(React 비의존)만 이 파일에
 * 두어 BadgeForm.tsx의 무거운 컴포넌트 의존성(배경 제너레이터 등) 없이 유닛테스트할 수
 * 있도록 분리했다(티켓 20260825_031).
 */
export interface ConditionFormFields {
  distanceKm: string
  totalCount: string
  elevationM: string
  minSpeedKmh: string
  maxPace: string
  streakDays: string
  activityType: string
  durationMinutes: string
  weekendDurationHours: string
  weeklyCount: string
  month: string
  monthlyKm: string
  seasonCount: string
  season: string
  tempMinC: string
  tempMaxC: string
  timeStart: string
  timeEnd: string
  prerequisiteNames: string
  /** 메타데이터 필드 — 미션 완료로만 지급되는 배지 표시용 플래그(발급 판정에는 관여하지 않음) */
  missionReward: boolean
}

/**
 * `buildConditionJsonFromFields`가 실제로 입력 UI를 갖고 조립하는 `condition_json` 필드 목록.
 *
 * `ALL_CONDITION_KEYS`(condition-schema.ts, badge-engine 데이터 계약 단일 출처) 중 이 목록에
 * 없는 필드는 "폼 미지원 필드"로 분류돼 `buildConditionJsonFromFields`가 `initCond`(원본)에서
 * 그대로 보존한다 — 새 조건 필드가 여기 반영을 빠뜨려도 최소한 저장 시 유실은 나지 않는다
 * (티켓 20260825_032, `mission_reward` 유실 회귀 티켓 20260825_031의 재발 방지).
 */
export const FORM_COVERED_CONDITION_KEYS = [
  'distance_km',
  'total_count',
  'elevation_gain_m',
  'min_speed_kmh',
  'max_pace_sec_per_km',
  'streak_days',
  'activity_type',
  'duration_minutes',
  'weekend_duration_hours',
  'weekly_count',
  'month',
  'monthly_km',
  'season_count',
  'season',
  'temperature_min_c',
  'temperature_max_c',
  'time_range',
  'prerequisite_badge_names',
  'mission_reward',
] as const satisfies readonly (keyof BadgeCondition)[]

/** `ALL_CONDITION_KEYS` 중 조건 빌더 폼이 입력 UI를 제공하지 않는 필드 */
export const FORM_UNSUPPORTED_CONDITION_KEYS = ALL_CONDITION_KEYS.filter(
  (key) => !(FORM_COVERED_CONDITION_KEYS as readonly string[]).includes(key)
) as readonly Exclude<(typeof ALL_CONDITION_KEYS)[number], (typeof FORM_COVERED_CONDITION_KEYS)[number]>[]

/**
 * 배지의 `condition_json` 중 조건 빌더 폼이 다루지 않아 값이 있어도 화면에 표시할 수 없는
 * 필드 목록을 돌려준다. BadgeForm.tsx가 "이 필드는 폼에서 수정할 수 없다"는 안내에 쓴다.
 */
export function getUnsupportedConditionKeys(cond: BadgeCondition | null | undefined): (keyof BadgeCondition)[] {
  if (!cond) return []
  return FORM_UNSUPPORTED_CONDITION_KEYS.filter((key) => cond[key] !== undefined)
}

/**
 * 조건 빌더 폼 입력값을 condition_json(BadgeCondition)으로 조립한다.
 *
 * 빈 객체에서 시작해 값이 있는 필드만 조립하는 구조라, 새 필드를 추가하고 여기 반영을
 * 빠뜨리면 그 필드는 저장 시 조용히 유실된다 — 실제로 `missionReward`(mission_reward)가
 * 이 함수에 없어서 미션보상배지를 어드민에서 수정 저장하면 플래그가 사라지는 회귀가 있었다
 * (티켓 20260825_031). 새 조건 필드를 추가할 때는 이 함수와
 * `src/lib/badge-engine/condition-schema.ts`의 ALL_CONDITION_KEYS를 함께 갱신할 것.
 *
 * `initCond`(폼을 열 때 배지에 이미 저장돼 있던 원본 조건)를 넘기면, 폼이 입력 UI를 갖지
 * 않는 필드(`FORM_UNSUPPORTED_CONDITION_KEYS` — 현재 day_of_week, active_days_count, poi_id,
 * route)는 값이 있을 때 그대로 결과에 보존한다. `PUT /api/admin/badges/[id]`가 condition_json을
 * 부분 병합이 아니라 전체 교체로 저장하기 때문에, 이 보존이 없으면 폼이 모르는 필드를 가진
 * 배지를 열어 저장하기만 해도 그 값이 조용히 사라진다(티켓 20260825_032).
 */
export function buildConditionJsonFromFields(
  fields: ConditionFormFields,
  initCond?: BadgeCondition | null
): BadgeCondition | null {
  const cond: BadgeCondition = {}
  if (fields.distanceKm) cond.distance_km = parseFloat(fields.distanceKm)
  if (fields.totalCount) cond.total_count = parseInt(fields.totalCount, 10)
  if (fields.elevationM) cond.elevation_gain_m = parseFloat(fields.elevationM)
  if (fields.minSpeedKmh) cond.min_speed_kmh = parseFloat(fields.minSpeedKmh)
  if (fields.maxPace) {
    const paceSec = parsePaceToSec(fields.maxPace)
    if (paceSec !== null) cond.max_pace_sec_per_km = paceSec
  }
  if (fields.streakDays) cond.streak_days = parseInt(fields.streakDays, 10)
  if (fields.activityType) cond.activity_type = fields.activityType as ActivityType
  if (fields.durationMinutes) cond.duration_minutes = parseInt(fields.durationMinutes, 10)
  if (fields.weekendDurationHours) cond.weekend_duration_hours = parseFloat(fields.weekendDurationHours)
  if (fields.weeklyCount) cond.weekly_count = parseInt(fields.weeklyCount, 10)
  if (fields.month) cond.month = parseInt(fields.month, 10)
  if (fields.monthlyKm) cond.monthly_km = parseFloat(fields.monthlyKm)
  if (fields.seasonCount) cond.season_count = parseInt(fields.seasonCount, 10)
  if (fields.season) cond.season = fields.season as BadgeCondition['season']
  if (fields.tempMinC) cond.temperature_min_c = parseFloat(fields.tempMinC)
  if (fields.tempMaxC) cond.temperature_max_c = parseFloat(fields.tempMaxC)
  if (fields.timeStart && fields.timeEnd) cond.time_range = { start: fields.timeStart, end: fields.timeEnd }
  const prereqs = fields.prerequisiteNames
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (prereqs.length > 0) cond.prerequisite_badge_names = prereqs
  if (fields.missionReward) cond.mission_reward = true

  // 폼이 입력 UI를 갖지 않는 필드는 값이 있으면 원본 그대로 보존한다 — 위 조립 로직이 절대
  // 건드리지 않는 키만 대상이라 이미 조립된 값을 덮어쓸 위험은 없다.
  if (initCond) {
    for (const key of FORM_UNSUPPORTED_CONDITION_KEYS) {
      const value = initCond[key]
      if (value !== undefined) {
        ;(cond as Record<string, unknown>)[key] = value
      }
    }
  }

  return Object.keys(cond).length > 0 ? cond : null
}
