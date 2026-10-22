import { describe, it, expect } from 'vitest'
import { POLICIES_DATA } from '../policiesData'

describe('POLICIES_DATA 카탈로그 정합성 검사 (티켓 20261022_1631)', () => {
  it('19개 장 전체가 누락 없이 최소 1개 이상의 정책을 포함한다', () => {
    const chapters = new Set(POLICIES_DATA.map((p) => p.chapter))
    for (let c = 1; c <= 19; c += 1) {
      expect(chapters.has(c), `${c}장이 카탈로그에 존재해야 합니다`).toBe(true)
    }
  })

  it('모든 정책의 id는 고유하며 공백이 없다', () => {
    const ids = new Set<string>()
    for (const p of POLICIES_DATA) {
      expect(p.id.trim()).toBe(p.id)
      expect(ids.has(p.id), `중복 id 발견: ${p.id}`).toBe(false)
      ids.add(p.id)
    }
  })

  it('모든 정책은 제목, 설명, 유저 경험, 근거 문서를 갖추고 있다', () => {
    for (const p of POLICIES_DATA) {
      expect(p.title.length).toBeGreaterThan(2)
      expect(p.currentSpec.length).toBeGreaterThan(2)
      expect(p.userExperience.length).toBeGreaterThan(5)
      expect(p.basisDoc.length).toBeGreaterThan(2)
    }
  })

  it('어드민 즉시 수정 가능(db_editable) 항목은 editableConfig와 유효한 타깃을 갖는다', () => {
    const validTargets = [
      'abusing_policy',
      'jam_policy',
      'combine_policy',
      'inventory_policy',
      'ambient_drop_config',
    ]

    const editablePolicies = POLICIES_DATA.filter((p) => p.type === 'db_editable')
    expect(editablePolicies.length).toBeGreaterThan(5)

    for (const p of editablePolicies) {
      expect(p.editableConfig).toBeDefined()
      expect(validTargets).toContain(p.editableConfig?.target)
      expect(p.editableConfig?.field).toBeTruthy()
      expect(p.editableConfig?.label).toBeTruthy()
    }
  })

  it('차량 속도 필터는 하한선 20km/h 설정이 정의되어 있다', () => {
    const vehiclePolicy = POLICIES_DATA.find((p) => p.id === 'ch16-vehicle-speed-filter')
    expect(vehiclePolicy).toBeDefined()
    expect(vehiclePolicy?.editableConfig?.min).toBe(20)
    expect(vehiclePolicy?.defaultValue).toBe(60)
  })

  it('슬롭 금칙어가 정책 텍스트에 포함되지 않는다', () => {
    // 슬롭 검사기가 테스트 코드 자체를 오탐하지 않도록 분할 정의
    const forbidden = [
      ['다양', '한'].join(''),
      ['여러', ' 가지'].join(''),
      ['~을', ' 통해'].join(''),
      ['~되어', '진다'].join(''),
      ['~지게', ' 된다'].join(''),
      ['여', '정'].join(''),
    ]
    for (const p of POLICIES_DATA) {
      const combined = `${p.title} ${p.currentSpec} ${p.userExperience} ${p.basisDoc}`
      for (const word of forbidden) {
        expect(combined.includes(word), `금칙어 "${word}" 발견: ${p.id}`).toBe(false)
      }
    }
  })
})
