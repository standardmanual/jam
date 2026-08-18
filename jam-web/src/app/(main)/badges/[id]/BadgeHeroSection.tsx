import Image from 'next/image'
import RarityBadge from '@/components/ui/Badge'
import { MedalIcon } from '@/components/ui/icons'
import type { BadgeRow } from '@/types/database'
import { getBadgeBackgroundStyle } from '@/lib/badgeBackgroundTheme'

/**
 * 배지 상세화면 hero-section (item/poi/activity 3변형 공통) — [20260818_002]
 * 3중 복사돼 있던 마크업을 추출한 순수 리팩터링. 렌더링 결과는 기존과 동일해야 한다.
 * MODULAR 신규 컴포넌트 아님 — [20260816_006] 선례에 따라 서비스 전용 div+Tailwind 유지.
 */
interface BadgeHeroSectionProps {
  badge: Pick<BadgeRow, 'image_url' | 'name' | 'rarity' | 'description' | 'background_color' | 'background_shader_id'>
  hasEarned: boolean
}

export default function BadgeHeroSection({ badge, hasEarned }: BadgeHeroSectionProps) {
  // 배경 테마 프리미티브 — 현재는 no-op(항상 빈 스타일)이라 시각 변화 없음. 추후 배경테마 기능이
  // 이 값을 채우면 hero 카드에도 자동 반영된다.
  const backgroundStyle = getBadgeBackgroundStyle(badge)

  return (
    <div className="px-6 pt-[40px] pb-[32px]">
      <div className="w-full aspect-square rounded-[var(--radius-cards)] bg-surface-elevated flex flex-col p-6" style={backgroundStyle}>
        <div className="flex-1 flex items-center justify-center">
          {badge.image_url ? (
            <div className="w-[200px] h-[200px] flex items-center justify-center">
              <Image
                src={badge.image_url}
                alt={badge.name}
                width={200}
                height={200}
                className={['object-contain w-full h-full', !hasEarned ? 'grayscale opacity-50' : ''].join(' ')}
              />
            </div>
          ) : (
            <MedalIcon className={['w-28 h-28', !hasEarned ? 'grayscale opacity-50' : ''].join(' ')} />
          )}
        </div>
        <div className="flex flex-col items-center gap-2 pt-4">
          <RarityBadge rarity={badge.rarity} />
          <h1 className="text-[length:var(--text-heading-sm)] font-bold text-text text-center leading-[var(--leading-heading-sm)]">{badge.name}</h1>
        </div>
      </div>
      {badge.description && (
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)] text-center leading-[var(--leading-body)] mt-6">{badge.description}</p>
      )}
    </div>
  )
}
