'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'
import { useCrossPageSelection, type UseCrossPageSelectionResult } from '@/components/admin/data-table/use-cross-page-selection'
import { filterKeyOf } from '@/lib/admin/list-params'
import { EXCLUSION_TABS, parseExclusionTab, type ExclusionTab } from '@/lib/admin/drop-exclusion-list'

const TAB_LABEL: Record<ExclusionTab, string> = {
  badges: '아이템배지',
  collections: '컬렉션',
}

const SelectionContext = createContext<Record<ExclusionTab, UseCrossPageSelectionResult> | null>(null)

/** 탭 안의 표가 자기 탭의 선택 상태를 받는 훅 — 탭을 옮겨 다녀도 탭별 선택이 유지된다 */
export function useExclusionSelection(tab: ExclusionTab): UseCrossPageSelectionResult {
  const value = useContext(SelectionContext)
  if (!value) throw new Error('useExclusionSelection은 DropExclusionTabs 안에서만 쓸 수 있습니다.')
  return value[tab]
}

function paramsOf(query: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(query).entries())
}

interface DropExclusionTabsProps {
  children: ReactNode
}

/**
 * 드랍 제외 관리 탭(티켓 20260924_0948, 상위 티켓 §4.4) — `?tab=badges|collections`. 탭마다 표가
 * 따로라 선택과 쪽 번호도 탭별이다. 탭을 옮길 때 지금 탭의 URL 조건(필터·쪽 번호)을 기억해 두었다가,
 * 다시 돌아오면 그 조건으로 되돌리고 선택도 그대로 남긴다. 이 컴포넌트는 탭을 바꿔도 다시 그려지지
 * 않고 유지되므로(같은 페이지의 searchParams 변경) 상태가 사라지지 않는다.
 */
export function DropExclusionTabs({ children }: DropExclusionTabsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const tab = parseExclusionTab(searchParams.get('tab'))
  // `tab` 키를 뺀 현재 조건 — 지금 탭의 필터·정렬·쪽 번호
  const currentQuery = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('tab')
    return params.toString()
  }, [searchParams])

  const [savedQuery, setSavedQuery] = useState<Record<ExclusionTab, string>>({ badges: '', collections: '' })
  // 렌더 중 상태 조정(useCrossPageSelection·InlineSwitchCell과 같은 React 공식 패턴)
  if (savedQuery[tab] !== currentQuery) {
    setSavedQuery((prev) => ({ ...prev, [tab]: currentQuery }))
  }

  // 각 탭의 선택은 그 탭의 조건(filterKey)이 바뀔 때만 비운다. 쪽 번호·정렬만 바뀌면 유지된다.
  const badgesSelection = useCrossPageSelection(filterKeyOf(paramsOf(savedQuery.badges)))
  const collectionsSelection = useCrossPageSelection(filterKeyOf(paramsOf(savedQuery.collections)))

  const selections = { badges: badgesSelection, collections: collectionsSelection }

  const goTo = (target: ExclusionTab) => {
    if (target === tab) return
    const params = new URLSearchParams(savedQuery[target])
    params.set('tab', target)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <SelectionContext.Provider value={selections}>
      <div role="tablist" aria-label="드랍 제외 대상" className="flex gap-2">
        {EXCLUSION_TABS.map((t) => (
          <Button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === tab}
            variant={t === tab ? 'default' : 'outline'}
            size="sm"
            onClick={() => goTo(t)}
          >
            {TAB_LABEL[t]}
          </Button>
        ))}
      </div>
      {children}
    </SelectionContext.Provider>
  )
}
