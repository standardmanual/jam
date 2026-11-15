/**
 * studioBadge: 검색 응답에 싣는 분류·값 (티켓 20261116_0535)
 */
import { describe, it, expect } from 'vitest'
import { toStudioBadgeFields } from '../studioBadge'
import type { BadgeCondition } from '@/types/database'

describe('toStudioBadgeFields', () => {
  it('운동 수치 조건을 분류와 값으로 바꾼다', () => {
    expect(toStudioBadgeFields({ condition_json: { single_distance_km: 21.1 } as BadgeCondition, family_key: 'fam' })).toEqual({
      templateClass: 'metric',
      templateClassLabel: '운동 수치',
      templateValue: '21.1km',
      familyKey: 'fam',
    })
  })

  it('규칙에 없는 조건은 세 칸이 null', () => {
    expect(toStudioBadgeFields({ condition_json: { foo: 1 } as unknown as BadgeCondition })).toEqual({
      templateClass: null,
      templateClassLabel: null,
      templateValue: null,
      familyKey: null,
    })
    expect(toStudioBadgeFields({ condition_json: null }).templateClass).toBeNull()
  })
})
