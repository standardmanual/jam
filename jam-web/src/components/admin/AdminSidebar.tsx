'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  DASHBOARD_ITEM,
  NAV_GROUPS,
  activeNavGroupId,
  isNavItemActive,
} from './adminNavItems'
import { useAdminSidebar } from './AdminSidebarContext'

interface AdminSidebarProps {
  userEmail: string | null
}

/**
 * AdminSidebar
 *
 * 어드민 영역의 왼쪽 사이드바
 * - 데스크탑 (≥ 768px): 좌측 고정, 스크롤 독립, 접기/펼치기 가능 (AdminSidebarContext, localStorage 기억)
 * - 모바일 (< 768px): 숨김 (AdminNav 드로어가 navigation을 담당)
 *
 * 특징:
 * - 메뉴가 많아 성격별로 그룹핑 + 아코디언으로 접고 펼침 (AdminNav 드로어와 동일 구조, adminNavItems 공유)
 * - 현재 페이지가 속한 그룹은 기본으로 펼쳐짐
 * - 접힘 상태에서는 그룹 라벨을 생략하고 아이콘만 나열(툴팁으로 라벨 제공)
 * - 다크 모드 지원
 * - 터치 타겟 ≥ 44px
 */
export function AdminSidebar({ userEmail: _userEmail }: AdminSidebarProps) {
  const pathname = usePathname()
  const defaultOpenGroup = activeNavGroupId(pathname)
  const { collapsed, toggle } = useAdminSidebar()

  return (
    <aside
      className={[
        'hidden md:flex flex-col fixed left-0 top-0 h-screen bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 z-30 transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64',
      ].join(' ')}
    >
      {/* 헤더 영역 */}
      <div className="flex items-center justify-between gap-2 px-4 py-6 border-b border-slate-200 dark:border-slate-800 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">
              JAM!
            </span>
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 truncate">
              Admin
            </span>
          </div>
        )}
        <button
          onClick={toggle}
          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          aria-label={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
          title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* 네비게이션 영역 (스크롤 가능) */}
      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-4">
        {/* 대시보드는 그룹 밖에 고정 */}
        <Link
          href={DASHBOARD_ITEM.href}
          title={collapsed ? DASHBOARD_ITEM.label : undefined}
          className={[
            'flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-2',
            collapsed ? 'justify-center px-0' : 'px-4',
            isNavItemActive(pathname, DASHBOARD_ITEM)
              ? 'bg-neutral-100 dark:bg-slate-800 text-slate-900 dark:text-white'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50',
          ].join(' ')}
        >
          <span className="text-lg">{DASHBOARD_ITEM.icon}</span>
          {!collapsed && <span className="truncate">{DASHBOARD_ITEM.label}</span>}
        </Link>

        {collapsed ? (
          // 접힘 상태: 그룹 라벨 없이 아이콘만 나열 (라벨은 title 툴팁으로 대체)
          <div className="space-y-1">
            {NAV_GROUPS.flatMap((group) => group.items).map((item) => {
              const active = isNavItemActive(pathname, item)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={[
                    'flex items-center justify-center py-2.5 rounded-lg text-sm font-medium transition-colors',
                    active
                      ? 'bg-neutral-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50',
                  ].join(' ')}
                >
                  <span className="text-lg">{item.icon}</span>
                </Link>
              )
            })}
          </div>
        ) : (
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
        )}
      </nav>
    </aside>
  )
}
