'use client'

import { useCallback, useState } from 'react'
import type { OnChangeFn, RowSelectionState } from '@tanstack/react-table'

export interface UseCrossPageSelectionResult {
  rowSelection: RowSelectionState
  onRowSelectionChange: OnChangeFn<RowSelectionState>
  selectedIds: string[]
  selectIds: (ids: string[]) => void
  clear: () => void
}

/**
 * 페이지를 넘어 유지되는 선택(상위 티켓 §1-1, §6 결정 1). TanStack v9의 `rowSelection`
 * (`Record<string, true>`) 자체를 선택 ID 집합으로 쓴다 — `toggleAllPageRowsSelected`가
 * 다른 페이지의 선택 키를 보존하는 것을 그대로 활용한다(설계 조사 확인 사실).
 * `getSelectedRowModel()`은 현재 페이지 행만 돌려주므로 전체 선택 ID는 항상
 * `rowSelection`의 키에서 읽는다.
 *
 * `filterKey`(= {@link import('@/lib/admin/list-params').filterKeyOf})가 바뀌면 이전
 * 선택은 다른 필터 결과를 가리키므로 비운다.
 */
export function useCrossPageSelection(filterKey: string): UseCrossPageSelectionResult {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)

  // 렌더 중 상태 조정(useEffect보다 리렌더가 한 번 적은 React 공식 패턴) —
  // BadgesTable.tsx의 prevBadges 패턴과 동일하게 적용한다. ref는 렌더 중 읽고 쓸 수 없어
  // (react-hooks/refs) 이전 값 추적도 state로 한다.
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey)
    if (Object.keys(rowSelection).length > 0) setRowSelection({})
  }

  const selectIds = useCallback((ids: string[]) => {
    setRowSelection((prev) => {
      const next = { ...prev }
      for (const id of ids) next[id] = true
      return next
    })
  }, [])

  const clear = useCallback(() => setRowSelection({}), [])

  return {
    rowSelection,
    onRowSelectionChange: setRowSelection,
    selectedIds: Object.keys(rowSelection),
    selectIds,
    clear,
  }
}
