import { BadgeRarity } from '@/types/database'

interface RarityBadgeProps {
  rarity: BadgeRarity
  className?: string
}

/**
 * DS v2 희귀도 배지 — --color-rarity-* 토큰 기반.
 * [의사결정 A] Common=#6b6b6b 회색, Rare=#00cc7a 초록, Legend=#f5a300 황금
 * 네거티브(배경 채움) 방식 — 지정 컬러 자체를 배경으로 채우므로
 * 어떤 배경 위에 놓여도 항상 동일하게 보인다.
 */
const rarityConfig: Record<BadgeRarity, { label: string; bg: string; color: string }> = {
  common: { label: 'Common', bg: 'var(--color-rarity-common)', color: 'var(--color-rarity-common-text)' },
  rare:   { label: 'Rare',   bg: 'var(--color-rarity-rare)',   color: 'var(--color-rarity-rare-text)'   },
  legend: { label: 'Legend', bg: 'var(--color-rarity-legend)', color: 'var(--color-rarity-legend-text)' },
  mythic: { label: 'Mythic', bg: 'var(--color-rarity-mythic)', color: 'var(--color-rarity-mythic-text)' },
}

export default function RarityBadge({ rarity, className = '' }: RarityBadgeProps) {
  const config = rarityConfig[rarity]
  return (
    <span
      className={[
        'inline-flex items-center px-2.5 py-1 rounded-[var(--radius-pill)] text-[12px] leading-none uppercase font-bold',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ backgroundColor: config.bg, color: config.color }}
    >
      {config.label}
    </span>
  )
}
