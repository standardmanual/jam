'use client'

import BadgeGridCard from '@/components/ui/BadgeGridCard'
import BadgeTreeLockChip from './BadgeTreeLockChip'
import { TargetIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'
import type { BadgeTreeFamily as BadgeTreeFamilyData } from '@/lib/badgeTree'

/**
 * 배지 트리(/badges/tree) 전용 — 배지 하나(이름 기준)의 Common→Rare→Epic→Mystic
 * 미니 카드를 세로로 쌓아 보여준다. 요구사항 4: 모든 카드는 `/badges/{id}`로 이동 가능.
 * 서비스 전용 UI(MODULAR 승격 대상 아님, `BadgeGridCard`만 재사용) — 티켓 20260831_2208.
 */
export interface BadgeTreeFamilyProps {
  family: BadgeTreeFamilyData
  /** 이 유저가 획득한 배지 id 집합 — 미획득 배지 흑백/반투명 처리(티켓 20260831_2250) */
  earnedBadgeIds: Set<string>
}

export default function BadgeTreeFamily({ family, earnedBadgeIds }: BadgeTreeFamilyProps) {
  return (
    <div className="flex flex-col gap-[var(--spacing-8)] bg-surface-elevated/60 rounded-[var(--radius-cards)] p-[var(--spacing-12)]">
      {family.representative && (
        <div className="flex items-center gap-1.5 px-[2px]">
          <TargetIcon className="w-4 h-4 text-[var(--color-primary)]" />
          <span className="text-[length:var(--text-caption)] font-bold text-[var(--color-primary)]">
            {d.badges.treeRepresentativeLabel}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-[var(--spacing-8)]">
        {family.variants.map((variant) => (
          <div key={variant.id} className="flex items-start gap-[var(--spacing-12)]">
            <BadgeGridCard
              href={`/badges/${variant.id}`}
              name={family.name}
              imageUrl={variant.imageUrl}
              rarity={variant.rarity}
              earned={earnedBadgeIds.has(variant.id)}
              className="w-[110px] shrink-0"
            />
            <div className="flex-1 min-w-0 flex flex-col gap-[var(--spacing-8)] pt-[var(--spacing-8)]">
              {variant.description && (
                <p className="text-[length:var(--text-caption)] text-[var(--color-text-secondary)] leading-snug">
                  {variant.description}
                </p>
              )}
              {variant.locks.map((lock) => (
                <BadgeTreeLockChip key={lock.href} label={lock.label} href={lock.href} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
