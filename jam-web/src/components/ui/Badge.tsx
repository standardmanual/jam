import { BadgeRarity } from '@/types/database'

interface RarityBadgeProps {
  rarity: BadgeRarity
  className?: string
}

/**
 * 희귀도 상태 팔레트 — Phase 2에서 `state_color_palette` 테이블로 이관 예정.
 * [주의] 색상값/매핑을 재조정하지 마세요(유저가 학습한 색 언어 유지).
 * 네거티브(배경 채움 + 흰 텍스트) 방식 — 지정 컬러 자체를 배경으로 채우므로
 * 코발트/아이스 어느 배경 위에 놓여도 항상 동일하게 보인다(바이너리 원칙 예외인
 * 상태 팔레트 4색만 사용, 제3의 컬러 추가 아님. common은 팔레트에 없는 색 대신
 * 기존 jam-ink 토큰을 재사용).
 */
const rarityConfig: Record<BadgeRarity, { label: string; classes: string }> = {
  common: { label: 'Common', classes: 'bg-jam-ink text-white' },
  rare: { label: 'Rare', classes: 'bg-jam-teal text-white' },
  legendary: { label: 'Legend', classes: 'bg-jam-purple text-white' },
  mythic: { label: 'Mythic', classes: 'bg-jam-yellow text-white' },
}

export default function RarityBadge({ rarity, className = '' }: RarityBadgeProps) {
  const config = rarityConfig[rarity]
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
