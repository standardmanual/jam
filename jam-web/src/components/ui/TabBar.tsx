'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { d } from '@/lib/i18n'
import { useTabBarHidden } from '@/lib/uiOverlay'
import { cssDurationMs } from '@/lib/motion'
import { isPathActive } from '@/lib/isPathActive'

/**
 * 활성탭 점(`t-badge[data-open]`)은 CSS `@keyframes t-badge-slide-in`으로 팝인한다.
 * 탭 연타처럼 짧은 간격으로 data-open이 여러 번 뒤집히면 매번 keyframe이 시작점부터
 * 재생돼 이전 진행이 끊긴다(원본 keyframe은 수정 불가 — transitions.css 상단 규칙).
 * 이미 재생 중인 애니메이션 구간에는 다음 값 적용을 미뤄, 재생이 끝난 뒤 마지막
 * 값만 반영되도록 한다.
 */
function useDebouncedBadgeOpen(active: boolean): boolean {
  const [applied, setApplied] = useState(active)
  const appliedRef = useRef(active)
  const animatingUntilRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (appliedRef.current === active) return

    function apply() {
      appliedRef.current = active
      setApplied(active)
      animatingUntilRef.current = Date.now() + cssDurationMs('--badge-slide-dur', 260)
    }

    if (timerRef.current) clearTimeout(timerRef.current)

    const remaining = animatingUntilRef.current - Date.now()
    if (remaining > 0) {
      timerRef.current = setTimeout(apply, remaining)
    } else {
      apply()
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [active])

  return applied
}

/** 탭 활성 점 — data-open을 바로 반영하지 않고 위 debounce를 거친다. */
function TabActiveDot({ active }: { active: boolean }) {
  const dotOpen = useDebouncedBadgeOpen(active)
  return (
    <span className="t-badge jam-tabbar-dot" data-open={dotOpen} aria-hidden="true">
      <span className="t-badge-dot w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
    </span>
  )
}

/**
 * SuperHi Plus 바텀 탭바 (iOS 26 스타일 플로팅 캡슐, iOS HIG Tab Bar 패턴)
 *
 * 시각 스타일은 최신 iOS 인스타그램/앱스토어의 플로팅 캡슐 탭바를 참고해
 * 아이콘 전용(라벨 없음)으로 구성했습니다. 흰 필 자체가 다크 페이지 위에서 대비가
 * 충분해 보더/드롭섀도 없이 렌더링합니다(20260816_012).
 */
interface TabBarProps {
  username: string | null
}

const baseTabs = [
  {
    href: '/',
    label: d.nav.today,
    // 20260901: 다른 4개 탭은 이미 Material Symbols(0 -960 960 960 좌표계)로 교체됐는데
    // today만 예전 24x24 커스텀 path로 남아 있어 선 두께가 유독 얇게 보였다(비활성 상태에서
    // 특히 도드라짐). 동일한 Material Symbols "home" 아이콘으로 교체해 두께를 맞춘다.
    iconFill: (
      <svg viewBox="0 -960 960 960" fill="currentColor" className="w-6 h-6">
        <path d="M160-120v-480l320-240 320 240v480H560v-280H400v280H160Z" />
      </svg>
    ),
    iconLine: (
      <svg viewBox="0 -960 960 960" fill="currentColor" className="w-6 h-6">
        <path d="M240-200h120v-240h240v240h120v-360L480-740 240-560v360Zm-80 80v-480l320-240 320 240v480H520v-240h-80v240H160Zm320-350Z" />
      </svg>
    ),
  },
  {
    href: '/badges',
    label: d.nav.badges,
    iconFill: (
      <svg viewBox="0 -960 960 960" fill="currentColor" className="w-6 h-6">
        <path d="M395-475q-35-35-35-85t35-85q35-35 85-35t85 35q35 35 35 85t-35 85q-35 35-85 35t-85-35ZM240-40v-309q-38-42-59-96t-21-115q0-134 93-227t227-93q134 0 227 93t93 227q0 61-21 115t-59 96v309l-240-80-240 80Zm410-350q70-70 70-170t-70-170q-70-70-170-70t-170 70q-70 70-70 170t70 170q70 70 170 70t170-70Z" />
      </svg>
    ),
    iconLine: (
      <svg viewBox="0 -960 960 960" fill="currentColor" className="w-6 h-6">
        <path d="M395-475q-35-35-35-85t35-85q35-35 85-35t85 35q35 35 35 85t-35 85q-35 35-85 35t-85-35ZM240-40v-309q-38-42-59-96t-21-115q0-134 93-227t227-93q134 0 227 93t93 227q0 61-21 115t-59 96v309l-240-80-240 80Zm410-350q70-70 70-170t-70-170q-70-70-170-70t-170 70q-70 70-70 170t70 170q70 70 170 70t170-70ZM320-159l160-41 160 41v-124q-35 20-75.5 31.5T480-240q-44 0-84.5-11.5T320-283v124Zm160-62Z" />
      </svg>
    ),
  },
  {
    href: '/drops',
    label: d.nav.drops,
    iconFill: (
      <svg viewBox="0 -960 960 960" fill="currentColor" className="w-6 h-6">
        {/* 20260827_026: 다른 탭 아이콘 대비 여백이 커 시각적으로 작아 보여 1.1배 확대 보정
            (badges 아이콘의 바운딩 박스와 정렬 — 원본 좌표계·형태는 그대로, 중심 기준 확대만) */}
        <g transform="translate(-48,48) scale(1.1)">
          <path d="M307-113.5Q240-147 240-200q0-24 14.5-44.5T295-280l63 59q-9 4-19.5 9T322-200q13 16 60 28t98 12q51 0 98.5-12t60.5-28q-7-8-18-13t-21-9l62-60q28 16 43 36.5t15 45.5q0 53-67 86.5T480-80q-106 0-173-33.5ZM480-200Q339-304 269.5-402T200-594q0-71 25.5-124.5T291-808q40-36 90-54t99-18q49 0 99 18t90 54q40 36 65.5 89.5T760-594q0 94-69.5 192T480-200ZM480-520q33 0 56.5-23.5T560-600q0-33-23.5-56.5T480-680q-33 0-56.5 23.5T400-600q0 33 23.5 56.5T480-520Z" />
        </g>
      </svg>
    ),
    iconLine: (
      <svg viewBox="0 -960 960 960" fill="currentColor" className="w-6 h-6">
        <g transform="translate(-48,48) scale(1.1)">
          <path d="M307-113.5Q240-147 240-200q0-24 14.5-44.5T295-280l63 59q-9 4-19.5 9T322-200q13 16 60 28t98 12q51 0 98.5-12t60.5-28q-7-8-18-13t-21-9l62-60q28 16 43 36.5t15 45.5q0 53-67 86.5T480-80q-106 0-173-33.5ZM481-300q99-73 149-146.5T680-594q0-102-65-154t-135-52q-70 0-135 52t-65 154q0 67 49 139.5T481-300Zm-1 100Q339-304 269.5-402T200-594q0-71 25.5-124.5T291-808q40-36 90-54t99-18q49 0 99 18t90 54q40 36 65.5 89.5T760-594q0 94-69.5 192T480-200Zm0-320q33 0 56.5-23.5T560-600q0-33-23.5-56.5T480-680q-33 0-56.5 23.5T400-600q0 33 23.5 56.5T480-520Zm0-80Z" />
        </g>
      </svg>
    ),
  },
  {
    href: '/missions',
    label: d.nav.missions,
    iconFill: (
      <svg viewBox="0 -960 960 960" fill="currentColor" className="w-6 h-6">
        <path d="m368-320 112-84 110 84-42-136 112-88H524l-44-136-44 136H300l110 88-42 136ZM160-160q-33 0-56.5-23.5T80-240v-135q0-11 7-19t18-10q24-8 39.5-29t15.5-47q0-26-15.5-47T105-556q-11-2-18-10t-7-19v-135q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v135q0 11-7 19t-18 10q-24 8-39.5 29T800-480q0 26 15.5 47t39.5 29q11 2 18 10t7 19v135q0 33-23.5 56.5T800-160H160Z" />
      </svg>
    ),
    iconLine: (
      <svg viewBox="0 -960 960 960" fill="currentColor" className="w-6 h-6">
        <path d="m368-320 112-84 110 84-42-136 112-88H524l-44-136-44 136H300l110 88-42 136ZM160-160q-33 0-56.5-23.5T80-240v-135q0-11 7-19t18-10q24-8 39.5-29t15.5-47q0-26-15.5-47T105-556q-11-2-18-10t-7-19v-135q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v135q0 11-7 19t-18 10q-24 8-39.5 29T800-480q0 26 15.5 47t39.5 29q11 2 18 10t7 19v135q0 33-23.5 56.5T800-160H160Zm0-80h640v-102q-37-22-58.5-58.5T720-480q0-43 21.5-79.5T800-618v-102H160v102q37 22 58.5 58.5T240-480q0 43-21.5 79.5T160-342v102Zm320-240Z" />
      </svg>
    ),
  },
  {
    href: '/inventory',
    label: d.nav.inventory,
    iconFill: (
      <svg viewBox="0 -960 960 960" fill="currentColor" className="w-6 h-6">
        <path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm-40-600h640v-120H160v120Zm200 280h240v-80H360v80Z" />
      </svg>
    ),
    iconLine: (
      <svg viewBox="0 -960 960 960" fill="currentColor" className="w-6 h-6">
        <path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z" />
      </svg>
    ),
  },
]

export default function TabBar({ username }: TabBarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hidden = useTabBarHidden()

  // 배지/아이템북 상세를 다른 유저의 프로필 맥락(?u=)에서 보고 있으면 "내" 탭으로 취급하지 않음
  const viewingOtherUser = (() => {
    const u = searchParams.get('u')
    if (!u) return false
    return !username || u.toLowerCase() !== username.toLowerCase()
  })()

  // 배지 메뉴에서 파생된 페이지는 "배지" 탭 활성 유지:
  //   - /inventory/[itemId]?from=badges (아이템배지 상세)
  //   - /collections/[id]?from=badges (컬렉션 상세)
  const fromBadges =
    (pathname.startsWith('/inventory') || pathname.startsWith('/collections')) &&
    searchParams.get('from') === 'badges'

  // 20260824_010: 프로필 탭 제거 — 프로필 진입은 TopNav 우측 아바타로 일원화됐다.
  // baseTabs는 이제 href 치환 없이 그대로 쓴다.
  const tabs = baseTabs

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    if (viewingOtherUser && pathname.startsWith('/badges')) return false
    if (fromBadges) return href === '/badges'
    return isPathActive(pathname, href)
  }

  // 배지 공유 미리보기 같은 전체화면 오버레이가 열려 있는 동안은 물리적으로 렌더링하지 않는다
  // (z-index로 덮기만 하면 iOS Safari 동적 툴바 상태에 따라 살짝 비쳐 보이는 경우가 있었음).
  if (hidden) return null

  return (
    <nav
      // 20260823_003: 재질(반투명 흰 필) — bg-surface-inverse(불투명) → jam-tabbar-chrome
      // (transitions.css, --color-chrome-bg-inverse/--blur-chrome 참조 — DS TabBar.jsx와 값 공유)
      className="fixed left-1/2 -translate-x-1/2 w-[calc(100%-42px)] max-w-[388px] h-16 rounded-[var(--radius-pill-buttons)] jam-tabbar-chrome flex items-center justify-between px-1 z-40"
      // 20260824_014: 0px clamp가 페이지 하단에 완전히 붙어버려 여백이 사라짐 —
      // 최소 여백 10px로 재조정(DS TabBar.jsx와 동일 공식).
      style={{ bottom: 'max(10px, calc(env(safe-area-inset-bottom) + 16px - 32px))' }}
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
            {/* 활성 탭 배경 필 — 요청: "선택된 탭의 배경뒤에 활성 상태를 표현해줘".
                아이콘보다 먼저 그려 뒤에 깔린다(Link 자체는 flex-1이라 탭마다 폭이 다를
                수 있어, 이 배경은 별도로 중앙 정렬한다). 참고 스크린샷처럼 정사각·완전한
                원이 아니라 "양옆은 완전히 둥글고 위아래는 직선"인 캡슐(스타디움) 모양 —
                높이보다 폭을 넓게 잡고 rounded-full(반경이 짧은 변인 높이에 의해 자연히
                클램프됨)을 적용하면 만들어진다. 색은 흰색이 아니라 반투명 그레이
                (rgba(0,0,0,0.08)) — 흰 필(--color-chrome-bg-inverse) 위에 살짝 어두운
                톤을 얹어 구분한다(요청: "화이트가 아니라 투명한 그레이"). */}
            {active && (
              <span
                aria-hidden="true"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-12 rounded-full"
                style={{ background: 'rgba(0,0,0,0.08)' }}
              />
            )}
            {/* DS v2: 활성=--color-primary(레드), 비활성=--color-icon-inactive(다크 그레이) */}
            <span className="relative" style={{ color: active ? 'var(--color-primary)' : 'var(--color-icon-inactive)' }}>
              {active ? tab.iconFill : tab.iconLine}
            </span>
            {/*
              활성탭 점 — transitions.dev `03-notification-badge.md`.
              조건부 렌더링을 없애고 항상 마운트한 뒤 data-open만 토글해야
              팝인/팝아웃 트랜지션이 발화한다. 앵커는 원본(우상단) 대신
              `.jam-tabbar-dot`으로 트리거 하단 중앙으로 옮겼다. 값 적용은
              `TabActiveDot`이 debounce한다(탭 연타 시 keyframe 강제 재시작 방지).
            */}
            <TabActiveDot active={active} />
          </Link>
        )
      })}
    </nav>
  )
}
