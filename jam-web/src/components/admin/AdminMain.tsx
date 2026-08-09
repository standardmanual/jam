'use client'

import { useAdminSidebar } from './AdminSidebarContext'

/**
 * AdminMain
 *
 * 메인 콘텐츠 영역. 데스크탑 사이드바 접힘 상태에 맞춰 좌측 여백을 조정한다.
 * - md 이상 + 펼침: ml-64 (사이드바 폭 16rem)
 * - md 이상 + 접힘: ml-16 (사이드바 폭 4rem)
 * - md 미만: 여백 없음 (모바일은 드로어 네비게이션)
 */
export function AdminMain({ children }: { children: React.ReactNode }) {
  const { collapsed } = useAdminSidebar()

  return (
    <main
      className={[
        'flex-1 min-w-0 overflow-y-auto transition-[margin-left] duration-200',
        collapsed ? 'md:ml-16' : 'md:ml-64',
      ].join(' ')}
    >
      {children}
    </main>
  )
}
