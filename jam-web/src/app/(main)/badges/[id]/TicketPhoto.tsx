import SafeImage from '@/components/SafeImage'
import { MedalIcon } from '@/components/ui/icons'
import BlobAnimationBackground from '@/components/BlobAnimationBackground'
import BadgeAuraBackground from '@/components/BadgeAuraBackground'
import type { BadgeRow } from '@/types/database'
import type { BlobAnimationParams } from '@/lib/blobAnimation'
import { getBadgeBackgroundAnimation } from '@/lib/badgeBackgroundTheme'
import { AURA_GLOW_BASE_COLOR, resolveAuraColors } from '@/lib/badgeAura'

/**
 * 배지 상세 티켓의 사진 자리 (티켓 20261122_1223, 서비스 전용).
 * 배경(블롭 > Aura > 흰 카드 대체색)과 대표 이미지만 둥근 16px 박스에 담는다. 글자는 넣지 않는다 — 칩·이름·설명은 `TicketTitleBoxes`가 사진 아래에 그린다.
 * 배경 판정은 `src/components/BadgeHeroSection.tsx` 어댑터와 같은 규칙이다(블롭이 있으면 Aura는 읽지도 않는다).
 * 바깥 여백·카드 안쪽 여백은 DS 카드 `page` 크기(px-4, p-6)와 같아 사진 위치가 1회차와 같다.
 */
interface TicketPhotoProps {
  badge: Pick<BadgeRow, 'image_url' | 'name' | 'background_color' | 'background_shader_id' | 'background_image_url'> & {
    background_animation: unknown
    bg_colors?: string[] | null
  }
  hasEarned: boolean
  backgroundAnimation?: BlobAnimationParams | null
}

export default function TicketPhoto({ badge, hasEarned, backgroundAnimation }: TicketPhotoProps) {
  const hasTheme = Boolean(backgroundAnimation || getBadgeBackgroundAnimation(badge))
  const auraColors = hasTheme ? null : resolveAuraColors(badge.bg_colors)
  const onMedia = Boolean(backgroundAnimation)
  const bg = backgroundAnimation?.bgColor ?? (auraColors ? AURA_GLOW_BASE_COLOR : undefined)

  return (
    <div className="relative z-10 px-4 pt-0 pb-5">
      <div
        className={`relative overflow-hidden w-full rounded-2xl flex items-center justify-center p-6 ${onMedia ? 'bg-transparent' : 'bg-card-bg'}`}
        style={bg ? { backgroundColor: bg } : undefined}
      >
        {backgroundAnimation ? (
          <BlobAnimationBackground params={backgroundAnimation} />
        ) : auraColors ? (
          <BadgeAuraBackground colors={auraColors} variant="mesh" seed={badge.name} gray={!hasEarned} />
        ) : null}
        <div className="relative z-10 flex-shrink-0 flex items-center justify-center">
          {badge.image_url ? (
            <div className="w-[200px] h-[200px] flex items-center justify-center">
              <SafeImage
                src={badge.image_url}
                alt={badge.name}
                width={200}
                height={200}
                eager
                className={['object-contain w-full h-full', !hasEarned ? 'grayscale opacity-50' : ''].join(' ')}
              />
            </div>
          ) : (
            <MedalIcon className={['w-28 h-28', !hasEarned ? 'grayscale opacity-50' : ''].join(' ')} />
          )}
        </div>
      </div>
    </div>
  )
}
