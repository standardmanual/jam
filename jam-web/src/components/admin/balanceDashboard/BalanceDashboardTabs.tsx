/**
 * 밸런스 지표 화면의 탭 (티켓 20261022_1136 2회) — 지표 / 컬렉션별 획득 경로
 *
 * 탭은 주소(`?tab=paths`)가 정한다. 기본은 지표(주소에 `tab`이 없음)이고, 탭을 누르면 화면이 서버에서 그 탭의 데이터만 읽어 다시 그린다.
 * 쪽 번호(`?page=`)는 탭을 옮기면 버린다. 상태가 없어서 서버에서 그린 마크업으로 시험한다.
 */
import Link from 'next/link'
import { Tabs, TabsList, TabsTrigger } from '@/components/admin/ui/tabs'
import type { DashboardTab } from '@/lib/admin/itemPaths/pathView'

export const DASHBOARD_PATH = '/admin/balance/dashboard'

export const DASHBOARD_TAB_LABELS: Record<DashboardTab, string> = {
  metrics: '지표',
  paths: '컬렉션별 획득 경로',
}

/** 탭의 이동 주소 — 지표는 `tab` 없이, 획득 경로는 `?tab=paths` */
export function dashboardTabHref(tab: DashboardTab): string {
  return tab === 'paths' ? `${DASHBOARD_PATH}?tab=paths` : DASHBOARD_PATH
}

const TAB_ORDER: readonly DashboardTab[] = ['metrics', 'paths']

export function BalanceDashboardTabs({ tab }: { tab: DashboardTab }) {
  return (
    <Tabs value={tab}>
      <TabsList aria-label="밸런스 지표 보기">
        {TAB_ORDER.map((value) => (
          <TabsTrigger key={value} value={value} asChild>
            <Link href={dashboardTabHref(value)}>{DASHBOARD_TAB_LABELS[value]}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
