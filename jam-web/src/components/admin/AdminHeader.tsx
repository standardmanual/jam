'use client'

import Link from 'next/link'
import { Menu } from 'lucide-react'
import Button from '@/components/ui/Button'

interface AdminHeaderProps {
  userEmail: string | null
  onMenuToggle: () => void
  currentPageTitle: string
}

/**
 * AdminHeader
 *
 * 어드민 영역의 헤더 컴포넌트
 * - 모바일 (< 768px): 로고 + 햄버거 아이콘 + 타이틀
 * - 데스크탑 (≥ 768px): 숨김 (사이드바가 navigation을 담당)
 *
 * 터치 타겟 ≥ 44px (Button h-11)
 */
export function AdminHeader({
  userEmail,
  onMenuToggle,
  currentPageTitle,
}: AdminHeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 h-14 flex items-center px-4 md:px-0 md:hidden">
      <button
        onClick={onMenuToggle}
        className="inline-flex items-center justify-center h-10 w-10 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="메뉴 열기"
      >
        <Menu size={24} />
      </button>

      <div className="flex-1 px-3">
        <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
          {currentPageTitle}
        </h1>
      </div>

      {userEmail && (
        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {userEmail}
        </div>
      )}
    </header>
  )
}
