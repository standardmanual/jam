import type { CSSProperties, ReactNode } from 'react'
import SafeImage from '@/components/SafeImage'
import type { FeedCardView } from '@/lib/today/cardView'
import { chipPositionOf, stampPositionOf, stampTiltOf, type ChipAnchorMode } from '@/lib/today/feedChipLayout'
import { FEED_BADGE_SIZE, FEED_STAMP_TILT, feedColorVar } from '@/lib/today/feedConstants'
import ChipTitle from '../ChipTitle'
import FeedChip from '../FeedChip'
import FeedStamp from '../FeedStamp'

/**
 * 홈피드 새 카드 다섯 유형이 함께 쓰는 조각 (티켓 20261121_0041, 상위 20261120_2026 4회차-2). 서비스 전용(홈피드 한정).
 *
 * 값만 받아 그린다(DB·조회·훅 없음, 서버 컴포넌트). 링크·계측은 `CardFrame`이 맡고 여기에는 없다. 칩·박스·도장 부품(`FeedChip`·`FeedBox`·`FeedStamp`)은 3회차 것을 그대로 쓴다.
 *
 * - 카드 면: 카드 배경색(`look.colors.bg`)·모서리 `rounded-2xl`·안쪽 여백 `p-4`. 외곽선은 없다(외곽선은 칩과 도장에만). `overflow-hidden`을 걸지 않는다 —
 *   칩이 앵커 모서리에 걸쳐 카드 가장자리 가까이까지 나가므로 잘리지 않게 한다(걸침 한도는 `FEED_CHIP_OFFSET`, 폭 320px에서도 가장자리 안쪽이다).
 * - 글자: 색은 `--foreground`, 제목 30/36 굵기 900 자간 −0.02em, 설명 14/20 굵기 500, 제목과 설명 사이 8px. 제목은 데이터의 줄바꿈을 그대로 따른다(`whitespace-pre-line`).
 *   글자 크기·여백은 디자인 시스템 눈금(`text-3xl`·`text-sm`·`gap-2`)이다.
 * - 칩 층·도장은 앵커(이미지 박스·박스·배지 영역·카드)의 `relative` 자식으로 놓는다. 칩은 박스를 자르는 마스크 밖의 형제 층이다.
 */

/** 제목 글자 클래스(30/36). 큰 글자 변형은 텍스트 박스가 쓰는 48/1.1이다. */
const TITLE_CLASS = 'text-3xl font-black tracking-[-0.02em] text-foreground whitespace-pre-line'
const BIG_TITLE_CLASS = 'text-5xl leading-[1.1] font-black tracking-[-0.02em] text-foreground whitespace-pre-line text-center'

/** 카드 면. 최소 높이는 유형별 샘플 높이(`FEED_CARD_MIN_HEIGHT`)이고 내용이 길면 늘어난다. */
export function FeedCardShell({
  view,
  minHeight,
  className,
  children,
}: {
  view: FeedCardView
  minHeight: number
  className?: string
  children: ReactNode
}) {
  const classes = ['relative flex flex-col rounded-2xl p-4', className].filter(Boolean).join(' ')
  return (
    <div className={classes} style={{ backgroundColor: feedColorVar(view.look.colors.bg), minHeight }}>
      {children}
    </div>
  )
}

/** 제목(제목 속 칩 포함). 낱말이 없거나 제목에 없으면 글자만 그린다. */
export function FeedTitle({ view, big = false, className }: { view: FeedCardView; big?: boolean; className?: string }) {
  const { titleChips } = view.look
  return (
    <ChipTitle
      as="h3"
      title={view.title}
      words={titleChips.words}
      size="lg"
      colors={titleChips.colors}
      tilts={titleChips.tilts}
      className={[big ? BIG_TITLE_CLASS : TITLE_CLASS, className].filter(Boolean).join(' ')}
    />
  )
}

/** 설명. 이 카드가 설명을 보이지 않거나 값이 없으면 아무것도 그리지 않는다. */
export function FeedDescription({ view }: { view: FeedCardView }) {
  if (!view.look.showDescription || !view.description) return null
  return <p className="text-sm font-medium text-foreground break-keep wrap-break-word">{view.description}</p>
}

/** 제목과 설명 묶음(간격 8px). 설명이 없으면 제목만 남는다. */
export function FeedTextBlock({ view }: { view: FeedCardView }) {
  return (
    <div className="flex flex-col gap-2">
      <FeedTitle view={view} />
      <FeedDescription view={view} />
    </div>
  )
}

function positionStyle(position: { top?: number; right?: number; bottom?: number; left?: number }): CSSProperties {
  return { top: position.top, right: position.right, bottom: position.bottom, left: position.left }
}

/**
 * 칩 층. 앵커(`relative` 부모) 안에 형제로 놓아 칩을 모서리에 건다. 허용하지 않는 자리의 칩은 그리지 않는다.
 * `mode`를 생략하면 유형의 기본(걸침, `full_image`는 안쪽)이다.
 */
export function FeedChipLayer({ view, mode }: { view: FeedCardView; mode?: ChipAnchorMode }) {
  return (
    <>
      {view.look.chips.map((chip, index) => {
        const position = chipPositionOf(view.feedType, chip.slot, mode)
        if (!position) return null
        return (
          <span key={index} className="absolute z-10 flex" style={positionStyle(position)}>
            <FeedChip size={chip.size} color={chip.color} tilt={chip.tilt}>
              {chip.text}
            </FeedChip>
          </span>
        )
      })}
    </>
  )
}

/** 도장 층. `look.stamp`가 있을 때만 하나를 그린다(장식이라 `aria-hidden`은 `FeedStamp`가 건다). */
export function FeedStampLayer({ view }: { view: FeedCardView }) {
  const stamp = view.look.stamp
  if (!stamp) return null
  const position = stampPositionOf(view.feedType, stamp.slot)
  if (!position) return null
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute z-10"
      style={{ ...positionStyle(position), transform: `rotate(${stampTiltOf(stamp.slot, FEED_STAMP_TILT)}deg)` }}
    >
      <FeedStamp color={stamp.color} />
    </span>
  )
}

/**
 * 배지 그림 앵커 — 배지 소개·배지만이 함께 쓰는 208×208 칸.
 * 그림은 카드에 걸린 첫 배지의 그림(`badgeImageUrl`), 없으면 카드 이미지(`imageUrl`)다. 둘 다 없으면 같은 크기의 빈 칸을 남긴다(높이가 흔들리지 않는다).
 * `alt`는 배지 이름(`badgeName`)이고 없으면 비어 있다(제목이 글자로 보인다). 박스·외곽선이 없고 그림을 자르지 않는다(`object-contain`).
 * `children`(칩·도장 층)은 이 칸을 앵커로 놓는다.
 */
export function FeedBadgeArt({ view, children }: { view: FeedCardView; children?: ReactNode }) {
  const src = view.badgeImageUrl ?? view.imageUrl
  return (
    <div className="relative shrink-0" style={{ width: FEED_BADGE_SIZE, height: FEED_BADGE_SIZE }}>
      <SafeImage
        src={src}
        alt={view.badgeName ?? ''}
        width={FEED_BADGE_SIZE}
        height={FEED_BADGE_SIZE}
        className="h-full w-full object-contain"
      />
      {children}
    </div>
  )
}
