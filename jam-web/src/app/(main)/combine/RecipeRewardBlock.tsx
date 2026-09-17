import Image from 'next/image'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { PackageIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'
import type { BadgeRarity } from '@/types/database'

export interface RecipeRewardBadge {
  id: string
  name: string
  image_url: string | null
  rarity: BadgeRarity | null
}

interface Props {
  badges: RecipeRewardBadge[]
  points: number
  className?: string
}

/**
 * 레시피 보상 블록 — 믹서 상단 요약 영역과 레시피 탐색 목록 행이 공유한다(티켓 20260917_1828,
 * 요구사항 7·14). 조건별로 다르게 노출한다:
 *  - 배지 + 포인트 둘 다 있으면: 배지 이미지 + 등급 칩 + 배지명, 그 옆에 (아이콘 없이) 포인트
 *  - 배지만 있으면: 배지 이미지 + 등급 칩 + 배지명만
 *  - 포인트만 있으면: (아이콘 없이) 포인트만
 * 보상 배지가 여러 개면 대표(첫 번째)만 노출하고 "+N"을 붙인다.
 */
export default function RecipeRewardBlock({ badges, points, className = '' }: Props) {
  const hasBadges = badges.length > 0
  const hasPoints = points > 0
  if (!hasBadges && !hasPoints) return null

  const primary = badges[0]
  const extraCount = badges.length - 1

  return (
    <div className={['flex items-center gap-[var(--spacing-8)] min-w-0', className].join(' ')}>
      {hasBadges && primary && (
        <div className="flex items-center gap-[var(--spacing-6)] min-w-0">
          <div className="relative w-8 h-8 rounded-[var(--radius-pill)] bg-surface flex items-center justify-center overflow-hidden shrink-0">
            {primary.image_url ? (
              <Image src={primary.image_url} alt={primary.name} width={32} height={32} className="object-contain w-full h-full" />
            ) : (
              <PackageIcon className="w-4 h-4 text-text/40" />
            )}
          </div>
          <div className="flex items-center gap-[var(--spacing-4)] min-w-0">
            <RarityBadge rarity={primary.rarity} />
            <span className="text-[length:var(--text-caption)] leading-[var(--leading-caption)] text-text truncate">
              {primary.name}
              {extraCount > 0 ? ` +${extraCount}` : ''}
            </span>
          </div>
        </div>
      )}
      {hasPoints && (
        <span className="text-[length:var(--text-caption)] leading-[var(--leading-caption)] text-text/70 shrink-0">
          {t(d.combine.rewardPointsLabel, { points: points.toLocaleString() })}
        </span>
      )}
    </div>
  )
}
