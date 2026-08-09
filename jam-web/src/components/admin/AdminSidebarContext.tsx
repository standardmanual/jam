'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'jam-admin-sidebar-collapsed'

interface AdminSidebarContextValue {
  collapsed: boolean
  toggle: () => void
}

const AdminSidebarContext = createContext<AdminSidebarContextValue | null>(null)

/**
 * AdminSidebarProvider
 *
 * 데스크탑 사이드바의 접힘/펼침 상태를 AdminSidebar(네비게이션)와
 * AdminMain(콘텐츠 여백)이 함께 참조할 수 있도록 공유한다.
 * localStorage에 저장해 새로고침·재방문 시에도 상태를 기억한다.
 */
export function AdminSidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === '1') setCollapsed(true)
  }, [])

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <AdminSidebarContext.Provider value={{ collapsed, toggle }}>
      {children}
    </AdminSidebarContext.Provider>
  )
}

export function useAdminSidebar() {
  const ctx = useContext(AdminSidebarContext)
  if (!ctx) throw new Error('useAdminSidebar는 AdminSidebarProvider 내부에서만 사용할 수 있습니다.')
  return ctx
}
