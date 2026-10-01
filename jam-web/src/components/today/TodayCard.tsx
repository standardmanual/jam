import type { CardView } from '@/lib/today/cardView'
import type { CardShape } from '@/lib/today/shape'
import BriefCard from './BriefCard'
import CardFrame from './CardFrame'
import HeroCard from './HeroCard'
import ListCard from './ListCard'
import PosterCard from './PosterCard'
import SquareCard from './SquareCard'

/**
 * 새 틀이 그리는 모양 목록 (티켓 20261001_1458, 상위 20260930_1453 조각 b2). 조각 b3(`hero`, 티켓 20261001_1737)·b4(`poster`·`square`, 티켓 20261001_2013)·
 * b5(`list`, 티켓 20261001_2104)가 더해 다섯 모양이 모두 있다. 모르는 모양 값은 `TodayCard`가 아무것도 그리지 않는다. 옛 렌더러는 티켓 20261001_2244(조각 b7)가 지웠으므로 홈의 모든 카드가 이 틀로 온다.
 */
export const RENDERED_SHAPES = ['brief', 'hero', 'poster', 'square', 'list'] as const satisfies readonly CardShape[]

export type RenderedShape = (typeof RENDERED_SHAPES)[number]

/** 새 틀이 그리는 모양인지. */
export function isRenderedShape(shape: unknown): shape is RenderedShape {
  return typeof shape === 'string' && (RENDERED_SHAPES as readonly string[]).includes(shape)
}

/**
 * 표시 데이터(`CardView`)를 받아 `shape`로 모양 컴포넌트를 고르고 카드 틀(`CardFrame`)로 감싼다.
 * 목록(`RENDERED_SHAPES`)에 없는 모양을 받으면 `null`을 반환한다 — 모르는 값이 직접 만든 표시 데이터(Story·어드민 미리보기 1501)로 올 때만 생길 수 있다.
 *
 * `currentUserId`는 랭킹 행형 `list`에서 내 순위 행을 강조하는 값이라 `list`에만 넘긴다. 표시 데이터(`CardView`)에는 넣지 않는다 — 표시 데이터는 유저 정보 없이
 * 그려져야 한다(확정 설계 8절). 값이 없거나 계측 정보(`tracking`)가 없으면(미리보기) 강조가 없다.
 * 랭킹 행형은 순위 행마다 자기 프로필 링크가 있어 카드 전체 링크를 걸지 않는다(`link={false}`, 노출만 기록한다).
 */
export default function TodayCard({ view, currentUserId }: { view: CardView; currentUserId?: string }) {
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
    case 'square':
      return (
        <CardFrame view={view}>
          <SquareCard view={view} />
        </CardFrame>
      )
    case 'list':
      return (
        <CardFrame view={view} link={view.resource !== 'ranking'}>
          <ListCard view={view} currentUserId={currentUserId} />
        </CardFrame>
      )
    default:
      return null
  }
}
