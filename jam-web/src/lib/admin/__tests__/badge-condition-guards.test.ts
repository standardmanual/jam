/**
 * 어드민 저장 시점 가드 — 「저장은 되는데 영원히 안 나오는 배지」 차단
 * (티켓 20260905_0032 A-1 · A-3)
 *
 * 배경: 세 경로 모두 **판정 함수는 이미 있었다.** 다만 발급 시점에만 돌아서, 저장은 성공하고
 * 미발급 사유(`missed`)는 어드민 시뮬레이터를 열어야만 보였다. 카탈로그 550종 시딩
 * (티켓 20260905_0035) 이후에는 그런 배지 한 행을 사람이 찾아낼 방법이 사실상 없다.
 *
 * 실행: `npx vitest run src/lib/admin/__tests__/badge-condition-guards.test.ts`
 */
import {
  findUnpairedConditionError,
  findRepeatRestConflictError,
  findUsageMetricRepeatConflictError,
  findCrossGateShapeError,
  findRarityLevelError,
  findConditionShapeSaveError,
} from '../badge-condition-guards'
import type { BadgeCondition } from '@/types/database'

const badge = { name: '테스트 배지', family_key: 'running:test' }

describe('① 짝 필드 없는 조건은 저장에서 거부된다', () => {
  it('rest_after_streak에 streak_days가 없으면 막는다', () => {
    const error = findUnpairedConditionError({ rest_after_streak: 2 })
    expect(error).not.toBeNull()
    expect(error).toContain('연속 활동 후 휴식일')
    expect(error).toContain('연속 일수')
  })

  it('rest_after_long에 single_distance_km이 없으면 막는다', () => {
    expect(findUnpairedConditionError({ rest_after_long: 3 })).not.toBeNull()
  })

  it('짝이 함께 있으면 통과한다', () => {
    expect(findUnpairedConditionError({ rest_after_streak: 2, streak_days: 6 })).toBeNull()
    expect(findUnpairedConditionError({ rest_after_long: 3, single_distance_km: 100 })).toBeNull()
  })

  it('평가 대기 필드만 있는 조건은 막지 않는다 — 시딩이 평가 구현보다 먼저 들어올 수 있다', () => {
    expect(findUnpairedConditionError({ avg_watts: 200 })).toBeNull()
    expect(findUnpairedConditionError({ weekly_streak: 12 })).toBeNull()
  })

  it('조건이 없으면 통과한다', () => {
    expect(findUnpairedConditionError(null)).toBeNull()
  })
})

describe('② repeat_count + 휴식 조건 «2개 이상»은 저장에서 거부된다 (§B-10 재설계, 티켓 20260906_2056)', () => {
  it('repeat_count와 휴식 키 1개(그 짝 필드만)는 이제 저장할 수 있다', () => {
    // "휴식 조건을 만족한 복귀 사건"만 세는 전용 계산이 있어 발급이 영원히 막히지 않는다
    expect(findRepeatRestConflictError({ repeat_count: 5, return_gap_days: 90 })).toBeNull()
    expect(findRepeatRestConflictError({ repeat_count: 5, rest_after_streak: 2, streak_days: 6 })).toBeNull()
  })

  it('휴식 4종 어느 것과 단독 조합해도 이제 통과한다', () => {
    const rest: BadgeCondition[] = [
      { rest_after_streak: 2, streak_days: 6 },
      { rest_after_long: 3, single_distance_km: 100 },
      { return_gap_days: 90 },
      { interval_days: 90 },
    ]
    for (const cond of rest) {
      expect(findRepeatRestConflictError({ ...cond, repeat_count: 3 })).toBeNull()
    }
  })

  it('서로 다른 휴식 키 2개를 함께 쓰면 여전히 막는다 — 사건 경계가 정의되지 않는다', () => {
    const error = findRepeatRestConflictError({
      repeat_count: 3,
      rest_after_streak: 2,
      streak_days: 6,
      return_gap_days: 10,
    })
    expect(error).not.toBeNull()
    expect(error).toContain('repeat_count')
  })

  it('휴식 키 1개여도 그 짝 필드가 아닌 축이 섞이면 막는다', () => {
    // distance_km은 return_gap_days의 짝 필드가 아니다 — 휴식 판정이 보지 못하는 독립 축
    expect(findRepeatRestConflictError({ repeat_count: 3, return_gap_days: 90, distance_km: 5 })).not.toBeNull()
  })

  it('repeat_count만 있으면 통과한다', () => {
    expect(findRepeatRestConflictError({ repeat_count: 5, distance_km: 10 })).toBeNull()
  })

  it('휴식 조건만 있으면 통과한다', () => {
    expect(findRepeatRestConflictError({ return_gap_days: 90 })).toBeNull()
  })
})

describe('③ 교차 게이트 형태 오류는 저장에서 거부된다', () => {
  it('family_keys가 없으면 막는다', () => {
    const cond = { cross_in_axis: {} } as unknown as BadgeCondition
    const error = findCrossGateShapeError(badge, cond)
    expect(error).not.toBeNull()
    expect(error).toContain('축 내 교차')
  })

  it('family_keys가 배열이 아니면 막는다 (오타·수기 편집)', () => {
    const cond = { cross_between_axis: { family_keys: 'running:tempo' } } as unknown as BadgeCondition
    expect(findCrossGateShapeError(badge, cond)).not.toBeNull()
  })

  it('자기 계열만 가리키면 막는다 — 게이트가 항상 자동 통과된다', () => {
    const cond: BadgeCondition = { cross_in_axis: { family_keys: ['running:test'] } }
    expect(findCrossGateShapeError(badge, cond)).not.toBeNull()
  })

  it('min_count가 대상 계열 수보다 크면 막는다 — 영원히 통과할 수 없다', () => {
    const cond: BadgeCondition = {
      cross_between_axis: { family_keys: ['running:a'], min_count: 2 },
    }
    expect(findCrossGateShapeError(badge, cond)).not.toBeNull()
  })

  it('min_rarity 값이 등급 목록에 없으면 막는다', () => {
    const cond = {
      gate_mission_badge: { family_keys: ['running:oath'], min_rarity: 'legendary' },
    } as unknown as BadgeCondition
    expect(findCrossGateShapeError(badge, cond)).not.toBeNull()
  })

  it('정상 형태는 통과한다', () => {
    const cond: BadgeCondition = {
      cross_in_axis: { family_keys: ['running:tempo', 'running:interval'] },
      cross_between_axis: { family_keys: ['running:streak'], min_rarity: 'rare' },
      gate_mission_badge: { family_keys: ['running:oath'], min_count: 1 },
    }
    expect(findCrossGateShapeError(badge, cond)).toBeNull()
  })

  it('Postgres 원문이 그대로 새어 나가지 않는다 — 사람이 읽을 수 있는 안내다', () => {
    const cond = { cross_in_axis: {} } as unknown as BadgeCondition
    const error = findCrossGateShapeError(badge, cond)!
    expect(error).not.toContain('violates check constraint')
    expect(error).toContain('저장할 수 없습니다')
  })
})

describe('④·⑤ 등급형/레벨형 배타 규칙', () => {
  it('④ 레벨형 배지(등급 없음 + 레벨)는 통과한다 — 예전에는 생성 자체가 막혔다', () => {
    expect(findRarityLevelError(null, 1)).toBeNull()
    expect(findRarityLevelError(null, 12)).toBeNull()
    expect(findRarityLevelError(null, '3')).toBeNull()
  })

  it('등급형 배지는 그대로 통과한다 (회귀 방지)', () => {
    for (const r of ['common', 'rare', 'epic', 'mystic']) {
      expect(findRarityLevelError(r, null)).toBeNull()
    }
  })

  it('⑤ 등급과 레벨을 함께 지정하면 사람이 읽을 수 있는 메시지로 거부된다', () => {
    const error = findRarityLevelError('common', 3)
    expect(error).not.toBeNull()
    // CHECK 제약 원문(badges_rarity_level_exclusive)이 그대로 노출되면 안 된다
    expect(error).not.toContain('violates check constraint')
    expect(error).not.toContain('badges_rarity_level_exclusive')
    expect(error).toContain('함께 지정할 수 없습니다')
  })

  it('둘 다 없으면 거부된다', () => {
    expect(findRarityLevelError(null, null)).toContain('등급')
    expect(findRarityLevelError('', '')).not.toBeNull()
  })

  it('레벨이 0 이하이거나 정수가 아니면 거부된다', () => {
    expect(findRarityLevelError(null, 0)).not.toBeNull()
    expect(findRarityLevelError(null, -1)).not.toBeNull()
    expect(findRarityLevelError(null, 1.5)).not.toBeNull()
    expect(findRarityLevelError(null, 'abc')).not.toBeNull()
  })

  it('모르는 등급 값은 거부된다', () => {
    expect(findRarityLevelError('legendary', null)).not.toBeNull()
  })
})

describe('⑥ 사용량 지표(팔로워·팔로잉·일일동기화) + 회차 조합은 저장에서 거부된다 (티켓 20260910_1719)', () => {
  // 배경: usageBadges.ts의 발급 경로는 등급형(이름 그룹 내 최상위 tier 1개만)·레벨형만
  // 지원한다. isLeveledBadge()가 rarity==null 여부로만 이진 판정해, rarity가 있는(등급형)
  // 배지에 이 3개 키 중 하나 + repeat_count를 넣으면 에러 없이 저장은 되지만 실제로는
  // 등급형 경로로 흘러가 repeat_count가 조용히 무시된다 — 저장 시점에 막는다.
  it('follower_count + repeat_count는 막는다', () => {
    const cond = { follower_count: 100, repeat_count: 3 } as unknown as BadgeCondition
    const error = findUsageMetricRepeatConflictError(cond)
    expect(error).not.toBeNull()
    expect(error).toContain('follower_count')
    expect(error).toContain('repeat_count')
    expect(error).toContain('등급형·레벨형')
  })

  it('following_count + repeat_count는 막는다', () => {
    const cond = { following_count: 50, repeat_count: 2 } as unknown as BadgeCondition
    expect(findUsageMetricRepeatConflictError(cond)).not.toBeNull()
  })

  it('daily_sync_count + repeat_count는 막는다', () => {
    const cond = { daily_sync_count: 7, repeat_count: 5 } as unknown as BadgeCondition
    expect(findUsageMetricRepeatConflictError(cond)).not.toBeNull()
  })

  it('사용량 지표 2개 이상이 함께 있으면 전부 메시지에 나열한다', () => {
    const cond = { follower_count: 100, following_count: 50, repeat_count: 3 } as unknown as BadgeCondition
    const error = findUsageMetricRepeatConflictError(cond)!
    expect(error).toContain('follower_count')
    expect(error).toContain('following_count')
  })

  it('사용량 지표만 있고 repeat_count가 없으면 통과한다 (등급형·레벨형 정상 케이스)', () => {
    expect(findUsageMetricRepeatConflictError({ follower_count: 100 } as unknown as BadgeCondition)).toBeNull()
  })

  it('회귀: 사용량 지표가 아닌 기존 활동 기반 배지의 repeat_count는 영향받지 않는다', () => {
    expect(findUsageMetricRepeatConflictError({ repeat_count: 10, distance_km: 5 })).toBeNull()
    expect(findUsageMetricRepeatConflictError({ repeat_count: 10 })).toBeNull()
  })

  it('조건이 없으면 통과한다', () => {
    expect(findUsageMetricRepeatConflictError(null)).toBeNull()
  })

  it('findConditionShapeSaveError 진입점에서도 동일하게 거부된다', () => {
    const cond = { daily_sync_count: 7, repeat_count: 5 } as unknown as BadgeCondition
    const error = findConditionShapeSaveError(badge, cond)
    expect(error).not.toBeNull()
    expect(error).toContain('daily_sync_count')
  })
})

describe('findConditionShapeSaveError — 네 검사를 한 진입점에서 돌린다', () => {
  it('정상 조건은 통과한다', () => {
    expect(findConditionShapeSaveError(badge, { distance_km: 100, total_count: 10 })).toBeNull()
  })

  it('네 경로 중 하나라도 걸리면 오류를 돌려준다', () => {
    expect(findConditionShapeSaveError(badge, { rest_after_streak: 2 })).not.toBeNull()
    // 휴식 키 1개(interval_days) + repeat_count는 이제 통과한다(§B-10 재설계) — 휴식 키
    // 2개(사건 경계 미정의)로 두 번째 경로를 검증한다.
    expect(
      findConditionShapeSaveError(badge, { repeat_count: 3, rest_after_streak: 2, streak_days: 6, return_gap_days: 10 })
    ).not.toBeNull()
    expect(
      findConditionShapeSaveError(badge, { cross_in_axis: {} } as unknown as BadgeCondition)
    ).not.toBeNull()
    expect(
      findConditionShapeSaveError(badge, { follower_count: 100, repeat_count: 3 } as unknown as BadgeCondition)
    ).not.toBeNull()
  })

  it('조건이 없으면 통과한다', () => {
    expect(findConditionShapeSaveError(badge, null)).toBeNull()
  })
})
