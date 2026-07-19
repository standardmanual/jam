import { BadgeRarity } from '@/types/database'

interface RarityBadgeProps {
  rarity: BadgeRarity
  className?: string
}

const rarityConfig: Record<BadgeRarity, { label: string; classes: string }> = {
  common: {
    label: 'Common',
    classes: 'bg-gray-200 text-jam-ink border-jam-ink',
  },
  rare: {
    label: 'Rare',
    classes: 'bg-jam-teal text-jam-ink border-jam-ink',
  },
  legendary: {
    label: 'Legend',
    classes: 'bg-jam-purple text-white border-jam-ink',
  },
  mythic: {
    label: 'Mythic',
    classes: 'bg-jam-yellow text-jam-ink border-jam-ink',
  },
}

export default function RarityBadge({ rarity, className = '' }: RarityBadgeProps) {
  if (rarity === 'common') return null
  const config = rarityConfig[rarity]
  return (
    <span
      className={[
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black tracking-wide uppercase border-2',
        config.classes,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {config.label}
    </span>
  )
}
