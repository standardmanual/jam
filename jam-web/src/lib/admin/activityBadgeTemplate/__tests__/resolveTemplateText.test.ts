import { describe, expect, it } from 'vitest'
import { ALL_CONDITION_KEYS } from '@/lib/badge-engine/conditionRegistry'
import type { BadgeCondition } from '@/types/database'
import {
  AUXILIARY_CONDITION_KEYS,
  TEMPLATE_RULE_KEYS,
  UNSUPPORTED_CONDITION_KEYS,
  resolveBadgeTemplateText as r,
} from '../resolveTemplateText'

const c = (x: Record<string, unknown>) => x as BadgeCondition
const TR = { start: '22:00', end: '04:00' }

describe('resolveBadgeTemplateText 규칙표', () => {
  it.each([
    [{ single_distance_km: 21.1 }, 'metric', '21.1km'],
    [{ distance_km: 2500 }, 'metric', '2,500km'],
    [{ single_distance_km: 42.195 }, 'metric', '42.195km'],
    [{ max_elevation_m: 1947 }, 'metric', '1,947m'],
    [{ duration_minutes: 60 }, 'metric', '1시간'],
    [{ duration_minutes: 90 }, 'metric', '1시간 30분'],
    [{ duration_minutes: 45 }, 'metric', '45분'],
    [{ max_pace_sec_per_km: 375 }, 'metric', '6분 15초'],
    [{ max_pace_sec_per_km: 300 }, 'metric', '5분'],
    [{ personal_record_break: true, personal_record_break_metric: 'distance_km' }, 'metric', '최장 거리'],
    [{ personal_record_break: true, personal_record_break_metric: 'max_pace_sec_per_km' }, 'metric', '최고 페이스'],
    [{ streak_days: 14 }, 'streak', '14일 연속'],
    [{ active_week_min_days: 3, active_week_streak: 4 }, 'streak', '4주 연속'],
    [{ return_streak_weeks: 2 }, 'streak', '2주 연속'],
    [{ return_gap_days: 7 }, 'streak', '7일 만에'],
    [{ active_days_count: 100 }, 'days', '100일'],
    [{ same_spot_checkin_days: 10 }, 'days', '10일'],
    [{ time_range: TR, total_count: 5 }, 'days', '5일'],
    [{ jam_week_min_earned: 230, jam_week_count: 5 }, 'days', '5주'],
    [{ full_week_count: 3 }, 'days', '3주'],
    [{ full_season_year_count: 3 }, 'days', '3년'],
    [{ checkin_season_year_count: 2 }, 'days', '2년'],
    [{ capsule_open_count: 5 }, 'count', '5회'],
    [{ mission_complete_count: 1 }, 'count', '1회'],
    [{ new_checkin_badge_count: 50 }, 'count', '50개'],
    [{ new_checkin_badge_count: 1 }, 'count', '첫 체크인'],
    [{ distinct_activity_type_count: 3 }, 'count', '3가지'],
    [{ other_tribe_item_kinds_count: 20 }, 'count', '20종'],
    [{ follower_count: 20 }, 'count', '20명'],
    [{ chapter_reached: 10 }, 'count', '챕터 10'],
    [{ jam_total_earned: 1250 }, 'count', '잼 1,250'],
    [{ jam_weekly_earned: 110000 }, 'count', '잼 110,000'],
  ])('%j -> %s %s', (cond, classKey, value) => {
    expect(r({ condition_json: c(cond) })).toEqual({ classKey, value })
  })
})

describe('우선순위와 예외', () => {
  it('streak가 days보다 먼저', () => {
    expect(r({ condition_json: c({ jam_week_min_earned: 230, jam_week_streak: 4 }) })).toEqual({
      classKey: 'streak',
      value: '4주 연속',
    })
  })
  it('밤 배지', () => {
    expect(r({ condition_json: c({ time_range: TR }), is_hidden: true })).toEqual({ classKey: 'days', value: '밤' })
    expect(r({ condition_json: c({ time_range: TR }), is_hidden: false })).toEqual({ classKey: 'etc', value: '' })
  })
  it('판정 불가는 기타', () => {
    expect(r({ condition_json: c({ route: 'x' }) })).toEqual({ classKey: 'etc', value: '' })
    expect(r({ condition_json: c({}) })).toEqual({ classKey: 'etc', value: '' })
    expect(r({ condition_json: null })).toEqual({ classKey: 'etc', value: '' })
    expect(r({ condition_json: c({ activity_type: 'running' }) })).toEqual({ classKey: 'etc', value: '' })
  })
})

describe('기타 분류의 값', () => {
  it.each([
    [{ total_count: 30, activity_type: 'running' }, '30회'],
    [{ weekly_count: 3, repeat_count: 4, activity_type: 'cycling' }, '주 3회'],
    [{ day_of_month: 1, total_count: 12, activity_type: 'walking' }, '12회'],
    [{ total_count: 5, weekly_count: 2 }, '5회'],
  ])('%j → etc %s', (cond, value) => {
    expect(r({ condition_json: c(cond) })).toEqual({ classKey: 'etc', value })
  })
})

describe('새 칸 감시', () => {
  it('등록된 모든 조건 칸이 규칙표·보조·미지원 중 하나에 있다', () => {
    const known = new Set([...TEMPLATE_RULE_KEYS, ...AUXILIARY_CONDITION_KEYS, ...UNSUPPORTED_CONDITION_KEYS])
    const missing = ALL_CONDITION_KEYS.filter((k) => !known.has(k))
    expect(missing).toEqual([])
  })
})
