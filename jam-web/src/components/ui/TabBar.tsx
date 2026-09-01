'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { d } from '@/lib/i18n'
import { useTabBarHidden } from '@/lib/uiOverlay'
import { isPathActive } from '@/lib/isPathActive'

/*
 * 탭바 기하값은 Figma 원본(file UXcBEgFagmO5ARwH5F0mMW, node 11:218 "Tab Bar Buttons")
 * 실측을 그대로 따른다 — 티켓 20260901_1626. 대화로 px를 주고받으며 맞추다 네 번 어긋나
 * 사용자가 Figma를 지정해줬다.
 *
 *   BG(탭바 전체)      395 × 49
 *   Selection(활성 필)  87 × 41   → 상하좌우 여백 4px 균일
 *
 * **반경은 억지로 같게 맞추지 않는다.** Figma는 nav·필 둘 다 완전 라운드
 * (`border-radius: 296px` = 사실상 무한)라 각자 자기 높이의 절반으로 auto-clamp되고
 * (24.5 / 20.5), 그 차이가 정확히 여백(4px)과 같아 두 호가 평행한 **동심원**이 된다.
 * 이전에 두 반경을 24px로 강제로 통일했던 게 오히려 곡률을 어긋나게 만든 원인이었다.
 */
const PILL_HEIGHT = 41

// 필의 폭은 상수로 두지 않고 활성 탭 슬롯의 실측 폭(offsetWidth)을 그대로 쓴다(moveTo 참고).
// nav 가로폭은 Figma 기준 388px이지만 좁은 화면에서는 calc(100%-42px)로 줄어드는데, 폭을
// 고정하면 그때 좌우 여백이 어긋난다 — 슬롯 폭을 그대로 따라가면 여백이 항상 nav 좌우
// 패딩(px-1 = 4px)으로 일정하게 유지된다.

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

  const navRef = useRef<HTMLElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const tabRefs = useRef(new Map<string, HTMLAnchorElement>())
  // 첫 페인트에서는 애니메이션 없이 스냅시켜야 한다 (SlidingTabs.tsx와 동일).
  const hasPositionedRef = useRef(false)
  // ResizeObserver 이펙트가 매 렌더의 최신 activeHref를 읽기 위한 ref.
  const activeHrefRef = useRef<string | null>(null)

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

  // 활성 탭이 없는 페이지(프로필/검색/알림함 등)에서는 null — pill을 숨긴다.
  const activeHref = tabs.find((tab) => isActive(tab.href))?.href ?? null

  useLayoutEffect(() => {
    activeHrefRef.current = activeHref
  })

  // SlidingTabs.tsx의 moveTo()를 Link 기반 라우트 탐색에 맞게 이식한 것.
  // SlidingTabs 컴포넌트 자체(value/onChange 단일 페이지 모델)는 재사용하지 않고
  // "단일 pill + offsetLeft/offsetWidth 측정 + 첫 배치 무애니메이션" 패턴만 차용한다
  // (20260901_1521). 활성 탭이 없으면(href=null) pill을 숨기고 false를 돌려준다.
  const moveTo = useCallback((href: string | null, animate: boolean): boolean => {
    const pill = pillRef.current
    if (!pill) return false
    const tab = href ? tabRefs.current.get(href) : undefined

    const apply = () => {
      if (tab) {
        pill.style.opacity = '1'
        // 필 폭 = 탭 슬롯 폭이므로 중앙 정렬 보정 없이 offsetLeft를 그대로 쓴다.
        pill.style.width = `${tab.offsetWidth}px`
        pill.style.transform = `translate(${tab.offsetLeft}px, -50%)`
      } else {
        pill.style.opacity = '0'
      }
    }

    if (!animate) {
      const prevTransition = pill.style.transition
      pill.style.transition = 'none'
      apply()
      void pill.offsetWidth
      pill.style.transition = prevTransition
    } else {
      apply()
    }

    return Boolean(tab)
  }, [])

  // 활성 탭 변경(라우트 전환) — 첫 배치만 무애니메이션, 이후에는 트윈.
  useLayoutEffect(() => {
    const positioned = moveTo(activeHref, hasPositionedRef.current)
    if (positioned) hasPositionedRef.current = true
  }, [activeHref, moveTo])

  // 리사이즈 / 웹폰트 로드 / 컨테이너 폭 변화 — 항상 무애니메이션으로 재배치.
  // deps에 activeHref를 넣지 않는 이유는 SlidingTabs.tsx와 동일
  // (ResizeObserver.observe()의 최초 발화가 방금 트리거된 트윈을 캔슬하는 것을 막기 위함).
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return

    const reposition = () => moveTo(activeHrefRef.current, false)

    const observer = new ResizeObserver(reposition)
    observer.observe(nav)
    window.addEventListener('resize', reposition)

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    fonts?.ready.then(reposition).catch(() => {})

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', reposition)
    }
  }, [moveTo])

  // 배지 공유 미리보기 같은 전체화면 오버레이가 열려 있는 동안은 물리적으로 렌더링하지 않는다
  // (z-index로 덮기만 하면 iOS Safari 동적 툴바 상태에 따라 살짝 비쳐 보이는 경우가 있었음).
  if (hidden) return null

  return (
    <nav
      ref={navRef}
      // 20260823_003: 재질(반투명 흰 필) — bg-surface-inverse(불투명) → jam-tabbar-chrome
      // (transitions.css, --color-chrome-bg-inverse/--blur-chrome 참조 — DS TabBar.jsx와 값 공유)
      // 높이 49px·가로 388px·좌우 패딩 4px(px-1)은 Figma 실측값(위 상수 주석 참고).
      // rounded-full은 nav 자기 높이의 절반(24.5px)으로 clamp되고, 필은 자기 높이의
      // 절반(20.5px)으로 clamp돼 두 호가 4px 간격의 동심원이 된다 — 의도된 동작이다.
      className="fixed left-1/2 -translate-x-1/2 w-[calc(100%-42px)] max-w-[388px] h-[49px] rounded-full jam-tabbar-chrome flex items-center justify-between px-1 z-40"
      // 20260824_014: 0px clamp가 페이지 하단에 완전히 붙어버려 여백이 사라짐 —
      // 최소 여백 10px로 재조정(DS TabBar.jsx와 동일 공식).
      style={{ bottom: 'max(10px, calc(env(safe-area-inset-bottom) + 16px - 32px))' }}
    >
      {/* 활성 탭 배경 필 — 요청: "선택된 탭의 배경뒤에 활성 상태를 표현해줘".
          탭마다 조건부 렌더링하던 기존 방식 대신 단일 공유 pill을 두고 활성 탭의
          offsetLeft/offsetWidth 중앙으로 translateX 이동시킨다(moveTo, 위 참고) — 탭 전환 시
          스냅 대신 미끄러지는 모션이 생긴다(20260901_1521). 참고 스크린샷처럼 정사각·완전한
          원이 아니라 "양옆은 완전히 둥글고 위아래는 직선"인 캡슐(스타디움) 모양 — 높이보다
          폭을 넓게 잡고 rounded-full(반경이 짧은 변인 높이에 의해 자연히 클램프됨)을 적용하면
          만들어진다. 색은 흰색이 아니라 반투명 그레이(rgba(0,0,0,0.08)) — 흰 필
          (--color-chrome-bg-inverse) 위에 살짝 어두운 톤을 얹어 구분한다. */}
      <span
        aria-hidden="true"
        ref={pillRef}
        className="jam-tabbar-pill absolute top-1/2 left-0 rounded-full opacity-0"
        style={{
          height: PILL_HEIGHT,
          background: 'rgba(0,0,0,0.08)',
          transform: 'translate(0px, -50%)',
        }}
      />
      {tabs.map((tab) => {
        const active = isActive(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.href, el)
              else tabRefs.current.delete(tab.href)
            }}
            className="relative flex-1 flex items-center justify-center h-full min-w-11 transition-transform duration-100 active:scale-90"
          >
            {/* DS v2: 활성=--color-primary(레드), 비활성=--color-icon-inactive(다크 그레이) */}
            <span className="relative" style={{ color: active ? 'var(--color-primary)' : 'var(--color-icon-inactive)' }}>
              {active ? tab.iconFill : tab.iconLine}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
