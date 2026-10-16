'use client'

import Link from 'next/link'
import SafeImage from '@/components/SafeImage'
import { d } from '@/lib/i18n'
import { BookIcon } from '@/components/ui/icons'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
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
  /** 진행 바와 「수집/전체」 숫자를 숨긴다. 전체 슬롯 수를 아직 모르는 운영툴 미리보기용이다. 기본은 끔. */
  hideProgress?: boolean
  href?: string
  onClick?: () => void
  className?: string
  children?: ReactNode
}

// 카드 면 레시피(티켓 20261015_2133): BadgeGridCard와 같은 면 — 흰 면(--surface) + 1px --border + 반경 16 + 안쪽 여백 12, 그림자 없음.
const BASE = 'flex flex-col gap-2 bg-surface border border-border rounded-2xl p-3'

export default function CollectionGridCard({
  name,
  imageUrl,
  collected,
  total,
  completed = false,
  rarity,
  hideProgress = false,
  href,
  onClick,
  className = '',
  children,
}: CollectionGridCardProps) {
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0
  // 눌림은 공용 `.jam-press`(0.98배·80ms, 동작 줄이기 설정에서는 없음)다. 링크도 버튼도 아닌 카드에는 붙이지 않는다.
  const cls = [BASE, (href || onClick) && 'jam-press', className].filter(Boolean).join(' ')

  const content = (
    <>
      {/* 썸네일 — 투명 배경 정사각형.
          컬렉션 이미지는 어드민 자유 입력이 가능했던 필드라 SafeImage로 렌더한다. next/image에
          직접 넘기면 카드 한 장 때문에 그리드가 있는 화면 전체가 500이 된다 (20260824_005).
          폴백은 이미지가 없을 때와 같은 BookIcon — 카드 골격과 진행도는 그대로 남는다. */}
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden flex items-center justify-center">
        <SafeImage
          src={imageUrl}
          alt={name}
          className="object-contain p-1.5"
          sizes="50vw"
          fallback={<BookIcon className="w-10 h-10 text-muted" />}
        />
        {/* 태그 행: 등급(선택) + 완성 */}
        {(rarity || completed) && (
          <div className="absolute top-2 left-2 flex items-center gap-1">
            {rarity && <RarityBadge rarity={rarity} />}
            {completed && (
              <span className="bg-accent text-accent-foreground text-xs leading-none px-2 py-0.5 rounded-full font-bold">
                {d.itembooks.completed}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 타이틀 */}
      <p className="text-[15px] font-bold text-foreground leading-[18px] truncate">{name}</p>

      {/* 진행 바 + 카운트 한 행 */}
      {!hideProgress && (
        <div className="flex items-center gap-2">
          <ProgressBar percent={pct} height={6} />
          <span className="text-xs text-[color:var(--link)] font-bold leading-none tabular-nums shrink-0">
            {collected}/{total}
          </span>
        </div>
      )}

      {children}
    </>
  )

  if (href) return <Link href={href} className={cls}>{content}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{content}</button>
  return <div className={cls}>{content}</div>
}
