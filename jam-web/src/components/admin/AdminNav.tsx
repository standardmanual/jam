'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AdminHeader } from './AdminHeader'

const NAV_ITEMS = [
  { href: '/admin', label: '대시보드', icon: '📊', exact: true },
  { href: '/admin/badges', label: '배지 관리', icon: '🏅' },
  { href: '/admin/poi', label: 'POI 관리', icon: '📍' },
  { href: '/admin/itembooks', label: '아이템북', icon: '📖' },
  { href: '/admin/factions', label: '세계관', icon: '🌍' },
  { href: '/admin/drop-policy', label: '드랍 정책', icon: '🎲' },
  { href: '/admin/ambient-drop-policy', label: '앰비언트 드랍', icon: '🗺️' },
  { href: '/admin/simulator', label: '시뮬레이터', icon: '🎮' },
  { href: '/admin/users', label: '유저 조회', icon: '👥' },
  { href: '/admin/abusing', label: '어뷰징 관리', icon: '🚨' },
  { href: '/admin/recipes', label: '조합 레시피', icon: '⚗️' },
  { href: '/admin/combine-policy', label: '조합 정책', icon: '🧪' },
  { href: '/admin/missions', label: '미션 관리', icon: '🎯' },
  { href: '/admin/today', label: '투데이 콘텐츠', icon: '📰' },
  { href: '/admin/points', label: '포인트 관리', icon: '💎' },
  { href: '/admin/theme', label: '테마 컬러', icon: '🎨' },
]

function isActive(pathname: string, item: (typeof NAV_ITEMS)[number]) {
  if (item.exact) return pathname === item.href
  return pathname.startsWith(item.href)
}

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
 * - 메뉴 아이템 클릭 시 자동 닫기
 * - 경로 변경 시 자동 닫기
 */
export function AdminNav({ userEmail }: AdminNavProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const current = NAV_ITEMS.find((item) => isActive(pathname, item)) ?? NAV_ITEMS[0]

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
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
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

          {/* 네비게이션 메뉴 */}
          <nav className="px-3 py-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleMenuClose}
                  className={[
                    'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    active
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50',
                  ].join(' ')}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* 푸터 */}
          <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-950">
            {userEmail && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mb-3">
                {userEmail}
              </p>
            )}
            <Link
              href="/"
              onClick={handleMenuClose}
              className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              ← 앱으로 돌아가기
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
