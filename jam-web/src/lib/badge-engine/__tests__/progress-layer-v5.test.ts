/**
 * 진행 계산 계층 확장 회귀 — 신규 kind 3종 · 마지막 활동값 · remaining · 단일 출처
 * (티켓 20260905_0031, 마스터 20260905_0026)
 *
 * 이 파일이 못 박는 것 (티켓 완료 조건 그대로):
 *   ① 기록형이 «마지막 활동 값»을 쓴다 — 누적을 쓰면 진행률이 항상 100%가 된다
 *   ② leveled / repeat / rest 세 kind가 분류되고 축이 나온다
 *   ③ 휴식 문구에 권유형 표현이 없다 (문구 검증은 badgeProgressText.test.ts)
 *   ④ 교차 게이트가 붙은 배지가 «조건 충족»으로 거짓 표시되지 않는다
 *   ⑤ 「작을수록 좋음」 축의 remaining 부호가 맞다
 *   ⑥ 진행률 축 목록과 발급 판정 목록이 같은 출처를 쓴다 (재선언 없음)
 *
 * 실행: `npx vitest run src/lib/badge-engine/__tests__/progress-layer-v5.test.ts`
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  computeUserPeriodMetrics,
  classifyBadgeProgressKind,
  computeBadgeProgress,
  computeRecordRegretLine,
} from '../badgeProgress'
import {
  PER_ACTIVITY_KEYS,
  CUMULATIVE_SAME_ACTIVITY_KEYS,
  SCALAR_AXIS_KEYS,
} from '../conditionAxes'
import { collectRepeatOccurrences } from '../repeatOccurrences'
import { crossGateKeysIn } from '../crossGate'
import { computeConditionMetBadgeIds } from '@/lib/badgeTreeConditionCheck.server'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition, BadgeGateRequirement } from '@/types/database'
import type { BadgeTreeLock } from '@/lib/badgeTree'

const NO_LOCKS: BadgeTreeLock[] = []
const noLabels = new Map<string, { label: string; unit: string | null }>()

let seq = 0
function run(ymd: string, overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  seq += 1
  return {
    stravaId: seq,
    name: `run ${ymd}`,
    distanceKm: 10,
    movingTimeSec: 3600,
    elevationGainM: 50,
    jamActivityType: 'running',
    startDate: `${ymd}T05:30:00Z`,
    startDateLocal: `${ymd}T05:30:00`,
    averageSpeedKmh: 10,
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
    ...overrides,
  }
}

/** 시작일부터 n일 연속 활동 */
function consecutive(startYmd: string, n: number, overrides: Partial<NormalizedActivity> = {}): NormalizedActivity[] {
  const base = Date.parse(`${startYmd}T00:00:00Z`)
  return Array.from({ length: n }, (_, i) => run(new Date(base + i * 86_400_000).toISOString().slice(0, 10), overrides))
}

function axesOf(result: ReturnType<typeof computeBadgeProgress>) {
  if (result.kind === 'unsupported') throw new Error(`unsupported: ${result.conditionKeys.join(', ')}`)
  return result.axes
}

// ── ⑥ 축 목록의 단일 출처 ────────────────────────────────────────────────

describe('축 키 목록 — 진행 계산과 발급 판정이 같은 출처를 본다', () => {
  it('SCALAR_AXIS_KEYS는 발급 판정의 두 목록에서 파생된다 — 손으로 나열하지 않는다', () => {
    expect([...SCALAR_AXIS_KEYS]).toEqual([...CUMULATIVE_SAME_ACTIVITY_KEYS, ...PER_ACTIVITY_KEYS])
  })

  it('index.ts·badgeProgress.ts 어디에도 재선언이 남아 있지 않다', () => {
    // 값 비교만으로는 «지금은 같지만 언제든 갈라질 수 있는» 상태를 잡지 못한다.
    // 이 저장소는 RARITY_LABEL이 5곳에 복제돼 누락 사고를 낸 전례가 있다
    // (티켓 20260813_003 · 20260905_0027) — 재선언 자체를 금지한다.
    const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    for (const rel of ['../index.ts', '../badgeProgress.ts']) {
      const source = read(rel)
      expect(source, rel).not.toMatch(/const\s+PER_ACTIVITY_KEYS\s*=/)
      expect(source, rel).not.toMatch(/const\s+CUMULATIVE_SAME_ACTIVITY_KEYS\s*=/)
      expect(source, rel).not.toMatch(/const\s+SCALAR_AXIS_KEYS\s*=/)
    }
  })

  it('회차 계산 함수가 한 개다 — 진행 계산이 발급 판정과 같은 함수를 import한다', () => {
    const source = readFileSync(fileURLToPath(new URL('../badgeProgress.ts', import.meta.url)), 'utf8')
    expect(source).toMatch(/from '\.\/repeatOccurrences'/)
    expect(source).not.toMatch(/function\s+collectRepeatOccurrences/)
  })
})

// ── ① 기록형은 «마지막 활동의 값»을 쓴다 ──────────────────────────────────

describe('기록형 — 표시값은 마지막 활동, 판정은 역대 최고', () => {
  const condition: BadgeCondition = { activity_type: 'running', duration_minutes: 120 }

  it('누적(합계)이 아니라 마지막 활동 하나의 값을 보여준다', () => {
    const activities = [
      run('2026-06-01', { movingTimeSec: 60 * 60 }), // 60분
      run('2026-06-02', { movingTimeSec: 90 * 60 }), // 90분 — 역대 최고
      run('2026-06-03', { movingTimeSec: 30 * 60 }), // 30분 — 마지막
    ]
    const metrics = computeUserPeriodMetrics('running', activities)
    const [axis] = axesOf(computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS))

    // 누적을 쓰면 180분(=60+90+30)이라 목표 120분을 넘겨 진행률이 100%로 고정된다.
    expect(metrics.totalCount).toBe(3)
    expect(axis.current).toBe(30)
    expect(axis.met).toBe(false)
    expect(axis.fraction).toBeCloseTo(30 / 120, 5)
    expect(axis.remaining).toBe(90)
  })

  it('UserPeriodMetrics가 최댓값과 마지막 활동 값을 둘 다 들고 있다', () => {
    const activities = [
      run('2026-06-01', { movingTimeSec: 90 * 60, distanceKm: 21 }),
      run('2026-06-03', { movingTimeSec: 30 * 60, distanceKm: 5 }),
    ]
    const metrics = computeUserPeriodMetrics('running', activities)

    expect(metrics.maxScalarValues.duration_minutes).toBe(90)
    expect(metrics.lastActivityValues.duration_minutes).toBe(30)
    expect(metrics.maxSingleDistanceKm).toBe(21)
    expect(metrics.maxSingleDurationMin).toBe(90)
  })

  it('역대 최고가 이미 목표를 넘겼으면 met이고 진행 바도 가득 찬다 — 발급과 어긋나지 않는다', () => {
    // 발급 판정(evaluateConditionDetailed)은 기록형 필드를 이력 전반에서 본다. 마지막 활동이
    // 짧다고 「미달」로 그리면 발급은 되는데 화면은 아니라고 말하는 상태가 된다.
    const activities = [
      run('2026-06-01', { movingTimeSec: 150 * 60 }), // 150분 — 목표 초과
      run('2026-06-03', { movingTimeSec: 20 * 60 }), // 마지막은 20분
    ]
    const metrics = computeUserPeriodMetrics('running', activities)
    const [axis] = axesOf(computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS))

    expect(axis.current).toBe(20) // 표시는 마지막 활동
    expect(axis.met).toBe(true) // 판정은 역대 최고
    expect(axis.fraction).toBe(1)
    expect(axis.remaining).toBe(0)
  })

  it('아쉬움 줄과 축이 같은 «마지막 활동»을 본다', () => {
    const activities = [run('2026-06-01', { movingTimeSec: 40 * 60 }), run('2026-06-02', { movingTimeSec: 110 * 60 })]
    const metrics = computeUserPeriodMetrics('running', activities)
    const [axis] = axesOf(computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS))
    const regret = computeRecordRegretLine(condition, metrics, noLabels)

    expect(axis.current).toBe(110)
    expect(regret?.current).toBe(110)
  })

  it('활동이 없으면 이전 동작 그대로(0/목표)', () => {
    const metrics = computeUserPeriodMetrics('running', [])
    const [axis] = axesOf(computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS))
    expect(axis.current).toBe(0)
    expect(axis.met).toBe(false)
  })
})

// ── ⑤ remaining 부호 ────────────────────────────────────────────────────

describe('remaining — 「작을수록 좋음」 축은 부호가 반대다', () => {
  it('페이스 축은 current − target이다 (target − current가 아니다)', () => {
    // 평균 8km/h → 450초/km. 목표는 420초/km(더 빨라야 한다).
    const activities = [run('2026-06-01', { averageSpeedKmh: 8 })]
    const metrics = computeUserPeriodMetrics('running', activities)
    const condition: BadgeCondition = { activity_type: 'running', max_pace_sec_per_km: 420 }
    const [axis] = axesOf(computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS))

    expect(axis.current).toBeCloseTo(450, 5)
    expect(axis.met).toBe(false)
    expect(axis.remaining).toBeCloseTo(30, 5) // −30이 아니다
  })

  it('한파 축(최고기온)도 current − target이다', () => {
    const activities = [run('2026-06-01', { weatherTempC: 2 })]
    const metrics = computeUserPeriodMetrics('running', activities)
    const condition: BadgeCondition = { activity_type: 'running', temperature_max_c: -5 }
    const [axis] = axesOf(computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS))

    expect(axis.remaining).toBe(7)
  })

  it('측정값이 없는 「작을수록 좋음」 축은 remaining이 null이다 — 0이면 다 채운 것처럼 보인다', () => {
    const metrics = computeUserPeriodMetrics('running', [])
    const condition: BadgeCondition = { activity_type: 'running', max_pace_sec_per_km: 420 }
    const [axis] = axesOf(computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS))

    expect(axis.met).toBe(false)
    expect(axis.remaining).toBeNull()
  })

  it('「클수록 좋음」 축은 target − current이고 met이면 0이다', () => {
    const activities = [run('2026-06-01', { distanceKm: 12 }), run('2026-06-02', { distanceKm: 8 })]
    const metrics = computeUserPeriodMetrics('running', activities)
    const [axis] = axesOf(
      computeBadgeProgress({ activity_type: 'running', distance_km: 30 }, metrics, noLabels, NO_LOCKS)
    )
    expect(axis.remaining).toBe(10)

    const [met] = axesOf(
      computeBadgeProgress({ activity_type: 'running', distance_km: 10 }, metrics, noLabels, NO_LOCKS)
    )
    expect(met.met).toBe(true)
    expect(met.remaining).toBe(0)
  })
})

// ── ② 신규 kind — repeat ────────────────────────────────────────────────

describe('kind: repeat — 「N회 중 M회」', () => {
  const condition: BadgeCondition = { activity_type: 'running', duration_minutes: 60, repeat_count: 5 }

  it('분류되고, 회차는 발급 판정과 같은 함수로 센다', () => {
    const activities = [
      run('2026-06-01', { movingTimeSec: 70 * 60 }),
      run('2026-06-02', { movingTimeSec: 30 * 60 }), // 미달
      run('2026-06-03', { movingTimeSec: 60 * 60 }),
    ]
    const metrics = computeUserPeriodMetrics('running', activities)

    expect(classifyBadgeProgressKind(condition)).toBe('repeat')
    expect(collectRepeatOccurrences(condition, activities)).toHaveLength(2)

    const [axis] = axesOf(computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS))
    expect(axis.key).toBe('repeat_count')
    expect(axis.current).toBe(2)
    expect(axis.target).toBe(5)
    expect(axis.remaining).toBe(3)
    expect(axis.met).toBe(false)
  })

  it('라벨/단위는 조건 필드 메타로 폴백한다 — 화면에 내부 키가 나가지 않는다', () => {
    const metrics = computeUserPeriodMetrics('running', [])
    const [axis] = axesOf(computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS))
    expect(axis.label).toBe('충족 횟수')
    expect(axis.unit).toBe('회')
  })
})

// ── ② 신규 kind — rest ──────────────────────────────────────────────────

describe('kind: rest — 「휴식 N/M일」', () => {
  const condition: BadgeCondition = { activity_type: 'running', streak_days: 3, rest_after_streak: 5 }

  it('분류되고, 현재 최대 공백을 축으로 그린다', () => {
    // 3일 연속 활동 뒤 2일 쉬고 복귀 — rest_after_streak 요구는 5일이라 아직 미달
    const activities = [...consecutive('2026-06-01', 3), run('2026-06-06')]
    const metrics = computeUserPeriodMetrics('running', activities)

    expect(classifyBadgeProgressKind(condition)).toBe('rest')

    const [axis] = axesOf(computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS))
    expect(axis.key).toBe('rest_after_streak')
    expect(axis.current).toBe(2)
    expect(axis.target).toBe(5)
    expect(axis.remaining).toBe(3)
    expect(axis.met).toBe(false)
    expect(axis.unit).toBe('일')
  })

  it('창 안에 인접 활동이 없으면 「0일」이다 — 「데이터 없음」을 「쉬었음」으로 읽지 않는다', () => {
    const metrics = computeUserPeriodMetrics('running', [run('2026-06-01')])
    const [axis] = axesOf(computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS))
    expect(axis.current).toBe(0)
    expect(axis.met).toBe(false)
  })

  it('조건을 충족했으면 met이다', () => {
    const activities = [...consecutive('2026-06-01', 3), run('2026-06-10')]
    const metrics = computeUserPeriodMetrics('running', activities)
    const [axis] = axesOf(computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS))
    expect(axis.met).toBe(true)
    expect(axis.remaining).toBe(0)
  })

  it('휴식 값의 형태가 깨져 있으면 진행률을 그리지 않는다 — 발급도 막히는 조건이다', () => {
    const broken = { activity_type: 'running', streak_days: 3, rest_after_streak: 0 } as BadgeCondition
    const metrics = computeUserPeriodMetrics('running', [...consecutive('2026-06-01', 3), run('2026-06-06')])
    expect(computeBadgeProgress(broken, metrics, noLabels, NO_LOCKS).kind).toBe('unsupported')
  })
})

// ── ② 신규 kind — leveled ───────────────────────────────────────────────

describe('kind: leveled — 무한레벨형', () => {
  const condition: BadgeCondition = { activity_type: 'running', distance_km: 500 }

  it('배지 종류를 넘겨야 leveled로 분류된다 — 조건만으로는 알 수 없다', () => {
    expect(classifyBadgeProgressKind(condition)).toBe('cumulative')
    expect(classifyBadgeProgressKind(condition, { badgeKind: 'leveled' })).toBe('leveled')
  })

  it('축은 기반 유형과 똑같이 계산되고, 레벨이 함께 실린다', () => {
    const metrics = computeUserPeriodMetrics('running', [run('2026-06-01', { distanceKm: 200 })])
    const result = computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS, { badgeKind: 'leveled', level: 7 })
    if (result.kind === 'unsupported') throw new Error('unreachable')

    expect(result.kind).toBe('leveled')
    expect(result.level).toBe(7)
    expect(result.axes[0]).toMatchObject({ key: 'distance_km', current: 200, target: 500, remaining: 300 })
  })

  it('기반 유형이 unsupported면 레벨형도 unsupported다 — 「뭐라도 그리자」가 곧 거짓 진행률이다', () => {
    const metrics = computeUserPeriodMetrics('running', [])
    const broken = { distance_km: 100, distnace_km: 5 } as unknown as BadgeCondition
    expect(classifyBadgeProgressKind(broken, { badgeKind: 'leveled' })).toBe('unsupported')
    expect(computeBadgeProgress(broken, metrics, noLabels, NO_LOCKS, { badgeKind: 'leveled', level: 2 }).kind).toBe(
      'unsupported'
    )
  })

  it('등급형·반복형에는 level이 실리지 않는다', () => {
    const metrics = computeUserPeriodMetrics('running', [run('2026-06-01', { distanceKm: 200 })])
    const result = computeBadgeProgress(condition, metrics, noLabels, NO_LOCKS, { badgeKind: 'graded', level: 7 })
    if (result.kind === 'unsupported') throw new Error('unreachable')
    expect(result.kind).toBe('cumulative')
    expect(result.level).toBeNull()
  })
})

// ── ④ 교차 게이트는 «조건 충족»으로 거짓 표시되지 않는다 ────────────────────

describe('교차 게이트 — 축이 다 차도 발급되지 않을 수 있다', () => {
  const gate: BadgeGateRequirement = { family_keys: ['running:다른 계열'] }
  const gatedCondition: BadgeCondition = { activity_type: 'running', distance_km: 10, cross_between_axis: gate }

  it('crossGateKeysIn이 「무엇이 교차 게이트인가」의 단일 출처다', () => {
    expect(crossGateKeysIn(gatedCondition)).toEqual(['cross_between_axis'])
    expect(crossGateKeysIn({ activity_type: 'running', distance_km: 10 })).toEqual([])
  })

  it('진행 결과에 crossGated 플래그가 실린다 — 수치 100%여도 화면이 「조건 충족」이라 말하면 안 된다', () => {
    const metrics = computeUserPeriodMetrics('running', [run('2026-06-01', { distanceKm: 50 })])
    const result = computeBadgeProgress(gatedCondition, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unreachable')

    expect(result.progress).toBe(1) // 수치는 다 찼다
    expect(result.crossGated).toBe(true) // 그런데 발급은 게이트가 막을 수 있다

    const plain = computeBadgeProgress({ activity_type: 'running', distance_km: 10 }, metrics, noLabels, NO_LOCKS)
    if (plain.kind === 'unsupported') throw new Error('unreachable')
    expect(plain.crossGated).toBe(false)
  })

  it('배지 트리의 「조건 충족」 집합에서 제외된다 — checkCondition이 교차 게이트를 보지 않기 때문', () => {
    const activities = [run('2026-06-01', { distanceKm: 50 })]
    const conditionById = new Map<string, BadgeCondition | null>([
      ['gated', gatedCondition],
      ['plain', { activity_type: 'running', distance_km: 10 }],
    ])
    const met = computeConditionMetBadgeIds(['gated', 'plain'], conditionById, activities)

    expect(met.has('plain')).toBe(true)
    expect(met.has('gated')).toBe(false)
  })
})
