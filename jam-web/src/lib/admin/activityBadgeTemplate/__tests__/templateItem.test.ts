/**
 * listTemplateItems: 코드에 정의한 템플릿 항목 (티켓 20261116_1513)
 */
import { describe, it, expect } from 'vitest'
import { listTemplateItems } from '../templateItem'

describe('listTemplateItems', () => {
  it('네 분류를 정해진 순서로 돌려주고 days를 뺀 분류는 정의가 있다', () => {
    const items = listTemplateItems()
    expect(items.map((i) => i.classKey)).toEqual(['metric', 'days', 'streak', 'count'])
    for (const i of items) {
      const defined = i.classKey === 'metric' || i.classKey === 'streak' || i.classKey === 'count'
      expect(Boolean(i.svg)).toBe(defined)
      expect(i.slots !== null).toBe(defined)
    }
  })
})
