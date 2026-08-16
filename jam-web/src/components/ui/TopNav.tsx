'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { d } from '@/lib/i18n'

/**
 * SuperHi Plus 상단 네비게이션 (iOS HIG Navigation Bar 패턴)
 *
 * - 배경: 페이지와 동일한 --color-surface (별도 표면 분리 없음) / 텍스트: --color-text
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
  /** header 엘리먼트에 적용할 인라인 스타일. bg/color 오버라이드에 사용. */
  headerStyle?: React.CSSProperties
}

// 터치 영역은 44×44pt를 유지하되, 아이콘을 오른쪽(제목 쪽)으로 붙여 아이콘 자체의
// 좌우 여백이 아이콘-제목 사이 공백으로 잡아먹히지 않게 한다.
const TOUCH = 'w-11 h-11 shrink-0 flex items-center justify-end'
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

export default function TopNav({ title, onBack, backHref, rightSlot, showBack = true, headerStyle }: TopNavProps) {
  const router = useRouter()

  const backClass = [TOUCH, PRESS, 'rounded-[var(--radius-nav-buttons)] -ml-2'].join(' ')

  return (
    <header
      className="sticky top-0 z-30 bg-[var(--color-bg)] text-text"
      style={{ paddingTop: 'env(safe-area-inset-top)', ...headerStyle }}
    >
      <div className="flex items-center gap-2 px-4 h-14">
        {/* 뒤로가기 chevron과 제목 사이 간격만 별도로 좁힌다(gap-1) —
            우측 슬롯과의 간격(위 gap-2)에는 영향 없음 */}
        <div className="flex-1 min-w-0 flex items-center gap-1">
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

          <h1 className="min-w-0 truncate text-[length:var(--text-body)] leading-[var(--leading-body)] font-normal">
            {title}
          </h1>
        </div>

        <div className={rightSlot ? 'shrink-0 flex items-center justify-end min-w-11' : 'w-11 shrink-0'}>
          {rightSlot}
        </div>
      </div>
    </header>
  )
}
