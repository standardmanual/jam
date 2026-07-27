'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

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
]

function isActive(pathname: string, item: (typeof NAV_ITEMS)[number]) {
  if (item.exact) return pathname === item.href
  return pathname.startsWith(item.href)
}

export function AdminNav({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const current = NAV_ITEMS.find((item) => isActive(pathname, item)) ?? NAV_ITEMS[0]

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[#e5e7eb]">
      <div className="flex items-center justify-between px-5 h-14">
        <Link href="/admin" className="flex items-center gap-2 shrink-0">
          <span className="text-[#111111] font-black text-xl tracking-tighter">JAM!</span>
          <span className="text-[#6b7280] text-xs font-semibold uppercase tracking-widest">Admin</span>
        </Link>

        <div ref={rootRef} className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#f8f9fa] text-sm font-medium text-[#111111] hover:bg-[#f3f4f6] transition-colors"
          >
            <span>{current.icon}</span>
            {current.label}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className={`w-4 h-4 text-[#6b7280] transition-transform ${open ? 'rotate-180' : ''}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-[#e5e7eb] rounded-2xl shadow-xl overflow-hidden py-2">
              {NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors',
                      active ? 'text-[#111111] bg-[#f5f5f5]' : 'text-[#374151] hover:text-[#111111] hover:bg-[#f8f9fa]',
                    ].join(' ')}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                )
              })}
              <div className="border-t border-[#e5e7eb] mt-2 pt-2 px-4">
                <p className="text-xs text-[#898989] truncate mb-1">{userEmail}</p>
                <Link
                  href="/"
                  className="text-xs text-[#111111]/60 hover:text-[#111111] transition-colors"
                >
                  ← 앱으로 돌아가기
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
