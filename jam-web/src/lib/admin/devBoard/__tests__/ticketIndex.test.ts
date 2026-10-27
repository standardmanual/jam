/**
 * 티켓 색인 읽기 (티켓 20261026_2028 2회차)
 *
 * 지키는 것:
 * - 깨진 항목은 건너뛰고 개수를 센다. 배열이 아니거나 JSON이 깨졌으면 null
 * - 자손 찾기는 순환·자기 참조에도 끝나고, 루트 자신은 넣지 않으며, 같은 id의 항목을 모두 담는다
 * - 제목의 `[카테고리] ` 접두를 뗀다
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/devBoard/__tests__/ticketIndex.test.ts
 */
import { describe, it, expect } from 'vitest'
import { descendantsOf, parseTicketIndex, stripCategoryPrefix } from '../ticketIndex'
import { entry } from './fixtures'

describe('parseTicketIndex', () => {
  it('항목을 읽고 선택 필드가 없으면 빈 문자열로 채운다', () => {
    const result = parseTicketIndex(JSON.stringify([{ id: 'a', title: 't', status: 'OPEN' }]))
    expect(result).toEqual({
      entries: [
        { id: 'a', title: 't', status: 'OPEN', category: '', priority: '', parent: '', origin: '', created: '', closed: '', path: '' },
      ],
      invalid: 0,
    })
  })

  it('id·status·title이 문자열이 아닌 항목은 건너뛰고 센다', () => {
    const result = parseTicketIndex(
      JSON.stringify([{ id: 'a', title: 't', status: 'OPEN' }, { id: 1, title: 't', status: 'OPEN' }, null, 'x', { id: 'b', status: 'OPEN' }])
    )
    expect(result?.entries.map((e) => e.id)).toEqual(['a'])
    expect(result?.invalid).toBe(4)
  })

  it('JSON이 깨졌거나 배열이 아니면 null이다', () => {
    expect(parseTicketIndex('{')).toBeNull()
    expect(parseTicketIndex('{}')).toBeNull()
    expect(parseTicketIndex('')).toBeNull()
  })
})

describe('descendantsOf', () => {
  it('3단계 자손까지 담고 루트 자신은 넣지 않는다', () => {
    const entries = [
      entry({ id: 'root' }),
      entry({ id: 'b1', parent: 'root' }),
      entry({ id: 'c1', parent: 'b1' }),
      entry({ id: 'd1', parent: 'c1' }),
      entry({ id: 'other', parent: 'x' }),
    ]
    expect(descendantsOf(entries, 'root').map((e) => e.id).sort()).toEqual(['b1', 'c1', 'd1'])
  })

  it('순환 parent와 자기 참조에도 끝난다', () => {
    const entries = [
      entry({ id: 'root', parent: 'c' }),
      entry({ id: 'a', parent: 'root' }),
      entry({ id: 'b', parent: 'a' }),
      entry({ id: 'c', parent: 'b' }),
      entry({ id: 'self', parent: 'self' }),
    ]
    const ids = descendantsOf(entries, 'root').map((e) => e.id).sort()
    expect(ids).toEqual(['a', 'b', 'c'])
    expect(descendantsOf(entries, 'self')).toEqual([])
  })

  it('같은 id의 항목이 둘이면 둘 다 담는다', () => {
    const entries = [
      entry({ id: 'root' }),
      entry({ id: 'dup', parent: 'root', path: 'p1' }),
      entry({ id: 'dup', parent: 'root', path: 'p2' }),
      entry({ id: 'kid', parent: 'dup' }),
    ]
    expect(descendantsOf(entries, 'root')).toHaveLength(3)
  })
})

describe('stripCategoryPrefix', () => {
  it('앞쪽 [카테고리] 표시만 뗀다', () => {
    expect(stripCategoryPrefix('[Admin] 개발 상황판 [초안]')).toBe('개발 상황판 [초안]')
    expect(stripCategoryPrefix('접두 없음')).toBe('접두 없음')
  })
})
