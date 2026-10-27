/**
 * 일괄 승인 체크 상태와 다음 결정 항목 고르기 (티켓 20260930_1818)
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/opsInbox/__tests__/selection.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  isCheckedByDefault,
  isDecidable,
  isItemChecked,
  nextDecidableItemId,
  splitByChecked,
  withAllChecked,
  withCheck,
  withItemsChecked,
  type SelectableItem,
} from '../selection'

function make(id: string, overrides: Partial<SelectableItem> = {}): SelectableItem {
  return {
    id,
    position: 0,
    startsAt: '2026-10-05T00:00:00Z',
    status: 'reviewing',
    formatErrors: [],
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

describe('기본 체크', () => {
  it('검토중이면서 형식 오류가 없는 항목만 기본으로 체크된다', () => {
    expect(isItemChecked(make('a'), {})).toBe(true)
    expect(isItemChecked(make('b', { formatErrors: ['items[1].kind: 허용값이 아니에요'] }), {})).toBe(false)
    expect(isItemChecked(make('c', { status: 'approved' }), {})).toBe(false)
    expect(isItemChecked(make('d', { status: 'arrived' }), {})).toBe(false)
  })

  it('결정할 수 있는 항목은 검토중뿐이다', () => {
    expect(isDecidable({ status: 'reviewing' })).toBe(true)
    for (const status of ['arrived', 'approved', 'rejected', 'preparing', 'scheduled', 'live', 'ended', 'cancelled', 'failed']) {
      expect(isDecidable({ status })).toBe(false)
    }
    expect(isCheckedByDefault({ formatErrors: [] })).toBe(true)
  })
})

describe('사람이 바꾼 체크', () => {
  it('바꾼 체크가 기본값보다 우선한다', () => {
    const a = make('a')
    const b = make('b', { formatErrors: ['x: y'] })
    expect(isItemChecked(a, withCheck({}, a, false))).toBe(false)
    expect(isItemChecked(b, withCheck({}, b, true))).toBe(true)
  })

  it('항목이 바뀌면(수정 시각이 달라지면) 바꾼 체크를 버리고 새 항목 기준의 기본값으로 돌아간다', () => {
    const before = make('b', { formatErrors: ['x: y'] })
    const overrides = withCheck({}, before, false)
    // 수정으로 형식 오류가 사라지고 수정 시각이 바뀐 항목
    const after = make('b', { formatErrors: [], updatedAt: '2026-10-02T00:00:00Z' })
    expect(isItemChecked(after, overrides)).toBe(true)
  })

  it('항목이 그대로면 바꾼 체크가 유지된다', () => {
    const a = make('a')
    const overrides = withCheck({}, a, false)
    expect(isItemChecked(make('a'), overrides)).toBe(false)
  })

  it('전체 선택은 결정할 수 있는 항목 전부를 한꺼번에 바꾼다', () => {
    const items = [make('a'), make('b', { formatErrors: ['x: y'] })]
    const all = withAllChecked({}, items, true)
    expect(splitByChecked(items, all).checked.map((item) => item.id)).toEqual(['a', 'b'])
    const none = withAllChecked(all, items, false)
    expect(splitByChecked(items, none).checked).toEqual([])
  })
})

describe('승인할 것과 제외할 것', () => {
  it('검토중이 아닌 항목은 어느 쪽에도 들지 않는다', () => {
    const items = [make('a'), make('b', { formatErrors: ['x: y'] }), make('c', { status: 'approved' })]
    const split = splitByChecked(items, {})
    expect(split.decidable.map((item) => item.id)).toEqual(['a', 'b'])
    expect(split.checked.map((item) => item.id)).toEqual(['a'])
    expect(split.excluded.map((item) => item.id)).toEqual(['b'])
  })
})

describe('지정한 항목만 체크·해제 (티켓 20261026_2024)', () => {
  it('목록에 든 항목만 바꾸고 나머지 기억은 그대로 둔다', () => {
    const items = [make('a'), make('b'), make('c', { formatErrors: ['x: y'] })]
    const off = withItemsChecked({}, items, ['a', 'b'], false)
    expect(splitByChecked(items, off).checked).toEqual([])
    const on = withItemsChecked(off, items, ['c'], true)
    expect(splitByChecked(items, on).checked.map((item) => item.id)).toEqual(['c'])
    expect(on.a).toEqual(off.a)
  })

  it('목록에 없는 ID는 무시한다', () => {
    expect(withItemsChecked({}, [make('a')], ['zzz'], false)).toEqual({})
  })
})

describe('다음 결정 항목', () => {
  it('목록 순서(공개 시각 날짜별)에서 그 항목 뒤의 첫 검토중 항목을 고른다', () => {
    const items = [
      make('a', { startsAt: '2026-10-05T00:00:00Z' }),
      make('b', { startsAt: '2026-10-06T00:00:00Z', status: 'approved' }),
      make('c', { startsAt: '2026-10-07T00:00:00Z' }),
    ]
    expect(nextDecidableItemId(items, 'a')).toBe('c')
  })

  it('뒤에 없으면 앞쪽의 첫 검토중 항목으로 돌아간다', () => {
    const items = [make('a', { startsAt: '2026-10-05T00:00:00Z' }), make('b', { startsAt: '2026-10-06T00:00:00Z' })]
    expect(nextDecidableItemId(items, 'b')).toBe('a')
  })

  it('남은 검토중 항목이 없으면 null이다(자기 자신은 후보가 아니다)', () => {
    expect(nextDecidableItemId([make('a')], 'a')).toBeNull()
    expect(nextDecidableItemId([make('a', { status: 'approved' })], 'a')).toBeNull()
  })

  it('공개 시각이 없는 항목은 맨 끝에 놓인다', () => {
    const items = [make('u', { startsAt: null }), make('a', { startsAt: '2026-10-05T00:00:00Z' })]
    expect(nextDecidableItemId(items, 'a')).toBe('u')
  })
})
