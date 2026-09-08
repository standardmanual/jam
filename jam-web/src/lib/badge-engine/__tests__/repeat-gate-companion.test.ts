/**
 * 티켓 20260908_1438 — 반복형(`repeat_count`)이 기간 단위(`streak_days`) 또는 휴식 키와
 * 결합하고 게이트 필드(`cross_in_axis`/`cross_between_axis`/`gate_mission_badge`)까지
 * 함께 있으면 회차가 영원히 0으로 fail-closed되던 문제의 회귀 테스트.
 *
 * 원인: `detectPeriodOccurrenceDriver`의 `ALLOWED_COMPANIONS`와
 * `detectRestOccurrenceDriver`의 `REST_OCCURRENCE_ALLOWED_COMPANIONS`가 동반 키를
 * `repeat_count`·`activity_type`·`day_of_week`로만 엄격히 제한해 게이트 키가 있으면
 * `undefined`를 돌려주고, 그러면 `unconsumedRepeatConditionKeys`가 `streak_days`(또는
 * 휴식 키)를 "회차 술어가 못 다루는 키"로 판정해 회차를 0으로 fail-closed 처리했다.
 * 실측 재현: cycling:N1 "사흘의 바퀴" epic/mystic(같은 조합 + cross_between_axis 또는
 * gate_mission_badge 추가)이 회차 0으로 막힘.
 *
 * 게이트 필드는 "보유 여부"만 확인하는 필터 성격이라(`evaluateBadgeGates`가 별도로 판정)
 * 회차 집계 의미를 바꾸지 않는다 — `CONSUMED_REPEAT_KEYS`(활동 1건 단위 경로)가 이미
 * 같은 전제로 게이트 키를 포함하고 있었다.
 *
 * 실행: `npx vitest run src/lib/badge-engine/__tests__/repeat-gate-companion.test.ts`
 */
import { collectRepeatOccurrences, isPeriodDrivenRepeatCondition, isRestDrivenRepeatCondition } from '../repeatOccurrences'
import { classifyBadgeProgressKind } from '../badgeProgress'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition } from '@/types/database'

let seq = 0
function act(ymd: string, overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  seq += 1
  return {
    stravaId: seq,
    name: `act ${ymd}`,
    distanceKm: 10,
    movingTimeSec: 3600,
    elevationGainM: 50,
    jamActivityType: 'cycling',
    startDate: `${ymd}T05:30:00Z`,
    startDateLocal: `${ymd}T05:30:00`,
    averageSpeedKmh: 20,
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
    ...overrides,
  }
}

const DAY_MS = 86_400_000
function daysFrom(startYmd: string, n: number, type: NormalizedActivity['jamActivityType'] = 'cycling'): NormalizedActivity[] {
  const base = Date.parse(`${startYmd}T00:00:00Z`)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base + i * DAY_MS).toISOString().slice(0, 10)
    return act(d, { jamActivityType: type })
  })
}

const CROSS_BETWEEN_AXIS_SAMPLE = { family_keys: ['other_axis_family'], min_rarity: 'rare' as const }
const GATE_MISSION_BADGE_SAMPLE = { family_keys: ['mission_family'] }

describe('기간 단위 회차(streak_days) + repeat_count + 게이트 — 회차가 0으로 fail-closed되지 않는다', () => {
  it('{streak_days, repeat_count, cross_between_axis} — cycling:N1 epic 형태', () => {
    const cond: BadgeCondition = {
      activity_type: 'cycling',
      streak_days: 3,
      repeat_count: 2,
      cross_between_axis: CROSS_BETWEEN_AXIS_SAMPLE,
    }
    expect(isPeriodDrivenRepeatCondition(cond)).toBe(true)
    const acts = [...daysFrom('2026-06-01', 3), ...daysFrom('2026-06-10', 3)]
    expect(collectRepeatOccurrences(cond, acts)).toHaveLength(2)
  })

  it('{streak_days, repeat_count, cross_between_axis, gate_mission_badge} — cycling:N1 mystic 형태', () => {
    const cond: BadgeCondition = {
      activity_type: 'cycling',
      streak_days: 3,
      repeat_count: 2,
      cross_between_axis: CROSS_BETWEEN_AXIS_SAMPLE,
      gate_mission_badge: GATE_MISSION_BADGE_SAMPLE,
    }
    expect(isPeriodDrivenRepeatCondition(cond)).toBe(true)
    const acts = [...daysFrom('2026-06-01', 3), ...daysFrom('2026-06-10', 3)]
    expect(collectRepeatOccurrences(cond, acts)).toHaveLength(2)
  })

  it('진행 계산도 같은 판정으로 repeat 축을 그린다 — unsupported로 새지 않는다', () => {
    const cond: BadgeCondition = {
      activity_type: 'cycling',
      streak_days: 3,
      repeat_count: 2,
      cross_between_axis: CROSS_BETWEEN_AXIS_SAMPLE,
    }
    expect(classifyBadgeProgressKind(cond)).toBe('repeat')
  })
})

describe('휴식 키 + repeat_count + 게이트 — 회차가 0으로 fail-closed되지 않는다', () => {
  it('{rest_after_streak, streak_days, repeat_count, cross_in_axis} — 게이트가 있어도 복귀 사건을 센다', () => {
    const cond: BadgeCondition = {
      activity_type: 'running',
      streak_days: 3,
      rest_after_streak: 2,
      repeat_count: 2,
      cross_in_axis: { family_keys: ['same_axis_family'] },
    }
    expect(isRestDrivenRepeatCondition(cond)).toBe(true)

    // 3일 연속 → 2일 휴식 사이클을 2번 반복 (3개 블록, 전환 2번)
    const acts: NormalizedActivity[] = []
    let cursor = Date.parse('2026-01-01T00:00:00Z')
    for (let c = 0; c <= 2; c++) {
      for (let d = 0; d < 3; d++) {
        acts.push(act(new Date(cursor + d * DAY_MS).toISOString().slice(0, 10), { jamActivityType: 'running' }))
      }
      cursor += (3 + 2) * DAY_MS
    }
    expect(collectRepeatOccurrences(cond, acts)).toHaveLength(2)
  })

  it('진행 계산도 같은 판정으로 repeat 축을 그린다 — unsupported로 새지 않는다', () => {
    const cond: BadgeCondition = {
      activity_type: 'running',
      return_gap_days: 30,
      repeat_count: 2,
      gate_mission_badge: GATE_MISSION_BADGE_SAMPLE,
    }
    expect(classifyBadgeProgressKind(cond)).toBe('repeat')
  })
})
