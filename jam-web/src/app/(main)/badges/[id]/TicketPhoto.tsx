import SafeImage from '@/components/SafeImage'
import { MedalIcon } from '@/components/ui/icons'
import BlobAnimationBackground from '@/components/BlobAnimationBackground'
import type { BadgeRow } from '@/types/database'
import type { BlobAnimationParams } from '@/lib/blobAnimation'

/**
 * 배지 상세 티켓의 사진 자리 (티켓 20261122_1223, 통합 팔레트 4 — 20261122_2226, 서비스 전용).
 * 배경은 어드민이 배지에 지정한 블롭 애니메이션이 있으면 그것, 없으면 `.ticket`이 내려주는 `--card-bg`(티켓색 70% + 흰색) 단색이다.
 * 이미지 색 그라데이션(Aura)과 그림자는 쓰지 않는다. 글자는 넣지 않는다 — 칩·이름·설명은 `TicketTitleBoxes`가 사진 아래에 그린다.
 * 미획득 배지는 같은 그림의 알파 모양만 티켓색을 낮춘 단색(`silhouette`)으로 칠한다(회색·반투명 아님). 그림이 없을 때의 메달 아이콘도 같은 색이다.
 * 실루엣은 SVG 필터(feFlood + SourceAlpha)로 칠한다 — CSS mask는 다른 출처 이미지가 CORS 없이는 비어 그림이 통째로 사라질 수 있어서다.
 * 바깥 여백·카드 안쪽 여백은 DS 카드 `page` 크기(px-4, p-6)와 같아 사진 위치가 1회차와 같다.
 */
const SILHOUETTE_FILTER_ID = 'ticket-silhouette'

interface TicketPhotoProps {
  badge: Pick<BadgeRow, 'image_url' | 'name' | 'background_color' | 'background_shader_id' | 'background_image_url'> & {
    background_animation: unknown
    bg_colors?: string[] | null
  }
  hasEarned: boolean
  /** 미획득 실루엣 색(hex) — 티켓색에서 정한 값(`ticketSilhouetteColor`) */
  silhouette: string
  backgroundAnimation?: BlobAnimationParams | null
}

export default function TicketPhoto({ badge, hasEarned, silhouette, backgroundAnimation }: TicketPhotoProps) {
  const onMedia = Boolean(backgroundAnimation)
  const medal = (
    <MedalIcon
      className="w-28 h-28"
      style={!hasEarned ? { color: 'var(--ticket-silhouette)' } : undefined}
    />
  )

  return (
    <div className="relative z-10 px-4 pt-0 pb-5">
      <div
        className={`relative overflow-hidden w-full rounded-2xl flex items-center justify-center p-6 ${onMedia ? 'bg-transparent' : 'bg-card-bg'}`}
        style={backgroundAnimation?.bgColor ? { backgroundColor: backgroundAnimation.bgColor } : undefined}
      >
        {backgroundAnimation ? <BlobAnimationBackground params={backgroundAnimation} /> : null}
        {!hasEarned && (
          <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
            <filter id={SILHOUETTE_FILTER_ID} colorInterpolationFilters="sRGB">
              <feFlood floodColor={silhouette} result="fill" />
              <feComposite in="fill" in2="SourceAlpha" operator="in" />
            </filter>
          </svg>
        )}
        <div className="relative z-10 flex-shrink-0 flex items-center justify-center">
          {badge.image_url ? (
            <div
              className="w-[200px] h-[200px] flex items-center justify-center"
              style={!hasEarned ? { filter: `url(#${SILHOUETTE_FILTER_ID})` } : undefined}
            >
              <SafeImage
                src={badge.image_url}
                alt={badge.name}
                width={200}
                height={200}
                eager
                className="object-contain w-full h-full"
                fallback={medal}
              />
            </div>
          ) : (
            medal
          )}
        </div>
      </div>
    </div>
  )
}
