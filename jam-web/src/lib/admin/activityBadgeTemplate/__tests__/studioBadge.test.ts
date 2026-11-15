/**
 * studioBadge: 검색 응답에 싣는 분류·값 (티켓 20261116_0535, 조정값 20261116_0728)
 */
import { describe, it, expect } from 'vitest'
import { toStudioBadgeFields } from '../studioBadge'
import { parseTemplateBadgeParams } from '../templateParams'
import type { BadgeCondition } from '@/types/database'

describe('toStudioBadgeFields', () => {
  it('운동 수치 조건을 분류와 값으로 바꾼다', () => {
    expect(toStudioBadgeFields({ condition_json: { single_distance_km: 21.1 } as BadgeCondition, family_key: 'fam' })).toEqual({
      templateClass: 'metric',
      templateClassLabel: '운동 수치',
      templateValue: '21.1km',
      familyKey: 'fam',
      templateParams: null,
    })
  })

  it('규칙에 없는 조건은 세 칸이 null', () => {
    expect(toStudioBadgeFields({ condition_json: { foo: 1 } as unknown as BadgeCondition })).toEqual({
      templateClass: null,
      templateClassLabel: null,
      templateValue: null,
      familyKey: null,
      templateParams: null,
    })
    expect(toStudioBadgeFields({ condition_json: null }).templateClass).toBeNull()
  })

  it('템플릿 조정값이 있으면 정리해 templateParams에 싣고, 옛 생성기 값은 null', () => {
    const cond = { single_distance_km: 5 } as BadgeCondition
    const saved = { kind: 'activity-template', v: 1, color: { hueShift: 20 } }
    const fields = toStudioBadgeFields({ condition_json: cond, image_gen_params: saved })
    expect(fields.templateParams).toEqual(parseTemplateBadgeParams(saved))
    expect(fields.templateParams?.color.hueShift).toBe(20)
    expect(toStudioBadgeFields({ condition_json: cond, image_gen_params: { v: 1, background: {} } }).templateParams).toBeNull()
  })
})
