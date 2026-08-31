'use client'

import Image from 'next/image'
import Link from 'next/link'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import BadgeTreeLockChip from './BadgeTreeLockChip'
import { MedalIcon } from '@/components/ui/icons'
import type { BadgeTreeCard as BadgeTreeCardData } from '@/lib/badgeTree'

/**
 * 배지 트리(/badges/tree) 전용 — 배지 한 등급(예: "동네 산책러" Rare)의 카드 한 장.
 * 요구사항 4: `/badges/{id}`로 이동 가능. 서비스 전용 UI(MODULAR 승격 대상 아님) — 티켓
 * 20260831_2208. 20260901 UI 수정으로 가족(같은 배지의 등급 묶음) 단위 래핑을 없애고
 * 카드 한 장이 곧 이 컴포넌트가 됐다 — "등급 pill → 이름(볼드) → 설명 → 잠금칩" 순.
 */
export interface BadgeTreeCardProps {
  card: BadgeTreeCardData
  /** 이 유저가 획득한 배지 id 집합 — 미획득 배지 흑백/반투명 처리(티켓 20260831_2250) */
  earnedBadgeIds: Set<string>
}

export default function BadgeTreeCard({ card, earnedBadgeIds }: BadgeTreeCardProps) {
  const dimmed = !earnedBadgeIds.has(card.id)
  const href = `/badges/${card.id}`

  return (
    <div className="flex items-start gap-[var(--spacing-12)] bg-surface-elevated/60 rounded-[var(--radius-cards)] p-[var(--spacing-12)]">
      <Link
        href={href}
        className="shrink-0 w-[90px] h-[90px] rounded-[var(--radius-card)] overflow-hidden bg-surface flex items-center justify-center active:scale-95 transition-transform duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
      >
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={card.name}
            width={90}
            height={90}
            className={`w-full h-full object-contain p-1 ${dimmed ? 'grayscale opacity-40' : ''}`}
          />
        ) : (
          <MedalIcon className="w-10 h-10 text-text/30" />
        )}
      </Link>
      <div className="flex-1 min-w-0 flex flex-col gap-[var(--spacing-4)] pt-[2px]">
        <RarityBadge rarity={card.rarity} className="self-start" />
        <Link href={href} className="text-[15px] font-bold text-text leading-snug truncate">
          {card.name}
        </Link>
        {card.description && (
          <p className="text-[length:var(--text-caption)] text-[var(--color-text-secondary)] leading-snug">
            {card.description}
          </p>
        )}
        {card.locks.length > 0 && (
          <div className="flex flex-col gap-[var(--spacing-8)] pt-[2px]">
            {card.locks.map((lock) => (
              <BadgeTreeLockChip key={lock.href} {...lock} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
