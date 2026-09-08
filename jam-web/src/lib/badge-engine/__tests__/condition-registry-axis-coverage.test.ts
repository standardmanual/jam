/**
 * 티켓 20260908_1343 — badgeProgress.ts 「숨은 축」 설계 결함의 일반적 해소, 회귀 테스트
 *
 * `classifyConditionKind`(badgeProgress.ts)가 `conditionRegistry.ts`의 measurable 필드
 * 전체를 빠짐없이 「이미 아는 축」으로 인정하는지 대조한다. 새 조건 필드를
 * `role: 'measurable'`로 레지스트리에 추가하고 `KNOWN_MEASURABLE_AXIS_KEYS`
 * (badgeProgress.ts)에 반영하지 않으면 이 테스트가 실패한다 — 예전(NO_PROGRESS_AXIS_YET,
 * 티켓 20260908_1318)에는 손으로 4개만 나열해 이 대조가 기계적으로 강제되지 않았다.
 *
 * 실행: `npx vitest run src/lib/badge-engine/__tests__/condition-registry-axis-coverage.test.ts`
 */
import { describe, it, expect } from 'vitest'
import { CONDITION_FIELDS } from '../conditionRegistry'
import { KNOWN_MEASURABLE_AXIS_KEYS, classifyBadgeProgressKind } from '../badgeProgress'
import type { BadgeCondition } from '@/types/database'

/**
 * 「아직 축 지원이 없다고 이미 확인된」 measurable+engine 필드 — 티켓 20260908_1318이
 * 후속 티켓으로 미룬 4종이다. 이 목록에 있는 키는 `classifyConditionKind`가 화이트리스트
 * fail-safe로 `unsupported`를 반환하는 게 **의도된 현재 동작**이라 실패로 잡지 않는다.
 *
 * `evaluation: 'pending'`인 필드(`daily_once_count` 등)는 여기 넣지 않는다 — 그 필드는
 * `findBlockingConditionKeys`가 이 함수보다 먼저 fail-closed로 막아 애초에 축 여부를 물을
 * 필요가 없다(아래 두 번째 describe가 그 경계를 실측한다).
 */
const EXPECTED_AXIS_GAP: ReadonlySet<string> = new Set<string>([
  'distinct_time_bands',
  'activities_within_hours',
  'month_over_month_ratio',
  'vs_personal_average',
])

describe('conditionRegistry.ts의 measurable+engine 키 ⊆ 화이트리스트 ∪ 알려진 축 공백', () => {
  it('신규 measurable+engine 필드가 추가되면 이 테스트가 먼저 실패한다(드리프트 감지)', () => {
    const measurableEngineKeys = CONDITION_FIELDS.filter((f) => f.role === 'measurable' && f.evaluation === 'engine').map(
      (f) => f.key
    )
    const unaccounted = measurableEngineKeys.filter((k) => !KNOWN_MEASURABLE_AXIS_KEYS.has(k) && !EXPECTED_AXIS_GAP.has(k))
    expect(unaccounted).toEqual([])
  })

  it('EXPECTED_AXIS_GAP 목록은 여전히 정확히 4개다(늘거나 줄면 의식적으로 갱신해야 한다)', () => {
    expect([...EXPECTED_AXIS_GAP].sort()).toEqual(
      ['activities_within_hours', 'distinct_time_bands', 'month_over_month_ratio', 'vs_personal_average'].sort()
    )
  })
})

describe('evaluation: pending 필드는 화이트리스트 없이도 fail-closed로 막힌다', () => {
  it('daily_once_count 단독 조건은 findBlockingConditionKeys가 먼저 막아 unsupported다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', daily_once_count: 10 }
    expect(classifyBadgeProgressKind(cond)).toBe('unsupported')
  })
})

describe('classifyConditionKind — 미지의 축이 섞이면 fail-safe로 unsupported (화이트리스트 일반화)', () => {
  it('알려진 축(distance_km) + 아직 축이 없는 measurable 필드가 섞이면 unsupported', () => {
    // 실제 회귀 소재였던 조합 그대로(티켓 20260908_1318 게이트 실측):
    // { distance_km: 100, month_over_month_ratio: 1.2 } → 옛 코드는 'cumulative'로 오분류.
    const cond: BadgeCondition = { activity_type: 'running', distance_km: 100, month_over_month_ratio: 1.2 }
    expect(classifyBadgeProgressKind(cond)).toBe('unsupported')
  })

  it('알려진 축(personal_record_break) + vs_personal_average가 섞이면 unsupported', () => {
    const cond: BadgeCondition = {
      activity_type: 'walking',
      personal_record_break: 3,
      personal_record_break_metric: 'single_distance_km',
      vs_personal_average: 2,
    }
    expect(classifyBadgeProgressKind(cond)).toBe('unsupported')
  })

  it('season_count_all(multi) + 미지의 measurable 필드가 섞이면 unsupported (isMulti 경로도 보호)', () => {
    // 화이트리스트 검사를 isMulti 판정보다 앞에 둔 이유의 회귀 소재 — 예전 NO_PROGRESS_AXIS_YET은
    // isMulti 분기 뒤에 있어 이 조합을 보호하지 못했다.
    const cond: BadgeCondition = { activity_type: 'running', season_count_all: 5, month_over_month_ratio: 1.2 }
    expect(classifyBadgeProgressKind(cond)).toBe('unsupported')
  })

  it('알려진 축만 있으면(회귀 없음) 여전히 정상 분류된다 — distance_km 단독', () => {
    const cond: BadgeCondition = { activity_type: 'running', distance_km: 100 }
    expect(classifyBadgeProgressKind(cond)).toBe('cumulative')
  })

  it('알려진 축만 있으면(회귀 없음) 여전히 정상 분류된다 — personal_record_break + 짝 필드', () => {
    const cond: BadgeCondition = {
      activity_type: 'walking',
      personal_record_break: 3,
      personal_record_break_metric: 'single_distance_km',
    }
    expect(classifyBadgeProgressKind(cond)).toBe('cumulative')
  })
})
