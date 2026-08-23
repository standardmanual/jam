/**
 * JAM! 배지 발급 엔진 (서버 사이드 전용)
 *
 * - type='activity' 배지에 대해 condition_json 평가
 * - 성장 티어 정책: 배지 이름당 최상위 레어리티 1개만 발급
 * - 진행 트랙 정책: 동일 트랙(거리/횟수) 내 최고값 배지 1개만 발급
 * - 미구현 조건 타입은 false 처리 (자동 통과 방지)
 */
import { createServiceClient } from '@/lib/supabase/server'
import { recordFeedEvent } from '@/lib/activity-feed'
import { awardPoints } from '@/lib/points'
import { logEngineDecision } from '@/lib/engine-log'
import { getActivityHistory, mergeActivityHistory } from '@/lib/strava/activity-history'
import type { NormalizedActivity } from '@/types/strava'
import { kmhToPaceSecPerKm, formatPaceSecPerKm } from '@/types/strava'
import type { BadgeCondition, BadgeConditionSnapshot, BadgeRow, DayOfWeek, UserActivityBadgeRow } from '@/types/database'

const RARITY_TIER: Record<string, number> = { common: 1, rare: 2, legend: 3, mythic: 4 }

// ── 축1 게이트 (걷기 전용 "진짜 걷기" 판정) ────────────────────────────────
// 걷기(activity_type='walking') 활동이 이 네 값을 모두 통과해야 어떤 걷기 배지
// 조건 평가에도 포함된다. 미통과 시 그 활동은 걷기 배지 평가에서 완전 배제.
// 다른 종목에는 영향 없음. 값은 튜닝 대상이라 상수로 분리해 한 곳에 모아둔다.
export const WALKING_GATE_MIN_DISTANCE_KM = 0.5
export const WALKING_GATE_MIN_DURATION_MIN = 10
export const WALKING_GATE_MIN_SPEED_KMH = 2.0
export const WALKING_GATE_MAX_SPEED_KMH = 8.0

/** 걷기 활동이 축1 게이트를 통과하는지. 걷기가 아니면 항상 true(영향 없음). */
export function passesWalkingGate(a: NormalizedActivity): boolean {
  if (a.jamActivityType !== 'walking') return true
  if (a.distanceKm < WALKING_GATE_MIN_DISTANCE_KM) return false
  if (a.movingTimeSec / 60 < WALKING_GATE_MIN_DURATION_MIN) return false
  if (a.averageSpeedKmh < WALKING_GATE_MIN_SPEED_KMH || a.averageSpeedKmh > WALKING_GATE_MAX_SPEED_KMH) return false
  return true
}

const DAY_INDEX: Record<DayOfWeek, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}
const DAY_LABEL_KO: Record<DayOfWeek, string> = {
  sunday: '일', monday: '월', tuesday: '화', wednesday: '수', thursday: '목', friday: '금', saturday: '토',
}

/** 활동의 (로컬 기준) 요일이 지정한 day_of_week와 일치하는지 */
function matchesDayOfWeek(a: NormalizedActivity, day: DayOfWeek): boolean {
  const dateOnly = (a.startDateLocal ?? a.startDate).slice(0, 10)
  return new Date(`${dateOnly}T00:00:00Z`).getUTCDay() === DAY_INDEX[day]
}

/** 같은 날짜(로컬 기준)의 활동을 1건으로 압축 — 걷기 빈도 조건 하루 1회 상한용 */
function dedupeOnePerDay(activities: NormalizedActivity[]): NormalizedActivity[] {
  const seen = new Set<string>()
  const result: NormalizedActivity[] = []
  for (const a of activities) {
    const key = (a.startDateLocal ?? a.startDate).slice(0, 10)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(a)
  }
  return result
}

const SEASON_MONTHS: Record<'spring' | 'summer' | 'fall' | 'winter', number[]> = {
  spring: [3, 4, 5], summer: [6, 7, 8], fall: [9, 10, 11], winter: [12, 1, 2],
}
const SEASON_LABEL_KO: Record<'spring' | 'summer' | 'fall' | 'winter', string> = {
  spring: '봄', summer: '여름', fall: '가을', winter: '겨울',
}

// ── 공개 타입 ────────────────────────────────────────────────────────────

export type EvalConditionResult = {
  pass: boolean
  reason: string
  actual: string
  required: string
}

export type BadgeEarnedInfo = {
  id: string
  name: string
  rarity: string
  reason: string
}

export type BadgeMissedInfo = {
  id: string
  name: string
  reason: string
  actual: string
  required: string
}

// ── 조건 평가 (상세 이유 포함) ────────────────────────────────────────────

/** 한 활동 안에서 동시에 충족해야 하는 필드 — "합산"이 아니라 "그 활동 자체가" 조건을 만족해야 함 */
const PER_ACTIVITY_KEYS = [
  'distance_km', 'elevation_gain_m', 'duration_minutes', 'min_speed_kmh', 'max_pace_sec_per_km',
  'temperature_min_c', 'temperature_max_c', 'weekend_duration_hours',
] as const

function inTimeRange(activity: NormalizedActivity, range: { start: string; end: string }): boolean {
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
  }
  const local = activity.startDateLocal ?? activity.startDate
  const t = toMin(local.slice(11, 16))
  const s = toMin(range.start)
  const e = toMin(range.end)
  return s > e ? (t >= s || t <= e) : (t >= s && t <= e)
}

/** 활동 하나가 PER_ACTIVITY_KEYS + (weekly_count 없을 때의) time_range를 전부 만족하는지 */
function matchesPerActivityCondition(condition: BadgeCondition, a: NormalizedActivity): boolean {
  if (condition.distance_km !== undefined && a.distanceKm < condition.distance_km) return false
  if (condition.elevation_gain_m !== undefined && a.elevationGainM < condition.elevation_gain_m) return false
  if (condition.duration_minutes !== undefined && a.movingTimeSec / 60 < condition.duration_minutes) return false
  if (condition.min_speed_kmh !== undefined && a.averageSpeedKmh < condition.min_speed_kmh) return false
  if (condition.max_pace_sec_per_km !== undefined && kmhToPaceSecPerKm(a.averageSpeedKmh) > condition.max_pace_sec_per_km) return false
  if (condition.temperature_min_c !== undefined) {
    if (a.weatherTempC == null || a.weatherTempC < condition.temperature_min_c) return false
  }
  if (condition.temperature_max_c !== undefined) {
    if (a.weatherTempC == null || a.weatherTempC > condition.temperature_max_c) return false
  }
  if (condition.weekend_duration_hours !== undefined) {
    const day = new Date(a.startDateLocal ?? a.startDate).getDay()
    const isWeekend = day === 0 || day === 6
    if (!isWeekend || a.movingTimeSec / 3600 < condition.weekend_duration_hours) return false
  }
  if (condition.time_range !== undefined && condition.weekly_count === undefined) {
    if (!inTimeRange(a, condition.time_range)) return false
  }
  return true
}

function describePerActivity(condition: BadgeCondition, a: NormalizedActivity): { actual: string[]; required: string[] } {
  const actual: string[] = []
  const required: string[] = []
  if (condition.distance_km !== undefined) {
    actual.push(`거리: ${Math.round(a.distanceKm * 10) / 10}km`)
    required.push(`거리: ${condition.distance_km}km`)
  }
  if (condition.elevation_gain_m !== undefined) {
    actual.push(`고도: ${Math.round(a.elevationGainM)}m`)
    required.push(`고도: ${condition.elevation_gain_m}m`)
  }
  if (condition.duration_minutes !== undefined) {
    actual.push(`이동시간: ${Math.round(a.movingTimeSec / 60)}분`)
    required.push(`이동시간: ${condition.duration_minutes}분`)
  }
  if (condition.min_speed_kmh !== undefined) {
    actual.push(`속도: ${a.averageSpeedKmh}km/h`)
    required.push(`속도: ${condition.min_speed_kmh}km/h`)
  }
  if (condition.max_pace_sec_per_km !== undefined) {
    actual.push(`페이스: ${formatPaceSecPerKm(kmhToPaceSecPerKm(a.averageSpeedKmh))}`)
    required.push(`페이스: ${formatPaceSecPerKm(condition.max_pace_sec_per_km)}`)
  }
  if (condition.temperature_min_c !== undefined) {
    actual.push(`기온: ${a.weatherTempC}°C`)
    required.push(`기온: ≥${condition.temperature_min_c}°C`)
  }
  if (condition.temperature_max_c !== undefined) {
    actual.push(`기온: ${a.weatherTempC}°C`)
    required.push(`기온: ≤${condition.temperature_max_c}°C`)
  }
  if (condition.weekend_duration_hours !== undefined) {
    actual.push(`주말활동시간: ${(a.movingTimeSec / 3600).toFixed(1)}시간`)
    required.push(`주말활동시간: ${condition.weekend_duration_hours}시간`)
  }
  if (condition.time_range !== undefined && condition.weekly_count === undefined) {
    const local = a.startDateLocal ?? a.startDate
    actual.push(`활동시각: ${local.slice(11, 16)}`)
    required.push(`시간대: ${condition.time_range.start}~${condition.time_range.end}`)
  }
  return { actual, required }
}

/** 필드가 하나뿐인 단순 케이스의 구체적인 실패 사유 (여러 필드 동시충족 케이스는 상위에서 별도 처리) */
function singleFieldFailure(
  condition: BadgeCondition,
  key: typeof PER_ACTIVITY_KEYS[number] | 'time_range',
  filtered: NormalizedActivity[]
): EvalConditionResult {
  switch (key) {
    case 'distance_km': {
      const best = Math.max(...filtered.map((a) => a.distanceKm), 0)
      return { pass: false, reason: '거리 부족', actual: `${Math.round(best * 10) / 10}km`, required: `${condition.distance_km}km` }
    }
    case 'elevation_gain_m': {
      const best = Math.max(...filtered.map((a) => a.elevationGainM), 0)
      return { pass: false, reason: '고도 상승 부족', actual: `${Math.round(best)}m`, required: `${condition.elevation_gain_m}m` }
    }
    case 'duration_minutes': {
      const best = Math.max(...filtered.map((a) => a.movingTimeSec / 60), 0)
      return { pass: false, reason: '이동 시간 부족', actual: `${Math.round(best)}분`, required: `${condition.duration_minutes}분` }
    }
    case 'min_speed_kmh': {
      const best = Math.max(...filtered.map((a) => a.averageSpeedKmh), 0)
      return { pass: false, reason: '속도 부족', actual: `${best}km/h`, required: `${condition.min_speed_kmh}km/h` }
    }
    case 'max_pace_sec_per_km': {
      const paces = filtered.map((a) => kmhToPaceSecPerKm(a.averageSpeedKmh))
      const best = paces.length > 0 ? Math.min(...paces) : Infinity
      return { pass: false, reason: '페이스 부족', actual: formatPaceSecPerKm(best), required: formatPaceSecPerKm(condition.max_pace_sec_per_km!) }
    }
    case 'temperature_min_c': {
      const temps = filtered.map((a) => a.weatherTempC).filter((t): t is number => t != null)
      if (temps.length === 0) {
        return { pass: false, reason: '날씨 데이터 없음 (Strava 미제공)', actual: '-', required: `≥${condition.temperature_min_c}°C` }
      }
      const maxTemp = Math.max(...temps)
      return { pass: false, reason: '기온 부족 (폭염 조건 미달)', actual: `${maxTemp}°C`, required: `≥${condition.temperature_min_c}°C` }
    }
    case 'temperature_max_c': {
      const temps = filtered.map((a) => a.weatherTempC).filter((t): t is number => t != null)
      if (temps.length === 0) {
        return { pass: false, reason: '날씨 데이터 없음 (Strava 미제공)', actual: '-', required: `≤${condition.temperature_max_c}°C` }
      }
      const minTemp = Math.min(...temps)
      return { pass: false, reason: '기온 초과 (한파 조건 미달)', actual: `${minTemp}°C`, required: `≤${condition.temperature_max_c}°C` }
    }
    case 'weekend_duration_hours': {
      const best = Math.max(
        ...filtered.filter((a) => { const d = new Date(a.startDateLocal ?? a.startDate).getDay(); return d === 0 || d === 6 }).map((a) => a.movingTimeSec / 3600),
        0
      )
      return { pass: false, reason: '주말 활동 시간 부족', actual: `${best.toFixed(1)}시간`, required: `${condition.weekend_duration_hours}시간` }
    }
    case 'time_range': {
      const { start, end } = condition.time_range!
      return { pass: false, reason: '활동 시간대 불일치', actual: '-', required: `${start}~${end}` }
    }
  }
}

export function evaluateConditionDetailed(
  condition: BadgeCondition,
  activities: NormalizedActivity[]
): EvalConditionResult {
  if (!condition || Object.keys(condition).length === 0) {
    return { pass: false, reason: '조건 없음', actual: '-', required: '-' }
  }

  // poi_id는 GPS 경로 매칭 파이프라인(matchPoisForActivity)에서만 발급 — 엔진 내 평가 불가
  if (condition.poi_id !== undefined) {
    return { pass: false, reason: 'GPS 경로 매칭으로 별도 발급', actual: '-', required: 'POI 반경 내 경유' }
  }

  // 걷기(walking)는 축1 게이트(진짜 걷기 판정)를 통과한 활동만 조건 평가에 포함한다.
  // 미통과 활동은 distance_km/duration_minutes/weekly_count/streak_days/active_days_count/
  // total_count 등 어떤 걷기 조건 평가에도 존재하지 않는 것으로 취급된다.
  let filtered = condition.activity_type
    ? activities.filter(
        (a) => a.jamActivityType === condition.activity_type && (condition.activity_type !== 'walking' || passesWalkingGate(a))
      )
    : activities

  // day_of_week 단일 값 — time_range와 동일하게 AND 결합되는 필터 (예: T05~T07, T09~T11)
  if (condition.day_of_week !== undefined && !Array.isArray(condition.day_of_week)) {
    filtered = filtered.filter((a) => matchesDayOfWeek(a, condition.day_of_week as DayOfWeek))
  }

  // time_range + total_count 조합(T09~T11) — "그 시간대의 활동만" 카운팅 대상으로 좁힌다.
  // (time_range + weekly_count 조합은 아래 weekly_count 블록에서 별도 처리)
  if (condition.time_range !== undefined && condition.total_count !== undefined) {
    filtered = filtered.filter((a) => inTimeRange(a, condition.time_range!))
  }

  // temperature_min_c/max_c + total_count 조합(T12~T14) — "그 기온 조건을 만족한 활동"만
  // 카운팅 대상으로 좁힌다. (total_count 없이 온도만 있으면 기존처럼 "단일 활동 1건" 매칭 —
  // 아래 relevantPerActivityKeys 단일활동 블록에서 처리)
  if (condition.total_count !== undefined && (condition.temperature_min_c !== undefined || condition.temperature_max_c !== undefined)) {
    filtered = filtered.filter((a) => {
      if (condition.temperature_min_c !== undefined && (a.weatherTempC == null || a.weatherTempC < condition.temperature_min_c)) return false
      if (condition.temperature_max_c !== undefined && (a.weatherTempC == null || a.weatherTempC > condition.temperature_max_c)) return false
      return true
    })
  }

  // 걷기 빈도 조건(day_of_week 단일값 + total_count) 하루 1회 상한 — 같은 날 여러 번 걸어도 1회만 카운트
  if (
    condition.activity_type === 'walking' &&
    condition.day_of_week !== undefined &&
    !Array.isArray(condition.day_of_week) &&
    condition.total_count !== undefined
  ) {
    filtered = dedupeOnePerDay(filtered)
  }

  // 통과한 필드의 실측값도 남겨서(어드민이 나중에 "왜 발급됐는지" 확인 가능하도록) 누적한다
  const actualParts: string[] = []
  const requiredParts: string[] = []

  // ── day_of_week 배열 + total_count 동시 지정 — 요일별 독립 카운터 모드 (예: T08 "평일의 성실함")
  //    배열의 각 요일이 각각 독립적으로 total_count를 만족해야 함 (5개 별도 카운터, 전부 충족)
  if (Array.isArray(condition.day_of_week) && condition.total_count !== undefined) {
    const perDay = condition.day_of_week.map((day) => {
      let pool = activities.filter(
        (a) =>
          a.jamActivityType === condition.activity_type &&
          (condition.activity_type !== 'walking' || passesWalkingGate(a)) &&
          matchesDayOfWeek(a, day)
      )
      if (condition.activity_type === 'walking') pool = dedupeOnePerDay(pool)
      return { day, count: pool.length }
    })
    const failing = perDay.filter((r) => r.count < condition.total_count!)
    if (failing.length > 0) {
      return {
        pass: false,
        reason: '요일별 누적 횟수 부족',
        actual: perDay.map((r) => `${DAY_LABEL_KO[r.day]}: ${r.count}회`).join(', '),
        required: `요일별 각 ${condition.total_count}회`,
      }
    }
    actualParts.push(perDay.map((r) => `${DAY_LABEL_KO[r.day]}: ${r.count}회`).join(', '))
    requiredParts.push(`요일별 각 ${condition.total_count}회`)
  }
  const totalCountHandledByDayOfWeek = Array.isArray(condition.day_of_week) && condition.total_count !== undefined

  // ── 사계절 각각 독립 카운터 (T15 "사계절의 발걸음")
  if (condition.season_count_all !== undefined) {
    const seasons: Array<'spring' | 'summer' | 'fall' | 'winter'> = ['spring', 'summer', 'fall', 'winter']
    const perSeason = seasons.map((s) => ({
      season: s,
      count: filtered.filter((a) => SEASON_MONTHS[s].includes(new Date(a.startDateLocal ?? a.startDate).getMonth() + 1)).length,
    }))
    const failing = perSeason.filter((r) => r.count < condition.season_count_all!)
    if (failing.length > 0) {
      return {
        pass: false,
        reason: '계절별 활동 횟수 부족',
        actual: perSeason.map((r) => `${SEASON_LABEL_KO[r.season]}: ${r.count}회`).join(', '),
        required: `계절별 각 ${condition.season_count_all}회`,
      }
    }
    actualParts.push(perSeason.map((r) => `${SEASON_LABEL_KO[r.season]}: ${r.count}회`).join(', '))
    requiredParts.push(`계절별 각 ${condition.season_count_all}회`)
  }

  // ── active_days_count — 걷기(축1 게이트 통과) 누적 고유 활동일수. COUNT(DISTINCT date), 연속 아님.
  if (condition.active_days_count !== undefined) {
    const uniqueDays = new Set(filtered.map((a) => (a.startDateLocal ?? a.startDate).slice(0, 10))).size
    if (uniqueDays < condition.active_days_count) {
      return { pass: false, reason: '누적 활동일수 부족', actual: `${uniqueDays}일`, required: `${condition.active_days_count}일` }
    }
    actualParts.push(`누적일수: ${uniqueDays}일`)
    requiredParts.push(`누적일수: ${condition.active_days_count}일`)
  }

  // ── 단일 활동 동시 충족 조건 — "그 활동 하나"가 모든 필드를 함께 만족해야 함.
  //    필드별로 따로 최댓값을 찾아 합치면(예: 빠른 활동의 속도 + 긴 활동의 시간을 조합)
  //    실제로는 어느 활동도 조건을 만족 못 했는데 통과하는 버그가 생긴다.
  const relevantPerActivityKeys = [
    ...PER_ACTIVITY_KEYS.filter((k) => {
      if (condition[k] === undefined) return false
      // temperature_min_c/max_c + total_count는 위에서 이미 "카운팅 대상 필터"로 처리됨 —
      // 여기서 또 "단일 활동 매칭"으로 취급하면 total_count가 기온과 무관한 전체 걷기
      // 횟수로 잘못 평가된다 (T12~T14 어뷰징 방지 위해 반드시 분리 처리)
      if (condition.total_count !== undefined && (k === 'temperature_min_c' || k === 'temperature_max_c')) return false
      return true
    }),
    ...(condition.time_range !== undefined && condition.weekly_count === undefined && condition.total_count === undefined
      ? ['time_range' as const]
      : []),
  ]
  if (relevantPerActivityKeys.length > 0) {
    const qualifying = filtered.find((a) => matchesPerActivityCondition(condition, a))
    if (!qualifying) {
      // 필드가 하나뿐이면 기존처럼 구체적인 사유를 준다. 여러 필드가 겹치면
      // "동시 충족"이 핵심이므로 필드별 개별 최고 기록은 참고용으로만 보여준다.
      if (relevantPerActivityKeys.length === 1) {
        return singleFieldFailure(condition, relevantPerActivityKeys[0], filtered)
      }
      const bestByField: string[] = []
      if (condition.distance_km !== undefined) bestByField.push(`거리 최고: ${Math.max(...filtered.map((a) => a.distanceKm), 0)}km`)
      if (condition.elevation_gain_m !== undefined) bestByField.push(`고도 최고: ${Math.max(...filtered.map((a) => a.elevationGainM), 0)}m`)
      if (condition.duration_minutes !== undefined) bestByField.push(`시간 최고: ${Math.round(Math.max(...filtered.map((a) => a.movingTimeSec / 60), 0))}분`)
      if (condition.min_speed_kmh !== undefined) bestByField.push(`속도 최고: ${Math.max(...filtered.map((a) => a.averageSpeedKmh), 0)}km/h`)
      if (condition.max_pace_sec_per_km !== undefined) {
        const paces = filtered.map((a) => kmhToPaceSecPerKm(a.averageSpeedKmh))
        bestByField.push(`페이스 최고: ${formatPaceSecPerKm(paces.length > 0 ? Math.min(...paces) : Infinity)}`)
      }
      return {
        pass: false,
        reason: '동시 충족 활동 없음 (개별 최고 기록은 있으나 한 활동에서 함께 달성 못함)',
        actual: bestByField.length > 0 ? bestByField.join(', ') : '-',
        required: '모든 조건을 만족하는 활동 1건',
      }
    }
    const { actual, required } = describePerActivity(condition, qualifying)
    actualParts.push(...actual)
    requiredParts.push(...required)
  }

  if (condition.total_count !== undefined && !totalCountHandledByDayOfWeek) {
    if (filtered.length < condition.total_count) {
      return { pass: false, reason: '활동 횟수 부족', actual: `${filtered.length}회`, required: `${condition.total_count}회` }
    }
    actualParts.push(`횟수: ${filtered.length}회`)
    requiredParts.push(`횟수: ${condition.total_count}회`)
  }

  if (condition.streak_days !== undefined) {
    const streak = calcMaxStreak(filtered)
    if (streak < condition.streak_days) {
      return { pass: false, reason: '연속 일수 부족', actual: `${streak}일`, required: `${condition.streak_days}일` }
    }
    actualParts.push(`연속일수: ${streak}일`)
    requiredParts.push(`연속일수: ${condition.streak_days}일`)
  }

  if (condition.weekly_count !== undefined) {
    // time_range와 함께 쓰이면 해당 시간대 활동만 주간 집계 ("새벽 주 N회" 엄격 의미)
    let weeklyPool = filtered
    if (condition.time_range) {
      const { start, end } = condition.time_range
      const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
      const startMin = toMin(start)
      const endMin = toMin(end)
      const cross = startMin > endMin
      weeklyPool = filtered.filter((a) => {
        const t = toMin((a.startDateLocal ?? a.startDate).slice(11, 16))
        return cross ? t >= startMin || t <= endMin : t >= startMin && t <= endMin
      })
    }
    // 걷기 빈도 조건 하루 1회 상한 — 같은 날 여러 번 걸어도 주간 집계엔 1회만 반영 (W3/W4에도 소급 적용)
    if (condition.activity_type === 'walking') weeklyPool = dedupeOnePerDay(weeklyPool)
    const weekCounts = new Map<string, number>()
    for (const a of weeklyPool) {
      const key = getMondayKey(new Date(a.startDateLocal ?? a.startDate))
      weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1)
    }
    const maxWeek = weekCounts.size > 0 ? Math.max(...weekCounts.values()) : 0
    if (maxWeek < condition.weekly_count) {
      return { pass: false, reason: '주간 활동 횟수 부족', actual: `${maxWeek}회`, required: `${condition.weekly_count}회` }
    }
    actualParts.push(`주간횟수: ${maxWeek}회`)
    requiredParts.push(`주간횟수: ${condition.weekly_count}회`)
  }

  if (condition.month !== undefined || condition.monthly_km !== undefined) {
    let monthFiltered = filtered
    if (condition.month !== undefined) {
      // 배열이면 "그중 한 달" — monthly_km는 아래에서 연-월별로 묶어 최댓값을 취하므로
      // 여러 달을 합산하지 않고 개별 월 단위로 평가된다 (예: T20 장마철 6~7월 중 한 달 150km)
      const months = Array.isArray(condition.month) ? condition.month : [condition.month]
      monthFiltered = filtered.filter((a) => months.includes(new Date(a.startDateLocal ?? a.startDate).getMonth() + 1))
    }
    if (condition.monthly_km !== undefined) {
      const monthKm = new Map<string, number>()
      for (const a of monthFiltered) {
        const d = new Date(a.startDateLocal ?? a.startDate)
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`
        monthKm.set(key, (monthKm.get(key) ?? 0) + a.distanceKm)
      }
      const maxKm = monthKm.size > 0 ? Math.max(...monthKm.values()) : 0
      if (maxKm < condition.monthly_km) {
        return { pass: false, reason: '월 누적 거리 부족', actual: `${Math.round(maxKm * 10) / 10}km`, required: `${condition.monthly_km}km` }
      }
      actualParts.push(`월누적거리: ${Math.round(maxKm * 10) / 10}km`)
      requiredParts.push(`월누적거리: ${condition.monthly_km}km`)
    } else if (condition.month !== undefined && monthFiltered.length === 0) {
      return { pass: false, reason: '해당 월 활동 없음', actual: '0회', required: '1회 이상' }
    }
  }

  if (condition.season_count !== undefined) {
    if (!condition.season) {
      return { pass: false, reason: '계절 조건 미구현 (season 필드 없음)', actual: '-', required: `${condition.season_count}회` }
    }
    const seasonFiltered = condition.season === 'all'
      ? filtered
      : filtered.filter((a) => {
          const m = new Date(a.startDateLocal ?? a.startDate).getMonth() + 1
          return (SEASON_MONTHS[condition.season as 'spring' | 'summer' | 'fall' | 'winter'] ?? []).includes(m)
        })
    if (seasonFiltered.length < condition.season_count) {
      const label = condition.season === 'all' ? '전체' : (SEASON_LABEL_KO[condition.season as 'spring' | 'summer' | 'fall' | 'winter'] ?? condition.season)
      return { pass: false, reason: `${label} 활동 횟수 부족`, actual: `${seasonFiltered.length}회`, required: `${condition.season_count}회` }
    }
    actualParts.push(`계절활동: ${seasonFiltered.length}회`)
    requiredParts.push(`계절활동: ${condition.season_count}회`)
  }

  return {
    pass: true,
    reason: '조건 충족',
    actual: actualParts.join(', '),
    required: requiredParts.join(', '),
  }
}

export function checkCondition(condition: BadgeCondition, activities: NormalizedActivity[]): boolean {
  return evaluateConditionDetailed(condition, activities).pass
}

// ── 핵심 평가 함수 ────────────────────────────────────────────────────────

/**
 * 배지 평가 (상세 결과 반환 + 선택적 DB 저장)
 *
 * @param dryRun  true면 평가만 하고 DB에 저장하지 않음 (기본값: false)
 * @param triggeredBy  발급 트리거 식별자 (기본값: 'strava_sync')
 * @param silent  true면 피드 이벤트를 기록하지 않음 (기본값: false)
 */
export async function evaluateBadgesDetailed(
  userId: string,
  activities: NormalizedActivity[],
  options?: {
    dryRun?: boolean
    triggeredBy?: string
    silent?: boolean
    /** 시뮬레이터 전용: true이면 첫 싱크 게이트를 강제 적용하되 initial_sync_done은 갱신하지 않음 */
    overrideFirstSync?: boolean
  }
): Promise<{ earned: BadgeEarnedInfo[]; missed: BadgeMissedInfo[] }> {
  const { dryRun = false, triggeredBy = 'strava_sync', silent = false, overrideFirstSync } = options ?? {}

  const supabase = createServiceClient()

  // 조건 평가는 "이번 배치"가 아니라 실제 이력 전체를 기준으로 한다.
  // (weekly_count/streak_days/monthly_km/season_count 같은 누적 조건이 배치 크기에
  //  좌우되지 않도록 — strava_activities에 아직 없는 이번 배치는 별도로 합쳐준다)
  const history = await getActivityHistory(supabase, userId)
  const evalActivities = mergeActivityHistory(history, activities)

  // initial_sync_done 조회 — 첫 싱크 게이트 판단용
  const { data: userRowRaw } = await supabase
    .from('users')
    .select('initial_sync_done')
    .eq('id', userId)
    .maybeSingle()
  const userInitialSyncDone = (userRowRaw as { initial_sync_done: boolean } | null)?.initial_sync_done ?? false
  const isFirstSync = overrideFirstSync ?? !userInitialSyncDone

  const now = new Date().toISOString()
  const { data: allBadgesRaw, error: badgesError } = await supabase
    .from('badges')
    .select('*')
    .eq('type', 'activity')
    .is('deleted_at', null)
    .or(`valid_from.is.null,valid_from.lte.${now}`)
    .or(`valid_until.is.null,valid_until.gte.${now}`)

  const allBadges = allBadgesRaw as BadgeRow[] | null

  if (badgesError || !allBadges || allBadges.length === 0) {
    if (badgesError) console.error('[evaluateBadgesDetailed] 배지 목록 조회 오류:', badgesError)
    return { earned: [], missed: [] }
  }

  const { data: ownedBadgesRaw, error: ownedError } = await supabase
    .from('user_activity_badges')
    .select('badge_id, earned_at')
    .eq('user_id', userId)

  const ownedBadges = ownedBadgesRaw as Pick<UserActivityBadgeRow, 'badge_id' | 'earned_at'>[] | null

  if (ownedError) {
    console.error('[evaluateBadgesDetailed] 보유 배지 조회 오류:', ownedError)
    return { earned: [], missed: [] }
  }

  const ownedBadgeIds = new Set((ownedBadges ?? []).map((b) => b.badge_id))

  // 선행 배지 체크용 — 보유 배지의 이름 집합
  const ownedBadgeNames = new Set<string>()
  for (const b of allBadges) {
    if (ownedBadgeIds.has(b.id)) ownedBadgeNames.add(b.name)
  }

  const highestOwnedTierByName = new Map<string, number>()
  for (const badge of allBadges) {
    if (ownedBadgeIds.has(badge.id)) {
      const tier = RARITY_TIER[badge.rarity] ?? 0
      const current = highestOwnedTierByName.get(badge.name) ?? 0
      if (tier > current) highestOwnedTierByName.set(badge.name, tier)
    }
  }

  const badgesByName = new Map<string, BadgeRow[]>()
  for (const badge of allBadges) {
    if (!badgesByName.has(badge.name)) badgesByName.set(badge.name, [])
    badgesByName.get(badge.name)!.push(badge)
  }

  // ── 1단계: 이름별 후보 선정 (이름당 최상위 티어 1개) ──────────────────
  type Candidate = {
    badge: BadgeRow
    condition: BadgeCondition
    progressionKey: string | null
    progressionValue: number
    evalResult: EvalConditionResult
  }
  const candidates: Candidate[] = []
  const missed: BadgeMissedInfo[] = []

  for (const [, group] of badgesByName) {
    const highestOwned = highestOwnedTierByName.get(group[0].name) ?? 0

    const eligible: { badge: BadgeRow; evalResult: EvalConditionResult }[] = []
    for (const badge of group) {
      if (ownedBadgeIds.has(badge.id)) continue
      if ((RARITY_TIER[badge.rarity] ?? 0) <= highestOwned) continue

      // 선행 배지 게이트: prerequisite_badge_names 중 하나라도 보유해야 통과
      const prereqs = (badge.condition_json as BadgeCondition | null)?.prerequisite_badge_names
      if (prereqs && prereqs.length > 0) {
        if (!prereqs.some((n) => ownedBadgeNames.has(n))) {
          missed.push({ id: badge.id, name: badge.name, reason: '선행 배지 미보유', actual: '없음', required: prereqs.join(' 또는 ') })
          continue
        }
      }

      const evalResult = evaluateConditionDetailed(badge.condition_json as BadgeCondition ?? {}, evalActivities)
      if (evalResult.pass) {
        eligible.push({ badge, evalResult })
      } else {
        missed.push({ id: badge.id, name: badge.name, reason: evalResult.reason, actual: evalResult.actual, required: evalResult.required })
      }
    }

    if (eligible.length === 0) continue

    eligible.sort((a, b) => (RARITY_TIER[b.badge.rarity] ?? 0) - (RARITY_TIER[a.badge.rarity] ?? 0))
    const { badge: winner, evalResult } = eligible[0]
    const condition = winner.condition_json as BadgeCondition
    const prog = getProgressionKey(condition)
    candidates.push({ badge: winner, condition, progressionKey: prog?.key ?? null, progressionValue: prog?.value ?? 0, evalResult })

    for (const { badge } of eligible.slice(1)) {
      missed.push({ id: badge.id, name: badge.name, reason: '성장 티어 — 상위 레어리티 발급됨', actual: badge.rarity, required: winner.rarity })
    }
  }

  // ── 2단계: 진행 트랙별 최고값 1개만 남기기 ───────────────────────────
  const trackWinners = new Map<string, Candidate>()
  const standalones: Candidate[] = []

  for (const c of candidates) {
    if (c.progressionKey === null) {
      standalones.push(c)
    } else {
      const existing = trackWinners.get(c.progressionKey)
      if (!existing || c.progressionValue > existing.progressionValue) {
        trackWinners.set(c.progressionKey, c)
      }
    }
  }

  const toIssueList = [...trackWinners.values(), ...standalones]

  // 성과·루틴 배지(type='activity')는 전부 명시적 수치 조건으로 검증되므로
  // 홍수 방지 캡을 두지 않는다 — 조건 충족 시 항상 발급을 보장한다.
  // (과거엔 30일 내 activity_type당 최대 3개 캡이 있었으나, 온보딩 첫 싱크에서
  //  common 배지 여러 개가 동시에 발급되며 자기들끼리 캡을 소진해 이후 정당한
  //  발급까지 막는 문제가 있어 제거함. 아이템/드랍 배지는 drop-engine의
  //  확률·섀도우밴·일일 하향 로직이 별도로 어뷰징을 방지한다.)

  // ── 2.8단계: 첫 싱크 게이트 — initial_sync_done=false이면 Common만 발급 ──
  const gatedIssueList: typeof toIssueList = []
  for (const c of toIssueList) {
    if (isFirstSync && c.badge.rarity !== 'common') {
      missed.push({
        id: c.badge.id,
        name: c.badge.name,
        reason: '첫 싱크 게이트 — Common 등급만 발급',
        actual: c.badge.rarity,
        required: 'common',
      })
    } else {
      gatedIssueList.push(c)
    }
  }

  const earned: BadgeEarnedInfo[] = []

  // ── 3단계: 발급 (dryRun=false일 때만) ───────────────────────────────
  for (const { badge: toIssue, condition, evalResult } of gatedIssueList) {
    earned.push({ id: toIssue.id, name: toIssue.name, rarity: toIssue.rarity, reason: '조건 충족' })

    if (!dryRun) {
      const triggerActivity = condition.activity_type
        ? (evalActivities.find((a) => a.jamActivityType === condition.activity_type && matchesPerActivityCondition(condition, a))
          ?? evalActivities.find((a) => a.jamActivityType === condition.activity_type))
        : evalActivities[0]

      // 어드민 전용 — 발급 근거(조건/실측값/트리거 활동) 스냅샷. 일반 유저 화면에는 노출 안 함
      const conditionSnapshot: BadgeConditionSnapshot = {
        condition,
        actual: evalResult.actual,
        required: evalResult.required,
        reason: evalResult.reason,
        trigger_activity: triggerActivity
          ? {
              stravaId: triggerActivity.stravaId,
              name: triggerActivity.name,
              activityType: triggerActivity.jamActivityType,
              distanceKm: triggerActivity.distanceKm,
              movingTimeSec: triggerActivity.movingTimeSec,
              elevationGainM: triggerActivity.elevationGainM,
              averageSpeedKmh: triggerActivity.averageSpeedKmh,
              startDate: triggerActivity.startDate,
            }
          : null,
      }

      const activityBadgesTable = supabase.from('user_activity_badges')
      const activityBadgeInsertPayload = {
        user_id: userId,
        badge_id: toIssue.id,
        triggered_by: triggeredBy,
        triggered_by_strava_id: triggerActivity?.stravaId ?? null,
        triggered_by_activity_name: triggerActivity?.name ?? null,
        triggered_by_distance_km: triggerActivity?.distanceKm ?? null,
        triggered_by_activity_date: triggerActivity?.startDateLocal ?? triggerActivity?.startDate ?? null,
        condition_snapshot: conditionSnapshot,
      }
      // @ts-expect-error Supabase insert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 UserActivityBadgeRow와 일치
      const { error: insertError } = await activityBadgesTable.insert(activityBadgeInsertPayload)

      if (insertError) {
        if (insertError.code === '23505') continue
        console.error(`[evaluateBadgesDetailed] 배지 발급 오류 (badge_id: ${toIssue.id}):`, insertError)
        continue
      }

      console.info(`[evaluateBadgesDetailed] 배지 발급 — userId: ${userId}, badge: ${toIssue.name} (${toIssue.rarity}), by: ${triggeredBy}`)

      // 잼 포인트 지급 — 배지에 point_reward가 붙어 있으면 발급 직후 1회 지급.
      // (배지 발급 성공을 전제로 지급. 0이면 awardPoints가 스킵.)
      // 실패 시 로깅은 awardPoints() 내부에서 일괄 처리한다(호출부에서 중복 기록 안 함).
      const pointReward = toIssue.point_reward ?? 0
      if (pointReward > 0) {
        await awardPoints(userId, pointReward, 'badge_point_reward', { sourceBadgeId: toIssue.id })
      }

      if (!silent) {
        await recordFeedEvent(userId, 'badge_earned', {
          badge_id: toIssue.id,
          badge_name: toIssue.name,
          badge_image_url: toIssue.image_url ?? '',
          rarity: toIssue.rarity,
          ...(pointReward > 0 ? { point_reward: pointReward } : {}),
        }, triggerActivity?.startDateLocal ?? triggerActivity?.startDate ?? undefined)
      }
    }
  }

  // 첫 싱크 완료 플래그 세팅 (dryRun·시뮬레이터 모드에서는 갱신 안 함)
  if (!dryRun && !overrideFirstSync && !userInitialSyncDone) {
    const usersTable = supabase.from('users')
    // @ts-expect-error Supabase update() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 UserRow와 일치
    await usersTable.update({ initial_sync_done: true }).eq('id', userId)
  }

  // 판정 과정 기록 — dryRun(시뮬레이션)에서는 소음 방지를 위해 기록하지 않음
  if (!dryRun) {
    await logEngineDecision('badge', 'sync_result', userId, { triggeredBy, isFirstSync, earned, missed })
  }

  return { earned, missed }
}

/**
 * Strava 동기화용 래퍼 — 이번 호출에서 새로 발급된 액티비티배지 id 목록을 발급 순서대로 반환한다.
 *
 * 20260823_007: 기존에는 발급 개수(number)만 반환했으나, 동기화 응답에 획득 배지 상세
 * (이름·설명·이미지)를 실어보내기 위해 id 목록으로 확장했다. 개수가 필요한 호출부는
 * `.length`를 쓰면 된다.
 */
export async function evaluateBadges(
  userId: string,
  activities: NormalizedActivity[]
): Promise<string[]> {
  const { earned } = await evaluateBadgesDetailed(userId, activities, {
    dryRun: false,
    triggeredBy: 'strava_sync',
    silent: false,
  })
  return earned.map((b) => b.id)
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────

function getMondayKey(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}

/** 활동 목록에서 가장 긴 "연속 일수"를 계산. 미션 엔진(streak_days 타입)에서도 재사용. */
export function calcMaxStreak(activities: NormalizedActivity[]): number {
  if (activities.length === 0) return 0
  const dates = activities.map((a) => (a.startDateLocal ?? a.startDate).slice(0, 10)).sort()
  const uniqueDates = [...new Set(dates)]
  let maxStreak = 1
  let currentStreak = 1
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1])
    const curr = new Date(uniqueDates[i])
    const diffDays = (curr.getTime() - prev.getTime()) / 86_400_000
    if (diffDays === 1) {
      currentStreak++
      maxStreak = Math.max(maxStreak, currentStreak)
    } else {
      currentStreak = 1
    }
  }
  return maxStreak
}

// ── 진행 트랙 키 추출 ────────────────────────────────────────────────────
const PROGRESSION_MODIFIERS = [
  'elevation_gain_m', 'min_speed_kmh', 'max_pace_sec_per_km', 'streak_days', 'duration_minutes',
  'weekend_duration_hours', 'monthly_km', 'weekly_count', 'season_count',
  'month', 'season', 'temperature_min_c', 'temperature_max_c', 'time_range',
  'day_of_week', 'active_days_count', 'season_count_all',
] as const

function getProgressionKey(condition: BadgeCondition): { key: string; value: number } | null {
  // 진행 트랙 병합(동일 트랙 내 최고값 1개만 발급)은 원래 prerequisite_badge_names로
  // 명시적으로 체인된 배지 가족(예: W1 동네 산책러 rare~mythic 티어)을 위한 장치다.
  // prerequisite가 없는 조건까지 여기서 병합해버리면, 이름이 다르고 서로 무관한
  // "완전 독립" 배지들이 우연히 같은 activity_type+distance_km(혹은 total_count)
  // 조합을 쓸 때 서로 충돌해 값이 낮은 쪽이 조용히 발급 누락된다.
  // (트로피 매트릭스 T01~T04는 전부 activity_type:walking + total_count만 사용하는
  //  이름이 다른 독립 배지라 이 가드가 없으면 셋이 사라진다 — TEAM_FINDINGS.md 참고)
  if (!condition.prerequisite_badge_names || condition.prerequisite_badge_names.length === 0) return null

  const hasModifier = PROGRESSION_MODIFIERS.some(
    (m) => (condition as Record<string, unknown>)[m] !== undefined
  )
  if (hasModifier) return null

  const actType = condition.activity_type ?? 'all'
  if (condition.distance_km !== undefined) {
    return { key: `${actType}:distance_km`, value: condition.distance_km }
  }
  if (condition.total_count !== undefined) {
    return { key: `${actType}:total_count`, value: condition.total_count }
  }
  return null
}
