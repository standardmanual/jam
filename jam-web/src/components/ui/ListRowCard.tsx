'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

export interface ListRowCardProps {
  /** 40×40 아이콘 영역 — 크기·형태·배경 모두 호출부에서 결정 */
  icon?: ReactNode
  title?: string
  subtitle?: ReactNode
  trailing?: ReactNode
  /** 전체 텍스트 영역 커스텀 렌더링 — 제공 시 title/subtitle 무시 */
  children?: ReactNode
  href?: string
  onClick?: () => void
  /**
   * href와 함께 쓸 때만 의미가 있는 클릭 핸들러 (20260902_0915).
   * Link 이동 직전에 부수효과(예: 잔존 location.hash 제거)를 실행하고 싶을 때 사용한다.
   */
  onNavigate?: () => void
  className?: string
  /**
   * 아코디언 헤더로 쓸 때의 펼침 상태 (20260827_018 프로필 피드 활동 묶음 카드).
   * `onClick`으로 button이 렌더될 때만 의미가 있다.
   */
  'aria-expanded'?: boolean
  /** 위 `aria-expanded`가 제어하는 패널의 id */
  'aria-controls'?: string
}

// 20260816_012: 보더 제거 — 페이지 캔버스도 bg-surface라 구분이 사라지므로
// 한 단계 밝은 bg-surface-elevated로 대체한다.
const BASE =
  'flex items-center gap-[var(--spacing-16)] bg-surface-elevated rounded-[var(--radius-cards)] p-[var(--spacing-16)]'

export default function ListRowCard({
  icon,
  title,
  subtitle,
  trailing,
  children,
  href,
  onClick,
  onNavigate,
  className = '',
  'aria-expanded': ariaExpanded,
  'aria-controls': ariaControls,
}: ListRowCardProps) {
  const interactive = !!(href || onClick)
  const cls = [
    BASE,
    interactive && 'active:scale-[0.98] transition-transform duration-100 cursor-pointer',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="flex-1 min-w-0">
        {children ?? (
          <>
            {title !== undefined && (
              <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text truncate">
                {title}
              </p>
            )}
            {subtitle !== undefined &&
              (typeof subtitle === 'string' ? (
                <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-[var(--color-text-secondary)] truncate mt-0.5">
                  {subtitle}
                </p>
              ) : (
                <div className="mt-0.5">{subtitle}</div>
              ))}
          </>
        )}
      </div>
      {trailing !== undefined && (
        <div className="shrink-0 flex items-center">{trailing}</div>
      )}
    </>
  )

  if (href) return (
    <Link href={href} onClick={onNavigate} className={`w-full text-left ${cls}`}>
      {content}
    </Link>
  )
  if (onClick) return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      className={`w-full text-left ${cls}`}
    >
      {content}
    </button>
  )
  return <div className={cls}>{content}</div>
}
