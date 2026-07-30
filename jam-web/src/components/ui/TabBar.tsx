'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { d } from '@/lib/i18n'

/**
 * SuperHi Plus 바텀 탭바 (iOS 26 스타일 플로팅 캡슐, iOS HIG Tab Bar 패턴)
 *
 * 라우팅/활성탭 판별 로직은 기존 `src/app/(main)/TabBar.tsx`와 100% 동일합니다.
 * (다른 유저 프로필 보기 `?u=` 케이스, `/inventory/[itemId]?from=badges` 케이스 포함)
 * 시각 스타일은 최신 iOS 인스타그램/앱스토어의 플로팅 캡슐 탭바를 참고해
 * 아이콘 전용(라벨 없음) + 1px inset border(드롭섀도 없음)로 구성했습니다.
 * 로직을 수정할 일이 생기면 두 파일을 반드시 함께 맞추세요.
 */
interface TabBarProps {
  username: string | null
}

const baseTabs = [
  {
    href: '/',
    label: d.nav.today,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/badges',
    label: d.nav.badges,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/drops',
    label: d.nav.drops,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/missions',
    label: d.nav.missions,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/inventory',
    label: d.nav.inventory,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/profile',  // placeholder, 런타임에 username으로 교체
    label: d.nav.profile,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export default function TabBar({ username }: TabBarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const profileHref = username ? `/${username}` : '/profile'

  // 배지/아이템북 상세를 다른 유저의 프로필 맥락(?u=)에서 보고 있으면 "내" 탭으로 취급하지 않음
  const viewingOtherUser = (() => {
    const u = searchParams.get('u')
    if (!u) return false
    return !username || u.toLowerCase() !== username.toLowerCase()
  })()

  // 아이템배지 상세(/inventory/[itemId])는 배지 메뉴·인벤토리 메뉴 양쪽에서 진입 가능한
  // 공용 라우트라 URL만으로는 출처를 구분할 수 없음 — 배지 메뉴에서 들어오면 링크에
  // ?from=badges를 붙여 "배지" 탭을 계속 활성 상태로 유지
  const fromBadges = pathname.startsWith('/inventory') && searchParams.get('from') === 'badges'

  const tabs = baseTabs.map((tab) =>
    tab.href === '/profile' ? { ...tab, href: profileHref } : tab
  )

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    if (href === profileHref) return pathname === profileHref || pathname === '/profile'
    if (viewingOtherUser && pathname.startsWith('/badges')) return false
    if (fromBadges) return href === '/badges'
    return pathname.startsWith(href)
  }

  return (
    <nav
      className="fixed left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-[398px] h-16 rounded-[var(--radius-pill-buttons)] bg-surface-inverse shadow-[inset_0_0_0_1px_var(--color-border-inverse)] flex items-center justify-between px-1 z-40"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
    >
      {tabs.map((tab) => {
        const active = isActive(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
            className="relative flex-1 flex items-center justify-center h-full min-w-11 transition-transform duration-100 active:scale-90"
          >
            <span
              className={[
                active ? 'text-text-inverse [&_path]:stroke-2' : 'text-text-inverse/35 [&_path]:stroke-[1.5]',
              ].join(' ')}
            >
              {tab.icon}
            </span>
            {/*
              활성탭 점 — transitions.dev `03-notification-badge.md`.
              조건부 렌더링을 없애고 항상 마운트한 뒤 data-open만 토글해야
              팝인/팝아웃 트랜지션이 발화한다. 앵커는 원본(우상단) 대신
              `.jam-tabbar-dot`으로 트리거 하단 중앙으로 옮겼다.
            */}
            <span className="t-badge jam-tabbar-dot" data-open={active} aria-hidden="true">
              <span className="t-badge-dot w-1 h-1 rounded-full bg-text-inverse" />
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
