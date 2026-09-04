/**
 * badgeProgress.ts — computeUserPeriodMetrics / classifyBadgeProgressKind /
 * computeBadgeProgress 유닛 테스트 (티켓 20260904_0631)
 *
 * 프로토타입 §05의 다섯 유형 예시(천일의 방랑자=누적형·밤의 보행자=기록형·
 * 이달의 산책왕=주기형·산악 라이더=2축형(각각)·야생의 첫발=2축형(동시)·
 * 평일의 성실함=다중카운터)를 조건값 그대로 픽스처로 재사용한다. "이번 주/이번 달"은
 * 실행 시각(now)에 따라 달라지므로 테스트 실행 시각 기준 상대 날짜로 활동을 구성해
 * 어느 타임존/어느 날짜에 돌려도 결과가 안정적이도록 한다.
 *
 * 실행: jest 또는 vitest (프레임워크 무관 — describe/it/expect 호환)
 */
import {
  computeUserPeriodMetrics,
  classifyBadgeProgressKind,
  computeBadgeProgress,
  computeRecordRegretLine,
  type UserPeriodMetrics,
} from '../badgeProgress'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition } from '@/types/database'
import type { BadgeTreeLock } from '@/lib/badgeTree'

// ── 테스트용 활동 팩토리 ──────────────────────────────────────────────────

function makeActivity(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaId: 1,
    name: 'Test Activity',
    distanceKm: 5,
    movingTimeSec: 1800,
    elevationGainM: 50,
    jamActivityType: 'walking',
    startDate: '2026-07-20T05:30:00Z',
    startDateLocal: '2026-07-20T05:30:00',
    averageSpeedKmh: 5,
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
    ...overrides,
  }
}

/** Date의 "로컬(런타임 TZ)" 벽시계 성분을 naive 문자열로 포맷 — startDateLocal 규약과 동일 */
function isoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const noLabels = new Map<string, { label: string; unit: string | null }>()

// ── B. computeUserPeriodMetrics ─────────────────────────────────────────

describe('computeUserPeriodMetrics — "이번 주"는 역대 최고 주가 아니다', () => {
  it('2주 전에 몰아서 걸었어도 이번 주 카운트에는 반영되지 않는다', () => {
    const now = new Date()
    const twoWeeksAgo = new Date(now.getTime() - 10 * 86_400_000) // 10일 전 — 어느 요일에서 시작해도 항상 다른 주
    const activities: NormalizedActivity[] = [
      // "역대 최고 주" — 10일 전 기준으로 3회(하루 1회 상한 피하려고 서로 다른 날)
      makeActivity({ startDate: new Date(twoWeeksAgo.getTime()).toISOString(), startDateLocal: isoLocal(twoWeeksAgo) }),
      makeActivity({ startDate: new Date(twoWeeksAgo.getTime() + 86_400_000).toISOString(), startDateLocal: isoLocal(new Date(twoWeeksAgo.getTime() + 86_400_000)) }),
      makeActivity({ startDate: new Date(twoWeeksAgo.getTime() + 2 * 86_400_000).toISOString(), startDateLocal: isoLocal(new Date(twoWeeksAgo.getTime() + 2 * 86_400_000)) }),
      // 이번 주 — 오늘 1회만
      makeActivity({ startDate: now.toISOString(), startDateLocal: isoLocal(now) }),
    ]

    const metrics = computeUserPeriodMetrics('walking', activities, now)

    expect(metrics.weeklyCountCurrent).toBe(1)
    expect(metrics.totalCount).toBe(4) // 누적(전체 이력) 값은 그대로 4 — 대조군
  })

  it('걷기는 하루 1회 상한이 이번 주 카운트에도 적용된다', () => {
    const now = new Date()
    const activities: NormalizedActivity[] = [
      makeActivity({ startDate: now.toISOString(), startDateLocal: isoLocal(now) }),
      makeActivity({ startDate: new Date(now.getTime() + 3600_000).toISOString(), startDateLocal: isoLocal(new Date(now.getTime() + 3600_000)) }),
    ]
    const metrics = computeUserPeriodMetrics('walking', activities, now)
    expect(metrics.weeklyCountCurrent).toBe(1)
  })
})

describe('computeUserPeriodMetrics — "이번 달"은 역대 최고 달이 아니다', () => {
  it('지난달에 훨씬 많이 걸었어도 이번 달 누적 거리에는 포함되지 않는다', () => {
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12, 0, 0)
    const thisMonthDay = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0)

    const activities: NormalizedActivity[] = [
      makeActivity({ distanceKm: 200, startDate: lastMonth.toISOString(), startDateLocal: isoLocal(lastMonth) }),
      makeActivity({ distanceKm: 10, startDate: thisMonthDay.toISOString(), startDateLocal: isoLocal(thisMonthDay) }),
    ]

    const metrics = computeUserPeriodMetrics('walking', activities, now)

    expect(metrics.monthlyKmCurrent).toBe(10)
    expect(metrics.totalDistanceKm).toBe(210) // 누적(전체 이력) 값은 대조군
  })
})

describe('computeUserPeriodMetrics — 걷기 축1 게이트', () => {
  it('게이트 미통과 활동은 모든 집계에서 제외된다', () => {
    const now = new Date()
    const activities: NormalizedActivity[] = [
      makeActivity({ distanceKm: 0.2, startDate: now.toISOString(), startDateLocal: isoLocal(now) }), // 게이트 미통과(거리<0.5km)
      makeActivity({ distanceKm: 5, startDate: now.toISOString(), startDateLocal: isoLocal(now) }), // 게이트 통과
    ]
    const metrics = computeUserPeriodMetrics('walking', activities, now)
    expect(metrics.totalCount).toBe(1)
    expect(metrics.totalDistanceKm).toBe(5)
  })

  it('걷기가 아닌 종목은 게이트를 적용하지 않는다', () => {
    const now = new Date()
    const activities: NormalizedActivity[] = [
      makeActivity({ jamActivityType: 'running', distanceKm: 0.2, startDate: now.toISOString(), startDateLocal: isoLocal(now) }),
    ]
    const metrics = computeUserPeriodMetrics('running', activities, now)
    expect(metrics.totalCount).toBe(1)
  })
})

// ── A. classifyBadgeProgressKind — 다섯 유형 분류 ───────────────────────

describe('classifyBadgeProgressKind', () => {
  it('distance_km 단독(same_activity 없음) → cumulative (동네 산책러)', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'walking', distance_km: 30 })).toBe('cumulative')
  })

  it('active_days_count 단독 → cumulative (천일의 방랑자)', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'walking', active_days_count: 1000 })).toBe('cumulative')
  })

  it('streak_days 단독 → cumulative', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'walking', streak_days: 30 })).toBe('cumulative')
  })

  it('duration_minutes + time_range → record (밤의 보행자, 필터는 축 개수에 영향 없음)', () => {
    expect(
      classifyBadgeProgressKind({ activity_type: 'walking', time_range: { start: '22:00', end: '05:00' }, duration_minutes: 45 })
    ).toBe('record')
  })

  it('weekly_count 단독 → periodic (루틴의 수호자)', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'walking', weekly_count: 5 })).toBe('periodic')
  })

  it('monthly_km 단독(month 없음) → periodic (이달의 산책왕)', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'walking', monthly_km: 50 })).toBe('periodic')
  })

  it('month + monthly_km → periodic (1월의 다짐)', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'walking', month: 1, monthly_km: 100 })).toBe('periodic')
  })

  it('elevation_gain_m + min_speed_kmh(같은 활동 아님) → dual (산악 라이더)', () => {
    expect(
      classifyBadgeProgressKind({ activity_type: 'cycling', min_speed_kmh: 15, elevation_gain_m: 300 })
    ).toBe('dual')
  })

  it('distance_km + elevation_gain_m + same_activity:true → dual (야생의 첫발)', () => {
    expect(
      classifyBadgeProgressKind({ activity_type: 'trail_running', distance_km: 5, elevation_gain_m: 100, same_activity: true })
    ).toBe('dual')
  })

  it('day_of_week 배열 + total_count → multi (평일의 성실함)', () => {
    expect(
      classifyBadgeProgressKind({
        activity_type: 'walking',
        day_of_week: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        total_count: 300,
      })
    ).toBe('multi')
  })

  it('season_count_all 단독 → multi (사계절의 발걸음)', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'walking', season_count_all: 10 })).toBe('multi')
  })

  it('day_of_week 단일값 + total_count → cumulative (필터일 뿐, multi 아님)', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'walking', day_of_week: 'sunday', total_count: 1000 })).toBe('cumulative')
  })

  it('temperature_min_c + total_count → cumulative (온도는 필터, 축 아님 — 폭염 속의 걸음)', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'walking', temperature_min_c: 33, total_count: 5 })).toBe('cumulative')
  })

  it('temperature_max_c 단독(total_count 없음) → record (혹한의 등반자)', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'hiking', temperature_max_c: 10 })).toBe('record')
  })

  it('distance_km 단독 + same_activity:true → record (T23 그냥 나갔다 옴 — 누적/기록형 경계 사례)', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'walking', distance_km: 0.6, same_activity: true })).toBe('record')
  })

  it('duration_minutes + max_pace_sec_per_km → dual (스피드 엔듀러, 071 페이스 전환 이후 형태)', () => {
    expect(
      classifyBadgeProgressKind({ activity_type: 'running', max_pace_sec_per_km: 450, duration_minutes: 30 })
    ).toBe('dual')
  })

  it('3개 이상 축이 겹치면 unsupported (현재 카탈로그에 없는 형태, §H 방어)', () => {
    expect(
      classifyBadgeProgressKind({
        activity_type: 'running',
        distance_km: 10,
        duration_minutes: 30,
        min_speed_kmh: 10,
      })
    ).toBe('unsupported')
  })

  it('측정 가능한 필드가 하나도 없으면 unsupported', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'walking', route: 'hangang' })).toBe('unsupported')
  })
})

// ── A. computeBadgeProgress — kind별 axes 계산 ──────────────────────────

const NO_LOCKS: BadgeTreeLock[] = []

describe('computeBadgeProgress — cumulative', () => {
  it('누적 거리 진행률/잔여 계산 (동네 산책러 스타일)', () => {
    const now = new Date()
    const activities: NormalizedActivity[] = [
      makeActivity({ distanceKm: 12, startDate: now.toISOString(), startDateLocal: isoLocal(now) }),
      makeActivity({ distanceKm: 8, startDate: now.toISOString(), startDateLocal: isoLocal(now) }),
    ]
    const metrics = computeUserPeriodMetrics('walking', activities, now)
    const condition: BadgeCondition = { activity_type: 'walking', distance_km: 30 }

    const result = computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS)

    expect(result.kind).toBe('cumulative')
    if (result.kind === 'unsupported') throw new Error('unreachable')
    expect(result.axes).toEqual([{ key: 'distance_km', label: 'distance_km', unit: null, current: 20, target: 30, met: false, fraction: 20 / 30 }])
    expect(result.progress).toBeCloseTo(20 / 30, 5)
    expect(result.bottleneck).toBe('distance_km')
    expect(result.sameActivity).toBe(false)
    expect(result.periodEndsAt).toBeNull()
    expect(result.gate).toBeNull()
  })

  it('labelMap이 있으면 라벨/단위를 채우고, 없으면 key 원문을 노출한다(2a 폴백)', () => {
    const now = new Date()
    const activities = [makeActivity({ distanceKm: 5, startDate: now.toISOString(), startDateLocal: isoLocal(now) })]
    const metrics = computeUserPeriodMetrics('walking', activities, now)
    const labelMap = new Map([['distance_km', { label: '누적 거리', unit: 'km' }]])

    const result = computeBadgeProgress({ activity_type: 'walking', distance_km: 30 }, metrics, labelMap, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unreachable')
    expect(result.axes[0]).toMatchObject({ label: '누적 거리', unit: 'km' })

    const fallback = computeBadgeProgress({ activity_type: 'walking', distance_km: 30 }, metrics, noLabels, NO_LOCKS)
    if (fallback.kind === 'unsupported') throw new Error('unreachable')
    expect(fallback.axes[0]).toMatchObject({ label: 'distance_km', unit: null })
  })

  it('목표를 이미 채웠으면 met:true, progress 1로 clamp', () => {
    const now = new Date()
    const activities = [makeActivity({ distanceKm: 999, startDate: now.toISOString(), startDateLocal: isoLocal(now) })]
    const metrics = computeUserPeriodMetrics('walking', activities, now)
    const result = computeBadgeProgress({ activity_type: 'walking', distance_km: 30 }, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unreachable')
    expect(result.axes[0].met).toBe(true)
    expect(result.progress).toBe(1)
  })
})

describe('computeBadgeProgress — record (밤의 보행자: duration_minutes + time_range)', () => {
  it('시간대 밖의 더 긴 활동은 기록으로 인정하지 않는다', () => {
    const now = new Date()
    const nightActivity = makeActivity({
      movingTimeSec: 40 * 60,
      distanceKm: 3,
      startDate: '2026-07-20T14:00:00Z',
      startDateLocal: '2026-07-20T23:00:00', // 23시 — 22:00~05:00 야간대 안
    })
    const dayActivity = makeActivity({
      movingTimeSec: 90 * 60, // 야간 활동보다 훨씬 길지만
      distanceKm: 6,
      startDate: '2026-07-20T05:00:00Z',
      startDateLocal: '2026-07-20T14:00:00', // 14시 — 야간대 밖
    })
    const metrics = computeUserPeriodMetrics('walking', [nightActivity, dayActivity], now)
    const condition: BadgeCondition = { activity_type: 'walking', time_range: { start: '22:00', end: '05:00' }, duration_minutes: 45 }

    const result = computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unreachable')

    expect(result.kind).toBe('record')
    expect(result.axes[0]).toMatchObject({ key: 'duration_minutes', current: 40, target: 45, met: false })
  })
})

describe('computeBadgeProgress — record (T23 그냥 나갔다 옴: same_activity + distance_km 단독)', () => {
  it('여러 활동의 누적이 아니라 단일 활동 최고값으로 판정한다', () => {
    const now = new Date()
    const activities = [
      makeActivity({ distanceKm: 0.4, startDate: now.toISOString(), startDateLocal: isoLocal(now) }),
      makeActivity({ distanceKm: 0.4, startDate: now.toISOString(), startDateLocal: isoLocal(now) }),
    ]
    // 게이트 통과 위해 거리 0.5km 이상으로 조정한 케이스도 함께 검증
    const passingActivities = [
      makeActivity({ distanceKm: 0.55, movingTimeSec: 600, averageSpeedKmh: 3.3, startDate: now.toISOString(), startDateLocal: isoLocal(now) }),
    ]
    const metrics = computeUserPeriodMetrics('walking', [...activities, ...passingActivities], now)
    const condition: BadgeCondition = { activity_type: 'walking', distance_km: 0.6, same_activity: true }

    const result = computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unreachable')

    expect(result.kind).toBe('record')
    expect(result.sameActivity).toBe(true)
    // 누적이면 0.4+0.4+0.55=1.35로 이미 충족되지만, 단일 활동 최고는 0.55(게이트 미통과 0.4는 애초 집계 제외)
    expect(result.axes[0]).toMatchObject({ key: 'distance_km', current: 0.55, target: 0.6, met: false })
  })
})

describe('computeBadgeProgress — periodic (이달의 산책왕: monthly_km)', () => {
  it('이번 달 누적만 반영하고 지난달 폭주는 무시한다 + periodEndsAt은 다음 달 1일', () => {
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12, 0, 0)
    const thisMonthDay = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0)
    const activities = [
      makeActivity({ distanceKm: 999, startDate: lastMonth.toISOString(), startDateLocal: isoLocal(lastMonth) }),
      makeActivity({ distanceKm: 25, startDate: thisMonthDay.toISOString(), startDateLocal: isoLocal(thisMonthDay) }),
    ]
    const metrics = computeUserPeriodMetrics('walking', activities, now)
    const result = computeBadgeProgress({ activity_type: 'walking', monthly_km: 50 }, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unreachable')

    expect(result.kind).toBe('periodic')
    expect(result.axes[0]).toMatchObject({ key: 'monthly_km', current: 25, target: 50, met: false })
    expect(result.periodEndsAt).toBe(metrics.monthEndsAt)
    expect(new Date(result.periodEndsAt!).getTime()).toBeGreaterThan(now.getTime())
  })

  it('month 필터가 있고 이번 달이 대상이 아니면 진행 0 (1월의 다짐이 1월이 아닐 때)', () => {
    const now = new Date()
    const otherMonth = ((now.getMonth() + 6) % 12) + 1 // 항상 이번 달과 6개월 차이 — 절대 일치 안 함
    const thisMonthDay = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0)
    const activities = [makeActivity({ distanceKm: 999, startDate: thisMonthDay.toISOString(), startDateLocal: isoLocal(thisMonthDay) })]
    const metrics = computeUserPeriodMetrics('walking', activities, now)

    const result = computeBadgeProgress({ activity_type: 'walking', month: otherMonth, monthly_km: 100 }, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unreachable')
    expect(result.axes[0]).toMatchObject({ current: 0, met: false })
  })

  it('month 필터가 이번 달과 일치하면 이번 달 누적을 그대로 쓴다', () => {
    const now = new Date()
    const thisMonthDay = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0)
    const activities = [makeActivity({ distanceKm: 40, startDate: thisMonthDay.toISOString(), startDateLocal: isoLocal(thisMonthDay) })]
    const metrics = computeUserPeriodMetrics('walking', activities, now)

    const result = computeBadgeProgress({ activity_type: 'walking', month: now.getMonth() + 1, monthly_km: 100 }, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unreachable')
    expect(result.axes[0]).toMatchObject({ current: 40, met: false })
  })
})

describe('computeBadgeProgress — dual (산악 라이더: elevation_gain_m 누적 + min_speed_kmh 독립기록)', () => {
  it('두 축을 독립 평가하고 병목(더 뒤처진 축)을 지목한다', () => {
    const now = new Date()
    const activities = [
      // 고도는 이 활동에서만 쌓임(누적) — 속도는 느림
      makeActivity({ jamActivityType: 'cycling', elevationGainM: 1180, averageSpeedKmh: 15, startDate: now.toISOString(), startDateLocal: isoLocal(now) }),
      // 다른 세션에서 속도만 목표 초과 달성(누적 고도엔 기여) — "각각 다른 라이딩"
      makeActivity({ jamActivityType: 'cycling', elevationGainM: 0, averageSpeedKmh: 21.4, startDate: now.toISOString(), startDateLocal: isoLocal(now) }),
    ]
    const metrics = computeUserPeriodMetrics('cycling', activities, now)
    const condition: BadgeCondition = { activity_type: 'cycling', min_speed_kmh: 20, elevation_gain_m: 1500 }

    const result = computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unreachable')

    expect(result.kind).toBe('dual')
    expect(result.sameActivity).toBe(false)
    const bySpeed = result.axes.find((a) => a.key === 'min_speed_kmh')!
    const byElevation = result.axes.find((a) => a.key === 'elevation_gain_m')!
    expect(bySpeed.met).toBe(true) // 21.4 >= 20
    expect(byElevation).toMatchObject({ current: 1180, target: 1500, met: false })
    expect(result.bottleneck).toBe('elevation_gain_m') // 속도는 이미 충족 → 병목은 고도
    expect(result.progress).toBeCloseTo(1180 / 1500, 5) // 최솟값(평균 아님)
    // DualAxisGauge(2d, 티켓 20260904_1058)가 축별 진행 바에 쓰는 fraction — met인 속도는
    // 1로 clamp, 병목인 고도는 progress(최솟값)와 같아야 한다.
    expect(bySpeed.fraction).toBe(1)
    expect(byElevation.fraction).toBeCloseTo(1180 / 1500, 5)
  })
})

describe('computeBadgeProgress — dual, lower-is-better 축 포함 (스피드 엔듀러: max_pace_sec_per_km + duration_minutes)', () => {
  it('페이스 축(작을수록 좋음)의 fraction은 target/current 비율이다', () => {
    const now = new Date()
    const activities = [
      // 페이스 5:30/km(330초) — 목표 5:30/km(330초)를 정확히 충족
      makeActivity({ jamActivityType: 'running', averageSpeedKmh: 3600 / 330, movingTimeSec: 20 * 60, startDate: now.toISOString(), startDateLocal: isoLocal(now) }),
      // 다른 세션에서 지속시간만 목표 초과 달성 — "이력 전반 독립 평가"
      makeActivity({ jamActivityType: 'running', averageSpeedKmh: 8, movingTimeSec: 40 * 60, startDate: now.toISOString(), startDateLocal: isoLocal(now) }),
    ]
    const metrics = computeUserPeriodMetrics('running', activities, now)
    const condition: BadgeCondition = { activity_type: 'running', max_pace_sec_per_km: 330, duration_minutes: 30 }

    const result = computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unreachable')

    expect(result.kind).toBe('dual')
    const byPace = result.axes.find((a) => a.key === 'max_pace_sec_per_km')!
    const byDuration = result.axes.find((a) => a.key === 'duration_minutes')!
    expect(byPace.met).toBe(true)
    expect(byPace.fraction).toBe(1)
    expect(byDuration).toMatchObject({ current: 40, target: 30, met: true, fraction: 1 })
  })
})

describe('computeBadgeProgress — dual, 한파 축 포함 (알파인 트레일러: elevation_gain_m + temperature_max_c)', () => {
  it('한파 축(temperature_max_c)의 fraction은 COLD_PROGRESS_BASELINE 공식으로 0~1 사이다', () => {
    const now = new Date()
    const activities = [
      makeActivity({ jamActivityType: 'trail_running', elevationGainM: 500, weatherTempC: 8, startDate: now.toISOString(), startDateLocal: isoLocal(now) }),
    ]
    const metrics = computeUserPeriodMetrics('trail_running', activities, now)
    const condition: BadgeCondition = { activity_type: 'trail_running', elevation_gain_m: 1000, temperature_max_c: 5 }

    const result = computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unreachable')

    expect(result.kind).toBe('dual')
    const byCold = result.axes.find((a) => a.key === 'temperature_max_c')!
    expect(byCold).toMatchObject({ current: 8, target: 5, met: false })
    expect(byCold.fraction).toBeGreaterThan(0)
    expect(byCold.fraction).toBeLessThan(1)
  })
})

describe('computeBadgeProgress — dual, same_activity:true (야생의 첫발: distance_km + elevation_gain_m 동시)', () => {
  it('두 축 모두 만족 못한 활동들 중 병목 비율이 가장 큰(가장 근접한) 활동의 값을 노출한다', () => {
    const now = new Date()
    const activities = [
      // 거리는 좋지만 고도가 부족한 시도
      makeActivity({ jamActivityType: 'trail_running', distanceKm: 12.4, elevationGainM: 260, startDate: now.toISOString(), startDateLocal: isoLocal(now) }),
      // 고도는 충분하지만 거리가 훨씬 부족한 시도 — 병목 비율(min(거리비,고도비))이 더 낮음
      makeActivity({ jamActivityType: 'trail_running', distanceKm: 2, elevationGainM: 400, startDate: now.toISOString(), startDateLocal: isoLocal(now) }),
    ]
    const metrics = computeUserPeriodMetrics('trail_running', activities, now)
    const condition: BadgeCondition = { activity_type: 'trail_running', distance_km: 15, elevation_gain_m: 300, same_activity: true }

    const result = computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unreachable')

    expect(result.kind).toBe('dual')
    expect(result.sameActivity).toBe(true)
    const byDistance = result.axes.find((a) => a.key === 'distance_km')!
    const byElevation = result.axes.find((a) => a.key === 'elevation_gain_m')!
    // 첫 번째 활동(12.4km/260m)이 병목 비율(min(12.4/15, 260/300)=min(0.827,0.867)=0.827)이
    // 두 번째 활동(min(2/15,400/300 clamp 1)=0.133)보다 커서 대표로 선택돼야 한다
    expect(byDistance.current).toBe(12.4)
    expect(byElevation.current).toBe(260)
  })

  it('활동이 없으면 두 축 모두 0으로 안전하게 처리한다', () => {
    const now = new Date()
    const metrics = computeUserPeriodMetrics('trail_running', [], now)
    const condition: BadgeCondition = { activity_type: 'trail_running', distance_km: 15, elevation_gain_m: 300, same_activity: true }
    const result = computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unreachable')
    expect(result.axes.every((a) => a.current === 0 && a.met === false)).toBe(true)
  })
})

describe('computeBadgeProgress — multi (평일의 성실함: day_of_week 배열 + total_count)', () => {
  it('요일별 독립 카운터를 계산하고 가장 부족한 요일을 병목으로 지목한다', () => {
    // matchesDayOfWeek는 항상 UTC 기준 판정(Z 명시) — 로컬 타임존과 무관하게 결정적이다.
    // 2026-07-20은 월요일(UTC), 21일 화, 22일 수, 23일 목, 24일 금.
    const mk = (dateOnly: string) => makeActivity({ startDate: `${dateOnly}T00:00:00Z`, startDateLocal: `${dateOnly}T00:00:00` })
    const activities = [
      mk('2026-07-20'), // 월
      mk('2026-07-21'), // 화
      mk('2026-07-22'), // 수
      mk('2026-07-23'), // 목
      mk('2026-07-24'), // 금
    ]
    const metrics = computeUserPeriodMetrics('walking', activities, new Date())
    const condition: BadgeCondition = {
      activity_type: 'walking',
      day_of_week: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      total_count: 5,
    }

    const result = computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unreachable')

    expect(result.kind).toBe('multi')
    expect(result.axes).toHaveLength(5)
    expect(result.axes.map((a) => a.key)).toEqual(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
    expect(result.axes.every((a) => a.current === 1 && a.target === 5)).toBe(true)
    expect(result.progress).toBeCloseTo(1 / 5, 5)
  })
})

describe('computeBadgeProgress — multi (season_count_all)', () => {
  it('4계절 카운터를 모두 반환한다', () => {
    const activities = [
      makeActivity({ startDate: '2026-04-01T00:00:00Z', startDateLocal: '2026-04-01T12:00:00' }), // 봄
      makeActivity({ startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T12:00:00' }), // 여름
    ]
    const metrics = computeUserPeriodMetrics('walking', activities, new Date())
    const result = computeBadgeProgress({ activity_type: 'walking', season_count_all: 10 }, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unreachable')

    expect(result.kind).toBe('multi')
    expect(result.axes).toHaveLength(4)
    expect(result.axes.map((a) => a.key).sort()).toEqual(['fall', 'spring', 'summer', 'winter'])
    expect(result.axes.find((a) => a.key === 'spring')!.current).toBe(1)
    expect(result.axes.find((a) => a.key === 'summer')!.current).toBe(1)
    expect(result.axes.find((a) => a.key === 'fall')!.current).toBe(0)
  })
})

describe('computeBadgeProgress — unsupported', () => {
  it('다섯 유형에 안 걸리는 조건은 conditionKeys와 함께 unsupported를 반환한다', () => {
    const metrics = computeUserPeriodMetrics('running', [], new Date())
    const condition: BadgeCondition = { activity_type: 'running', distance_km: 10, duration_minutes: 30, min_speed_kmh: 10 }
    const result = computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS)
    expect(result.kind).toBe('unsupported')
    if (result.kind !== 'unsupported') throw new Error('unreachable')
    expect(result.conditionKeys.sort()).toEqual(['activity_type', 'distance_km', 'duration_minutes', 'min_speed_kmh'])
  })
})

// ── gate 매핑 ────────────────────────────────────────────────────────────

describe('computeBadgeProgress — gate 매핑 (BadgeTreeLock → 단일 gate)', () => {
  const now = new Date()
  const metrics: UserPeriodMetrics = computeUserPeriodMetrics(
    'walking',
    [makeActivity({ distanceKm: 5, startDate: now.toISOString(), startDateLocal: isoLocal(now) })],
    now
  )
  const condition: BadgeCondition = { activity_type: 'walking', distance_km: 30, prerequisite_badge_names: ['동네 산책러', '밤의 보행자'] }

  it('락이 없으면 gate는 null', () => {
    const result = computeBadgeProgress(condition, metrics, noLabels, [])
    if (result.kind === 'unsupported') throw new Error('unreachable')
    expect(result.gate).toBeNull()
  })

  it('OR 조건 중 하나라도 충족되면 그 락을 met:true로 대표 노출', () => {
    const locks: BadgeTreeLock[] = [
      { kind: 'badge', name: '동네 산책러', href: '/badges/a', fulfilled: false, imageUrl: null },
      { kind: 'badge', name: '밤의 보행자', href: '/badges/b', fulfilled: true, imageUrl: null },
    ]
    const result = computeBadgeProgress(condition, metrics, noLabels, locks)
    if (result.kind === 'unsupported') throw new Error('unreachable')
    expect(result.gate).toEqual({ kind: 'badge', name: '밤의 보행자', href: '/badges/b', met: true })
  })

  it('전부 미충족이면 첫 번째 락을 met:false로 대표 노출', () => {
    const locks: BadgeTreeLock[] = [
      { kind: 'mission', name: '동네 산책러 레벨업', href: '/missions/1', fulfilled: false, imageUrl: null },
    ]
    const result = computeBadgeProgress(condition, metrics, noLabels, locks)
    if (result.kind === 'unsupported') throw new Error('unreachable')
    expect(result.gate).toEqual({ kind: 'mission', name: '동네 산책러 레벨업', href: '/missions/1', met: false })
  })
})

// ── computeRecordRegretLine (기록형 아쉬움 줄, 티켓 20260904_0921) ───────────

describe('computeRecordRegretLine — 기록형 아쉬움 줄(밤의 보행자: duration_minutes + time_range)', () => {
  const condition: BadgeCondition = { activity_type: 'walking', time_range: { start: '22:00', end: '05:00' }, duration_minutes: 45 }

  it('직전 활동이 임계값의 85% 이상이면 아쉬움 데이터를 반환한다', () => {
    const now = new Date()
    // 40/45 = 88.9% — 임계값 이상, met:false
    const nightActivity = makeActivity({
      movingTimeSec: 40 * 60, distanceKm: 3,
      startDate: '2026-07-20T14:00:00Z', startDateLocal: '2026-07-20T23:00:00',
    })
    const metrics = computeUserPeriodMetrics('walking', [nightActivity], now)

    const regret = computeRecordRegretLine(condition, metrics, noLabels)
    expect(regret).toMatchObject({ key: 'duration_minutes', current: 40, target: 45 })
  })

  it('직전 활동이 임계값의 85% 미만이면 null(노이즈 방지)', () => {
    const now = new Date()
    // 10/45 = 22% — 임계값 미달
    const nightActivity = makeActivity({
      movingTimeSec: 10 * 60, distanceKm: 1,
      startDate: '2026-07-20T14:00:00Z', startDateLocal: '2026-07-20T23:00:00',
    })
    const metrics = computeUserPeriodMetrics('walking', [nightActivity], now)

    expect(computeRecordRegretLine(condition, metrics, noLabels)).toBeNull()
  })

  it('직전 활동이 이미 조건을 채웠으면 null(아쉬움이 아니라 이미 달성)', () => {
    const now = new Date()
    const nightActivity = makeActivity({
      movingTimeSec: 50 * 60, distanceKm: 3,
      startDate: '2026-07-20T14:00:00Z', startDateLocal: '2026-07-20T23:00:00',
    })
    const metrics = computeUserPeriodMetrics('walking', [nightActivity], now)

    expect(computeRecordRegretLine(condition, metrics, noLabels)).toBeNull()
  })

  it('시간대 밖의 활동은 관련 풀에서 제외된다(buildScalarAxis와 동일 필터)', () => {
    const now = new Date()
    // 시간대 밖(낮)의 활동만 있으면 관련 풀이 비어 null
    const dayActivity = makeActivity({
      movingTimeSec: 40 * 60, distanceKm: 3,
      startDate: '2026-07-20T05:00:00Z', startDateLocal: '2026-07-20T14:00:00',
    })
    const metrics = computeUserPeriodMetrics('walking', [dayActivity], now)

    expect(computeRecordRegretLine(condition, metrics, noLabels)).toBeNull()
  })
})

describe('computeRecordRegretLine — record가 아닌 kind는 대상이 아니다', () => {
  it('cumulative(동네 산책러류)는 항상 null', () => {
    const now = new Date()
    const metrics = computeUserPeriodMetrics(
      'walking',
      [makeActivity({ distanceKm: 90, startDate: now.toISOString(), startDateLocal: isoLocal(now) })],
      now
    )
    const condition: BadgeCondition = { activity_type: 'walking', distance_km: 100 }
    expect(computeRecordRegretLine(condition, metrics, noLabels)).toBeNull()
  })
})
