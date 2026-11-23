import type { CSSProperties, ReactNode } from 'react'
import SafeImage from '@/components/SafeImage'
import { CategorySticker } from '@ds/components/cards/CategorySticker'
import type { FeedCardView } from '@/lib/today/cardView'
import { chainInputOf, planFeedChips } from '@/lib/today/feedChipChain'
import {
  chipPositionOf,
  plannedChipPositionOf,
  stampPositionOf,
  stampTiltOf,
  type ChipAnchorMode,
  type ChipPosition,
} from '@/lib/today/feedChipLayout'
import type { ChipPlan, PlannedChip } from '@/lib/today/feedChipPlan'
import {
  FEED_BADGE_SIZE,
  FEED_CARD_ROOT_ATTR,
  FEED_STAMP_TILT,
  feedColorVar,
  feedTextBoxTitleSizeClass,
  feedTextOnBg,
} from '@/lib/today/feedConstants'
import ChipTitle from '../ChipTitle'
import FeedChip, { type FeedChipSize } from '../FeedChip'
import FeedStamp from '../FeedStamp'

/**
 * 홈피드 새 카드 다섯 유형이 함께 쓰는 조각 (티켓 20261121_0041, 상위 20261120_2026 4회차-2). 서비스 전용(홈피드 한정).
 *
 * 값만 받아 그린다(DB·조회·훅 없음, 서버 컴포넌트). 링크·계측은 `CardFrame`이 맡고 여기에는 없다. 칩·박스·도장 부품(`FeedChip`·`FeedBox`·`FeedStamp`)은 3회차 것을 그대로 쓴다.
 *
 * - 카드 면: 카드 배경색(`look.colors.bg`)·모서리 `rounded-2xl`·안쪽 여백 `p-4`. 외곽선은 없다(외곽선은 칩과 도장에만). `overflow-hidden`을 걸지 않는다 —
 *   칩이 앵커 모서리에 걸쳐 카드 가장자리 가까이까지 나가므로 잘리지 않게 한다(걸침 한도는 `FEED_CHIP_OFFSET`, 폭 320px에서도 가장자리 안쪽이다).
 * - 글자: 바탕 위 제목·설명 색은 바탕 키를 따른다(`feedTextOnBg`: 짙은 초록 바탕이면 `--snow`, 아니면 `--foreground`, 인라인 color 한 곳). 박스 안 제목(`onBox`)은 늘 `--foreground`다. 제목 30/36 굵기 900 자간 −0.02em, 설명 14/20 굵기 500, 제목과 설명 사이 8px. 제목은 데이터의 줄바꿈을 그대로 따른다(`whitespace-pre-line`).
 *   글자 크기·여백은 디자인 시스템 눈금(`text-3xl`·`text-sm`·`gap-2`)이다.
 * - 칩 층·도장은 앵커(이미지 박스·박스·배지 영역·카드)의 `relative` 자식으로 놓는다. 칩은 박스를 자르는 마스크 밖의 형제 층이다.
 */

/** 제목 글자 클래스(30/36). 큰 글자 변형은 텍스트 박스가 쓰는 48/1.1이다. */
const TITLE_CLASS = 'text-3xl font-black tracking-[-0.02em] whitespace-pre-line'
/** 큰 글자 변형(텍스트형). 글자 크기는 제목 길이에 따라 `feedTextBoxTitleSizeClass`가 2~3단계로 고른다(기본 48). */
const BIG_TITLE_CLASS = 'leading-[1.1] font-black tracking-[-0.02em] whitespace-pre-line text-center'

/** 카드 면. 최소 높이는 유형별 샘플 높이(`FEED_CARD_MIN_HEIGHT`)이고 내용이 길면 늘어난다. `minHeight`를 생략하면 높이를 `className`이 정한다(텍스트형은 `aspect-square`). `markRoot`가 참이면 카드 루트 표식을 단다(생략하면 마크업이 그대로다). */
export function FeedCardShell({
  view,
  minHeight,
  className,
  markRoot = false,
  children,
}: {
  view: FeedCardView
  minHeight?: number
  className?: string
  markRoot?: boolean
  children: ReactNode
}) {
  const classes = ['relative flex flex-col rounded-2xl p-4', className].filter(Boolean).join(' ')
  const rootProps = markRoot ? { [FEED_CARD_ROOT_ATTR]: '' } : undefined
  return (
    <div className={classes} style={{ backgroundColor: feedColorVar(view.look.colors.bg), ...(minHeight === undefined ? {} : { minHeight }) }} {...rootProps}>
      {children}
    </div>
  )
}

/**
 * 제목(제목 속 칩 포함). 낱말이 없거나 제목에 없으면 글자만 그린다.
 * 글자색은 바탕 키를 따른다(`feedTextOnBg`). 박스 안에 놓는 제목은 `onBox`를 주면 바탕과 무관하게 `--foreground`다(텍스트 박스 카드).
 * `onPhoto`는 박스에 사진이 실제로 그려질 때 흰 글자(`--snow`)로 바꾼다(`onBox`보다 앞선다, 티켓 20261122_2228 R2). 큰 글자(`big`)는 제목 길이에 따라 크기가 낮아진다.
 */
export function FeedTitle({
  view,
  big = false,
  onBox = false,
  onPhoto = false,
  className,
}: {
  view: FeedCardView
  big?: boolean
  onBox?: boolean
  onPhoto?: boolean
  className?: string
}) {
  const { titleChips } = view.look
  return (
    <ChipTitle
      as="h3"
      title={view.title}
      words={titleChips.words}
      size="lg"
      colors={titleChips.colors}
      tilts={titleChips.tilts}
      className={[big ? `${BIG_TITLE_CLASS} ${feedTextBoxTitleSizeClass(view.title)}` : TITLE_CLASS, className].filter(Boolean).join(' ')}
      style={{ color: onPhoto ? 'var(--snow)' : onBox ? 'var(--foreground)' : feedTextOnBg(view.look.colors.bg) }}
    />
  )
}

/** 설명. 이 카드가 설명을 보이지 않거나 값이 없으면 아무것도 그리지 않는다. */
export function FeedDescription({ view }: { view: FeedCardView }) {
  if (!view.look.showDescription || !view.description) return null
  return (
    <p className="text-sm font-medium break-keep wrap-break-word" style={{ color: feedTextOnBg(view.look.colors.bg) }}>
      {view.description}
    </p>
  )
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

function positionStyle(position: ChipPosition): CSSProperties {
  return { top: position.top, right: position.right, bottom: position.bottom, left: position.left }
}

/**
 * 칩 층. 앵커(`relative` 부모) 안에 형제로 놓아 칩을 모서리에 건다. 칩은 코너 변형(`FeedChip variant="corner"`, 큰 칩 52·작은 칩 40, 굵기 900)이다(티켓 20261122_2228 R1). 허용하지 않는 자리의 칩은 그리지 않는다.
 * `mode`를 생략하면 유형의 기본(걸침, `full_image`는 안쪽)이다.
 *
 * 4회차-3이 더한 선택 인자(생략하면 4-2의 출력 그대로다): `positionOf`는 자리 이름 → 위치를 직접 정한다(모서리 자리가 아닌 `card-top-right`용, 이때 `mode`는 쓰지 않는다),
 * `size`는 칩 크기를 모두 이 값으로 맞춘다(컬렉션 소개는 작은 칩이다).
 */
export function FeedChipLayer({
  view,
  mode,
  positionOf,
  size,
}: {
  view: FeedCardView
  mode?: ChipAnchorMode
  positionOf?: (slot: string) => ChipPosition | null
  size?: FeedChipSize
}) {
  return (
    <>
      {view.look.chips.map((chip, index) => {
        const position = positionOf ? positionOf(chip.slot) : chipPositionOf(view.feedType, chip.slot, mode)
        if (!position) return null
        return (
          <span key={index} className="absolute z-10 flex" style={positionStyle(position)}>
            <FeedChip variant="corner" size={size ?? chip.size} color={chip.color} tilt={chip.tilt}>
              {chip.text}
            </FeedChip>
          </span>
        )
      })}
    </>
  )
}

/** 계획된 칩 하나. 스티커는 `CategorySticker`, 알약은 코너 변형 `FeedChip`이다. 값 칩 색은 저장된 칩 색(`look.colors.chip`, `chip_color_key`), 분류 알약은 계획이 정한 검정이다. */
function PlannedChipView({ chip, view }: { chip: PlannedChip; view: FeedCardView }) {
  if (chip.presentation === 'sticker' && chip.sticker) {
    const { shape, pair, letter, seed, label } = chip.sticker
    // 크기 prop이 없는 부품이라 기울기·배율은 바깥 `span`의 transform으로 준다(배율을 width·height로 주면 viewBox 기하가 어긋난다)
    return (
      <span className="block" style={{ transform: `rotate(${chip.tilt}deg) scale(${chip.scale})` }}>
        <CategorySticker shape={shape} pair={pair} letter={letter} seed={seed} label={label} />
      </span>
    )
  }
  return (
    <FeedChip variant="corner" size={chip.size} color={chip.black ? 'black' : view.look.colors.chip} tilt={chip.tilt}>
      {chip.text}
    </FeedChip>
  )
}

/**
 * 칩 계획 층 — 카드 셸의 직계 자식으로 놓아 `look.chipPlan`(R5)이 정한 대로 칩·스티커를 그린다(티켓 20261122_2228 R6).
 * 알약은 `FeedChip variant="corner"`, 스티커는 `CategorySticker`다. 위치는 카드(`relative` 부모) 기준 `%`와 계획의 바깥 6px 한도 안 px로 쓰고(`plannedChipPositionOf`) DOM을 재지 않는다.
 * 계획이 안전 구역(글자·그림·도장)을 이미 피했으므로 여기서 위치를 보정하지 않는다. 기울기 부호·배율은 계획 값 그대로다.
 *
 * - 층은 `pointer-events-none`이다(카드 전체가 링크라 칩이 터치를 가로채지 않는다). 칩·스티커는 장식이 아니라서 `aria-hidden`은 걸지 않는다(스티커는 `role="img"`+분류 문구).
 * - `view.look.chipPlan`이 없으면(`toCardViews`가 아닌 단건 경로: 스토리·미리보기) 앞 카드 없음 계획을 즉석에서 만든다. 칩이 없는 카드(`[]`)와 흐름 줄 카드(목록형)는 아무것도 그리지 않는다.
 * - 도장(`FeedStampLayer`)은 앵커 안의 모서리 슬롯을 그대로 쓰고, 계획이 도장 자리를 피한다.
 */
export function FeedChipPlanLayer({ view }: { view: FeedCardView }) {
  const plan: ChipPlan | undefined = view.look.chipPlan ?? planFeedChips([chainInputOf(view)])[0]
  if (!plan || plan.flow || plan.chips.length === 0) return null
  return (
    <div data-chip-plan="" className="pointer-events-none absolute inset-0 z-10">
      {plan.chips.map((chip) => (
        <span key={chip.index} className="absolute flex w-max" style={plannedChipPositionOf(chip)}>
          <PlannedChipView chip={chip} view={view} />
        </span>
      ))}
    </div>
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
