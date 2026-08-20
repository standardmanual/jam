'use client'

import Image from 'next/image'
import Link from 'next/link'
import { BookIcon } from '@/components/ui/icons'
import RarityBadge from '@/components/ui/Badge'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import type { BadgeRarity } from '@/types/database'
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
  /** 최초 등록 아이템배지 기준 컬렉션 등급 */
  rarity?: BadgeRarity
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
  rarity,
  href,
  onClick,
  className = '',
  children,
}: CollectionGridCardProps) {
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0
  const cls = [BASE, className].filter(Boolean).join(' ')

  const content = (
    <>
      {/* 썸네일 — 투명 배경 정사각형 */}
      <div className="relative w-full aspect-square rounded-[var(--radius-cards)] overflow-hidden flex items-center justify-center">
        {imageUrl ? (
          <Image src={imageUrl} alt={name} fill className="object-contain p-1.5" sizes="50vw" />
        ) : (
          <BookIcon className="w-10 h-10 text-text/20" />
        )}
        {/* 태그 행: 등급(선택) + 완성 */}
        {(rarity || completed) && (
          <div className="absolute top-2 left-2 flex items-center gap-1">
            {rarity && (
              <RarityBadge
                rarity={rarity}
                className="text-[length:var(--text-caption)] px-2 py-0.5"
              />
            )}
            {completed && (
              <span className="bg-[#E8461F] text-white text-[length:var(--text-caption)] leading-none px-2 py-0.5 rounded-full font-bold">
                완성
              </span>
            )}
          </div>
        )}
      </div>

      {/* 타이틀 */}
      <p className="text-[15px] font-bold text-text leading-[18px] truncate">{name}</p>

      {/* 진행 바 + 카운트 한 행 */}
      <div className="flex items-center gap-[var(--spacing-8)]">
        <ProgressBar percent={pct} height={6} />
        <span className="text-[length:var(--text-caption)] text-[color:var(--color-primary)] font-bold leading-none tabular-nums shrink-0">
          {collected}/{total}
        </span>
      </div>

      {children}
    </>
  )

  if (href) return <Link href={href} className={cls}>{content}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{content}</button>
  return <div className={cls}>{content}</div>
}
