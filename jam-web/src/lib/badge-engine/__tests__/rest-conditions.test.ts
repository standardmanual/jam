/**
 * 휴식(활동 공백) 조건 회귀 테스트 — v5 B3 (티켓 20260905_0030 §4)
 *
 * 휴식은 엔진의 다른 모든 조건과 성격이 반대다. 나머지는 「활동이 있었는가」를 세지만
 * 휴식은 **「활동이 없었는가」**를 센다. 그래서 **「데이터 없음」을 「쉬었음」으로 읽는 사고**가
 * 구조적으로 가능하다 — 가입 앵커가 이력을 자르면 창 밖이 통째로 공백처럼 보이고, 가입 직후
 * 첫 활동이 곧바로 「90일 겨울잠」으로 오판된다(티켓 B-7).
 *
 * 이 파일이 못 박는 것:
 *   ① 직전 활동이 앵커 창 밖이면 공백을 **계산하지 않는다**
 *   ② 활동이 없는 신규 유저가 「겨울잠」으로 오판되지 않는다
 *   ③ 공백은 **다음 활동이 들어온 순간**에 소급 판정된다
 *   ④ 짝 필드가 없으면 fail-closed로 막힌다 (「며칠 연속 뒤」가 정의되지 않는다)
 *   ⑤ `repeat_count`와 휴식 키 «1개»의 조합은 "휴식 조건을 만족한 복귀 사건"만 센다
 *      (휴식 조건을 무시한 단순 활동 카운트로 퇴화하지 않는다) — 휴식 키 2개 이상은
 *      여전히 「회차와 함께 쓸 수 없는 조건」으로 막힌다 (§B-10 재설계, 티켓 20260906_2056)
 *   ⑥ 발급 판정(`index.ts`)과 진행 계산(`badgeProgress.ts`)이 **같은 헬퍼**를 본다
 *
 * 실행: `npx vitest run src/lib/badge-engine/__tests__/rest-conditions.test.ts`
 */

import { evaluateConditionDetailed, checkCondition, selectTriggerActivity } from '../index'
import {
  REST_CONDITION_KEYS,
  evaluateRestConditions,
  restConditionKeysIn,
} from '../activityFilters'
import { classifyBadgeProgressKind, computeUserPeriodMetrics, computeBadgeProgress } from '../badgeProgress'
import { collectRepeatOccurrences, isRestDrivenRepeatCondition } from '../repeatOccurrences'
import { findBlockingConditionKeys } from '../conditionRegistry'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition } from '@/types/database'
import type { BadgeTreeLock } from '@/lib/badgeTree'

const NO_LOCKS: BadgeTreeLock[] = []
const noLabels = new Map<string, { label: string; unit: string | null }>()

const DAY_MS = 86_400_000

let seq = 0
/** `2026-06-01` 형태의 날짜 하나로 활동 1건. 로컬/UTC 표기를 같은 날짜로 맞춰 둔다 */
function act(ymd: string, overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
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
  return Array.from({ length: n }, (_, i) => act(new Date(base + i * 86_400_000).toISOString().slice(0, 10), overrides))
}

/**
 * 「streakLen일 연속 → restLen일 휴식」을 `repeats`번 반복한다.
 *
 * `repeats + 1`개의 연속 블록을 이어붙여 블록 사이 전환마다 정확히 하나의 «닫힌 구간»이
 * 생기게 한다 — 블록이 N개면 전환(=사건 후보)은 N-1개다. `rest_after_streak` 회차 테스트의
 * 표준 이력 생성기.
 */
function streakRestCycles(startYmd: string, repeats: number, streakLen: number, restLen: number): NormalizedActivity[] {
  const acts: NormalizedActivity[] = []
  let cursor = Date.parse(`${startYmd}T00:00:00Z`)
  for (let c = 0; c <= repeats; c++) {
    for (let d = 0; d < streakLen; d++) {
      acts.push(act(new Date(cursor + d * DAY_MS).toISOString().slice(0, 10)))
    }
    cursor += (streakLen + restLen) * DAY_MS
  }
  return acts
}

// ── ① · ② 「데이터 없음」을 「쉬었음」으로 읽지 않는다 (B-7) ─────────────────

describe('휴식 — 공백은 «창 안의 인접 활동» 사이에서만 센다 (B-7)', () => {
  const hibernation: BadgeCondition = { activity_type: 'running', return_gap_days: 90 }

  it('활동이 0건인 신규 유저는 「겨울잠」으로 오판되지 않는다', () => {
    const r = evaluateConditionDetailed(hibernation, [])
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('휴식 판정 불가 — 창 안에 인접 활동이 없음')
  })

  it('활동이 1건뿐이면 공백을 계산하지 않는다 — 앞쪽 경계는 공백이 아니다', () => {
    const r = evaluateConditionDetailed(hibernation, [act('2026-06-01')])
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('휴식 판정 불가 — 창 안에 인접 활동이 없음')
  })

  it('직전 활동이 앵커 창 밖이면 공백을 계산하지 않는다', () => {
    // 첫 싱크가 정산한 «가입 직전 활동»이 배치로 합쳐져 배열에 남아 있는 상황.
    // 앵커를 안 주면 500일짜리 공백이 잡히고, 주면 창 안에 활동이 1건뿐이라 판정 불가다.
    const acts = [act('2025-01-15'), act('2026-06-01')]

    const withoutAnchor = evaluateConditionDetailed(hibernation, acts)
    expect(withoutAnchor.pass).toBe(true)

    const withAnchor = evaluateConditionDetailed(hibernation, acts, { anchorDate: '2026-05-01T00:00:00Z' })
    expect(withAnchor.pass).toBe(false)
    expect(withAnchor.reason).toBe('휴식 판정 불가 — 창 안에 인접 활동이 없음')
  })

  it('앵커 이후에 인접 활동 2건이 생기면 그때부터 공백을 센다', () => {
    const acts = [act('2025-01-15'), act('2026-06-01'), act('2026-09-05')] // 6/1 → 9/5 = 95일 차
    const r = evaluateConditionDetailed(hibernation, acts, { anchorDate: '2026-05-01T00:00:00Z' })
    expect(r.pass).toBe(true)
    expect(r.actual).toContain('복귀 전 휴식일: 95일')
  })
})

// ── ③ 다음 활동 시 소급 판정 ────────────────────────────────────────────

describe('휴식 — 공백은 다음 활동이 들어온 순간에 닫힌다 (소급 판정)', () => {
  const afterStreak: BadgeCondition = { activity_type: 'running', streak_days: 6, rest_after_streak: 2 }

  it('연속 6일만 있고 복귀 활동이 없으면 아직 성립하지 않는다', () => {
    const acts = consecutive('2026-06-01', 6)
    const r = evaluateConditionDetailed(afterStreak, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('연속 활동 후 휴식 부족')
    expect(r.actual).toBe('0일')
  })

  it('이틀 쉬고 돌아온 활동 1건이 들어오면 그때 소급 성립한다', () => {
    // 6/1~6/6 연속 6일 → 6/7·6/8 휴식 → 6/9 복귀
    const acts = [...consecutive('2026-06-01', 6), act('2026-06-09')]
    const r = evaluateConditionDetailed(afterStreak, acts)
    expect(r.pass).toBe(true)
    expect(r.actual).toContain('연속 활동 후 휴식일: 2일')
    expect(r.required).toContain('연속 6일 뒤 휴식 2일')
  })

  it('하루만 쉬고 돌아오면 부족하다', () => {
    const acts = [...consecutive('2026-06-01', 6), act('2026-06-08')]
    const r = evaluateConditionDetailed(afterStreak, acts)
    expect(r.pass).toBe(false)
    expect(r.actual).toBe('1일')
  })

  it('연속 일수가 모자란 뒤의 휴식은 인정하지 않는다', () => {
    // 3일만 연속하고 2일 쉰 경우 — streak_days(6) 자체가 먼저 막는다
    const acts = [...consecutive('2026-06-01', 3), act('2026-06-06')]
    const r = evaluateConditionDetailed(afterStreak, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('연속 일수 부족')
  })

  it('계기 활동은 공백을 닫은 «복귀 활동»이다 (B-9)', () => {
    const resume = act('2026-06-09')
    const acts = [...consecutive('2026-06-01', 6), resume]
    const trigger = selectTriggerActivity({ condition_json: null }, afterStreak, [], acts)
    expect(trigger?.stravaId).toBe(resume.stravaId)
  })
})

// ── ④ 짝 필드 강제 ──────────────────────────────────────────────────────

describe('휴식 — 짝 필드가 없으면 fail-closed로 막는다', () => {
  it('rest_after_streak에 streak_days가 없으면 「짝 필드 없음」으로 막힌다', () => {
    const cond = { activity_type: 'running', rest_after_streak: 2 } as BadgeCondition
    const blocking = findBlockingConditionKeys(cond)
    expect(blocking.unpaired).toEqual(['rest_after_streak'])

    const r = evaluateConditionDetailed(cond, consecutive('2026-06-01', 6))
    expect(r.pass).toBe(false)
    expect(r.reason).toContain('짝 필드 없음')
    expect(r.reason).toContain('streak_days')
    expect(checkCondition(cond, consecutive('2026-06-01', 6))).toBe(false)
  })

  it('rest_after_long에 single_distance_km이 없으면 막힌다', () => {
    const cond = { activity_type: 'running', rest_after_long: 1 } as BadgeCondition
    expect(findBlockingConditionKeys(cond).unpaired).toEqual(['rest_after_long'])
  })

  it('짝 필드가 붙으면 「짝 필드 없음」은 사라진다', () => {
    const cond: BadgeCondition = { activity_type: 'running', streak_days: 6, rest_after_streak: 2 }
    expect(findBlockingConditionKeys(cond).unpaired).toEqual([])
  })

  it('기존 필드에는 짝 강제를 적용하지 않는다 — 카탈로그 실적이 있어 회귀 위험', () => {
    // same_activity ↔ distance_km/elevation_gain_m도 pairedWith를 선언하지만 강제 대상이 아니다.
    expect(findBlockingConditionKeys({ same_activity: true } as BadgeCondition).unpaired).toEqual([])
    expect(findBlockingConditionKeys({ month: 6 } as BadgeCondition).unpaired).toEqual([])
    expect(findBlockingConditionKeys({ season: 'winter' } as BadgeCondition).unpaired).toEqual([])
  })

  it('rest_after_long은 짝 필드(single_distance_km)가 engine으로 뒤집혀 실제로 발급된다 (티켓 20260906_0110 ④)', () => {
    // v5 스칼라 7종이 engine으로 뒤집히면서(같은 티켓 ②) 이 짝 필드도 함께 평가된다 —
    // fail-closed가 더는 막지 않는다. 이 이력은 6/1(42km)→6/3 공백 1일이라 통과해야 한다.
    const cond = { activity_type: 'running', rest_after_long: 1, single_distance_km: 30 } as BadgeCondition
    const acts = [act('2026-06-01', { distanceKm: 42 }), act('2026-06-03')]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(true)
    expect(evaluateRestConditions(cond, acts).kind).toBe('pass')
  })

  it('rest_after_long은 duration_minutes를 짝 필드로도 받는다 (티켓 20260906_0110 ④)', () => {
    // 거리 대신 시간을 「장거리」 기준으로 쓸 수 있다 — 걷기·등산처럼 거리보다 소요시간이
    // 더 자연스러운 종목을 위한 축이다(`walking:R2`·`hiking:X1`).
    const cond = { activity_type: 'hiking', rest_after_long: 1, duration_minutes: 480 } as BadgeCondition
    const acts = [
      act('2026-06-01', { jamActivityType: 'hiking', movingTimeSec: 480 * 60 }),
      act('2026-06-03', { jamActivityType: 'hiking' }),
    ]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(true)

    // 짝 필드 없이는 여전히 막힌다 — «무엇이 장거리인가»가 정의되지 않는다
    const noPair = { activity_type: 'hiking', rest_after_long: 1 } as BadgeCondition
    expect(findBlockingConditionKeys(noPair).unpaired).toEqual(['rest_after_long'])
  })
})

// ── ⑤ 회차와의 조합 — 휴식 키 1개까지 지원 (§B-10 재설계, 티켓 20260906_2056) ──────

describe('휴식 — repeat_count와 휴식 키 1개는 "복귀 사건"만 센다 (§B-10 재설계)', () => {
  it('티켓 예시: {rest_after_streak:2, streak_days:3, repeat_count:5} — 5번의 「3일 연속 후 2일 이상 쉬고 복귀」', () => {
    const cond: BadgeCondition = { activity_type: 'running', streak_days: 3, rest_after_streak: 2, repeat_count: 5 }
    expect(isRestDrivenRepeatCondition(cond)).toBe(true)

    // 6개 블록(3일 연속) 사이 전환 5번 — 전부 2일씩 쉰다 → 사건 5개
    const fiveCycles = streakRestCycles('2026-01-01', 5, 3, 2)
    const occurrences = collectRepeatOccurrences(cond, fiveCycles)
    expect(occurrences).toHaveLength(5)
    expect(evaluateConditionDetailed(cond, fiveCycles).pass).toBe(true)

    // 사건 4개뿐이면(블록 4번 전환) 아직 미달
    const fourCycles = streakRestCycles('2026-01-01', 4, 3, 2)
    const r = evaluateConditionDetailed(cond, fourCycles)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('충족 횟수 부족')
    expect(r.actual).toBe('4회')
  })

  it('휴식 조건을 무시한 단순 활동 카운트로 퇴화하지 않는다 — 쉬지 않고 매일 활동해도 사건은 0', () => {
    // 0030 B-10이 우려한 실패 모드: {repeat_count:5, rest_after_streak:2}를 활동 1건 단위로
    // 세면 "휴식 여부와 무관하게 활동이 있었다"만 세어진다. 30일 연속 활동은 총 활동 수로는
    // repeat_count(2)를 훌쩍 넘지만, 한 번도 2일 이상 쉬지 않았으므로 사건은 0이어야 한다.
    const cond: BadgeCondition = { activity_type: 'running', streak_days: 3, rest_after_streak: 2, repeat_count: 2 }
    const neverRests = consecutive('2026-01-01', 30)
    const occurrences = collectRepeatOccurrences(cond, neverRests)
    expect(occurrences).toHaveLength(0)
    const r = evaluateConditionDetailed(cond, neverRests)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('충족 횟수 부족')
    expect(r.actual).toBe('0회')
  })

  it('순수 공백 키(return_gap_days)도 만족한 구간만 센다 — 짧은 공백은 사건이 아니다', () => {
    const cond: BadgeCondition = { activity_type: 'running', return_gap_days: 30, repeat_count: 2 }
    const acts = [
      act('2026-01-01'),
      act('2026-02-20'), // 공백 49일 — 사건 ①
      act('2026-02-21'), // 공백 0일 — 미달, 사건 아님
      act('2026-05-01'), // 공백 68일 — 사건 ②
    ]
    const occurrences = collectRepeatOccurrences(cond, acts)
    expect(occurrences).toHaveLength(2)
    expect(occurrences.map((a) => a.startDate.slice(0, 10))).toEqual(['2026-02-20', '2026-05-01'])
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('interval_days는 활동 간격 자체(휴식일이 아니라)로 잰다', () => {
    const cond: BadgeCondition = { activity_type: 'running', interval_days: 10, repeat_count: 1 }
    // 9일 간격(9일차 활동) — 미달
    expect(collectRepeatOccurrences(cond, [act('2026-01-01'), act('2026-01-10')])).toHaveLength(0)
    // 10일 간격 — 충족
    expect(collectRepeatOccurrences(cond, [act('2026-01-01'), act('2026-01-11')])).toHaveLength(1)
  })

  it('계기 활동은 N번째 사건의 «복귀 활동»이다', () => {
    const cond: BadgeCondition = { activity_type: 'running', streak_days: 3, rest_after_streak: 2, repeat_count: 3 }
    const acts = streakRestCycles('2026-01-01', 3, 3, 2)
    const occurrences = collectRepeatOccurrences(cond, acts)
    expect(occurrences).toHaveLength(3)
    const trigger = selectTriggerActivity({ condition_json: cond }, cond, occurrences, acts)
    expect(trigger?.stravaId).toBe(occurrences[2].stravaId) // repeat_count=3 → 3번째 사건
  })

  it('진행 계산도 같은 축(repeat)으로 «N/M회」를 그린다', () => {
    const cond: BadgeCondition = { activity_type: 'running', streak_days: 3, rest_after_streak: 2, repeat_count: 5 }
    expect(classifyBadgeProgressKind(cond)).toBe('repeat')

    const threeCycles = streakRestCycles('2026-01-01', 3, 3, 2) // 사건 3개
    const metrics = computeUserPeriodMetrics('running', threeCycles)
    const result = computeBadgeProgress(cond, metrics, noLabels, NO_LOCKS)
    if (result.kind === 'unsupported') throw new Error('unsupported')
    expect(result.axes[0].key).toBe('repeat_count')
    expect(result.axes[0].current).toBe(3)
    expect(result.axes[0].target).toBe(5)
    expect(result.axes[0].met).toBe(false)
  })
})

describe('휴식 — 휴식 키 2개 이상 + repeat_count는 여전히 막힌다 (사건 경계 미정의)', () => {
  it('서로 다른 두 휴식 키가 같이 있으면 「회차와 함께 쓸 수 없는 조건」', () => {
    const cond: BadgeCondition = {
      activity_type: 'running',
      streak_days: 3,
      rest_after_streak: 2,
      return_gap_days: 10,
      repeat_count: 3,
    }
    expect(isRestDrivenRepeatCondition(cond)).toBe(false)
    const r = evaluateConditionDetailed(cond, [])
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('회차와 함께 쓸 수 없는 조건')
    expect(classifyBadgeProgressKind(cond)).toBe('unsupported')
  })

  it('휴식 키가 1개여도 휴식 술어가 보지 않는 축(짝 필드 아닌 것)이 섞이면 막힌다', () => {
    // distance_km은 return_gap_days의 짝 필드가 아니다 — 휴식 판정이 보지 못하는 독립 축
    const cond: BadgeCondition = { activity_type: 'running', return_gap_days: 30, distance_km: 5, repeat_count: 2 }
    expect(isRestDrivenRepeatCondition(cond)).toBe(false)
    expect(evaluateConditionDetailed(cond, []).reason).toBe('회차와 함께 쓸 수 없는 조건')
  })

  it('휴식 4종 전부 단독이면 이제 막히지 않는다 (레지스트리 fail-closed 회귀 방지)', () => {
    const pairs: Partial<Record<(typeof REST_CONDITION_KEYS)[number], BadgeCondition>> = {
      rest_after_streak: { streak_days: 6 },
      rest_after_long: { single_distance_km: 30 },
    }
    for (const key of REST_CONDITION_KEYS) {
      const cond = {
        activity_type: 'running',
        repeat_count: 3,
        ...(pairs[key] ?? {}),
        [key]: 90,
      } as BadgeCondition
      expect(restConditionKeysIn(cond), key).toEqual([key])
      expect(isRestDrivenRepeatCondition(cond), key).toBe(true)
      expect(evaluateConditionDetailed(cond, []).reason, key).not.toBe('회차와 함께 쓸 수 없는 조건')
    }
  })
})

// ── ⑥ 발급 판정 ↔ 진행 계산이 같은 헬퍼를 본다 ──────────────────────────

describe('휴식 — 발급 판정과 진행 계산이 어긋나지 않는다', () => {
  it('휴식 조건이 붙으면 진행률은 «rest» 축이다 — 다른 축(연속일수) 하나로 100%를 그리지 않는다', () => {
    // 0031 이전에는 unsupported였다. { streak_days: 6, rest_after_streak: 2 }가 streak_days
    // 축 1개짜리 cumulative로 잡히면 「연속 6일」만 그리고 「그 뒤 2일 쉬어야 한다」를 숨긴다.
    // 이제 휴식 자체가 축이 되므로 «숨김»이 생기지 않는다.
    expect(classifyBadgeProgressKind({ activity_type: 'running', streak_days: 6 })).toBe('cumulative')
    expect(
      classifyBadgeProgressKind({ activity_type: 'running', streak_days: 6, rest_after_streak: 2 })
    ).toBe('rest')
  })

  it('「무엇이 휴식 조건인가」의 정의가 한 곳뿐이다 — 4종 전부가 진행률에서 rest', () => {
    // ⚠️ **각 키를 그 키의 짝 필드와만 짝지어 준다.** 초안은 4종 전부에 `streak_days: 6`을
    // 붙였는데, `streak_days`는 `rest_after_streak`의 짝 필드일 뿐이라 나머지 2종에서는
    // **휴식 판정이 보지도 않는 독립 축**이다. 그 형태를 rest로 단언하면 「연속 6일은 아직
    // 미달인데 진행률 100%」를 기대값으로 못 박게 된다(게이트 실측 재현 사례).
    const pairFields: Record<string, BadgeCondition> = {
      rest_after_streak: { streak_days: 6 },
      rest_after_long: { single_distance_km: 20 },
      return_gap_days: {},
      interval_days: {},
    }
    for (const key of REST_CONDITION_KEYS) {
      const cond = { activity_type: 'running', ...pairFields[key], [key]: 90 } as BadgeCondition
      expect(restConditionKeysIn(cond), key).toEqual([key])
      // rest_after_long의 짝 필드 single_distance_km도 이제 engine이다(티켓 20260906_0110 ②)
      // — 4종 전부가 같은 규칙으로 rest 축을 갖는다.
      expect(classifyBadgeProgressKind(cond), key).toBe('rest')
    }
  })

  it('휴식 술어가 보지 않는 축이 섞이면 진행률을 그리지 않는다 — 축 하나를 숨긴 100%를 막는다', () => {
    // `streak_days`는 `rest_after_streak`의 짝 필드일 뿐이다. `return_gap_days`와 함께 오면
    // 휴식 판정은 연속일수를 **보지 않고**, 엔진이 그 축을 따로 평가한다 — 휴식 축만 그리면
    // 「휴식 5/5일 = 100%」인데 발급은 연속 6일 미달로 막힌 상태가 화면에 나간다.
    const cond: BadgeCondition = { activity_type: 'running', streak_days: 6, return_gap_days: 5 }
    const acts = [act('2026-06-01'), act('2026-06-10')] // 공백 8일 — 휴식만 보면 이미 충족
    expect(checkCondition(cond, acts)).toBe(false)
    expect(classifyBadgeProgressKind(cond)).toBe('unsupported')
  })

  it('휴식 + 회차는 발급이 막히는 조합이라 진행률도 그리지 않는다', () => {
    const cond = { activity_type: 'running', duration_minutes: 60, repeat_count: 3, return_gap_days: 90 } as BadgeCondition
    expect(evaluateConditionDetailed(cond, []).reason).toBe('회차와 함께 쓸 수 없는 조건')
    expect(classifyBadgeProgressKind(cond)).toBe('unsupported')
  })

  it('발급 판정과 진행률이 같은 방향을 본다 — 조건을 충족하면 축도 met이다', () => {
    const cond: BadgeCondition = { activity_type: 'running', streak_days: 6, rest_after_streak: 2 }
    const acts = [...consecutive('2026-06-01', 6), act('2026-06-09')]
    expect(checkCondition(cond, acts)).toBe(true)
    expect(classifyBadgeProgressKind(cond)).toBe('rest')
  })

  it('헬퍼를 직접 부른 결과와 조건 평가의 결과가 같다', () => {
    const cond: BadgeCondition = { activity_type: 'running', return_gap_days: 90 }
    const cases: NormalizedActivity[][] = [
      [],
      [act('2026-06-01')],
      [act('2026-06-01'), act('2026-06-03')],
      [act('2026-06-01'), act('2026-09-05')],
    ]
    for (const acts of cases) {
      const direct = evaluateRestConditions(cond, acts)
      expect(checkCondition(cond, acts)).toBe(direct.kind === 'pass')
    }
  })
})

// ── 순수 공백 조건 — 하한은 엔진이 아니라 카탈로그가 지킨다 ─────────────

describe('휴식 — 순수 공백 조건에 엔진 하한을 걸지 않는다', () => {
  const longGap = [act('2026-01-01'), act('2026-06-01')] // 151일 차

  // §4의 「순수 공백 기반(「겨울잠」)만 쿨다운 90일」은 **카탈로그 설계 지침**이다
  // (2026-09-05 스펙 소유자 확정). 엔진이 값을 강제하면 conditionRegistry의
  // min:1/max:365와 어긋나고, 경고 로그가 «배지 × 유저 × 싱크»마다 찍혀 폭주한다.
  it('90일 미만 조건값도 정상 판정된다 — 설정 오류로 막지 않는다', () => {
    const r = evaluateConditionDetailed({ activity_type: 'running', return_gap_days: 30 }, longGap)
    expect(r.reason).not.toBe('휴식 조건 설정 오류')
    expect(r.pass).toBe(true) // 151일 공백 ≥ 30일
  })

  it('interval_days도 마찬가지다', () => {
    expect(checkCondition({ activity_type: 'running', interval_days: 3 }, longGap)).toBe(true)
  })

  it('조건값 자체의 판정은 그대로다', () => {
    expect(checkCondition({ activity_type: 'running', return_gap_days: 90 }, longGap)).toBe(true)
    expect(checkCondition({ activity_type: 'running', return_gap_days: 200 }, longGap)).toBe(false)
  })

  it('활동이 선행되는 두 조건에는 하한이 없다 — 역인센티브가 없기 때문', () => {
    const acts = [...consecutive('2026-06-01', 6), act('2026-06-09')]
    expect(checkCondition({ activity_type: 'running', streak_days: 6, rest_after_streak: 2 }, acts)).toBe(true)
  })
})

// ── 필터 규칙은 엔진의 다른 블록과 같다 ─────────────────────────────────

describe('휴식 — 종목 필터·걷기 축1 게이트를 그대로 적용한다', () => {
  it('다른 종목 활동은 그 종목의 공백을 끊지 않는다', () => {
    const acts = [
      act('2026-01-01'),
      act('2026-03-15', { jamActivityType: 'cycling' }),
      act('2026-06-01'),
    ]
    // 러닝 기준으로는 1/1 → 6/1 사이(151일)가 통째로 공백이다
    expect(checkCondition({ activity_type: 'running', return_gap_days: 90 }, acts)).toBe(true)
    // 종목을 지정하지 않으면 3/15 자전거가 공백을 둘로 끊는다(73일 + 78일)
    expect(checkCondition({ return_gap_days: 90 }, acts)).toBe(false)
  })

  it('축1 게이트를 통과 못한 걷기는 「활동 없음」으로 취급된다', () => {
    const walk = (ymd: string, overrides: Partial<NormalizedActivity> = {}) =>
      act(ymd, { jamActivityType: 'walking', distanceKm: 3, movingTimeSec: 1800, averageSpeedKmh: 6, ...overrides })
    const acts = [
      walk('2026-01-01'),
      // 0.2km·2분 — 축1 게이트 미통과라 걷기 배지 평가에 존재하지 않는 것으로 본다
      walk('2026-03-01', { distanceKm: 0.2, movingTimeSec: 120, averageSpeedKmh: 6 }),
      walk('2026-06-01'),
    ]
    expect(checkCondition({ activity_type: 'walking', return_gap_days: 90 }, acts)).toBe(true)
  })
})

// ── 형태 오류 ───────────────────────────────────────────────────────────

describe('휴식 — 값의 형태가 깨지면 통과가 아니라 차단이다', () => {
  it('문자열·0·음수는 형태 오류로 막는다', () => {
    const acts = [act('2026-01-01'), act('2026-06-01')]
    for (const bad of ['90', 0, -1, null]) {
      const cond = { activity_type: 'running', return_gap_days: bad } as unknown as BadgeCondition
      const r = evaluateConditionDetailed(cond, acts)
      expect(r.pass, String(bad)).toBe(false)
      expect(r.reason, String(bad)).toBe('휴식 조건 형태 오류')
    }
  })
})
