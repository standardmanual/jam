/**
 * 액티비티 배지의 획득 조건(condition_json)에서 템플릿 분류와 값 글자를 뽑는 순수 함수.
 * 티켓 20261115_2354. DB·서버 전용 모듈을 들여오지 않는다.
 */
import type { BadgeCondition } from '@/types/database'

export type BadgeTemplateClassKey = 'metric' | 'days' | 'streak' | 'count'

export const BADGE_TEMPLATE_CLASS_LABEL: Record<BadgeTemplateClassKey, string> = {
  metric: '운동 수치',
  days: '쌓은 날',
  streak: '이어 온 날',
  count: '횟수와 양',
}

export interface BadgeTemplateText {
  classKey: BadgeTemplateClassKey
  value: string
}

type Cond = Record<string, unknown>

const num = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 20 })

const suffix = (unit: string) => (n: number) => `${num(n)}${unit}`

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${num(minutes)}분`
  const h = Math.floor(minutes / 60)
  const m = Math.round((minutes - h * 60) * 100) / 100
  return m === 0 ? `${num(h)}시간` : `${num(h)}시간 ${num(m)}분`
}

function formatPace(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec - m * 60)
  return s === 0 ? `${num(m)}분` : `${num(m)}분 ${num(s)}초`
}

interface Rule {
  key: keyof BadgeCondition
  format: (n: number) => string
}

const rules = (formatter: (n: number) => string, keys: (keyof BadgeCondition)[]): Rule[] =>
  keys.map((key) => ({ key, format: formatter }))

/** 분류별 대응표(조건 칸 → 값 꼴). */
const RULES: Record<BadgeTemplateClassKey, Rule[]> = {
  streak: [
    ...rules(suffix('일 연속'), ['streak_days']),
    ...rules(suffix('주 연속'), ['active_week_streak', 'jam_week_streak', 'return_streak_weeks']),
    ...rules(suffix('일 만에'), ['return_gap_days']),
  ],
  days: [
    ...rules(suffix('일'), ['active_days_count', 'same_spot_checkin_days']),
    ...rules(suffix('주'), ['jam_week_count', 'full_week_count']),
    ...rules(suffix('년'), ['full_season_year_count', 'checkin_season_year_count']),
  ],
  metric: [
    ...rules(suffix('km'), ['single_distance_km', 'distance_km']),
    ...rules(suffix('m'), ['single_elevation_m', 'elevation_gain_m', 'max_elevation_m']),
    ...rules(formatDuration, ['duration_minutes']),
    ...rules(formatPace, ['max_pace_sec_per_km']),
  ],
  count: [
    ...rules(suffix('회'), [
      'capsule_open_count',
      'locked_item_open_count',
      'combine_success_count',
      'cross_tribe_combine_success_count',
      'dropped_item_picked_up_count',
      'pickup_item_count',
      'collection_complete_count',
      'mission_complete_count',
    ]),
    ...rules((n) => (n === 1 ? '첫 체크인' : `${num(n)}개`), ['new_checkin_badge_count']),
    ...rules(suffix('가지'), ['distinct_activity_type_count']),
    ...rules(suffix('종'), ['other_tribe_item_kinds_count']),
    ...rules(suffix('명'), ['follower_count', 'following_count']),
    ...rules((n) => `챕터 ${num(n)}`, ['chapter_reached']),
    ...rules((n) => `잼 ${num(n)}`, ['jam_total_earned', 'jam_weekly_earned']),
  ],
}

/** 그 자체로 분류를 정하지 않는 칸(다른 칸의 전제, 종목·시간대 한정) */
export const AUXILIARY_CONDITION_KEYS: readonly string[] = [
  'activity_type',
  'active_week_min_days',
  'jam_week_min_earned',
  'time_range',
  'day_of_week',
  'repeat_count',
]

/** 분류 규칙이 아직 없는 칸. 새로 지원할 때 대응표로 옮긴다. */
export const UNSUPPORTED_CONDITION_KEYS: readonly string[] = [
  'min_speed_kmh',
  'weekend_duration_hours',
  'weekly_count',
  'month',
  'monthly_km',
  'season',
  'season_count',
  'season_count_all',
  'temperature_min_c',
  'temperature_max_c',
  'route',
  'poi_id',
  'prerequisite_badge_names',
  'same_activity',
  'mission_reward',
  'max_speed_kmh',
  'avg_heartrate_bpm',
  'avg_watts',
  'avg_cadence',
  'rest_after_streak',
  'rest_after_long',
  'interval_days',
  'daily_once_count',
  'negative_split',
  'weekly_streak',
  'distinct_time_bands',
  'day_of_month',
  'activities_within_hours',
  'personal_record_break_metric',
  'month_over_month_ratio',
  'vs_personal_average',
  'cumulative_duration_hours',
  'monthly_count',
  'cross_in_axis',
  'cross_between_axis',
  'gate_mission_badge',
  'daily_sync_count',
  'daily_sync_streak_days',
  'checkin_category_count',
  'checkin_badge_count',
  'combine_attempt_count',
  'combine_fail_count',
  'drop_item_count',
  'pickup_from_user_count',
  'picked_up_by_user_count',
  'days_since_signup',
  'signup_recent_active_days',
  'weekly_active_days',
  'locked_item_pickup_count',
]

/** 규칙표 칸 전체(새 칸 감시 시험이 쓴다) */
export const TEMPLATE_RULE_KEYS: readonly string[] = [
  ...Object.values(RULES).flatMap((rs) => rs.map((r) => r.key as string)),
  'total_count',
  'personal_record_break',
]

const PRIORITY: BadgeTemplateClassKey[] = ['streak', 'days', 'metric', 'count']

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function resolvePersonalRecord(c: Cond): BadgeTemplateText | null {
  if (!c.personal_record_break) return null
  const metric = c.personal_record_break_metric
  if (metric === 'distance_km' || metric === 'single_distance_km') return { classKey: 'metric', value: '최장 거리' }
  if (metric === 'max_pace_sec_per_km') return { classKey: 'metric', value: '최고 페이스' }
  return null
}

export function resolveBadgeTemplateText(input: {
  condition_json: BadgeCondition | null | undefined
  is_hidden?: boolean | null
}): BadgeTemplateText | null {
  const c = (input.condition_json ?? {}) as Cond

  for (const classKey of PRIORITY) {
    for (const rule of RULES[classKey]) {
      const v = c[rule.key]
      if (isNum(v)) return { classKey, value: rule.format(v) }
    }
    if (classKey === 'days' && isNum(c.total_count) && (c.time_range != null || c.day_of_week != null)) {
      return { classKey: 'days', value: suffix('일')(c.total_count) }
    }
    if (classKey === 'metric') {
      const pr = resolvePersonalRecord(c)
      if (pr) return pr
    }
  }

  if (input.is_hidden && c.time_range != null) return { classKey: 'days', value: '밤' }
  return null
}
