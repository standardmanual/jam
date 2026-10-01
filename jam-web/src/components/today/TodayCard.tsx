import type { CardView } from '@/lib/today/cardView'
import type { CardShape } from '@/lib/today/shape'
import BriefCard from './BriefCard'
import CardFrame from './CardFrame'
import HeroCard from './HeroCard'
import PosterCard from './PosterCard'

/**
 * 새 틀이 그리는 모양 목록 (티켓 20261001_1458, 상위 20260930_1453 조각 b2). 조각 b3(`hero`, 티켓 20261001_1737)·b4(`poster`·`square`, 티켓 20261001_2013)가 더했고 b5가 이 목록에 모양을 더한다.
 * 목록에 없는 모양은 `TodayCard`가 아무것도 그리지 않는다. `TodayCardStack`은 이 목록으로 새 틀과 옛 렌더러를 가른다.
 */
export const RENDERED_SHAPES = ['brief', 'hero', 'poster'] as const satisfies readonly CardShape[]

export type RenderedShape = (typeof RENDERED_SHAPES)[number]

/** 새 틀이 그리는 모양인지. */
export function isRenderedShape(shape: unknown): shape is RenderedShape {
  return typeof shape === 'string' && (RENDERED_SHAPES as readonly string[]).includes(shape)
}

/**
 * 표시 데이터(`CardView`)를 받아 `shape`로 모양 컴포넌트를 고르고 카드 틀(`CardFrame`)로 감싼다.
 * 목록(`RENDERED_SHAPES`)에 없는 모양을 받으면 `null`을 반환한다 — 지금은 Story와 어드민 미리보기(1501)에서만 생길 수 있다.
 */
export default function TodayCard({ view }: { view: CardView }) {
  if (!isRenderedShape(view.shape)) return null

  switch (view.shape) {
    case 'brief':
      return (
        <CardFrame view={view}>
          <BriefCard view={view} />
        </CardFrame>
      )
    case 'hero':
      return (
        <CardFrame view={view}>
          <HeroCard view={view} />
        </CardFrame>
      )
    case 'poster':
      return (
        <CardFrame view={view}>
          <PosterCard view={view} />
        </CardFrame>
      )
    default:
      return null
  }
}
