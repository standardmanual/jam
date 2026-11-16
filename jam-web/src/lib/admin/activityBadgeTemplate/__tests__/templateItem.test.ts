/**
 * listTemplateItems: 코드에 정의한 템플릿 항목 (티켓 20261116_1513)
 */
import { describe, it, expect } from 'vitest'
import { listTemplateItems } from '../templateItem'

describe('listTemplateItems', () => {
  it('네 분류를 정해진 순서로 돌려주고 metric만 정의가 있다', () => {
    const items = listTemplateItems()
    expect(items.map((i) => i.classKey)).toEqual(['metric', 'days', 'streak', 'count'])
    expect(items[0].svg).toBeTruthy()
    expect(items[0].slots).not.toBeNull()
    for (const i of items.slice(1)) {
      expect(i.svg).toBeNull()
      expect(i.slots).toBeNull()
    }
  })
})
