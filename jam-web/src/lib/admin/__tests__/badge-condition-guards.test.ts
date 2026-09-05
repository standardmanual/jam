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

describe('② repeat_count + 휴식 조건 조합은 저장에서 거부된다', () => {
  it('repeat_count와 return_gap_days를 함께 쓰면 막는다', () => {
    const error = findRepeatRestConflictError({ repeat_count: 5, return_gap_days: 90 })
    expect(error).not.toBeNull()
    expect(error).toContain('repeat_count')
    expect(error).toContain('복귀 전 휴식일')
  })

  it('휴식 4종 어느 것과 조합해도 막는다', () => {
    const rest: BadgeCondition[] = [
      { rest_after_streak: 2, streak_days: 6 },
      { rest_after_long: 3, single_distance_km: 100 },
      { return_gap_days: 90 },
      { interval_days: 90 },
    ]
    for (const cond of rest) {
      expect(findRepeatRestConflictError({ ...cond, repeat_count: 3 })).not.toBeNull()
    }
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

describe('findConditionShapeSaveError — 세 검사를 한 진입점에서 돌린다', () => {
  it('정상 조건은 통과한다', () => {
    expect(findConditionShapeSaveError(badge, { distance_km: 100, total_count: 10 })).toBeNull()
  })

  it('세 경로 중 하나라도 걸리면 오류를 돌려준다', () => {
    expect(findConditionShapeSaveError(badge, { rest_after_streak: 2 })).not.toBeNull()
    expect(findConditionShapeSaveError(badge, { repeat_count: 3, interval_days: 90 })).not.toBeNull()
    expect(
      findConditionShapeSaveError(badge, { cross_in_axis: {} } as unknown as BadgeCondition)
    ).not.toBeNull()
  })

  it('조건이 없으면 통과한다', () => {
    expect(findConditionShapeSaveError(badge, null)).toBeNull()
  })
})
