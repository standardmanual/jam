import { BadgeRarity } from '@/types/database'

interface RarityBadgeProps {
  rarity: BadgeRarity
  className?: string
}

const rarityConfig: Record<BadgeRarity, { label: string; classes: string }> = {
  common: {
    label: '일반',
    classes: 'bg-[#E8E8E0] text-[#888888]',
  },
  rare: {
    label: '레어',
    classes: 'bg-[#C8E8F4] text-[#2080A8]',
  },
  legendary: {
    label: '레전더리',
    classes: 'bg-[#E8D4F8] text-[#8040C0]',
  },
  mythic: {
    label: '미식',
    classes: 'bg-[#F8F0C0] text-[#A08010]',
  },
}

export default function RarityBadge({ rarity, className = '' }: RarityBadgeProps) {
  const config = rarityConfig[rarity]
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black tracking-wider uppercase',
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
