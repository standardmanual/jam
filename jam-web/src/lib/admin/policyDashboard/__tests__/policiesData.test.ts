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

  it('설정 화면에서 바꾸는(admin_link) 항목은 링크를 갖고, 직접 저장 설정은 어디에도 없다', () => {
    const linked = POLICIES_DATA.filter((p) => p.type === 'admin_link')
    expect(linked.length).toBeGreaterThan(5)

    for (const p of linked) {
      expect(p.adminLink, `${p.id}에 adminLink가 있어야 합니다`).toBeDefined()
      expect(p.adminLink?.href.startsWith('/admin/'), `${p.id}의 링크는 어드민 화면이어야 합니다`).toBe(true)
    }

    // 직접 저장하던 시절의 칸(editableConfig)과 옛 유형 이름은 남아 있지 않다
    for (const p of POLICIES_DATA) {
      expect('editableConfig' in p, `${p.id}에 editableConfig가 남아 있습니다`).toBe(false)
      expect(p.type as string).not.toBe('db_editable')
    }
  })

  it('adminLink는 admin_link 유형에만 있고, 읽어 보여 줄 칸(liveField)은 DB 칸과 같다', () => {
    for (const p of POLICIES_DATA) {
      if (p.type !== 'admin_link') {
        expect(p.adminLink, `${p.id}는 admin_link가 아니므로 adminLink가 없어야 합니다`).toBeUndefined()
        continue
      }
      if (p.adminLink?.liveField !== undefined) {
        expect(p.adminLink.liveField, `${p.id}의 liveField는 dbColumn과 같아야 합니다`).toBe(p.dbColumn)
      }
    }
  })

  it('밸런스 설정에 구역이 있는 항목은 해당 구역 링크(/admin/balance#구역)로 이어진다', () => {
    const hrefOf = (id: string) => POLICIES_DATA.find((p) => p.id === id)?.adminLink?.href

    // 잼 구역(강도 배율 3칸, 경보 기준 2칸)
    for (const id of [
      'ch4-intensity-light',
      'ch4-intensity-normal',
      'ch4-intensity-hard',
      'ch4-mass-earn-multiplier',
      'ch4-mass-earn-no-history',
    ]) {
      expect(hrefOf(id), id).toBe('/admin/balance#jam')
    }
    // 컬렉션과 믹스 구역
    expect(hrefOf('ch8-mix-fail-reward')).toBe('/admin/balance#collection')
    expect(hrefOf('ch8-collection-rewards')).toBe('/admin/balance#collection')
    // 잠긴 아이템 배지 구역
    expect(hrefOf('ch7-locked-min-requirements')).toBe('/admin/balance#locked')
    // 챕터 구역
    expect(hrefOf('ch12-score-thresholds')).toBe('/admin/balance#chapter')
    expect(hrefOf('ch12-jam-weekly-cap')).toBe('/admin/balance#chapter')
  })

  it('밸런스 설정에 구역이 아직 없는 항목(인벤토리·시스템 드랍·어뷰징)은 옛 화면 링크를 둔다', () => {
    const hrefOf = (id: string) => POLICIES_DATA.find((p) => p.id === id)?.adminLink?.href

    expect(hrefOf('ch8-inventory-max-slots')).toBe('/admin/inventory-policy')
    for (const id of ['ch9-ambient-schedule-hour', 'ch9-ambient-poi-cap', 'ch9-ambient-exclusion-window']) {
      expect(hrefOf(id), id).toBe('/admin/ambient-drop')
    }
    const abusing = POLICIES_DATA.filter((p) => p.dbTable === 'abusing_policy')
    expect(abusing.length).toBe(8)
    for (const p of abusing) {
      expect(p.adminLink?.href, p.id).toBe('/admin/abusing')
    }
  })

  it('차량 속도 필터 카드는 기본값 60km/h를 읽어 보이고 어뷰징 화면으로 이어진다', () => {
    const vehiclePolicy = POLICIES_DATA.find((p) => p.id === 'ch16-vehicle-speed-filter')
    expect(vehiclePolicy).toBeDefined()
    expect(vehiclePolicy?.adminLink?.liveField).toBe('vehicle_speed_filter_kmh')
    expect(vehiclePolicy?.adminLink?.unit).toBe('km/h')
    expect(vehiclePolicy?.adminLink?.href).toBe('/admin/abusing')
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
