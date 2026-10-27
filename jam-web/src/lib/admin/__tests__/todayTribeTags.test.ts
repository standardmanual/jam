/**
 * 어드민 투데이 — 트라이브 태그 표시 순수 함수 (티켓 20261026_2030 2회차)
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/todayTribeTags.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  UNKNOWN_TRIBE_LABEL,
  exposureTagDisplay,
  orphanTribeTags,
  tribeTagLabel,
  tribeTagOptions,
  type TribeTagSource,
} from '../todayTribeTags'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const GONE = '33333333-3333-4333-8333-333333333333'

const TRIBES: TribeTagSource[] = [
  { id: A, name: '숲속의 갱단', is_active: true },
  { id: B, name: '새 트라이브', is_active: false },
]

describe('tribeTagOptions', () => {
  it('목록 순서대로 tribe_<id> 값과 이름 라벨을 만들고 비활성은 표시한다', () => {
    expect(tribeTagOptions(TRIBES)).toEqual([
      { value: `tribe_${A}`, label: '숲속의 갱단' },
      { value: `tribe_${B}`, label: '새 트라이브 (비활성)' },
    ])
  })

  it('UUID가 아닌 id는 건너뛰고 대문자 id는 소문자 값으로 만든다', () => {
    expect(
      tribeTagOptions([
        { id: 'bad', name: 'x', is_active: true },
        { id: A.toUpperCase(), name: '대문자', is_active: true },
      ])
    ).toEqual([{ value: `tribe_${A}`, label: '대문자' }])
  })

  it('목록이 비면 선택지도 비어 있다', () => {
    expect(tribeTagOptions([])).toEqual([])
  })
})

describe('tribeTagLabel', () => {
  it('목록에 있으면 이름, 없으면 「삭제됐거나 모르는 트라이브」', () => {
    expect(tribeTagLabel(`tribe_${A}`, TRIBES)).toBe('숲속의 갱단')
    expect(tribeTagLabel(`tribe_${B}`, TRIBES)).toBe('새 트라이브 (비활성)')
    expect(tribeTagLabel(`tribe_${GONE}`, TRIBES)).toBe(UNKNOWN_TRIBE_LABEL)
    expect(UNKNOWN_TRIBE_LABEL).toBe('(삭제됐거나 모르는 트라이브)')
  })

  it('트라이브 태그가 아니면 null이다', () => {
    expect(tribeTagLabel('all', TRIBES)).toBeNull()
    expect(tribeTagLabel('tribe_abc', TRIBES)).toBeNull()
  })
})

describe('orphanTribeTags', () => {
  it('선택돼 있는데 목록에 없는 트라이브 태그만 돌려준다', () => {
    expect(orphanTribeTags(['all', `tribe_${A}`, `tribe_${GONE}`, 'tribe_abc'], TRIBES)).toEqual([
      { value: `tribe_${GONE}`, label: UNKNOWN_TRIBE_LABEL },
    ])
    expect(orphanTribeTags(['all'], TRIBES)).toEqual([])
  })
})

describe('exposureTagDisplay', () => {
  it('트라이브 태그는 「트라이브: 이름」, 그 밖의 태그는 대체 라벨 함수를 따른다', () => {
    expect(exposureTagDisplay(`tribe_${A}`, TRIBES)).toBe('트라이브: 숲속의 갱단')
    expect(exposureTagDisplay(`tribe_${GONE}`, TRIBES)).toBe('트라이브: (삭제됐거나 모르는 트라이브)')
    expect(exposureTagDisplay('all', TRIBES)).toBe('all')
    expect(exposureTagDisplay('all', TRIBES, (v) => `라벨 ${v}`)).toBe('라벨 all')
  })
})
