/**
 * 백필 현황 집계 회귀 테스트 (티켓 20260905_1242)
 *
 * 이 집계는 **임계값 설계(20260905_0035)의 유일한 실측 근거**가 된다. 티켓 20260905_0039가
 * 유저를 전원 삭제하면 지금의 실데이터는 사라지고, 백필 직후 한 번 본 숫자만 남는다.
 * 그래서 세는 규칙을 여기에 고정한다 — 특히 «값이 없으면 키가 없다» 관례에서
 * 보유 수를 잘못 세지 않는지.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/backfill-stats.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  median,
  hasAnyExtendedField,
  summarizeCoverage,
  summarizeUsers,
  splitBackfillable,
  UNCLASSIFIED_SPORT,
  type ActivityStatRow,
} from '../backfillStats'

function row(
  overrides: Partial<ActivityStatRow> & { normalized?: Record<string, unknown> } = {}
): ActivityStatRow {
  return {
    user_id: 'u1',
    jam_activity_type: 'running',
    normalized: { stravaId: 1, name: '한강 러닝' },
    ...overrides,
  }
}

describe('median', () => {
  it('홀수 개면 가운데 값', () => {
    expect(median([180, 90, 170])).toBe(170)
  })

  it('짝수 개면 가운데 둘의 평균(소수점 1자리)', () => {
    expect(median([88, 91])).toBe(89.5)
  })

  it('값이 없으면 null — 0으로 뭉개지 않는다', () => {
    expect(median([])).toBeNull()
  })

  it('원본 배열을 정렬로 훼손하지 않는다', () => {
    const values = [3, 1, 2]
    median(values)
    expect(values).toEqual([3, 1, 2])
  })
})

describe('hasAnyExtendedField', () => {
  it('확장 필드가 하나라도 있으면 true', () => {
    expect(hasAnyExtendedField({ distanceKm: 10, elapsedTimeSec: 3600 })).toBe(true)
  })

  it('확장 필드가 하나도 없으면 false — 백필 전 행이다', () => {
    expect(hasAnyExtendedField({ distanceKm: 10, movingTimeSec: 3000 })).toBe(false)
  })

  it('값이 0·false여도 «있다»로 센다 (키의 존재가 기준이다)', () => {
    expect(hasAnyExtendedField({ maxElevationM: 0 })).toBe(true)
    expect(hasAnyExtendedField({ deviceWatts: false })).toBe(true)
  })

  it('normalized가 비어 있거나 형태가 깨져 있어도 죽지 않는다', () => {
    expect(hasAnyExtendedField(null)).toBe(false)
    expect(hasAnyExtendedField('문자열')).toBe(false)
    expect(hasAnyExtendedField([])).toBe(false)
  })
})

describe('summarizeCoverage — 종목별 커버리지', () => {
  it('종목별로 나눠 세고 활동 수 내림차순으로 정렬한다', () => {
    const coverage = summarizeCoverage([
      row({ jam_activity_type: 'running' }),
      row({ jam_activity_type: 'running' }),
      row({ jam_activity_type: 'cycling' }),
    ])
    expect(coverage.map((c) => c.sport)).toEqual(['running', 'cycling'])
    expect(coverage[0].activityCount).toBe(2)
  })

  it('jam_activity_type이 NULL이면 미분류로 묶는다', () => {
    const coverage = summarizeCoverage([row({ jam_activity_type: null })])
    expect(coverage[0].sport).toBe(UNCLASSIFIED_SPORT)
  })

  it('심박수·파워·케이던스는 키가 있는 행만 센다', () => {
    const [coverage] = summarizeCoverage([
      row({ normalized: { avgHeartrateBpm: 150, avgWatts: 200, avgCadence: 88 } }),
      row({ normalized: { avgHeartrateBpm: 140 } }),
      row({ normalized: {} }),
    ])
    expect(coverage.activityCount).toBe(3)
    expect(coverage.avgHeartrateBpmCount).toBe(2)
    expect(coverage.avgWattsCount).toBe(1)
    expect(coverage.avgCadenceCount).toBe(1)
  })

  it('deviceWatts는 true인 행만 «실측 파워»로 센다 (false는 추정 파워다)', () => {
    const [coverage] = summarizeCoverage([
      row({ normalized: { avgWatts: 200, deviceWatts: true } }),
      row({ normalized: { avgWatts: 190, deviceWatts: false } }),
      row({ normalized: { avgWatts: 180 } }),
    ])
    expect(coverage.avgWattsCount).toBe(3)
    expect(coverage.deviceWattsTrueCount).toBe(1)
  })

  it('케이던스 중앙값·최소·최대를 함께 낸다 — 90대인지 180대인지 판별용이다', () => {
    const [coverage] = summarizeCoverage([
      row({ normalized: { avgCadence: 86 } }),
      row({ normalized: { avgCadence: 90 } }),
      row({ normalized: { avgCadence: 94 } }),
    ])
    expect(coverage.avgCadenceMedian).toBe(90)
    expect(coverage.avgCadenceMin).toBe(86)
    expect(coverage.avgCadenceMax).toBe(94)
  })

  it('케이던스가 한 건도 없으면 중앙값·범위가 null이다', () => {
    const [coverage] = summarizeCoverage([row({ normalized: {} })])
    expect(coverage.avgCadenceMedian).toBeNull()
    expect(coverage.avgCadenceMin).toBeNull()
    expect(coverage.avgCadenceMax).toBeNull()
  })

  it('종목 통계가 서로 섞이지 않는다 (러닝 spm과 자전거 rpm은 다른 축이다)', () => {
    const coverage = summarizeCoverage([
      row({ jam_activity_type: 'running', normalized: { avgCadence: 90 } }),
      row({ jam_activity_type: 'running', normalized: { avgCadence: 92 } }),
      row({ jam_activity_type: 'cycling', normalized: { avgCadence: 78 } }),
    ])
    const running = coverage.find((c) => c.sport === 'running')!
    const cycling = coverage.find((c) => c.sport === 'cycling')!
    expect(running.avgCadenceMedian).toBe(91)
    expect(cycling.avgCadenceMedian).toBe(78)
  })
})

describe('summarizeUsers — 유저별 현황', () => {
  const connections = [{ user_id: 'u1' }, { user_id: 'u2' }]
  const profiles = [
    { id: 'u1', email: 'a@example.com', username: '가나' },
    { id: 'u2', email: 'b@example.com', username: null },
  ]

  it('저장 활동 수와 확장 필드 보유 수를 유저별로 센다', () => {
    const users = summarizeUsers(connections, profiles, [
      row({ user_id: 'u1', normalized: { elapsedTimeSec: 100 } }),
      row({ user_id: 'u1', normalized: {} }),
      row({ user_id: 'u2', normalized: { avgWatts: 200 } }),
    ])
    const u1 = users.find((u) => u.userId === 'u1')!
    expect(u1.activityCount).toBe(2)
    expect(u1.extendedCount).toBe(1)
    expect(u1.username).toBe('가나')
  })

  it('마지막 백필 시각은 extendedBackfilledAt의 최댓값이다', () => {
    const users = summarizeUsers([{ user_id: 'u1' }], profiles, [
      row({ user_id: 'u1', normalized: { extendedBackfilledAt: '2026-09-05T01:00:00.000Z' } }),
      row({ user_id: 'u1', normalized: { extendedBackfilledAt: '2026-09-05T03:00:00.000Z' } }),
      row({ user_id: 'u1', normalized: {} }),
    ])
    expect(users[0].lastBackfilledAt).toBe('2026-09-05T03:00:00.000Z')
  })

  it('백필한 적이 없으면 마지막 백필 시각이 null이다', () => {
    const users = summarizeUsers([{ user_id: 'u1' }], profiles, [row({ user_id: 'u1' })])
    expect(users[0].lastBackfilledAt).toBeNull()
  })

  it('활동이 한 건도 없는 연결 유저도 목록에서 빠지지 않는다', () => {
    const users = summarizeUsers(connections, profiles, [row({ user_id: 'u1' })])
    expect(users.map((u) => u.userId).sort()).toEqual(['u1', 'u2'])
    expect(users.find((u) => u.userId === 'u2')!.activityCount).toBe(0)
  })

  it('연결이 없는 유저의 활동은 목록에 끼어들지 않는다', () => {
    const users = summarizeUsers([{ user_id: 'u1' }], profiles, [
      row({ user_id: 'u1' }),
      row({ user_id: 'u9' }),
    ])
    expect(users).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 게이트 리뷰 WARN 3 반영 — 커버리지 분모에서 백필 불가능한 행을 뺀다
// ─────────────────────────────────────────────────────────────────────────

describe('splitBackfillable — Strava 연결이 없는 유저의 활동은 분모에서 뺀다', () => {
  // 실측(2026-09-05): strava_activities 873행 중 19행이 strava_connections 없는 유저 4명의
  // 것이다. 분모에 남기면 백필을 전부 돌려도 커버리지가 97.8%에서 멈추고,
  // 「달리기 97%」를 「Strava가 3%에 값을 안 줬다」로 오독하게 된다.
  const rows = [
    row({ user_id: 'u1', normalized: { avgCadence: 88 } }),
    row({ user_id: 'u1', normalized: {} }),
    row({ user_id: 'orphan1', normalized: {} }),
    row({ user_id: 'orphan2', normalized: {} }),
  ]

  it('연결된 유저의 행만 백필 대상으로 남는다', () => {
    const { backfillable, orphaned } = splitBackfillable(rows, ['u1'])
    expect(backfillable).toHaveLength(2)
    expect(orphaned).toHaveLength(2)
    expect(orphaned.map((r) => r.user_id)).toEqual(['orphan1', 'orphan2'])
  })

  it('커버리지가 백필 대상만 세면 100%에 닿을 수 있다', () => {
    const { backfillable } = splitBackfillable(rows, ['u1'])
    const coverage = summarizeCoverage(backfillable)
    expect(coverage.reduce((n, c) => n + c.activityCount, 0)).toBe(2)
    // 고아 행을 남겼다면 4가 되어 커버리지 상한이 50%로 묶인다
    expect(summarizeCoverage(rows).reduce((n, c) => n + c.activityCount, 0)).toBe(4)
  })

  it('전원이 연결돼 있으면 고아가 0이다', () => {
    const { backfillable, orphaned } = splitBackfillable(rows, ['u1', 'orphan1', 'orphan2'])
    expect(backfillable).toHaveLength(4)
    expect(orphaned).toHaveLength(0)
  })

  it('연결 목록이 비면 전부 고아다 — 조용히 통과시키지 않는다', () => {
    const { backfillable, orphaned } = splitBackfillable(rows, [])
    expect(backfillable).toHaveLength(0)
    expect(orphaned).toHaveLength(4)
  })
})
