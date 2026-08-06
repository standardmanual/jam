'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { AdminHeader } from './AdminHeader'
import {
  ALL_NAV_ITEMS,
  DASHBOARD_ITEM,
  NAV_GROUPS,
  activeNavGroupId,
  isNavItemActive,
} from './adminNavItems'

interface AdminNavProps {
  userEmail: string | null
}

/**
 * AdminNav
 *
 * 어드민 영역의 네비게이션 (모바일 + 데스크탑 통합)
 * - 모바일 (< 768px): 헤더 + 드로어 메뉴
 * - 데스크탑 (≥ 768px): 로고 + 타이틀 숨김 (AdminSidebar가 navigation 담당)
 *
 * 드로어 메뉴 구현:
 * - Sheet 컴포넌트 (shadcn/ui)
 * - 메뉴 항목이 많아 성격별로 그룹핑 + 아코디언으로 접고 펼침 (adminNavItems 공유)
 * - 현재 활성 항목이 속한 그룹은 기본으로 펼쳐짐
 * - 드로어 내부 스크롤 (헤더/현재 페이지 제외 nav 영역만 overflow-y-auto)
 * - 메뉴 아이템 클릭 시 자동 닫기
 */
export function AdminNav({ userEmail }: AdminNavProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const current = ALL_NAV_ITEMS.find((item) => isNavItemActive(pathname, item)) ?? DASHBOARD_ITEM
  const defaultOpenGroup = activeNavGroupId(pathname)

  const handleMenuClose = () => {
    setOpen(false)
  }

  return (
    <>
      {/* 헤더는 모바일에만 표시됨 */}
      <AdminHeader
        userEmail={userEmail}
        onMenuToggle={() => setOpen(true)}
        currentPageTitle={current.label}
      />

      {/* 모바일 드로어 메뉴 */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
            <SheetTitle className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">
                  JAM!
                </span>
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Admin
                </span>
              </div>
            </SheetTitle>
          </SheetHeader>

          {/* 네비게이션 메뉴 (스크롤 가능 영역) */}
          <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4">
            {/* 대시보드는 그룹 밖에 고정 */}
            <Link
              href={DASHBOARD_ITEM.href}
              onClick={handleMenuClose}
              className={[
                'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors mb-2',
                isNavItemActive(pathname, DASHBOARD_ITEM)
                  ? 'bg-neutral-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50',
              ].join(' ')}
            >
              <span className="text-lg">{DASHBOARD_ITEM.icon}</span>
              <span className="truncate">{DASHBOARD_ITEM.label}</span>
            </Link>

            <Accordion
              type="multiple"
              defaultValue={defaultOpenGroup ? [defaultOpenGroup] : []}
            >
              {NAV_GROUPS.map((group) => (
                <AccordionItem key={group.id} value={group.id} className="border-b-0">
                  <AccordionTrigger className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:no-underline hover:text-slate-700 dark:hover:text-slate-200">
                    {group.label}
                  </AccordionTrigger>
                  <AccordionContent className="pb-1 space-y-1">
                    {group.items.map((item) => {
                      const active = isNavItemActive(pathname, item)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={handleMenuClose}
                          className={[
                            'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                            active
                              ? 'bg-neutral-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50',
                          ].join(' ')}
                        >
                          <span className="text-lg">{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                        </Link>
                      )
                    })}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}
