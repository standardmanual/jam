'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { d } from '@/lib/i18n'

/**
 * SuperHi Plus 상단 네비게이션 (iOS HIG Navigation Bar 패턴)
 *
 * - 배경: --color-surface-inverse (아이스) / 텍스트: --color-text-inverse (코발트)
 * - elevation: 하단 1px inset border만 (드롭섀도 금지)
 * - 뒤로가기: backHref가 있으면 <Link>, 없으면 onBack ?? router.back()
 * - 터치 영역: chevron / rightSlot 모두 최소 44×44pt
 */
export interface TopNavProps {
  title: string
  /** 커스텀 뒤로가기 핸들러. 미지정 시 router.back() */
  onBack?: () => void
  /** 명시적 경로가 있으면 버튼 대신 Link로 렌더 (onBack보다 우선) */
  backHref?: string
  /** 우측 액션 슬롯 (버튼/링크 등). 44×44pt는 슬롯 내부에서 보장할 것 */
  rightSlot?: ReactNode
  /**
   * 뒤로가기 노출 여부. 기본 true.
   * 탭바로 직접 진입하는 루트 화면(예: 본인 프로필)에서는 false로 두어
   * 되돌아갈 곳이 없는 chevron이 뜨지 않게 합니다.
   */
  showBack?: boolean
}

const TOUCH = 'w-11 h-11 shrink-0 flex items-center justify-center'
const PRESS = 'transition-transform duration-100 active:scale-90'

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" aria-hidden="true">
      <path
        d="M15 19l-7-7 7-7"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function TopNav({ title, onBack, backHref, rightSlot, showBack = true }: TopNavProps) {
  const router = useRouter()

  const backClass = [TOUCH, PRESS, 'rounded-[var(--radius-nav-buttons)] -ml-2'].join(' ')

  return (
    <header
      className="sticky top-0 z-30 bg-surface-inverse text-text-inverse shadow-[inset_0_-1px_0_0_var(--color-border-inverse)]"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-2 px-4 h-14">
        {!showBack ? null : backHref ? (
          <Link href={backHref} aria-label={d.common.back} className={backClass}>
            <ChevronLeft />
          </Link>
        ) : (
          <button
            type="button"
            aria-label={d.common.back}
            onClick={onBack ?? (() => router.back())}
            className={backClass}
          >
            <ChevronLeft />
          </button>
        )}

        <h1 className="flex-1 min-w-0 truncate text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] font-normal">
          {title}
        </h1>

        <div className={rightSlot ? 'shrink-0 flex items-center justify-end min-w-11' : 'w-11 shrink-0'}>
          {rightSlot}
        </div>
      </div>
    </header>
  )
}
