import { BadgeRarity } from '@/types/database'

interface RarityBadgeProps {
  rarity: BadgeRarity
  className?: string
}

/**
 * 희귀도 상태 팔레트 — Phase 2에서 `state_color_palette` 테이블로 이관 예정.
 * [주의] 색상값/매핑을 재조정하지 마세요(유저가 학습한 색 언어 유지).
 * 배경 전체를 칠하지 않고 텍스트/보더 색으로만 표현 — 어느 배경(코발트/아이스) 위에
 * 놓여도 색이 죽지 않고, 바이너리 원칙(제3의 컬러는 상태 팔레트만 예외)을 지킵니다.
 */
const rarityConfig: Record<BadgeRarity, { label: string; classes: string } | null> = {
  common: null,
  rare: { label: 'Rare', classes: 'text-jam-teal shadow-[inset_0_0_0_1px_var(--color-jam-teal)]' },
  legendary: { label: 'Legend', classes: 'text-jam-purple shadow-[inset_0_0_0_1px_var(--color-jam-purple)]' },
  mythic: { label: 'Mythic', classes: 'text-jam-yellow shadow-[inset_0_0_0_1px_var(--color-jam-yellow)]' },
}

export default function RarityBadge({ rarity, className = '' }: RarityBadgeProps) {
  const config = rarityConfig[rarity]
  if (!config) return null
  return (
    <span
      className={[
        'inline-flex items-center px-2.5 py-1 rounded-[var(--radius-tags)] text-[12px] leading-none uppercase font-bold',
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
