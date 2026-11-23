/**
 * 칩 자리 이름 → 화면 위치 (티켓 20261121_0041, 상위 20261120_2026 4회차-2).
 *
 * 자리 이름과 «어느 유형이 어느 자리를 쓰는가»는 `feedChipSlots.ts`가 정한다. 이 파일은 그 자리가 앵커(이미지 박스·박스·배지 영역·카드) 위에서
 * 어디에 놓이는지만 정한다. 값만 받는 순수 함수다(DB·조회·훅 없음).
 *
 * - 걸침(`overhang`): 칩의 바깥 모서리가 앵커 모서리를 `FEED_CHIP_OFFSET`(가로 12·세로 16)만큼 넘는다. 히어로·배지 소개·텍스트 박스·드랍·픽업(앵커는 박스 줄)이 쓴다. 위쪽 두 자리는 위로, 아래쪽 두 자리는 아래로 걸친다.
 *   앵커가 카드 안쪽 여백(16px) 안에 있으므로 폭 320px에서도 칩의 가장자리가 카드 바깥으로 나가지 않는다(가로 12 < 여백 16, 시험이 고정한다).
 * - 안쪽(`inset`): 앵커 모서리에서 `FEED_CHIP_INSET`만큼 안쪽이다. 이미지가 카드 전체인 `full_image`가 쓴다(걸치면 카드 밖으로 잘린다).
 * - 모서리 자리가 아닌 이름(`card-top-right`, 목록형)은 null이다. 목록형은 자기 위치를 직접 정한다.
 */
import { FEED_CHIP_INSET, FEED_CHIP_OFFSET, FEED_STAMP_INSET } from './feedConstants'
import { chipLimitOf, isAllowedSlot, type FeedType } from './feedChipSlots'
import { tiltedBounds } from './feedChipGeometry'
import type { PlannedChip } from './feedChipPlan'

export type ChipCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type ChipAnchorMode = 'overhang' | 'inset'

/** 앵커 위 절대 위치(px). 음수는 앵커 밖으로 나간다는 뜻이다. 네 값 중 모서리가 가리키는 두 값만 있다. */
export interface ChipPosition {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

/** 모서리에 걸치는 자리 이름(`image-top-left` 등). `box-row-*`는 드랍·픽업의 박스 줄 모서리다. 접두어 `card`(목록형 오른쪽 위)는 모서리 자리가 아니다. */
const CORNER_SLOT = /^(?:image|badge|box-row|box|art)-(top-left|top-right|bottom-left|bottom-right)$/

/** 자리 이름에서 모서리를 읽는다(`image-top-left` → `top-left`). 모서리 자리가 아니면 null. */
export function cornerOfSlot(slot: string): ChipCorner | null {
  const match = CORNER_SLOT.exec(slot)
  return match ? (match[1] as ChipCorner) : null
}

/** 유형의 기본 칩 앵커 방식. 이미지가 카드 전체인 `full_image`만 안쪽이다. */
export function chipAnchorModeOf(feedType: FeedType): ChipAnchorMode {
  return feedType === 'full_image' ? 'inset' : 'overhang'
}

function place(corner: ChipCorner, horizontal: number, vertical: number): ChipPosition {
  const position: ChipPosition = {}
  if (corner.startsWith('top')) position.top = vertical
  else position.bottom = vertical
  if (corner.endsWith('left')) position.left = horizontal
  else position.right = horizontal
  return position
}

/**
 * 칩의 위치. 이 유형이 허용하지 않는 자리이거나 모서리 이름이 아니면 null이다(호출부가 그 칩을 그리지 않는다).
 */
export function chipPositionOf(feedType: FeedType, slot: string, mode: ChipAnchorMode = chipAnchorModeOf(feedType)): ChipPosition | null {
  if (!isAllowedSlot(feedType, slot)) return null
  const corner = cornerOfSlot(slot)
  if (!corner) return null
  return mode === 'overhang'
    ? place(corner, -FEED_CHIP_OFFSET.x, -FEED_CHIP_OFFSET.y)
    : place(corner, FEED_CHIP_INSET, FEED_CHIP_INSET)
}

/** 계획된 칩 하나의 CSS 위치. 카드(`relative` 부모) 기준이다. 모서리가 가리키는 두 값(`left`|`right`, `top`|`bottom`)과 가운데 맞춤 `transform`뿐이다. */
export interface PlannedChipCss {
  left?: string
  right?: string
  top?: string
  bottom?: string
  transform: string
}

/**
 * 계획(`PlannedChip`) → 카드 기준 CSS 위치 (티켓 20261122_2228 R6). DOM 실측 없이 «카드 비율(%) + 고정 px»로만 쓴다(서버 컴포넌트).
 * 계획의 `inset`은 «기울어진 칩의 바깥 끝이 카드 가장자리에서 떨어진 정도(% of 카드 폭·높이, 음수는 카드 밖)»다. 기울어진 경계 상자의 반(`tiltedBounds`)만큼 더한 지점이 칩 가운데이므로,
 * 그 지점에 `left|right`·`top|bottom`을 두고 `translate(∓50%)`로 칩 자기 크기의 반만큼 되돌려 가운데를 맞춘다. 실제 칩 폭이 추정(`box`)과 달라도 가운데가 어긋나지 않는다.
 * 기울기·배율은 부호·값을 그대로 쓰는 호출부가 칩 안쪽에서 건다(여기서 평준화하지 않는다).
 */
export function plannedChipPositionOf(chip: PlannedChip): PlannedChipCss {
  const bounds = tiltedBounds(chip.box.w, chip.box.h, chip.tilt)
  const left = chip.corner.endsWith('left')
  const top = chip.corner.startsWith('top')
  const along = (percent: number, half: number) => `calc(${percent}% + ${Math.round(half * 10) / 10}px)`
  return {
    [left ? 'left' : 'right']: along(chip.inset.x, bounds.w / 2),
    [top ? 'top' : 'bottom']: along(chip.inset.y, bounds.h / 2),
    transform: `translate(${left ? '-50%' : '50%'}, ${top ? '-50%' : '50%'})`,
  }
}

/** 도장의 위치. 자리 모서리에서 안쪽으로 `FEED_STAMP_INSET`만큼 들어온다(도장 가운데 구멍으로 뒤의 이미지가 보인다). */
export function stampPositionOf(feedType: FeedType, slot: string): ChipPosition | null {
  if (!isAllowedSlot(feedType, slot)) return null
  const corner = cornerOfSlot(slot)
  return corner ? place(corner, FEED_STAMP_INSET, FEED_STAMP_INSET) : null
}

/** 도장 기울기(deg). 왼쪽 자리는 −, 오른쪽 자리는 +다. */
export function stampTiltOf(slot: string, magnitude: number): number {
  const corner = cornerOfSlot(slot)
  return corner?.endsWith('left') ? -magnitude : magnitude
}

/** 칩 개수를 유형의 한도(`chipLimitOf`)로 자른다. 앞의 칩이 남는다. */
export function limitChipsForType<T>(feedType: FeedType, chips: readonly T[]): T[] {
  return chips.slice(0, chipLimitOf(feedType))
}
