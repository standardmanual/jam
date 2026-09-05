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
 *   ⑤ `repeat_count`와의 조합이 「회차와 함께 쓸 수 없는 조건」으로 명확히 드러난다
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
import { classifyBadgeProgressKind } from '../badgeProgress'
import { findBlockingConditionKeys } from '../conditionRegistry'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition } from '@/types/database'

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

  it('rest_after_long은 짝 필드(single_distance_km)가 아직 평가 대기라 여전히 막힌다', () => {
    // 휴식 판정 자체는 구현됐지만, 짝 필드가 `evaluation: 'pending'`이라 fail-closed가 먼저
    // 막는다. v5 스칼라 7종을 뒤집는 선행 작업이 끝나야 실제로 발급된다 — 이 테스트가
    // 그 선행 관계를 못 박는다(잊고 시딩하면 「영원히 안 나오는 배지」가 된다).
    const cond = { activity_type: 'running', rest_after_long: 1, single_distance_km: 30 } as BadgeCondition
    const acts = [act('2026-06-01', { distanceKm: 42 }), act('2026-06-03')]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toContain('평가 구현 대기')
    expect(r.reason).toContain('single_distance_km')

    // 헬퍼 자체는 이미 판정할 수 있다 — 막고 있는 것은 짝 필드의 평가 대기 상태뿐이다
    expect(evaluateRestConditions(cond, acts).kind).toBe('pass')
  })
})

// ── ⑤ 회차와의 조합 금지 (B-10) ──────────────────────────────────────────

describe('휴식 — repeat_count와 함께 쓸 수 없다 (B-10)', () => {
  it('사유가 「회차와 함께 쓸 수 없는 조건」으로 드러난다', () => {
    const cond: BadgeCondition = {
      activity_type: 'running',
      streak_days: 6,
      rest_after_streak: 2,
      repeat_count: 3,
    }
    const acts = [...consecutive('2026-06-01', 6), act('2026-06-09')]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('회차와 함께 쓸 수 없는 조건')
    expect(r.actual).toContain('rest_after_streak')
    // 예전이라면 회차 술어의 fail-closed 가드가 조용히 회차를 0으로 떨어뜨려
    // 「충족 횟수 부족 / 0회」로만 보였다 — 카탈로그 담당자가 원인을 찾을 수 없다
    expect(r.reason).not.toBe('충족 횟수 부족')
  })

  it('휴식 조건 전부가 같은 사유로 막힌다', () => {
    // `rest_after_long`은 짝 필드(single_distance_km)가 아직 평가 대기라 fail-closed가
    // **먼저** 막는다 — 그 선행 관계는 위 「짝 필드」 describe가 따로 못 박는다.
    const pairs: Partial<Record<(typeof REST_CONDITION_KEYS)[number], BadgeCondition>> = {
      rest_after_streak: { streak_days: 6 },
    }
    for (const key of REST_CONDITION_KEYS) {
      if (key === 'rest_after_long') continue
      const cond = {
        activity_type: 'running',
        repeat_count: 3,
        ...(pairs[key] ?? {}),
        [key]: 90,
      } as BadgeCondition
      expect(restConditionKeysIn(cond), key).toEqual([key])
      expect(evaluateConditionDetailed(cond, []).reason, key).toBe('회차와 함께 쓸 수 없는 조건')
    }
  })
})

// ── ⑥ 발급 판정 ↔ 진행 계산이 같은 헬퍼를 본다 ──────────────────────────

describe('휴식 — 발급 판정과 진행 계산이 어긋나지 않는다', () => {
  it('휴식 조건이 붙으면 진행률은 unsupported다 — 다른 축 하나로 100%를 그리지 않는다', () => {
    // 이 줄이 없으면 { streak_days: 6, rest_after_streak: 2 }가 streak_days 축 1개짜리
    // cumulative로 잡혀 「연속 6일」만 그리고 「그 뒤 2일 쉬어야 한다」를 숨긴다.
    expect(classifyBadgeProgressKind({ activity_type: 'running', streak_days: 6 })).toBe('cumulative')
    expect(
      classifyBadgeProgressKind({ activity_type: 'running', streak_days: 6, rest_after_streak: 2 })
    ).toBe('unsupported')
  })

  it('「무엇이 휴식 조건인가」의 정의가 한 곳뿐이다 — 4종 전부가 진행률에서 unsupported', () => {
    for (const key of REST_CONDITION_KEYS) {
      const cond = { activity_type: 'running', streak_days: 6, [key]: 90 } as BadgeCondition
      expect(restConditionKeysIn(cond), key).toEqual([key])
      expect(classifyBadgeProgressKind(cond), key).toBe('unsupported')
    }
  })

  it('발급 판정은 실제로 이뤄진다 — 진행률만 못 그릴 뿐 「평가 대기」가 아니다', () => {
    const cond: BadgeCondition = { activity_type: 'running', streak_days: 6, rest_after_streak: 2 }
    const acts = [...consecutive('2026-06-01', 6), act('2026-06-09')]
    expect(checkCondition(cond, acts)).toBe(true)
    expect(classifyBadgeProgressKind(cond)).toBe('unsupported')
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
