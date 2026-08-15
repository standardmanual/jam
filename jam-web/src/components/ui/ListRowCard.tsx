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
  className?: string
}

const BASE =
  'flex items-center gap-[var(--spacing-16)] bg-surface shadow-[inset_0_0_0_1px_var(--color-border)] rounded-[var(--radius-cards)] p-[var(--spacing-16)]'

export default function ListRowCard({
  icon,
  title,
  subtitle,
  trailing,
  children,
  href,
  onClick,
  className = '',
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

  if (href) return <Link href={href} className={`w-full text-left ${cls}`}>{content}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={`w-full text-left ${cls}`}>{content}</button>
  return <div className={cls}>{content}</div>
}
