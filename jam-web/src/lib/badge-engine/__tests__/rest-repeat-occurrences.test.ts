/**
 * 휴식 구간 기반 회차 — 배타 규칙 해소 회귀 (티켓 20260906_1423)
 *
 * ## 이 파일이 지키는 것
 *
 * 배타 규칙(티켓 20260905_0030 B-10)은 `repeat_count` + 휴식 4종 조합을 통째로 막았고,
 * 그 결과 v5 카탈로그의 **50종 / 15계열이 영구 미획득**이었다. 근거였던 「휴식은 이력 패턴
 * 술어라 활동 단위 회차 술어(`collectRepeatOccurrences`)에 얹을 수 없다」는 **지금도 옳다** —
 * 이 티켓은 그 근거를 뒤집지 않고 **층을 바꿨다**: 휴식 판정이 이미 만드는 «구간 목록»이
 * 별도의 회차 축이다.
 *
 *   ① 성립한 휴식 구간 수 = 회차 (`collectRestOccurrences`)
 *   ② 카탈로그 실제 조건(`walking:R1`·`walking:R2`)이 실제로 열린다
 *   ③ 여전히 막는 두 형태(휴식 키 2개 이상 · 휴식이 보지 않는 축)는 계속 fail-closed다
 *   ④ 휴식만 있고 회차가 없는 조건의 판정은 **이전과 동일**하다 (회귀)
 *   ⑤ 발급 판정 · 회차 목록 · 진행 계산이 **같은 회차**를 본다 (단일 출처)
 *
 * 실행: `npx vitest run src/lib/badge-engine/__tests__/rest-repeat-occurrences.test.ts`
 */
import { evaluateConditionDetailed, checkCondition, selectTriggerActivity } from '../index'
import { collectRestOccurrences, restRepeatBlockReason, evaluateRestConditions } from '../activityFilters'
import { collectRepeatCountOccurrences } from '../repeatOccurrences'
import { classifyBadgeProgressKind, computeUserPeriodMetrics, computeBadgeProgress } from '../badgeProgress'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition } from '@/types/database'
import type { BadgeTreeLock } from '@/lib/badgeTree'

const NO_LOCKS: BadgeTreeLock[] = []
const noLabels = new Map<string, { label: string; unit: string | null }>()

let seq = 0
function act(ymd: string, overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  seq += 1
  return {
    stravaId: seq,
    name: `act ${ymd}`,
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

/** 걷기 축1 게이트를 통과하는 걷기 활동 */
function walk(ymd: string, overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return act(ymd, {
    jamActivityType: 'walking',
    distanceKm: 3,
    movingTimeSec: 1800,
    averageSpeedKmh: 6,
    ...overrides,
  })
}

function daysFrom(startYmd: string, offsets: number[], make: (ymd: string) => NormalizedActivity) {
  const base = Date.parse(`${startYmd}T00:00:00Z`)
  return offsets.map((d) => make(new Date(base + d * 86_400_000).toISOString().slice(0, 10)))
}

// ── ① 휴식 구간 수 = 회차 ────────────────────────────────────────────────

describe('휴식 구간 회차 — 성립한 구간 수가 그대로 회차다', () => {
  // 활동일: 0 · 20 · 40 · 60 → 20일 간격 3구간. return_gap_days:14 를 세 번 만족한다.
  const acts = daysFrom('2026-01-01', [0, 20, 40, 60], (d) => act(d))
  const base: BadgeCondition = { activity_type: 'running', return_gap_days: 14 }

  it('구간 3개가 성립하면 회차는 3이다', () => {
    expect(collectRestOccurrences(base, acts)).toHaveLength(3)
  })

  it('repeat_count: 3은 통과한다', () => {
    const r = evaluateConditionDetailed({ ...base, repeat_count: 3 }, acts)
    expect(r.pass).toBe(true)
    expect(r.actual).toContain('달성횟수: 3회')
  })

  it('repeat_count: 4는 회차형과 같은 어휘로 미달을 알린다', () => {
    const r = evaluateConditionDetailed({ ...base, repeat_count: 4 }, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('충족 횟수 부족')
    expect(r.actual).toBe('3회')
    expect(r.required).toBe('4회')
  })

  it('구간 중 조건을 만족하지 못한 것은 세지 않는다', () => {
    // 0 · 20 · 21 · 41 → 20일 · 1일 · 20일 = 2구간만 성립
    const mixed = daysFrom('2026-01-01', [0, 20, 21, 41], (d) => act(d))
    expect(collectRestOccurrences(base, mixed)).toHaveLength(2)
    expect(checkCondition({ ...base, repeat_count: 2 }, mixed)).toBe(true)
    expect(checkCondition({ ...base, repeat_count: 3 }, mixed)).toBe(false)
  })

  it('회차 목록은 «공백을 닫은 복귀 활동»이며 시간순이다 — earn_history 순서 규약', () => {
    const occurrences = collectRestOccurrences(base, acts)
    expect(occurrences.map((a) => a.startDate.slice(0, 10))).toEqual(['2026-01-21', '2026-02-10', '2026-03-02'])
  })

  it('계기 활동은 «임계값을 넘긴 그 회차»의 복귀 활동이다', () => {
    const cond = { ...base, repeat_count: 2 }
    const occurrences = collectRepeatCountOccurrences(cond, acts)
    const trigger = selectTriggerActivity({ condition_json: cond }, cond, occurrences, acts)
    expect(trigger?.startDate.slice(0, 10)).toBe('2026-02-10')
  })

  it('앵커 하한이 회차에도 그대로 걸린다 — 창 밖 공백은 회차가 아니다', () => {
    // 앵커를 2/1로 잡으면 창 안 활동은 2/10 · 3/2 뿐이라 구간이 1개다.
    const occurrences = collectRestOccurrences(base, acts, { anchorDate: '2026-02-01T00:00:00Z' })
    expect(occurrences).toHaveLength(1)
    const r = evaluateConditionDetailed({ ...base, repeat_count: 3 }, acts, { anchorDate: '2026-02-01T00:00:00Z' })
    expect(r.pass).toBe(false)
    expect(r.actual).toBe('1회')
  })
})

// ── ② 카탈로그 실제 조건 ────────────────────────────────────────────────

describe('카탈로그 실제 조건이 열린다', () => {
  it('walking:R1 「완전한 하루」 — {streak_days:6, rest_after_streak:1, repeat_count:5}', () => {
    const cond: BadgeCondition = {
      activity_type: 'walking',
      streak_days: 6,
      rest_after_streak: 1,
      repeat_count: 5,
    }
    // 「6일 연속 걷고 하루 쉬기」를 5번 반복 — 한 사이클은 7일(연속 6일 + 휴식 1일)
    const acts: NormalizedActivity[] = []
    for (let cycle = 0; cycle < 5; cycle++) {
      acts.push(...daysFrom('2026-01-01', [0, 1, 2, 3, 4, 5].map((d) => cycle * 7 + d), (d) => walk(d)))
    }
    // 마지막 사이클의 휴식을 닫는 복귀 활동
    acts.push(...daysFrom('2026-01-01', [35], (d) => walk(d)))

    expect(collectRestOccurrences(cond, acts)).toHaveLength(5)
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
    // 사다리 위 칸(20회)은 아직 미달이다 — 등급별로 갈리는 것이 회차 축의 존재 이유다
    expect(checkCondition({ ...cond, repeat_count: 20 }, acts)).toBe(false)
  })

  it('walking:R2 「회복의 기술」 — {rest_after_long:1, duration_minutes:90, repeat_count:10}', () => {
    // §B 이전에는 `rest_after_long`의 짝이 single_distance_km 하나뿐이라 `unpaired`로 막혔다.
    const cond: BadgeCondition = {
      activity_type: 'walking',
      rest_after_long: 1,
      duration_minutes: 90,
      repeat_count: 10,
    }
    const long = (d: string) => walk(d, { movingTimeSec: 95 * 60, distanceKm: 7 })
    // 90분 이상 걷고 하루 쉬기를 10번 — 활동일 0 · 2 · 4 … 20 (사이 하루씩 휴식)
    const acts = daysFrom('2026-03-01', [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20], long)

    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
    expect(collectRestOccurrences(cond, acts)).toHaveLength(10)
  })

  it('walking:R2 — 90분 미만 활동 뒤의 휴식은 회차가 아니다', () => {
    const cond: BadgeCondition = {
      activity_type: 'walking',
      rest_after_long: 1,
      duration_minutes: 90,
      repeat_count: 2,
    }
    const short = (d: string) => walk(d, { movingTimeSec: 40 * 60 })
    const acts = daysFrom('2026-03-01', [0, 2, 4, 6], short)
    expect(collectRestOccurrences(cond, acts)).toHaveLength(0)
    expect(evaluateConditionDetailed(cond, acts).reason).toBe('충족 횟수 부족')
  })

  it('duration_minutes가 «독립 축»으로 다시 평가되지 않는다 — 장거리의 정의로 흡수된다', () => {
    // 흡수하지 않으면 사유가 「이동시간 부족」으로 나가고, 진행률에도 축이 하나 더 그려진다.
    const cond: BadgeCondition = {
      activity_type: 'walking',
      rest_after_long: 1,
      duration_minutes: 90,
      repeat_count: 1,
    }
    const acts = daysFrom('2026-03-01', [0, 2], (d) => walk(d, { movingTimeSec: 40 * 60 }))
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('충족 횟수 부족')
  })

  it('cycling:G1 「격주의 약속」 — {interval_days:14, repeat_count:3}', () => {
    const cond: BadgeCondition = { activity_type: 'cycling', interval_days: 14, repeat_count: 3 }
    const ride = (d: string) => act(d, { jamActivityType: 'cycling' })
    const acts = daysFrom('2026-01-01', [0, 14, 28, 42], ride)
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
    expect(checkCondition({ ...cond, repeat_count: 4 }, acts)).toBe(false)
  })
})

// ── ③ 여전히 막는 형태 ──────────────────────────────────────────────────

describe('fail-closed는 유지된다', () => {
  const acts = daysFrom('2026-01-01', [0, 20, 40, 60], (d) => act(d))

  it('휴식 키 2개 이상 + 회차는 계속 막는다', () => {
    const cond = {
      activity_type: 'running',
      return_gap_days: 14,
      interval_days: 15,
      repeat_count: 2,
    } as BadgeCondition
    expect(restRepeatBlockReason(cond)?.actual).toContain('휴식 조건 2개')
    expect(evaluateConditionDetailed(cond, acts).reason).toBe('회차와 함께 쓸 수 없는 조건')
    expect(collectRepeatCountOccurrences(cond, acts)).toHaveLength(0)
    expect(classifyBadgeProgressKind(cond)).toBe('unsupported')
  })

  it('휴식이 보지 않는 축(time_range)이 섞이면 계속 막는다', () => {
    const cond = {
      activity_type: 'running',
      return_gap_days: 14,
      time_range: { start: '05:00', end: '07:00' },
      repeat_count: 2,
    } as BadgeCondition
    expect(evaluateConditionDetailed(cond, acts).reason).toBe('회차와 함께 쓸 수 없는 조건')
    expect(collectRepeatCountOccurrences(cond, acts)).toHaveLength(0)
    expect(classifyBadgeProgressKind(cond)).toBe('unsupported')
  })

  it('짝 필드가 다른 휴식 키의 것이면 «보지 않는 축»으로 막힌다', () => {
    // streak_days는 rest_after_streak의 짝일 뿐이다 — return_gap_days는 연속일수를 보지 않는다.
    const cond = {
      activity_type: 'running',
      return_gap_days: 14,
      streak_days: 6,
      repeat_count: 2,
    } as BadgeCondition
    expect(evaluateConditionDetailed(cond, acts).reason).toBe('회차와 함께 쓸 수 없는 조건')
  })

  it('single_distance_km 짝은 여전히 pending에 막힌다 — 이 티켓 범위 밖(0110 ①)', () => {
    const cond = {
      activity_type: 'running',
      rest_after_long: 1,
      single_distance_km: 25,
      repeat_count: 1,
    } as BadgeCondition
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toContain('평가 구현 대기')
    expect(r.reason).toContain('single_distance_km')
  })

  it('휴식 키가 2개면 회차 수집 자체가 «셀 수 없음»으로 비어 있다', () => {
    const cond = { activity_type: 'running', return_gap_days: 14, interval_days: 15 } as BadgeCondition
    expect(collectRestOccurrences(cond, acts)).toHaveLength(0)
  })
})

// ── ④ 회귀 — 휴식만 있는 조건은 이전과 동일 ─────────────────────────────

describe('회귀 — repeat_count가 없는 휴식 조건의 판정은 변하지 않는다', () => {
  const longGap = [act('2026-01-01'), act('2026-06-01')] // 151일 차

  it('순수 공백 조건', () => {
    expect(checkCondition({ activity_type: 'running', return_gap_days: 90 }, longGap)).toBe(true)
    expect(checkCondition({ activity_type: 'running', return_gap_days: 200 }, longGap)).toBe(false)
    // interval_days는 이 티켓의 §C(방향 반전, rest-conditions.test.ts에서 별도 검증)로
    // 방향이 바뀌었다 — 151일 간격은 이제 「3일 이내」를 만족하지 못해 false가 맞다.
    expect(checkCondition({ activity_type: 'running', interval_days: 3 }, longGap)).toBe(false)
  })

  it('연속 후 휴식 조건', () => {
    const acts = [...daysFrom('2026-06-01', [0, 1, 2, 3, 4, 5], (d) => act(d)), act('2026-06-09')]
    expect(checkCondition({ activity_type: 'running', streak_days: 6, rest_after_streak: 2 }, acts)).toBe(true)
    expect(classifyBadgeProgressKind({ activity_type: 'running', streak_days: 6, rest_after_streak: 2 })).toBe('rest')
  })

  it('활동이 없으면 여전히 「판정 불가」다 — 데이터 없음을 쉬었음으로 읽지 않는다', () => {
    const r = evaluateConditionDetailed({ activity_type: 'running', return_gap_days: 90 }, [])
    expect(r.reason).toBe('휴식 판정 불가 — 창 안에 인접 활동이 없음')
  })

  it('rest_after_long + duration_minutes는 회차 없이도 열린다 (§B)', () => {
    const cond = { activity_type: 'walking', rest_after_long: 1, duration_minutes: 90 } as BadgeCondition
    const acts = daysFrom('2026-03-01', [0, 2], (d) => walk(d, { movingTimeSec: 95 * 60 }))
    expect(evaluateRestConditions(cond, acts).kind).toBe('pass')
    expect(checkCondition(cond, acts)).toBe(true)
    expect(classifyBadgeProgressKind(cond)).toBe('rest')
  })
})

// ── ⑤ 단일 출처 — 발급 판정 · 회차 · 진행 계산이 같은 숫자를 본다 ────────

describe('회차 단일 출처 — 세 경로가 같은 회차를 본다', () => {
  const cond: BadgeCondition = { activity_type: 'running', return_gap_days: 14, repeat_count: 5 }
  const acts = daysFrom('2026-01-01', [0, 20, 40, 60], (d) => act(d)) // 구간 3개

  it('진행 계산이 그리는 회차 = 발급 판정이 센 회차', () => {
    const issued = collectRepeatCountOccurrences(cond, acts).length
    expect(classifyBadgeProgressKind(cond)).toBe('repeat')

    const metrics = computeUserPeriodMetrics('running', acts)
    const result = computeBadgeProgress(cond, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unsupported')
    const [axis] = result.axes

    expect(issued).toBe(3)
    expect(axis.current).toBe(issued)
    expect(axis.target).toBe(5)
    expect(axis.met).toBe(false)
    // 발급 판정이 미달인데 화면이 100%를 그리지 않는다
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(false)
  })

  it('조건을 채우면 축도 met이다', () => {
    const met: BadgeCondition = { ...cond, repeat_count: 3 }
    const metrics = computeUserPeriodMetrics('running', acts)
    const result = computeBadgeProgress(met, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unsupported')
    expect(result.axes[0].met).toBe(true)
    expect(checkCondition(met, acts)).toBe(true)
  })

  it('회차 층 분기는 `collectRepeatCountOccurrences` 한 곳에만 있다', () => {
    // 휴식 키가 있으면 휴식 구간 층, 없으면 활동 단위 층 — 두 함수의 결과가 그대로 실린다.
    expect(collectRepeatCountOccurrences(cond, acts)).toEqual(collectRestOccurrences(cond, acts))
  })
})
