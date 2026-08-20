import Image from 'next/image'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { MedalIcon } from '@/components/ui/icons'
import type { BadgeRow } from '@/types/database'
import { hasBadgeBackgroundTheme } from '@/lib/badgeBackgroundTheme'

/**
 * 배지 상세화면 hero-section (item/poi/activity 3변형 공통) — [20260818_002]
 * 3중 복사돼 있던 마크업을 추출한 순수 리팩터링. 렌더링 결과는 기존과 동일해야 한다.
 * MODULAR 신규 컴포넌트 아님 — [20260816_006] 선례에 따라 서비스 전용 div+Tailwind 유지.
 */
interface BadgeHeroSectionProps {
  badge: Pick<BadgeRow, 'image_url' | 'name' | 'rarity' | 'description' | 'background_color' | 'background_shader_id' | 'background_image_url'>
  hasEarned: boolean
  /**
   * 배경 테마가 깔린 화면인지 강제로 지정한다(미지정 시 badge의 배경 필드로 판정).
   * 어드민 배경 제너레이터 미리보기처럼 배지 레코드에는 아직 배경값이 없지만 화면상으로는
   * 배경 레이어가 이미 깔려 있는 경우에만 사용한다. — [20260819_011]
   */
  themedBackground?: boolean
}

export default function BadgeHeroSection({ badge, hasEarned, themedBackground }: BadgeHeroSectionProps) {
  // [20260819_011] 배경은 상세화면의 고정 배경 레이어 "한 곳에서만" 그린다. hero 카드가 배경을
  // 한 번 더 그리면(기존 동작) 카드 박스와 레이어 박스의 비율이 달라 같은 이미지가 서로 다른
  // 배율로 두 번 잘려 이음매가 보였다. 그래서 여기서는 배경을 그리지 않고, 배경이 있을 때는
  // 카드를 투명하게 비워 아래 레이어가 그대로 비쳐 보이게 한다.
  // 배경이 없는 배지는 기존과 동일하게 bg-surface-elevated 카드로 남는다(회귀 방지).
  const themed = themedBackground ?? hasBadgeBackgroundTheme(badge)

  return (
    // relative z-10 — 배지 상세화면의 고정 배경 레이어(z-index:0, 20260818_002/003)보다 항상
    // 위에서 그려지도록 승격. 승격하지 않으면 non-positioned 콘텐츠가 positioned 배경 레이어보다
    // 페인트 순서상 아래로 가려진다([20260818_002] 잔여 이슈, [20260818_003]에서 실색상 적용과
    // 함께 수정).
    <div className="relative z-10 px-6 pt-[40px] pb-[32px]">
      <div className={['w-full aspect-square rounded-[var(--radius-cards)] flex flex-col p-6', themed ? 'bg-transparent' : 'bg-surface-elevated'].join(' ')}>
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
