'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'

interface TabItem {
  href: string
  label: string
  icon: React.ReactNode
  disabled?: boolean
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  )
}

function BadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
      />
    </svg>
  )
}

function InventoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
      />
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  )
}

export default function TabBar() {
  const pathname = usePathname()
  const { toast } = useToast()

  const tabs: TabItem[] = [
    { href: '/', label: '홈', icon: <HomeIcon /> },
    { href: '/badges', label: '배지', icon: <BadgeIcon /> },
    { href: '/inventory', label: '인벤토리', icon: <InventoryIcon />, disabled: true },
    { href: '/profile', label: '프로필', icon: <ProfileIcon /> },
  ]

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] h-16 bg-[#111111] border-t border-white/10 flex items-center pb-[env(safe-area-inset-bottom)] z-40">
      {tabs.map((tab) => {
        const active = isActive(tab.href)

        if (tab.disabled) {
          return (
            <button
              key={tab.href}
              onClick={() => toast('인벤토리는 Phase 3에서 오픈됩니다!', 'info')}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-white/30 cursor-pointer"
            >
              {tab.icon}
              <span className="text-[10px]">{tab.label}</span>
            </button>
          )
        }

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              'flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors',
              active ? 'text-[#AEEA00]' : 'text-white/40 hover:text-white/70',
            ].join(' ')}
          >
            {tab.icon}
            <span className="text-[10px]">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
