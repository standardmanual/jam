'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/shadcn-button'

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

interface AdminSidebarProps {
  userEmail: string | null
}

/**
 * AdminSidebar
 *
 * 어드민 영역의 왼쪽 사이드바
 * - 데스크탑 (≥ 768px): 좌측 고정, 스크롤 독립
 * - 모바일 (< 768px): 숨김 (AdminNav 드로어가 navigation을 담당)
 *
 * 특징:
 * - 현재 페이지 하이라이트 (활성 상태)
 * - 로그아웃 버튼
 * - 다크 모드 지원
 * - 터치 타겟 ≥ 44px
 */
export function AdminSidebar({ userEmail }: AdminSidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-screen w-64 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 z-30">
      {/* 헤더 영역 */}
      <div className="flex items-center gap-2 px-6 py-6 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">
          JAM!
        </span>
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Admin
        </span>
      </div>

      {/* 네비게이션 영역 (스크롤 가능) */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item)
          return (
            <Link
              key={item.href}
              href={item.href}
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

      {/* 푸터 영역 */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-4 shrink-0 space-y-3">
        {userEmail && (
          <div className="px-2">
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {userEmail}
            </p>
          </div>
        )}
        <Link href="/" className="block">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
          >
            <LogOut size={16} />
            <span>앱으로 돌아가기</span>
          </Button>
        </Link>
      </div>
    </aside>
  )
}
