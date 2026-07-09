import { BadgeRarity } from '@/types/database'

interface RarityBadgeProps {
  rarity: BadgeRarity
  className?: string
}

const rarityConfig: Record<BadgeRarity, { label: string; classes: string }> = {
  common: {
    label: '일반',
    classes: 'bg-gray-500/20 text-gray-300 border border-gray-500/40',
  },
  rare: {
    label: '레어',
    classes: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
  },
  legendary: {
    label: '레전더리',
    classes: 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
  },
  mythic: {
    label: '미식',
    classes: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
  },
}

export default function RarityBadge({ rarity, className = '' }: RarityBadgeProps) {
  const config = rarityConfig[rarity]
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tracking-wide uppercase',
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
