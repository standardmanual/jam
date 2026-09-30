'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/admin/ui/tabs'
import { useListParams } from '@/components/admin/data-table/use-list-params'
import { OPS_INBOX_TABS, type OpsInboxTab } from '@/lib/admin/opsInbox/bundleStatus'
import { OPS_INBOX_TAB_LABELS } from '@/lib/admin/opsInbox/labels'

interface OpsInboxTabsProps {
  /** 지금 탭. */
  tab: OpsInboxTab
  /** 탭별 묶음 수. 탭 제목에 숫자로 보인다. */
  counts: Record<OpsInboxTab, number>
  /** 탭 아래에 그릴 내용(표·빈 상태). 서버 화면이 넘긴다. */
  children: ReactNode
}

/**
 * 받은 기획함 상태 탭 4개(티켓 20260930_1817, S2). 탭을 바꾸면 URL `tab`이 바뀌고 쪽 번호는 1쪽으로 돌아간다
 * (`useListParams`의 공용 규칙). 기본(`all`)은 URL에서 키를 지운다. 정렬은 그대로 둔다.
 */
export function OpsInboxTabs({ tab, counts, children }: OpsInboxTabsProps) {
  const { setFilters } = useListParams({ defaults: { tab: 'all' } })

  return (
    <Tabs value={tab} onValueChange={(value) => setFilters({ tab: value })}>
      <TabsList>
        {OPS_INBOX_TABS.map((key) => (
          <TabsTrigger key={key} value={key}>
            {OPS_INBOX_TAB_LABELS[key]}
            <span className="ml-1.5 tabular-nums">{counts[key]}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={tab} className="mt-4">
        {children}
      </TabsContent>
    </Tabs>
  )
}
