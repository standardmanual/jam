'use client'

import { usePathname } from 'next/navigation'
import { Separator } from '@/components/admin/ui/separator'
import { SidebarTrigger } from '@/components/admin/ui/sidebar'
import { DASHBOARD_ITEM, mostSpecificActiveItem } from './adminNavItems'

interface AdminHeaderProps {
  userEmail: string | null
}

/**
 * AdminHeader
 *
 * `SidebarInset`(admin/layout.tsx) 상단에 고정되는 헤더. shadcn 공식 `SidebarTrigger`로
 * 데스크탑 접기/펼치기·모바일 드로어 열기를 동일한 버튼 하나로 처리한다(공식 패턴 —
 * 데스크탑/모바일 분리 헤더를 따로 두지 않음).
 *
 * 현재 페이지 제목(adminNavItems 기준)과 로그인 이메일을 표시 — 기존에는 모바일에서만
 * 보이던 정보였으나, 이제 데스크탑에서도 함께 노출된다(정보 손실 없음, 기능 유지 범위 내
 * 자연스러운 확장).
 */
export function AdminHeader({ userEmail }: AdminHeaderProps) {
  const pathname = usePathname()
  // 겹치는 href(예: /admin/item-badges vs /admin/item-badges/orphaned)에서 더 구체적인
  // 경로를 우선한다 — adminNavItems.ts의 mostSpecificActiveItem 참고.
  const current = mostSpecificActiveItem(pathname) ?? DASHBOARD_ITEM

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-4 bg-slate-200 dark:bg-slate-800" />
      <h1 className="flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
        {current.label}
      </h1>
      {userEmail && (
        <span className="truncate text-xs text-slate-500 dark:text-slate-400">{userEmail}</span>
      )}
    </header>
  )
}
