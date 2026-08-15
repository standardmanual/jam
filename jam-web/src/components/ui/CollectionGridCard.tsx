'use client'

import Image from 'next/image'
import Link from 'next/link'
import { BookIcon } from '@/components/ui/icons'
import type { ReactNode } from 'react'

export interface CollectionGridCardProps {
  name: string
  imageUrl?: string | null
  /** 수집한 슬롯 수 */
  collected: number
  /** 전체 슬롯 수 */
  total: number
  /** 완성 배지 표시 여부 */
  completed?: boolean
  href?: string
  onClick?: () => void
  className?: string
  children?: ReactNode
}

const BASE =
  'flex flex-col gap-[var(--spacing-8)] active:scale-[0.98] transition-transform duration-100'

export default function CollectionGridCard({
  name,
  imageUrl,
  collected,
  total,
  completed = false,
  href,
  onClick,
  className = '',
  children,
}: CollectionGridCardProps) {
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0
  const cls = [BASE, className].filter(Boolean).join(' ')

  const content = (
    <>
      {/* 썸네일 — 흰 배경 정사각형 */}
      <div className="relative w-full aspect-square bg-white rounded-[var(--radius-cards)] overflow-hidden flex items-center justify-center">
        {imageUrl ? (
          <Image src={imageUrl} alt={name} fill className="object-contain p-1.5" sizes="50vw" />
        ) : (
          <BookIcon className="w-10 h-10 text-black/20" />
        )}
        {completed && (
          <span className="absolute top-2 left-2 bg-[#E8461F] text-white text-[10px] leading-none px-2 py-1 rounded-full">
            완성
          </span>
        )}
      </div>

      {/* 타이틀 */}
      <p className="text-[15px] font-bold text-text leading-[18px] truncate">{name}</p>

      {/* 진행 바 */}
      <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
        <div
          className="h-full rounded-full bg-[#E8461F] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* 슬롯 카운트 */}
      <p className="text-[11px] text-[var(--color-text-secondary)] leading-none tabular-nums">
        {collected}/{total}
      </p>

      {children}
    </>
  )

  if (href) return <Link href={href} className={cls}>{content}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{content}</button>
  return <div className={cls}>{content}</div>
}
