'use client'

import { useState } from 'react'
import { selectAllBannerState } from '@/lib/admin/bulk/shared'

interface DataTableSelectAllBannerProps {
  /** 현재 페이지에 보이는 행 ID 목록 — 전부 선택됐는지 판정용 */
  pageIds: string[]
  /** 지금까지 선택된 ID(페이지를 넘어 유지되는 선택, `useCrossPageSelection().selectedIds`) */
  selection: string[]
  /** 현재 필터 조건에 맞는 전체 건수 */
  totalCount: number
  /** 한 번에 선택할 수 있는 상한(상위 티켓 §6 결정 1 — 기본 1000) */
  cap: number
  /** 같은 필터 조건의 ID를 상한만큼 가져오는 서버 호출 */
  fetchAllIds: () => Promise<string[]>
  /** 가져온 ID를 선택 상태에 반영 — `useCrossPageSelection().selectIds`를 그대로 전달 */
  selectIds: (ids: string[]) => void
  /** 선택 해제 — `useCrossPageSelection().clear`를 그대로 전달 */
  clear: () => void
}

/**
 * "이 조건의 N건 모두 선택" 배너(티켓 20260924_0940, 상위 티켓 §1-1·§6 결정 1). 현재
 * 페이지 전체가 선택된 다음에만 나타나고, 필터 결과 전체를 상한 이내로 가져와 선택에
 * 더한다. 상태 판정은 `selectAllBannerState`(순수 함수)가 갖는다.
 */
export function DataTableSelectAllBanner({
  pageIds,
  selection,
  totalCount,
  cap,
  fetchAllIds,
  selectIds,
  clear,
}: DataTableSelectAllBannerProps) {
  const [loading, setLoading] = useState(false)
  const state = selectAllBannerState(pageIds, selection, totalCount, cap)

  if (state.type === 'hidden') return null

  const handleSelectAll = async () => {
    setLoading(true)
    try {
      selectIds(await fetchAllIds())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
      {state.type === 'prompt' ? (
        <button
          type="button"
          className="font-medium underline underline-offset-2 disabled:opacity-50"
          disabled={loading}
          onClick={handleSelectAll}
        >
          {loading ? '선택하는 중...' : `이 조건의 ${state.selectableCount}건 모두 선택`}
        </button>
      ) : (
        <>
          <span className="font-medium">
            {state.type === 'capped' ? `상위 ${state.count}건 선택됨` : `${state.count}건 모두 선택됨`}
          </span>
          <span aria-hidden>·</span>
          <button type="button" className="underline underline-offset-2" onClick={clear}>
            선택 해제
          </button>
        </>
      )}
    </div>
  )
}
