/**
 * 행 전체 클릭 = 상세 이동 판정 회귀 테스트(티켓 20260924_0940, 상위 티켓 §1-4 무시 규칙).
 * `data-table.tsx`가 실제 DOM에서 뽑아낸 정보를 넘긴다고 가정하고, 판정 자체만 검증한다.
 */
import { describe, it, expect } from 'vitest'
import { shouldNavigateOnRowClick, type RowClickInfo } from '@/components/admin/data-table/row-click'

const BASE: RowClickInfo = {
  defaultPrevented: false,
  button: 0,
  targetInsideRow: true,
  targetIsInteractive: false,
  hasTextSelection: false,
}

describe('shouldNavigateOnRowClick', () => {
  it('무시할 이유가 없으면 이동한다', () => {
    expect(shouldNavigateOnRowClick(BASE)).toBe(true)
  })

  it('이미 preventDefault된 이벤트는 무시한다', () => {
    expect(shouldNavigateOnRowClick({ ...BASE, defaultPrevented: true })).toBe(false)
  })

  it('주 버튼(왼쪽 클릭)이 아니면 무시한다', () => {
    expect(shouldNavigateOnRowClick({ ...BASE, button: 1 })).toBe(false)
    expect(shouldNavigateOnRowClick({ ...BASE, button: 2 })).toBe(false)
  })

  it('상호작용 요소(체크박스·스위치·버튼 등) 위 클릭은 무시한다', () => {
    expect(shouldNavigateOnRowClick({ ...BASE, targetIsInteractive: true })).toBe(false)
  })

  it('텍스트 선택 중이면 무시한다', () => {
    expect(shouldNavigateOnRowClick({ ...BASE, hasTextSelection: true })).toBe(false)
  })

  it('행 DOM 밖에서 온 이벤트는 무시한다(포털 대화상자의 클릭이 버블링된 경우)', () => {
    expect(shouldNavigateOnRowClick({ ...BASE, targetInsideRow: false })).toBe(false)
  })
})
