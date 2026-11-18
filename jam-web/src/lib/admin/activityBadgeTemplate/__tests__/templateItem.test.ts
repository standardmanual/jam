/**
 * listTemplateItems: 코드에 정의한 템플릿 항목 (티켓 20261116_1513)
 */
import { describe, it, expect } from 'vitest'
import { listTemplateItems } from '../templateItem'

describe('listTemplateItems', () => {
  it('다섯 분류를 정해진 순서로 돌려주고 모두 정의가 있다', () => {
    const items = listTemplateItems()
    expect(items.map((i) => i.classKey)).toEqual(['metric', 'days', 'streak', 'count', 'etc'])
    for (const i of items) {
      expect(Boolean(i.svg)).toBe(true)
      expect(i.slots).not.toBeNull()
    }
    expect(items[4]).toMatchObject({ label: '기타' })
  })
})
