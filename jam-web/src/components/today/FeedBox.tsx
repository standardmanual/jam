import type { CSSProperties, ReactNode } from 'react'
import {
  boxProtrusion,
  buildBoxMask,
  resolveBoxShape,
  type BoxOrientation,
  type BoxSeed,
  type BoxShape,
} from '@/lib/today/boxShape'
import { feedColorVar, type FeedColorKey } from '@/lib/today/feedConstants'

/**
 * 홈피드 새 카드의 박스 모양 5종 `FeedBox` (티켓 20261120_2144, 상위 20261120_2026 3회차-2). 서비스 전용(홈피드 한정) — 채원 판정·사용자 승인 2026-11-20.
 *
 * 모양(`shape`)은 라운드·티켓·우표·물결·반원 돌출(`bump`), 방향(`orientation`)은 텍스트 박스(`text`)·이미지 마스크(`image`)·아이템 배지 박스(`item`)다.
 * 박스에는 외곽선이 없다. 치수·비율 변환·돌출의 바깥 여백·시드 없는 물결의 대체는 `lib/today/boxShape.ts` 머리말이 정본이다.
 *
 * - 값만 받아 그린다(DB·조회·훅 없음, 서버 컴포넌트로 그려진다). 무작위(물결)는 `seed`로만 정한다 — 같은 시드는 같은 물결을 그린다.
 * - 면 색은 통합 팔레트 색 키 9개(`FEED_COLOR_KEYS`)다. 색 키는 `feedColorVar`를 거쳐 `var(--…)`로만 칠한다(hex를 쓰지 않는다). `white`는 `--jam-chip-white`다.
 * - 마스크는 **이 요소에만** 건다. `children`(이미지 마스크로 쓸 때는 안쪽 이미지)도 같은 마스크로 잘린다.
 *   그래서 칩 같은 꾸밈은 이 요소 안이 아니라 **마스크 밖의 형제 층**에 둔다(`FeedBox.stories.tsx` 합성 예시).
 * - `children`의 안쪽 여백은 부모가 정한다. 예외는 반원 돌출뿐이다: 돌출 영역이 요소 상자 안에 있어서 그만큼(`boxProtrusion`) 안쪽 여백을 이 요소가 건다.
 *   이 여백은 인라인 `padding`이라 `className`의 `p-*`보다 앞선다. 돌출 모양의 안쪽 여백은 `children`에 직접 준다.
 * - 크기·자리는 부모가 정한다(`className`으로 폭·높이·위치를 준다). 티켓·우표의 홈은 변 길이에 비해 커서(텍스트 박스 홈 지름 56)
 *   박스가 너무 작으면 홈끼리 겹친다 — 티켓 텍스트 박스는 높이 190px 이상을 권한다.
 * - 물결은 가장자리가 최대 22px(기준 viewBox, `item`은 11px)까지 패여 `children` 가장자리의 글자가 잘릴 수 있다. 안쪽 여백은 부모가 그만큼 준다.
 */

export type FeedBoxColor = FeedColorKey

function faceColor(color: FeedBoxColor): string {
  return feedColorVar(color)
}

export default function FeedBox({
  shape,
  orientation,
  color,
  seed,
  children,
  className,
}: {
  shape: BoxShape
  orientation: BoxOrientation
  color: FeedBoxColor
  /** 물결의 시드(카드 id 등). 물결이 아니면 쓰지 않는다. 물결인데 시드가 없으면 라운드로 대신한다. */
  seed?: BoxSeed
  children?: ReactNode
  className?: string
}) {
  const effective = resolveBoxShape(shape, seed)
  const mask = buildBoxMask(shape, orientation, seed)
  const { top, right, bottom, left } = boxProtrusion(effective, orientation)

  const style: CSSProperties = { backgroundColor: faceColor(color) }

  if (mask) {
    const { layers } = mask
    const join = (pick: (layer: (typeof layers)[number]) => string) => layers.map(pick).join(', ')
    style.maskImage = join((l) => l.image)
    style.maskSize = join((l) => l.size)
    style.maskPosition = join((l) => l.position)
    style.maskRepeat = join(() => 'no-repeat')
    style.maskComposite = mask.composite
    style.WebkitMaskImage = style.maskImage
    style.WebkitMaskSize = style.maskSize
    style.WebkitMaskPosition = style.maskPosition
    style.WebkitMaskRepeat = style.maskRepeat
    style.WebkitMaskComposite = mask.composite === 'intersect' ? 'source-in' : 'source-over'
  }
  if (top || right || bottom || left) style.padding = `${top}px ${right}px ${bottom}px ${left}px`

  // 라운드·티켓·우표는 모서리 12px을 클래스로 둥글린다(홈은 마스크가 낸다). 물결·돌출은 모서리까지 마스크 경로가 그린다.
  const rounded = effective === 'round' || effective === 'ticket' || effective === 'stamp'
  const classes = [rounded ? 'rounded-xl' : '', className].filter(Boolean).join(' ')

  return (
    <div className={classes || undefined} style={style}>
      {children}
    </div>
  )
}
