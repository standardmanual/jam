import SafeImage from '@/components/SafeImage'
import type { FeedCardView } from '@/lib/today/cardView'
import { FEED_FULL_IMAGE_SCRIM, feedColorVar } from '@/lib/today/feedConstants'
import ChipTitle from '../ChipTitle'
import { FeedChipLayer, FeedStampLayer } from './FeedCardParts'

/**
 * 전체 배경 이미지(`full_image`) — 이미지가 카드 전체이고 제목을 왼쪽 아래 16px에 얹는다 (티켓 20261121_0041).
 *
 * **지금 홈에서는 꺼져 있다**(`FEED_FULL_IMAGE_ENABLED = false`, `toCardView`가 이 유형을 옛 경로로 보낸다). 이미지 위 제목의 대비 기준이 없기 때문이다
 * (PRD 「개편 규격」 «이미지 위 제목», 이미지 규칙은 8회차). 이 컴포넌트와 Story는 켜질 때를 위해 있다.
 *
 * - 샘플: 정사각(1:1, 358×358), 제목 30/36 굵기 900 왼쪽 아래 16px, 설명 숨김, 도장 선택.
 * - 제목 글자는 다른 유형처럼 `--foreground`다(`--snow` 아님). 이미지 위 제목의 대비 기준은 이미지 규칙(8회차)에서 채원이 정하므로 지금은 어두운 막을 깔지 않는다
 *   (`FEED_FULL_IMAGE_SCRIM.opacity`가 0이면 막을 그리지 않는다, 상수는 남겼다). 켤 때 채원이 글자색·막을 함께 정한다.
 *   막을 쓰게 되면 아래에서 위로 옅어지는 그라데이션이고 색은 토큰을 섞어 만든다(hex 없음).
 * - 칩은 이미지 위 모서리 안쪽(`inset`)이다. 제목이 왼쪽 아래에 얹히므로 그 자리(`image-bottom-left`)는 쓰지 않는다(자리 표가 세 자리만 허용한다).
 * - 이미지가 없으면 카드 배경 색 면이다. 이미지는 장식이라 `alt`가 비어 있다 — 제목이 글자로 보인다.
 */

const IMAGE_SIZES = '(min-width: 430px) 398px, calc(100vw - 32px)'

const SCRIM_COLOR = `color-mix(in srgb, var(--foreground) ${Math.round(FEED_FULL_IMAGE_SCRIM.opacity * 100)}%, transparent)`

export default function FeedFullImageCard({ view }: { view: FeedCardView }) {
  const { look } = view
  const { titleChips } = look
  return (
    <div
      className="relative aspect-square overflow-hidden rounded-2xl"
      style={{ backgroundColor: feedColorVar(look.colors.bg) }}
    >
      <SafeImage src={view.imageUrl} alt="" sizes={IMAGE_SIZES} className="object-cover" />
      {FEED_FULL_IMAGE_SCRIM.opacity > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{
            height: `${FEED_FULL_IMAGE_SCRIM.heightPercent}%`,
            backgroundImage: `linear-gradient(to top, ${SCRIM_COLOR}, transparent)`,
          }}
        />
      )}
      <ChipTitle
        as="h3"
        title={view.title}
        words={titleChips.words}
        size="lg"
        colors={titleChips.colors}
        tilts={titleChips.tilts}
        className="absolute inset-x-4 bottom-4 text-3xl font-black tracking-[-0.02em] text-foreground whitespace-pre-line"
      />
      <FeedChipLayer view={view} />
      <FeedStampLayer view={view} />
    </div>
  )
}
