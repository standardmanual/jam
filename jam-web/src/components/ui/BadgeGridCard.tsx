'use client'

import Image from 'next/image'
import Link from 'next/link'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { BadgeLevelChip } from '@ds/components/cards/BadgeLevelChip'
import { MedalIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'
import type { BadgeRarity } from '@/types/database'
import type { ReactNode } from 'react'

export interface BadgeGridCardProps {
  name: string
  imageUrl?: string | null
  /**
   * 배지 등급. **null이면 무한레벨형이라 등급 칩을 그리지 않는다**
   * (마이그레이션 130 — `badges.rarity` nullable, 티켓 20260905_0027).
   * Lv.N 칩 자체는 티켓 20260905_0036(MODULAR 배지 컴포넌트) 범위다.
   */
  rarity: BadgeRarity | null
  /**
   * 레벨형 배지의 Lv.N (티켓 20260905_0038 B). 값이 있으면 등급 칩 대신 `BadgeLevelChip`을
   * 그린다 — `rarity`가 NULL인 배지에 `RarityBadge`를 넘기면 칩이 조용히 사라진다(0036).
   * `BadgeTrophyGridCard`·`UnlockConditionSheetContent`와 같은 분기다.
   */
  level?: number | null
  /**
   * 획득 횟수. 2 이상일 때만 썸네일 모서리에 «×N»을 그린다(1회는 표시하지 않는다).
   * 시각 문법은 피드 카드의 카운터 필(`FeedSection.tsx`)과 같다 — 새 표현을 만들지 않는다.
   */
  count?: number | null
  /** Link mode — wraps card in <Link href>. Mutually exclusive with onClick. */
  href?: string
  /** Button mode — wraps card in <button>. Mutually exclusive with href. */
  onClick?: () => void
  /**
   * href와 함께 쓸 때만 의미가 있는 클릭 핸들러 (20260902_0923).
   * Link 이동 직전에 부수효과(예: 잔존 location.hash 제거)를 실행하고 싶을 때 사용한다.
   */
  onNavigate?: () => void
  /** false = 썸네일 흑백+반투명 처리 (미획득 배지). 기본값 true. */
  earned?: boolean
  /** true = ??? 표시 + 썸네일 흑백 (아이템북 미발견 배지). */
  undiscovered?: boolean
  /** 선택 강조 링 (select 모드). */
  selected?: boolean
  /**
   * 컬렉션 슬롯 장착 모드(`/collections/[id]?slot=1`)에서 "지금 넣을 수 있는 칸"을
   * 짚어준다(`SlotGrid.tsx`). `selected`(선택 상태)와 의미가 달라 별도 prop으로 둔다.
   * (알림함 배지/인벤토리 목록 착지 시의 최근 획득 하이라이트는 20260826_006에서 제거됨)
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
  level = null,
  count = null,
  href,
  onClick,
  onNavigate,
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
    // 컬렉션 슬롯 장착 모드 하이라이트 — 그리드에서 한 칸을 찾아내야 하므로 배경톤만으로는 약하다
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

  const showCount = !undiscovered && typeof count === 'number' && count > 1

  const content = (
    <>
      {/* 카운터 필의 기준점 — 썸네일 자체에 relative를 걸면 grayscale 필터가 필까지 먹는다 */}
      <div className="relative">
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
        {showCount && (
          // 피드 카드의 카운터 필과 같은 시각 문법(20260905_0038 B). 횟수는 아래 이름 줄이
          // 아니라 썸네일에 붙어야 「이 배지를」 몇 번인지가 한눈에 붙는다.
          <span
            className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-[var(--radius-pill)] bg-surface-elevated border border-[color:var(--color-border)] text-[length:var(--text-caption)] leading-none font-bold text-text/80 flex items-center justify-center"
            aria-hidden="true"
          >
            ×{count}
          </span>
        )}
      </div>
      <div className="flex flex-col items-center gap-[var(--spacing-4)] pt-[var(--spacing-8)] w-full">
        <p className="text-[13px] font-bold text-text text-center truncate w-full leading-tight">
          {undiscovered ? '???' : name}
        </p>
        {/* ×N은 aria-hidden이라 보조기술에는 이 문장만이 횟수를 전달한다 */}
        {showCount && <span className="sr-only">{t(d.badges.earnCountAria, { count: String(count) })}</span>}
        {!undiscovered && (level != null ? <BadgeLevelChip level={level} /> : <RarityBadge rarity={rarity ?? undefined} />)}
      </div>
      {children && <div className="w-full mt-[var(--spacing-4)]">{children}</div>}
    </>
  )

  if (href) return <Link href={href} onClick={onNavigate} className={containerCls}>{content}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={containerCls}>{content}</button>
  return <div className={containerCls}>{content}</div>
}
