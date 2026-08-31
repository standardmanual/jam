'use client'

import Image from 'next/image'
import Link from 'next/link'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import BadgeTreeLockChip from './BadgeTreeLockChip'
import { TargetIcon, MedalIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'
import type { BadgeTreeFamily as BadgeTreeFamilyData } from '@/lib/badgeTree'

/**
 * 배지 트리(/badges/tree) 전용 — 배지 하나(이름 기준)의 Common→Rare→Epic→Mystic
 * 미니 카드를 세로로 쌓아 보여준다. 요구사항 4: 모든 카드는 `/badges/{id}`로 이동 가능.
 * 서비스 전용 UI(MODULAR 승격 대상 아님) — 티켓 20260831_2208.
 *
 * 20260901 UI 수정: 등급 pill·배지 이름을 설명 위(썸네일 옆 텍스트 컬럼 최상단)로 옮겨
 * "pill → 이름(볼드) → 설명" 순으로 읽히게 했다. `BadgeGridCard`(그리드 셀 전용, 이미지
 * 아래 이름·pill이 고정된 세로 레이아웃)로는 이 순서를 만들 수 없어, 썸네일만 직접
 * 구성하고 이름·pill·설명은 텍스트 컬럼에서 조립한다(다른 화면의 BadgeGridCard는 불변).
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
        {family.variants.map((variant) => {
          const dimmed = !earnedBadgeIds.has(variant.id)
          const href = `/badges/${variant.id}`
          return (
            <div key={variant.id} className="flex items-start gap-[var(--spacing-12)]">
              <Link
                href={href}
                className="shrink-0 w-[90px] h-[90px] rounded-[var(--radius-card)] overflow-hidden bg-surface flex items-center justify-center active:scale-95 transition-transform duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              >
                {variant.imageUrl ? (
                  <Image
                    src={variant.imageUrl}
                    alt={family.name}
                    width={90}
                    height={90}
                    className={`w-full h-full object-contain p-1 ${dimmed ? 'grayscale opacity-40' : ''}`}
                  />
                ) : (
                  <MedalIcon className="w-10 h-10 text-text/30" />
                )}
              </Link>
              <div className="flex-1 min-w-0 flex flex-col gap-[var(--spacing-4)] pt-[2px]">
                {/* 부모가 flex-col(기본 align-items:stretch)이라 지정 없으면 pill이 컬럼
                    폭 전체로 늘어난다 — self-start로 콘텐츠 폭만큼만 차지하게 고정. */}
                <RarityBadge rarity={variant.rarity} className="self-start" />
                <Link
                  href={href}
                  className="text-[15px] font-bold text-text leading-snug truncate"
                >
                  {family.name}
                </Link>
                {variant.description && (
                  <p className="text-[length:var(--text-caption)] text-[var(--color-text-secondary)] leading-snug">
                    {variant.description}
                  </p>
                )}
                {variant.locks.length > 0 && (
                  <div className="flex flex-col gap-[var(--spacing-8)] pt-[2px]">
                    {variant.locks.map((lock) => (
                      <BadgeTreeLockChip key={lock.href} {...lock} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
