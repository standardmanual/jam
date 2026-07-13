import { BadgeRarity } from '@/types/database'

interface RarityBadgeProps {
  rarity: BadgeRarity
  className?: string
}

const rarityConfig: Record<BadgeRarity, { label: string; classes: string }> = {
  common: {
    label: '일반',
    classes: 'bg-gray-200 text-jam-ink border-jam-ink',
  },
  rare: {
    label: '레어',
    classes: 'bg-jam-teal text-jam-ink border-jam-ink',
  },
  legendary: {
    label: '레전더리',
    classes: 'bg-jam-purple text-white border-jam-ink',
  },
  mythic: {
    label: '미식',
    classes: 'bg-jam-yellow text-jam-ink border-jam-ink',
  },
}

export default function RarityBadge({ rarity, className = '' }: RarityBadgeProps) {
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
