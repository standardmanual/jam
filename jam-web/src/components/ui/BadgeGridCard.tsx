'use client'

import Image from 'next/image'
import Link from 'next/link'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { MedalIcon } from '@/components/ui/icons'
import type { BadgeRarity } from '@/types/database'
import type { ReactNode } from 'react'

export interface BadgeGridCardProps {
  name: string
  imageUrl?: string | null
  rarity: BadgeRarity
  /** Link mode — wraps card in <Link href>. Mutually exclusive with onClick. */
  href?: string
  /** Button mode — wraps card in <button>. Mutually exclusive with href. */
  onClick?: () => void
  /** false = 썸네일 흑백+반투명 처리 (미획득 배지). 기본값 true. */
  earned?: boolean
  /** true = ??? 표시 + 썸네일 흑백 (아이템북 미발견 배지). */
  undiscovered?: boolean
  /** 선택 강조 링 (select 모드). */
  selected?: boolean
  /**
   * 알림함에서 `?highlight=`로 진입했을 때 "이 배지 얘기였어요"를 표시한다 (20260824_021).
   * `selected`(선택 상태)와 의미가 달라 별도 prop으로 둔다.
   */
  highlighted?: boolean
  className?: string
  /** 희귀도 배지 아래 추가 콘텐츠 (만료일, 슬롯 버튼 등). */
  children?: ReactNode
}

const BASE =
  'flex flex-col items-center bg-surface rounded-[var(--radius-card)] p-[var(--spacing-12)] overflow-hidden'

export default function BadgeGridCard({
  name,
  imageUrl,
  rarity,
  href,
  onClick,
  earned = true,
  undiscovered = false,
  selected = false,
  highlighted = false,
  className = '',
  children,
}: BadgeGridCardProps) {
  const isInteractive = !!(href || onClick)

  const containerCls = [
    BASE,
    isInteractive && 'active:scale-95 transition-transform duration-100',
    // 20260816_012: selected 표시를 2px 보더 대신 배경톤 채움으로 대체 (기능적 의미 유지)
    selected && 'bg-[var(--color-primary)]/15',
    // 알림 착지 하이라이트 — 그리드에서 한 장을 찾아내야 하므로 배경톤만으로는 약하다
    highlighted && 'shadow-[inset_0_0_0_2px_var(--color-primary)]',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const thumbDimmed = !earned || undiscovered

  const thumbnailCls = [
    'w-[90px] h-[90px] rounded-[var(--radius-card)] overflow-hidden',
    'flex items-center justify-center',
    thumbDimmed && 'grayscale opacity-40',
  ]
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
      <div className={thumbnailCls}>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={undiscovered ? '???' : name}
            width={90}
            height={90}
            className="w-full h-full object-contain p-1"
          />
        ) : (
          <MedalIcon className="w-10 h-10 text-text/30" />
        )}
      </div>
      <div className="flex flex-col items-center gap-[var(--spacing-4)] pt-[var(--spacing-8)] w-full">
        <div className="h-6 flex items-center justify-center">
          {!undiscovered && <RarityBadge rarity={rarity} />}
        </div>
        <p className="text-[13px] font-bold text-text text-center truncate w-full leading-tight">
          {undiscovered ? '???' : name}
        </p>
      </div>
      {children && <div className="w-full mt-[var(--spacing-4)]">{children}</div>}
    </>
  )

  if (href) return <Link href={href} className={containerCls}>{content}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={containerCls}>{content}</button>
  return <div className={containerCls}>{content}</div>
}
