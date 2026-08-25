import type { BadgeCondition, ActivityType } from '@/types/database'

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
 * 있도록 분리했다(티켓 20260825_029).
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
 * 조건 빌더 폼 입력값을 condition_json(BadgeCondition)으로 조립한다.
 *
 * 빈 객체에서 시작해 값이 있는 필드만 조립하는 구조라, 새 필드를 추가하고 여기 반영을
 * 빠뜨리면 그 필드는 저장 시 조용히 유실된다 — 실제로 `missionReward`(mission_reward)가
 * 이 함수에 없어서 미션보상배지를 어드민에서 수정 저장하면 플래그가 사라지는 회귀가 있었다
 * (티켓 20260825_029). 새 조건 필드를 추가할 때는 이 함수와
 * `src/lib/badge-engine/condition-schema.ts`의 ALL_CONDITION_KEYS를 함께 갱신할 것.
 */
export function buildConditionJsonFromFields(fields: ConditionFormFields): BadgeCondition | null {
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
  return Object.keys(cond).length > 0 ? cond : null
}
